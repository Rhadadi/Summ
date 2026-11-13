"""Replace search links with checked review pages for Joe Friel's fifth edition.

Run once in the live app container: python - < scripts/repair_triathlon_reception.py
The previous publication is backed up to /data/backups before the update.
"""
from __future__ import annotations

import copy
import json
import time
from pathlib import Path

BOOK_ID = '10c26d68-12b2-4074-81c0-570d44c3584e'
GOODREADS = 'https://www.goodreads.com/en/book/show/195458572-the-triathlete-s-training-bible'
TRIATHLETE = 'https://www.triathlete.com/gear/ask-a-gear-guru-what-are-the-best-triathlon-books/'
IMPACT = 'https://impactmagazine.ca/gear/gear-reviews/the-triathletes-training-bible/'
BMJ = 'https://blogs.bmj.com/bjsm/2009/10/25/book-review-triathletes-training-bible/'


def prepare(book: dict) -> dict:
    if book['id'] != BOOK_ID:
        raise ValueError('This repair is only for the published triathlon book.')
    doc = copy.deepcopy(book['doc'])
    if doc['title'].get('fa') != 'کتاب مقدس تمرینات ورزشکار سه‌گانه' or 'ویرایش پنجم' not in doc['versions'][0]['overview']['paragraphs'][1]['text']:
        raise ValueError('The title or edition has changed; inspect it before editing reviews.')
    doc['title']['en'] = "The Triathlete's Training Bible"
    doc['author'] = 'Joe Friel'
    info = doc.setdefault('info', {}) or {}
    doc['info'] = info
    info['authors'] = ['Joe Friel']
    info['year'] = '2024'
    info['publisher'] = 'VeloPress'
    info['links'] = [
        {'name': 'Goodreads · fifth edition', 'url': GOODREADS},
        {'name': 'Triathlete', 'url': TRIATHLETE},
        {'name': 'IMPACT Magazine · fourth edition', 'url': IMPACT},
        {'name': 'British Journal of Sports Medicine · third edition', 'url': BMJ},
    ]
    rating = {'value': 4.38, 'source': 'Goodreads · ویرایش پنجم', 'count': 81, 'url': GOODREADS}
    doc['review'] = {
        'verdict': 'خوانندگانِ ویرایش پنجم در گودریدز، کتاب را مرجعی مفصل و روشن برای برنامه‌ریزی تمرین می‌دانند؛ بعضی هشدار می‌دهند که برای ورزشکارِ تازه‌کار سنگین است و یکی از خوانندگان تفاوتِ آن با ویرایش پیشین را اندک یافته است. نوشته‌های مطبوعاتیِ زیر به خودِ کتاب می‌پردازند، اما دربارهٔ ویرایش‌های سوم و چهارم‌اند؛ نباید آن‌ها را نقدِ ویرایش پنجم خواند.',
        'rating': rating,
        'ratings': [rating],
        'critics': [
            {'publication': 'Triathlete', 'reviewer': '', 'date': '2025-07-10',
             'headline': 'Ask A Gear Guru: What Are The Best Triathlon Books?',
             'headlineTranslation': 'کتاب‌های پیشنهادی برای ورزش سه‌گانه',
             'stance': 'positive',
             'excerpt': 'This thing has literally everything you’d ever need to know about the sport of triathlon',
             'translation': 'این کتاب تقریباً هر آنچه را برای شناختِ ورزش سه‌گانه لازم است در بر می‌گیرد.',
             'summary': 'این نوشته کتابِ فریل را به خواننده‌ای پیشنهاد می‌کند که مرجعی جامع می‌خواهد؛ از برنامه‌ریزی فصل و تغذیه تا آمادگی ذهنی را نام می‌برد. این یک معرفیِ کوتاه در فهرستِ کتاب‌هاست، نه نقدِ اختصاصیِ ویرایش پنجم.',
             'url': TRIATHLETE, 'via': 'Direct article', 'verified': True},
            {'publication': 'IMPACT Magazine', 'reviewer': 'Kevin Langman', 'date': '2017-05',
             'headline': "The Triathlete's Training Bible: The World's Most Comprehensive Training Guide, 4th Ed.",
             'headlineTranslation': 'نقدِ ویرایش چهارمِ کتاب مقدس تمرینات ورزشکار سه‌گانه',
             'stance': 'positive',
             'excerpt': 'Although the sheer volume of knowledge in this book can feel overwhelming',
             'translation': 'حجمِ زیادِ مطالبِ کتاب ممکن است در آغاز گیج‌کننده باشد.',
             'summary': 'کوین لنگمن بخش‌بندیِ کتاب و توضیحِ روشنِ موضوعاتی مانند برنامه‌ریزی و بازیابی را می‌ستاید؛ در عین حال، حجمِ مطالب را چالشی برای خواندن می‌داند. این نقد دربارهٔ ویرایش چهارم است.',
             'url': IMPACT, 'via': 'Direct review', 'verified': True},
            {'publication': 'British Journal of Sports Medicine', 'reviewer': 'Ross Tucker', 'date': '2009-10-25',
             'headline': 'Book Review: “Triathlete’s Training Bible”',
             'headlineTranslation': 'نقدِ ویرایش سومِ کتاب مقدس تمرینات ورزشکار سه‌گانه',
             'stance': 'positive',
             'excerpt': 'The Triathlete’s Training Bible will make triathletes smarter, stronger and faster',
             'translation': 'این کتاب به ورزشکاران سه‌گانه کمک می‌کند آگاهانه‌تر و نیرومندتر تمرین کنند.',
             'summary': 'راس تاکر می‌نویسد فریل مبانی علمیِ تمرین را به توصیه‌های عملی پیوند می‌زند، بی‌آنکه خواننده را زیر بارِ اصطلاحات فنی ببرد. این نقد دربارهٔ ویرایش سوم است.',
             'url': BMJ, 'via': 'Direct review', 'verified': True},
        ],
        'readers': [
            {'name': 'Ian · Goodreads، ویرایش پنجم', 'stars': None,
             'excerpt': 'It’s not the book for a first timer since it would be information overload',
             'translation': 'برای کسی که نخستین بار سراغِ سه‌گانه می‌رود، حجمِ اطلاعاتش ممکن است زیاد باشد.',
             'summary': 'او کتاب را برای ورزشکاری که پیشینهٔ تمرین دارد، منبعی روشن و قابل رجوع می‌داند.',
             'url': GOODREADS},
            {'name': 'Lars · Goodreads، ویرایش پنجم', 'stars': None, 'excerpt': '',
             'summary': 'او خودِ کتاب را ارزشمند می‌داند، اما تغییراتِ ویرایش پنجم را برای خریدِ دوباره کافی نمی‌بیند.',
             'url': GOODREADS},
        ],
        'pros': ['گستردگیِ مطالب، از طراحیِ فصل تا بازیابی', 'پیوندِ مبانیِ علمی با تصمیم‌های عملیِ تمرین', 'ساختاری که مراجعه به موضوعِ مورد نیاز را آسان می‌کند'],
        'cons': ['حجمِ مطالب برای برخی تازه‌کاران سنگین است', 'دست‌کم یک خواننده، تفاوتِ ویرایش پنجم با ویرایش پیشین را اندک یافته است'],
        'audience': 'برای ورزشکارِ سه‌گانه‌ای که می‌خواهد برنامهٔ تمرین خود را آگاهانه بسازد و به کتابی مرجع بازگردد. خواننده‌ای که تازه با ورزش آشنا شده شاید بهتر باشد نخست با راهنمایی کوتاه‌تر آغاز کند.',
        'themes': ['برنامه‌ریزی تمرین', 'شدت و حجم', 'بازیابی', 'شنا، دوچرخه و دو'],
        'sources': info['links'],
        'model': 'editorial · checked direct sources', 'createdAt': time.time(),
    }
    return {'id': BOOK_ID, 'doc': doc, 'visibility': book['visibility']}


def main() -> None:
    from server import library

    source = library.get(BOOK_ID)
    request = library.PublishRequest.model_validate(prepare(source))
    folder = Path('/data/backups')
    folder.mkdir(parents=True, exist_ok=True)
    backup = folder / f'triathlon-before-reception-{int(time.time())}.json'
    backup.write_text(json.dumps(source, ensure_ascii=False, indent=2) + '\n')
    owner_id = library.owner_of(BOOK_ID)
    if not owner_id:
        raise ValueError('Published book owner was not found.')
    result = library.publish({'id': owner_id, 'role': 'owner'}, request)
    print(f"Published {len(result['doc']['review']['critics'])} linked articles and {len(result['doc']['review']['readers'])} linked reader views; backup: {backup}")


if __name__ == '__main__':
    main()
