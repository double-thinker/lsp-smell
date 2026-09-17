import {readFileSync,realpathSync} from 'node:fs';
import {resolve,relative,extname,isAbsolute} from 'node:path';
import {diagnose} from './client.js';
let input=''; for await (const chunk of process.stdin) input+=chunk;
try {
 const event=JSON.parse(input);
 const root=realpathSync(event.cwd||process.cwd());
 const filename=event.tool_input?.file_path;
 if(!filename || !['.ts','.tsx','.js','.jsx','.mts','.cts','.mjs','.cjs'].includes(extname(filename))) process.exit(0);
 const file=realpathSync(resolve(root,filename));
 const rel=relative(root,file);
 if(rel==='..'||rel.startsWith('../')||isAbsolute(rel)) throw new Error('Edited file is outside project root');
 const text=readFileSync(file,'utf8');
 if(Buffer.byteLength(text)>2*1024*1024) throw new Error('File exceeds 2 MiB limit');
 const diagnostics=await diagnose({file,text,root});
 const lines=diagnostics.map(d=>`${rel}:${d.range.start.line+1}:${d.range.start.character+1} [${d.source}/${d.code}] ${d.message}`);
 console.log(JSON.stringify({hookSpecificOutput:{hookEventName:'PostToolUse',additionalContext:lines.length?`LSP Smell diagnostics (real stdio server):\n${lines.join('\n')}\nThese are fallible LLM review findings, not proven errors. Check the evidence and contract; correct supported issues before finishing.`:'LSP Smell: no policy diagnostics for this edit.'}}));
} catch(error) {
 console.log(JSON.stringify({hookSpecificOutput:{hookEventName:'PostToolUse',additionalContext:`LSP Smell verification FAILED: ${error.message}. Do not interpret this as a clean check.`}}));
}
