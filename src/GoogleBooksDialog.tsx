import{useEffect,useRef,useState}from'react';
import{Alert,Box,Button,Dialog,DialogContent,DialogTitle,Divider,IconButton,LinearProgress,Stack,TextField,Typography}from'@mui/material';
import{CloseRounded,OpenInNewRounded,SearchRounded}from'@mui/icons-material';
import{searchGoogleBooks}from'./api';
import type{GoogleBookEdition}from'./types';

interface Props{initialQuery?:string;onClose:()=>void;onChoose?:(edition:GoogleBookEdition)=>Promise<void>}

export default function GoogleBooksDialog({initialQuery='',onClose,onChoose}:Props){
 const[query,setQuery]=useState(initialQuery.slice(0,300));
 const[results,setResults]=useState<GoogleBookEdition[]|null>(null);
 const[searching,setSearching]=useState(false),[choosing,setChoosing]=useState(''),[error,setError]=useState('');
 const pending=useRef<AbortController|null>(null);
 useEffect(()=>()=>pending.current?.abort(),[]);

 async function search(){
  const run=new AbortController();pending.current=run;
  setSearching(true);setError('');setResults(null);
  const timeout=setTimeout(()=>run.abort(),15000);
  try{setResults((await searchGoogleBooks(query.trim(),run.signal)).items);}
  catch(e){if(pending.current===run)setError(run.signal.aborted?'The search timed out. Try again.':(e as Error).message);}
  finally{clearTimeout(timeout);if(pending.current===run){pending.current=null;setSearching(false);}}
 }
 async function choose(edition:GoogleBookEdition){
  if(!onChoose)return;
  setChoosing(edition.id);setError('');
  try{await onChoose(edition);onClose();}
  catch(e){setError((e as Error).message);setChoosing('');}
 }
 function close(){
  if(choosing)return;
  pending.current?.abort();pending.current=null;onClose();
 }
 return <Dialog open onClose={close} fullWidth maxWidth="sm" aria-labelledby="book-search-title">
  <DialogTitle id="book-search-title" className="dialog-heading"><span>{onChoose?'Choose an edition':'Find a book'}</span><IconButton aria-label="Close book search" disabled={!!choosing} onClick={close}><CloseRounded/></IconButton></DialogTitle>
  <DialogContent>
   <p className="dialog-lead">{onChoose?'Search for the edition you want to show in this study guide.':'Look up editions and previews in the public Google Books catalog.'}</p>
   <Box component="form" onSubmit={e=>{e.preventDefault();if(query.trim()&&!searching&&!choosing)void search();}} sx={{display:'flex',flexWrap:'wrap',alignItems:'center',gap:1}}>
    <TextField autoFocus label="Title, author, or ISBN" size="small" value={query} onChange={e=>setQuery(e.target.value)} slotProps={{htmlInput:{maxLength:300}}} sx={{flex:'1 1 12rem'}}/>
    <Button type="submit" variant="contained" startIcon={<SearchRounded/>} disabled={!query.trim()||searching||!!choosing}>Search</Button>
   </Box>
   <Box sx={{mt:1,mb:2}}><a href="https://books.google.com/" target="_blank" rel="noreferrer"><img width="62" height="30" src="https://books.google.com/googlebooks/images/poweredby.png" alt="Powered by Google" referrerPolicy="no-referrer"/></a></Box>
   {searching&&<LinearProgress aria-label="Searching the catalog"/>}
   {error&&<Alert severity="error" sx={{mb:2}}>{error}</Alert>}
   {results&&<>
    <Typography variant="subtitle2" component="h3">Google Books search results</Typography>
    {!results.length&&<p role="status">No editions found. Try a different title, author, or ISBN.</p>}
    <Stack component="ul" divider={<Divider component="li"/>} sx={{m:0,p:0,listStyle:'none'}}>
     {results.map(edition=><Stack component="li" direction="row" key={edition.id} spacing={2} sx={{py:2}}>
      {edition.cover&&<Box component="img" src={edition.cover} alt="" loading="lazy" referrerPolicy="no-referrer" sx={{width:46,height:68,objectFit:'contain',flexShrink:0}}/>}
      <Box sx={{minWidth:0}}>
       <Typography component="h4" variant="subtitle1" sx={{fontWeight:600}} dir="auto">{[edition.title,edition.subtitle].filter(Boolean).join(' — ')}</Typography>
       <Typography variant="body2" color="text.secondary" dir="auto">{[edition.authors.join(', '),edition.publisher,edition.published_date,edition.pages&&edition.pages+' pages',...edition.isbns.map(isbn=>'ISBN '+isbn)].filter(Boolean).join(' · ')}</Typography>
       <Stack direction="row" sx={{flexWrap:'wrap',alignItems:'center',gap:1,mt:1}}>
        {onChoose&&<Button size="small" variant="outlined" disabled={!!choosing} onClick={()=>void choose(edition)}>{choosing===edition.id?'Saving…':'Use this edition'}</Button>}
        <Button size="small" href={edition.url} target="_blank" rel="noreferrer" endIcon={<OpenInNewRounded/>}>Open in Google Books</Button>
        {edition.preview_url&&<a href={edition.preview_url} target="_blank" rel="noreferrer"><img src="https://www.google.com/intl/en/googlebooks/images/gbs_preview_button1.gif" alt="Google Preview" referrerPolicy="no-referrer"/></a>}
       </Stack>
      </Box>
     </Stack>)}
    </Stack>
   </>}
  </DialogContent>
 </Dialog>;
}
