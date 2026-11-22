import json,os,re,sqlite3,tempfile,threading,time,unittest
from pathlib import Path
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
class LongChapterTests(RolesTest):
    def test_a_long_chapter_publishes_and_a_refusal_says_why(self):
        c,_=self.owner()
        long=doc();long['versions'][0]['chapters']['c1']['paragraphs']=[para('Paragraph %d.'%i) for i in range(237)]
        self.assertEqual(c.post('/api/library',json={'doc':long,'visibility':'public'}).status_code,200)
        # a refusal is one sentence that names where and why, not just "Request failed (422)"
        long['versions'][0]['chapters']['c1']['paragraphs']=[para('P%d.'%i) for i in range(401)]
        r=c.post('/api/library',json={'doc':long,'visibility':'public'})
        self.assertEqual(r.status_code,422);self.assertIsInstance(r.json()['detail'],str)
        self.assertIn('paragraphs',r.json()['detail']);self.assertIn('400',r.json()['detail'])
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
        self.assertEqual(book['slide'],{'mode':'none','fit':'fill'})
        self.assertEqual(owner.put('/api/library/'+book['id']+'/slide',json={'mode':'cover'}).json(),{'mode':'cover','fit':'fill'})
        self.assertEqual(owner.put('/api/library/'+book['id']+'/slide',json={'mode':'art'}).status_code,422)
        self.assertEqual(owner.put('/api/library/'+book['id']+'/slide',json={'mode':'art','file':'File:../x.jpg'}).status_code,422)
        r=self.reader()
        self.assertEqual(r.get('/api/art/search?q=love').status_code,403)
        self.assertEqual(r.put('/api/library/'+book['id']+'/slide',json={'mode':'cover'}).status_code,403)
        anon=TestClient(app,headers={'X-Summ-Request':'1'});self.addCleanup(anon.close)
        self.assertEqual(anon.get('/api/library').json()['books'][0]['slide']['mode'],'cover')
        self.assertEqual(owner.put('/api/library/'+book['id']+'/slide',json={'mode':'keep','fit':'whole'}).json(),{'mode':'cover','fit':'whole'})
        got=owner.put('/api/library/'+book['id']+'/slide',json={'mode':'keep','caption':'Moses, Rembrandt, 1659','caption_url':'https://commons.wikimedia.org/wiki/X'}).json()
        self.assertEqual((got['caption'],got['captionUrl'],got['fit']),('Moses, Rembrandt, 1659','https://commons.wikimedia.org/wiki/X','whole'))
        self.assertNotIn('captionUrl',owner.put('/api/library/'+book['id']+'/slide',json={'mode':'keep','caption_url':'javascript:alert(1)'}).json())
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
    def test_home_settings_are_public_to_read_and_owner_only_to_change(self):
        owner,_=self.owner();anon=TestClient(app,headers={'X-Summ-Request':'1'});self.addCleanup(anon.close)
        self.assertEqual(anon.get('/api/home').json()['seconds'],3)
        body={'seconds':6,'slides':[{'id':'11111111-1111-1111-1111-111111111111','hidden':True,'seconds':9}],'shelf':False,'stars':True,'autoplay':True,'title':'','text':''}
        self.assertEqual(owner.put('/api/home',json=body).status_code,200)
        got=anon.get('/api/home').json();self.assertEqual((got['seconds'],got['shelf'],got['slides'][0]['seconds']),(6,False,9))
        self.assertEqual(self.reader().put('/api/home',json=body).status_code,403)
        self.assertEqual(owner.put('/api/home',json={**body,'seconds':1}).status_code,422)
    def test_editor_request_approval_flow(self):
        owner,_=self.owner();r=self.reader('asker')
        self.assertEqual(r.post('/api/editor-request',json={'message':'I translate books.'}).json()['editorRequest']['status'],'pending')
        self.assertEqual(r.post('/api/editor-request',json={}).status_code,409)
        self.assertEqual(r.get('/api/people').status_code,403)
        people=owner.get('/api/people').json();self.assertEqual([p['name'] for p in people['pending']],['asker@example.com'])
        uid=people['pending'][0]['id'];owner.post('/api/people/'+uid+'/approve')
        self.assertEqual(r.get('/api/me').json()['role'],'editor')
        self.assertEqual(owner.get('/api/people').json()['editors'][0]['name'],'asker@example.com')
        owner.delete('/api/people/'+uid);self.assertEqual(r.get('/api/me').json()['role'],'reader')
    def test_rejected_request_can_be_made_again(self):
        owner,_=self.owner();r=self.reader('asker');r.post('/api/editor-request',json={})
        uid=owner.get('/api/people').json()['pending'][0]['id'];owner.post('/api/people/'+uid+'/reject')
        self.assertEqual(r.get('/api/me').json()['role'],'reader');self.assertEqual(r.get('/api/me').json()['editorRequest']['status'],'rejected')
        self.assertEqual(r.post('/api/editor-request',json={}).status_code,200)
class PublishTests(RolesTest):
    def test_chapter_count_excludes_back_matter(self):
        owner,_=self.owner()
        d=doc()
        d['chapters'].append({'id':'afterword','title':{'en':'Afterword','fa':'پس‌گفتار'},'group':'back'})
        d['versions'][0]['chapters']['afterword']={'paragraphs':[para('Closing note.',(12,))]}
        book=owner.post('/api/library',json={'doc':d}).json()
        self.assertEqual(book['chapters'],2)

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
    def test_saving_with_a_stale_base_is_refused_and_without_one_still_works(self):
        owner,_=self.owner();book=owner.post('/api/library',json={'doc':doc(),'visibility':'public'}).json()
        self.assertRegex(book['rev'],r'^[0-9a-f]{16}$');self.assertEqual(owner.get('/api/library/'+book['id']).json()['rev'],book['rev'])
        edited=doc();edited['versions'][0]['overview']['paragraphs'][0]['text']='Overview **changed**.'
        ok=owner.post('/api/library',json={'id':book['id'],'doc':edited,'visibility':'public','base':book['rev']});self.assertEqual(ok.status_code,200,ok.text)
        self.assertNotEqual(ok.json()['rev'],book['rev'])
        stale=owner.post('/api/library',json={'id':book['id'],'doc':doc(),'visibility':'public','base':book['rev']})
        self.assertEqual(stale.status_code,409);self.assertIn('changed somewhere else',stale.json()['detail'])
        self.assertEqual(owner.get('/api/library/'+book['id']).json()['doc']['versions'][0]['overview']['paragraphs'][0]['text'],'Overview **changed**.')
        self.assertEqual(owner.post('/api/library',json={'id':book['id'],'doc':doc(),'visibility':'public'}).status_code,200)  # no base: as before
        self.assertEqual(owner.post('/api/library',json={'id':book['id'],'doc':doc(),'visibility':'public','base':'nothex'}).status_code,422)
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
    def test_revise_follows_the_request_and_needs_one(self):
        self.sign_up(username='writer')
        body={'action':'revise','source':'A long and winding sentence.','language':'en','instruction':'Make it shorter'}
        with patch('server.app.model_json',new=AsyncMock(return_value={'text':'A short sentence.'})) as model:
            result=self.client.post('/api/editor/assist',json=body)
            self.assertEqual(result.json(),{'text':'A short sentence.'})
            self.assertIn('Make it shorter',model.await_args.args[0]);self.assertIn('add no facts',model.await_args.args[0])
        missing=self.client.post('/api/editor/assist',json={**body,'instruction':'  '})
        self.assertEqual(missing.status_code,422);self.assertIn('change',missing.json()['detail'])
    def test_identify_returns_only_clean_fields(self):
        self.assertEqual(self.reader().post('/api/editor/identify',json={'title':'x'}).status_code,403)
        self.sign_up(username='writer')
        answer={'original_title':' The Qur\'an and Its Biblical Subtext ','author':'Gabriel Said Reynolds','year':'about 2010','original_language':'en','extra':'x'}
        with patch('server.app.model_json',new=AsyncMock(return_value=answer)):
            got=self.client.post('/api/editor/identify',json={'title':'قرآن و زیرمتن','text':'رینولدز'}).json()
        self.assertEqual(got,{'original_title':"The Qur'an and Its Biblical Subtext",'author':'Gabriel Said Reynolds','year':'','original_language':'en'})
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
        with patch('server.audio.piper_mp3',side_effect=lambda text,lang,**kw:('MP3:'+text[:12]).encode()):
            started=owner.post('/api/library/'+book['id']+'/narration',json={'language':'en'});self.assertEqual(started.status_code,200,started.text)
            for _ in range(50):
                status=TestClient(app).get('/api/library/'+book['id']+'/narration/en').json()
                if status['status']!='running':break
                time.sleep(.1)
        self.assertEqual(status['status'],'ready');self.assertEqual([t['title'] for t in status['tracks']],['Overview','First','Second'])
        anon=TestClient(app);audio=anon.get(status['tracks'][1]['url']);self.assertEqual((audio.status_code,audio.headers['content-type']),(200,'audio/mpeg'));self.assertTrue(audio.content.startswith(b'MP3:First'))
        self.assertEqual(anon.get('/api/library/'+book['id']+'/audio/en/..%2F..%2Fsumm.db').status_code,404)
        self.assertEqual(self.reader().post('/api/library/'+book['id']+'/narration',json={'language':'en'}).status_code,403)
    def test_elevenlabs_narration_uses_the_editors_key(self):
        owner,uid=self.owner();book=owner.post('/api/library',json={'doc':doc()}).json()
        self.assertEqual(owner.post('/api/library/'+book['id']+'/narration',json={'language':'en','engine':'elevenlabs'}).status_code,412)
        accounts.save_service_key(uid,'elevenlabs','sk-test-0000000000000000000000','VoiceX')
        calls=[]
        async def fake(text,lang,key,voice,**kw):calls.append((key,voice));return b'ID3'+text[:5].encode()
        with patch('server.audio.eleven_mp3',fake),patch('server.audio.piper_mp3',side_effect=AssertionError('offline voice must not run')):
            started=owner.post('/api/library/'+book['id']+'/narration',json={'language':'fa','engine':'elevenlabs'})
            self.assertEqual(started.status_code,404,started.text)  # the test book has no Persian version
            started=owner.post('/api/library/'+book['id']+'/narration',json={'language':'en','engine':'elevenlabs'});self.assertEqual(started.status_code,200,started.text)
            for _ in range(50):
                status=TestClient(app).get('/api/library/'+book['id']+'/narration/en').json()
                if status['status']!='running':break
                time.sleep(.1)
        self.assertEqual(status['status'],'ready',status);self.assertEqual(calls[0],('sk-test-0000000000000000000000','VoiceX'))
        first=library.audio_path(book['id'],'en',status['tracks'][0]['url'].rsplit('/',1)[1])
        self.assertIsNotNone(first)
        first.write_bytes(b'ID3'+b'0'*15997)
        self.assertEqual(library.narration_status(book['id'],'en')['tracks'][0]['seconds'],1.0)
    def test_narration_failure_is_reported(self):
        owner,_=self.owner();book=owner.post('/api/library',json={'doc':doc()}).json()
        with patch('server.audio.piper_mp3',side_effect=OSError('voice missing')):
            owner.post('/api/library/'+book['id']+'/narration',json={'language':'en'})
            for _ in range(50):
                status=owner.get('/api/library/'+book['id']+'/narration/en').json()
                if status['status']!='running':break
                time.sleep(.1)
        self.assertEqual(status['status'],'failed');self.assertIn('voice missing',status['error'])
    def wait_done(self,client,book_id):
        for _ in range(100):
            status=client.get('/api/library/'+book_id+'/narration/en').json()
            if status['status']!='running':return status
            time.sleep(.05)
        self.fail('narration did not finish')
    def test_listing_shows_audio_only_after_a_narration_exists(self):
        owner,_=self.owner();book=owner.post('/api/library',json={'doc':doc()}).json()
        self.assertEqual(book['audio'],[]);self.assertEqual(TestClient(app).get('/api/library').json()['books'][0]['audio'],[])
        with patch('server.audio.piper_mp3',side_effect=lambda text,lang,**kw:b'MP3'+text[:6].encode()):
            owner.post('/api/library/'+book['id']+'/narration',json={'language':'en'});status=self.wait_done(owner,book['id'])
        self.assertEqual(status['status'],'ready');self.assertEqual(status['type'],'detailed')
        self.assertEqual(TestClient(app).get('/api/library').json()['books'][0]['audio'],['en'])
        self.assertEqual(TestClient(app).get('/api/library/'+book['id']).json()['audio'],['en'])
    def test_a_failed_first_run_leaves_no_audio(self):
        owner,_=self.owner();book=owner.post('/api/library',json={'doc':doc()}).json()
        with patch('server.audio.piper_mp3',side_effect=OSError('voice missing')):
            owner.post('/api/library/'+book['id']+'/narration',json={'language':'en'});self.wait_done(owner,book['id'])
        self.assertEqual(TestClient(app).get('/api/library').json()['books'][0]['audio'],[])
    def test_regenerating_keeps_the_old_audio_until_the_new_set_is_complete(self):
        owner,_=self.owner();book=owner.post('/api/library',json={'doc':doc()}).json();bid=book['id']
        with patch('server.audio.piper_mp3',side_effect=lambda text,lang,**kw:b'OLD'+text[:6].encode()):
            owner.post('/api/library/'+bid+'/narration',json={'language':'en'});first=self.wait_done(owner,bid)
        old_files=[t['url'].rsplit('/',1)[1] for t in first['tracks']];self.assertEqual(len(old_files),3)
        gate=threading.Event();reached=threading.Event()
        def slow(text,lang,**kw):
            reached.set();gate.wait(5);return b'NEW'+text[:6].encode()
        with patch('server.audio.piper_mp3',side_effect=slow):
            self.assertEqual(owner.post('/api/library/'+bid+'/narration',json={'language':'en'}).status_code,200)
            self.assertTrue(reached.wait(5))
            during=TestClient(app).get('/api/library/'+bid+'/narration/en').json()
            self.assertEqual(during['status'],'running')
            self.assertEqual([t['url'] for t in during['tracks']],[t['url'] for t in first['tracks']])  # old audio still listed
            self.assertEqual(TestClient(app).get('/api/library').json()['books'][0]['audio'],['en'])  # and Listen stays visible
            self.assertTrue(TestClient(app).get(during['tracks'][0]['url']).content.startswith(b'OLD'))
            gate.set();after=self.wait_done(owner,bid)
        self.assertEqual(after['status'],'ready')
        new_files=[t['url'].rsplit('/',1)[1] for t in after['tracks']]
        self.assertTrue(set(new_files).isdisjoint(old_files))
        self.assertTrue(all(re.fullmatch(r'[0-9a-f]{8}-\d+\.mp3',n) for n in new_files))
        folder=Path(os.environ['SUMM_DATA_DIR'])/'audio'/bid/'en'
        self.assertEqual(sorted(f.name for f in folder.glob('*.mp3')),sorted(new_files))  # the old files are gone
        self.assertTrue(TestClient(app).get(after['tracks'][0]['url']).content.startswith(b'NEW'))
    def test_a_failed_regeneration_keeps_the_old_audio(self):
        owner,_=self.owner();book=owner.post('/api/library',json={'doc':doc()}).json();bid=book['id']
        with patch('server.audio.piper_mp3',side_effect=lambda text,lang,**kw:b'OLD'+text[:6].encode()):
            owner.post('/api/library/'+bid+'/narration',json={'language':'en'});first=self.wait_done(owner,bid)
        calls=[]
        def flaky(text,lang,**kw):
            calls.append(1)
            if len(calls)>1:raise OSError('voice missing')
            return b'NEW'
        with patch('server.audio.piper_mp3',side_effect=flaky):
            owner.post('/api/library/'+bid+'/narration',json={'language':'en'});failed=self.wait_done(owner,bid)
        self.assertEqual(failed['status'],'failed');self.assertEqual(failed['tracks'],first['tracks'])
        folder=Path(os.environ['SUMM_DATA_DIR'])/'audio'/bid/'en'
        self.assertEqual(sorted(f.name for f in folder.glob('*.mp3')),sorted(t['url'].rsplit('/',1)[1] for t in first['tracks']))
        self.assertEqual(TestClient(app).get('/api/library').json()['books'][0]['audio'],['en'])
    def test_old_numbered_files_are_still_served(self):
        owner,_=self.owner();book=owner.post('/api/library',json={'doc':doc()}).json();bid=book['id']
        folder=Path(os.environ['SUMM_DATA_DIR'])/'audio'/bid/'en';folder.mkdir(parents=True)
        (folder/'0.mp3').write_bytes(b'ID3old')
        library.q("INSERT INTO narration(book_id,language,status,done,total,tracks,error,updated) VALUES(?,?,?,?,?,?,?,?)",(bid,'en','ready',1,1,json.dumps([{'title':'Overview','chapterId':None,'file':'0.mp3'}]),'',time.time()))
        status=TestClient(app).get('/api/library/'+bid+'/narration/en').json()
        self.assertEqual((status['type'],status['engine']),('',  'offline'))  # old rows match any version
        self.assertEqual(TestClient(app).get(status['tracks'][0]['url']).content,b'ID3old')
        self.assertEqual(TestClient(app).get('/api/library/'+bid+'/audio/en/zzzzzzzz-0.mp3').status_code,404)
    def make(self,owner,bid,**body):
        r=owner.post('/api/library/'+bid+'/narration',json={'language':'en',**body});self.assertEqual(r.status_code,200,r.text);return self.wait_done(owner,bid)
    def files(self,bid):return sorted(f.name for f in (Path(os.environ['SUMM_DATA_DIR'])/'audio'/bid/'en').glob('*.mp3'))
    def test_a_partial_run_keeps_the_other_chapters_files(self):
        owner,_=self.owner();bid=owner.post('/api/library',json={'doc':doc()}).json()['id']
        with patch('server.audio.piper_mp3',side_effect=lambda text,lang,**kw:b'OLD'+text[:6].encode()):first=self.make(owner,bid)
        with patch('server.audio.piper_mp3',side_effect=lambda text,lang,**kw:b'NEW'+text[:6].encode()):second=self.make(owner,bid,chapters=['c2'])
        self.assertEqual([t['title'] for t in second['tracks']],['Overview','First','Second'])  # still in document order
        urls=[t['url'] for t in second['tracks']];old=[t['url'] for t in first['tracks']]
        self.assertEqual(urls[:2],old[:2]);self.assertNotEqual(urls[2],old[2])
        client=TestClient(app);self.assertTrue(client.get(urls[0]).content.startswith(b'OLD'));self.assertTrue(client.get(urls[2]).content.startswith(b'NEW'))
        self.assertEqual(self.files(bid),sorted(u.rsplit('/',1)[1] for u in urls))
        self.assertEqual(second['total'],1)
        self.assertEqual(owner.post('/api/library/'+bid+'/narration',json={'language':'en','chapters':['nope']}).status_code,422)
    def test_a_formatting_only_edit_is_not_out_of_date_but_a_text_edit_is(self):
        owner,_=self.owner();d=doc();book=owner.post('/api/library',json={'doc':d}).json();bid=book['id']
        with patch('server.audio.piper_mp3',side_effect=lambda text,lang,**kw:b'MP3'):self.make(owner,bid)
        self.assertEqual(owner.get('/api/library/'+bid+'/narration/en?detail=1').json()['staleChapters'],[])
        d['versions'][0]['chapters']['c1']['paragraphs'][0]['text']='First **chapter** summary.'
        saved=owner.post('/api/library',json={'id':bid,'doc':d,'base':book['rev']}).json()
        self.assertEqual(owner.get('/api/library/'+bid+'/narration/en?detail=1').json()['staleChapters'],[])
        d['versions'][0]['chapters']['c1']['paragraphs'][0]['text']='First chapter, rewritten.'
        owner.post('/api/library',json={'id':bid,'doc':d,'base':saved['rev']})
        detail=owner.get('/api/library/'+bid+'/narration/en?detail=1').json();self.assertEqual(detail['staleChapters'],['c1'])
        self.assertNotIn('staleChapters',TestClient(app).get('/api/library/'+bid+'/narration/en?detail=1').json())  # the public answer stays cheap
        reader=self.reader();self.assertNotIn('staleChapters',reader.get('/api/library/'+bid+'/narration/en?detail=1').json())
        est=owner.post('/api/library/'+bid+'/narration/estimate',json={'language':'en'}).json()
        self.assertEqual([(i['key'],i['stale'],i['narrated']) for i in est['items']],[('overview',False,True),('c1',True,True),('c2',False,True)])
        self.assertEqual(est['chars'],sum(i['chars'] for i in est['items']));self.assertGreater(est['seconds'],0)
        self.assertEqual(owner.post('/api/library/'+bid+'/narration/estimate',json={'language':'en','chapters':['c1']}).json()['chars'],est['items'][1]['chars'])
        self.assertEqual(reader.post('/api/library/'+bid+'/narration/estimate',json={'language':'en'}).status_code,403)
    def test_settings_reach_the_provider_and_the_key_never_leaves_the_server(self):
        owner,uid=self.owner();bid=owner.post('/api/library',json={'doc':doc()}).json()['id']
        secret='sk_test_0000000000000000000000'
        accounts.save_service_key(uid,'elevenlabs',secret,'DefaultVoice')
        seen=[]
        async def fake(text,lang,key,voice,settings=None,**kw):seen.append((key,voice,settings));return b'ID3x'
        settings={'voice':'MyVoice9','model':'eleven_v3','speed':1.1,'stability':0.4,'similarity':0.7,'style':0.2,'speakerBoost':False}
        with patch('server.audio.eleven_mp3',fake):
            r=owner.post('/api/library/'+bid+'/narration',json={'language':'en','engine':'elevenlabs','settings':settings});self.assertEqual(r.status_code,200)
            done=self.wait_done(owner,bid)
        self.assertEqual(done['status'],'ready');self.assertEqual(done['engine'],'elevenlabs')
        self.assertEqual(seen[0],(secret,'MyVoice9',settings))
        detail=owner.get('/api/library/'+bid+'/narration/en?detail=1').json();self.assertEqual(detail['settings'],settings)
        self.assertNotIn(secret,json.dumps([r.json(),done,detail]))
        for bad in ({'speed':1.4},{'speed':0.5},{'stability':2},{'voice':'../x'},{'model':'Bad Model'},{'nope':1}):
            self.assertEqual(owner.post('/api/library/'+bid+'/narration',json={'language':'en','engine':'elevenlabs','settings':bad}).status_code,422,bad)
        with patch('server.audio.piper_mp3',side_effect=lambda text,lang,**kw:b'MP3') as piper:
            self.make(owner,bid,settings={'speed':1.4,'stability':0.1})  # offline allows 1.5 and ignores the ElevenLabs-only fields
        self.assertEqual(piper.call_args.kwargs['speed'],1.4)
        self.assertEqual(owner.get('/api/library/'+bid+'/narration/en?detail=1').json()['settings'],{'speed':1.4})
    def test_eleven_request_body_carries_the_chosen_settings_and_retries_without_language(self):
        from server import audio
        body=audio.eleven_body('Hi','fa',{'model':'eleven_v3','speed':1.1,'stability':0.3,'similarity':0.6,'style':0.1,'speakerBoost':False})
        self.assertEqual(body['model_id'],'eleven_v3');self.assertEqual(body['language_code'],'fa')
        self.assertEqual(body['voice_settings'],{'stability':0.3,'similarity_boost':0.6,'style':0.1,'use_speaker_boost':False,'speed':1.1})
        self.assertNotIn('speed',audio.eleven_body('Hi','en',None)['voice_settings']);self.assertNotIn('language_code',audio.eleven_body('Hi','en',None,False))
        import asyncio,httpx
        sent=[]
        def handler(request):
            sent.append(json.loads(request.content))
            if 'language_code' in sent[-1]:return httpx.Response(400,json={'detail':{'message':'language_code is not supported for this model'}})
            return httpx.Response(200,content=b'ID3ok',headers={'content-type':'audio/mpeg'})
        real=httpx.AsyncClient
        with patch('server.audio.httpx.AsyncClient',lambda **kw:real(transport=httpx.MockTransport(handler),**kw)):
            self.assertEqual(asyncio.run(audio.eleven_mp3('Hi','en','k','V',settings={'model':'eleven_multilingual_v2'})),b'ID3ok')
        self.assertEqual(len(sent),2);self.assertNotIn('language_code',sent[1])
        def refuse(request):return httpx.Response(422,json={'detail':[{'msg':'speed must be at most 1.2'}]})
        with patch('server.audio.httpx.AsyncClient',lambda **kw:real(transport=httpx.MockTransport(refuse),**kw)):
            with self.assertRaises(ConnectionError) as ctx:asyncio.run(audio.eleven_mp3('Hi','en','k','V'))
        self.assertIn('speed must be at most 1.2',str(ctx.exception))  # the provider's own message reaches the owner
    def test_cancel_restores_the_old_audio_and_delete_is_refused_while_running(self):
        owner,_=self.owner();bid=owner.post('/api/library',json={'doc':doc()}).json()['id']
        with patch('server.audio.piper_mp3',side_effect=lambda text,lang,**kw:b'OLD'+text[:6].encode()):first=self.make(owner,bid)
        gate=threading.Event();reached=threading.Event()
        def slow(text,lang,**kw):
            reached.set();gate.wait(5);return b'NEW'
        with patch('server.audio.piper_mp3',side_effect=slow):
            owner.post('/api/library/'+bid+'/narration',json={'language':'en'});self.assertTrue(reached.wait(5))
            self.assertEqual(owner.delete('/api/library/'+bid+'/narration/en').status_code,409)
            self.assertEqual(self.reader().post('/api/library/'+bid+'/narration/en/cancel').status_code,403)
            self.assertEqual(owner.post('/api/library/'+bid+'/narration/en/cancel').status_code,200)
            gate.set();after=self.wait_done(owner,bid)
        self.assertEqual(after['status'],'ready');self.assertEqual(after['tracks'],first['tracks']);self.assertEqual(after['error'],'')
        self.assertEqual(self.files(bid),sorted(t['url'].rsplit('/',1)[1] for t in first['tracks']))
        self.assertEqual(owner.post('/api/library/'+bid+'/narration/en/cancel').status_code,409)  # nothing is running now
    def test_cancelling_a_first_run_leaves_no_audio_and_delete_removes_everything(self):
        owner,_=self.owner();bid=owner.post('/api/library',json={'doc':doc()}).json()['id']
        gate=threading.Event();reached=threading.Event()
        def slow(text,lang,**kw):
            reached.set();gate.wait(5);return b'NEW'
        with patch('server.audio.piper_mp3',side_effect=slow):
            owner.post('/api/library/'+bid+'/narration',json={'language':'en'});self.assertTrue(reached.wait(5))
            owner.post('/api/library/'+bid+'/narration/en/cancel');gate.set()
            for _ in range(100):
                if library.narration_status(bid,'en')['status']!='running':break
                time.sleep(.05)
        self.assertEqual(library.narration_status(bid,'en')['status'],'none');self.assertEqual(self.files(bid),[])
        with patch('server.audio.piper_mp3',side_effect=lambda text,lang,**kw:b'MP3'):self.make(owner,bid)
        self.assertEqual(self.reader().delete('/api/library/'+bid+'/narration/en').status_code,403)
        self.assertEqual(owner.delete('/api/library/'+bid+'/narration/en').json()['status'],'none')
        self.assertEqual(self.files(bid),[]);self.assertEqual(TestClient(app).get('/api/library').json()['books'][0]['audio'],[])
    def test_voices_and_models_come_from_the_server_side_key(self):
        import httpx
        owner,uid=self.owner();secret='sk_test_0000000000000000000000'
        self.assertEqual(owner.get('/api/me/voices').json(),{'voices':[],'hasKey':False})
        accounts.save_service_key(uid,'elevenlabs',secret,'DefaultVoice')
        calls=[]
        def handler(request):
            calls.append((str(request.url),request.headers.get('xi-api-key')))
            if request.url.path.endswith('/voices'):return httpx.Response(200,json={'voices':[{'voice_id':'premade1','name':'Aria','category':'premade','preview_url':'https://x/a.mp3'},{'voice_id':'mine1','name':'Mine','category':'cloned','preview_url':'http://insecure'},{'voice_id':'bad id!','name':'x'}]})
            return httpx.Response(200,json=[{'model_id':'eleven_v3','name':'v3','can_do_text_to_speech':True,'languages':[{'language_id':'fa'}]},{'model_id':'eleven_en_only','name':'En','can_do_text_to_speech':True,'languages':[{'language_id':'en'}]},{'model_id':'eleven_sts','name':'STS','can_do_text_to_speech':False}])
        real=httpx.AsyncClient
        with patch('server.app.httpx.AsyncClient',lambda **kw:real(transport=httpx.MockTransport(handler),**kw)):
            v=owner.get('/api/me/voices');m=owner.get('/api/me/voice-models?language=fa')
        self.assertEqual([x['id'] for x in v.json()['voices']],['mine1','premade1']);self.assertEqual(v.json()['voices'][0]['preview'],'')
        self.assertEqual([x['id'] for x in m.json()['models']],['eleven_v3'])
        self.assertTrue(all(k==secret for _,k in calls));self.assertNotIn(secret,v.text+m.text)
        def down(request):return httpx.Response(503)
        with patch('server.app.httpx.AsyncClient',lambda **kw:real(transport=httpx.MockTransport(down),**kw)):
            self.assertEqual(owner.get('/api/me/voices').json()['voices'],[]);self.assertEqual(owner.get('/api/me/voice-models').json()['models'][0]['id'],'eleven_v4_turbo')
        self.assertEqual(self.reader().get('/api/me/voices').status_code,403)
        for _ in range(10):owner.get('/api/me/voices')
        self.assertEqual(owner.get('/api/me/voices').status_code,429)
    def test_preview_accepts_a_voice_and_settings(self):
        owner,uid=self.owner();accounts.save_service_key(uid,'elevenlabs','sk_test_0000000000000000000000','Default1')
        with patch('server.audio.eleven_mp3',new=AsyncMock(return_value=b'ID3p')) as eleven:
            r=owner.post('/api/audio',json={'text':'Hi','language':'en','engine':'elevenlabs','voice':'Other2','settings':{'speed':1.1,'stability':0.3}})
        self.assertEqual(r.content,b'ID3p');self.assertEqual(eleven.await_args.args[3],'Other2');self.assertEqual(eleven.await_args.kwargs['settings'],{'speed':1.1,'stability':0.3})
        self.assertEqual(owner.post('/api/audio',json={'text':'Hi','language':'en','engine':'elevenlabs','settings':{'speed':1.4}}).status_code,422)
        with patch('server.audio.piper_mp3',return_value=b'ID3q') as piper:owner.post('/api/audio',json={'text':'Hi','language':'en','settings':{'speed':1.3}})
        self.assertEqual(piper.call_args.kwargs['speed'],1.3)
    def test_the_migration_adds_narration_columns_to_an_old_database(self):
        data=tempfile.mkdtemp();old=sqlite3.connect(Path(data)/'summ.db')
        old.executescript("CREATE TABLE library(id TEXT PRIMARY KEY);CREATE TABLE narration(book_id TEXT NOT NULL,language TEXT NOT NULL,status TEXT NOT NULL,done INTEGER NOT NULL DEFAULT 0,total INTEGER NOT NULL DEFAULT 0,tracks TEXT NOT NULL DEFAULT '[]',error TEXT NOT NULL DEFAULT '',updated REAL NOT NULL,PRIMARY KEY(book_id,language));");old.commit();old.close()
        with patch.dict(os.environ,{'SUMM_DATA_DIR':data}):
            columns={r[1] for r in accounts._db().execute('PRAGMA table_info(narration)')}
        self.assertTrue({'engine','type','settings'}<=columns)
if __name__=='__main__':unittest.main()
