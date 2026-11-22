"""Books to read next, with covers: other books of this library, the picks of the research step topped up by a model call
to about eight well-known, well-rated companions, and other works by the same author; each checked on Open Library (or
Google Books) for a real edition, cover and rating, best rated first. Loose subject searches were dropped: Open Library's
broad shelves put memoirs like "Born a Crime" next to a study of the Quran."""
from __future__ import annotations
import asyncio,json,os,re,time
from pathlib import Path
import httpx

HEADERS={'User-Agent':'InklingReader/0.4 (https://booksumm.duckdns.org; book suggestions)'}
FIELDS='key,title,author_name,first_publish_year,cover_i,ratings_average,ratings_count,subject'
def _norm(t:str)->str:return re.sub(r'[^a-z0-9؀-ۿ]+',' ',(t or '').lower()).strip()
def _short(t:str)->str:return _norm(t.split(':')[0])
def _subjects(categories:list[str])->list[str]:
    seen:list[str]=[]
    for c in categories:
        for part in re.split(r'[/&,]',c):
            part=part.strip()
            if 3<len(part)<30 and part.lower() not in ('general','nonfiction','non-fiction','fiction','book','books') and part.lower() not in [s.lower() for s in seen]:seen.append(part)
    return seen[:3]
def _card(d:dict,why:str='',source:str='')->dict|None:
    if not d.get('title'):return None
    cover=d.get('cover_i')
    return {'title':d['title'],'author':', '.join(dict.fromkeys((d.get('author_name') or [])[:3]))[:80],'year':str(d.get('first_publish_year') or ''),
            'cover':f'https://covers.openlibrary.org/b/id/{cover}-M.jpg' if cover else None,'url':'https://openlibrary.org'+d['key'] if d.get('key') else None,
            'rating':round(d['ratings_average'],1) if d.get('ratings_average') else None,'count':d.get('ratings_count') or 0,'why':why[:300],'source':source,'reason':{'recommended':'pick','same author':'author'}.get(source,'subject'),'subject':''}
async def _search(client:httpx.AsyncClient,**params)->list[dict]:
    r=await client.get('https://openlibrary.org/search.json',params={'fields':FIELDS,**params})
    return (r.json().get('docs') or []) if r.status_code==200 else []
def weighted(rating:float|None,count:int|None)->float|None:
    """Bayesian average: a book with few ratings is pulled toward 3.8, the mean of well-known books."""
    if not rating:return None
    v=count or 0;return v/(v+50)*rating+50/(v+50)*3.8
def _rank(c:dict)->tuple:
    w=weighted(c.get('rating'),c.get('count'))
    return (c['cover'] is None,w is None,-((w or 0)+(0.15 if c['source']=='recommended' else 0)))
async def related(title:str,author:str,categories:list[str],picks:list[dict],suggest=None)->list[dict]:
    # The research step's picks are few or none for many books, so a short model call tops them up to about eight.
    if len(picks)<8 and suggest:
        try:picks=picks+await suggest()
        except Exception:pass  # noqa: BLE001 - suggestions are optional
    me=_short(title);out:list[dict]=[];seen={me}
    def add(card:dict|None):
        if not card:return False
        key=_short(card['title'])
        if not key or key in seen:return False
        seen.add(key);out.append(card);return True
    async with httpx.AsyncClient(timeout=12,headers=HEADERS,follow_redirects=True) as client:
        async def safe(coro):
            try:return await coro
            except (httpx.HTTPError,ValueError,KeyError):return []
        async def pick(p:dict):
            """The pick's own edition: an exact title, preferring the one with the most editions and a cover."""
            q=p['title'].split(':')[0].strip()  # a full subtitle matches nothing on Open Library
            base=dict(limit=8,sort='editions')
            docs=await safe(_search(client,title=q,**({'author':p['author']} if p.get('author') else {}),**base))
            if not docs:docs=await safe(_search(client,title=q,**base))
            want=_short(p['title'])
            exact=[d for d in docs if _short(d.get('title',''))==want]
            doc=next((d for d in exact if d.get('cover_i') and d.get('ratings_count')),None)
            if not doc:  # the best-known edition often lacks a cover or a rating: look across the rated editions of that title
                more=await safe(_search(client,title=q,**({'author':p['author']} if p.get('author') else {}),limit=20,sort='rating'))
                doc=max([d for d in more+exact if _short(d.get('title',''))==want],key=lambda d:(bool(d.get('cover_i')),d.get('ratings_count') or 0),default=None)
            card=_card({**doc,'title':p['title']},p.get('why',''),'recommended') if doc else None
            if not card:  # not on Open Library (common for scholarly books): a Google Books edition of that title is as good
                try:
                    from . import google_books
                    eds=await google_books.search(client,'intitle:'+q+(' inauthor:'+p['author'] if p.get('author') else ''),5)
                    ed=next((e for e in eds if _short(e.get('title',''))==_short(q) and e.get('cover')),None)
                    if ed:card={'title':p['title'],'author':p.get('author') or ', '.join(ed.get('authors') or [])[:80],'year':ed.get('year') or '','cover':ed['cover'],'url':ed.get('url'),
                        'rating':round(ed['rating'],1) if ed.get('rating') else None,'count':ed.get('ratings') or 0,'why':p.get('why','')[:300],'source':'recommended','reason':'pick','subject':''}
                except Exception:pass  # noqa: BLE001
                return card
            if card and not card['cover']:  # Google Books often has the cover Open Library lacks
                try:
                    from . import google_books
                    eds=await google_books.search(client,'intitle:'+p['title']+(' inauthor:'+p['author'] if p.get('author') else ''),3)
                    card['cover']=next((e['cover'] for e in eds if e.get('cover') and _short(e.get('title',''))==want),None)
                except Exception:pass  # noqa: BLE001
            return card
        picked=await asyncio.gather(*(pick(p) for p in picks[:10]))
        for c in picked:add(c)
        surname=(author.split(',')[0].split() or [''])[-1] if ',' not in author else author.split(',')[0]
        same=await safe(_search(client,author=author.replace(',',' ').strip(),sort='rating',limit=12)) if author else []
        mine=[d for d in same if surname.lower() in ' '.join(d.get('author_name') or []).lower() and (d.get('ratings_count') or 0)>=5 and d.get('cover_i')]
        for d in mine[:2]:add(_card(d,'',"same author"))
    # Weighted rating, so a 4.9 from three readers does not beat a 4.2 from thousands; unrated and cover-less books go last.
    out.sort(key=_rank)
    return out[:8]
CACHE_VERSION=3  # 3: no subject shelf, picks topped up to eight
def _cache(book_id:str,lang:str='en')->Path:
    folder=Path(os.getenv('SUMM_DATA_DIR','data'))/'related';folder.mkdir(parents=True,exist_ok=True);return folder/(re.sub(r'[^\w-]','',book_id)+'-'+re.sub(r'[^a-z]','',lang.lower())[:8]+'.json')
def invalidate(book_id:str)->None:
    """Forget every language's list (and the old unversioned file) so the next read recomputes it."""
    folder=Path(os.getenv('SUMM_DATA_DIR','data'))/'related';safe=re.sub(r'[^\w-]','',book_id)
    for f in list(folder.glob(safe+'.json'))+list(folder.glob(safe+'-*.json')):
        try:f.unlink()
        except OSError:pass
async def cached(book_id:str,title:str,author:str,categories:list[str],picks:list[dict],suggest=None,lang:str='en',localize=None,force:bool=False)->list[dict]:
    """External books for one reading language. The old file name and version-1 files are stale, which backfills existing books lazily."""
    path=_cache(book_id,lang)
    try:
        saved=json.loads(path.read_text())
        if not force and saved.get('v')==CACHE_VERSION and saved.get('lang')==lang and time.time()-saved['at']<(14*86400 if saved['books'] else 600):return saved['books']
    except (OSError,ValueError,KeyError):pass
    # the model's picks plus up to ten edition lookups: 40 s was too short and left some books with an empty shelf
    try:books=await asyncio.wait_for(related(title,author,categories,picks,suggest),100)
    except asyncio.TimeoutError:books=[]
    # Titles and the "why" line in the reader's language when the owner's key allows; a failure keeps every card as it is.
    if books and lang!='en' and localize:
        try:
            names=await asyncio.wait_for(localize([{'title':b['title'],'author':b['author'],'why':b['why']} for b in books]),40)
            for b,n in zip(books,names):
                for k in ('localTitle','localAuthor'):
                    if n.get(k):b[k]=n[k]
                if n.get('why'):b['why']=n['why']
        except Exception:pass  # noqa: BLE001 - localisation is optional; never drop a card
    try:path.write_text(json.dumps({'v':CACHE_VERSION,'lang':lang,'at':time.time(),'books':books},ensure_ascii=False))
    except OSError:pass
    return books
def _surname(author:str)->str:
    a=(author or '').strip()
    return _norm(a.split(',')[0] if ',' in a else (a.split() or [''])[-1])
def in_library(me:dict,picks:list[dict],books:list[dict])->list[dict]:
    """Other public books of this library that go with this one, scored from data we already have (no external calls).
    me is {id,author,tags}; each book carries slug, titles, title, author, tags, cover, rating."""
    mine=set(me.get('tags') or []);surname=_surname(me.get('author',''));want={_short(p['title']) for p in picks if p.get('title')}
    out=[]
    for b in books:
        if b['id']==me.get('id'):continue
        score=0;reason='subject';shared=[t for t in (b.get('tags') or []) if t in mine]
        if surname and _surname(b.get('author',''))==surname:score+=3;reason='author'
        if want&{_short(t) for t in [b.get('title','')]+list((b.get('titles') or {}).values())}:
            score+=3
            if reason!='author':reason='pick'
        score+=min(len(shared),4)
        if score<2:continue
        r=b.get('rating') or {}
        out.append({'score':score,'rating_value':r.get('rating') or 0,'card':{'title':b['title'],'author':b.get('author',''),'year':str(b.get('year') or ''),'cover':b.get('cover'),'url':None,'slug':b['slug'],
            'rating':round(r['rating'],1) if r.get('rating') else None,'count':r.get('count') or 0,'why':'','source':'library','reason':reason,'subject':shared[0] if shared else '','titles':b.get('titles') or {},'localAuthor':(b.get('authorNames') or {}).get('fa','')}})
    out.sort(key=lambda x:(-x['score'],-x['rating_value']))
    return [x['card'] for x in out[:4]]
def combine(local:list[dict],external:list[dict],limit:int=8)->list[dict]:
    """Books of this library first, then the external ones that are not already among them."""
    have={_short(t) for c in local for t in [c['title']]+list(c.get('titles',{}).values())}
    return (local+[c for c in external if _short(c['title']) not in have])[:limit]
