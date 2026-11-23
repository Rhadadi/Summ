from fastapi.testclient import TestClient

from server import accounts
from server.app import app
from tests.test_library import RolesTest


def mark(i='abcdefgh01', **over):
    base = {'id': i, 'updated': 1000.0, 'book': 'b1', 'slug': 'a-book', 'bookTitle': 'A Book', 'chapter': 'c1',
            'chapterTitle': 'First', 'lang': 'fa', 'quote': 'امنیت و ماجراجویی', 'prefix': 'پرسش: ', 'suffix': ' دو نیاز',
            'color': 'yellow', 'note': 'یادداشت محرمانهٔ من', 'created': 1000.0}
    base.update(over)
    return base


class MarksTests(RolesTest):
    def test_marks_are_private_encrypted_merged_and_removed_with_the_account(self):
        owner, uid = self.owner()
        anon = TestClient(app, headers={'X-Summ-Request': '1'})
        self.addCleanup(anon.close)
        self.assertEqual(anon.get('/api/marks').status_code, 401)
        self.assertEqual(anon.post('/api/marks', json={'marks': [mark()]}).status_code, 401)

        self.assertEqual(owner.post('/api/marks', json={'marks': [mark()]}).json(), {'taken': 1})
        # encrypted at rest: neither the comment nor the passage is in the database in the clear
        raw = accounts.query('SELECT secret FROM marks WHERE user_id=?', (uid,))[0][0]
        self.assertNotIn('محرمانه'.encode(), raw)
        self.assertNotIn('ماجراجویی'.encode(), raw)

        got = owner.get('/api/marks').json()
        self.assertEqual(len(got['marks']), 1)
        self.assertEqual(got['marks'][0]['note'], 'یادداشت محرمانهٔ من')
        self.assertEqual(got['marks'][0]['quote'], 'امنیت و ماجراجویی')

        # an older edit from another device does not overwrite a newer one
        self.assertEqual(owner.post('/api/marks', json={'marks': [mark(updated=900.0, note='old')]}).json(), {'taken': 0})
        self.assertEqual(owner.post('/api/marks', json={'marks': [mark(updated=1100.0, color='green')]}).json(), {'taken': 1})
        after = got['now']
        newer = owner.get('/api/marks', params={'since': after}).json()['marks']
        self.assertEqual([m['color'] for m in newer], ['green'])

        # a deletion travels as a tombstone and its content is dropped
        owner.post('/api/marks', json={'marks': [{'id': 'abcdefgh01', 'updated': 1200.0, 'deleted': True}]})
        self.assertEqual(owner.get('/api/marks').json()['marks'], [{'id': 'abcdefgh01', 'updated': 1200.0, 'deleted': True}])
        self.assertIsNone(accounts.query('SELECT secret FROM marks WHERE user_id=?', (uid,))[0][0])

        # another account sees nothing of it
        other = self.reader('someone')
        other.post('/api/marks', json={'marks': [mark('zzzzzzzz01')]})
        self.assertEqual([m['id'] for m in other.get('/api/marks').json()['marks']], ['zzzzzzzz01'])
        self.assertEqual([m['id'] for m in owner.get('/api/marks').json()['marks']], ['abcdefgh01'])

        # deleting the account deletes its marks
        self.assertEqual(owner.delete('/api/me').status_code, 200)
        self.assertEqual(accounts.query('SELECT COUNT(*) FROM marks WHERE user_id=?', (uid,))[0][0], 0)

    def test_bad_marks_are_refused(self):
        owner, _ = self.owner()
        for bad in [mark(id='BAD'), mark(color='red'), mark(note='x' * 20_001), {**mark(), 'extra': 1}]:
            self.assertEqual(owner.post('/api/marks', json={'marks': [bad]}).status_code, 422, bad.get('id'))
