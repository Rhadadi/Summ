"""A reader's highlights, comments and chapter notes on summaries, kept with their account.

Each mark's content (the passage, its colour, the comment) is encrypted at rest with the server secret, like the API keys.
Only the ids and edit times are stored in the clear, so the browser and server can merge edits made on several devices:
the newer edit of a mark wins, and a deletion is kept as a tombstone so it reaches the other devices too.
"""
from __future__ import annotations

import json
import re
import time

from pydantic import BaseModel, ConfigDict, Field

from . import accounts

SCHEMA = '''CREATE TABLE IF NOT EXISTS marks(
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 id TEXT NOT NULL,
 updated REAL NOT NULL,
 deleted INTEGER NOT NULL DEFAULT 0,
 secret BLOB,
 stored REAL NOT NULL,
 PRIMARY KEY(user_id,id));
CREATE INDEX IF NOT EXISTS marks_stored ON marks(user_id,stored);'''
accounts.EXTRA_SCHEMA.append(SCHEMA)

MAX_MARKS = 20_000
ID = r'^[a-z0-9]{8,40}$'


class Strict(BaseModel):
    model_config = ConfigDict(extra='forbid')


class Mark(Strict):
    id: str = Field(pattern=ID)
    updated: float = Field(ge=0)
    deleted: bool = False
    book: str = Field(default='', max_length=120)
    slug: str = Field(default='', max_length=200)
    bookTitle: str = Field(default='', max_length=400)
    chapter: str = Field(default='', max_length=120)
    chapterTitle: str = Field(default='', max_length=400)
    lang: str = Field(default='', max_length=8)
    quote: str = Field(default='', max_length=4000)
    prefix: str = Field(default='', max_length=200)
    suffix: str = Field(default='', max_length=200)
    color: str = Field(default='yellow', pattern=r'^(yellow|green|blue|pink)$')
    note: str = Field(default='', max_length=20_000)
    source: str = Field(default='', pattern=r'^(|ai)$')
    model: str = Field(default='', max_length=80)
    created: float = Field(default=0, ge=0)
    kind: str = Field(default='mark', pattern=r'^(mark|note)$')  # a highlight/comment, or a chapter's "In your own words" note


class Push(Strict):
    marks: list[Mark] = Field(max_length=500)


def _pack(m: Mark) -> bytes | None:
    if m.deleted:
        return None
    return accounts._fernet().encrypt(json.dumps(m.model_dump(exclude={'id', 'updated', 'deleted'}), ensure_ascii=False).encode())


def save(user_id: str, marks: list[Mark]) -> int:
    """Store each mark unless the server already holds a newer edit of it. Returns how many were taken."""
    taken = 0
    now = time.time()
    for m in marks:
        have = accounts.query('SELECT updated FROM marks WHERE user_id=? AND id=?', (user_id, m.id))
        if have and have[0][0] >= m.updated:
            continue
        if not have and accounts.query('SELECT COUNT(*) FROM marks WHERE user_id=?', (user_id,))[0][0] >= MAX_MARKS:
            raise accounts.AccountError(413, 'You have reached the limit of highlights and comments.')
        accounts.query('INSERT OR REPLACE INTO marks(user_id,id,updated,deleted,secret,stored) VALUES(?,?,?,?,?,?)',
                       (user_id, m.id, m.updated, int(m.deleted), _pack(m), now))
        taken += 1
    return taken


def since(user_id: str, after: float) -> list[dict]:
    """Every mark stored after `after` (server time), decrypted, deletions included."""
    out = []
    for mid, updated, deleted, secret in accounts.query(
            'SELECT id,updated,deleted,secret FROM marks WHERE user_id=? AND stored>? ORDER BY stored', (user_id, after)):
        if deleted or secret is None:
            out.append({'id': mid, 'updated': updated, 'deleted': True})
            continue
        try:
            body = json.loads(accounts._fernet().decrypt(secret))
        except Exception:  # the server secret changed: the mark cannot be read any more
            continue
        out.append({'id': mid, 'updated': updated, 'deleted': False, **body})
    return out


def valid_id(value: str) -> bool:
    return bool(re.match(ID, value))
