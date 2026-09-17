import {test} from 'node:test';
import assert from 'node:assert/strict';
import {TextDocument} from 'vscode-languageserver-textdocument';
import {compile,analyze} from '../src/rules.js';
const rules=compile(['Prohíbe substr; usa slice','Prohíbe importar "lodash"; usa "lodash-es"']);
const check=text=>analyze(TextDocument.create('file:///sample.ts','typescript',1,text),rules);
test('reject unknown prompts',()=>assert.throws(()=>compile(['Haz código bonito'])));
test('detect methods, not comments or strings',()=>assert.equal(check('// x.substr()\nconst s="x.substr()"; x.substr(2); x["substr"](1);').length,2));
test('imports, require, dynamic import and subpaths',()=>assert.equal(check('import x from "lodash"; export * from "lodash/fp"; require("lodash"); import("lodash");').length,4));
test('clean code',()=>assert.deepEqual(check('x.slice(2); import x from "lodash-es";'),[]));
test('UTF16 positions',()=>assert.deepEqual(check('"😀"; x.substr(2)')[0].range.start,{line:0,character:8}));
const lifecycleRules=compile(['Prohíbe ??= en currentTurnRun; usa transición explícita','Prohíbe shift en pendingNativeContinuationTaskIds; usa identidad explícita','Prohíbe pop en persistentTurnBoundaries; usa identidad explícita']);
const lifecycle=text=>analyze(TextDocument.create('file:///provider.ts','typescript',1,text),lifecycleRules);
test('stale owner forms: members, identifiers, literal element access',()=>{
 assert.equal(lifecycle('this.currentTurnRun ??= run; currentTurnRun ??= run; this["currentTurnRun"] ??= run;').length,3);
 assert.deepEqual(lifecycle('this.currentTurnRun = run; this.cache ??= value; this.currentTurnRun ?? fallback;'),[]);
});
test('identity-free FIFO only on opted-in exact registries',()=>{
 assert.equal(lifecycle('run.pendingNativeContinuationTaskIds.shift(); pendingNativeContinuationTaskIds.shift(); this["persistentTurnBoundaries"]["pop"]();').length,3);
 assert.deepEqual(lifecycle('queue.shift(); pendingOther.shift(); this.persistentTurnBoundaries.get(event.id);'),[]);
});
test('lifecycle comments and strings are not code',()=>assert.deepEqual(lifecycle('// this.currentTurnRun ??= run\nconst a="run.pendingNativeContinuationTaskIds.shift()";'),[]));
test('English lifecycle grammar and unknown intent',()=>{
 assert.equal(compile(['Ban ??= on currentTurnRun; use explicit transition'])[0].kind,'ownership');
 assert.throws(()=>compile(['Prohíbe propietarios viejos']));
});
test('ownership counterexample preserves stale A while explicit transition installs B',()=>{
 const stale={currentTurnRun:'A'}; stale.currentTurnRun ??= 'B'; assert.equal(stale.currentTurnRun,'A');
 const corrected={currentTurnRun:'A'}; corrected.currentTurnRun='B'; assert.equal(corrected.currentTurnRun,'B');
});
