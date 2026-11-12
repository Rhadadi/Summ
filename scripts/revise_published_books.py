"""Repair the three existing Persian publications without regenerating their summaries.

Usage: python scripts/revise_published_books.py INPUT.json OUTPUT.json
INPUT is the public /api/library/{id} response. OUTPUT is a PublishRequest body
for the existing book. Review the result, then publish it in the editor.
"""
from __future__ import annotations

import copy
import json
import sys
from pathlib import Path

EDITORIAL = json.loads((Path(__file__).resolve().parents[1] / 'content' / 'polished_fa.json').read_text())

MIDLIFE = '716ba82e-db2f-4cd8-8159-67357add1a17'
YALOM = 'd339fdce-e08a-48be-9f0d-569e6706dd25'
LOVE = '256e49f3-ff1e-4acc-932d-6c7910e45bca'

YALOM_CHAPTERS = [
    (16, 'The Mortal Wound', 'زخم مرگ'),
    (26, 'Recognizing Death Anxiety', 'شناخت اضطراب مرگ'),
    (46, 'The Awakening Experience', 'تجربهٔ بیدارکننده'),
    (92, 'The Power of Ideas', 'نیروی اندیشه‌ها'),
    (130, 'Overcoming Death Terror Through Connection', 'رویارویی با هراس مرگ از راه پیوند'),
    (164, 'Death Awareness: A Memoir', 'آگاهی از مرگ: خاطرات یالوم'),
    (214, 'Addressing Death Anxiety: Advice for Therapists', 'رویارویی درمانگران با اضطراب مرگ'),
]
MIDLIFE_EN = [
    'A Brief History of Midlife Crisis', 'Is That All There Is?', 'Missing Out',
    'Retrospection', 'Something to Look Forward To', 'Living in the Present',
]

LEADS = {
    MIDLIFE: 'کی‌رن سِتیا از دلِ تجربهٔ خودش می‌پرسد چرا آدمی در میانهٔ زندگی، حتی وقتی از بیرون موفق به نظر می‌رسد، گاه احساسِ کمبود می‌کند. کتاب به‌جای یک پاسخِ آماده، چند نگرانی را جداگانه بررسی می‌کند: حسرتِ راه‌های نرفته، داوری دربارهٔ گذشته، ترس از مرگ و خستگی از هدف‌هایی که یکی پس از دیگری تمام می‌شوند. پیشنهادِ اصلی او این است که در کنار هدف‌های آینده، برای کارها و رابطه‌هایی جا باز کنیم که همین حالا ارزشِ زیستن دارند.',
    YALOM: 'اروین یالوم می‌پرسد چگونه می‌توان با آگاهی از مرگ زندگی کرد، بی‌آنکه این آگاهی ما را فلج کند. او با داستانِ مراجعان، خاطراتِ شخصی و اندیشه‌های فلسفی نشان می‌دهد ترس از مرگ گاهی آشکار است و گاهی پشتِ نگرانی‌های دیگر پنهان می‌شود. به باور او، گفت‌وگویی صادقانه دربارهٔ این ترس می‌تواند راه را برای رابطه‌های نزدیک‌تر و زندگیِ آگاهانه‌تر باز کند.',
    LOVE: 'استیون میچل می‌پرسد آیا شورِ عاشقانه می‌تواند در رابطه‌ای دیرپا زنده بماند. پاسخِ او ساده و تضمینی نیست: صمیمیت به‌خودیِ خود اشتیاق را از میان نمی‌برد، اما کوشش برای آنکه دیگری همیشه آشنا، امن و پیش‌بینی‌پذیر بماند می‌تواند از شورِ رابطه بکاهد. میچل از خلالِ داستان‌های درمانی و تأمل در عشق، میل، خشم و تعهد، نشان می‌دهد دو نفر چگونه در ساختنِ رابطهٔ خود سهم دارند.',
}
CONTEXT = {
    MIDLIFE: [
        ('در این کتاب چه می‌خوانیم؟', 'شش فصلِ کتاب از تاریخِ تعبیرِ «بحران میانسالی» آغاز می‌شوند و به ارزشِ کارها، زندگی‌های نزیسته، پشیمانی، مرگ و زیستن در زمانِ حال می‌رسند. سِتیا میان احساس‌های شبیه به هم فرق می‌گذارد تا هر کدام را با دلیل‌های خودش بررسی کند.'),
        ('برای چه کسی؟', 'برای خواننده‌ای که می‌خواهد دربارهٔ انتخاب‌های گذشته و معنای زندگیِ اکنون دقیق‌تر بیندیشد. کتاب جستاری فلسفی است؛ از تجربهٔ شخصی، ادبیات و پژوهش‌ها کمک می‌گیرد، اما دستورالعملِ درمانی یا وعدهٔ رهاییِ همیشگی از بحران نمی‌دهد.'),
        ('دربارهٔ نویسنده', 'کی‌رن سِتیا استاد فلسفه در مؤسسهٔ فناوری ماساچوست است. او در این کتاب پرسش‌های آشنای میانسالی را با ابزارهای فلسفهٔ اخلاق و فلسفهٔ زمان بررسی می‌کند.'),
    ],
    YALOM: [
        ('در این کتاب چه می‌خوانیم؟', 'هفت فصل از شناختِ ترس از مرگ آغاز می‌کنند؛ سپس به لحظه‌های بیدارکننده، یاریِ اندیشه‌های فلسفی، نقشِ پیوند با دیگران و تجربهٔ شخصیِ یالوم می‌رسند. فصلِ پایانی برای درمانگرانی است که می‌خواهند با این موضوع در اتاق درمان روبه‌رو شوند.'),
        ('برای چه کسی؟', 'برای خواننده‌ای که پرسشِ مرگ و معنای زندگی را جدی می‌گیرد و برای درمانگری که می‌خواهد با این اضطراب با دقت و همدلی کار کند. نمونه‌های کتاب روایت‌های بالینی‌اند؛ جای ارزیابیِ فردی یا پژوهشِ آزمایشی را نمی‌گیرند.'),
        ('دربارهٔ نویسنده', 'اروین د. یالوم روان‌پزشک و نویسندهٔ آمریکایی است که سال‌ها دربارهٔ روان‌درمانیِ وجودی نوشته است. در این اثر، تجربهٔ حرفه‌ای و زندگیِ شخصی‌اش را کنار هم می‌گذارد.'),
    ],
    LOVE: [
        ('در این کتاب چه می‌خوانیم؟', 'شش فصل به کشمکشِ امنیت و ماجراجویی، میلِ جنسی، خیال‌پردازی، خشم، احساسِ گناه و سرانجام تعهد می‌پردازند. میچل نشان می‌دهد این تجربه‌ها در یک رابطه از هم جدا نیستند و هر دو نفر در شکل‌گیریِ آن‌ها نقش دارند.'),
        ('برای چه کسی؟', 'برای خواننده‌ای که می‌خواهد دربارهٔ دوامِ عشق و دشواری‌های صمیمیت فکر کند. کتاب از تجربه‌های درمانی و نظریهٔ روان‌کاوی کمک می‌گیرد؛ نسخه‌ای یکسان برای همهٔ رابطه‌ها یا دلیلی برای ماندن در هر رابطه‌ای نیست.'),
        ('دربارهٔ نویسنده', 'استیون ا. میچل روان‌کاو آمریکایی و از چهره‌های برجستهٔ روان‌کاویِ رابطه‌ای بود. او در این کتاب می‌کوشد عشقِ پایدار را با پذیرشِ تغییر، آسیب‌پذیری و آزادیِ هر دو نفر بفهمد.'),
    ],
}

def revise(book: dict) -> dict:
    book_id = book['id']
    if book_id not in LEADS:
        raise ValueError('This repair is only for the three reviewed publications.')
    doc = copy.deepcopy(book['doc'])
    for version in doc['versions']:
        if version['language'] != 'fa':
            continue
        overview = version.get('overview')
        if overview and overview['paragraphs']:
            existing = overview['paragraphs']
            if existing[0]['text'] != LEADS[book_id]:
                existing[0] = {'text': LEADS[book_id], 'pages': [], 'chapters': []}
            existing_headings = {p.get('heading') for p in existing}
            for heading, body in CONTEXT[book_id]:
                if heading not in existing_headings:
                    existing.append({'heading': heading, 'text': body, 'pages': [], 'chapters': []})
    if book_id == MIDLIFE:
        if len(doc['chapters']) != 6:
            raise ValueError('Midlife chapter count changed; inspect before repairing.')
        for chapter, english in zip(doc['chapters'], MIDLIFE_EN):
            chapter['group'] = 'main'
            chapter['title']['en'] = english
    elif book_id == LOVE:
        if len(doc['chapters']) != 7:
            raise ValueError('Can Love Last? chapter count changed; inspect before repairing.')
        for chapter in doc['chapters']:
            chapter['group'] = 'front' if chapter['id'] == 'pdf-c6' else 'main'
        doc['chapters'].sort(key=lambda c: c['group'] != 'front')
    else:
        if len(doc['chapters']) != 1 or doc['chapters'][0]['id'] != 'pdf-c1':
            raise ValueError('Staring at the Sun has changed; inspect before repairing.')
        chapter_id = 'pdf-c1'
        doc['chapters'] = [
            {'id': f'yalom-c{i}', 'title': {'en': en, 'fa': fa}, 'group': 'main'}
            for i, (_, en, fa) in enumerate(YALOM_CHAPTERS, 1)
        ]
        for version in doc['versions']:
            original = version['chapters'].pop(chapter_id, None)
            if not original:
                continue
            pieces = {c['id']: {'paragraphs': [], 'review': []} for c in doc['chapters']}
            for kind in ('paragraphs', 'review'):
                for paragraph in original.get(kind, []):
                    pages = paragraph.get('pages') or []
                    if not pages:
                        raise ValueError('A Yalom paragraph has no page reference; cannot place it safely.')
                    page = min(pages)
                    index = max(i for i, (start, _, _) in enumerate(YALOM_CHAPTERS) if page >= start)
                    pieces[doc['chapters'][index]['id']][kind].append(paragraph)
            if any(not part['paragraphs'] for part in pieces.values()):
                raise ValueError('At least one Yalom chapter would be empty.')
            version['chapters'] = pieces
    polished = EDITORIAL[book_id]
    known = {c['id'] for c in doc['chapters']}
    if set(polished['chapters']) != {c for c in known if c != 'pdf-c6' or book_id != LOVE}:
        raise ValueError('The polished chapter list does not match this publication.')
    for version in doc['versions']:
        if version['language'] == 'fa' and version['label'] in ('Comprehensive', 'Detailed'):
            version['label'] = 'نسخهٔ کامل'
    doc['versions'].insert(0, {
        'language': 'fa', 'type': 'literary', 'label': 'روان و خواندنی',
        'model': 'editorial', 'createdAt': 0,
        'overview': {
            'paragraphs': [{'text': text, 'pages': [], 'chapters': []} for text in polished['overview']],
            'takeaways': [{'text': text, 'pages': [], 'chapters': []} for text in polished['takeaways']],
        },
        'chapters': {
            chapter: {'paragraphs': [{'text': text, 'pages': [], 'chapters': []} for text in paragraphs], 'review': []}
            for chapter, paragraphs in polished['chapters'].items()
        },
    })
    return {'id': book_id, 'doc': doc, 'visibility': book['visibility']}

def main() -> None:
    if len(sys.argv) != 3:
        raise SystemExit(__doc__)
    source, target = map(Path, sys.argv[1:])
    book = json.loads(source.read_text())
    result = revise(book)
    target.write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n')
    print(f"Prepared {book['title']}: {len(result['doc']['chapters'])} chapters -> {target}")

if __name__ == '__main__':
    main()
