"""The public library: published summaries, covers, and narration. The original book text is never stored here."""
from __future__ import annotations
import hashlib,json,os,re,secrets,sqlite3,threading,time,unicodedata,uuid
from pathlib import Path
from typing import Annotated,Literal
from pydantic import BaseModel,ConfigDict,Field,StringConstraints,model_validator
from . import accounts,audio
from .reviews import Review
from .inline import strip_inline
from .names import names_for
Language=Literal['en','fa','de','ar','es','fr','tr','zh']
MAX_DOC=4_000_000
SCHEMA='''CREATE TABLE IF NOT EXISTS library(id TEXT PRIMARY KEY,slug TEXT UNIQUE NOT NULL,owner_id TEXT NOT NULL,title TEXT NOT NULL,author TEXT NOT NULL DEFAULT '',doc TEXT NOT NULL,visibility TEXT NOT NULL,cover_type TEXT,created REAL NOT NULL,updated REAL NOT NULL);
CREATE TABLE IF NOT EXISTS narration(book_id TEXT NOT NULL REFERENCES library(id) ON DELETE CASCADE,language TEXT NOT NULL,status TEXT NOT NULL,done INTEGER NOT NULL DEFAULT 0,total INTEGER NOT NULL DEFAULT 0,tracks TEXT NOT NULL DEFAULT '[]',error TEXT NOT NULL DEFAULT '',updated REAL NOT NULL,PRIMARY KEY(book_id,language));
CREATE TABLE IF NOT EXISTS slug_alias(slug TEXT PRIMARY KEY,book_id TEXT NOT NULL REFERENCES library(id) ON DELETE CASCADE);'''
class Strict(BaseModel):model_config=ConfigDict(extra='forbid')
class Figure(Strict):
    name:str=Field(pattern=r'^[a-z0-9][a-z0-9._-]{0,60}\.(?:png|jpe?g|webp)$');alt:str=Field(default='',max_length=300)
class Para(Strict):
    heading:str|None=Field(default=None,max_length=200)
    text:str=Field(min_length=1,max_length=12000)
    pages:list[int]=Field(default=[],max_length=60)
    chapters:list[str]=Field(default=[],max_length=60)
    quote:bool=False
    table:list[list[str]]|None=Field(default=None,max_length=60)
    image:'Figure|None'=None
    @model_validator(mode='after')
    def sane(self):
        if any(p<1 or p>50000 for p in self.pages) or any(len(c)>200 for c in self.chapters):raise ValueError('Invalid reference.')
        if self.table and any(len(r)>20 or any(len(c)>500 for c in r) for r in self.table):raise ValueError('Table too large.')
        return self
class Section(Strict):
    kind:str=Field(max_length=40);title:str=Field(min_length=1,max_length=200);items:list[Para]=Field(max_length=200)
class Guide(Strict):type_label:str=Field(max_length=80);sections:list[Section]=Field(max_length=20)
# A long chapter of a scholarly book can run to a few hundred short paragraphs (headings, quotations, verses); the whole document is still capped by MAX_DOC.
class Overview(Strict):paragraphs:list[Para]=Field(max_length=200);takeaways:list[Para]=Field(default=[],max_length=30)
class ChapterText(Strict):paragraphs:list[Para]=Field(max_length=400);review:list[Para]=Field(default=[],max_length=200)
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
    review:Review|None=None
    # the editor's choice from the fixed category list (src/categories.ts); none means guessed from the tags
    categories:list[Annotated[str,StringConstraints(pattern=r'^[a-z]{2,20}$')]]|None=Field(default=None,max_length=4)
    # the author's name as readers of each language write it (Persian script for fa); none means the stored list or the original
    authorNames:dict[Language,Annotated[str,StringConstraints(max_length=200)]]|None=None
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
    # The rev the editor loaded. When it no longer matches, someone else saved in between and the save is refused (409) instead of silently overwriting.
    base:str|None=Field(default=None,pattern=r'^[0-9a-f]{16}$')
accounts.EXTRA_SCHEMA.append(SCHEMA)
def _migrate(db:sqlite3.Connection):
    """Columns added after the first release. engine: which voice made the audio; type: which summary version it narrates ('' for older rows, which match any); settings: voice settings used."""
    have={r[1] for r in db.execute('PRAGMA table_info(narration)')}
    for column,sql in (('engine',"ALTER TABLE narration ADD COLUMN engine TEXT NOT NULL DEFAULT 'offline'"),('type',"ALTER TABLE narration ADD COLUMN type TEXT NOT NULL DEFAULT ''"),('settings',"ALTER TABLE narration ADD COLUMN settings TEXT NOT NULL DEFAULT '{}'")):
        if column not in have:db.execute(sql)
accounts.EXTRA_MIGRATIONS.append(_migrate)
def _db():return accounts._db()
def q(sql:str,args:tuple=()):
    with accounts._lock:return _db().execute(sql,args).fetchall()
_LATIN={'آ':'a','ا':'a','أ':'a','إ':'e','ب':'b','پ':'p','ت':'t','ث':'s','ج':'j','چ':'ch','ح':'h','خ':'kh','د':'d','ذ':'z','ر':'r','ز':'z','ژ':'zh','س':'s',
 'ش':'sh','ص':'s','ض':'z','ط':'t','ظ':'z','ع':'','غ':'gh','ف':'f','ق':'q','ک':'k','ك':'k','گ':'g','ل':'l','م':'m','ن':'n','و':'v','ه':'h','ة':'h','ی':'i','ي':'i',
 'ى':'a','ئ':'y','ؤ':'o','ء':'','\u200c':''}
def _slug(title:str,taken=lambda slug:False)->str:
    """A link that survives every app: Latin letters only, from the main title (before a colon or question mark).
    Persian or Arabic text, used only when a book has no English title, is spelled out in Latin letters. A second book
    with the same title gets -2, -3."""
    def latin(t):
        t=re.sub(r'(?<!\S)و(?!\S)','va',unicodedata.normalize('NFKC',t))  # the word "and"
        t=re.sub(r"['’‘`ʼ]",'',t)  # Qur'an, Triathlete's: one word, not two
        t=''.join(_LATIN.get(ch,ch) for ch in t)
        return re.sub(r'[^a-z0-9]+','-',unicodedata.normalize('NFKD',t).encode('ascii','ignore').decode().lower()).strip('-')
    main=re.split(r'\s*[:：؟?]',title.strip())[0]
    base=latin(main) if len(latin(main))>=3 else latin(title)
    if len(base)>60:base=base[:60].rsplit('-',1)[0]
    base=base or 'book';slug,n=base,1
    while taken(slug):n+=1;slug=f'{base}-{n}'
    return slug
def _slug_title(doc:dict)->str:
    """The English title when there is one (it gives a link people can read anywhere), else the original."""
    return doc['title'].get('en') or _title(doc)
def _slug_taken(slug:str,db=None)->bool:
    run=(db.execute if db else lambda sql,args:q(sql,args))
    rows=run('SELECT 1 FROM library WHERE slug=? OR id=? UNION SELECT 1 FROM slug_alias WHERE slug=?',(slug,slug,slug))
    return bool(list(rows))
def _readable_slugs(db:sqlite3.Connection):
    """Links were book-dab5e9 and then, briefly, Persian words (which turn into %D9%82... when shared). Each book gets its
    Latin link once; every earlier one stays an alias, so links already shared keep working."""
    if not {'slug','title','doc'}<={r[1] for r in db.execute('PRAGMA table_info(library)')}:return
    for book_id,slug,doc in db.execute('SELECT id,slug,doc FROM library').fetchall():
        if slug.isascii() and not slug.endswith('-'+book_id[:6]) and not re.search(r'-(?:s|an|t|re|ll|d)(?:-|$)',slug):continue
        new=_slug(_slug_title(json.loads(doc)),lambda s:s!=slug and _slug_taken(s,db))
        if new==slug:continue
        db.execute('INSERT OR IGNORE INTO slug_alias(slug,book_id) VALUES(?,?)',(slug,book_id));db.execute('UPDATE library SET slug=? WHERE id=?',(new,book_id))
accounts.EXTRA_MIGRATIONS.append(_readable_slugs)
def _title(doc:dict)->str:return doc['title'].get(doc.get('originalLanguage','en')) or next(iter(doc['title'].values()))
def _blurb(d:dict)->str:
    """One short teaser for the home page: the first overview paragraph, else the publisher or Wikipedia text."""
    text=''
    for v in d['versions']:
        paras=(v.get('overview') or {}).get('paragraphs') or []
        if paras:text=strip_inline(paras[0]['text']);break
    info=d.get('info') or {}
    text=text or info.get('description') or (info.get('wikipedia') or {}).get('extract') or ''
    text=' '.join(text.split())
    if len(text)<=240:return text
    cut=text[:240];end=max(cut.rfind('. '),cut.rfind('؟ '),cut.rfind('。'))
    return cut[:end+1] if end>120 else cut[:cut.rfind(' ')]+'…'
def _rating(d:dict):
    """The score shown on the home page: the approved review's rating, else the best-known public one."""
    rv=(d.get('review') or {}).get('rating')
    if rv:return {'source':rv.get('source',''),'rating':rv['value'],'count':rv.get('count')}
    rs=[r for r in ((d.get('info') or {}).get('ratings') or []) if r.get('rating')]
    if not rs:return None
    r=max(rs,key=lambda x:x.get('count') or 0)
    return {'source':r.get('source',''),'rating':r['rating'],'count':r.get('count')}
def _slide(book_id:str)->dict:
    from . import artwork
    return artwork.slide(book_id)
def _audio_map()->dict[str,list[str]]:
    """Languages that have audio for each book, in one query: the book list uses it to show Listen only where there is something to hear."""
    out:dict[str,list[str]]={}
    for book_id,language in q("SELECT book_id,language FROM narration WHERE tracks!='[]' ORDER BY language"):out.setdefault(book_id,[]).append(language)
    return out
TAG_STOP={'aspects','psychological','will','free','general','nonfiction','non-fiction','fiction','book','books','other','and','the','for','with'}
def _tags(d:dict)->list[str]:
    """Up to 6 category words plus the review's themes, lower-cased: what "If you liked this book" compares between two books."""
    words:list[str]=[]
    for c in (d.get('info') or {}).get('categories') or []:
        for w in re.split(r'[\s/&,>:.;()-]+',c.lower()):
            if len(w)>=4 and w not in TAG_STOP and w not in words:words.append(w)
    themes=[' '.join(t.lower().split()) for t in ((d.get('review') or {}).get('themes') or []) if isinstance(t,str) and t.strip()]
    return words[:6]+[t for t in themes if t not in words][:6]
def _public(row,audio_map:dict[str,list[str]]|None=None)->dict:
    id_,slug,title,author,visibility,cover,updated,doc=row
    d=json.loads(doc)
    return {'id':id_,'slug':slug,'title':title,'titles':d['title'],'author':author,'visibility':visibility,'cover':'/api/library/'+id_+'/cover?v='+str(int(updated)) if cover else None,'updated':updated,
            'languages':sorted({v['language'] for v in d['versions']}),'audio':(audio_map if audio_map is not None else _audio_map()).get(id_,[]),'blurb':_blurb(d),'tags':_tags(d),'categories':d.get('categories') or [],'authorNames':names_for(author,d.get('authorNames')),'rating':_rating(d),'slide':_slide(id_),'year':(d.get('info') or {}).get('year') or '','types':sorted({v['type'] for v in d['versions']}),'chapters':sum(c.get('group','main')=='main' and not any(re.match(r'^(?:title pages?|front matter|صفحات عنوان|صفحهٔ عنوان|صفحه عنوان|فهرست مطالب|پیشگفتار|پیش‌گفتار)',t.strip(),re.I) for t in c['title'].values()) for c in d['chapters'])}
COLUMNS='id,slug,title,author,visibility,cover_type,updated,doc'
def rev_of(raw:str)->str:return hashlib.sha256(raw.encode()).hexdigest()[:16]
def publish(user:dict,request:PublishRequest)->dict:
    doc=request.doc.model_dump(exclude_none=True)
    raw=json.dumps(doc,ensure_ascii=False)
    if len(raw)>MAX_DOC:raise accounts.AccountError(413,'This summary is too large to publish. Publish fewer chapters or versions.')
    now=time.time();title=_title(doc)
    if request.id:
        with accounts._lock:  # the check and the write are one step, so two saves cannot both pass
            rows=q('SELECT owner_id,doc FROM library WHERE id=?',(request.id,))
            if not rows:raise accounts.AccountError(404,'That published book no longer exists.')
            if rows[0][0]!=user['id'] and user['role']!='owner':raise accounts.AccountError(403,'You can only update books you published.')
            if request.base and request.base!=rev_of(rows[0][1]):raise accounts.AccountError(409,'This book was changed somewhere else after you opened it. Load the latest version, then save again.')
            q('UPDATE library SET title=?,author=?,doc=?,visibility=?,updated=? WHERE id=?',(title,doc.get('author',''),raw,request.visibility,now,request.id));book_id=request.id
    else:
        book_id=str(uuid.uuid4());q('INSERT INTO library(id,slug,owner_id,title,author,doc,visibility,created,updated) VALUES(?,?,?,?,?,?,?,?,?)',(book_id,_slug(_slug_title(doc),_slug_taken),user['id'],title,doc.get('author',''),raw,request.visibility,now,now))
    return get(book_id,include_private=True)
def get(key:str,include_private:bool=False)->dict:
    rows=q('SELECT '+COLUMNS+' FROM library WHERE id=? OR slug=? OR id=(SELECT book_id FROM slug_alias WHERE slug=?)',(key,key,key))
    if not rows:raise accounts.AccountError(404,'This book is not in the library.')
    out=_public(rows[0],{rows[0][0]:[r[0] for r in q("SELECT language FROM narration WHERE book_id=? AND tracks!='[]' ORDER BY language",(rows[0][0],))]});out['doc']=json.loads(rows[0][7]);out['rev']=rev_of(rows[0][7]);return out
def listing(owner_id:str|None=None)->list[dict]:
    if owner_id:rows=q('SELECT '+COLUMNS+' FROM library WHERE owner_id=? ORDER BY updated DESC',(owner_id,))
    else:rows=q("SELECT "+COLUMNS+" FROM library WHERE visibility='public' ORDER BY updated DESC")
    audio_map=_audio_map();return [_public(r,audio_map) for r in rows]
def listing_all()->list[dict]:
    audio_map=_audio_map();return [_public(r,audio_map) for r in q('SELECT '+COLUMNS+' FROM library ORDER BY updated DESC')]
def owner_of(book_id:str)->str|None:
    rows=q('SELECT owner_id FROM library WHERE id=?',(book_id,));return rows[0][0] if rows else None
def remove(book_id:str):
    q('DELETE FROM library WHERE id=?',(book_id,))
    import shutil
    from . import artwork
    artwork.remove(book_id)
    for sub in ('covers','audio','figures'):
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
    (_dir('covers')/book_id).write_bytes(data);q('UPDATE library SET cover_type=?,updated=? WHERE id=?',(kind,time.time(),book_id));return kind
def remove_cover(book_id:str):
    (_dir('covers')/book_id).unlink(missing_ok=True)
    q('UPDATE library SET cover_type=NULL,updated=? WHERE id=?',(time.time(),book_id))
FIGURE_NAME=re.compile(r'^[a-z0-9][a-z0-9._-]{0,60}\.(?:png|jpe?g|webp)$')
def save_figure(book_id:str,name:str,data:bytes):
    kind=next((t for sig,t in IMAGE_TYPES.items() if data.startswith(sig)),None)
    if not FIGURE_NAME.match(name) or not kind or len(data)>1_500_000 or len(data)<100:raise accounts.AccountError(422,'Use a PNG, JPEG or WebP figure under 1.5 MB.')
    folder=_dir('figures')/book_id;folder.mkdir(parents=True,exist_ok=True)
    if len(list(folder.iterdir()))>=120 and not (folder/name).exists():raise accounts.AccountError(422,'Too many figures for one book.')
    (folder/name).write_bytes(data)
def figure(book_id:str,name:str)->tuple[bytes,str]|None:
    path=_dir('figures')/book_id/name
    if not FIGURE_NAME.match(name) or not path.is_file():return None
    data=path.read_bytes();return data,next((t for sig,t in IMAGE_TYPES.items() if data.startswith(sig)),'application/octet-stream')
def cover(book_id:str)->tuple[bytes,str]|None:
    rows=q('SELECT cover_type FROM library WHERE id=?',(book_id,));path=_dir('covers')/book_id
    return (path.read_bytes(),rows[0][0]) if rows and rows[0][0] and path.exists() else None
# ---- narration: generated once by the owner or an editor, then served as static files
def _say(p:dict)->str:return (p['heading']+'. ' if p.get('heading') else '')+strip_inline(p['text'])  # the voice must not read the markers
def _version(doc:dict,language:str,kind:str|None)->dict:
    version=next((v for v in doc['versions'] if v['language']==language and (kind is None or v['type']==kind)),None)
    if not version:raise accounts.AccountError(404,'No summary exists in this language.')
    return version
class VoiceSettingsBody(Strict):
    voice:str|None=Field(default=None,pattern=r'^[A-Za-z0-9]{1,64}$');model:str|None=Field(default=None,pattern=r'^[a-z0-9_]{3,60}$')
    speed:float|None=Field(default=None,ge=0.7,le=1.5);stability:float|None=Field(default=None,ge=0,le=1);similarity:float|None=Field(default=None,ge=0,le=1);style:float|None=Field(default=None,ge=0,le=1);speakerBoost:bool|None=None
def clean_settings(body:VoiceSettingsBody|None,engine:str)->dict:
    """Only the fields the owner set, checked for the chosen engine (ElevenLabs speed is 0.7 to 1.2, offline 0.7 to 1.5; the rest is ElevenLabs only)."""
    got=body.model_dump(exclude_none=True) if body else {}
    if engine=='offline':return {'speed':got['speed']} if 'speed' in got else {}
    if got.get('speed',1)>1.2:raise accounts.AccountError(422,'ElevenLabs reads at most 1.2 times faster. Pick a speed between 0.7 and 1.2.')
    return got
def _hash(text:str)->str:return hashlib.sha256(text.encode()).hexdigest()[:16]
def narration_items(doc:dict,language:str,kind:str|None)->list[dict]:
    """What can be narrated: the overview, then each chapter. hash is of the spoken (marker-free) text, so a bold-only edit leaves the audio up to date."""
    version=_version(doc,language,kind)
    items=[]
    if version.get('overview'):items.append({'key':'overview','title':'Overview','chapterId':None,'text':'\n\n'.join(_say(p) for p in version['overview']['paragraphs'])})
    for c in doc['chapters']:
        body=version['chapters'].get(c['id'])
        if body:
            title=c['title'].get(language) or next(iter(c['title'].values()))
            items.append({'key':c['id'],'title':title,'chapterId':c['id'],'text':title+'.\n\n'+'\n\n'.join(_say(p) for p in body['paragraphs'])})
    for item in items:item['hash']=_hash(item['text']);item['chars']=len(item['text'])
    return items
def split_item(item:dict)->list[dict]:
    """One narration track per item, or several when a chapter is long (each under about 4000 characters)."""
    tracks=[];current=''
    for para in item['text'].split('\n\n'):
        if current and len(current)+len(para)>4000:tracks.append({**item,'text':current});current=''
        current+=('\n\n' if current else '')+para[:4400]
    if current:tracks.append({**item,'text':current})
    return tracks
def narration_tracks(doc:dict,language:str,kind:str|None)->list[dict]:
    return [t for item in narration_items(doc,language,kind) for t in split_item(item)]
def _row(book_id:str,language:str):
    rows=q('SELECT status,done,total,tracks,error,engine,type,settings,updated FROM narration WHERE book_id=? AND language=?',(book_id,language));return rows[0] if rows else None
def _stale(doc:dict,language:str,vtype:str,manifest:list[dict])->tuple[list[dict],list[str]]:
    """(items, keys whose audio was made from different text). Entries without a hash (older audio) count as up to date."""
    try:items=narration_items(doc,language,vtype or None)
    except accounts.AccountError:return [],[]
    made={}
    for m in manifest:made.setdefault(m.get('chapterId') or 'overview',m.get('hash'))
    stale=[i['key'] for i in items if i['key'] in made and made[i['key']] and made[i['key']]!=i['hash']]
    for i in items:i['narrated']=i['key'] in made;i['stale']=i['key'] in stale
    return items,stale
def estimate(book_id:str,language:str,kind:str|None,chapters:list[str]|None)->dict:
    doc=get(book_id)['doc'];row=_row(book_id,language)
    items,_=_stale(doc,language,(row[6] if row else '') if kind is None else _version(doc,language,kind)['type'],json.loads(row[3]) if row else [])
    if not items:_version(doc,language,kind)  # raises 404 when there is no such version
    if chapters is not None and {c for c in chapters}-{i['key'] for i in items}:raise accounts.AccountError(422,'One of the chosen chapters is not in this summary.')
    chosen=[i for i in items if chapters is None or i['key'] in chapters]
    return {'chars':sum(i['chars'] for i in chosen),'seconds':round(sum(i['chars'] for i in chosen)/14),'items':[{'key':i['key'],'title':i['title'],'chars':i['chars'],'narrated':i['narrated'],'stale':i['stale']} for i in items]}
_running:set[tuple[str,str]]=set()
_cancel:set[tuple[str,str]]=set()
_active:dict[tuple[str,str],dict]={}
def start_narration(book_id:str,language:str,kind:str|None,engine:str='offline',voice:tuple[str,str]|None=None,chapters:list[str]|None=None,settings:dict|None=None):
    """Narration is generated once on the server: with the free offline voice, or with the editor's own ElevenLabs key.
    chapters picks which items to (re)make; the others keep their current files. A run keeps the old audio (and its Listen button) until its new files are complete."""
    doc=get(book_id)['doc'];items=narration_items(doc,language,kind);vtype=_version(doc,language,kind)['type'];settings=settings or {}
    if (book_id,language) in _running:raise accounts.AccountError(409,'Narration is already being prepared.')
    if engine=='elevenlabs' and not voice:raise accounts.AccountError(412,'Add your ElevenLabs key in Account first.')
    if engine=='offline' and language not in audio.PIPER_VOICES:raise accounts.AccountError(422,'There is no offline voice for this language yet.')
    if chapters is not None:
        unknown=set(chapters)-{i['key'] for i in items}
        if unknown or not chapters:raise accounts.AccountError(422,'Choose at least one chapter of this summary.')
        row=_row(book_id,language)
        # Kept tracks belong to one version; mixing in another version's chapters would play the wrong text.
        if row and json.loads(row[3]) and row[6] and row[6]!=vtype:raise accounts.AccountError(422,'The current audio was made from a different version. Make the whole book instead.')
        items=[i for i in items if i['key'] in chapters]
    tracks=[t for i in items for t in split_item(i)]
    # An upsert, not INSERT OR REPLACE: the old tracks, engine and type stay until the new set replaces them.
    q("INSERT INTO narration(book_id,language,status,done,total,tracks,error,updated,engine,type,settings) VALUES(?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(book_id,language) DO UPDATE SET status='running',done=0,total=excluded.total,error='',updated=excluded.updated",(book_id,language,'running',0,len(tracks),'[]','',time.time(),engine,vtype,'{}'))
    _running.add((book_id,language));_cancel.discard((book_id,language));_active[(book_id,language)]={'engine':engine,'partial':chapters is not None}
    threading.Thread(target=_narrate,args=(book_id,language,tracks,engine,voice,vtype,chapters is not None,settings),daemon=True).start()
class _Cancelled(Exception):pass
def _narrate(book_id:str,language:str,tracks:list[dict],engine:str='offline',voice:tuple[str,str]|None=None,vtype:str='',partial:bool=False,settings:dict|None=None):
    folder=_dir('audio')/book_id/language;folder.mkdir(parents=True,exist_ok=True)
    gen=secrets.token_hex(4);made=[];settings=settings or {}  # new files are named <gen>-<n>.mp3 so they never overwrite the audio people are hearing
    try:
        for i,t in enumerate(tracks):
            if (book_id,language) in _cancel:raise _Cancelled()
            data=audio.eleven_long(t['text'],language,voice[0],settings.get('voice') or voice[1],settings=settings) if engine=='elevenlabs' and voice else audio.piper_mp3(t['text'],language,speed=settings.get('speed',1.0))
            name=f'{gen}-{i}.mp3';(folder/name).write_bytes(data)
            made.append({'title':t['title'],'chapterId':t['chapterId'],'file':name,'hash':t['hash'],'engine':engine})
            q('UPDATE narration SET done=?,updated=? WHERE book_id=? AND language=?',(i+1,time.time(),book_id,language))
        if (book_id,language) in _cancel:raise _Cancelled()
        # The new manifest follows the document's order: new tracks for what was made, the old tracks for the other chapters, nothing for chapters that no longer exist.
        doc=get(book_id)['doc'];order=[i['chapterId'] for i in narration_items(doc,language,vtype or None)]
        old=json.loads(_row(book_id,language)[3]) if partial else []
        fresh={m['chapterId'] for m in made}
        pool=made+[m for m in old if m['chapterId'] not in fresh]
        manifest=[m for cid in order for m in pool if m['chapterId']==cid]
        engines={m.get('engine','offline') for m in manifest}
        # One update swaps the manifest; only then are the files it no longer lists removed.
        q("UPDATE narration SET status='ready',tracks=?,engine=?,type=?,settings=?,error='',updated=?,done=total WHERE book_id=? AND language=?",(json.dumps(manifest),engines.pop() if len(engines)==1 else 'mixed',vtype,json.dumps(settings),time.time(),book_id,language))
        keep={m['file'] for m in manifest}
        for old_file in folder.glob('*.mp3'):
            if old_file.name not in keep:old_file.unlink(missing_ok=True)
    except Exception as error:  # noqa: BLE001 - reported to the owner, never crashes the server
        for m in made:(folder/m['file']).unlink(missing_ok=True)  # the previous audio, if any, stays as it was
        row=_row(book_id,language)
        if isinstance(error,_Cancelled):
            # Stopped by the owner: back to what was there before (nothing at all after a first run).
            if row and json.loads(row[3]):q("UPDATE narration SET status='ready',error='',updated=? WHERE book_id=? AND language=?",(time.time(),book_id,language))
            else:q('DELETE FROM narration WHERE book_id=? AND language=?',(book_id,language))
        else:q('UPDATE narration SET status=?,error=?,updated=? WHERE book_id=? AND language=?',('failed',str(error)[:300],time.time(),book_id,language))
    finally:_running.discard((book_id,language));_cancel.discard((book_id,language));_active.pop((book_id,language),None)
def cancel_narration(book_id:str,language:str):
    if (book_id,language) not in _running:raise accounts.AccountError(409,'Nothing is being prepared right now.')
    _cancel.add((book_id,language))
def delete_narration(book_id:str,language:str):
    if (book_id,language) in _running:raise accounts.AccountError(409,'Stop the running job before deleting the audio.')
    q('DELETE FROM narration WHERE book_id=? AND language=?',(book_id,language))
    import shutil;shutil.rmtree(_dir('audio')/book_id/language,ignore_errors=True)
def narration_status(book_id:str,language:str,detail:bool=False)->dict:
    row=_row(book_id,language)
    if not row:return {'status':'none','done':0,'total':0,'tracks':[]}
    status,done,total,tracks,error,engine,vtype,settings,updated=row;manifest=json.loads(tracks)
    def seconds(t):
        path=_dir('audio')/book_id/language/t['file'];rate=16000 if t.get('engine',engine)=='elevenlabs' else 8000  # 128 kbps vs 64 kbps
        return round(path.stat().st_size/rate,1) if path.is_file() else None
    out={'status':status,'done':done,'total':total,'error':error,'engine':engine,'type':vtype,'updated':updated,'tracks':[{'title':t['title'],'chapterId':t['chapterId'],'engine':t.get('engine',engine),'url':f"/api/library/{book_id}/audio/{language}/{t['file']}",'seconds':seconds(t)} for t in manifest]}
    if status=='running':out['runEngine']=_active.get((book_id,language),{}).get('engine',engine)
    if detail:out['settings']=json.loads(settings or '{}');out['staleChapters']=_stale(get(book_id)['doc'],language,vtype,manifest)[1]
    return out
def audio_path(book_id:str,language:str,name:str)->Path|None:
    if not re.fullmatch(r'(?:\d{1,4}|[0-9a-f]{8}-\d{1,4})\.mp3',name) or not re.fullmatch(r'[a-z]{2}',language):return None
    if not re.fullmatch(r'[0-9a-f-]{36}',book_id):return None
    path=_dir('audio')/book_id/language/name;return path if path.is_file() else None
def reset_jobs():
    # A restart interrupts any narration in progress; say so instead of showing it as running forever.
    try:q("UPDATE narration SET status='failed',error='Interrupted by a server restart. Start it again.' WHERE status='running'")
    except Exception:pass  # noqa: BLE001
