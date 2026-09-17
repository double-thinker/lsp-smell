import{createHash}from'node:crypto';
import{makeRequest}from'./judge/prompt.js';
import{validateFindings}from'./judge/schema.js';
import{reserveBudget}from'./judge/budget.js';
import{invokeJudge}from'./judge/adapters.js';
export class ReviewEngine{
 constructor({config,root,publish,status,trace=()=>{},judge=invokeJudge,reserve=reserveBudget}){Object.assign(this,{config,root,publish,status,trace,judge,reserve});this.states=new Map();this.pending=new Map();this.cache=new Map();this.active=0;this.sequence=0;}
 update(document){
  const uri=document.uri,old=this.states.get(uri);if(old){clearTimeout(old.timer);old.controller?.abort();}
  const state={document,previous:old?.document.getText()||'',sequence:++this.sequence,ready:false};
  this.states.set(uri,state);this.pending.set(uri,state);
  this.publish({uri,version:document.version,diagnostics:[]});
  this.status({uri,version:document.version,state:'pending'});
  state.timer=setTimeout(()=>{state.ready=true;this.pump();},this.config.limits.debounceMs);
 }
 pump(){for(const[uri,state]of this.pending){if(this.active>=this.config.limits.maxConcurrency)break;if(!state.ready)continue;this.pending.delete(uri);this.run(state);}}
 async run(state){
  this.active++;const{document}=state,{uri,version}=document,start=performance.now();
  const controller=new AbortController();state.controller=controller;
  const timer=setTimeout(()=>controller.abort(),this.config.limits.timeoutMs);
  const current=()=>this.states.get(uri)===state;
  try{
   const request=makeRequest(document,state.previous,this.config);
   const key=createHash('sha256').update(JSON.stringify({provider:this.config.provider,prompts:this.config.prompts,context:this.config.context,uri,text:document.getText()})).digest('hex');
   let value=this.cache.get(key),cacheHit=!!value;
   if(!value){
    const budget=this.reserve(this.root,this.config);this.trace('judge-start',{uri,version,budget});
    value=await this.judge(request,this.config,{signal:controller.signal,root:this.root});
   }
   if(controller.signal.aborted||!current()){this.trace('review-discarded',{uri,version});return;}
   const diagnostics=validateFindings(value.output,document,this.config.prompts,this.config.limits.maxFindings);
   if(!cacheHit&&this.config.limits.cacheEntries){this.cache.set(key,value);while(this.cache.size>this.config.limits.cacheEntries)this.cache.delete(this.cache.keys().next().value);}
   const elapsedMs=performance.now()-start;
   this.publish({uri,version,diagnostics});this.status({uri,version,state:'complete',diagnostics,elapsedMs,cacheHit});
   this.trace('review-complete',{uri,version,diagnosticCount:diagnostics.length,elapsedMs,cacheHit,usage:value.usage||null});
  }catch(error){
   if(current()){
    const message=`LSP Smell: revisión incompleta (${error.message}). No es un resultado limpio.`;
    this.publish({uri,version,diagnostics:[{range:{start:{line:0,character:0},end:{line:0,character:0}},severity:3,source:'lsp-smell',code:'review-unavailable',message}]});
    this.status({uri,version,state:'failed',message});this.trace('review-failed',{uri,version,message,elapsedMs:performance.now()-start});
   }
  }finally{clearTimeout(timer);this.active--;this.pump();}
 }
 close(uri){const state=this.states.get(uri);if(state){clearTimeout(state.timer);state.controller?.abort();}this.states.delete(uri);this.pending.delete(uri);this.publish({uri,diagnostics:[]});}
 stop(){for(const uri of this.states.keys())this.close(uri);}
}
