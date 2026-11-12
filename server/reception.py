"""Reviews of a book from sources that publish them in a form we may quote: Wikipedia's reception sections,
The Guardian's Open Platform and the New York Times Books API. Quotes found by web search are checked against the page."""
from __future__ import annotations
import asyncio,html,ipaddress,os,re,socket
from urllib.parse import urlsplit
import httpx
from . import bookinfo

HEADERS={'User-Agent':'InklingReader/0.4 (https://booksumm.duckdns.org; book reviews)'}
QUOTE=re.compile(r'[“"]([^”"]{25,320})[”"]')
def _plain(text:str)->str:
    """Wikitext or HTML to readable text."""
    text=re.sub(r'<ref[^>]*/>|<ref[^>]*>.*?</ref>','',text,flags=re.S)
    for _ in range(3):text=re.sub(r'\{\{[^{}]*\}\}','',text)
    text=re.sub(r'\[\[(?:[^|\]]*\|)?([^\]]+)\]\]',r'\1',text)
    text=re.sub(r"'{2,}",'',text);text=re.sub(r'<[^>]+>','',text)
    return ' '.join(html.unescape(text).split())
def _field(ref:str,*names:str)->str:
    for n in names:
        m=re.search(r'\|\s*'+n+r'\s*=\s*([^|}]*)',ref)
        if m and m.group(1).strip():return _plain(m.group(1).strip())
    return ''
def _words(text:str)->int:return len(text.split())
OUTLETS=('theguardian.com','nytimes.com','washingtonpost.com','wsj.com','ft.com','newyorker.com','theatlantic.com','economist.com','telegraph.co.uk','thetimes.co.uk','thetimes.com',
 'kirkusreviews.com','publishersweekly.com','latimes.com','independent.co.uk','spectator.co.uk','newstatesman.com','nybooks.com','lrb.co.uk','bostonglobe.com','npr.org',
 'booklistonline.com','scientificamerican.com','nature.com','smh.com.au','theaustralian.com.au','newscientist.com','prospectmagazine.co.uk','the-tls.co.uk','lithub.com','slate.com','vox.com','time.com')
def _outlet(url:str)->bool:
    host=(urlsplit(url).hostname or '').lower().removeprefix('www.')
    return any(host==o or host.endswith('.'+o) for o in OUTLETS)

async def wikipedia(client:httpx.AsyncClient,title:str,author:str)->list[dict]:
    """Critics quoted in the "Reception" section of the book's English Wikipedia article, with the reference each quote cites."""
    page=await bookinfo._wikipedia(client,title,author)
    if not page or not page.get('title'):return []
    api='https://en.wikipedia.org/w/api.php'
    r=await client.get(api,params={'action':'parse','page':page['title'],'prop':'sections','format':'json','redirects':1})
    sections=[s for s in (r.json().get('parse') or {}).get('sections',[]) if re.search(r'recep|critic|review|response|praise',s.get('line',''),re.I)]
    found=[]
    for s in sections[:3]:
        w=await client.get(api,params={'action':'parse','page':page['title'],'section':s['index'],'prop':'wikitext','format':'json','redirects':1})
        text=((w.json().get('parse') or {}).get('wikitext') or {}).get('*','')
        # A sentence is followed by the reference that supports it.
        for sentence,refs in re.findall(r'([^.!?]*?[.!?]["”]?)((?:\s*<ref[^>]*?(?:/>|>.*?</ref>))*)',text,flags=re.S):
            clean=_plain(sentence)
            for q in QUOTE.findall(clean):
                if not 5<=_words(q)<=55:continue
                ref=refs or ''
                work=_field(ref,'work','newspaper','website','magazine','journal','periodical','publisher')
                italic=re.search(r"''([^']{3,60})''",sentence)
                publication=work or (_plain(italic.group(1)) if italic else '')
                reviewer=' '.join(x for x in (_field(ref,'first','first1'),_field(ref,'last','last1')) if x) or _field(ref,'author','author1')
                if not reviewer:
                    m=re.search(r'([A-Z][a-z]+(?: [A-Z][a-z.]+){1,2})(?:,| of| in| writing| wrote| called| said| described| praised)',clean)
                    reviewer=m.group(1) if m else ''
                url=_field(ref,'url','archive-url')
                if not publication and not reviewer:continue
                found.append({'publication':publication or 'Review','reviewer':reviewer,'date':_field(ref,'date'),'headline':_field(ref,'title'),'excerpt':q.strip(),
                              'context':clean[:600],'url':url if url.startswith('https://') else None,'via':'Wikipedia','verified':True})
        # Reviews the article cites without quoting them: we fetch those pages later and quote them ourselves.
        for ref in re.findall(r'<ref[^>/]*>(.*?)</ref>',text,flags=re.S):
            url=_field(ref,'url')
            if not url.startswith('https://') or any(f['url']==url for f in found):continue
            headline=_field(ref,'title')
            if not (_outlet(url) or re.search(r'\breview',headline,re.I)):continue
            found.append({'publication':_field(ref,'work','newspaper','website','magazine','journal','periodical','publisher') or (urlsplit(url).hostname or '').removeprefix('www.'),
                          'reviewer':' '.join(x for x in (_field(ref,'first','first1'),_field(ref,'last','last1')) if x) or _field(ref,'author','author1'),
                          'date':_field(ref,'date'),'headline':headline,'excerpt':'','context':'','url':url,'via':'Wikipedia','verified':False})
    return found[:10]

async def guardian(client:httpx.AsyncClient,title:str,author:str)->list[dict]:
    """Guardian and Observer reviews through The Guardian Open Platform (needs GUARDIAN_API_KEY)."""
    key=os.getenv('GUARDIAN_API_KEY','').strip()
    if not key:return []
    surname=(author.split() or [''])[-1]
    r=await client.get('https://content.guardianapis.com/search',params={'q':'"'+title.split(':')[0]+'"'+(' AND '+surname if surname else ''),'tag':'tone/reviews','show-fields':'headline,standfirst,byline,bodyText','page-size':6,'api-key':key})
    found=[]
    for x in ((r.json().get('response') or {}).get('results') or []) if r.status_code==200 else []:
        f=x.get('fields') or {};body=f.get('bodyText','');stand=_plain(f.get('standfirst',''))
        # A Guardian review names the book in its headline ("Midlife by Kieran Setiya review – …"); roundups and reviews of other books do not.
        short=title.split(':')[0].strip().lower();head=_plain(f.get('headline','')).lower()
        if short not in head or re.search(r'books? of the year|best books|roundup|in brief',head):continue
        # The standfirst is the paper's own one-line verdict; otherwise the sentence of the review that names the book.
        sentences=[s.strip() for s in re.split(r'(?<=[.!?])\s+',body) if 8<=_words(s)<=45]
        named=[s for s in sentences if title.split(':')[0].lower() in s.lower()]
        excerpt=stand if 5<=_words(stand)<=45 else (named or sentences or [''])[0]
        found.append({'publication':'The Guardian' if 'observer' not in x.get('webUrl','') else 'The Observer','reviewer':_plain(f.get('byline','')),'date':x.get('webPublicationDate','')[:10],
                      'headline':_plain(f.get('headline','')),'excerpt':excerpt,'context':body[:2500],'url':x.get('webUrl'),'via':'The Guardian','verified':True})
    return found[:3]

async def nyt(client:httpx.AsyncClient,title:str,author:str,isbn:str='')->list[dict]:
    """New York Times book reviews through the NYT Article Search API (needs NYT_API_KEY with Article Search enabled).
    The API gives the headline, byline, the paper's own abstract and the opening paragraph."""
    key=os.getenv('NYT_API_KEY','').strip()
    if not key:return []
    short=title.split(':')[0].strip();surname=(author.split() or [''])[-1]
    r=await client.get('https://api.nytimes.com/svc/search/v2/articlesearch.json',params={'q':'"'+short+'" '+surname,'fq':'section.name:("Books") OR typeOfMaterials:("Review")','sort':'relevance','api-key':key})
    docs=((r.json().get('response') or {}).get('docs') or []) if r.status_code==200 else []
    found=[]
    for d in docs:
        head=_plain(((d.get('headline') or {}).get('main')) or '');abstract=_plain(d.get('abstract') or '');lead=_plain(d.get('lead_paragraph') or '')
        if short.lower() not in (head+' '+abstract+' '+lead).lower() or (surname and surname.lower() not in (head+' '+abstract+' '+lead).lower()):continue
        excerpt=next((x for x in (abstract,lead) if 5<=_words(x)<=45),'')
        found.append({'publication':'The New York Times','reviewer':_plain(((d.get('byline') or {}).get('original')) or '').removeprefix('By ').strip(),'date':(d.get('pub_date') or '')[:10],
                      'headline':head,'excerpt':excerpt,'context':' '.join(x for x in (abstract,lead) if x),'url':d.get('web_url'),'via':'The New York Times','verified':bool(excerpt)})
    return found[:2]

def _public(url:str)->bool:
    parts=urlsplit(url)
    if parts.scheme!='https' or not parts.hostname:return False
    try:return all(ipaddress.ip_address(a[4][0]).is_global for a in socket.getaddrinfo(parts.hostname,443))
    except (OSError,ValueError):return False
def _norm(text:str)->str:return re.sub(r'[^\w]+',' ',html.unescape(text).lower()).strip()
async def verify(critics:list[dict])->None:
    """Open each review page and look for the quoted words. A quote missing from a page we could read is removed;
    a page we could not read leaves the quote marked as unchecked."""
    async def check(c:dict):
        if c.get('verified') or not c.get('excerpt') or not c.get('url'):return
        c['verified']=None
        try:
            if not await asyncio.to_thread(_public,c['url']):return
            async with httpx.AsyncClient(timeout=8,headers=HEADERS,follow_redirects=True,max_redirects=3) as client:
                r=await client.get(c['url'])
            if r.status_code!=200 or 'html' not in r.headers.get('content-type',''):return
            page=_norm(r.text[:3_000_000]);want=_norm(c['excerpt'])
            if want and want in page:c['verified']=True
            elif len(page)>4000:c['verified']=False;c['excerpt']=''
        except (httpx.HTTPError,UnicodeError):return
    await asyncio.gather(*(check(c) for c in critics))

async def page_text(url:str)->str:
    """The readable paragraphs of a public review page, or nothing when the page is closed to us."""
    try:
        if not await asyncio.to_thread(_public,url):return ''
        async with httpx.AsyncClient(timeout=10,headers={**HEADERS,'Accept':'text/html'},follow_redirects=True,max_redirects=3) as client:
            r=await client.get(url)
        if r.status_code!=200 or 'html' not in r.headers.get('content-type',''):return ''
        body=re.sub(r'<(script|style|nav|header|footer|aside)[^>]*>.*?</\1>','',r.text[:3_000_000],flags=re.S|re.I)
        # The review lives in the page's article element when it has one; menus, sign-up boxes and share links are dropped.
        noise=re.compile(r'cookie|subscribe|sign (in|up)|log ?in|newsletter|twitter|facebook|instagram|refresh the page|advertis|javascript|all rights reserved|privacy policy|terms of (use|service)|©',re.I)
        def paragraphs(part:str)->str:
            return '\n'.join(p for p in (_plain(x) for x in re.findall(r'<p[^>]*>(.*?)</p>',part,flags=re.S)) if _words(p)>=8 and not noise.search(p))
        articles=re.findall(r'<article[^>]*>(.*?)</article>',body,flags=re.S|re.I)
        text=paragraphs(max(articles,key=len)) if articles else ''
        return (text if len(text)>1500 else paragraphs(body))[:24000]
    except (httpx.HTTPError,UnicodeError,ValueError):return ''
async def gather(title:str,author:str,isbn:str='')->dict:
    """Everything the structured sources hold about the book's reception, with a note on what was searched."""
    async with httpx.AsyncClient(timeout=12,headers=HEADERS,follow_redirects=True) as client:
        async def safe(task):
            try:return await task
            except (httpx.HTTPError,ValueError,KeyError,TypeError):return []
        wiki,guard,times=await asyncio.gather(safe(wikipedia(client,title,author)),safe(guardian(client,title,author)),safe(nyt(client,title,author,isbn)))
    notes=[('Wikipedia',len(wiki),True),('The Guardian',len(guard),bool(os.getenv('GUARDIAN_API_KEY','').strip())),('The New York Times',len(times),bool(os.getenv('NYT_API_KEY','').strip()))]
    return {'critics':wiki+guard+times,'notes':[{'source':n,'found':k,'enabled':e} for n,k,e in notes]}

# ---- automatic reception for published books: the quotes publishers and Wikipedia print, gathered once and kept a fortnight
import json as _json,time as _time
from pathlib import Path as _Path
def _cache(book_id:str)->_Path:
    folder=_Path(os.getenv('SUMM_DATA_DIR','data'))/'reception';folder.mkdir(parents=True,exist_ok=True);return folder/(re.sub(r'[^\w-]','',book_id)+'.json')
async def cached(book_id:str,title:str,author:str)->dict:
    """Reviews found without any AI step, for books whose owner has not approved a researched reception yet."""
    path=_cache(book_id)
    try:
        saved=_json.loads(path.read_text())
        if _time.time()-saved.get('at',0)<(14 if saved.get('critics') else 1)*86400:return {'critics':saved['critics']}
    except (OSError,ValueError):pass
    try:found=await asyncio.wait_for(gather(title,author),25)
    except asyncio.TimeoutError:found={'critics':[]}
    critics=[{k:c.get(k) for k in ('publication','reviewer','date','headline','excerpt','url','via')}|{'stance':'','summary':'','verified':True if c.get('excerpt') else None}
             for c in found['critics'] if c.get('url') or c.get('excerpt')][:8]
    try:path.write_text(_json.dumps({'at':_time.time(),'critics':critics},ensure_ascii=False))
    except OSError:pass
    return {'critics':critics}
