import json,unittest
from pathlib import Path
from server.inline import strip_inline
class InlineTests(unittest.TestCase):
    def test_shared_fixtures_strip_the_same_way_as_the_page(self):
        cases=json.loads((Path(__file__).parent/'fixtures'/'inline.json').read_text(encoding='utf-8'))['cases']
        self.assertGreater(len(cases),10)
        for c in cases:self.assertEqual(strip_inline(c['in']),c['plain'],c['in'])
    def test_text_without_markers_is_untouched(self):
        for s in ('Plain, with (parens) and a - dash.','نوشتهٔ ساده و بدون نشانه','C:\\temp'):self.assertEqual(strip_inline(s),s)
    def test_narration_text_never_contains_a_marker(self):
        from server import library
        doc={'title':{'fa':'ک'},'originalLanguage':'fa','chapters':[{'id':'c1','title':{'fa':'فصل یک'},'group':'main'}],'versions':[{'language':'fa','type':'standard','label':'x','overview':{'paragraphs':[{'text':'مقدمه **مهم** است'}],'takeaways':[]},'chapters':{'c1':{'paragraphs':[{'heading':'سرتیتر','text':'این **پررنگ** و *مورب* است.'}]}}}]}
        tracks=library.narration_tracks(doc,'fa',None)
        self.assertTrue(tracks)
        for t in tracks:self.assertNotIn('*',t['text'])
        self.assertIn('این پررنگ و مورب است.',tracks[1]['text'])
    def test_blurb_and_email_excerpts_are_plain(self):
        from server import library,mailing
        d={'versions':[{'language':'fa','type':'s','overview':{'paragraphs':[{'text':'یک **کتاب** مهم'}],'takeaways':[{'text':'*ایده* اول'}]}}],'info':{}}
        self.assertEqual(library._blurb(d),'یک کتاب مهم')
        self.assertEqual(mailing._blurb_for(d,'fa',''),'یک کتاب مهم')
        self.assertEqual(mailing._takeaways(d,'fa'),['ایده اول'])
if __name__=='__main__':unittest.main()
