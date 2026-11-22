"""Authors' names in Persian script, for books published before the editor had a field for it. The editor's own
entry (doc.authorNames) always wins; new books get theirs in the Details tab."""
PERSIAN={
 'Kieran Setiya':'کیران سِتیا',
 'Yalom, Irvin D.':'اروین د. یالوم','Irvin D. Yalom':'اروین د. یالوم',
 'Joe Friel':'جو فریل',
 'John Gottman':'جان گاتمن',
 'Stephen A. Mitchell':'استیون اِی. میچل',
 'Holger Zellentin':'هولگر زلنتین','Holger M. Zellentin':'هولگر ام. زلنتین',
 'François Déroche':'فرانسوا دِروش',
 'Sean W. Anthony':'شان دبلیو. آنتونی',
 'Gerald R. Hawting':'جرالد آر. هاوتینگ',
 'Gabriel Said Reynolds':'گابریل سعید رینولدز',
 'Simon Saunders and Jonathan Barrett and Adrian Kent and David Wallace':'سایمون ساندرز، جاناتان بَرت، اِیدریان کِنت و دیوید والاس',
}
def names_for(author:str,chosen:dict|None)->dict:
    out={'fa':PERSIAN[author]} if author in PERSIAN else {}
    out.update({k:v for k,v in (chosen or {}).items() if v})
    return out
