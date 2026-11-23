"""Private, resumable book drafts. Source ZIPs and covers stay in the data volume."""
from __future__ import annotations

import json
import os
import secrets
import sqlite3
import tempfile
import time
import uuid
from pathlib import Path

from . import accounts

MAX_STATE = 4_000_000
MAX_SOURCE = 50 * 1024 * 1024
MAX_MARKDOWN = 2 * 1024 * 1024
MAX_COVER = 8 * 1024 * 1024
SCHEMA = '''CREATE TABLE IF NOT EXISTS book_drafts(
    id TEXT PRIMARY KEY,
    owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    state TEXT NOT NULL,
    revision TEXT NOT NULL,
    source_type TEXT,
    cover_type TEXT,
    created REAL NOT NULL,
    updated REAL NOT NULL
);
CREATE INDEX IF NOT EXISTS book_drafts_owner_updated ON book_drafts(owner_id, updated DESC);'''
accounts.EXTRA_SCHEMA.append(SCHEMA)


def _db() -> sqlite3.Connection:
    return accounts._db()


def _path(kind: str, draft_id: str) -> Path:
    folder = Path(os.getenv('SUMM_DATA_DIR', 'data')) / ('draft-sources' if kind == 'source' else 'draft-covers')
    folder.mkdir(parents=True, exist_ok=True)
    return folder / draft_id


def _saved_bytes(kind: str, draft_id: str, data: bytes) -> None:
    """Keep the previous asset intact if a write is interrupted."""
    path = _path(kind, draft_id)
    temporary = None
    try:
        with tempfile.NamedTemporaryFile(dir=path.parent, prefix='upload-', delete=False) as file:
            temporary = Path(file.name)
            file.write(data)
            file.flush()
            os.fsync(file.fileno())
        temporary.replace(path)
    finally:
        if temporary is not None:
            temporary.unlink(missing_ok=True)


def _encoded(state: dict) -> str:
    value = json.dumps(state, ensure_ascii=False, separators=(',', ':'), allow_nan=False)
    if len(value.encode('utf-8')) > MAX_STATE:
        raise accounts.AccountError(413, 'This draft is too large. Remove oversized text or images from the form.')
    return value


def _title(state: dict) -> str:
    proposal = state.get('p') or state.get('proposal') or {}
    value = proposal.get('title') if isinstance(proposal, dict) else ''
    return str(value or state.get('title') or '').strip()[:300]


def _result(row: tuple, include_state: bool = True) -> dict:
    draft_id, state_json, revision, source_type, cover_type, created, updated = row
    state = json.loads(state_json)
    result = {'id': draft_id, 'title': _title(state), 'revision': revision,
              'hasSource': bool(source_type), 'hasCover': bool(cover_type),
              'sourceType': source_type, 'coverType': cover_type,
              'created': created, 'updated': updated}
    if include_state:
        result['state'] = state
    return result


def _row(owner_id: str, draft_id: str) -> tuple:
    with accounts._lock:
        rows = _db().execute('SELECT id,state,revision,source_type,cover_type,created,updated '
                             'FROM book_drafts WHERE id=? AND owner_id=?', (draft_id, owner_id)).fetchall()
    if not rows:
        raise accounts.AccountError(404, 'This draft was not found.')
    return rows[0]


def create(owner_id: str, state: dict) -> dict:
    state_json = _encoded(state)
    now = time.time()
    draft_id, revision = str(uuid.uuid4()), secrets.token_hex(8)
    with accounts._lock:
        db = _db()
        count = db.execute('SELECT count(*) FROM book_drafts WHERE owner_id=?', (owner_id,)).fetchone()[0]
        if count >= 100:
            raise accounts.AccountError(422, 'You have 100 drafts. Publish or delete one before starting another.')
        db.execute('INSERT INTO book_drafts(id,owner_id,state,revision,created,updated) VALUES(?,?,?,?,?,?)',
                   (draft_id, owner_id, state_json, revision, now, now))
    return get(owner_id, draft_id)


def listing(owner_id: str) -> list[dict]:
    with accounts._lock:
        rows = _db().execute('SELECT id,state,revision,source_type,cover_type,created,updated '
                             'FROM book_drafts WHERE owner_id=? ORDER BY updated DESC', (owner_id,)).fetchall()
    return [_result(row, False) for row in rows]


def get(owner_id: str, draft_id: str) -> dict:
    return _result(_row(owner_id, draft_id))


def update(owner_id: str, draft_id: str, state: dict, base: str | None) -> dict:
    state_json = _encoded(state)
    with accounts._lock:
        db = _db()
        row = db.execute('SELECT revision FROM book_drafts WHERE id=? AND owner_id=?', (draft_id, owner_id)).fetchone()
        if not row:
            raise accounts.AccountError(404, 'This draft was not found.')
        if base is not None and base != row[0]:
            raise accounts.AccountError(409, 'This draft changed in another tab. Reload it before saving.')
        db.execute('UPDATE book_drafts SET state=?,revision=?,updated=? WHERE id=? AND owner_id=?',
                   (state_json, secrets.token_hex(8), time.time(), draft_id, owner_id))
    return get(owner_id, draft_id)


def remove(owner_id: str, draft_id: str) -> None:
    _row(owner_id, draft_id)
    with accounts._lock:
        _db().execute('DELETE FROM book_drafts WHERE id=? AND owner_id=?', (draft_id, owner_id))
    for kind in ('source', 'cover'):
        _path(kind, draft_id).unlink(missing_ok=True)


def remove_all(owner_id: str) -> None:
    """Erase saved source files before the account row cascades away."""
    with accounts._lock:
        ids = [row[0] for row in _db().execute('SELECT id FROM book_drafts WHERE owner_id=?', (owner_id,))]
    for draft_id in ids:
        remove(owner_id, draft_id)


def save_source(owner_id: str, draft_id: str, data: bytes, content_type: str) -> dict:
    _row(owner_id, draft_id)
    claimed = content_type.split(';', 1)[0].strip().lower()
    if claimed not in ('', 'application/octet-stream', 'application/zip',
                       'application/x-zip-compressed', 'text/markdown', 'text/plain'):
        raise accounts.AccountError(422, 'Choose a Markdown summary or ZIP file.')
    is_zip = data.startswith(b'PK\x03\x04')
    if is_zip:
        if not data or len(data) > MAX_SOURCE:
            raise accounts.AccountError(413, 'The ZIP must be 50 MB or smaller.')
        kind = 'application/zip'
    else:
        if claimed in ('application/zip', 'application/x-zip-compressed'):
            raise accounts.AccountError(422, 'This ZIP file could not be read. Export it again.')
        if len(data) > MAX_MARKDOWN:
            raise accounts.AccountError(413, 'The Markdown summary must be 2 MB or smaller.')
        try:
            data.decode('utf-8')
        except UnicodeDecodeError:
            raise accounts.AccountError(422, 'Choose a UTF-8 Markdown summary or a ZIP file.') from None
        if not data.strip():
            raise accounts.AccountError(422, 'The summary file is empty.')
        kind = 'text/markdown'
    _saved_bytes('source', draft_id, data)
    with accounts._lock:
        _db().execute('UPDATE book_drafts SET source_type=?,updated=? WHERE id=? AND owner_id=?',
                      (kind, time.time(), draft_id, owner_id))
    return {'ok': True}


def source(owner_id: str, draft_id: str) -> tuple[bytes, str]:
    row = _row(owner_id, draft_id)
    path = _path('source', draft_id)
    if not row[3] or not path.is_file():
        raise accounts.AccountError(404, 'This draft has no saved summary file.')
    return path.read_bytes(), row[3]


def remove_source(owner_id: str, draft_id: str) -> dict:
    _row(owner_id, draft_id)
    _path('source', draft_id).unlink(missing_ok=True)
    with accounts._lock:
        _db().execute('UPDATE book_drafts SET source_type=NULL,updated=? WHERE id=? AND owner_id=?',
                      (time.time(), draft_id, owner_id))
    return {'ok': True}


def save_cover(owner_id: str, draft_id: str, data: bytes) -> dict:
    _row(owner_id, draft_id)
    kind = next((mime for signature, mime in ((b'\xff\xd8\xff', 'image/jpeg'),
                                               (b'\x89PNG', 'image/png'),
                                               (b'RIFF', 'image/webp')) if data.startswith(signature)), None)
    if not kind or not 500 <= len(data) <= MAX_COVER:
        raise accounts.AccountError(422, 'Use a JPEG, PNG, or WebP cover under 8 MB.')
    _saved_bytes('cover', draft_id, data)
    with accounts._lock:
        _db().execute('UPDATE book_drafts SET cover_type=?,updated=? WHERE id=? AND owner_id=?',
                      (kind, time.time(), draft_id, owner_id))
    return {'ok': True}


def cover(owner_id: str, draft_id: str) -> tuple[bytes, str]:
    row = _row(owner_id, draft_id)
    path = _path('cover', draft_id)
    if not row[4] or not path.is_file():
        raise accounts.AccountError(404, 'This draft has no saved cover.')
    return path.read_bytes(), row[4]


def remove_cover(owner_id: str, draft_id: str) -> dict:
    _row(owner_id, draft_id)
    _path('cover', draft_id).unlink(missing_ok=True)
    with accounts._lock:
        _db().execute('UPDATE book_drafts SET cover_type=NULL,updated=? WHERE id=? AND owner_id=?',
                      (time.time(), draft_id, owner_id))
    return {'ok': True}
