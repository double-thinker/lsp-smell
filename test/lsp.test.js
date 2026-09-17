import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createMessageConnection,StreamMessageReader,StreamMessageWriter} from 'vscode-jsonrpc/node.js';
import {pathToFileURL} from 'node:url';
test('real stdio initialize, open, incremental edit, clear, close, shutdown', {timeout:10000},async()=>{
 const child=spawn(process.execPath,['src/server.js','--stdio']);
 const connection=createMessageConnection(new StreamMessageReader(child.stdout),new StreamMessageWriter(child.stdin));
 const queue=[]; let waiter;
 connection.onNotification('textDocument/publishDiagnostics',p=>{if(waiter){waiter(p);waiter=undefined;}else queue.push(p);});
 const next=()=>queue.length?Promise.resolve(queue.shift()):new Promise(r=>waiter=r);
 connection.listen();
 try {
 const info=await connection.sendRequest('initialize',{processId:process.pid,rootUri:pathToFileURL(process.cwd()).href,capabilities:{},initializationOptions:{config:process.cwd()+'/test/ast-config.json'}});
 assert.equal(info.capabilities.textDocumentSync,2);
 await connection.sendNotification('initialized',{});
 const uri=pathToFileURL(process.cwd()+'/examples/test.ts').href;
 await connection.sendNotification('textDocument/didOpen',{textDocument:{uri,languageId:'typescript',version:1,text:'x.substr(1);'}});
 assert.equal((await next()).diagnostics[0].source,'lsp-smell');
 await connection.sendNotification('textDocument/didChange',{textDocument:{uri,version:2},contentChanges:[{range:{start:{line:0,character:2},end:{line:0,character:8}},text:'slice'}]});
 const clean=await next(); assert.equal(clean.version,2); assert.deepEqual(clean.diagnostics,[]);
 await connection.sendNotification('textDocument/didClose',{textDocument:{uri}}); assert.deepEqual((await next()).diagnostics,[]);
 await connection.sendRequest('shutdown'); await connection.sendNotification('exit');
 } finally {connection.dispose();child.kill();}
});
