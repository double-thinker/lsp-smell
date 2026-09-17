// Only execute our trusted isolated fixture, never arbitrary repository code.
import ts from'typescript';import{readFileSync}from'node:fs';import assert from'node:assert/strict';
const filename=process.argv[2]||'.demo/semantic/session.ts';
const js=ts.transpileModule(readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext}}).outputText;
const{startSession}=await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));
let finish,ready=false;const initialized=new Promise(r=>finish=r);
const task=startSession({initializeSession:()=>initialized,markReady:()=>ready=true});
// This delay is a failing watchdog test, never production proof of readiness.
await new Promise(r=>setTimeout(r,45));assert.equal(ready,false,'ready must not be marked while initialization is pending');
finish();await task;assert.equal(ready,true);
let readyOnFailure=false;await assert.rejects(startSession({initializeSession:async()=>{throw new Error('init failed');},markReady:()=>readyOnFailure=true}),/init failed/);assert.equal(readyOnFailure,false);
console.log('PASS: pending does not mark ready; success marks ready; failure rejects without ready.');
