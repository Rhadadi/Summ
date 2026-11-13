"""The reception repair must keep the imported book text and target direct pages."""
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
from repair_triathlon_reception import BOOK_ID, prepare  # noqa: E402


class TriathlonReceptionRepairTest(unittest.TestCase):
    def test_direct_reviews_leave_chapters_untouched(self):
        book = {'id': BOOK_ID, 'visibility': 'public', 'doc': {
            'title': {'fa': 'کتاب مقدس تمرینات ورزشکار سه‌گانه'}, 'author': '',
            'chapters': [{'id': 'z0', 'title': {'fa': 'آمادگی ذهنی'}}],
            'versions': [{'overview': {'paragraphs': [{'text': 'مقدمه'}, {'text': 'ویرایش پنجم'}]},
                          'chapters': {'z0': {'paragraphs': [{'text': 'خلاصه'}]}}}],
            'info': {'links': [{'name': 'Search', 'url': 'https://www.goodreads.com/search?q=book'}]},
        }}
        changed = prepare(book)['doc']
        self.assertEqual(changed['chapters'], book['doc']['chapters'])
        self.assertEqual(changed['versions'], book['doc']['versions'])
        self.assertEqual(changed['author'], 'Joe Friel')
        self.assertTrue(all('/search' not in s['url'] for s in changed['review']['sources']))
        self.assertTrue(all(c['url'] for c in changed['review']['critics']))


if __name__ == '__main__':
    unittest.main()
