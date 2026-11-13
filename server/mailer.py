"""Sending the sign-up code. SMTP (for example a Gmail app password) or the Resend API, whichever the server is set up with."""
from __future__ import annotations
import os,smtplib,ssl
from email.message import EmailMessage
from email.utils import formataddr
import httpx
from . import accounts

def configured()->bool:return bool(os.getenv('SUMM_SMTP_HOST','').strip() or os.getenv('RESEND_API_KEY','').strip())
def _sender()->str:return os.getenv('SUMM_MAIL_FROM','').strip() or os.getenv('SUMM_SMTP_USER','').strip() or 'Inkling <noreply@localhost>'
def public_url()->str:return os.getenv('SUMM_PUBLIC_URL','https://booksumm.duckdns.org').rstrip('/')
def compose(email:str,code:str)->tuple[str,str,str]:
    link=f'{public_url()}/#/verify/{email}/{code}'
    subject=f'{code} is your Inkling code · کد ورود اینکلینگ'
    text=(f'Your Inkling confirmation code is {code}\n\nOr open this link to confirm your email and sign in:\n{link}\n\nIt works for 15 minutes. If you did not ask for it, ignore this message.\n\n'
          f'کد تأیید شما در اینکلینگ: {code}\n\nیا برای تأیید ایمیل و ورود، این پیوند را باز کنید:\n{link}\n\nاین کد ۱۵ دقیقه معتبر است. اگر شما درخواست نکرده‌اید، این پیام را نادیده بگیرید.\n')
    html=(f'<div style="font-family:-apple-system,Segoe UI,sans-serif;max-width:480px;margin:auto;color:#1c2528"><h2 style="margin:0 0 8px">Inkling</h2>'
          f'<p>Your confirmation code</p><p style="font-size:34px;letter-spacing:.3em;font-weight:700;margin:6px 0">{code}</p>'
          f'<p><a href="{link}" style="display:inline-block;background:#256673;color:#fff;padding:12px 22px;border-radius:24px;text-decoration:none">Confirm and sign in</a></p>'
          f'<p style="color:#5d686c;font-size:13px">It works for 15 minutes. If you did not ask for it, ignore this message.</p>'
          f'<hr style="border:0;border-top:1px solid #dfe5e6;margin:22px 0"><div dir="rtl" style="text-align:right"><p>کد تأیید شما در اینکلینگ</p><p style="font-size:34px;letter-spacing:.3em;font-weight:700;margin:6px 0">{code}</p>'
          f'<p><a href="{link}">تأیید ایمیل و ورود</a></p></div></div>')
    return subject,text,html
def _smtp(email:str,subject:str,text:str,html:str,headers:dict|None=None):
    host=os.getenv('SUMM_SMTP_HOST','').strip();port=int(os.getenv('SUMM_SMTP_PORT','587') or 587)
    msg=EmailMessage();msg['Subject']=subject;msg['From']=_sender();msg['To']=email
    for k,v in (headers or {}).items():msg[k]=v
    msg.set_content(text);msg.add_alternative(html,subtype='html')
    user=os.getenv('SUMM_SMTP_USER','').strip();password=os.getenv('SUMM_SMTP_PASSWORD','')
    context=ssl.create_default_context()
    if port==465:
        with smtplib.SMTP_SSL(host,port,timeout=20,context=context) as s:
            if user:s.login(user,password)
            s.send_message(msg)
    else:
        with smtplib.SMTP(host,port,timeout=20) as s:
            s.starttls(context=context)
            if user:s.login(user,password)
            s.send_message(msg)
async def deliver(email:str,subject:str,text:str,html:str,headers:dict|None=None):
    """Send one message. Raises OSError-family errors only; callers decide what to tell the user."""
    if os.getenv('RESEND_API_KEY','').strip():
        async with httpx.AsyncClient(timeout=20) as client:
            r=await client.post('https://api.resend.com/emails',headers={'Authorization':'Bearer '+os.environ['RESEND_API_KEY'].strip()},json={'from':_sender(),'to':[email],'subject':subject,'text':text,'html':html,**({'headers':headers} if headers else {})})
        if r.status_code>=300:raise OSError(r.text[:200])
    else:
        import asyncio
        await asyncio.to_thread(_smtp,email,subject,text,html,headers)
async def send_code(email:str,code:str):
    if not configured():raise accounts.AccountError(503,'Email sending is not set up on this server yet.')
    subject,text,html=compose(email,code)
    try:await deliver(email,subject,text,html)
    except (OSError,smtplib.SMTPException,httpx.HTTPError) as e:
        print('mail: sign-up code to',email,'failed:',repr(e)[:300],flush=True)
        raise accounts.AccountError(502,'The confirmation email could not be sent. Check the address, or try again in a minute.') from None
