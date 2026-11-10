"""Public book metadata: ratings, description, and covers from Google Books, Open Library, and Wikipedia.
Goodreads has no public API and forbids scraping, so it is linked rather than queried."""
from __future__ import annotations
import asyncio,re
from urllib.parse import quote,urlsplit
import httpx
from . import google_books
COVER_HOSTS={'covers.openlibrary.org','books.google.com','books.googleusercontent.com','upload.wikimedia.org'}
HEADERS={'User-Agent':'SummReader/0.3 (https://booksumm.duckdns.org)'}
def _words(text:str)->set[str]:return {w for w in re.findall(r'\w+',text.lower()) if len(w)>2}
def _matches(wanted:str,found:str)->bool:
    # Accept a result only if it shares most of the requested title's words.
    if wanted.strip().casefold() == found.strip().casefold():return bool(wanted.strip())
    want=_words(wanted);return bool(want) and len(want&_words(found))>=max(1,round(len(want)*.6))
async def _google(client:httpx.AsyncClient,title:str,author:str)->dict|None:
    q='intitle:'+title+(' inauthor:'+author if author else '')
    return next((edition for edition in await google_books.search(client,q,5) if _matches(title,edition['title']+' '+edition['subtitle'])),None)
async def _openlibrary(client:httpx.AsyncClient,title:str,author:str)->dict|None:
    # Relevance search finds the main work even when its title differs ("1984" → "Nineteen Eighty-Four").
    params={'q':(title+' '+author).strip(),'limit':'5','fields':'key,title,author_name,first_publish_year,cover_i,ratings_average,ratings_count,want_to_read_count,already_read_count,subject,number_of_pages_median'}
    r=await client.get('https://openlibrary.org/search.json',params=params)
    docs=(r.json().get('docs') or []) if r.status_code==200 else []
    surname=(author.split() or [''])[-1].lower()
    for i,d in enumerate(docs):
        by_author=bool(surname) and any(surname in name.lower() for name in d.get('author_name') or [])
        if not (_matches(title,d.get('title','')) and (by_author or not author) or (i==0 and by_author)):continue
        return {'source':'Open Library','title':d.get('title',''),'authors':d.get('author_name') or [],'year':str(d.get('first_publish_year') or ''),'pages':d.get('number_of_pages_median'),'categories':(d.get('subject') or [])[:8],'rating':round(d['ratings_average'],2) if d.get('ratings_average') else None,'ratings':d.get('ratings_count'),'readers':(d.get('already_read_count') or 0)+(d.get('want_to_read_count') or 0) or None,'url':'https://openlibrary.org'+d['key'] if d.get('key') else None,'cover':'https://covers.openlibrary.org/b/id/'+str(d['cover_i'])+'-L.jpg' if d.get('cover_i') else None}
    return None
async def _wikipedia(client:httpx.AsyncClient,title:str,author:str)->dict|None:
    lang='fa' if re.search(r'[؀-ۿ]',title) else 'en'
    r=await client.get(f'https://{lang}.wikipedia.org/w/rest.php/v1/search/page',params={'q':title+' '+author,'limit':'3'})
    for page in (r.json().get('pages') or []) if r.status_code==200 else []:
        if not _matches(title,page.get('title','')):continue
        s=await client.get(f'https://{lang}.wikipedia.org/api/rest_v1/page/summary/'+quote(page['key'],safe=''))
        if s.status_code!=200:continue
        d=s.json()
        if d.get('type')=='disambiguation':continue
        return {'source':'Wikipedia','title':d.get('title',''),'extract':d.get('extract','')[:2000],'url':(d.get('content_urls') or {}).get('desktop',{}).get('page'),'cover':(d.get('originalimage') or {}).get('source'),'license':'CC BY-SA 4.0'}
    return None
async def lookup(title:str,author:str,google_volume_id:str|None=None)->dict:
    async with httpx.AsyncClient(timeout=10,headers=HEADERS,follow_redirects=True) as client:
        async def safe(task):
            try:return await task
            except (httpx.HTTPError,ValueError,KeyError,TypeError,google_books.BooksError):return None
        if google_volume_id:
            google = await google_books.volume(client, google_volume_id)
            title, author = google['title'], ' '.join(google['authors'])
            openlib, wiki = await asyncio.gather(
                safe(_openlibrary(client, title, author)), safe(_wikipedia(client, title, author))
            )
        else:
            google,openlib,wiki=await asyncio.gather(safe(_google(client,title,author)),safe(_openlibrary(client,title,author)),safe(_wikipedia(client,title,author)))
    found=[x for x in (google,openlib) if x]
    q=quote(title+' '+author)
    google_cover = google and google['cover']
    other_covers = [openlib and openlib['cover'], wiki and wiki['cover']]
    covers = [google_cover, *other_covers] if google_volume_id else [other_covers[0], google_cover, other_covers[1]]
    return {
        'title':(found[0]['title'] if found else title),
        'authors':next((x['authors'] for x in found if x['authors']),[]),
        'year':google['year'] if google_volume_id else next((x['year'] for x in found if x.get('year')),''),
        'pages':google['pages'] if google_volume_id else next((x['pages'] for x in found if x.get('pages')),None),
        'categories':list(dict.fromkeys(c for x in found for c in x['categories']))[:8],
        'description':google['description'] if google else '',
        'ratings':[{'source':x['source'],'rating':x['rating'],'count':x['ratings'],'url':x['url']} for x in found if x.get('rating')],
        'readers':openlib.get('readers') if openlib else None,
        'wikipedia':{k:wiki[k] for k in ('title','extract','url','license')} if wiki else None,
        'covers':[c for c in covers if c],
        'google_edition':google,
        'links':[{'name':'Goodreads','url':'https://www.goodreads.com/search?q='+q},{'name':'StoryGraph','url':'https://app.thestorygraph.com/browse?search_term='+q}]+[{'name':x['source'],'url':x['url']} for x in found if x.get('url')],
    }
def _cover_host(url:str)->bool:
    parts=urlsplit(url);host=parts.hostname or ''
    return parts.scheme=='https' and (host in COVER_HOSTS or host=='archive.org' or host.endswith('.archive.org'))
async def cover(url:str)->tuple[bytes,str]:
    if not _cover_host(url):raise ValueError('Cover host not allowed.')
    async with httpx.AsyncClient(timeout=15,headers=HEADERS,follow_redirects=False) as client:
        for _ in range(3):
            # Open Library redirects to archive.org storage; follow only to known image hosts.
            r=await client.get(url)
            if r.status_code in (301,302,303,307,308) and _cover_host(r.headers.get('location','')):url=r.headers['location'];continue
            break
    kind=r.headers.get('content-type','')
    if r.status_code!=200 or not kind.startswith('image/') or len(r.content)>4_000_000 or len(r.content)<1500:raise ValueError('No usable cover image.')
    return r.content,kind
