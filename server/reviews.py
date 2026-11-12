"""A book's critical reception: gathered by Gemini with Google Search, then checked and approved by a person before it is published."""
from __future__ import annotations
import asyncio,json,re,time
from typing import Literal
from urllib.parse import quote,urlsplit
import httpx
from fastapi import HTTPException
from pydantic import BaseModel,ConfigDict,Field,field_validator
from . import reception

class Strict(BaseModel):model_config=ConfigDict(extra='forbid')
def _https(url:str|None)->str|None:
    if not url:return None
    parts=urlsplit(url.strip())
    return url.strip() if parts.scheme=='https' and parts.netloc and len(url)<=600 else None
_link=lambda v:_https(v)
class Quote(Strict):
    text:str=Field(min_length=3,max_length=400);who:str=Field(default='',max_length=120);source:str=Field(default='',max_length=120);url:str|None=Field(default=None,max_length=600)
    _u=field_validator('url')(_link)
class Source(Strict):
    name:str=Field(min_length=1,max_length=120);url:str=Field(max_length=600)
    _u=field_validator('url')(lambda v:_https(v) or (_ for _ in ()).throw(ValueError('Links must use https.')))
class Rating(Strict):
    value:float=Field(ge=0,le=5);source:str=Field(max_length=80);count:int|None=Field(default=None,ge=0,le=500_000_000);url:str|None=Field(default=None,max_length=600)
    _u=field_validator('url')(_link)
class Similar(Strict):
    title:str=Field(min_length=1,max_length=200);author:str=Field(default='',max_length=200);why:str=Field(default='',max_length=300)
class Critic(Strict):
    publication:str=Field(min_length=1,max_length=120);reviewer:str=Field(default='',max_length=120);date:str=Field(default='',max_length=40)
    headline:str=Field(default='',max_length=200);stance:Literal['positive','mixed','negative','']=''
    excerpt:str=Field(default='',max_length=400);summary:str=Field(default='',max_length=600);url:str|None=Field(default=None,max_length=600)
    translation:str=Field(default='',max_length=600);via:str=Field(default='',max_length=60);verified:bool|None=None
    _u=field_validator('url')(_link)
class Voice(Strict):
    name:str=Field(default='',max_length=80);stars:float|None=Field(default=None,ge=0,le=5)
    excerpt:str=Field(default='',max_length=400);summary:str=Field(default='',max_length=400);url:str|None=Field(default=None,max_length=600)
    _u=field_validator('url')(_link)
class Portrait(Strict):
    url:str=Field(max_length=600);page:str=Field(default='',max_length=600)
    @field_validator('url')
    @classmethod
    def wikimedia(cls,v):
        if not re.match(r'https://upload\.wikimedia\.org/',v or ''):raise ValueError('Portraits come from Wikimedia only.')
        return v
class Searched(Strict):
    source:str=Field(max_length=60);found:int=Field(ge=0,le=100);enabled:bool=True
class Review(Strict):
    verdict:str=Field(default='',max_length=800)
    audience:str=Field(default='',max_length=500);aboutAuthor:str=Field(default='',max_length=900);authorImage:Portrait|None=None
    themes:list[str]=Field(default=[],max_length=8);similar:list[Similar]=Field(default=[],max_length=6)
    rating:Rating|None=None;ratings:list[Rating]=Field(default=[],max_length=5)
    critics:list[Critic]=Field(default=[],max_length=8);readers:list[Voice]=Field(default=[],max_length=6)
    awards:list[str]=Field(default=[],max_length=8);impact:str=Field(default='',max_length=900)
    pros:list[str]=Field(default=[],max_length=8);cons:list[str]=Field(default=[],max_length=8)
    quotes:list[Quote]=Field(default=[],max_length=8);sources:list[Source]=Field(default=[],max_length=12)
    searched:list[Searched]=Field(default=[],max_length=6)
    model:str=Field(default='',max_length=100);createdAt:float=0
    @field_validator('pros','cons','themes','awards')
    @classmethod
    def short(cls,v):
        if any(not isinstance(x,str) or len(x)>300 for x in v):raise ValueError('Each point must be short.')
        return v
class ResearchRequest(Strict):
    isbn:str=Field(default='',max_length=20)
    title:str=Field(min_length=1,max_length=300);author:str=Field(default='',max_length=300);year:str=Field(default='',max_length=20)
    language:Literal['en','fa','de','ar','es','fr','tr','zh']='en'
LANGS={'en':'English','fa':'Persian','de':'German','ar':'Arabic','es':'Spanish','fr':'French','tr':'Turkish','zh':'Chinese'}
PROMPT='''Use Google Search thoroughly to research how critics and readers received the book "{title}"{by}{year}. Search Goodreads, The New York Times, The Guardian, The Washington Post, Kirkus Reviews, Publishers Weekly, The New Yorker, the Financial Times, academic journals and other respected outlets, plus reader sites such as Goodreads, Amazon and The StoryGraph.
Return ONE JSON object and nothing else, with this shape (write the descriptive fields in {language}; keep excerpts verbatim in their original language):
{{"verdict": two or three sentences capturing the overall reception, vivid and specific,
 "ratings": up to 3 objects {{"value": average from 0 to 5, "source": site name such as "Goodreads", "count": number of ratings or null, "url": "https://..."}},
 "critics": up to 6 objects, one per published review {{"publication": outlet, "reviewer": critic's name, "date": when, "headline": the review's headline, "stance": "positive" | "mixed" | "negative", "excerpt": a verbatim sentence from the review of at most 35 words, "summary": two sentences on the critic's argument, "url": "https://..." of the review}},
 "readers": up to 4 objects from well-liked reader reviews {{"name": reviewer's display name, "stars": their rating 0-5 or null, "excerpt": a verbatim line of at most 35 words, "summary": one sentence, "url": "https://..."}},
 "pros": up to 6 strengths that critics and readers name,
 "cons": up to 6 weaknesses they name,
 "audience": two sentences on who this book is for and who may not enjoy it,
 "aboutAuthor": three sentences about the author's background, other books and standing,
 "themes": up to 6 short theme labels,
 "awards": up to 6 prizes, lists or honours the book received,
 "impact": two or three sentences on the book's influence, sales or legacy,
 "similar": up to 4 objects {{"title": a related book, "author": its author, "why": a few words on the link}},
 "sources": up to 8 objects {{"name": publication or site, "url": "https://..."}}}}
Rules: use only what the search results show. Never invent a quote, number, reviewer, prize or link; leave a field empty or an array short rather than guess. Every url must be a page you actually found.'''
def _json(text:str)->dict:
    text=re.sub(r'^```(?:json)?|```$','',text.strip(),flags=re.M).strip()
    start=text.find('{');end=text.rfind('}')
    if start<0 or end<start:raise ValueError('no json')
    data=json.loads(text[start:end+1])
    if not isinstance(data,dict):raise ValueError('not an object')
    return data
def _host(url:str)->str:return (urlsplit(url).hostname or '').lower().removeprefix('www.')
_text=lambda v,n:' '.join(str(v or '').split())[:n]
def _verbatim(v)->str:
    """An excerpt survives only when it is short; long "quotes" are usually paraphrase."""
    t=_text(v,400).strip('"“”« »')
    return t if 4<=len(t.split())<=40 else ''
def _stars(v):
    try:
        x=float(v);return round(x,2) if 0<x<=5 else None
    except (TypeError,ValueError):return None
def clean(raw:dict,grounded:set[str],model:str)->Review:
    """Keep only what the search actually touched: a link survives only when its site appeared in the search results,
    and an excerpt survives only beside such a link."""
    ok=lambda url:bool(url) and any(_host(url)==d or _host(url).endswith('.'+d) or d.endswith('.'+_host(url)) for d in grounded)
    def link(url):return url if isinstance(url,str) and _https(url) and ok(url) else None
    items=lambda key:[x for x in (raw.get(key) or []) if isinstance(x,dict)]
    ratings=[]
    for r in items('ratings')+([raw['rating']] if isinstance(raw.get('rating'),dict) else []):
        value=_stars(r.get('value'))
        if value and not any(x['source']==_text(r.get('source'),80) for x in ratings):
            count=r.get('count');ratings.append({'value':value,'source':_text(r.get('source'),80),'count':int(count) if isinstance(count,(int,float)) and count>=0 else None,'url':link(r.get('url'))})
    critics=[]
    for c in items('critics'):
        url=link(c.get('url'));stance=c.get('stance') if c.get('stance') in ('positive','mixed','negative') else ''
        if not _text(c.get('publication'),120):continue
        critics.append({'publication':_text(c.get('publication'),120),'reviewer':_text(c.get('reviewer'),120),'date':_text(c.get('date'),40),'headline':_text(c.get('headline'),200),'stance':stance,
                        'excerpt':_verbatim(c.get('excerpt')) if url else '','summary':_text(c.get('summary'),600),'url':url})
    readers=[]
    for v in items('readers'):
        url=link(v.get('url'));excerpt=_verbatim(v.get('excerpt')) if url else ''
        if excerpt or _text(v.get('summary'),400):readers.append({'name':_text(v.get('name'),80),'stars':_stars(v.get('stars')),'excerpt':excerpt,'summary':_text(v.get('summary'),400),'url':url})
    quotes=[]
    for q in items('quotes'):
        text=_verbatim(q.get('text'))
        if text and _text(q.get('who') or q.get('source'),120):quotes.append({'text':text,'who':_text(q.get('who'),120),'source':_text(q.get('source'),120),'url':link(q.get('url'))})
    sources=[{'name':_text(s.get('name'),120) or _host(s['url']),'url':s['url']} for s in items('sources') if isinstance(s.get('url'),str) and link(s['url'])]
    for c in critics:
        if c['url'] and not any(s['url']==c['url'] for s in sources):sources.append({'name':c['publication'],'url':c['url']})
    similar=[{'title':_text(x.get('title'),200),'author':_text(x.get('author'),200),'why':_text(x.get('why'),300)} for x in items('similar') if _text(x.get('title'),200)]
    points=lambda key,n=300:[_text(x,n) for x in (raw.get(key) or []) if isinstance(x,str) and x.strip()][:8]
    return Review(verdict=_text(raw.get('verdict'),800),audience=_text(raw.get('audience'),500),aboutAuthor=_text(raw.get('aboutAuthor'),900),
                  themes=points('themes',80),similar=similar[:6],rating=ratings[0] if ratings else None,ratings=ratings[:5],critics=critics[:8],readers=readers[:6],
                  awards=points('awards',200),impact=_text(raw.get('impact'),900),pros=points('pros'),cons=points('cons'),quotes=quotes[:8],sources=sources[:12],model=model,createdAt=time.time())
async def portrait(author:str)->dict|None:
    """The author's photograph from Wikipedia, when the article has a free image."""
    name=author.split(',')[0].strip()
    if not name:return None
    try:
        async with httpx.AsyncClient(timeout=10,headers={'User-Agent':'InklingReader/0.4 (https://booksumm.duckdns.org)'}) as client:
            r=await client.get('https://en.wikipedia.org/api/rest_v1/page/summary/'+quote(name.replace(' ','_')))
        if r.status_code!=200:return None
        data=r.json();src=((data.get('thumbnail') or {}).get('source') or '')
        if data.get('type')!='standard' or not src.startswith('https://upload.wikimedia.org/'):return None
        return {'url':src,'page':((data.get('content_urls') or {}).get('desktop') or {}).get('page','')}
    except (httpx.HTTPError,ValueError):return None
PICK='''You are preparing a book page that quotes what critics wrote about "{title}"{by}.
Below are review pages, each with a number. For each page decide whether it is a review of, or substantial comment on, THIS book.
For each relevant page choose the single most quotable sentence that gives the critic's judgement, copied EXACTLY, word for word, from the page (at most 40 words; never edit or join sentences).
Return JSON: {{"reviews":[{{"n":page number,"relevant":true or false,"excerpt":"verbatim sentence","stance":"positive"|"mixed"|"negative","reviewer":"critic name if the page names one","summary":"two sentences in {language} on the critic's view","translation":"the excerpt translated into {language}, or empty if it is already in {language}"}}]}}

{pages}'''
async def _ask(prompt:str,creds:tuple[str,str],gemini:str,search:bool=False,tokens:int=16384)->tuple[dict,set[str]]:
    key,model=creds
    payload={'contents':[{'role':'user','parts':[{'text':prompt}]}],'generationConfig':{'temperature':0.2,'maxOutputTokens':tokens,**({} if search else {'responseMimeType':'application/json'})},**({'tools':[{'google_search':{}}]} if search else {})}
    async with httpx.AsyncClient(timeout=240) as client:
        response=await client.post(gemini+model+':generateContent',headers={'x-goog-api-key':key},json=payload)
    if response.status_code==429:raise HTTPException(429,'Your Gemini quota is exhausted or the model is busy.')
    if response.status_code in (400,401,403,404):raise HTTPException(502,'Google rejected the request. Check your API key and model in Account (the model must support Google Search).')
    response.raise_for_status();candidate=response.json()['candidates'][0]
    text=''.join(p.get('text','') for p in candidate['content']['parts'] if not p.get('thought'))
    chunks=[c['web'] for c in (candidate.get('groundingMetadata') or {}).get('groundingChunks',[]) if c.get('web')]
    # Search results name their site by domain, for example "goodreads.com".
    grounded={t.lower().removeprefix('www.') for t in (c.get('title','') for c in chunks) if '.' in t and '/' not in t and ' ' not in t}
    return _json(text),grounded
_key=lambda url:re.sub(r'^https?://(www\.)?','',(url or '').split('#')[0].split('?')[0].rstrip('/').lower())
async def research(request:ResearchRequest,creds:tuple[str,str],gemini:str)->Review:
    """Three passes. Structured sources (Wikipedia's reception section, the Guardian and NYT APIs) and a Google-grounded search
    find the reviews; then every review page we can open is read and a sentence is quoted from it, checked word for word."""
    language=LANGS[request.language];by=' by '+request.author if request.author else ''
    found,searched=await asyncio.gather(reception.gather(request.title,request.author,request.isbn),
        _ask(PROMPT.format(title=request.title,by=by,year=' ('+request.year+')' if request.year else '',language=language),creds,gemini,search=True))
    try:review=clean(searched[0],searched[1],creds[1])
    except (ValueError,KeyError,TypeError):raise HTTPException(502,'The research answer was incomplete or unreadable. Try again.') from None
    critics:list[dict]=[]
    for c in found['critics']+[c.model_dump() for c in review.critics]:
        if c.get('url') and any(_key(c['url'])==_key(x.get('url')) for x in critics):continue
        critics.append({**c,'via':c.get('via') or 'Web search'})
    # Read the pages; Wikipedia's own quotes are already checked against the article.
    todo=[c for c in critics if c.get('url') and not (c.get('via')=='Wikipedia' and c.get('excerpt'))][:12]
    texts=await asyncio.gather(*(reception.page_text(c['url']) for c in todo))
    pages=[(c,t) for c,t in zip(todo,texts) if t]
    if pages:
        listing='\n\n'.join(f'PAGE {i+1} ({c["publication"]}, {c["url"]}):\n{t[:7000]}' for i,(c,t) in enumerate(pages))
        try:
            picked,_=await _ask(PICK.format(title=request.title,by=by,language=language,pages=listing),creds,gemini,tokens=8192)
            for r in picked.get('reviews') or []:
                if not isinstance(r,dict) or not isinstance(r.get('n'),int) or not 0<r['n']<=len(pages):continue
                c,t=pages[r['n']-1]
                if r.get('relevant') is False:c['drop']=True;continue
                excerpt=_verbatim(r.get('excerpt'))
                if excerpt and reception._norm(excerpt) in reception._norm(t):c['excerpt']=excerpt;c['verified']=True
                elif c.get('via')!='Wikipedia':c['excerpt']='';c['verified']=None
                if r.get('stance') in ('positive','mixed','negative'):c['stance']=r['stance']
                c['summary']=_text(r.get('summary'),600) or c.get('summary','')
                c['translation']=_text(r.get('translation'),600) if excerpt else ''
                if not c.get('reviewer') and r.get('reviewer'):c['reviewer']=_text(r['reviewer'],120)
        except (HTTPException,ValueError,KeyError,TypeError,httpx.HTTPError):pass
    # Quotes from pages we could not open are checked as far as we can.
    await reception.verify([c for c in critics if not c.get('drop')])
    kept=[c for c in critics if not c.get('drop') and (c.get('excerpt') or c.get('summary'))]
    kept.sort(key=lambda c:(c.get('verified') is not True,not c.get('excerpt')))
    fields=('publication','reviewer','date','headline','stance','excerpt','summary','url','translation','via','verified')
    review=review.model_copy(update={'critics':[Critic(**{k:(c.get(k) if k!='publication' else (c.get(k) or 'Review')) for k in fields if c.get(k) is not None or k=='verified'}) for c in kept[:8]]})
    review=review.model_copy(update={'searched':[Searched(**n) for n in found['notes']]+[Searched(source='Web search',found=sum(1 for c in kept if c.get('via')=='Web search'))]})
    for c in review.critics:
        if c.url and not any(_key(s.url)==_key(c.url) for s in review.sources):review.sources.append(Source(name=c.publication,url=c.url))
    photo=await portrait(request.author) if request.author else None
    return review.model_copy(update={'authorImage':Portrait(**photo)}) if photo else review
