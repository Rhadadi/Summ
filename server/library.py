"""The public library: published summaries, covers, and narration. The original book text is never stored here."""
from __future__ import annotations
import json,os,re,threading,time,unicodedata,uuid
from pathlib import Path
from typing import Literal
from pydantic import BaseModel,ConfigDict,Field,model_validator
from . import accounts,audio
Language=Literal['en','fa','de','ar','es','fr','tr','zh']
MAX_DOC=4_000_000
SCHEMA='''CREATE TABLE IF NOT EXISTS library(id TEXT PRIMARY KEY,slug TEXT UNIQUE NOT NULL,owner_id TEXT NOT NULL,title TEXT NOT NULL,author TEXT NOT NULL DEFAULT '',doc TEXT NOT NULL,visibility TEXT NOT NULL,cover_type TEXT,created REAL NOT NULL,updated REAL NOT NULL);
CREATE TABLE IF NOT EXISTS narration(book_id TEXT NOT NULL REFERENCES library(id) ON DELETE CASCADE,language TEXT NOT NULL,status TEXT NOT NULL,done INTEGER NOT NULL DEFAULT 0,total INTEGER NOT NULL DEFAULT 0,tracks TEXT NOT NULL DEFAULT '[]',error TEXT NOT NULL DEFAULT '',updated REAL NOT NULL,PRIMARY KEY(book_id,language));'''
class Strict(BaseModel):model_config=ConfigDict(extra='forbid')
class Para(Strict):
    heading:str|None=Field(default=None,max_length=200)
    text:str=Field(min_length=1,max_length=12000)
    pages:list[int]=Field(default=[],max_length=60)
    chapters:list[str]=Field(default=[],max_length=60)
    @model_validator(mode='after')
    def sane(self):
        if any(p<1 or p>50000 for p in self.pages) or any(len(c)>200 for c in self.chapters):raise ValueError('Invalid reference.')
        return self
class Section(Strict):
    kind:str=Field(max_length=40);title:str=Field(min_length=1,max_length=200);items:list[Para]=Field(max_length=200)
class Guide(Strict):type_label:str=Field(max_length=80);sections:list[Section]=Field(max_length=20)
class Overview(Strict):paragraphs:list[Para]=Field(max_length=100);takeaways:list[Para]=Field(default=[],max_length=30)
class ChapterText(Strict):paragraphs:list[Para]=Field(max_length=150);review:list[Para]=Field(default=[],max_length=100)
class Version(Strict):
    language:Language;type:str=Field(pattern=r'^[a-z][a-z0-9_-]{1,39}$');label:str=Field(min_length=1,max_length=80)
    model:str=Field(default='',max_length=100);createdAt:float=0
    overview:Overview|None=None;guide:Guide|None=None;chapters:dict[str,ChapterText]=Field(max_length=500)
class Chapter(Strict):
    id:str=Field(min_length=1,max_length=200)
    title:dict[str,str]=Field(min_length=1,max_length=8)
    group:Literal['main','front','back']='main'
class Doc(Strict):
    title:dict[str,str]=Field(min_length=1,max_length=8)
    author:str=Field(default='',max_length=500)
    originalLanguage:str=Field(default='en',max_length=8)
    chapters:list[Chapter]=Field(min_length=1,max_length=500)
    versions:list[Version]=Field(min_length=1,max_length=24)
    info:dict|None=None
    @model_validator(mode='after')
    def consistent(self):
        ids={c.id for c in self.chapters}
        if len(ids)!=len(self.chapters):raise ValueError('Chapter IDs must be unique.')
        if any(len(t)>1000 for t in self.title.values()) or any(len(t)>1000 for c in self.chapters for t in c.title.values()):raise ValueError('Title too long.')
        for v in self.versions:
            if not set(v.chapters)<=ids:raise ValueError('A summary refers to an unknown chapter.')
        return self
class PublishRequest(Strict):
    id:str|None=Field(default=None,max_length=64)
    doc:Doc
    visibility:Literal['public','unlisted']='public'
accounts.EXTRA_SCHEMA.append(SCHEMA)
def _db():return accounts._db()
def q(sql:str,args:tuple=()):
    with accounts._lock:return _db().execute(sql,args).fetchall()
def _slug(title:str,book_id:str)->str:
    base=unicodedata.normalize('NFKD',title).encode('ascii','ignore').decode().lower()
    base=re.sub(r'[^a-z0-9]+','-',base).strip('-')[:48] or 'book'
    return base+'-'+book_id[:6]
def _title(doc:dict)->str:return doc['title'].get(doc.get('originalLanguage','en')) or next(iter(doc['title'].values()))
def _public(row)->dict:
    id_,slug,title,author,visibility,cover,updated,doc=row
    d=json.loads(doc)
    return {'id':id_,'slug':slug,'title':title,'titles':d['title'],'author':author,'visibility':visibility,'cover':'/api/library/'+id_+'/cover' if cover else None,'updated':updated,
            'languages':sorted({v['language'] for v in d['versions']}),'types':sorted({v['type'] for v in d['versions']}),'chapters':len(d['chapters'])}
COLUMNS='id,slug,title,author,visibility,cover_type,updated,doc'
def publish(user:dict,request:PublishRequest)->dict:
    doc=request.doc.model_dump(exclude_none=True)
    raw=json.dumps(doc,ensure_ascii=False)
    if len(raw)>MAX_DOC:raise accounts.AccountError(413,'This summary is too large to publish. Publish fewer chapters or versions.')
    now=time.time();title=_title(doc)
    if request.id:
        rows=q('SELECT owner_id FROM library WHERE id=?',(request.id,))
        if not rows:raise accounts.AccountError(404,'That published book no longer exists.')
        if rows[0][0]!=user['id'] and user['role']!='owner':raise accounts.AccountError(403,'You can only update books you published.')
        q('UPDATE library SET title=?,author=?,doc=?,visibility=?,updated=? WHERE id=?',(title,doc.get('author',''),raw,request.visibility,now,request.id));book_id=request.id
    else:
        book_id=str(uuid.uuid4());q('INSERT INTO library(id,slug,owner_id,title,author,doc,visibility,created,updated) VALUES(?,?,?,?,?,?,?,?,?)',(book_id,_slug(title,book_id),user['id'],title,doc.get('author',''),raw,request.visibility,now,now))
    return get(book_id,include_private=True)
def get(key:str,include_private:bool=False)->dict:
    rows=q('SELECT '+COLUMNS+' FROM library WHERE id=? OR slug=?',(key,key))
    if not rows:raise accounts.AccountError(404,'This book is not in the library.')
    out=_public(rows[0]);out['doc']=json.loads(rows[0][7]);return out
def listing(owner_id:str|None=None)->list[dict]:
    if owner_id:rows=q('SELECT '+COLUMNS+' FROM library WHERE owner_id=? ORDER BY updated DESC',(owner_id,))
    else:rows=q("SELECT "+COLUMNS+" FROM library WHERE visibility='public' ORDER BY updated DESC")
    return [_public(r) for r in rows]
def listing_all()->list[dict]:
    return [_public(r) for r in q('SELECT '+COLUMNS+' FROM library ORDER BY updated DESC')]
def owner_of(book_id:str)->str|None:
    rows=q('SELECT owner_id FROM library WHERE id=?',(book_id,));return rows[0][0] if rows else None
def remove(book_id:str):
    q('DELETE FROM library WHERE id=?',(book_id,))
    import shutil
    for sub in ('covers','audio'):
        target=_dir(sub)/book_id
        if target.is_dir():shutil.rmtree(target,ignore_errors=True)
        elif target.exists():target.unlink()
def set_visibility(book_id:str,visibility:str):q('UPDATE library SET visibility=?,updated=? WHERE id=?',(visibility,time.time(),book_id))
def _dir(name:str)->Path:
    path=Path(os.getenv('SUMM_DATA_DIR','data'))/name;path.mkdir(parents=True,exist_ok=True);return path
IMAGE_TYPES={b'\xff\xd8\xff':'image/jpeg',b'\x89PNG':'image/png',b'RIFF':'image/webp'}
def save_cover(book_id:str,data:bytes)->str:
    kind=next((t for sig,t in IMAGE_TYPES.items() if data.startswith(sig)),None)
    if not kind or len(data)>1_500_000 or len(data)<500:raise accounts.AccountError(422,'Use a JPEG, PNG, or WebP cover under 1.5 MB.')
    (_dir('covers')/book_id).write_bytes(data);q('UPDATE library SET cover_type=? WHERE id=?',(kind,book_id));return kind
def cover(book_id:str)->tuple[bytes,str]|None:
    rows=q('SELECT cover_type FROM library WHERE id=?',(book_id,));path=_dir('covers')/book_id
    return (path.read_bytes(),rows[0][0]) if rows and rows[0][0] and path.exists() else None
# ---- narration: generated once by the owner or an editor, then served as static files
def _say(p:dict)->str:return (p['heading']+'. ' if p.get('heading') else '')+p['text']
def narration_tracks(doc:dict,language:str,kind:str|None)->list[dict]:
    version=next((v for v in doc['versions'] if v['language']==language and (kind is None or v['type']==kind)),None)
    if not version:raise accounts.AccountError(404,'No summary exists in this language.')
    items=[]
    if version.get('overview'):items.append({'title':'Overview','chapterId':None,'text':'\n\n'.join(_say(p) for p in version['overview']['paragraphs'])})
    for c in doc['chapters']:
        body=version['chapters'].get(c['id'])
        if body:
            title=c['title'].get(language) or next(iter(c['title'].values()))
            items.append({'title':title,'chapterId':c['id'],'text':title+'.\n\n'+'\n\n'.join(_say(p) for p in body['paragraphs'])})
    tracks=[]
    for item in items:
        current=''
        for para in item['text'].split('\n\n'):
            if current and len(current)+len(para)>4000:tracks.append({**item,'text':current});current=''
            current+=('\n\n' if current else '')+para[:4400]
        if current:tracks.append({**item,'text':current})
    return tracks
_running:set[tuple[str,str]]=set()
def start_narration(book_id:str,language:str,kind:str|None):
    doc=get(book_id)['doc'];tracks=narration_tracks(doc,language,kind)
    if (book_id,language) in _running:raise accounts.AccountError(409,'Narration is already being prepared.')
    if language not in audio.PIPER_VOICES:raise accounts.AccountError(422,'There is no offline voice for this language yet.')
    q('INSERT OR REPLACE INTO narration(book_id,language,status,done,total,tracks,error,updated) VALUES(?,?,?,?,?,?,?,?)',(book_id,language,'running',0,len(tracks),'[]','',time.time()))
    _running.add((book_id,language))
    threading.Thread(target=_narrate,args=(book_id,language,tracks),daemon=True).start()
def _narrate(book_id:str,language:str,tracks:list[dict]):
    folder=_dir('audio')/book_id/language;folder.mkdir(parents=True,exist_ok=True)
    for old in folder.glob('*.mp3'):old.unlink()
    manifest=[]
    try:
        for i,t in enumerate(tracks):
            (folder/(str(i)+'.mp3')).write_bytes(audio.piper_mp3(t['text'],language))
            manifest.append({'title':t['title'],'chapterId':t['chapterId'],'file':str(i)+'.mp3'})
            q('UPDATE narration SET done=?,tracks=?,updated=? WHERE book_id=? AND language=?',(i+1,json.dumps(manifest),time.time(),book_id,language))
        q('UPDATE narration SET status=?,updated=? WHERE book_id=? AND language=?',('ready',time.time(),book_id,language))
    except Exception as error:  # noqa: BLE001 - reported to the owner, never crashes the server
        q('UPDATE narration SET status=?,error=?,updated=? WHERE book_id=? AND language=?',('failed',str(error)[:300],time.time(),book_id,language))
    finally:_running.discard((book_id,language))
def narration_status(book_id:str,language:str)->dict:
    rows=q('SELECT status,done,total,tracks,error FROM narration WHERE book_id=? AND language=?',(book_id,language))
    if not rows:return {'status':'none','done':0,'total':0,'tracks':[]}
    status,done,total,tracks,error=rows[0]
    return {'status':status,'done':done,'total':total,'error':error,'tracks':[{'title':t['title'],'chapterId':t['chapterId'],'url':f"/api/library/{book_id}/audio/{language}/{t['file']}"} for t in json.loads(tracks)]}
def audio_path(book_id:str,language:str,name:str)->Path|None:
    if not re.fullmatch(r'\d{1,4}\.mp3',name) or language not in audio.PIPER_VOICES:return None
    if not re.fullmatch(r'[0-9a-f-]{36}',book_id):return None
    path=_dir('audio')/book_id/language/name;return path if path.is_file() else None
def reset_jobs():
    # A restart interrupts any narration in progress; say so instead of showing it as running forever.
    try:q("UPDATE narration SET status='failed',error='Interrupted by a server restart. Start it again.' WHERE status='running'")
    except Exception:pass  # noqa: BLE001
