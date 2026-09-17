import{openSync,closeSync,readFileSync,writeFileSync,renameSync,unlinkSync}from'node:fs';
import{resolve}from'node:path';
export function reserveBudget(root,config){
 const file=resolve(root,config.budgetFile),lock=file+'.lock';let fd;
 try{
  fd=openSync(lock,'wx',0o600);
  let state={calls:0,reservedUsd:0};
  try{state=JSON.parse(readFileSync(file,'utf8'));}catch(e){if(e.code!=='ENOENT')throw new Error('Budget ledger unreadable; refusing a model call');}
  if(!Number.isInteger(state.calls)||state.calls<0||!Number.isFinite(state.reservedUsd)||state.reservedUsd<0)throw new Error('Invalid budget ledger');
  if(state.calls>=config.limits.maxCalls||state.reservedUsd+config.limits.maxCallUsd>config.limits.maxTotalReservedUsd+1e-9)throw new Error('Review budget exhausted; user must explicitly authorize a new budget');
  state={calls:state.calls+1,reservedUsd:Number((state.reservedUsd+config.limits.maxCallUsd).toFixed(6))};
  const tmp=file+`.${process.pid}.tmp`;writeFileSync(tmp,JSON.stringify(state)+'\n',{mode:0o600});renameSync(tmp,file);return state;
 }finally{if(fd!==undefined){closeSync(fd);unlinkSync(lock);}}
}
