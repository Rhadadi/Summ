"""Check that editorial repair keeps every existing summary paragraph."""
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
from revise_published_books import LOVE, MIDLIFE, YALOM, revise  # noqa: E402


def book(book_id, count):
    first = 2 if book_id == MIDLIFE else 0
    chapters = [{'id': f'pdf-c{i}', 'title': {'en': f'Old {i}', 'fa': f'فصل {i}'}, 'group': 'front'} for i in range(first, first + count)]
    return {'id': book_id, 'visibility': 'public', 'doc': {'chapters': chapters, 'versions': [
        {'language': 'fa', 'label': 'Comprehensive', 'overview': {'paragraphs': [{'text': 'old'}]},
         'chapters': {c['id']: {'paragraphs': [{'text': c['id'], 'pages': [16 + i * 10]}], 'review': []} for i, c in enumerate(chapters)}}]}}


class PublishedRepairTest(unittest.TestCase):
    def test_midlife_six_real_chapters(self):
        result = revise(book(MIDLIFE, 6))['doc']
        self.assertEqual(6, sum(c['group'] == 'main' for c in result['chapters']))
        self.assertEqual(6, len(result['versions'][1]['chapters']))
        self.assertEqual('روان و خواندنی', result['versions'][0]['label'])
        self.assertEqual('A Brief History of Midlife Crisis', result['chapters'][0]['title']['en'])

    def test_love_front_matter_moves_before_six_chapters(self):
        source = book(LOVE, 7)
        result = revise(source)['doc']
        self.assertEqual('pdf-c6', result['chapters'][0]['id'])
        self.assertEqual(6, sum(c['group'] == 'main' for c in result['chapters']))
        self.assertEqual(7, len(result['versions'][1]['chapters']))

    def test_yalom_splits_existing_summary_without_loss(self):
        source = book(YALOM, 1)
        source['doc']['chapters'][0]['id'] = 'pdf-c1'
        paragraphs = [{'text': f'paragraph {i}', 'pages': [page]} for i, page in enumerate([16, 26, 46, 92, 130, 164, 214])]
        source['doc']['versions'][0]['chapters'] = {'pdf-c1': {'paragraphs': paragraphs, 'review': []}}
        result = revise(source)['doc']
        self.assertEqual(7, len(result['chapters']))
        self.assertEqual(paragraphs, [p for c in result['chapters'] for p in result['versions'][1]['chapters'][c['id']]['paragraphs']])


if __name__ == '__main__':
    unittest.main()
