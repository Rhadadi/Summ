"""A book's critical reception: gathered by Gemini with Google Search, then checked and approved by a person before it is published."""
from __future__ import annotations
import json,re,time
from typing import Literal
from urllib.parse import urlsplit
import httpx
from fastapi import HTTPException
from pydantic import BaseModel,ConfigDict,Field,field_validator

class Strict(BaseModel):model_config=ConfigDict(extra='forbid')
def _https(url:str|None)->str|None:
    if not url:return None
    parts=urlsplit(url.strip())
    return url.strip() if parts.scheme=='https' and parts.netloc and len(url)<=600 else None
class Quote(Strict):
    text:str=Field(min_length=3,max_length=400);who:str=Field(default='',max_length=120);source:str=Field(default='',max_length=120);url:str|None=Field(default=None,max_length=600)
    _u=field_validator('url')(lambda v:_https(v))
class Source(Strict):
    name:str=Field(min_length=1,max_length=120);url:str=Field(max_length=600)
    _u=field_validator('url')(lambda v:_https(v) or (_ for _ in ()).throw(ValueError('Links must use https.')))
class Rating(Strict):
    value:float=Field(ge=0,le=5);source:str=Field(max_length=80);count:int|None=Field(default=None,ge=0,le=500_000_000);url:str|None=Field(default=None,max_length=600)
    _u=field_validator('url')(lambda v:_https(v))
class Review(Strict):
    verdict:str=Field(default='',max_length=800)
    rating:Rating|None=None
    pros:list[str]=Field(default=[],max_length=8);cons:list[str]=Field(default=[],max_length=8)
    quotes:list[Quote]=Field(default=[],max_length=8);sources:list[Source]=Field(default=[],max_length=12)
    model:str=Field(default='',max_length=100);createdAt:float=0
    @field_validator('pros','cons')
    @classmethod
    def short(cls,v):
        if any(not isinstance(x,str) or len(x)>300 for x in v):raise ValueError('Each point must be short.')
        return v
class ResearchRequest(Strict):
    title:str=Field(min_length=1,max_length=300);author:str=Field(default='',max_length=300);year:str=Field(default='',max_length=20)
    language:Literal['en','fa','de','ar','es','fr','tr','zh']='en'
LANGS={'en':'English','fa':'Persian','de':'German','ar':'Arabic','es':'Spanish','fr':'French','tr':'Turkish','zh':'Chinese'}
PROMPT='''Use Google Search to research how readers and critics received the book "{title}"{by}{year}.
Find: (1) the average reader rating and its number of ratings on Goodreads or another large reader site; (2) what well-known reviewers and publications such as The New York Times, The Guardian, academic journals or other respected outlets said; (3) praise and criticism that recur among readers.
Return ONE JSON object and nothing else, with this shape:
{{"verdict": one or two sentences summarizing the reception, in {language},
 "rating": {{"value": number from 0 to 5, "source": "Goodreads", "count": integer or null, "url": "https://..."}} or null,
 "pros": up to 6 short strengths readers and critics name, in {language},
 "cons": up to 6 short weaknesses they name, in {language},
 "quotes": up to 6 objects {{"text": a SHORT verbatim excerpt of at most 25 words copied from a page you found, in its original language, "who": reviewer or reader name, "source": publication or site, "url": "https://..." of the page}},
 "sources": up to 8 objects {{"name": publication or site, "url": "https://..."}}}}
Rules: use only what the search results show. Never invent a quote, number, reviewer or link. If you cannot find a rating, set "rating" to null. Prefer excerpts from named critics and top reader reviews. Every url must be a page you actually found.'''
def _json(text:str)->dict:
    text=re.sub(r'^```(?:json)?|```$','',text.strip(),flags=re.M).strip()
    start=text.find('{');end=text.rfind('}')
    if start<0 or end<start:raise ValueError('no json')
    data=json.loads(text[start:end+1])
    if not isinstance(data,dict):raise ValueError('not an object')
    return data
def _host(url:str)->str:return (urlsplit(url).hostname or '').lower().removeprefix('www.')
def clean(raw:dict,grounded:set[str],model:str)->Review:
    """Keep only what the search actually touched: a link survives only when its site appeared in the search results."""
    ok=lambda url:bool(url) and any(_host(url)==d or _host(url).endswith('.'+d) or d.endswith('.'+_host(url)) for d in grounded)
    def link(url):return url if _https(url) and ok(url) else None
    quotes=[]
    for q in raw.get('quotes') or []:
        if not isinstance(q,dict) or not isinstance(q.get('text'),str):continue
        text=' '.join(q['text'].split()).strip('"“” ')
        if len(text.split())>28 or len(text)<8 or not str(q.get('who') or q.get('source') or '').strip():continue
        quotes.append({'text':text,'who':str(q.get('who') or '')[:120],'source':str(q.get('source') or '')[:120],'url':link(q.get('url'))})
    sources=[{'name':str(s.get('name') or _host(s['url']))[:120],'url':s['url']} for s in raw.get('sources') or [] if isinstance(s,dict) and isinstance(s.get('url'),str) and link(s['url'])]
    rating=None;r=raw.get('rating')
    if isinstance(r,dict):
        try:
            value=float(r.get('value'))
            if 0<value<=5:rating={'value':round(value,2),'source':str(r.get('source') or '')[:80],'count':int(r['count']) if isinstance(r.get('count'),(int,float)) and r['count']>=0 else None,'url':link(r.get('url'))}
        except (TypeError,ValueError):rating=None
    points=lambda v:[' '.join(x.split())[:300] for x in (v or []) if isinstance(x,str) and x.strip()][:8]
    return Review(verdict=' '.join(str(raw.get('verdict') or '').split())[:800],rating=rating,pros=points(raw.get('pros')),cons=points(raw.get('cons')),quotes=quotes[:8],sources=sources[:12],model=model,createdAt=time.time())
async def research(request:ResearchRequest,creds:tuple[str,str],gemini:str)->Review:
    key,model=creds
    prompt=PROMPT.format(title=request.title,by=' by '+request.author if request.author else '',year=' ('+request.year+')' if request.year else '',language=LANGS[request.language])
    payload={'contents':[{'role':'user','parts':[{'text':prompt}]}],'tools':[{'google_search':{}}],'generationConfig':{'temperature':0.2,'maxOutputTokens':8192}}
    try:
        async with httpx.AsyncClient(timeout=180) as client:
            response=await client.post(gemini+model+':generateContent',headers={'x-goog-api-key':key},json=payload)
        if response.status_code==429:raise HTTPException(429,'Your Gemini quota is exhausted or the model is busy.')
        if response.status_code in (400,401,403,404):raise HTTPException(502,'Google rejected the request. Check your API key and model in Account (the model must support Google Search).')
        response.raise_for_status();data=response.json();candidate=data['candidates'][0]
        text=''.join(p.get('text','') for p in candidate['content']['parts'] if not p.get('thought'))
        chunks=[c['web'] for c in (candidate.get('groundingMetadata') or {}).get('groundingChunks',[]) if c.get('web')]
        # Search results name their site by domain, for example "goodreads.com".
        grounded={t.lower().removeprefix('www.') for t in (c.get('title','') for c in chunks) if '.' in t and '/' not in t and ' ' not in t}
        return clean(_json(text),grounded,model)
    except HTTPException:raise
    except (httpx.HTTPError,ValueError,KeyError,IndexError,TypeError):
        raise HTTPException(502,'The research answer was incomplete or unreadable. Try again.') from None
