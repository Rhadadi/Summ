import os,unittest
from unittest.mock import AsyncMock,patch
from fastapi import HTTPException
from fastapi.testclient import TestClient
from server.app import SourceBlock,app,block_batches,public_target,valid_paragraphs
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
class APITests(unittest.TestCase):
    def setUp(self):
        self.env=patch.dict(os.environ,{'SUMM_ACCESS_TOKEN':'private-test-token','GEMINI_API_KEY':'test-only','SUMM_MODEL':'test-model'});self.env.start();self.client=TestClient(app)
        self.payload={'chapter':{'id':'c','title':'Chapter','blocks':[{'id':'b','text':'Complaints fell from 40 to 25, but causation is not established.','location':'Paragraph 1'}]},'depth':'detailed','purpose':'academic','language':'en','review':'off'}
        self.headers={'Authorization':'Bearer private-test-token'}
    def tearDown(self):self.env.stop()
    def test_health_exposes_no_credentials(self):
        r=self.client.get('/api/health');self.assertEqual(r.status_code,200);self.assertNotIn('private-test-token',r.text);self.assertTrue(r.json()['auth_required'])
    def test_unauthorized_generation_is_blocked(self):
        self.assertEqual(self.client.post('/api/summarize',json=self.payload).status_code,401)
    def test_generation_requires_inventory_and_support_check(self):
        responses=[{'items':[{'text':'Count fell; no causation established.','evidence_ids':['b']}]},{'paragraphs':[{'text':'Count fell, but the source does not establish causation.','evidence_ids':['b']}],'review':[]},{'supported':True,'checked_paragraphs':1}]
        with patch('server.app.model_json',new=AsyncMock(side_effect=responses))as model:
            r=self.client.post('/api/summarize',json=self.payload,headers=self.headers)
            self.assertEqual(r.status_code,200,r.text);self.assertEqual(model.await_count,3);self.assertTrue(r.json()['checked']);self.assertEqual(r.json()['processed_blocks'],1)
    def test_failed_support_check_publishes_no_summary(self):
        responses=[{'items':[{'text':'Claim.','evidence_ids':['b']}]},{'paragraphs':[{'text':'The change certainly caused improvement.','evidence_ids':['b']}],'review':[]},{'supported':False,'checked_paragraphs':1}]
        with patch('server.app.model_json',new=AsyncMock(side_effect=responses)):
            r=self.client.post('/api/summarize',json=self.payload,headers=self.headers);self.assertEqual(r.status_code,502);self.assertNotIn('paragraphs',r.json())
    def test_missing_inventory_passage_is_rejected(self):
        self.payload['chapter']['blocks'].append({'id':'c','text':'A critical qualification follows.'})
        with patch('server.app.model_json',new=AsyncMock(return_value={'items':[{'text':'Claim.','evidence_ids':['b']}]})):
            self.assertEqual(self.client.post('/api/summarize',json=self.payload,headers=self.headers).status_code,502)
    def test_large_chapter_is_rejected_without_truncation(self):
        self.payload['chapter']['blocks']=[{'id':'a','text':'a'*30000},{'id':'b','text':'b'*30000}]
        with patch('server.app.model_json',new=AsyncMock())as model:
            self.assertEqual(self.client.post('/api/summarize',json=self.payload,headers=self.headers).status_code,413);model.assert_not_awaited()
    def test_youtube_uses_an_honest_transcript_fallback(self):
        r=self.client.post('/api/import',json={'url':'https://www.youtube.com/watch?v=example'},headers=self.headers)
        self.assertEqual(r.status_code,422);self.assertIn('transcript',r.json()['detail'])
if __name__=='__main__':unittest.main()
