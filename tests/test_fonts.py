# Reading fonts the server keeps in its data folder, outside the repository (IranNastaliq).
from pathlib import Path
from tests.test_server import ServerTest

class FontFileTest(ServerTest):
    def test_served_from_the_data_folder(self):
        folder=Path(self.data.name)/'fonts';folder.mkdir();(folder/'irannastaliq.woff2').write_bytes(b'wOF2test')
        got=self.client.get('/api/fonts/irannastaliq.woff2')
        self.assertEqual((got.status_code,got.headers['content-type'],got.content),(200,'font/woff2',b'wOF2test'))
        self.assertIn('max-age',got.headers['cache-control'])
    def test_missing_file_or_other_names_are_not_found(self):
        folder=Path(self.data.name)/'fonts';folder.mkdir();(folder/'notes.txt').write_text('x')
        for name in ('irannastaliq.woff2','notes.txt','IranNastaliq.WOFF2','x.ttf'):
            self.assertEqual(self.client.get('/api/fonts/'+name).status_code,404,name)
