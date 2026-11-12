import unittest
from unittest.mock import AsyncMock
import httpx
from server.bookinfo import _wikipedia
class WikipediaIdentityTests(unittest.IsolatedAsyncioTestCase):
    async def test_similarly_named_tv_series_is_rejected(self):
        client=AsyncMock()
        client.get.side_effect=[httpx.Response(200,json={'pages':[{'title':'Can This Love Be Translated?','key':'tv'}]}),httpx.Response(200,json={'title':'Can This Love Be Translated?','extract':'A South Korean romantic comedy television series.'})]
        self.assertIsNone(await _wikipedia(client,'Can Love Last?','Stephen A. Mitchell'))
    async def test_book_and_author_match_is_retained(self):
        client=AsyncMock()
        client.get.side_effect=[httpx.Response(200,json={'pages':[{'title':'Midlife','key':'Midlife'}]}),httpx.Response(200,json={'title':'Midlife','extract':'Midlife is a philosophy book by Kieran Setiya.','content_urls':{'desktop':{'page':'https://en.wikipedia.org/wiki/Midlife'}}})]
        self.assertEqual((await _wikipedia(client,'Midlife','Kieran Setiya'))['title'],'Midlife')
