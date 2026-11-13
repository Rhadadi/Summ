"""Books to read next, with covers: the picks of the research step, other works by the same author, and well-rated books on the same subjects (Open Library)."""
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
            'rating':round(d['ratings_average'],1) if d.get('ratings_average') else None,'count':d.get('ratings_count') or 0,'why':why[:300],'source':source}
async def _search(client:httpx.AsyncClient,**params)->list[dict]:
    r=await client.get('https://openlibrary.org/search.json',params={'fields':FIELDS,**params})
    return (r.json().get('docs') or []) if r.status_code==200 else []
async def related(title:str,author:str,categories:list[str],picks:list[dict],suggest=None)->list[dict]:
    # With no researched picks, a short model call proposes them once.
    if len(picks)<4 and suggest:
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
            base=dict(limit=8,sort='editions')
            docs=await safe(_search(client,title=p['title'],**({'author':p['author']} if p.get('author') else {}),**base))
            if not docs:docs=await safe(_search(client,title=p['title'],**base))
            want=_short(p['title'])
            exact=[d for d in docs if _short(d.get('title',''))==want]
            doc=next((d for d in exact if d.get('cover_i')),None)
            if not doc:  # the best-known edition often lacks a cover: look across every edition of that title
                more=await safe(_search(client,title=p['title'],limit=20,sort='editions'))
                doc=next((d for d in more if _short(d.get('title',''))==want and d.get('cover_i')),exact[0] if exact else None)
            card=_card({**doc,'title':p['title']},p.get('why',''),'recommended') if doc else None
            if card and not card['cover']:  # Google Books often has the cover Open Library lacks
                try:
                    from . import google_books
                    eds=await google_books.search(client,'intitle:'+p['title']+(' inauthor:'+p['author'] if p.get('author') else ''),3)
                    card['cover']=next((e['cover'] for e in eds if e.get('cover') and _short(e.get('title',''))==want),None)
                except Exception:pass  # noqa: BLE001
            return card
        picked=await asyncio.gather(*(pick(p) for p in picks[:6]))
        for c in picked:add(c)
        surname=(author.split(',')[0].split() or [''])[-1] if ',' not in author else author.split(',')[0]
        same=await safe(_search(client,author=author.replace(',',' ').strip(),sort='rating',limit=12)) if author else []
        mine=[d for d in same if surname.lower() in ' '.join(d.get('author_name') or []).lower() and (d.get('ratings_count') or 0)>=5 and d.get('cover_i')]
        for d in mine[:2]:add(_card(d,'',"same author"))
    # recommended picks first, then the rest by rating; cards without a cover go last
    out.sort(key=lambda c:(c['cover'] is None,{'recommended':0,'same author':1,'similar':2}.get(c['source'],3)))
    return out[:8]
def _cache(book_id:str)->Path:
    folder=Path(os.getenv('SUMM_DATA_DIR','data'))/'related';folder.mkdir(parents=True,exist_ok=True);return folder/(re.sub(r'[^\w-]','',book_id)+'.json')
async def cached(book_id:str,title:str,author:str,categories:list[str],picks:list[dict],suggest=None)->list[dict]:
    path=_cache(book_id)
    try:
        saved=json.loads(path.read_text())
        if time.time()-saved['at']<(14*86400 if saved['books'] else 3600):return saved['books']
    except (OSError,ValueError,KeyError):pass
    try:books=await asyncio.wait_for(related(title,author,categories,picks,suggest),40)
    except asyncio.TimeoutError:books=[]
    try:path.write_text(json.dumps({'at':time.time(),'books':books},ensure_ascii=False))
    except OSError:pass
    return books
