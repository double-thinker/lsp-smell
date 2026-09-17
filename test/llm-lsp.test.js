import{test}from'node:test';import assert from'node:assert/strict';import{mkdtempSync,writeFileSync,readFileSync,rmSync}from'node:fs';import{tmpdir}from'node:os';import{join}from'node:path';import{diagnose}from'../src/client.js';
test('real stdio LLM-mode client waits for completed mock review; second process cannot reset budget',{timeout:15000},async()=>{
 const root=mkdtempSync(join(tmpdir(),'smell-llm-protocol-'));const file=join(root,'test.ts');
 // Deliberately simulated provider for offline transport testing, NOT model/demo evidence.
 const script='let s="";process.stdin.on("data",x=>s+=x);process.stdin.on("end",()=>{const r=JSON.parse(s);setTimeout(()=>console.log(JSON.stringify({findings:[{promptId:r.policies[0].id,startLine:1,endLine:1,quote:"run()",message:"Mock transport finding",confidence:0.8}]})),30)})';
 try{
  writeFileSync(join(root,'.lsp-smell.json'),JSON.stringify({prompts:['Una política libre de prueba de transporte'],provider:{type:'command',command:process.execPath,args:['-e',script]},limits:{debounceMs:0,timeoutMs:2000,maxCalls:1,maxCallUsd:0.1,maxTotalReservedUsd:0.1}}));
  const diagnostics=await diagnose({root,file,text:'run();'});assert.equal(diagnostics.length,1);assert.match(diagnostics[0].message,/Mock/);
  await assert.rejects(diagnose({root,file,text:'run();'}),/budget exhausted/);
  assert.equal(JSON.parse(readFileSync(join(root,'.lsp-smell-budget.json'))).calls,1);
 }finally{rmSync(root,{recursive:true,force:true});}
});
