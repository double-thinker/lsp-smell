// Execute only the trusted, local integration fixture. Never use on untrusted input.
import ts from 'typescript';
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const source=readFileSync(new URL('../.demo/lifecycle/provider.ts',import.meta.url),'utf8');
const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext}}).outputText;
const {Provider}=await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));
const provider=new Provider();
provider.openTurn('A');
// Contract: predecessor A has completed before the caller invokes openTurn B.
provider.openTurn('B');
assert.equal(provider.currentTurnRun,'B');
assert.equal(provider.name,'demo');
console.log('Lifecycle contract PASS: completed A -> new owner B, public name preserved.');
