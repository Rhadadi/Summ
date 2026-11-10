import os,tempfile,unittest
from unittest.mock import AsyncMock,patch
from fastapi import HTTPException
from fastapi.testclient import TestClient
from server import accounts
from server.app import SourceBlock,app,block_batches,hits,public_target,valid_paragraphs
class PipelineTests(unittest.TestCase):
    def test_chunking_preserves_every_character(self):
        text=('Words, qualifications, and 3.5 units. '*700)+'END'
        batches=block_batches([SourceBlock(id='a',text=text),SourceBlock(id='b',text='Second passage.')],limit=800)
        self.assertGreater(len(batches),2)
        self.assertEqual(''.join(b['text'] for batch in batches for b in batch if b['id']=='a'),text)
        self.assertEqual(''.join(b['text'] for batch in batches for b in batch if b['id']=='b'),'Second passage.')
    def test_unknown_source_is_rejected(self):
        with self.assertRaises(HTTPException):valid_paragraphs([{'text':'Claim.','evidence_ids':['other-book']}],[SourceBlock(id='a',text='Source.')])
    def test_invented_quote_is_rejected(self):
        with self.assertRaises(HTTPException):valid_paragraphs([{'text':'The author says “This is a fabricated quotation with many words”.','evidence_ids':['a']}],[SourceBlock(id='a',text='The actual source says something else.')])
    def test_private_addresses_are_rejected(self):
        for address in ['127.0.0.1','192.168.1.10','169.254.169.254','::1','10.0.0.1','224.0.0.1']:
            with self.subTest(address=address),patch('socket.getaddrinfo',return_value=[(2,1,6,'',(address,443))]):
                with self.assertRaises(HTTPException):public_target('https://untrusted.example/source')
    def test_mixed_dns_answers_are_rejected(self):
        with patch('socket.getaddrinfo',return_value=[(2,1,6,'',('93.184.216.34',443)),(2,1,6,'',('127.0.0.1',443))]):
            with self.assertRaises(HTTPException):public_target('https://untrusted.example/source')
class ServerTest(unittest.TestCase):
    def setUp(self):
        self.data=tempfile.TemporaryDirectory()
        self.env=patch.dict(os.environ,{'SUMM_DATA_DIR':self.data.name,'SUMM_SECRET_KEY':'s'*40,'SUMM_INSECURE_COOKIES':'true'});self.env.start();hits.clear()
        self.client=TestClient(app,headers={'X-Summ-Request':'1'})
    def tearDown(self):
        self.client.close()
        if accounts._conn:accounts._conn.close();accounts._conn=None
        self.env.stop();self.data.cleanup()
    def sign_up(self,client=None,username='reader',key='AIza-test-key-0000000000000x7Qa'):
        client=client or self.client
        r=client.post('/api/auth/register',json={'username':username,'password':'correct horse battery'});self.assertEqual(r.status_code,200,r.text)
        if key:
            with patch('server.app.check_key',new=AsyncMock()):
                r=client.put('/api/me/key',json={'api_key':key,'model':'test-model'});self.assertEqual(r.status_code,200,r.text)
class AccountTests(ServerTest):
    def test_passwords_are_hashed_and_keys_encrypted(self):
        self.sign_up()
        stored=accounts.query('SELECT password FROM users')[0][0];self.assertTrue(stored.startswith('scrypt$'));self.assertNotIn('correct horse',stored)
        secret=accounts.query('SELECT secret FROM keys')[0][0];self.assertNotIn(b'AIza-test-key',secret)
        me=self.client.get('/api/me').json();self.assertEqual(me['key']['hint'],'x7Qa');self.assertNotIn('AIza',str(me))
    def test_each_user_gets_their_own_key(self):
        self.sign_up(username='first',key='AIza-first-key-00000000000001111')
        other=TestClient(app,headers={'X-Summ-Request':'1'});self.sign_up(other,username='second',key='AIza-second-key-0000000000002222')
        ids=[r[0] for r in accounts.query('SELECT id FROM users ORDER BY username')]
        self.assertEqual(accounts.credentials(ids[0])[0],'AIza-first-key-00000000000001111');self.assertEqual(accounts.credentials(ids[1])[0],'AIza-second-key-0000000000002222')
        other.close()
    def test_login_logout_and_wrong_password(self):
        self.sign_up(key=None)
        self.assertEqual(self.client.post('/api/auth/logout').status_code,200);self.assertEqual(self.client.get('/api/me').status_code,401)
        self.assertEqual(self.client.post('/api/auth/login',json={'username':'reader','password':'wrong password!!'}).status_code,401)
        self.assertEqual(self.client.post('/api/auth/login',json={'username':'READER','password':'correct horse battery'}).status_code,200)
    def test_duplicate_and_weak_signups_are_rejected(self):
        self.sign_up(key=None)
        self.assertEqual(self.client.post('/api/auth/register',json={'username':'Reader','password':'correct horse battery'}).status_code,409)
        self.assertEqual(self.client.post('/api/auth/register',json={'username':'new','password':'short'}).status_code,422)
    def test_signup_can_be_closed(self):
        with patch.dict(os.environ,{'SUMM_ALLOW_SIGNUP':'false'}):
            self.assertEqual(self.client.post('/api/auth/register',json={'username':'reader','password':'correct horse battery'}).status_code,403)
    def test_cross_site_writes_without_header_are_blocked(self):
        bare=TestClient(app);self.assertEqual(bare.post('/api/auth/register',json={'username':'reader','password':'correct horse battery'}).status_code,403);bare.close()
    def google(self,info:dict):
        class Reply:
            status_code=200
            def json(self):return info
        with patch.dict(os.environ,{'GOOGLE_CLIENT_ID':'client.apps.googleusercontent.com'}),patch('httpx.AsyncClient.get',new=AsyncMock(return_value=Reply())):
            return self.client.post('/api/auth/google',json={'credential':'x'*40})
    def test_google_sign_in_checks_audience(self):
        self.assertEqual(self.google({'aud':'someone-else','iss':'accounts.google.com','email_verified':'true','sub':'1'}).status_code,401)
        r=self.google({'aud':'client.apps.googleusercontent.com','iss':'accounts.google.com','email_verified':'true','sub':'42','email':'reader@example.com'})
        self.assertEqual(r.status_code,200,r.text);self.assertEqual(r.json()['user']['name'],'reader@example.com')
    def test_changed_server_secret_asks_for_key_again(self):
        self.sign_up()
        with patch.dict(os.environ,{'SUMM_SECRET_KEY':'t'*40}),patch('server.app.model_json',new=AsyncMock())as model:
            r=self.client.post('/api/summarize',json=APITests.payload());self.assertEqual(r.status_code,409);model.assert_not_awaited()
class APITests(ServerTest):
    @staticmethod
    def payload():return {'chapter':{'id':'c','title':'Chapter','blocks':[{'id':'b','text':'Complaints fell from 40 to 25, but causation is not established.','location':'Paragraph 1'}]},'depth':'detailed','purpose':'academic','language':'en','review':'off'}
    def test_health_exposes_no_credentials(self):
        self.sign_up();r=self.client.get('/api/health');self.assertEqual(r.status_code,200);self.assertNotIn('AIza',r.text);self.assertNotIn('model',r.text)
    def test_signed_out_generation_is_blocked(self):
        self.assertEqual(self.client.post('/api/summarize',json=self.payload()).status_code,401)
    def test_generation_without_a_key_explains_what_to_do(self):
        self.sign_up(key=None);r=self.client.post('/api/summarize',json=self.payload());self.assertEqual(r.status_code,412);self.assertIn('Gemini API key',r.json()['detail'])
    def test_short_chapter_sends_source_to_draft_and_only_cited_passages_to_check(self):
        self.sign_up();body=self.payload();body['chapter']['blocks'].append({'id':'x','text':'An unrelated passage that nothing cites.'})
        responses=[{'paragraphs':[{'text':'Count fell, but the source does not establish causation.','evidence_ids':['b']}],'review':[]},{'supported':True,'checked_paragraphs':1}]
        with patch('server.app.model_json',new=AsyncMock(side_effect=responses))as model:
            r=self.client.post('/api/summarize',json=body)
            self.assertEqual(r.status_code,200,r.text);self.assertEqual(model.await_count,2);self.assertTrue(r.json()['checked']);self.assertEqual(r.json()['model'],'test-model')
            draft,check=[c.args[0] for c in model.await_args_list]
            self.assertEqual(draft.count('Complaints fell'),1);self.assertIn('unrelated passage',draft)
            self.assertNotIn('unrelated passage',check)
            self.assertEqual(model.await_args_list[0].args[1],('AIza-test-key-0000000000000x7Qa','test-model'))
    def test_long_chapter_drafts_from_inventory_without_resending_source(self):
        self.sign_up();body=self.payload();body['chapter']['blocks']=[{'id':'a','text':'alpha '*4000},{'id':'b','text':'beta '*4000}]
        responses=[{'items':[{'text':'Alpha item.','evidence_ids':['a']}]},{'items':[{'text':'Beta item.','evidence_ids':['b']}]},{'paragraphs':[{'text':'Alpha then beta.','evidence_ids':['a','b']}],'review':[]},{'supported':True,'checked_paragraphs':1}]
        with patch('server.app.model_json',new=AsyncMock(side_effect=responses))as model:
            r=self.client.post('/api/summarize',json=body);self.assertEqual(r.status_code,200,r.text);self.assertEqual(model.await_count,4)
            draft=model.await_args_list[2].args[0];self.assertIn('Alpha item.',draft);self.assertNotIn('alpha alpha',draft)
    def test_failed_support_check_publishes_no_summary(self):
        self.sign_up();responses=[{'paragraphs':[{'text':'The change certainly caused improvement.','evidence_ids':['b']}],'review':[]},{'supported':False,'checked_paragraphs':1}]
        with patch('server.app.model_json',new=AsyncMock(side_effect=responses)):
            r=self.client.post('/api/summarize',json=self.payload());self.assertEqual(r.status_code,502);self.assertNotIn('paragraphs',r.json())
    def test_missing_inventory_passage_is_rejected(self):
        self.sign_up();body=self.payload();body['chapter']['blocks']=[{'id':'a','text':'alpha '*4000},{'id':'b','text':'beta '*4000}]
        with patch('server.app.model_json',new=AsyncMock(return_value={'items':[{'text':'Claim.','evidence_ids':['a']}]})):
            self.assertEqual(self.client.post('/api/summarize',json=body).status_code,502)
    def test_large_chapter_is_rejected_without_truncation(self):
        self.sign_up();body=self.payload();body['chapter']['blocks']=[{'id':'a','text':'a'*130000},{'id':'b','text':'b'*130000}]
        with patch('server.app.model_json',new=AsyncMock())as model:
            self.assertEqual(self.client.post('/api/summarize',json=body).status_code,413);model.assert_not_awaited()
    def test_rate_limit_is_per_user(self):
        self.sign_up();other=TestClient(app,headers={'X-Summ-Request':'1'});self.sign_up(other,username='second')
        with patch('server.app.model_json',new=AsyncMock(side_effect=HTTPException(502,'stop'))):
            codes=[self.client.post('/api/summarize',json=self.payload()).status_code for _ in range(13)]
            self.assertEqual(codes[-1],429);self.assertNotEqual(other.post('/api/summarize',json=self.payload()).status_code,429)
        other.close()
    def test_book_overview_requires_sign_in(self):
        body={'title':'Book','kind':'book','language':'en','sections':[{'id':'c1','title':'First','paragraphs':[{'text':'Qualified finding.','evidence_ids':['b']}]}]}
        self.assertEqual(self.client.post('/api/compose',json=body).status_code,401)
    def test_book_overview_sends_each_summary_once(self):
        self.sign_up()
        body={'title':'Book','kind':'book','language':'en','sections':[{'id':'c1','title':'First','paragraphs':[{'text':'Count fell; causation is not established.','evidence_ids':['b']}]}]}
        output={'paragraphs':[{'heading':'Central argument','text':'The chapter distinguishes observation from causation.','evidence_ids':['c1']}],'takeaways':[{'text':'A falling count does not establish causation.','evidence_ids':['c1']}]}
        with patch('server.app.model_json',new=AsyncMock(side_effect=[output,{'supported':True,'checked_paragraphs':2}]))as model:
            r=self.client.post('/api/compose',json=body)
            self.assertEqual(r.status_code,200,r.text);self.assertEqual(model.await_count,2);self.assertEqual(r.json()['paragraphs'][0]['heading'],'Central argument');self.assertEqual(r.json()['model'],'test-model')
            self.assertEqual(model.await_args_list[0].args[0].count('Count fell'),1)
    def test_composition_rejects_invented_reference(self):
        self.sign_up();body={'title':'Book','kind':'book','language':'en','sections':[{'id':'c1','title':'First','paragraphs':[{'text':'Claim.','evidence_ids':['b']}]}]}
        with patch('server.app.model_json',new=AsyncMock(return_value={'paragraphs':[{'text':'Unsupported.','evidence_ids':['other-chapter']}],'takeaways':[]})):
            self.assertEqual(self.client.post('/api/compose',json=body).status_code,502)
    def test_composition_rejects_failed_support_check(self):
        self.sign_up();body={'title':'Chapter','kind':'chapter','language':'en','sections':[{'id':'part1','title':'Part','paragraphs':[{'text':'Claim.','evidence_ids':['b']}]}]}
        output={'paragraphs':[{'text':'An unsupported interpretation.','evidence_ids':['b']}],'takeaways':[]}
        with patch('server.app.model_json',new=AsyncMock(side_effect=[output,{'supported':False,'checked_paragraphs':1}])):
            self.assertEqual(self.client.post('/api/compose',json=body).status_code,502)
    def test_youtube_uses_an_honest_transcript_fallback(self):
        self.sign_up(key=None);r=self.client.post('/api/import',json={'url':'https://www.youtube.com/watch?v=example'})
        self.assertEqual(r.status_code,422);self.assertIn('transcript',r.json()['detail'])
class GuideAndMediaTests(ServerTest):
    sections=[{'id':'c1','title':'One','paragraphs':[{'text':'Winston rewrites records at the Ministry.','evidence_ids':['b1']}]},{'id':'c2','title':'Two','paragraphs':[{'text':'Julia and Winston meet in secret.','evidence_ids':['b2']}]}]
    def guide(self,output,check={'supported':True,'checked_paragraphs':3}):
        self.sign_up()
        with patch('server.app.model_json',new=AsyncMock(side_effect=[output,check]))as model:
            return self.client.post('/api/guide',json={'title':'Book','author':'A','language':'en','sections':self.sections}),model
    def test_guide_follows_the_chosen_book_type(self):
        output={'type':'fiction','sections':[{'kind':'characters','title':'Characters','items':[{'heading':'Winston','text':'Rewrites records.','evidence_ids':['c1']},{'heading':'Julia','text':'Meets Winston in secret.','evidence_ids':['c2']}]},{'kind':'themes','title':'Themes','items':[{'heading':'Secrecy','text':'Private life under watch.','evidence_ids':['c2']}]},{'kind':'not-a-section','title':'X','items':[{'text':'Dropped.','evidence_ids':['c1']}]}]}
        r,model=self.guide(output);self.assertEqual(r.status_code,200,r.text)
        self.assertEqual(r.json()['type'],'fiction');self.assertEqual([s['kind'] for s in r.json()['sections']],['characters','themes'])
        self.assertEqual(model.await_args_list[0].args[0].count('Julia and Winston meet'),1)
    def test_guide_rejects_unknown_type_and_invented_references(self):
        self.assertEqual(self.guide({'type':'cookbook','sections':[]})[0].status_code,502)
        self.client.post('/api/auth/logout')
        bad={'type':'fiction','sections':[{'kind':'characters','title':'C','items':[{'heading':'X','text':'Y','evidence_ids':['c9']}]},{'kind':'themes','title':'T','items':[{'text':'Z','evidence_ids':['c1']}]}]}
        hits.clear();self.client=TestClient(app,headers={'X-Summ-Request':'1'})
        with patch('server.app.model_json',new=AsyncMock(return_value=bad)):
            self.client.post('/api/auth/login',json={'username':'reader','password':'correct horse battery'})
            self.assertEqual(self.client.post('/api/guide',json={'title':'Book','language':'en','sections':self.sections}).status_code,502)
    def test_book_info_is_public_and_cover_hosts_are_restricted(self):
        with patch('server.bookinfo.lookup',new=AsyncMock(return_value={'title':'Book','ratings':[]})):
            self.assertEqual(self.client.get('/api/book-info',params={'title':'Book'}).json()['title'],'Book')
        self.assertEqual(self.client.get('/api/cover',params={'src':'https://192.168.1.1/x.jpg'}).status_code,404)
        self.assertEqual(self.client.get('/api/cover',params={'src':'http://covers.openlibrary.org/b/id/1-L.jpg'}).status_code,404)
    def test_pdf_renders_for_signed_in_users(self):
        body={'book':{'title':'Book','author':'A'},'language':'fa','overview':[{'text':'نمای کلی کتاب.'}],'chapters':[{'title':'Chapter','paragraphs':[{'heading':'H','text':'Text.','ref':'Page 1'}]}]}
        self.assertEqual(self.client.post('/api/pdf',json=body).status_code,401)
        self.sign_up(key=None);r=self.client.post('/api/pdf',json=body)
        self.assertEqual(r.status_code,200,r.text[:200]);self.assertTrue(r.content.startswith(b'%PDF'))
        self.assertEqual(self.client.post('/api/pdf',json={**body,'cover':'data:text/html;base64,PGI+'}).status_code,422)
    def test_audio_uses_offline_voice_or_the_users_own_elevenlabs_key(self):
        self.sign_up(key=None)
        with patch('server.audio.piper_mp3',return_value=b'ID3audio')as piper:
            r=self.client.post('/api/audio',json={'text':'سلام','language':'fa'});self.assertEqual(r.content,b'ID3audio');self.assertEqual(piper.call_args.args,('سلام','fa'))
        self.assertEqual(self.client.post('/api/audio',json={'text':'Hi','language':'en','engine':'elevenlabs'}).status_code,412)
        class Ok:status_code=200
        with patch('httpx.AsyncClient.get',new=AsyncMock(return_value=Ok())):
            r=self.client.put('/api/me/voice-key',json={'api_key':'sk_test_eleven_key_00000000abcd','voice':'Voice123'});self.assertEqual(r.json()['voice'],{'hint':'abcd','option':'Voice123'})
        with patch('server.audio.eleven_mp3',new=AsyncMock(return_value=b'ID3eleven'))as eleven:
            r=self.client.post('/api/audio',json={'text':'Hi','language':'en','engine':'elevenlabs'});self.assertEqual(r.content,b'ID3eleven')
            self.assertEqual(eleven.await_args.args,('Hi','en','sk_test_eleven_key_00000000abcd','Voice123'))
if __name__=='__main__':unittest.main()
