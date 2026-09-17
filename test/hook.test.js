import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
const hook=resolve('src/claude-hook.js');
test('real Claude adapter returns diagnostics, clean result and visible config errors',()=>{
 const root=mkdtempSync(join(tmpdir(),'lsp-smell-'));
 const invoke=(file='sample.ts')=>{
  const p=spawnSync(process.execPath,[hook],{input:JSON.stringify({cwd:root,tool_input:{file_path:file}}),encoding:'utf8',timeout:10000});
  assert.equal(p.status,0,p.stderr); return p.stdout?JSON.parse(p.stdout).hookSpecificOutput.additionalContext:'';
 };
 try {
 writeFileSync(join(root,'.lsp-smell.json'),JSON.stringify({mode:'ast',prompts:['Prohíbe substr; usa slice']}));
 writeFileSync(join(root,'sample.ts'),'"hello".substr(1);'); assert.match(invoke(),/smell-1/);
 writeFileSync(join(root,'sample.ts'),'"hello".slice(1);'); assert.match(invoke(),/no policy diagnostics/);
 assert.equal(invoke('readme.md'),'');
 rmSync(join(root,'.lsp-smell.json')); assert.match(invoke(),/FAILED/);
 } finally {rmSync(root,{recursive:true,force:true});}
});
