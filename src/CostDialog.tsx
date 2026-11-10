import{Button,Dialog,DialogContent}from'@mui/material';
import{AutoAwesomeRounded}from'@mui/icons-material';
import type{Estimate,Price}from'./cost';
import{costRange,money}from'./cost';

export interface CostRequest{title:string;estimate:Estimate;note:string;run:()=>void}
interface Props{request:CostRequest|null;model:string;price:Price|null;onClose:()=>void;onAccount:()=>void}
export default function CostDialog({request,model,price,onClose,onAccount}:Props){
 const range=request&&price?costRange(request.estimate,price):null;const e=request?.estimate;
 return <Dialog open={!!request} onClose={onClose} fullWidth maxWidth="xs" aria-labelledby="cost-title" slotProps={{paper:{className:'cost-sheet'}}}>
  {request&&e&&<DialogContent>
   <div className="cost-heading"><span className="cost-icon"><AutoAwesomeRounded/></span><h2 id="cost-title">{request.title}</h2><p>Billed to your Gemini key. Nothing is sent until you confirm.</p></div>
   <div className="cost-figure" role="status">{range?<><strong>≈ {money(range.likely)}</strong><span>likely {money(range.low)} – {money(range.high)}</span></>:<><strong>{(e.input+e.output).toLocaleString()} tokens</strong><span>No list price for {model}. Add your prices in Account to see dollars.</span></>}</div>
   <dl className="cost-rows">
    <div><dt>Source text</dt><dd>{e.chars.toLocaleString()} characters</dd></div>
    <div><dt>Tokens sent</dt><dd>≈ {Math.round(e.input).toLocaleString()}</dd></div>
    <div><dt>Tokens returned (incl. thinking)</dt><dd>≈ {Math.round(e.output).toLocaleString()} – {Math.round(e.output*2).toLocaleString()}</dd></div>
    <div><dt>Model calls</dt><dd>{e.calls}</dd></div>
    <div><dt>Model · price per 1M</dt><dd>{model}{price?' · $'+price.input+' in / $'+price.output+' out':''}</dd></div>
   </dl>
   <p className="cost-note">{request.note}{price?.note?' '+price.note:''} Estimates are approximate; Google’s bill is final.</p>
   <div className="cost-actions"><Button variant="outlined" onClick={onAccount}>Prices & model</Button><Button onClick={onClose}>Cancel</Button><Button variant="contained" disabled={!e.calls} onClick={()=>{onClose();request.run();}}>Summarize</Button></div>
  </DialogContent>}
 </Dialog>;
}
