"""Accounts, sessions, and each user's encrypted Gemini key, kept in SQLite."""
from __future__ import annotations
import base64,hashlib,hmac,os,re,secrets,sqlite3,threading,time,uuid
from pathlib import Path
from cryptography.fernet import Fernet,InvalidToken
SESSION_SECONDS=30*24*3600
SCHEMA='''CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,username TEXT UNIQUE COLLATE NOCASE,password TEXT,google_sub TEXT UNIQUE,email TEXT,created REAL NOT NULL);
CREATE TABLE IF NOT EXISTS sessions(token_hash TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,expires REAL NOT NULL);
CREATE TABLE IF NOT EXISTS service_keys(user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,service TEXT NOT NULL,secret BLOB NOT NULL,hint TEXT NOT NULL,option TEXT NOT NULL DEFAULT '',updated REAL NOT NULL,PRIMARY KEY(user_id,service));
CREATE TABLE IF NOT EXISTS editor_requests(user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,message TEXT NOT NULL DEFAULT '',status TEXT NOT NULL,created REAL NOT NULL,decided REAL);
CREATE TABLE IF NOT EXISTS keys(user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,secret BLOB NOT NULL,hint TEXT NOT NULL,model TEXT NOT NULL,price_in REAL,price_out REAL,updated REAL NOT NULL);'''
USERNAME=re.compile(r'[A-Za-z0-9._-]{3,32}')
EXTRA_SCHEMA:list[str]=[]  # other modules (the library) register their tables here
_lock=threading.RLock();_conn:sqlite3.Connection|None=None;_path=''
class AccountError(Exception):
    def __init__(self,status:int,detail:str):super().__init__(detail);self.status=status;self.detail=detail
def _db()->sqlite3.Connection:
    global _conn,_path
    path=str(Path(os.getenv('SUMM_DATA_DIR','data'))/'summ.db')
    if _conn is None or path!=_path:
        if _conn is not None:_conn.close()
        Path(path).parent.mkdir(parents=True,exist_ok=True)
        _conn=sqlite3.connect(path,check_same_thread=False,isolation_level=None);_path=path
        _conn.execute('PRAGMA foreign_keys=ON');_conn.execute('PRAGMA journal_mode=WAL');_conn.executescript(SCHEMA)
        for extra in EXTRA_SCHEMA:_conn.executescript(extra)
        if 'role' not in [r[1] for r in _conn.execute('PRAGMA table_info(users)')]:_conn.execute("ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'reader'")
    return _conn
def query(sql:str,args:tuple=())->list[tuple]:
    with _lock:return _db().execute(sql,args).fetchall()
def _fernet()->Fernet:
    secret=os.getenv('SUMM_SECRET_KEY','')
    if len(secret)<32:raise AccountError(503,'The server needs a SUMM_SECRET_KEY of at least 32 characters before accounts can store keys.')
    return Fernet(base64.urlsafe_b64encode(hashlib.sha256(secret.encode()).digest()))
def hash_password(password:str)->str:
    salt=secrets.token_bytes(16);digest=hashlib.scrypt(password.encode(),salt=salt,n=2**14,r=8,p=1,dklen=32)
    return 'scrypt$'+base64.b64encode(salt).decode()+'$'+base64.b64encode(digest).decode()
def check_password(password:str,stored:str|None)->bool:
    # Hash even for unknown users so response time does not reveal which usernames exist.
    try:_,salt,digest=(stored or 'scrypt$'+base64.b64encode(b'0'*16).decode()+'$').split('$')
    except ValueError:return False
    candidate=hashlib.scrypt(password.encode(),salt=base64.b64decode(salt),n=2**14,r=8,p=1,dklen=32)
    return bool(stored) and hmac.compare_digest(candidate,base64.b64decode(digest))
def validate_credentials(username:str,password:str):
    if not USERNAME.fullmatch(username):raise AccountError(422,'Use 3–32 letters, digits, dots, dashes, or underscores for the username.')
    if not 10<=len(password)<=200:raise AccountError(422,'Use a password of at least 10 characters.')
def register(username:str,password:str)->str:
    validate_credentials(username,password);user_id=str(uuid.uuid4())
    try:query('INSERT INTO users(id,username,password,created) VALUES(?,?,?,?)',(user_id,username,hash_password(password),time.time()))
    except sqlite3.IntegrityError:raise AccountError(409,'That username is taken.') from None
    return user_id
def login(username:str,password:str)->str:
    rows=query('SELECT id,password FROM users WHERE username=?',(username,))
    if not check_password(password,rows[0][1] if rows else None):raise AccountError(401,'Incorrect username or password.')
    return rows[0][0]
def google_user(sub:str,email:str,allow_new:bool=True)->str:
    if allow_new:
        rows = query(
            'INSERT INTO users(id,google_sub,email,created) VALUES(?,?,?,?) '
            'ON CONFLICT(google_sub) DO UPDATE SET email=excluded.email RETURNING id',
            (str(uuid.uuid4()), sub, email, time.time()),
        )
    else:
        rows = query('UPDATE users SET email=? WHERE google_sub=? RETURNING id', (email, sub))
    if not rows:
        raise AccountError(403, 'New accounts are closed on this server.')
    return rows[0][0]
def _token_hash(token:str)->str:return hashlib.sha256(token.encode()).hexdigest()
def create_session(user_id:str)->str:
    token=secrets.token_urlsafe(32);now=time.time()
    query('DELETE FROM sessions WHERE expires<?',(now,));query('INSERT INTO sessions VALUES(?,?,?)',(_token_hash(token),user_id,now+SESSION_SECONDS))
    return token
# The owner is the Google-verified account whose email is SUMM_OWNER_EMAIL. A username and password
# account has no verified email, so it can never be the owner.
def resolve_role(email:str|None,google_sub:str|None,stored:str)->str:
    owner=os.getenv('SUMM_OWNER_EMAIL','').strip().lower()
    if owner and google_sub and email and email.strip().lower()==owner:return 'owner'
    return 'editor' if stored=='editor' else 'reader'
def session_user(token:str)->dict|None:
    if not token:return None
    rows=query('SELECT u.id,u.username,u.email,u.google_sub,u.role FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires>?',(_token_hash(token),time.time()))
    if not rows:return None
    uid,username,email,sub,role=rows[0]
    return {'id':uid,'name':username or email or 'Reader','email':email or '','role':resolve_role(email,sub,role)}
def set_role(user_id:str,role:str):
    if role not in ('reader','editor'):raise AccountError(422,'Unknown role.')
    query('UPDATE users SET role=? WHERE id=?',(role,user_id))
def request_editor(user_id:str,message:str):
    rows=query('SELECT status FROM editor_requests WHERE user_id=?',(user_id,))
    if rows and rows[0][0]=='pending':raise AccountError(409,'Your request is already waiting for the owner.')
    query('INSERT OR REPLACE INTO editor_requests(user_id,message,status,created,decided) VALUES(?,?,?,?,NULL)',(user_id,message.strip()[:500],'pending',time.time()))
def editor_request(user_id:str)->dict|None:
    rows=query('SELECT status,message,created FROM editor_requests WHERE user_id=?',(user_id,))
    return {'status':rows[0][0],'message':rows[0][1],'created':rows[0][2]} if rows else None
def people()->dict:
    who=lambda r:{'id':r[0],'name':r[1] or r[2] or 'Reader','email':r[2] or ''}
    pending=[{**who(r),'message':r[3],'created':r[4]} for r in query("SELECT u.id,u.username,u.email,r.message,r.created FROM editor_requests r JOIN users u ON u.id=r.user_id WHERE r.status='pending' ORDER BY r.created")]
    editors=[who(r) for r in query("SELECT id,username,email FROM users WHERE role='editor' ORDER BY COALESCE(username,email)")]
    return {'pending':pending,'editors':editors}
def decide_request(user_id:str,approve:bool):
    if not query("SELECT 1 FROM editor_requests WHERE user_id=? AND status='pending'",(user_id,)):raise AccountError(404,'There is no pending request from this person.')
    query('UPDATE editor_requests SET status=?,decided=? WHERE user_id=?',('approved' if approve else 'rejected',time.time(),user_id))
    if approve:set_role(user_id,'editor')
def revoke_editor(user_id:str):
    set_role(user_id,'reader');query("UPDATE editor_requests SET status='rejected',decided=? WHERE user_id=?",(time.time(),user_id))
def end_session(token:str):query('DELETE FROM sessions WHERE token_hash=?',(_token_hash(token),))
def delete_user(user_id:str):query('DELETE FROM users WHERE id=?',(user_id,))
def save_key(user_id:str,api_key:str|None,model:str,price_in:float|None,price_out:float|None):
    if api_key is None:
        if not query('SELECT 1 FROM keys WHERE user_id=?',(user_id,)):raise AccountError(422,'Paste your Gemini API key.')
        query('UPDATE keys SET model=?,price_in=?,price_out=?,updated=? WHERE user_id=?',(model,price_in,price_out,time.time(),user_id));return
    secret=_fernet().encrypt(api_key.encode())
    query('INSERT OR REPLACE INTO keys VALUES(?,?,?,?,?,?,?)',(user_id,secret,api_key[-4:],model,price_in,price_out,time.time()))
def remove_key(user_id:str):query('DELETE FROM keys WHERE user_id=?',(user_id,))
def key_info(user_id:str)->dict|None:
    rows=query('SELECT hint,model,price_in,price_out FROM keys WHERE user_id=?',(user_id,))
    return {'hint':rows[0][0],'model':rows[0][1],'price_in':rows[0][2],'price_out':rows[0][3]} if rows else None
def credentials(user_id:str)->tuple[str,str]|None:
    rows=query('SELECT secret,model FROM keys WHERE user_id=?',(user_id,))
    if not rows:return None
    try:return _fernet().decrypt(rows[0][0]).decode(),rows[0][1]
    except InvalidToken:raise AccountError(409,'Your saved key can no longer be read because the server secret changed. Enter your Gemini key again.') from None
def save_service_key(user_id:str,service:str,api_key:str|None,option:str):
    if api_key is None:
        if not query('SELECT 1 FROM service_keys WHERE user_id=? AND service=?',(user_id,service)):raise AccountError(422,'Paste your API key.')
        query('UPDATE service_keys SET option=?,updated=? WHERE user_id=? AND service=?',(option,time.time(),user_id,service));return
    query('INSERT OR REPLACE INTO service_keys VALUES(?,?,?,?,?,?)',(user_id,service,_fernet().encrypt(api_key.encode()),api_key[-4:],option,time.time()))
def remove_service_key(user_id:str,service:str):query('DELETE FROM service_keys WHERE user_id=? AND service=?',(user_id,service))
def service_info(user_id:str,service:str)->dict|None:
    rows=query('SELECT hint,option FROM service_keys WHERE user_id=? AND service=?',(user_id,service))
    return {'hint':rows[0][0],'option':rows[0][1]} if rows else None
def service_credentials(user_id:str,service:str)->tuple[str,str]|None:
    rows=query('SELECT secret,option FROM service_keys WHERE user_id=? AND service=?',(user_id,service))
    if not rows:return None
    try:return _fernet().decrypt(rows[0][0]).decode(),rows[0][1]
    except InvalidToken:raise AccountError(409,'Your saved ElevenLabs key can no longer be read because the server secret changed. Enter it again.') from None
