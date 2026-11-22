"""Plain text from a paragraph that may carry **bold** and *italic* markers (narration, blurbs and emails read it).
The twin of parseInline in src/inline.ts; tests/fixtures/inline.json is run against both."""
import re
_OPENERS=re.compile(r'[\s(\[«"“„\'‘]')
_SPACE=re.compile(r'\s')
_WORD=re.compile(r'[^\W_]',re.UNICODE)  # a letter or a digit
def strip_inline(s:str)->str:
    if '*' not in s and '\\' not in s:return s
    toks:list[dict]=[];stack:list[int]=[];prev='';i=0;n_all=len(s)
    while i<n_all:
        c=s[i]
        if c=='\\' and i+1<n_all and s[i+1] in '*\\':toks.append({'ch':s[i+1]});prev='x';i+=2;continue
        if c!='*':toks.append({'ch':c});prev=c;i+=1;continue
        n=0
        while i+n<n_all and s[i+n]=='*':n+=1
        nxt=s[i+n] if i+n<n_all else '';run=s[i:i+n]
        if n>3:
            for ch in run:toks.append({'ch':ch})
            prev='*';i+=n;continue
        can_open=nxt!='' and not _SPACE.match(nxt) and (prev=='' or bool(_OPENERS.match(prev)))
        can_close=prev!='' and not _SPACE.match(prev) and (nxt=='' or not _WORD.match(nxt))
        kinds=['i'] if n==1 else ['b'] if n==2 else ['b','i']
        closing=can_close and (not can_open or any(toks[j].get('k')==k for k in kinds for j in stack))
        if closing:
            for k in (['i','b'] if n==3 else kinds):
                kinds_on=[toks[j]['k'] for j in stack]
                if k not in kinds_on:toks.append({'ch':'**' if k=='b' else '*'});continue
                at=len(kinds_on)-1-kinds_on[::-1].index(k);j=stack[at];del stack[at:]
                toks[j]['hit']=True;toks.append({'k':k,'open':False,'hit':True})
        elif can_open:
            for k in kinds:stack.append(len(toks));toks.append({'k':k,'open':True})
        else:toks.append({'ch':run})
        prev='*';i+=n
    return ''.join(t['ch'] if 'ch' in t else ('' if t.get('hit') else ('**' if t['k']=='b' else '*')) for t in toks)
