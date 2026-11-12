"""The home page's settings: which books slide, in what order, for how long. Public to read, owner-only to change."""
from __future__ import annotations
import json,os,re
from pathlib import Path
from typing import Literal
from pydantic import BaseModel,ConfigDict,Field

class Strict(BaseModel):model_config=ConfigDict(extra='forbid')
class SlideSetting(Strict):
    id:str=Field(pattern=r'^[0-9a-f-]{36}$');hidden:bool=False;seconds:int|None=Field(default=None,ge=2,le=60)
class HomeConfig(Strict):
    seconds:int=Field(default=3,ge=2,le=60)
    slides:list[SlideSetting]=Field(default=[],max_length=60)
    shelf:bool=True
    stars:bool=True
    autoplay:bool=True
    title:str=Field(default='',max_length=120);text:str=Field(default='',max_length=400)
def _path()->Path:
    folder=Path(os.getenv('SUMM_DATA_DIR','data'));folder.mkdir(parents=True,exist_ok=True);return folder/'home.json'
def load()->dict:
    try:return HomeConfig(**json.loads(_path().read_text())).model_dump()
    except (OSError,ValueError):return HomeConfig().model_dump()
def save(config:HomeConfig)->dict:
    _path().write_text(json.dumps(config.model_dump(),ensure_ascii=False));return load()
