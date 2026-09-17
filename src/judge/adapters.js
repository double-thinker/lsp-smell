import{mkdtemp,rm}from'node:fs/promises';
import{tmpdir}from'node:os';
import{join}from'node:path';
import{spawn}from'node:child_process';
import{outputSchema}from'./schema.js';
import{judgePrompt}from'./prompt.js';
function run(command,args,input,{signal,cwd,maxOutputBytes,env,jsonl=false}){
 return new Promise((resolve,reject)=>{
  if(signal.aborted)return reject(new Error('Review cancelled'));
  const child=spawn(command,args,{cwd,env,stdio:['pipe','pipe','pipe'],detached:process.platform!=='win32'});
  let out='',size=0,err='',failure,killer;
  const kill=(sig)=>{try{if(process.platform!=='win32')process.kill(-child.pid,sig);else child.kill(sig);}catch{}};
  const abort=()=>{failure=new Error('Review cancelled or timed out');kill('SIGTERM');killer=setTimeout(()=>kill('SIGKILL'),300);};
  signal.addEventListener('abort',abort,{once:true});
  child.on('error',e=>{failure=e;});
  child.stdout.setEncoding('utf8');child.stderr.setEncoding('utf8');
  child.stdout.on('data',chunk=>{size+=Buffer.byteLength(chunk);if(size>maxOutputBytes){abort();failure=new Error('Judge output exceeded byte limit');}else out+=chunk;});
  child.stderr.on('data',chunk=>{err=(err+chunk).slice(-2000);});
  child.on('close',code=>{clearTimeout(killer);signal.removeEventListener('abort',abort);if(failure)reject(failure);else if(code!==0)reject(new Error(`Judge process exited ${code}; check CLI authentication/model locally (stderr not exposed)`));else{try{resolve(jsonl?out.trim().split(/\r?\n/).filter(Boolean).map(line=>JSON.parse(line)):JSON.parse(out));}catch{reject(new Error('Judge returned invalid JSON'));}}});
  child.stdin.on('error',()=>{});child.stdin.end(input);
 });
}
export function parseModelJSON(text){
 if(typeof text!=='string')throw new Error('Judge returned no structured result');
 const fenced=/^\s*```(?:json)?\s*\n([\s\S]*?)\n```\s*$/.exec(text);
 try{return JSON.parse(fenced?fenced[1]:text);}catch{throw new Error('Judge returned non-JSON content');}
}
export async function invokeJudge(request,config,{signal,root}){
 const p=config.provider;const env={...process.env};
 // A bounded, tool-free print subprocess is the judge, not another interactive coding agent.
 delete env.CLAUDECODE;
 if(p.type==='command'){
  const result=await run(p.command,p.args||[],JSON.stringify({...request,outputSchema})+'\n',{signal,cwd:root,maxOutputBytes:config.limits.maxOutputBytes,env});
  return {output:result,usage:result.usage||null};
 }
 if(p.type==='codex-cli'){
  // Empty cwd prevents project config/instructions from leaking into the judge.
  // CODEX_HOME/auth stay untouched; user config is skipped for this process only.
  const cwd=await mkdtemp(join(tmpdir(),'lsp-smell-judge-'));
  const args=['exec','--ignore-user-config','--ephemeral','--skip-git-repo-check','--sandbox','read-only','--model',p.model,'--json','--color','never'];
  const overrides={model_reasoning_effort:p.effort||'low',approval_policy:'never',project_doc_max_bytes:0,web_search:'disabled',
   'features.shell_tool':false,'features.apply_patch_freeform':false,'features.plugins':false,'features.hooks':false,'features.codex_hooks':false,'features.plugin_hooks':false,'features.apps':false,'features.collab':false,'features.multi_agent':false,'features.code_mode':false};
  for(const[k,v]of Object.entries(overrides))args.push('-c',`${k}=${JSON.stringify(v)}`);
  args.push('-');
  try{
   const events=await run(p.command,args,judgePrompt(request)+'\nOUTPUT_JSON_SCHEMA:\n'+JSON.stringify(outputSchema),{signal,cwd,maxOutputBytes:config.limits.maxOutputBytes,env,jsonl:true});
   return parseCodexEvents(events,p);
  }finally{await rm(cwd,{recursive:true,force:true});}
 }
 const args=['-p','--safe-mode','--model',p.model,'--effort',p.effort||'low','--add-dir',root,'--tools','','--disable-slash-commands','--strict-mcp-config','--mcp-config','{"mcpServers":{}}','--no-session-persistence','--max-budget-usd',String(config.limits.maxCallUsd),'--output-format','json'];
 if(process.env.LSP_SMELL_CLAUDE_DEBUG)args.push('--debug-file',process.env.LSP_SMELL_CLAUDE_DEBUG);
 const result=await run(p.command,args,judgePrompt(request)+'\nOUTPUT_JSON_SCHEMA:\n'+JSON.stringify({...outputSchema,properties:{findings:{...outputSchema.properties.findings,maxItems:config.limits.maxFindings}}}),{signal,cwd:root,maxOutputBytes:config.limits.maxOutputBytes,env});
 if(result.is_error)throw new Error(`Judge CLI failed: ${result.subtype||result.terminal_reason||'unknown'}`);
 const output=result.structured_output || parseModelJSON(result.result);
 return {output,usage:{reportedCostUsd:result.total_cost_usd??null,models:Object.keys(result.modelUsage||{}),durationMs:result.duration_ms??null,apiDurationMs:result.duration_api_ms??null,turns:result.num_turns??null,tokens:result.usage?{input:result.usage.input_tokens,output:result.usage.output_tokens,cacheRead:result.usage.cache_read_input_tokens,cacheCreate:result.usage.cache_creation_input_tokens}:null}};
}

export function parseCodexEvents(events,provider){
 if(events.some(e=>e.type==='turn.failed'||e.type==='error'))throw new Error('Codex judge failed');
 const completed=events.filter(e=>e.type==='turn.completed');
 const items=events.filter(e=>e.type==='item.completed').map(e=>e.item);
 if(items.some(i=>!['agent_message','reasoning','error'].includes(i?.type)))throw new Error('Judge attempted a tool operation: '+items.map(i=>i?.type).join(','));
 const messages=items.filter(i=>i?.type==='agent_message');
 if(completed.length!==1||messages.length!==1)throw new Error('Codex judge did not return one completed response');
 return {output:parseModelJSON(messages[0].text),usage:{reportedCostUsd:null,requestedModel:provider.model,requestedEffort:provider.effort||'low',modelVerifiedByResponse:false,nonFatalErrorItems:items.filter(i=>i?.type==='error').length,tokens:completed[0].usage||null}};
}
