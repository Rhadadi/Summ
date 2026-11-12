"""Split the existing Staring at the Sun summary at its cited chapter pages.

Run once in the live app container: python - < scripts/repair_yalom_chapters.py
The original published document is backed up to /data/backups before publishing.
"""
from __future__ import annotations

import copy
import json
import time
from pathlib import Path

BOOK_ID = 'd339fdce-e08a-48be-9f0d-569e6706dd25'
CHAPTERS = [
    (16, 'The Mortal Wound', 'زخم مرگ'),
    (26, 'Recognizing Death Anxiety', 'شناخت اضطراب مرگ'),
    (46, 'The Awakening Experience', 'تجربهٔ بیدارکننده'),
    (92, 'The Power of Ideas', 'نیروی اندیشه‌ها'),
    (130, 'Overcoming Death Terror Through Connection', 'رویارویی با هراس مرگ از راه پیوند'),
    (164, 'Death Awareness: A Memoir', 'آگاهی از مرگ: خاطرات یالوم'),
    (214, 'Addressing Death Anxiety: Advice for Therapists', 'رویارویی درمانگران با اضطراب مرگ'),
    (290, 'Afterword', 'پس‌گفتار'),
]


def prepare(book: dict) -> dict:
    if book['id'] != BOOK_ID:
        raise ValueError('This repair is only for Staring at the Sun.')
    doc = copy.deepcopy(book['doc'])
    if len(doc['chapters']) != 1 or doc['chapters'][0]['id'] != 'pdf-c1':
        raise ValueError('The published chapter list has changed; inspect it before repairing.')
    doc['chapters'] = [
        {'id': f'yalom-c{i}' if i < 8 else 'yalom-afterword',
         'title': {'en': en, 'fa': fa},
         'group': 'main' if i < 8 else 'back'}
        for i, (_, en, fa) in enumerate(CHAPTERS, 1)
    ]
    for version in doc['versions']:
        original = version['chapters'].pop('pdf-c1', None)
        if original is None:
            continue
        divided = {chapter['id']: {'paragraphs': [], 'review': []} for chapter in doc['chapters']}
        for field in ('paragraphs', 'review'):
            for paragraph in original.get(field, []):
                pages = paragraph.get('pages') or []
                if not pages:
                    raise ValueError('A paragraph has no page reference; its chapter is unclear.')
                start, end = min(pages), max(pages)
                matches = [i for i, (page, _, _) in enumerate(CHAPTERS) if page <= start]
                if not matches:
                    raise ValueError(f'Page {start} precedes the first chapter.')
                i = matches[-1]
                if i + 1 < len(CHAPTERS) and end >= CHAPTERS[i + 1][0]:
                    raise ValueError(f'Pages {start}–{end} cross a chapter boundary.')
                divided[doc['chapters'][i]['id']][field].append(paragraph)
        if any(not part['paragraphs'] for part in divided.values()):
            raise ValueError('At least one chapter would have no summary text.')
        if [p for c in doc['chapters'] for p in divided[c['id']]['paragraphs']] != original['paragraphs']:
            raise ValueError('The original summary paragraph order changed.')
        version['chapters'] = divided
    return {'id': BOOK_ID, 'doc': doc, 'visibility': book['visibility']}


def main() -> None:
    from server import library

    source = library.get(BOOK_ID)
    request = library.PublishRequest.model_validate(prepare(source))
    backup_dir = Path('/data/backups')
    backup_dir.mkdir(parents=True, exist_ok=True)
    backup = backup_dir / f'staring-at-the-sun-before-chapters-{int(time.time())}.json'
    backup.write_text(json.dumps(source, ensure_ascii=False, indent=2) + '\n')
    owner_id = library.owner_of(BOOK_ID)
    if not owner_id:
        raise ValueError('Published book owner was not found.')
    result = library.publish({'id': owner_id, 'role': 'owner'}, request)
    print(f"Published {sum(c['group'] == 'main' for c in result['doc']['chapters'])} chapters and an afterword; backup: {backup}")


if __name__ == '__main__':
    main()
