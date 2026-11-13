"""Smaller copies of covers, backgrounds and figures for slow connections: WebP at a few fixed widths, made once and kept on disk."""
from __future__ import annotations
import hashlib,io,os
from pathlib import Path

WIDTHS=(320,480,800,1280,1600)
def _dir()->Path:
    path=Path(os.getenv('SUMM_DATA_DIR','data'))/'sized';path.mkdir(parents=True,exist_ok=True);return path
def width(w:int|None)->int|None:
    """The smallest standard width that is at least the one asked for."""
    if not w:return None
    return next((x for x in WIDTHS if x>=w),WIDTHS[-1])
def sized(data:bytes,w:int|None,kind:str)->tuple[bytes,str]:
    w=width(w)
    if not w:return data,kind
    path=_dir()/(hashlib.sha1(data).hexdigest()[:20]+'-'+str(w)+'.webp')
    if path.exists():return path.read_bytes(),'image/webp'
    try:
        from PIL import Image
        im=Image.open(io.BytesIO(data));im.load()
        if im.mode not in ('RGB','RGBA'):im=im.convert('RGBA' if 'A' in im.getbands() else 'RGB')
        if im.width>w:im.thumbnail((w,w*4),Image.LANCZOS)
        out=io.BytesIO();im.save(out,'WEBP',quality=74,method=4);body=out.getvalue()
    except Exception:  # noqa: BLE001 - an image we cannot read is served as it is
        return data,kind
    if len(body)>=len(data) and kind=='image/webp':return data,kind
    try:path.write_bytes(body)
    except OSError:pass
    return body,'image/webp'
