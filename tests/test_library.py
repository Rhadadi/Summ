import os,time,unittest
from unittest.mock import AsyncMock,patch
from fastapi.testclient import TestClient
from server import accounts,library
from server.app import app,hits
from tests.test_server import ServerTest

def para(text,pages=(1,)):return {'text':text,'pages':list(pages)}
def doc(**over):
    base={'title':{'en':'A Test Book'},'author':'An Author','originalLanguage':'en',
          'chapters':[{'id':'c1','title':{'en':'First'}},{'id':'c2','title':{'en':'Second'}}],
          'versions':[{'language':'en','type':'detailed','label':'Detailed','model':'m','overview':{'paragraphs':[para('Overview text.')],'takeaways':[{'text':'Keep qualifications.'}]},
                       'chapters':{'c1':{'paragraphs':[para('First chapter summary.',(3,4))]},'c2':{'paragraphs':[para('Second chapter summary.',(9,))]}}}]}
    base.update(over);return base
class RolesTest(ServerTest):
    def owner(self,email='owner@example.com'):
        with patch.dict(os.environ,{'SUMM_OWNER_EMAIL':'owner@example.com'}):
            uid=accounts.google_user('sub-owner',email);token=accounts.create_session(uid)
        c=TestClient(app,headers={'X-Summ-Request':'1'});c.cookies.set('summ_session',token);self.addCleanup(c.close);return c,uid
    def reader(self,name='reader'):
        c=TestClient(app,headers={'X-Summ-Request':'1'});self.sign_up(c,username=name,key=None,role='reader');self.addCleanup(c.close);return c
    def setUp(self):
        super().setUp();self.env2=patch.dict(os.environ,{'SUMM_OWNER_EMAIL':'owner@example.com'});self.env2.start()
    def tearDown(self):self.env2.stop();super().tearDown()
class AccessTests(RolesTest):
    def test_owner_is_the_google_verified_email_only(self):
        c,_=self.owner();self.assertEqual(c.get('/api/me').json()['role'],'owner')
        other,_=self.owner('someone-else@example.com') if False else (None,None)
        with patch.dict(os.environ,{'SUMM_OWNER_EMAIL':'owner@example.com'}):
            uid=accounts.google_user('sub-2','someone-else@example.com')
        self.assertEqual(accounts.resolve_role('someone-else@example.com','sub-2','reader'),'reader')
        # A username account has no verified email, so it is never the owner, whatever it is called.
        self.assertEqual(accounts.resolve_role('owner@example.com',None,'reader'),'reader')
    def test_readers_cannot_generate_import_publish_or_hold_keys(self):
        r=self.reader()
        body={'chapter':{'id':'c','title':'t','blocks':[{'id':'b','text':'x'}]},'depth':'glance','purpose':'understand','language':'en'}
        for method,path,kwargs in [('post','/api/summarize',{'json':body}),('post','/api/import',{'json':{'url':'https://example.com/page'}}),('post','/api/pdf',{'json':{}}),('post','/api/audio',{'json':{'text':'x','language':'en'}}),('post','/api/library',{'json':{'doc':doc()}}),('put','/api/me/key',{'json':{'api_key':'k'*30,'model':'test-model'}}),('get','/api/library/mine',{})]:
            self.assertEqual(getattr(r,method)(path,**kwargs).status_code,403,path)
        self.assertEqual(r.get('/api/library').status_code,200)
    def test_home_slide_choice_and_art_are_editor_only(self):
        owner,_=self.owner();book=owner.post('/api/library',json={'doc':doc(),'visibility':'public'}).json()
        self.assertEqual(book['slide'],{'mode':'none'})
        self.assertEqual(owner.put('/api/library/'+book['id']+'/slide',json={'mode':'cover'}).json(),{'mode':'cover'})
        self.assertEqual(owner.put('/api/library/'+book['id']+'/slide',json={'mode':'art'}).status_code,422)
        self.assertEqual(owner.put('/api/library/'+book['id']+'/slide',json={'mode':'art','file':'File:../x.jpg'}).status_code,422)
        r=self.reader()
        self.assertEqual(r.get('/api/art/search?q=love').status_code,403)
        self.assertEqual(r.put('/api/library/'+book['id']+'/slide',json={'mode':'cover'}).status_code,403)
        anon=TestClient(app,headers={'X-Summ-Request':'1'});self.addCleanup(anon.close)
        self.assertEqual(anon.get('/api/library').json()['books'][0]['slide']['mode'],'cover')
        self.assertEqual(anon.get('/api/library/'+book['id']+'/art').status_code,404)
    def test_figures_quotes_and_tables_are_published_and_served(self):
        owner,_=self.owner()
        d=doc();d['versions'][0]['chapters']['c1']['paragraphs']=[{'text':'Caption','image':{'name':'f1.png','alt':'A map'}},{'text':'A quote','quote':True},{'text':'a · b','table':[['a','b'],['1','2']]}]
        book=owner.post('/api/library',json={'doc':d,'visibility':'public'});self.assertEqual(book.status_code,200,book.text);bid=book.json()['id']
        png=b'\x89PNG'+b'0'*400
        self.assertEqual(owner.put('/api/library/'+bid+'/figure/f1.png',content=png,headers={'Content-Type':'image/png'}).status_code,200)
        self.assertIn(owner.put('/api/library/'+bid+'/figure/..%2Fx.png',content=png).status_code,(404,405,422))
        self.assertEqual(owner.put('/api/library/'+bid+'/figure/f2.png',content=b'not an image'*50).status_code,422)
        anon=TestClient(app,headers={'X-Summ-Request':'1'});self.addCleanup(anon.close)
        r=anon.get('/api/library/'+bid+'/figure/f1.png');self.assertEqual((r.status_code,r.headers['content-type']),(200,'image/png'))
        self.assertEqual(anon.get('/api/library/'+bid+'/figure/nope.png').status_code,404)
        self.assertEqual(self.reader().put('/api/library/'+bid+'/figure/f3.png',content=png).status_code,403)
        bad=doc();bad['versions'][0]['chapters']['c1']['paragraphs']=[{'text':'x','image':{'name':'../evil.png','alt':''}}]
        self.assertEqual(owner.post('/api/library',json={'doc':bad,'visibility':'public'}).status_code,422)
    def test_editor_request_approval_flow(self):
        owner,_=self.owner();r=self.reader('asker')
        self.assertEqual(r.post('/api/editor-request',json={'message':'I translate books.'}).json()['editorRequest']['status'],'pending')
        self.assertEqual(r.post('/api/editor-request',json={}).status_code,409)
        self.assertEqual(r.get('/api/people').status_code,403)
        people=owner.get('/api/people').json();self.assertEqual([p['name'] for p in people['pending']],['asker'])
        uid=people['pending'][0]['id'];owner.post('/api/people/'+uid+'/approve')
        self.assertEqual(r.get('/api/me').json()['role'],'editor')
        self.assertEqual(owner.get('/api/people').json()['editors'][0]['name'],'asker')
        owner.delete('/api/people/'+uid);self.assertEqual(r.get('/api/me').json()['role'],'reader')
    def test_rejected_request_can_be_made_again(self):
        owner,_=self.owner();r=self.reader('asker');r.post('/api/editor-request',json={})
        uid=owner.get('/api/people').json()['pending'][0]['id'];owner.post('/api/people/'+uid+'/reject')
        self.assertEqual(r.get('/api/me').json()['role'],'reader');self.assertEqual(r.get('/api/me').json()['editorRequest']['status'],'rejected')
        self.assertEqual(r.post('/api/editor-request',json={}).status_code,200)
class PublishTests(RolesTest):
    def test_publish_list_read_unlist_and_remove(self):
        owner,_=self.owner();pub=owner.post('/api/library',json={'doc':doc(),'visibility':'public'});self.assertEqual(pub.status_code,200,pub.text)
        book=pub.json();self.assertEqual(book['languages'],['en']);self.assertTrue(book['slug'].startswith('a-test-book-'))
        anon=TestClient(app,headers={'X-Summ-Request':'1'});self.addCleanup(anon.close)
        self.assertEqual([b['title'] for b in anon.get('/api/library').json()['books']],['A Test Book'])
        self.assertIn('blurb',anon.get('/api/library').json()['books'][0])
        self.assertEqual(anon.get('/api/library/'+book['slug']).json()['doc']['chapters'][0]['id'],'c1')
        owner.put('/api/library/'+book['id']+'/visibility',json={'visibility':'unlisted'})
        self.assertEqual(anon.get('/api/library').json()['books'],[]);self.assertEqual(anon.get('/api/library/'+book['slug']).status_code,200)
        owner.delete('/api/library/'+book['id']);self.assertEqual(anon.get('/api/library/'+book['slug']).status_code,404)
    def test_a_published_book_carries_no_original_text_fields(self):
        owner,_=self.owner()
        bad=doc();bad['chapters'][0]['blocks']=[{'id':'b','text':'COPYRIGHTED ORIGINAL PASSAGE'}]
        self.assertEqual(owner.post('/api/library',json={'doc':bad}).status_code,422)
        bad=doc();bad['versions'][0]['chapters']['c1']['paragraphs'][0]['evidence']='ORIGINAL'
        self.assertEqual(owner.post('/api/library',json={'doc':bad}).status_code,422)
        stored=owner.post('/api/library',json={'doc':doc()}).json()
        self.assertNotIn('blocks',str(stored['doc']))
    def test_validation(self):
        owner,_=self.owner()
        ghost=doc();ghost['versions'][0]['chapters']['nope']={'paragraphs':[para('x')]}
        self.assertEqual(owner.post('/api/library',json={'doc':ghost}).status_code,422)
        dup=doc();dup['chapters'].append({'id':'c1','title':{'en':'Again'}});self.assertEqual(owner.post('/api/library',json={'doc':dup}).status_code,422)
        huge=doc();huge['versions'][0]['chapters']['c1']['paragraphs']=[para('w'*11000) for _ in range(150)]
        with patch.object(library,'MAX_DOC',200_000):self.assertEqual(owner.post('/api/library',json={'doc':huge}).status_code,413)
    def test_editors_manage_only_their_own_books_and_the_owner_any(self):
        owner,_=self.owner();ed=TestClient(app,headers={'X-Summ-Request':'1'});self.addCleanup(ed.close);self.sign_up(ed,username='editor1',key=None)
        mine=ed.post('/api/library',json={'doc':doc()}).json();theirs=owner.post('/api/library',json={'doc':doc(title={'en':'Owner Book'})}).json()
        self.assertEqual(ed.post('/api/library',json={'id':theirs['id'],'doc':doc()}).status_code,403)
        self.assertEqual(ed.delete('/api/library/'+theirs['id']).status_code,403)
        self.assertEqual(ed.post('/api/library',json={'id':mine['id'],'doc':doc(title={'en':'Edited'})}).json()['title'],'Edited')
        self.assertEqual({b['title'] for b in ed.get('/api/library/mine').json()['books']},{'Edited'})
        self.assertEqual(len(owner.get('/api/library/mine').json()['books']),2)
        self.assertEqual(owner.delete('/api/library/'+mine['id']).status_code,200)
    def test_cover_upload_checks_type_and_size(self):
        owner,_=self.owner();book=owner.post('/api/library',json={'doc':doc()}).json()
        jpeg=b'\xff\xd8\xff'+b'0'*2000
        self.assertEqual(owner.put('/api/library/'+book['id']+'/cover',content=jpeg).status_code,200)
        self.assertEqual(owner.put('/api/library/'+book['id']+'/cover',content=b'<script>alert(1)</script>'+b'x'*900).status_code,422)
        self.assertEqual(owner.put('/api/library/'+book['id']+'/cover',content=b'\xff\xd8\xff'+b'0'*2_000_000).status_code,413)
        got=TestClient(app).get('/api/library/'+book['id']+'/cover');self.assertEqual((got.status_code,got.headers['content-type']),(200,'image/jpeg'))
        self.assertTrue(TestClient(app).get('/api/library/'+book['id']).json()['cover'].startswith('/api/library/'+book['id']+'/cover?v='))
        self.assertEqual(self.reader().delete('/api/library/'+book['id']+'/cover').status_code,403)
        self.assertEqual(owner.delete('/api/library/'+book['id']+'/cover').status_code,200)
        self.assertIsNone(owner.get('/api/library/'+book['id']).json()['cover'])
        self.assertEqual(TestClient(app).get('/api/library/'+book['id']+'/cover').status_code,404)
    def test_editorial_assist_requires_editor_key_and_only_returns_a_draft(self):
        r=self.reader()
        body={'action':'polish','source':'A precise source sentence.','language':'en'}
        self.assertEqual(r.post('/api/editor/assist',json=body).status_code,403)
        self.sign_up(username='writer')
        with patch('server.app.model_json',new=AsyncMock(return_value={'text':'A clear sentence.'})) as model:
            result=self.client.post('/api/editor/assist',json=body)
            self.assertEqual(result.status_code,200,result.text)
            self.assertEqual(result.json(),{'text':'A clear sentence.'})
            self.assertIn('Do not add facts',model.await_args.args[0])
        self.assertEqual(self.client.post('/api/editor/assist',json={**body,'source':'x'*24001}).status_code,422)
    def test_uploaded_background_is_private_to_editor_and_visible_to_readers(self):
        owner,_=self.owner();book=owner.post('/api/library',json={'doc':doc()}).json();bid=book['id']
        image=b'\xff\xd8\xff'+b'0'*1000
        self.assertEqual(self.reader().put('/api/library/'+bid+'/background',content=image).status_code,403)
        result=owner.put('/api/library/'+bid+'/background',content=image)
        self.assertEqual(result.status_code,200,result.text)
        self.assertEqual(result.json()['mode'],'upload')
        self.assertIn('/api/library/'+bid+'/art',result.json()['art'])
        self.assertEqual(TestClient(app).get('/api/library/'+bid+'/art').status_code,200)
class NarrationTests(RolesTest):
    def test_narration_is_generated_once_then_served_to_everyone(self):
        owner,_=self.owner();book=owner.post('/api/library',json={'doc':doc()}).json()
        with patch('server.audio.piper_mp3',side_effect=lambda text,lang:('MP3:'+text[:12]).encode()):
            started=owner.post('/api/library/'+book['id']+'/narration',json={'language':'en'});self.assertEqual(started.status_code,200,started.text)
            for _ in range(50):
                status=TestClient(app).get('/api/library/'+book['id']+'/narration/en').json()
                if status['status']!='running':break
                time.sleep(.1)
        self.assertEqual(status['status'],'ready');self.assertEqual([t['title'] for t in status['tracks']],['Overview','First','Second'])
        anon=TestClient(app);audio=anon.get(status['tracks'][1]['url']);self.assertEqual((audio.status_code,audio.headers['content-type']),(200,'audio/mpeg'));self.assertTrue(audio.content.startswith(b'MP3:First'))
        self.assertEqual(anon.get('/api/library/'+book['id']+'/audio/en/..%2F..%2Fsumm.db').status_code,404)
        self.assertEqual(self.reader().post('/api/library/'+book['id']+'/narration',json={'language':'en'}).status_code,403)
    def test_narration_failure_is_reported(self):
        owner,_=self.owner();book=owner.post('/api/library',json={'doc':doc()}).json()
        with patch('server.audio.piper_mp3',side_effect=OSError('voice missing')):
            owner.post('/api/library/'+book['id']+'/narration',json={'language':'en'})
            for _ in range(50):
                status=owner.get('/api/library/'+book['id']+'/narration/en').json()
                if status['status']!='running':break
                time.sleep(.1)
        self.assertEqual(status['status'],'failed');self.assertIn('voice missing',status['error'])
if __name__=='__main__':unittest.main()
