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
    title=titles.get(lang) or book['title'];author=((book.get('authorNames') or {}).get(lang) or book.get('author') or '').strip()
    fa=lang=='fa'
    heading=title+(f' — {"نوشتهٔ " if fa else "by "}{author}' if author else '')
    desc=_excerpt(doc,lang) or ('خلاصهٔ این کتاب را در چند دقیقه بخوانید یا بشنوید.' if fa else 'Read or listen to this book’s summary in minutes.')
    url=f"{site}/b/{quote(book['slug'])}";e=lambda s:html.escape(s,quote=True)
    tags=[f'<title>{e(heading)} · {"اینک لینگ" if fa else "Inkling"}</title>',f'<meta name="description" content="{e(desc)}"/>',f'<link rel="canonical" href="{e(url)}"/>',
          '<meta property="og:type" content="book"/>',f'<meta property="og:site_name" content="{"اینک لینگ" if fa else "Inkling"}"/>',
          f'<meta property="og:title" content="{e(heading)}"/>',f'<meta property="og:description" content="{e(desc)}"/>',f'<meta property="og:url" content="{e(url)}"/>',
          f'<meta property="og:locale" content="{"fa_IR" if fa else "en_US"}"/>',f'<meta name="twitter:title" content="{e(heading)}"/>',f'<meta name="twitter:description" content="{e(desc)}"/>']
    if author:tags.append(f'<meta property="book:author" content="{e(author)}"/>')
    if book.get('cover'):
        img=f"{site}/api/library/{book['id']}/share.jpg?v={int(book.get('updated') or 0)}"
        tags+=[f'<meta property="og:image" content="{e(img)}"/>','<meta property="og:image:width" content="1200"/>','<meta property="og:image:height" content="630"/>','<meta property="og:image:type" content="image/jpeg"/>',f'<meta property="og:image:alt" content="{e(title)}"/>','<meta name="twitter:card" content="summary_large_image"/>',f'<meta name="twitter:image" content="{e(img)}"/>']
    else:tags.append('<meta name="twitter:card" content="summary"/>')
    return '\n'.join(tags),lang

def page(index:str,book:dict|None,site:str)->str:
    """The app's index.html for a /b/ path: asset links made absolute (the page is one level down), and the book's tags
    in place of the site's generic title and description."""
    out=re.sub(r'(src|href)="\./',r'\1="/',index)
    if not book:return out
    tags,lang=meta(book,site)
    out=re.sub(r'<title>.*?</title>','',out,count=1,flags=re.S)
    out=re.sub(r'<meta name="description"[^>]*>','',out,count=1)
    out=out.replace('<html lang="en"',f'<html lang="{lang}"',1)
    return out.replace('</head>',tags+'</head>',1)

def card_image(cover:bytes,cache_dir,key:str)->bytes:
    """A 1200x630 preview picture (the size Telegram, WhatsApp and X show wide): the whole cover, centred, on a blurred
    and darkened copy of itself. A tall cover alone gets cropped to a strip of its middle."""
    from pathlib import Path
    path=Path(cache_dir)/(re.sub(r'[^\w.-]','',key)+'.jpg')
    if path.exists():return path.read_bytes()
    import io
    from PIL import Image,ImageFilter,ImageEnhance
    W,H=1200,630
    src=Image.open(io.BytesIO(cover)).convert('RGB')
    scale=max(W/src.width,H/src.height);bg=src.resize((max(W,int(src.width*scale)),max(H,int(src.height*scale))))
    left,top=(bg.width-W)//2,(bg.height-H)//2;bg=bg.crop((left,top,left+W,top+H)).filter(ImageFilter.GaussianBlur(28))
    bg=ImageEnhance.Brightness(bg).enhance(.55)
    h=540;w=max(1,int(src.width*h/src.height))
    if w>1000:w=1000;h=int(src.height*w/src.width)
    fg=src.resize((w,h),Image.LANCZOS)
    shadow=Image.new('RGBA',(w+80,h+80),(0,0,0,0));shadow.paste((0,0,0,150),(40,48,40+w,48+h))
    shadow=shadow.filter(ImageFilter.GaussianBlur(18))
    x,y=(W-w)//2,(H-h)//2
    bg.paste(shadow,(x-40,y-40),shadow);bg.paste(fg,(x,y))
    out=io.BytesIO();bg.save(out,'JPEG',quality=86,optimize=True,progressive=True);data=out.getvalue()
    try:path.parent.mkdir(parents=True,exist_ok=True);path.write_bytes(data)
    except OSError:pass
    return data


# ---- the site itself: what a shared link to the home page (or any page that is not a book) shows
SITE_TITLE='اینک لینگ — خلاصهٔ کتاب‌های خواندنی'

def site_meta(site:str,books:int,version:int)->str:
    desc='خلاصه‌هایی کوتاه و خوش‌نوشت، برای خواندن یا شنیدن در چند دقیقه.'
    img=f'{site}/api/site/share.jpg?v=5-{version}';e=lambda s:html.escape(s,quote=True)
    return '\n'.join([f'<title>{e(SITE_TITLE)}</title>',f'<meta name="description" content="{e(desc)}"/>',f'<link rel="canonical" href="{e(site)}/"/>',
        '<meta property="og:type" content="website"/>','<meta property="og:site_name" content="اینک لینگ"/>',
        f'<meta property="og:title" content="{e(SITE_TITLE)}"/>',f'<meta property="og:description" content="{e(desc)}"/>',f'<meta property="og:url" content="{e(site)}/"/>',
        '<meta property="og:locale" content="fa_IR"/>',
        f'<meta property="og:image" content="{e(img)}"/>','<meta property="og:image:width" content="1200"/>','<meta property="og:image:height" content="630"/>',
        '<meta property="og:image:type" content="image/jpeg"/>','<meta property="og:image:alt" content="اینک لینگ: خلاصهٔ کتاب‌های خواندنی"/>',
        '<meta name="twitter:card" content="summary_large_image"/>',f'<meta name="twitter:title" content="{e(SITE_TITLE)}"/>',
        f'<meta name="twitter:description" content="{e(desc)}"/>',f'<meta name="twitter:image" content="{e(img)}"/>'])

def site_page(index:str,site:str,books:int,version:int)->str:
    """The app's index.html for every address that is not a book: absolute asset links (the address may be deep, like
    /library/c/psychology) and the site's own preview."""
    out=re.sub(r'(src|href)="\./',r'\1="/',index)
    out=re.sub(r'<title>.*?</title>','',out,count=1,flags=re.S)
    out=re.sub(r'<meta name="description"[^>]*>','',out,count=1)
    out=out.replace('<html lang="en"','<html lang="fa" dir="rtl"',1)
    return out.replace('</head>',site_meta(site,books,version)+'</head>',1)

def site_card(covers:list[bytes],icon:bytes|None,cache_dir,key:str)->bytes:
    """The site's 1200x630 preview: name, promise and a fan of the latest covers, on the reader's deep teal."""
    from pathlib import Path
    path=Path(cache_dir)/(re.sub(r'[^\w.-]','',key)+'.jpg')
    if path.exists():return path.read_bytes()
    import io
    from PIL import Image,ImageDraw,ImageFilter,ImageFont
    W,H=1200,630
    fonts=Path(__file__).parent/'fonts'
    def font(name:str,size:int):
        try:return ImageFont.truetype(str(fonts/name),size,layout_engine=ImageFont.Layout.RAQM)
        except Exception:return ImageFont.truetype(str(fonts/name),size)
    # background: a soft diagonal from the reader's dark teal to the brand teal
    bg=Image.new('RGB',(W,H),(23,49,54));glow=Image.new('L',(W,H),0)
    ImageDraw.Draw(glow).ellipse((-300,-200,700,800),fill=255);glow=glow.filter(ImageFilter.GaussianBlur(160))
    bg.paste(Image.new('RGB',(W,H),(37,102,115)),(0,0),glow.point(lambda v:int(v*.75)))
    # the covers, fanned on the left
    shown=[]
    for raw in covers[:5]:
        try:shown.append(Image.open(io.BytesIO(raw)).convert('RGB'))
        except Exception:continue
    if shown:
        h=330;n=len(shown);angles=[-9,-4.5,0,4.5,9][(5-n)//2:(5-n)//2+n] if n>1 else [0]
        step=78;cx=310;base=(H-h)//2+18
        order=sorted(range(n),key=lambda i:-abs(i-(n-1)/2))  # the middle cover on top
        for i in order:
            src=shown[i];w=max(1,int(src.width*h/src.height));w=min(w,260)
            card=Image.new('RGBA',(w+60,h+60),(0,0,0,0));sh=Image.new('RGBA',(w+60,h+60),(0,0,0,0))
            ImageDraw.Draw(sh).rectangle((30,38,30+w,38+h),fill=(0,0,0,170));sh=sh.filter(ImageFilter.GaussianBlur(14))
            card.alpha_composite(sh);card.paste(src.resize((w,h),Image.LANCZOS),(30,30))
            card=card.rotate(-angles[i],resample=Image.BICUBIC,expand=True)
            x=int(cx+(i-(n-1)/2)*step-card.width/2);y=int(base-30+abs(i-(n-1)/2)*10)
            bg.paste(card,(x,y),card)
    # the words, right-aligned (Persian first)
    d=ImageDraw.Draw(bg);right=W-70;cream=(255,248,236);sand=(231,216,185);mist=(178,201,201)
    def say(text,y,f,fill,rtl=True):
        try:d.text((right,y),text,font=f,fill=fill,anchor='ra',direction='rtl' if rtl else None,language='fa' if rtl else None)
        except Exception:d.text((right,y),text,font=f,fill=fill,anchor='ra')
    top=118
    if icon:
        try:
            ic=Image.open(io.BytesIO(icon)).convert('RGBA').resize((92,92),Image.LANCZOS)
            m=Image.new('L',(92,92),0);ImageDraw.Draw(m).rounded_rectangle((0,0,91,91),22,fill=255)
            bg.paste(ic,(right-92,top-12),m);top+=100
        except Exception:pass
    say('اینک لینگ',top,font('Vazirmatn-700.ttf',84),cream)
    say('خلاصهٔ کتاب‌های خواندنی',top+128,font('Vazirmatn-600.ttf',40),sand)
    small=font('Vazirmatn-400.ttf',27)
    say('کوتاه و خوش‌نوشت، برای خواندن و شنیدن',top+194,small,mist)
    say('در چند دقیقه',top+236,small,mist)
    out=io.BytesIO();bg.save(out,'JPEG',quality=88,optimize=True,progressive=True);data=out.getvalue()
    try:path.parent.mkdir(parents=True,exist_ok=True);path.write_bytes(data)
    except OSError:pass
    return data
