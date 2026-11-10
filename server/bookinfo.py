"""Public book metadata: ratings, description, and covers from Google Books, Open Library, and Wikipedia.
Goodreads has no public API and forbids scraping, so it is linked rather than queried."""
from __future__ import annotations
import asyncio,html,os,re
from urllib.parse import quote,urlsplit
import httpx
COVER_HOSTS={'covers.openlibrary.org','books.google.com','books.googleusercontent.com','upload.wikimedia.org'}
HEADERS={'User-Agent':'SummReader/0.3 (https://booksumm.duckdns.org)'}
def _words(text:str)->set[str]:return {w for w in re.findall(r'\w+',text.lower()) if len(w)>2}
def _matches(wanted:str,found:str)->bool:
    # Accept a result only if it shares most of the requested title's words.
    want=_words(wanted);return bool(want) and len(want&_words(found))>=max(1,round(len(want)*.6))
def _plain(text:str)->str:return re.sub(r'\s+',' ',html.unescape(re.sub(r'<[^>]+>',' ',text or ''))).strip()
async def _google(client:httpx.AsyncClient,title:str,author:str)->dict|None:
    q='intitle:'+title+(' inauthor:'+author if author else '')
    params={'q':q,'maxResults':'5','printType':'books'}
    if os.getenv('GOOGLE_BOOKS_API_KEY'):params['key']=os.environ['GOOGLE_BOOKS_API_KEY']
    r=await client.get('https://www.googleapis.com/books/v1/volumes',params=params)
    for item in (r.json().get('items') or []) if r.status_code==200 else []:
        v=item.get('volumeInfo') or {}
        if not _matches(title,v.get('title','')+' '+v.get('subtitle','')):continue
        cover=(v.get('imageLinks') or {}).get('thumbnail','').replace('http://','https://').replace('&edge=curl','')
        return {'source':'Google Books','title':v.get('title',''),'authors':v.get('authors') or [],'year':(v.get('publishedDate') or '')[:4],'pages':v.get('pageCount'),'categories':v.get('categories') or [],'description':_plain(v.get('description',''))[:3000],'rating':v.get('averageRating'),'ratings':v.get('ratingsCount'),'url':v.get('infoLink') or v.get('canonicalVolumeLink'),'cover':cover.replace('zoom=1','zoom=2') if cover else None}
    return None
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
async def lookup(title:str,author:str)->dict:
    async with httpx.AsyncClient(timeout=10,headers=HEADERS,follow_redirects=True) as client:
        async def safe(task):
            try:return await task
            except (httpx.HTTPError,ValueError,KeyError,TypeError):return None
        google,openlib,wiki=await asyncio.gather(safe(_google(client,title,author)),safe(_openlibrary(client,title,author)),safe(_wikipedia(client,title,author)))
    found=[x for x in (google,openlib) if x]
    q=quote(title+' '+author)
    return {
        'title':(found[0]['title'] if found else title),
        'authors':next((x['authors'] for x in found if x['authors']),[]),
        'year':next((x['year'] for x in found if x.get('year')),''),
        'pages':next((x['pages'] for x in found if x.get('pages')),None),
        'categories':list(dict.fromkeys(c for x in found for c in x['categories']))[:8],
        'description':google['description'] if google else '',
        'ratings':[{'source':x['source'],'rating':x['rating'],'count':x['ratings'],'url':x['url']} for x in found if x.get('rating')],
        'readers':openlib.get('readers') if openlib else None,
        'wikipedia':{k:wiki[k] for k in ('title','extract','url','license')} if wiki else None,
        'covers':[c for c in (openlib and openlib['cover'],google and google['cover'],wiki and wiki['cover']) if c],
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
