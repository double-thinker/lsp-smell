import{test}from'node:test';import assert from'node:assert/strict';import{TextDocument}from'vscode-languageserver-textdocument';
import{parseConfig}from'../src/config.js';import{ReviewEngine}from'../src/review-engine.js';
const doc=(v,text='work();',uri='file:///test.ts')=>TextDocument.create(uri,'typescript',v,text);
function setup(judge,extra={}){
 const statuses=[],published=[],calls=[];let reserved=0;
 const engine=new ReviewEngine({config:parseConfig({prompts:['Evalúa el contrato semántico'],limits:{debounceMs:5,timeoutMs:100,...extra}}),root:process.cwd(),status:p=>statuses.push(p),publish:p=>published.push(p),judge:async(...a)=>{calls.push(a);return judge(...a);},reserve:()=>({calls:++reserved})});
 return{engine,statuses,published,calls};
}
async function until(predicate){const deadline=Date.now()+1000;while(!predicate()){if(Date.now()>deadline)throw new Error('test wait timed out');await new Promise(r=>setTimeout(r,2));}}
const clean={output:{findings:[]}};
test('debounce coalesces edits and completes only latest document version',async()=>{
 const t=setup(async()=>clean);t.engine.update(doc(1));t.engine.update(doc(2));t.engine.update(doc(3));await until(()=>t.statuses.some(x=>x.state==='complete'));assert.equal(t.calls.length,1);assert.equal(t.statuses.at(-1).version,3);t.engine.stop();
});
test('late old responses never overwrite latest; concurrency globally bounded',async()=>{
 let release;const t=setup(async()=>{if(!release)return new Promise(r=>release=r);return clean;});
 t.engine.update(doc(1));await until(()=>!!release);t.engine.update(doc(2,'changed();'));release(clean);await until(()=>t.statuses.some(x=>x.state==='complete'));
 assert.deepEqual(t.statuses.filter(x=>x.state==='complete').map(x=>x.version),[2]);t.engine.stop();
});
test('multiple documents respect global concurrency and close suppresses result',async()=>{
 let active=0,max=0;const t=setup(async()=>{active++;max=Math.max(max,active);await new Promise(r=>setTimeout(r,15));active--;return clean;});
 t.engine.update(doc(1,'a();','file:///a'));t.engine.update(doc(1,'b();','file:///b'));await until(()=>t.calls.length===1);t.engine.close('file:///a');await until(()=>t.statuses.some(x=>x.uri==='file:///b'&&x.state==='complete'));assert.equal(max,1);assert.equal(t.statuses.filter(x=>x.uri==='file:///a'&&x.state==='complete').length,0);t.engine.stop();
});
test('invalid model output is failed review, never clean; cache is opt-in',async()=>{
 const t=setup(async()=>({output:{findings:[{quote:'invented'}]}}));t.engine.update(doc(1));await until(()=>t.statuses.some(x=>x.state==='failed'));assert.equal(t.published.at(-1).diagnostics[0].code,'review-unavailable');t.engine.stop();
 const c=setup(async()=>clean,{cacheEntries:2});c.engine.update(doc(1));await until(()=>c.statuses.some(x=>x.state==='complete'));c.engine.update(doc(2));await until(()=>c.statuses.at(-1).state==='complete');assert.equal(c.calls.length,1);assert.equal(c.statuses.at(-1).cacheHit,true);c.engine.stop();
});
test('timeout aborts judge and produces explicit unavailable diagnostic',async()=>{
 const t=setup(async(_req,_cfg,{signal})=>new Promise((_r,reject)=>signal.addEventListener('abort',()=>reject(new Error('timeout')),{once:true})));
 t.engine.update(doc(1));await until(()=>t.statuses.some(x=>x.state==='failed'));assert.match(t.statuses.at(-1).message,/incompleta/);t.engine.stop();
});
