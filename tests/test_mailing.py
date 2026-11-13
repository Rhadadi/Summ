import asyncio,os,time
from unittest.mock import AsyncMock,patch
from fastapi.testclient import TestClient
from server import accounts,library,mailing
from server.app import app
from tests.test_library import RolesTest,doc
from tests.test_server import ServerTest
class MailingTests(RolesTest):
    def setUp(self):
        super().setUp();self.mail=patch('server.mailer.deliver',new=AsyncMock());self.sent=self.mail.start();self.cfg=patch('server.mailer.configured',return_value=True);self.cfg.start()
        self.anon=TestClient(app,headers={'X-Summ-Request':'1'});self.addCleanup(self.anon.close)
    def tearDown(self):self.cfg.stop();self.mail.stop();super().tearDown()
    def publish(self,c,**over):return c.post('/api/library',json={'doc':doc(**over),'visibility':'public'}).json()
    def test_anyone_can_ask_for_a_book_and_only_the_owner_reads_the_list(self):
        self.assertEqual(self.anon.post('/api/requests',json={'title':'The Odyssey','author':'Homer','note':'please','email':'fan@example.com'}).status_code,200)
        self.assertEqual(self.anon.get('/api/requests').status_code,401)
        self.assertEqual(self.reader().get('/api/requests').status_code,403)
        owner,_=self.owner();rows=owner.get('/api/requests').json()['requests']
        self.assertEqual([r['title'] for r in rows],['The Odyssey']);self.assertEqual(rows[0]['email'],'fan@example.com')
    def test_a_robot_filling_the_hidden_field_stores_nothing(self):
        self.anon.post('/api/requests',json={'title':'Spam','website':'http://x'});self.assertEqual(mailing.requests_list(),[])
    def test_bad_email_in_a_request_is_refused(self):
        self.assertEqual(self.anon.post('/api/requests',json={'title':'Dune','email':'nope'}).status_code,422)
    def test_marking_a_request_done_tells_the_person_who_asked(self):
        owner,_=self.owner();book=self.publish(owner);self.anon.post('/api/requests',json={'title':'A Test Book','email':'fan@example.com'})
        rid=mailing.requests_list()[0]['id']
        self.assertEqual(owner.put('/api/requests/'+str(rid),json={'status':'done','book_id':book['id']}).json()['told'],True)
        self.assertEqual(self.sent.await_args.args[0],'fan@example.com')
        owner.put('/api/requests/'+str(rid),json={'status':'done','book_id':book['id']});self.assertEqual(self.sent.await_count,1)  # told only once
    def test_a_plain_address_must_confirm_before_it_is_on_the_list(self):
        r=self.anon.post('/api/mailing/subscribe',json={'email':'Reader@Example.com','lang':'fa'});self.assertEqual(r.json()['status'],'pending')
        token=accounts.query('SELECT token FROM subscribers')[0][0];self.assertEqual(mailing.overview()['active'],0)
        self.assertEqual(self.anon.post('/api/mailing/confirm/'+token).json()['email'],'reader@example.com');self.assertEqual(mailing.overview()['active'],1)
        self.assertEqual(self.anon.post('/api/mailing/confirm/nope').status_code,404)
        self.assertEqual(self.anon.post('/api/mailing/unsubscribe/'+token).status_code,200);self.assertEqual(mailing.overview()['active'],0)
    def test_a_signed_in_account_joins_at_once_and_can_leave(self):
        owner,_=self.owner('owner@example.com');self.assertEqual(owner.get('/api/mailing/me').json()['status'],'none')
        self.assertEqual(owner.post('/api/mailing/subscribe',json={}).json()['status'],'active');self.assertEqual(owner.get('/api/mailing/me').json()['status'],'active')
        self.assertEqual(owner.delete('/api/mailing/me').json()['status'],'unsubscribed');self.assertEqual(owner.get('/api/mailing/me').json()['status'],'unsubscribed')
    def test_a_stranger_cannot_use_another_account_address_to_skip_confirmation(self):
        self.anon.post('/api/mailing/subscribe',json={'email':'someone@example.com'});self.assertEqual(mailing.overview()['active'],0)
    def test_announcing_reaches_only_active_subscribers_and_only_once(self):
        owner,_=self.owner();book=self.publish(owner)
        for e in ('a@example.com','b@example.com'):self.anon.post('/api/mailing/subscribe',json={'email':e})
        accounts.query("UPDATE subscribers SET status='active' WHERE email='a@example.com'")
        with patch('server.mailing.asyncio.sleep',new=AsyncMock()):
            first=asyncio.run(mailing.announce(book['id']))
            self.assertEqual(first,{'sent':1,'failed':0});again=self.sent.await_args
            with self.assertRaises(accounts.AccountError):asyncio.run(mailing.announce(book['id']))
        self.assertEqual(again.args[0],'a@example.com');self.assertIn('List-Unsubscribe-Post',again.args[4]);self.assertIn('/api/mailing/unsubscribe/',again.args[4]['List-Unsubscribe'])
    def test_books_that_existed_before_the_list_are_never_announced(self):
        owner,_=self.owner();book=self.publish(owner)
        accounts.query('DELETE FROM announced');accounts.query("DELETE FROM mailing_meta")
        accounts._db().executescript(mailing.SCHEMA);self.assertTrue(accounts.query('SELECT 1 FROM announced WHERE book_id=?',(book['id'],)))
    def test_test_send_goes_only_to_the_owner(self):
        owner,_=self.owner();book=self.publish(owner);self.anon.post('/api/mailing/subscribe',json={'email':'x@example.com'})
        with patch('server.mailing.asyncio.sleep',new=AsyncMock()):r=owner.post('/api/mailing/announce/'+book['id'],json={})
        self.assertEqual(r.json()['sent'],1);self.assertEqual(self.sent.await_args.args[0],'owner@example.com');self.assertFalse(accounts.query('SELECT 1 FROM announced WHERE book_id=?',(book['id'],)))
    def test_the_email_reads_right_to_left_in_persian_and_never_names_the_sender(self):
        owner,_=self.owner();book=library.get(self.publish(owner)['id'])
        subject,text,page=mailing.compose_book(book,'fa','https://x/u');self.assertIn('dir="rtl"',page);self.assertIn('لغو عضویت',page);self.assertIn('A Test Book',subject+page)
        subject,text,page=mailing.compose_book(book,'en','https://x/u');self.assertIn('dir="ltr"',page);self.assertIn('Keep qualifications.',page);self.assertNotIn('rhadadi',page)
