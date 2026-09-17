export function parseConfig(raw) {
  const prompts = typeof raw.prompts === 'string' ? [raw.prompts] : raw.prompts;
  if (!Array.isArray(prompts) || !prompts.length || prompts.length > 16) throw new Error('Provide 1-16 free-form prompts');
  const normalized = prompts.map((p,i)=> typeof p==='string'?{id:`prompt-${i+1}`,prompt:p}:p);
  if(normalized.some(p=>!p || !/^[\w-]{1,64}$/.test(p.id) || typeof p.prompt!=='string' || !p.prompt.trim() || p.prompt.length>8000)) throw new Error('Invalid prompt id or text');
  if(new Set(normalized.map(p=>p.id)).size!==normalized.length) throw new Error('Duplicate prompt ids');
  const mode=raw.mode||'llm';
  if(!['llm','ast'].includes(mode)) throw new Error('mode must be llm or ast');
  const defaults={debounceMs:350,maxConcurrency:1,timeoutMs:45000,maxDocumentChars:32000,maxOutputBytes:65536,maxFindings:12,cacheEntries:0,maxCalls:12,maxTotalReservedUsd:1.2,maxCallUsd:0.1};
  const limits={...defaults,...raw.limits};
  const bounds={debounceMs:[0,10000],maxConcurrency:[1,4],timeoutMs:[100,120000],maxDocumentChars:[100,100000],maxOutputBytes:[1000,1000000],maxFindings:[1,50],cacheEntries:[0,100],maxCalls:[1,1000],maxTotalReservedUsd:[0.001,1000],maxCallUsd:[0.001,100]};
  for(const [k,[min,max]] of Object.entries(bounds)) if(!Number.isFinite(limits[k])||limits[k]<min||limits[k]>max||(!k.toLowerCase().includes('usd')&&!Number.isInteger(limits[k]))) throw new Error(`Invalid limit: ${k}`);
  if(limits.maxCallUsd>limits.maxTotalReservedUsd) throw new Error('Call reservation exceeds total budget');
  const provider=raw.provider||{type:'codex-cli',command:'codex',model:'gpt-5.6-luna',effort:'low'};
  if(!['claude-cli','codex-cli','command'].includes(provider.type)) throw new Error('Provider must be claude-cli, codex-cli or command');
  if(typeof provider.command!=='string'||!provider.command.trim()) throw new Error('Provider command is required');
  if(provider.type!=='command'&&(!provider.model||typeof provider.model!=='string')) throw new Error('Choose a model explicitly');
  if(provider.type==='codex-cli' && provider.effort && !['low','medium','high','xhigh','max'].includes(provider.effort)) throw new Error('Codex effort must use supported spelling (light maps to low)');
  if(provider.args && (!Array.isArray(provider.args)||provider.args.some(a=>typeof a!=='string')))throw new Error('Provider args must be strings');
  if(raw.context!==undefined&&(typeof raw.context!=='string'||raw.context.length>16000))throw new Error('context must be text up to 16000 characters');
  return {mode,prompts:normalized,context:raw.context||'',limits,provider,budgetFile:raw.budgetFile||'.lsp-smell-budget.json'};
}
