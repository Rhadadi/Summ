import test from'node:test';
import assert from'node:assert/strict';
import{actionLabel,changedKeys,chosenKeys,costUsd,formFrom,mixesVoices,needsConfirm,sampleText,settingsOf,staleTitles,startForm}from'../src/audio-form.ts';
import type{NarrationItem,NarrationStatus,PubDoc}from'../src/types';

const items:NarrationItem[]=[{key:'overview',title:'Overview',chars:1000,narrated:true,stale:false},{key:'c1',title:'One',chars:2000,narrated:true,stale:true},{key:'c2',title:'Two',chars:3000,narrated:false,stale:false}];
const status=(over:Partial<NarrationStatus>={}):NarrationStatus=>({status:'ready',done:3,total:3,tracks:[{title:'x',chapterId:null,url:'u'}],...over});
test('changed means stale or never narrated, and only once audio exists',()=>{
 assert.deepEqual(changedKeys(items,true),['c1','c2']);
 assert.deepEqual(changedKeys(items,false),[]);
});
test('scope picks the keys; the whole book sends none so the server replaces everything',()=>{
 assert.equal(chosenKeys({scope:'all',picked:[]},items,true),undefined);
 assert.deepEqual(chosenKeys({scope:'changed',picked:[]},items,true),['c1','c2']);
 assert.deepEqual(chosenKeys({scope:'pick',picked:['c2','overview']},items,true),['overview','c2']);
});
test('settings: offline sends a speed only; ElevenLabs sends the voice and model only when chosen',()=>{
 const f=startForm();f.offlineSpeed=1.2;assert.deepEqual(settingsOf(f),{speed:1.2});
 f.engine='elevenlabs';assert.deepEqual(settingsOf(f),{speed:1,stability:.55,similarity:.8,style:0,speakerBoost:true});
 f.voice='abc123';f.model='eleven_v3';f.eleven.speed=1.1;assert.deepEqual(settingsOf(f),{voice:'abc123',model:'eleven_v3',speed:1.1,stability:.55,similarity:.8,style:0,speakerBoost:true});
});
test('regenerate starts from the settings the audio was made with',()=>{
 const f=formFrom(status({engine:'elevenlabs',settings:{voice:'v1',speed:.9,stability:.3}}),true);
 assert.equal(f.engine,'elevenlabs');assert.equal(f.voice,'v1');assert.equal(f.eleven.speed,.9);assert.equal(f.eleven.similarity,.8);
 assert.equal(formFrom(status({engine:'elevenlabs'}),false).engine,'offline');   // without a key it falls back to offline
 assert.equal(formFrom(status({engine:'offline',settings:{speed:1.25}}),true).offlineSpeed,1.25);
});
test('over 10,000 characters on ElevenLabs asks first; offline never does',()=>{
 assert.equal(needsConfirm('elevenlabs',10001),true);assert.equal(needsConfirm('elevenlabs',10000),false);assert.equal(needsConfirm('offline',500000),false);
 assert.equal(costUsd(38400),3.84);
});
test('a partial update in another voice is flagged, a whole one is not',()=>{
 assert.equal(mixesVoices(true,status({engine:'offline'}),'elevenlabs','','d'),true);
 assert.equal(mixesVoices(true,status({engine:'elevenlabs',settings:{voice:'a'}}),'elevenlabs','b','d'),true);
 assert.equal(mixesVoices(true,status({engine:'elevenlabs',settings:{voice:'a'}}),'elevenlabs','a','d'),false);
 assert.equal(mixesVoices(true,status({engine:'elevenlabs'}),'elevenlabs','d','d'),false);  // the account default is the same voice
 assert.equal(mixesVoices(false,status({engine:'offline'}),'elevenlabs','','d'),false);
 assert.equal(mixesVoices(true,null,'elevenlabs','','d'),false);
});
test('button label',()=>{
 assert.equal(actionLabel(false,'all',0).text,'Make audio');assert.equal(actionLabel(true,'all',0).text,'Replace audio');
 assert.equal(actionLabel(true,'changed',2).text,'Update {n} chapters');assert.equal(actionLabel(true,'pick',1).text,'Update 1 chapter');
});
const doc:PubDoc={title:{en:'B'},author:'A',originalLanguage:'en',chapters:[{id:'c1',title:{en:'One',fa:'یک'},group:'main'}],versions:[{language:'en',type:'detailed',label:'D',model:'m',overview:{paragraphs:[{text:'Overview **bold** text.'}],takeaways:[]},chapters:{c1:{paragraphs:[{text:'First sentence is here. '+'word '.repeat(80)}]}}}]} as unknown as PubDoc;
test('the preview sample is plain text from the first chosen item, about 250 characters',()=>{
 assert.equal(sampleText(doc,'en','detailed',undefined),'Overview bold text.');
 const s=sampleText(doc,'en','detailed',['c1']);assert.ok(s.length<=250&&s.startsWith('First sentence is here.'),s);
 assert.ok(!s.endsWith(' '));assert.equal(sampleText(doc,'de','detailed',undefined),'');
});
test('stale titles for the notice',()=>{
 assert.deepEqual(staleTitles(doc,'fa',['overview','c1'],'مرور'),['مرور','یک']);
});
