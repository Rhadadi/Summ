"""The Add a Book wizard can leave and resume without exposing unpublished work."""
import unittest

from fastapi.testclient import TestClient

from server import accounts
from server.app import app
from tests.test_library import RolesTest


class DraftTests(RolesTest):
    def test_resume_revision_and_private_access(self):
        owner, owner_id = self.owner()
        first = owner.post('/api/drafts', json={'state': {'step': 1, 'p': {'title': 'کتاب من'}}})
        self.assertEqual(first.status_code, 200, first.text)
        draft = first.json()
        draft_id = draft['id']
        self.assertEqual(draft['title'], 'کتاب من')
        self.assertEqual(draft['state']['step'], 1)
        self.assertEqual(owner.get('/api/drafts').json()['drafts'][0]['id'], draft_id)

        saved = owner.put('/api/drafts/' + draft_id, json={
            'state': {'step': 2, 'p': {'title': 'عنوان تازه'}}, 'base': draft['revision']})
        self.assertEqual(saved.status_code, 200, saved.text)
        self.assertNotEqual(saved.json()['revision'], draft['revision'])
        stale = owner.put('/api/drafts/' + draft_id, json={
            'state': {'step': 3}, 'base': draft['revision']})
        self.assertEqual(stale.status_code, 409)
        self.assertEqual(owner.get('/api/drafts/' + draft_id).json()['state']['p']['title'], 'عنوان تازه')

        other = TestClient(app, headers={'X-Summ-Request': '1'})
        self.addCleanup(other.close)
        self.sign_up(other, username='other', key=None, role='editor')
        for path in ('/api/drafts/' + draft_id, '/api/drafts/' + draft_id + '/source'):
            self.assertEqual(other.get(path).status_code, 404)
        self.assertEqual(other.get('/api/drafts').json(), {'drafts': []})
        self.assertEqual(other.put('/api/drafts/' + draft_id, json={'state': {}}).status_code, 404)
        self.assertEqual(other.delete('/api/drafts/' + draft_id).status_code, 404)
        self.assertEqual(self.reader().post('/api/drafts', json={'state': {}}).status_code, 403)
        anon = TestClient(app, headers={'X-Summ-Request': '1'})
        self.addCleanup(anon.close)
        self.assertEqual(anon.get('/api/drafts').status_code, 401)
        self.assertEqual(accounts.query('SELECT owner_id FROM book_drafts WHERE id=?', (draft_id,))[0][0], owner_id)

    def test_zip_cover_and_delete(self):
        owner, _ = self.owner()
        draft_id = owner.post('/api/drafts', json={'state': {}}).json()['id']
        base = '/api/drafts/' + draft_id
        self.assertEqual(owner.get(base + '/source').status_code, 404)
        self.assertEqual(owner.get(base + '/cover').status_code, 404)
        source = b'PK\x03\x04' + b'x' * 800
        uploaded = owner.put(base + '/source', content=source, headers={'Content-Type': 'application/zip'})
        self.assertEqual(uploaded.status_code, 200, uploaded.text)
        got = owner.get(base + '/source')
        self.assertEqual((got.status_code, got.content, got.headers['content-type']), (200, source, 'application/zip'))
        self.assertTrue(owner.get(base).json()['hasSource'])

        cover = b'\x89PNG' + b'x' * 700
        self.assertEqual(owner.put(base + '/cover', content=cover).status_code, 200)
        got = owner.get(base + '/cover')
        self.assertEqual((got.status_code, got.content, got.headers['content-type']), (200, cover, 'image/png'))
        self.assertTrue(owner.get(base).json()['hasCover'])
        self.assertEqual(owner.delete(base + '/cover').json(), {'ok': True})
        self.assertEqual(owner.get(base + '/cover').status_code, 404)
        self.assertFalse(owner.get(base).json()['hasCover'])

        # Reopen the database as a new process would; the source still belongs to this draft.
        if accounts._conn:
            accounts._conn.close()
            accounts._conn = None
        self.assertEqual(owner.get(base + '/source').content, source)
        self.assertEqual(owner.delete(base).json(), {'ok': True})
        self.assertEqual(owner.get(base).status_code, 404)
        self.assertEqual(owner.get(base + '/source').status_code, 404)

    def test_markdown_size_and_invalid_cover(self):
        owner, _ = self.owner()
        base = '/api/drafts/' + owner.post('/api/drafts', json={'state': {}}).json()['id']
        self.assertEqual(owner.put(base + '/source', content='خلاصه'.encode(),
                                   headers={'Content-Type': 'text/markdown'}).status_code, 200)
        self.assertIn('text/markdown', owner.get(base + '/source').headers['content-type'])
        self.assertEqual(owner.put(base + '/source', content=b'x' * (2 * 1024 * 1024 + 1),
                                   headers={'Content-Type': 'text/markdown'}).status_code, 413)
        self.assertEqual(owner.put(base + '/cover', content=b'not an image').status_code, 422)

    def test_deleting_account_erases_private_source(self):
        owner, _ = self.owner()
        draft_id = owner.post('/api/drafts', json={'state': {}}).json()['id']
        base = '/api/drafts/' + draft_id
        owner.put(base + '/source', content=b'# My summary', headers={'Content-Type': 'text/markdown'})
        self.assertEqual(owner.delete('/api/me').status_code, 200)
        self.assertEqual(accounts.query('SELECT count(*) FROM book_drafts')[0][0], 0)
        self.assertEqual(owner.get(base + '/source').status_code, 401)


if __name__ == '__main__':
    unittest.main()
