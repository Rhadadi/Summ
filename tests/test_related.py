import asyncio,json,os,time
from unittest.mock import AsyncMock,patch
from server import related,library
from tests.test_library import RolesTest,doc

def hit(title,rating=None,count=0,cover=1,author='Someone Else',key=None):
    return {'key':key or '/works/'+title.replace(' ',''),'title':title,'author_name':[author],'cover_i':cover,'ratings_average':rating,'ratings_count':count}
class WeightedTests(RolesTest):
    def test_few_ratings_do_not_beat_many(self):
        self.assertGreater(related.weighted(4.2,5000),related.weighted(4.9,3))
        self.assertIsNone(related.weighted(None,0))
    def test_picks_rank_by_weighted_rating_with_no_subject_shelf_and_unrated_and_coverless_last(self):
        async def search(client,**p):
            assert 'subject:' not in p.get('q',''),'loose subject shelves are no longer searched'
            if p.get('title')=='Many Ratings':return [hit('Many Ratings',4.2,5000)]
            if p.get('title')=='Few But Good':return [hit('Few But Good',4.6,12)]
            if p.get('title')=='Unrated Pick':return [hit('Unrated Pick')]
            if p.get('title')=='No Cover Pick':return [hit('No Cover Pick',4.5,900,cover=None)]
            return []
        picks=[{'title':t,'author':'','why':''} for t in ('Unrated Pick','No Cover Pick','Few But Good','Many Ratings')]
        with patch('server.related._search',search),patch('server.google_books.search',AsyncMock(return_value=[])):
            out=asyncio.run(related.related('Mine','',['Psychology'],picks))
        self.assertEqual([c['title'] for c in out],['Many Ratings','Few But Good','Unrated Pick','No Cover Pick'])
        self.assertEqual({c['reason'] for c in out},{'pick'})
    def test_few_picks_are_topped_up_and_a_book_missing_from_open_library_comes_from_google_books(self):
        async def search(client,**p):return [hit('Known Book',4.3,800)] if p.get('title')=='Known Book' else []
        suggest=AsyncMock(return_value=[{'title':'Scholarly Book','author':'A Scholar','why':'close'}])
        google=AsyncMock(return_value=[{'title':'Scholarly Book','authors':['A Scholar'],'cover':'https://books.google.com/c.jpg','rating':4.0,'ratings':40,'year':'2010','url':'https://books.google.com/x'}])
        with patch('server.related._search',search),patch('server.google_books.search',google):
            out=asyncio.run(related.related('Mine','',[],[{'title':'Known Book','author':'','why':''}],suggest))
        suggest.assert_awaited_once()
        self.assertEqual([(c['title'],c['cover'] is not None) for c in out],[('Known Book',True),('Scholarly Book',True)])
class CacheTests(RolesTest):
    def test_persian_keeps_unlocalised_cards_and_adds_local_titles_when_available(self):
        books=[{'title':'Book A','author':'A B','why':'','cover':'c','url':None,'rating':4.4,'count':100,'source':'similar','year':'','reason':'subject','subject':''}]
        with patch('server.related.related',AsyncMock(return_value=[dict(books[0])])):
            failing=AsyncMock(side_effect=RuntimeError('quota'))
            out=asyncio.run(related.cached('b1','T','A',[],[],None,'fa',failing))
            self.assertEqual([c['title'] for c in out],['Book A']);self.assertNotIn('localTitle',out[0])
            related.invalidate('b1')
            good=AsyncMock(return_value=[{'localTitle':'کتاب الف','localAuthor':'ا ب','why':'چون'}])
            out=asyncio.run(related.cached('b1','T','A',[],[],None,'fa',good))
            self.assertEqual((out[0]['localTitle'],out[0]['why']),('کتاب الف','چون'))
    def test_old_cache_files_are_recomputed_and_new_ones_reused_per_language(self):
        folder=os.path.join(os.environ['SUMM_DATA_DIR'],'related');os.makedirs(folder,exist_ok=True)
        old={'at':time.time(),'books':[{'title':'Stale'}]}
        for name,body in (('b2.json',old),('b2-en.json',{**old,'v':1,'lang':'en'})):
            with open(os.path.join(folder,name),'w') as f:json.dump(body,f)
        fresh=AsyncMock(return_value=[{'title':'Fresh','author':'','why':''}])
        with patch('server.related.related',fresh):
            self.assertEqual(asyncio.run(related.cached('b2','T','',[],[]))[0]['title'],'Fresh')
            asyncio.run(related.cached('b2','T','',[],[]));self.assertEqual(fresh.await_count,1)
            asyncio.run(related.cached('b2','T','',[],[],None,'fa'));self.assertEqual(fresh.await_count,2)
            related.invalidate('b2');self.assertEqual(os.listdir(folder),[])
class InLibraryTests(RolesTest):
    def book(self,i,title,author,tags,rating=None):return {'id':i,'slug':'s-'+i,'title':title,'titles':{'en':title},'author':author,'tags':tags,'cover':None,'year':'2000','rating':{'rating':rating,'count':50} if rating else None}
    def test_scoring_threshold_and_order(self):
        me={'id':'me','author':'Yalom, Irvin D.','tags':['therapy','death','existential']}
        books=[self.book('me','Me','Yalom, Irvin D.',[]),self.book('a','Gift of Therapy','Irvin D. Yalom',[],4.0),self.book('b','Other','Z',['therapy','death','existential'],4.5),
               self.book('c','Pick Book','Q',[]),self.book('d','One Tag','Q',['death']),self.book('e','Same Tags Lower Rating','Z',['therapy','death','existential'],3.0)]
        out=related.in_library(me,[{'title':'Pick Book'}],books)
        slugs=[c['slug'] for c in out]
        self.assertNotIn('s-me',slugs);self.assertNotIn('s-d',slugs)
        self.assertEqual(slugs,['s-b','s-a','s-e','s-c'])  # all score 3 (author, tags, tags, pick): ties go to the better rating
        self.assertEqual({c['slug']:c['reason'] for c in out}['s-a'],'author');self.assertEqual({c['slug']:c['reason'] for c in out}['s-c'],'pick')
    def test_combine_puts_library_first_and_drops_duplicates(self):
        local=[{'title':'In Lib','titles':{'en':'In Lib'}}];ext=[{'title':'In Lib'},{'title':'Elsewhere'}]
        self.assertEqual([c['title'] for c in related.combine(local,ext)],['In Lib','Elsewhere'])
class EndpointTests(RolesTest):
    def test_tags_in_the_listing_and_refresh_is_for_the_book_owner_only(self):
        owner,_=self.owner()
        d=doc(info={'categories':['Psychology / Psychotherapy']},review={'verdict':'','themes':['Death anxiety'],'pros':[],'cons':[],'quotes':[],'sources':[],'rating':None,'model':'','createdAt':0})
        r=owner.post('/api/library',json={'doc':d,'visibility':'public'});self.assertEqual(r.status_code,200,r.text);book=r.json()
        self.assertIn('death anxiety',book['tags']);self.assertIn('psychology',book['tags'])
        reader=self.reader()
        self.assertEqual(reader.post('/api/library/'+book['id']+'/related/refresh').status_code,403)
        anon=self.client;self.assertIn(anon.post('/api/library/'+book['id']+'/related/refresh').status_code,(401,403))
        with patch('server.related._search',AsyncMock(return_value=[])),patch('server.google_books.search',AsyncMock(return_value=[])):
            self.assertEqual(owner.post('/api/library/'+book['id']+'/related/refresh?lang=fa').status_code,200)
            self.assertEqual(reader.get('/api/library/'+book['id']+'/related?lang=fa').json(),{'books':[]})
