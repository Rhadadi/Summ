"""Link previews. Telegram, WhatsApp and the rest read only the HTML a link returns and never see what follows a #, so a
shared book needs a real path: /b/<slug> answers with the reader app plus the book's title, summary and cover."""
from __future__ import annotations
import html,re
from urllib.parse import quote
from .library import strip_inline,_blurb

def _excerpt(doc:dict,lang:str)->str:
    """The opening of the overview in the language the title is shown in, about two sentences."""
    for v in sorted(doc.get('versions') or [],key=lambda v:v.get('language')!=lang):
        paras=(v.get('overview') or {}).get('paragraphs') or []
        if paras:
            text=' '.join(strip_inline(paras[0]['text']).split())
            if len(text)<=260:return text
            cut=text[:260];end=max(cut.rfind('. '),cut.rfind('؟ '),cut.rfind('! '))
            return cut[:end+1] if end>120 else cut[:cut.rfind(' ')]+'…'
    return _blurb(doc)

def meta(book:dict,site:str)->tuple[str,str]:
    """(<head> tags, page language) for one published book."""
    doc=book.get('doc') or {};titles=book.get('titles') or {}
    lang='fa' if titles.get('fa') else (doc.get('originalLanguage') or 'en')
    title=titles.get(lang) or book['title'];author=(book.get('author') or '').strip()
    fa=lang=='fa'
    heading=title+(f' — {"نوشتهٔ " if fa else "by "}{author}' if author else '')
    desc=_excerpt(doc,lang) or ('خلاصهٔ این کتاب را در چند دقیقه بخوانید یا بشنوید.' if fa else 'Read or listen to this book’s summary in minutes.')
    url=f"{site}/b/{quote(book['slug'])}";e=lambda s:html.escape(s,quote=True)
    tags=[f'<title>{e(heading)} · {"اینکلینگ" if fa else "Inkling"}</title>',f'<meta name="description" content="{e(desc)}"/>',f'<link rel="canonical" href="{e(url)}"/>',
          '<meta property="og:type" content="book"/>',f'<meta property="og:site_name" content="{"اینکلینگ · Inkling" if fa else "Inkling"}"/>',
          f'<meta property="og:title" content="{e(heading)}"/>',f'<meta property="og:description" content="{e(desc)}"/>',f'<meta property="og:url" content="{e(url)}"/>',
          f'<meta property="og:locale" content="{"fa_IR" if fa else "en_US"}"/>',f'<meta name="twitter:title" content="{e(heading)}"/>',f'<meta name="twitter:description" content="{e(desc)}"/>']
    if author:tags.append(f'<meta property="book:author" content="{e(author)}"/>')
    if book.get('cover'):
        img=site+book['cover']
        tags+=[f'<meta property="og:image" content="{e(img)}"/>',f'<meta property="og:image:alt" content="{e(title)}"/>','<meta name="twitter:card" content="summary_large_image"/>',f'<meta name="twitter:image" content="{e(img)}"/>']
    else:tags.append('<meta name="twitter:card" content="summary"/>')
    return '\n'.join(tags),lang

def page(index:str,book:dict|None,site:str)->str:
    """The app's index.html for a /b/ path: asset links made absolute (the page is one level down), and the book's tags
    in place of the site's generic title and description."""
    out=index.replace('"./assets/','"/assets/').replace('"./favicon','"/favicon')
    if not book:return out
    tags,lang=meta(book,site)
    out=re.sub(r'<title>.*?</title>','',out,count=1,flags=re.S)
    out=re.sub(r'<meta name="description"[^>]*>','',out,count=1)
    out=out.replace('<html lang="en"',f'<html lang="{lang}"',1)
    return out.replace('</head>',tags+'</head>',1)
