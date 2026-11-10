"""Public Google Books catalog queries and edition metadata."""

from __future__ import annotations

import html
import os
import re
from urllib.parse import urlsplit, urlunsplit

import httpx

VOLUMES_URL = 'https://www.googleapis.com/books/v1/volumes'
VOLUME_ID = re.compile(r'[A-Za-z0-9_-]{1,80}')
LINK_HOSTS = {'books.google.com', 'www.google.com', 'play.google.com'}
IMAGE_HOSTS = {'books.google.com', 'books.googleusercontent.com'}


class BooksError(Exception):
    def __init__(self, status: int, detail: str):
        super().__init__(detail)
        self.status = status
        self.detail = detail


def _string(value: object, limit: int) -> str:
    return value.strip()[:limit] if isinstance(value, str) else ''


def _strings(value: object, count: int, length: int) -> list[str]:
    return [text for entry in value[:count] if (text := _string(entry, length))] if isinstance(value, list) else []


def _https_link(value: object, hosts: set[str]) -> str | None:
    if not isinstance(value, str) or len(value) > 2000:
        return None
    try:
        url = urlsplit(value)
        if (
            url.scheme in {'http', 'https'} and url.hostname in hosts
            and not url.username and not url.password and url.port in {None, 80, 443}
        ):
            return urlunsplit(('https', url.hostname, url.path, url.query, url.fragment))
    except ValueError:
        return None
    return None


def _edition(item: object) -> dict | None:
    if not isinstance(item, dict):
        return None
    volume_id = item.get('id')
    info = item.get('volumeInfo')
    if not isinstance(volume_id, str) or not VOLUME_ID.fullmatch(volume_id) or not isinstance(info, dict):
        return None
    title = _string(info.get('title'), 500)
    if not title:
        return None

    images = info.get('imageLinks')
    cover = _https_link(images.get('thumbnail'), IMAGE_HOSTS) if isinstance(images, dict) else None
    access = item.get('accessInfo')
    preview = None
    if isinstance(access, dict) and access.get('viewability') in ('PARTIAL', 'ALL_PAGES'):
        preview = _https_link(info.get('previewLink'), LINK_HOSTS)
    identifiers = info.get('industryIdentifiers')
    isbns = [
        entry['identifier'] for entry in identifiers
        if isinstance(entry, dict) and entry.get('type') in ('ISBN_10', 'ISBN_13')
        and isinstance(entry.get('identifier'), str)
        and re.fullmatch(r'[0-9]{9}[0-9X]|[0-9]{13}', entry['identifier'])
    ][:4] if isinstance(identifiers, list) else []
    published_date = _string(info.get('publishedDate'), 32)
    rating = info.get('averageRating')
    rating_count = info.get('ratingsCount')
    pages = info.get('pageCount')
    description = html.unescape(re.sub(r'<[^>]+>', ' ', _string(info.get('description'), 6000)))
    return {
        'id': volume_id,
        'source': 'Google Books',
        'title': title,
        'subtitle': _string(info.get('subtitle'), 500),
        'authors': _strings(info.get('authors'), 20, 200),
        'publisher': _string(info.get('publisher'), 200),
        'published_date': published_date,
        'year': published_date[:4],
        'language': _string(info.get('language'), 16),
        'pages': pages if type(pages) is int and pages > 0 else None,
        'isbns': isbns,
        'categories': _strings(info.get('categories'), 8, 200),
        'description': ' '.join(description.split())[:3000],
        'rating': rating if type(rating) in (int, float) and 0 < rating <= 5 else None,
        'ratings': rating_count if type(rating_count) is int and rating_count >= 0 else None,
        'url': _https_link(info.get('infoLink'), LINK_HOSTS) or 'https://books.google.com/books?id=' + volume_id,
        'preview_url': preview,
        'cover': cover,
    }


async def _request(client: httpx.AsyncClient, suffix: str, params: dict) -> dict:
    key = os.getenv('GOOGLE_BOOKS_API_KEY', '').strip()
    if key:
        params = {**params, 'key': key}
    try:
        response = await client.get(VOLUMES_URL + suffix, params=params, follow_redirects=False)
    except httpx.HTTPError:
        raise BooksError(502, 'Google Books could not be reached. Try again.') from None

    if response.status_code == 404 and suffix:
        raise BooksError(404, 'Google Books could not find that edition.')
    if response.status_code == 429:
        raise BooksError(429, 'Google Books has reached its request limit. Try again later.')
    if response.status_code in (401, 403):
        raise BooksError(503, 'Google Books access is unavailable. Check the server API key, Books API access, and quota.')
    if response.status_code != 200:
        raise BooksError(502, 'Google Books could not complete the request. Try again.')
    try:
        data = response.json()
    except ValueError:
        raise BooksError(502, 'Google Books returned an unreadable response.') from None
    if not isinstance(data, dict):
        raise BooksError(502, 'Google Books returned an unreadable response.')
    return data


async def search(client: httpx.AsyncClient, query: str, limit: int = 12) -> list[dict]:
    isbn = re.sub(r'[\s-]', '', query).upper()
    if re.fullmatch(r'[0-9]{9}[0-9X]|[0-9]{13}', isbn):
        query = 'isbn:' + isbn
    data = await _request(client, '', {'q': query, 'maxResults': limit, 'printType': 'books'})
    items = data.get('items', [])
    if not isinstance(items, list):
        raise BooksError(502, 'Google Books returned an unreadable search result.')
    return [edition for item in items[:limit] if (edition := _edition(item)) is not None]


async def volume(client: httpx.AsyncClient, volume_id: str) -> dict:
    if not VOLUME_ID.fullmatch(volume_id):
        raise BooksError(422, 'Use a valid Google Books volume ID.')
    data = await _request(client, '/' + volume_id, {})
    edition = _edition(data)
    if edition is None or edition['id'] != volume_id:
        raise BooksError(502, 'Google Books did not return the requested edition.')
    return edition
