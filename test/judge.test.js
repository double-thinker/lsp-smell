import{test}from'node:test';import assert from'node:assert/strict';
import{mkdtempSync,rmSync,readFileSync,writeFileSync}from'node:fs';import{tmpdir}from'node:os';import{join}from'node:path';
import{TextDocument}from'vscode-languageserver-textdocument';
import{parseConfig}from'../src/config.js';import{validateFindings}from'../src/judge/schema.js';import{makeRequest}from'../src/judge/prompt.js';import{reserveBudget}from'../src/judge/budget.js';import{invokeJudge,parseModelJSON}from'../src/judge/adapters.js';
const cfg=()=>parseConfig({prompts:['Observa si esperar tiempo se confunde con terminar una promesa.','Comprueba el contrato de error, aunque cambien los nombres.'],limits:{maxCalls:2,maxTotalReservedUsd:0.2,maxCallUsd:0.1}});
const doc=TextDocument.create('file:///test.ts','typescript',1,'"😀";\nstart();\nmarkReady();');
test('free-form prompts are the default, plural policies preserved without grammar',()=>{const c=cfg();assert.equal(c.mode,'llm');assert.equal(c.prompts.length,2);assert.match(c.prompts[1].prompt,/contrato/);assert.equal(makeRequest(doc,'old()',c).document.lines.length,3);});
test('validated exact quote maps real UTF16 range; invalid ids/ranges/quotes rejected',()=>{
 const f={promptId:'prompt-1',startLine:2,endLine:2,quote:'start()',message:'Falta esperar la operación antes de ready.',confidence:0.9};
 const result=validateFindings({findings:[f]},doc,cfg().prompts);assert.deepEqual(result[0].range,{start:{line:1,character:0},end:{line:1,character:7}});
 for(const delta of [{quote:'invented'},{startLine:0},{endLine:99},{promptId:'absent'},{confidence:2}])assert.throws(()=>validateFindings({findings:[{...f,...delta}]},doc,cfg().prompts));
});
test('missing context limit and invalid configuration fail explicitly',()=>{
 assert.throws(()=>parseConfig({prompts:['review'],limits:{maxConcurrency:0}}));
 assert.throws(()=>makeRequest(TextDocument.create('file:///x','ts',1,'x'.repeat(32001)),'',cfg()));
});
test('durable budget survives new instances and preserves foreign lock/corrupt ledger',()=>{
 const root=mkdtempSync(join(tmpdir(),'smell-budget-'));
 try{reserveBudget(root,cfg());reserveBudget(root,cfg());assert.throws(()=>reserveBudget(root,cfg()),/exhausted/);
 assert.equal(JSON.parse(readFileSync(join(root,'.lsp-smell-budget.json'))).calls,2);
 writeFileSync(join(root,'.lsp-smell-budget.json.lock'),'held');assert.throws(()=>reserveBudget(root,cfg()));assert.equal(readFileSync(join(root,'.lsp-smell-budget.json.lock'),'utf8'),'held');
 rmSync(join(root,'.lsp-smell-budget.json.lock'));writeFileSync(join(root,'.lsp-smell-budget.json'),'bad');assert.throws(()=>reserveBudget(root,cfg()),/unreadable/);
 }finally{rmSync(root,{recursive:true,force:true});}
});
test('neutral command adapter exchanges JSON; cancellation terminates its own process',async()=>{
 const config=cfg();config.provider={type:'command',command:process.execPath,args:['-e','let s="";process.stdin.on("data",x=>s+=x);process.stdin.on("end",()=>{let r=JSON.parse(s);console.log(JSON.stringify({findings:[],usage:{policies:r.policies.length}}))})']};
 const value=await invokeJudge(makeRequest(doc,'',config),config,{signal:new AbortController().signal,root:process.cwd()});assert.equal(value.usage.policies,2);
 config.provider.args=['-e','setTimeout(()=>console.log("{}"),10000)'];const controller=new AbortController();setTimeout(()=>controller.abort(),30);
 await assert.rejects(invokeJudge(makeRequest(doc,'',config),config,{signal:controller.signal,root:process.cwd()}),/cancelled/);
});

test("model JSON accepts only plain JSON or an entire fenced block, never arbitrary prose",()=>{
 assert.deepEqual(parseModelJSON("```json\n{\"findings\":[]}\n```"),{findings:[]});
 assert.throws(()=>parseModelJSON("Here is JSON: {\"findings\":[]}"),/non-JSON/);
});
test('neutral adapter preserves UTF-8 split across stdout chunks',async()=>{
 const config=cfg();config.provider={type:'command',command:process.execPath,args:['-e','const b=Buffer.from(JSON.stringify({findings:[],usage:{label:"año"}}));const i=b.indexOf(0xc3)+1;process.stdout.write(b.subarray(0,i));setTimeout(()=>process.stdout.end(b.subarray(i)),10)']};
 const value=await invokeJudge(makeRequest(doc,'',config),config,{signal:new AbortController().signal,root:process.cwd()});assert.equal(value.usage.label,'año');
});

test('Codex event adapter rejects tools/incomplete output and keeps unknown cost explicit',async()=>{
 const{parseCodexEvents}=await import('../src/judge/adapters.js');
 const p={model:'gpt-5.6-luna',effort:'low'};
 const events=[{type:'item.completed',item:{type:'agent_message',text:'{"findings":[]}'}},{type:'turn.completed',usage:{input_tokens:12,output_tokens:4}}];
 const result=parseCodexEvents(events,p);
 assert.deepEqual(result.output,{findings:[]});assert.equal(result.usage.reportedCostUsd,null);
 assert.equal(result.usage.requestedModel,p.model);
 assert.throws(()=>parseCodexEvents(events.slice(0,1),p));
 assert.throws(()=>parseCodexEvents([...events,{type:'item.completed',item:{type:'command_execution'}}],p));
 assert.throws(()=>parseCodexEvents([...events,{type:'turn.failed'}],p));
});
test('Luna default and explicit light spelling validation',()=>{
 const c=parseConfig({prompts:'Free text'});assert.equal(c.provider.model,'gpt-5.6-luna');assert.equal(c.provider.effort,'low');
 assert.throws(()=>parseConfig({prompts:'Free text',provider:{type:'codex-cli',command:'codex',model:'gpt-5.6-luna',effort:'light'}}));
});

test('Codex nonfatal item errors are not tool operations; failed turns still reject',async()=>{
 const{parseCodexEvents}=await import('../src/judge/adapters.js');
 const events=[{type:'item.completed',item:{type:'error',message:'CLI notice'}},{type:'item.completed',item:{type:'agent_message',text:'{"findings":[]}'}},{type:'turn.completed',usage:{}}];
 const result=parseCodexEvents(events,{model:'gpt-5.6-luna'});
 assert.equal(result.usage.nonFatalErrorItems,1);
 assert.throws(()=>parseCodexEvents([...events,{type:'turn.failed'}],{model:'gpt-5.6-luna'}));
});
