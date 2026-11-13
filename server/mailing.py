"""Book requests and the update mailing list. People may subscribe with their account email or with just an address; every subscriber confirms once, can leave with one click, and hears about each new public book."""
from __future__ import annotations
import asyncio,html as _html,json,os,secrets,sqlite3,time
from . import accounts,library,mailer
SCHEMA='''CREATE TABLE IF NOT EXISTS subscribers(email TEXT PRIMARY KEY COLLATE NOCASE,token TEXT UNIQUE NOT NULL,status TEXT NOT NULL,lang TEXT NOT NULL DEFAULT 'fa',source TEXT NOT NULL DEFAULT 'form',created REAL NOT NULL,confirmed REAL,asked REAL);
CREATE TABLE IF NOT EXISTS book_requests(id INTEGER PRIMARY KEY AUTOINCREMENT,title TEXT NOT NULL,author TEXT NOT NULL DEFAULT '',note TEXT NOT NULL DEFAULT '',email TEXT NOT NULL DEFAULT '',user_id TEXT,lang TEXT NOT NULL DEFAULT 'fa',status TEXT NOT NULL DEFAULT 'new',book_id TEXT,told REAL,created REAL NOT NULL);
CREATE TABLE IF NOT EXISTS announced(book_id TEXT PRIMARY KEY,sent REAL NOT NULL,count INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS mailing_meta(k TEXT PRIMARY KEY);
INSERT OR IGNORE INTO announced(book_id,sent,count) SELECT id,0,0 FROM library WHERE NOT EXISTS(SELECT 1 FROM mailing_meta WHERE k='seeded');
INSERT OR IGNORE INTO mailing_meta(k) VALUES('seeded');'''
accounts.EXTRA_SCHEMA.append(SCHEMA)
STATUSES=('new','planned','done','declined')
q=library.q
def _lang(lang:str)->str:return 'fa' if lang=='fa' else 'en'
# ---- requests
def add_request(title:str,author:str,note:str,email:str,user_id:str|None,lang:str)->int:
    email=accounts.valid_email(email) if email.strip() else ''
    since=time.time()-86400
    if user_id:n=q('SELECT COUNT(*) FROM book_requests WHERE user_id=? AND created>?',(user_id,since))[0][0]
    elif email:n=q('SELECT COUNT(*) FROM book_requests WHERE email=? AND created>?',(email,since))[0][0]
    else:n=0
    if n>=8:raise accounts.AccountError(429,'You have sent several requests today. Please try again tomorrow.')
    with accounts._lock:
        db=accounts._db();cur=db.execute('INSERT INTO book_requests(title,author,note,email,user_id,lang,created) VALUES(?,?,?,?,?,?,?)',(title.strip(),author.strip(),note.strip(),email,user_id,_lang(lang),time.time()));return cur.lastrowid
def requests_list()->list[dict]:
    rows=q('SELECT r.id,r.title,r.author,r.note,r.email,r.status,r.book_id,r.told,r.created,(SELECT COUNT(*) FROM book_requests x WHERE lower(x.title)=lower(r.title)) FROM book_requests r ORDER BY (r.status=\'new\') DESC,r.created DESC LIMIT 300')
    return [{'id':i,'title':t,'author':a,'note':n,'email':e,'status':s,'bookId':b,'told':bool(told),'created':c,'same':same} for i,t,a,n,e,s,b,told,c,same in rows]
async def set_request(request_id:int,status:str,book_id:str|None)->dict:
    if status not in STATUSES:raise accounts.AccountError(422,'Unknown status.')
    rows=q('SELECT email,lang,told,title FROM book_requests WHERE id=?',(request_id,))
    if not rows:raise accounts.AccountError(404,'No such request.')
    email,lang,told,_=rows[0]
    if book_id and not q('SELECT 1 FROM library WHERE id=?',(book_id,)):raise accounts.AccountError(404,'That book is not in the library.')
    q('UPDATE book_requests SET status=?,book_id=? WHERE id=?',(status,book_id if status=='done' else None,request_id))
    sent=False
    # Whoever asked for the book, and left an address, is the first to hear that it is ready.
    if status=='done' and book_id and email and not told and mailer.configured():
        try:
            book=library.get(book_id);subject,text,page=compose_book(book,lang,unsubscribe=None,mode='request')
            await mailer.deliver(email,subject,text,page);q('UPDATE book_requests SET told=? WHERE id=?',(time.time(),request_id));sent=True
        except Exception as e:print('mail: request reply to',email,'failed:',repr(e)[:300],flush=True)
    return {'ok':True,'told':sent}
def delete_request(request_id:int):q('DELETE FROM book_requests WHERE id=?',(request_id,))
# ---- subscribers
def _unsub_url(token:str)->str:return mailer.public_url()+'/#/mail/unsubscribe/'+token
def _confirm_mail(email:str,token:str,lang:str)->tuple[str,str,str]:
    fa=lang=='fa';link=mailer.public_url()+'/#/mail/confirm/'+token;e=_html.escape
    subject='تأیید عضویت در خبرنامهٔ اینکلینگ' if fa else 'Confirm your Inkling updates'
    lead='برای دریافت خبر هر کتاب تازه، عضویت خود را تأیید کنید.' if fa else 'One tap and you will hear about every new book as it arrives.'
    button='تأیید عضویت' if fa else 'Yes, keep me posted'
    foot='اگر شما این درخواست را نداده‌اید، این پیام را نادیده بگیرید؛ چیزی برایتان ارسال نخواهد شد.' if fa else 'If this was not you, ignore this message and nothing will be sent.'
    text=lead+'\n\n'+link+'\n\n'+foot
    page=_shell(fa,subject,lead,f'<h1 style="margin:0 0 10px;font:600 26px/1.3 Georgia,\'Times New Roman\',serif;color:#1c2528">{e(subject)}</h1><p style="margin:0 0 26px;font-size:16px;line-height:1.8;color:#3d494d">{e(lead)}</p>'
        f'<p style="margin:0 0 6px;text-align:center"><a href="{e(link)}" style="display:inline-block;background:#256673;color:#fff;padding:14px 34px;border-radius:30px;text-decoration:none;font-weight:600;font-size:16px">{e(button)}</a></p>'
        f'<p style="margin:26px 0 0;font-size:13px;line-height:1.7;color:#6b777b">{e(foot)}</p>',None)
    return subject,text,page
async def subscribe(email:str,lang:str,source:str,verified:bool)->str:
    """Add an address. A verified account address joins at once; any other address gets one confirmation link first."""
    email=accounts.valid_email(email);lang=_lang(lang);now=time.time()
    rows=q('SELECT token,status,asked FROM subscribers WHERE email=?',(email,))
    if rows:
        token,status,asked=rows[0]
        if status=='active':return 'active'
        if verified:q("UPDATE subscribers SET status='active',confirmed=?,lang=?,source=? WHERE email=?",(now,lang,source,email));return 'active'
        if now-(asked or 0)<120:return 'pending'
        q("UPDATE subscribers SET status='pending',lang=?,asked=? WHERE email=?",(lang,now,email))
    else:
        token=secrets.token_urlsafe(24)
        try:q('INSERT INTO subscribers(email,token,status,lang,source,created,confirmed,asked) VALUES(?,?,?,?,?,?,?,?)',(email,token,'active' if verified else 'pending',lang,source,now,now if verified else None,None if verified else now))
        except sqlite3.IntegrityError:return 'pending'
        if verified:return 'active'
    if not mailer.configured():raise accounts.AccountError(503,'Email sending is not set up on this server yet.')
    subject,text,page=_confirm_mail(email,token,lang)
    try:await mailer.deliver(email,subject,text,page)
    except Exception as e:
        print('mail: subscription confirmation to',email,'failed:',repr(e)[:300],flush=True)
        raise accounts.AccountError(502,'The confirmation email could not be sent. Check the address, or try again in a minute.') from None
    return 'pending'
def confirm(token:str)->str:
    rows=q('SELECT email FROM subscribers WHERE token=?',(token,))
    if not rows:raise accounts.AccountError(404,'This link is no longer valid.')
    q("UPDATE subscribers SET status='active',confirmed=? WHERE token=?",(time.time(),token));return rows[0][0]
def unsubscribe(token:str)->str:
    rows=q('SELECT email FROM subscribers WHERE token=?',(token,))
    if not rows:raise accounts.AccountError(404,'This link is no longer valid.')
    q("UPDATE subscribers SET status='unsubscribed' WHERE token=?",(token,));return rows[0][0]
def status_of(email:str)->str:
    if not email:return 'none'
    rows=q('SELECT status FROM subscribers WHERE email=?',(email.strip().lower(),));return rows[0][0] if rows else 'none'
def unsubscribe_email(email:str):q("UPDATE subscribers SET status='unsubscribed' WHERE email=?",(email.strip().lower(),))
def overview()->dict:
    counts={s:n for s,n in q('SELECT status,COUNT(*) FROM subscribers GROUP BY status')}
    rows=q("SELECT email,status,source,created FROM subscribers ORDER BY created DESC LIMIT 200")
    return {'active':counts.get('active',0),'pending':counts.get('pending',0),'left':counts.get('unsubscribed',0),'auto':os.getenv('SUMM_AUTO_ANNOUNCE','true')!='false','people':[{'email':e,'status':s,'source':src,'created':c} for e,s,src,c in rows],
            'sent':[{'bookId':b,'sent':t,'count':n} for b,t,n in q('SELECT book_id,sent,count FROM announced WHERE sent>0 ORDER BY sent DESC LIMIT 30')]}
def remove_subscriber(email:str):q('DELETE FROM subscribers WHERE email=?',(email.strip().lower(),))
# ---- the email itself
def _shell(fa:bool,title:str,preheader:str,body:str,unsubscribe:str|None)->str:
    e=_html.escape;d='rtl' if fa else 'ltr';align='right' if fa else 'left'
    brand='اینکلینگ' if fa else 'Inkling';tag='کتاب‌هایی که ارزش خواندن دارند، در چند دقیقه' if fa else 'Books worth reading, in minutes'
    request='کتابی در ذهن دارید؟ بخواهید' if fa else 'Have a book in mind? Ask for it'
    leave=('لغو عضویت' if fa else 'Unsubscribe') if unsubscribe else ''
    why='این پیام را دریافت می‌کنید چون عضو خبرنامهٔ اینکلینگ هستید.' if fa else 'You are receiving this because you subscribed to Inkling updates.'
    if not unsubscribe:why='این پیام را به‌دلیل درخواست شما برای این کتاب دریافت کرده‌اید.' if fa else 'You are receiving this because you asked for this book.'
    site=mailer.public_url()
    return (f'<!doctype html><html lang="{"fa" if fa else "en"}" dir="{d}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>{e(title)}</title></head>'
        f'<body style="margin:0;padding:0;background:#eef2f2;-webkit-text-size-adjust:100%"><div style="display:none;max-height:0;overflow:hidden;opacity:0;color:#eef2f2">{e(preheader)}&#8199;&#847;&#8199;&#847;&#8199;&#847;</div>'
        f'<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eef2f2"><tr><td align="center" style="padding:28px 12px">'
        f'<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:22px;overflow:hidden;font-family:-apple-system,\'Segoe UI\',Tahoma,sans-serif;direction:{d};text-align:{align}">'
        f'<tr><td style="background:#256673;padding:22px 32px;text-align:center"><a href="{e(site)}" style="color:#ffffff;text-decoration:none;font:600 26px Georgia,\'Times New Roman\',serif;letter-spacing:.5px">{brand}</a><div style="color:#bfe0e6;font-size:12px;letter-spacing:.4px;margin-top:4px">{e(tag)}</div></td></tr>'
        f'<tr><td style="padding:32px 32px 8px">{body}</td></tr>'
        f'<tr><td style="padding:22px 32px 30px"><div style="border-top:1px solid #dfe5e6;padding-top:18px;font-size:12px;line-height:1.8;color:#6b777b;text-align:center">{e(why)}<br>'
        f'<a href="{e(site)}/#/" style="color:#256673">{e(request)}</a>'+(f' · <a href="{e(unsubscribe)}" style="color:#6b777b">{e(leave)}</a>' if unsubscribe else '')+'</div></td></tr></table></td></tr></table></body></html>')
def _takeaways(doc:dict,lang:str)->list[str]:
    order=sorted(doc['versions'],key=lambda v:v['language']!=lang);out=[]
    for v in order:
        for p in (v.get('overview') or {}).get('takeaways',[]):
            t=' '.join(p['text'].split())
            if t:out.append(t if len(t)<=150 else t[:t.rfind(' ',0,140)]+'…')
        if out:break
    return out[:3]
def _blurb_for(doc:dict,lang:str,fallback:str)->str:
    for v in sorted(doc['versions'],key=lambda v:v['language']!=lang):
        paras=(v.get('overview') or {}).get('paragraphs') or []
        if paras:
            text=' '.join(paras[0]['text'].split())
            if len(text)<=300:return text
            cut=text[:300];end=max(cut.rfind('. '),cut.rfind('؟ '),cut.rfind('。'))
            return cut[:end+1] if end>140 else cut[:cut.rfind(' ')]+'…'
    return fallback
def compose_book(book:dict,lang:str,unsubscribe:str|None,mode:str='new')->tuple[str,str,str]:
    """The announcement: cover, title, a taste of the book, three ideas, one clear button. Persian reads right to left."""
    fa=lang=='fa';e=_html.escape;doc=book['doc'];site=mailer.public_url()
    full=(book.get('titles') or {}).get(lang) or book['title'];title=full.split(':')[0].strip() or full;author=book.get('author') or ''
    url=f"{site}/#/b/{book['slug']}";blurb=_blurb_for(doc,lang,book.get('blurb',''));ideas=_takeaways(doc,lang)
    langs=book.get('languages') or [];audio=bool(q("SELECT 1 FROM narration WHERE book_id=? AND status='done'",(book['id'],)))
    eyebrow={'new':('تازه در کتابخانه','NEW IN THE LIBRARY'),'request':('کتابی که خواسته بودید آماده است','THE BOOK YOU ASKED FOR IS HERE')}[mode][0 if fa else 1]
    subject=('«'+title+'» حالا در اینکلینگ' if mode=='new' else '«'+title+'» که خواسته بودید، آماده است') if fa else (('New on Inkling: '+title) if mode=='new' else 'You asked for it: '+title+' is on Inkling')
    names={'en':'English','fa':'فارسی','ar':'العربية','de':'Deutsch','es':'Español','fr':'Français','tr':'Türkçe','zh':'中文'}
    chips=[names.get(l,l) for l in langs]
    if audio:chips.append('🎧 نسخهٔ صوتی' if fa else '🎧 Audio narration')
    chip_html=''.join(f'<span style="display:inline-block;margin:0 4px 6px 0;padding:5px 13px;border-radius:14px;background:#e9f2f4;color:#256673;font-size:12px;font-weight:600">{e(c)}</span>' for c in chips)
    cover=f"{site}{book['cover'].split('?')[0]}?w=480&v={int(book['updated'])}" if book.get('cover') else ''
    art=(f'<a href="{e(url)}"><img src="{e(cover)}" width="210" alt="{e(title)}" style="display:block;margin:0 auto;width:210px;max-width:60%;height:auto;border-radius:6px;box-shadow:0 14px 34px rgba(28,37,40,.28)"></a>' if cover else
         f'<a href="{e(url)}" style="display:block;margin:0 auto;width:190px;padding:46px 20px;border-radius:6px;background:#256673;color:#fff;text-align:center;text-decoration:none;font:600 22px/1.3 Georgia,serif">{e(title)}</a>')
    nums='۱۲۳' if fa else '123'
    idea_html=''.join(f'<tr><td valign="top" style="width:34px;padding:0 0 14px;font:600 24px/1.2 Georgia,serif;color:#256673">{nums[i]}</td><td style="padding:2px 0 14px;font-size:15px;line-height:1.8;color:#2b3639">{e(t)}</td></tr>' for i,t in enumerate(ideas))
    h_ideas='سه نکته‌ای که با خود می‌برید' if fa else 'Three ideas to take with you';button='خواندن خلاصه' if fa else 'Read the summary'
    sub2='در چند دقیقه بخوانید؛ سال‌ها به یاد بسپارید.' if fa else 'A few minutes to read. Years to remember.'
    body=(f'<div style="text-align:center;font-size:12px;font-weight:700;letter-spacing:2px;color:#b8791f">{e(eyebrow)}</div>'
        f'<div style="background:linear-gradient(180deg,#eaf3f5,#f8fbfb);border-radius:18px;padding:30px 12px;margin:16px 0 26px">{art}</div>'
        f'<h1 style="margin:0 0 6px;text-align:center;font:600 30px/1.25 Georgia,\'Times New Roman\',serif;color:#1c2528">{e(full if len(full)<70 else title)}</h1>'
        +(f'<p style="margin:0 0 18px;text-align:center;font-size:15px;color:#6b777b">{e(author)}</p>' if author else '')
        +(f'<div style="text-align:center;margin:0 0 20px">{chip_html}</div>' if chips else '')
        +(f'<p style="margin:0 0 26px;padding:0 6px;font:italic 17px/1.9 Georgia,\'Times New Roman\',serif;color:#3d494d;text-align:center">{e(blurb)}</p>' if blurb else '')
        +(f'<div style="background:#f6f8f8;border-radius:16px;padding:22px 24px 8px;margin:0 0 28px"><div style="font-size:12px;font-weight:700;letter-spacing:1.5px;color:#256673;margin:0 0 14px">{e(h_ideas)}</div><table role="presentation" width="100%" cellpadding="0" cellspacing="0">{idea_html}</table></div>' if ideas else '')
        +f'<p style="margin:0 0 8px;text-align:center"><a href="{e(url)}" style="display:inline-block;background:#256673;color:#fff;padding:16px 42px;border-radius:32px;text-decoration:none;font-weight:600;font-size:17px">{e(button)}</a></p>'
        +f'<p style="margin:14px 0 6px;text-align:center;font-size:13px;color:#8a9599;font-style:italic">{e(sub2)}</p>')
    text='\n'.join([eyebrow,'',full,author,'',blurb,'']+[f'{i+1}. {t}' for i,t in enumerate(ideas)]+['',url]+(['','Unsubscribe: '+unsubscribe] if unsubscribe else []))
    return subject,text,_shell(fa,subject,(blurb or full)[:110],body,unsubscribe)
# ---- sending a new book to the list
async def announce(book_id:str,only:str|None=None)->dict:
    """Mail one book to every active subscriber (or, as a trial, only to `only`). A book is announced once."""
    if not mailer.configured():raise accounts.AccountError(503,'Email sending is not set up on this server yet.')
    book=library.get(book_id)
    if only is None:
        if q('SELECT 1 FROM announced WHERE book_id=?',(book_id,)):raise accounts.AccountError(409,'This book has already been announced.')
        q('INSERT INTO announced(book_id,sent,count) VALUES(?,?,0)',(book_id,time.time()))
        people=q("SELECT email,token,lang FROM subscribers WHERE status='active'")
    else:
        rows=q('SELECT email,token,lang FROM subscribers WHERE email=?',(only,));people=rows or [(only,'preview','fa')]
    sent=failed=0
    for email,token,lang in people:
        subject,text,page=compose_book(book,lang,_unsub_url(token))
        headers={'List-Unsubscribe':f'<{mailer.public_url()}/api/mailing/unsubscribe/{token}>','List-Unsubscribe-Post':'List-Unsubscribe=One-Click'}
        try:await mailer.deliver(email,subject,text,page,headers);sent+=1
        except Exception as e:
            failed+=1;print('mail: announcement to',email,'failed:',repr(e)[:300],flush=True)
            if failed>=5 and not sent:break
        await asyncio.sleep(1.5)
    if only is None:q('UPDATE announced SET count=?,sent=? WHERE book_id=?',(sent,time.time(),book_id))
    return {'sent':sent,'failed':failed}
async def watch():
    """A book is announced once it has been public and left alone for ten minutes, long enough to add its cover and narration."""
    while True:
        try:
            if os.getenv('SUMM_AUTO_ANNOUNCE','true')!='false' and mailer.configured():
                for (book_id,) in q("SELECT id FROM library WHERE visibility='public' AND updated<? AND id NOT IN (SELECT book_id FROM announced) LIMIT 1",(time.time()-600,)):
                    print('mail: announcing',book_id,await announce(book_id),flush=True)
        except Exception as e:print('mail: watcher error',repr(e)[:300],flush=True)
        await asyncio.sleep(60)
