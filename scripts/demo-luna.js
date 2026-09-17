// Opt-in live test. Separate, durable 3-call allowance. Never reset an existing ledger.
import{mkdir,writeFile,readFile,access}from'node:fs/promises';
import{resolve}from'node:path';
import{TextDocument}from'vscode-languageserver-textdocument';
import{parseConfig}from'../src/config.js';
import{ReviewEngine}from'../src/review-engine.js';
const lastOnly=process.argv.includes('--last-only');
const evidencePath=lastOnly?'evidence/luna-final-attempt.json':'evidence/luna-live.json';
try{await access(evidencePath);throw new Error('Evidence already exists; refusing overwrite or unbudgeted replay.');}catch(e){if(e.code!=='ENOENT')throw e;}
const root=resolve('.demo/luna-light');await mkdir(root,{recursive:true});
const config=parseConfig({prompts:[{id:'contract',prompt:'Report only violations of the explicit code comment contract. Do not invent requirements about immediacy. Check readiness and propagation of failure.'}],provider:{type:'codex-cli',command:'codex',model:'gpt-5.6-luna',effort:'low'},limits:{maxCalls:3,maxConcurrency:2,maxTotalReservedUsd:0.3,maxCallUsd:0.1,timeoutMs:90000,debounceMs:0}});
const bad=`// Resolve only after initialization succeeds and ready is set. Propagate initialization failure without marking ready.
export async function startSession(session: {initializeSession(): Promise<void>; markReady(): void}): Promise<void> {
 session.initializeSession();
 await new Promise(resolve => setTimeout(resolve,25));
 session.markReady();
}\n`;
const good=bad.replace(' session.initializeSession();',' await session.initializeSession();').replace(' await new Promise(resolve => setTimeout(resolve,25));\n','');
const events=[],results=[],waiting=new Map();
const engine=new ReviewEngine({config,root,publish:d=>events.push({event:'diagnostics',...d}),trace:(event,data)=>events.push({event,...data}),status:s=>{events.push({event:'status',...s});if(s.state!=='pending'){results.push(s);waiting.get(s.uri)?.(s);}}});
function review(name,text,version=1){const uri=`file:///demo/${name}.ts`;return new Promise(resolve=>{waiting.set(uri,resolve);engine.update(TextDocument.create(uri,'typescript',version,text));});}
const start=performance.now();
if(lastOnly)await review('bad',bad);else await Promise.all([review('bad',bad),review('good',good)]);
if(results.some(s=>s.state==='failed')){engine.stop();}else if(!lastOnly) await review('bad',good,2);
engine.stop();
const evidence={requestedModel:'gpt-5.6-luna',requestedEffort:'low',note:'Codex JSONL does not attest backend model. Explicit model selected, no fallback. Two independent documents run concurrently; correlated prompts remain bundled. This is a real reviewer harness, not a new coding-agent session.',elapsedMs:performance.now()-start,config,results,events,budget:JSON.parse(await readFile(resolve(root,config.budgetFile),'utf8'))};
await writeFile(evidencePath,JSON.stringify(evidence,null,2)+'\n');console.log(JSON.stringify({results,budget:evidence.budget,elapsedMs:evidence.elapsedMs},null,2));
