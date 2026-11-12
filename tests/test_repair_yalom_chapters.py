"""Check that the live chapter repair only moves existing summary paragraphs."""
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
from repair_yalom_chapters import BOOK_ID, CHAPTERS, prepare  # noqa: E402


class YalomChapterRepairTest(unittest.TestCase):
    def test_preserves_every_paragraph_and_separates_afterword(self):
        original = [{'text': f'Section {i}', 'pages': [start]} for i, (start, _, _) in enumerate(CHAPTERS)]
        book = {'id': BOOK_ID, 'visibility': 'public', 'doc': {
            'chapters': [{'id': 'pdf-c1', 'title': {'en': 'Full book'}}],
            'versions': [{'language': 'fa', 'chapters': {'pdf-c1': {'paragraphs': original}}}],
        }}
        result = prepare(book)['doc']
        self.assertEqual(7, sum(c['group'] == 'main' for c in result['chapters']))
        self.assertEqual('back', result['chapters'][-1]['group'])
        self.assertEqual(original, [p for c in result['chapters'] for p in result['versions'][0]['chapters'][c['id']]['paragraphs']])
        self.assertEqual(book['doc']['chapters'][0]['id'], 'pdf-c1')

    def test_rejects_a_paragraph_spanning_two_chapters(self):
        book = {'id': BOOK_ID, 'visibility': 'public', 'doc': {
            'chapters': [{'id': 'pdf-c1', 'title': {'en': 'Full book'}}],
            'versions': [{'language': 'fa', 'chapters': {'pdf-c1': {
                'paragraphs': [{'text': 'Crosses', 'pages': [24, 26]}],
            }}}],
        }}
        with self.assertRaisesRegex(ValueError, 'cross a chapter boundary'):
            prepare(book)


if __name__ == '__main__':
    unittest.main()
