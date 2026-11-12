import asyncio,unittest
from unittest.mock import patch
import httpx
from server import reviews
from tests.test_library import RolesTest,doc

RAW={'verdict':'  Warmly received. ','rating':{'value':4.21,'source':'Goodreads','count':1873,'url':'https://www.goodreads.com/book/show/1'},
 'pros':['Clear writing','  '],'cons':['Slow middle'],
 'quotes':[{'text':'“A rare book that changes how you read.”','who':'A. Critic','source':'The Guardian','url':'https://www.theguardian.com/books/x'},
           {'text':' '.join(['word']*50),'who':'Long','source':'Blog','url':'https://blog.example.com/a'},
           {'text':'An unsigned remark that should be dropped','who':'','source':'','url':None},
           {'text':'Quote with an invented link here','who':'B. Reader','source':'Somewhere','url':'https://made-up.example.org/z'}],
 'critics':[{'publication':'The Guardian','reviewer':'A. Critic','headline':'Facing death','stance':'positive','excerpt':'Yalom writes with rare warmth about the fear we all share.','summary':'Praises the case stories.','url':'https://www.theguardian.com/books/x'},
             {'publication':'Made Up Weekly','excerpt':'An invented sentence that should lose its excerpt here.','summary':'Kept as a summary.','url':'https://made-up.example.org/r','stance':'great'},{'publication':''}],
 'readers':[{'name':'Sam','stars':5,'excerpt':'Changed how I think about my parents.','url':'https://www.goodreads.com/review/1'},{'name':'Nobody','excerpt':'no link no summary','url':None}],
 'awards':['A prize'],'impact':'Widely taught.',
 'sources':[{'name':'Guardian','url':'https://www.theguardian.com/books/x'},{'name':'Fake','url':'https://made-up.example.org/z'},{'name':'Insecure','url':'http://www.goodreads.com/x'}]}
class ReviewCleanTests(unittest.TestCase):
    def test_only_what_search_touched_survives(self):
        r=reviews.clean(RAW,{'goodreads.com','theguardian.com'},'m')
        self.assertEqual(r.verdict,'Warmly received.');self.assertEqual(r.pros,['Clear writing'])
        self.assertEqual([q.who for q in r.quotes],['A. Critic','B. Reader'])
        self.assertEqual(r.quotes[0].text,'A rare book that changes how you read.');self.assertIsNone(r.quotes[1].url)
        self.assertEqual([s.name for s in r.sources],['Guardian'])
        self.assertEqual([(c.publication,c.stance,bool(c.excerpt)) for c in r.critics],[('The Guardian','positive',True),('Made Up Weekly','',False)])
        self.assertEqual([v.name for v in r.readers],['Sam']);self.assertEqual(r.readers[0].stars,5)
        self.assertEqual((r.awards,r.impact,len(r.ratings)),(['A prize'],'Widely taught.',1))
        self.assertEqual((r.rating.value,r.rating.count,r.rating.url),(4.21,1873,'https://www.goodreads.com/book/show/1'))
    def test_bad_rating_is_dropped(self):
        self.assertIsNone(reviews.clean({'rating':{'value':9}},set(),'m').rating)
    def test_json_is_found_inside_chatter(self):
        self.assertEqual(reviews._json('Here you go:\n```json\n{"a":1}\n```'),{'a':1})
class ReviewApiTests(RolesTest):
    def test_readers_cannot_research_and_published_review_is_served(self):
        self.assertEqual(self.reader().post('/api/review/research',json={'title':'T'}).status_code,403)
        owner,uid=self.owner()
        from server import accounts
        accounts.save_key(uid,'AIza-test-key-0000000000000000000000','gemini-flash-latest',None,None)
        async def fake(request,creds,gemini):return reviews.clean(RAW,{'goodreads.com'},'m')
        with patch('server.reviews.research',fake):
            r=owner.post('/api/review/research',json={'title':'T','author':'A'});self.assertEqual(r.status_code,200,r.text)
        review=r.json();d=doc();d['review']=review
        pub=owner.post('/api/library',json={'doc':d,'visibility':'public'});self.assertEqual(pub.status_code,200,pub.text)
        self.assertEqual(pub.json()['rating']['source'],'Goodreads')
        bad=doc();bad['review']={'verdict':'x','sources':[{'name':'n','url':'javascript:alert(1)'}]}
        self.assertEqual(owner.post('/api/library',json={'doc':bad,'visibility':'public'}).status_code,422)
class ResearchPipelineTests(unittest.TestCase):
    def test_review_pages_are_read_and_quotes_checked_word_for_word(self):
        page='Kahneman has written a masterpiece about how we think. It is long, but every chapter repays the effort.'
        found={'critics':[{'publication':'The Guardian','reviewer':'Galen Strawson','date':'2011','headline':'review','excerpt':'','context':'','url':'https://www.theguardian.com/books/x','via':'Wikipedia','verified':False},
                          {'publication':'Sports Desk','reviewer':'','date':'','headline':'','excerpt':'','context':'','url':'https://www.nytimes.com/sports/x','via':'Wikipedia','verified':False},
                          {'publication':'The Times','reviewer':'John Carey','date':'','headline':'','excerpt':'Sapiens is the kind of book that sweeps cobwebs out of your brain','context':'','url':'https://www.thetimes.com/x','via':'Wikipedia','verified':True}],'notes':[]}
        calls=[]
        async def ask(prompt,creds,gemini,search=False,tokens=16384):
            calls.append(search)
            if search:return ({'verdict':'Admired.','critics':[{'publication':'Invented Weekly','excerpt':'A sentence nobody wrote anywhere at all.','url':'https://invented.example/x'}]},{'invented.example'})
            return ({'reviews':[{'n':1,'relevant':True,'excerpt':'Kahneman has written a masterpiece about how we think.','stance':'positive','summary':'ستایش','translation':'شاهکار'},
                                {'n':2,'relevant':False},{'n':3,'relevant':True,'excerpt':'Words the page does not contain at all here.','summary':'s'}]},set())
        async def text(url):return page if 'guardian' in url or 'sports' in url or 'invented' in url else ''
        async def verify(critics):
            for c in critics:
                if c.get('url','').startswith('https://invented') and c.get('excerpt'):c['verified']=False;c['excerpt']=''
        async def gather(*a):return found
        with patch('server.reviews._ask',ask),patch('server.reception.page_text',text),patch('server.reception.verify',verify),patch('server.reception.gather',gather),patch('server.reviews.portrait',lambda a:asyncio.sleep(0,None)):
            r=asyncio.run(reviews.research(reviews.ResearchRequest(title='T',author='A',language='fa'),('k','m'),'g'))
        self.assertEqual(calls,[True,False])
        by={c.publication:c for c in r.critics}
        self.assertEqual((by['The Guardian'].excerpt,by['The Guardian'].verified,by['The Guardian'].translation,by['The Guardian'].stance),('Kahneman has written a masterpiece about how we think.',True,'شاهکار','positive'))
        self.assertNotIn('Sports Desk',by)
        self.assertTrue(by['The Times'].verified)
        self.assertEqual(by['Invented Weekly'].excerpt,'')
