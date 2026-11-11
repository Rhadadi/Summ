"""Public-domain paintings from Wikimedia Commons, chosen by an editor as a book's home-page backdrop."""
from __future__ import annotations
import json,os,re,time
from pathlib import Path
import httpx
from . import accounts,library

API='https://commons.wikimedia.org/w/api.php'
HEADERS={'User-Agent':'InklingReader/0.4 (https://booksumm.duckdns.org; book summaries) httpx'}
TITLE=re.compile(r'^File:[^\n/\\]{3,200}\.(?:jpe?g|png|webp)$',re.I)
MAX_BYTES=3_000_000
def _dir()->Path:
    path=Path(os.getenv('SUMM_DATA_DIR','data'))/'art';path.mkdir(parents=True,exist_ok=True);return path
def _plain(value:str)->str:return re.sub(r'\s+',' ',re.sub(r'<[^>]+>','',re.sub(r'<div style="display: ?none;">.*?</div>','',value or '',flags=re.S))).strip()[:200]
def _credit(page:dict)->dict|None:
    info=page['imageinfo'][0];meta=info.get('extmetadata',{})
    licence=meta.get('LicenseShortName',{}).get('value','')
    if not re.search(r'public domain|cc0|pd',licence,re.I):return None
    return {'file':page['title'],'title':_plain(meta.get('ObjectName',{}).get('value','')) or page['title'][5:].rsplit('.',1)[0],
            'artist':_plain(meta.get('Artist',{}).get('value','')),'year':_plain(meta.get('DateTimeOriginal',{}).get('value',''))[:40],
            'page':info.get('descriptionurl',''),'width':info.get('width',0),'height':info.get('height',0),'thumb':info.get('thumburl','')}
async def _query(params:dict)->dict:
    async with httpx.AsyncClient(timeout=20,headers=HEADERS) as client:
        r=await client.get(API,params={'action':'query','format':'json','prop':'imageinfo','iiprop':'url|size|extmetadata','iiextmetadatafilter':'ObjectName|Artist|DateTimeOriginal|LicenseShortName',**params})
        r.raise_for_status();return r.json()
async def search(text:str)->list[dict]:
    text=' '.join(text.split())[:80]
    if len(text)<2:raise accounts.AccountError(422,'Type a few words to look for.')
    data=await _query({'generator':'search','gsrsearch':text+' painting filetype:bitmap','gsrnamespace':6,'gsrlimit':30,'iiurlwidth':420})
    found=[c for p in (data.get('query',{}).get('pages',{})).values() if (c:=_credit(p)) and c['width']>=1100 and TITLE.match(c['file'])]
    return sorted(found,key=lambda c:-c['width'])[:12]
async def save(book_id:str,title:str)->dict:
    if not TITLE.match(title):raise accounts.AccountError(422,'Choose one of the paintings from the search results.')
    data=await _query({'titles':title,'iiurlwidth':1800})
    page=next(iter(data.get('query',{}).get('pages',{}).values()),None)
    credit=_credit(page) if page and 'imageinfo' in page else None
    if not credit:raise accounts.AccountError(422,'Only public-domain images can be used.')
    url=credit.get('thumb','')
    if not re.match(r'https://(?:upload|thumb)\.wikimedia\.org/',url):raise accounts.AccountError(502,'Unexpected image address.')
    async with httpx.AsyncClient(timeout=40,headers=HEADERS) as client:
        r=await client.get(url);r.raise_for_status()
    body=r.content
    if len(body)>MAX_BYTES or not body.startswith((b'\xff\xd8\xff',b'\x89PNG',b'RIFF')):raise accounts.AccountError(422,'That image could not be used. Try another.')
    credit.pop('thumb',None);credit['type']='image/jpeg' if body.startswith(b'\xff\xd8') else 'image/png' if body.startswith(b'\x89PNG') else 'image/webp'
    (_dir()/book_id).write_bytes(body);return credit
def meta(book_id:str)->dict:
    path=_dir()/(book_id+'.json')
    try:return json.loads(path.read_text())
    except (OSError,ValueError):return {}
def set_mode(book_id:str,mode:str,credit:dict|None=None):
    m={'mode':mode,'at':int(time.time())}
    if mode=='art' and credit:m['credit']=credit
    (_dir()/(book_id+'.json')).write_text(json.dumps(m))
def image(book_id:str)->tuple[bytes,str]|None:
    m=meta(book_id);path=_dir()/book_id
    return (path.read_bytes(),m.get('credit',{}).get('type','image/jpeg')) if m.get('mode')=='art' and path.exists() else None
def slide(book_id:str)->dict:
    """What the home page needs: how to dress this book's slide."""
    m=meta(book_id);mode=m.get('mode','none')
    if mode=='art' and not (_dir()/book_id).exists():mode='none'
    out={'mode':mode}
    if mode=='art':
        c=m.get('credit',{});out.update({'art':'/api/library/'+book_id+'/art?v='+str(m.get('at',0)),'credit':{k:c.get(k,'') for k in ('title','artist','year','page')}})
    return out
def remove(book_id:str):
    for p in (_dir()/book_id,_dir()/(book_id+'.json')):p.unlink(missing_ok=True)
IDEAS='''You are a museum curator choosing a painting to hang beside a book on a reading website.
Book: "{title}"{by}.
What it is about: {about}
Themes: {themes}
Suggest 8 specific, well-known paintings or prints whose subject, mood or symbolism fits this book. Every work must be in the public domain: made before 1930 by an artist who died before 1955. Prefer works whose images are on Wikimedia Commons. Mix famous and less obvious choices, and favour works that look striking when shown very large behind text.
Return JSON: {{"ideas":[{{"artist":"...","title":"the work's usual English title","why":"one short sentence, in {language}, on why it fits"}}],"moods":["4 short English search words for the mood, such as melancholy or dawn"]}}'''
async def ideas(title:str,author:str,about:str,themes:list[str],language:str,creds:tuple[str,str],gemini:str)->dict:
    """A curator's shortlist from Gemini, each idea looked up on Wikimedia Commons so only real public-domain images come back."""
    import asyncio
    key,model=creds
    prompt=IDEAS.format(title=title[:300],by=' by '+author[:200] if author else '',about=' '.join(about.split())[:2000] or 'unknown',themes=', '.join(themes)[:300] or 'unknown',language=language)
    payload={'contents':[{'role':'user','parts':[{'text':prompt}]}],'generationConfig':{'responseMimeType':'application/json','temperature':0.6,'maxOutputTokens':4096}}
    async with httpx.AsyncClient(timeout=90) as client:
        r=await client.post(gemini+model+':generateContent',headers={'x-goog-api-key':key},json=payload)
    if r.status_code==429:raise accounts.AccountError(429,'Your Gemini quota is exhausted or the model is busy.')
    if r.status_code>=400:raise accounts.AccountError(502,'Google rejected the request. Check your API key and model in Account.')
    try:
        data=json.loads(''.join(p.get('text','') for p in r.json()['candidates'][0]['content']['parts'] if not p.get('thought')))
        raw=[i for i in data.get('ideas',[]) if isinstance(i,dict) and i.get('title')][:8]
        moods=[m for m in data.get('moods',[]) if isinstance(m,str)][:6]
    except (ValueError,KeyError,IndexError,TypeError,AttributeError):raise accounts.AccountError(502,'The curator answer was unreadable. Try again.')
    async def look(i):
        try:hits=await search(_plain(str(i.get('artist','')))+' '+_plain(str(i['title'])))
        except (httpx.HTTPError,accounts.AccountError):hits=[]
        return {'artist':_plain(str(i.get('artist',''))),'title':_plain(str(i['title'])),'why':_plain(str(i.get('why',''))),'results':hits[:3]}
    found=await asyncio.gather(*(look(i) for i in raw))
    return {'ideas':[f for f in found if f['results']],'moods':[_plain(m)[:40] for m in moods]}
