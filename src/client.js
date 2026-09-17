import {spawn} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {parseConfig} from './config.js';
import {createMessageConnection,StreamMessageReader,StreamMessageWriter} from 'vscode-jsonrpc/node.js';
import {fileURLToPath,pathToFileURL} from 'node:url';
export async function diagnose({file,text,root,timeoutMs}) {
 if(timeoutMs===undefined){const config=parseConfig(JSON.parse(readFileSync(process.env.LSP_SMELL_CONFIG||resolve(root,'.lsp-smell.json'),'utf8')));timeoutMs=config.mode==='ast'?5000:config.limits.timeoutMs+10000;}
 const child=spawn(process.execPath,[fileURLToPath(new URL('./server.js',import.meta.url)),'--stdio'],{cwd:root,stdio:['pipe','pipe','pipe']});
 const connection=createMessageConnection(new StreamMessageReader(child.stdout),new StreamMessageWriter(child.stdin));
 const uri=pathToFileURL(file).href;
 let timer, rejectTransport;
 const diagnostics=new Promise((resolve,reject)=>{
  rejectTransport=reject;
  connection.onNotification('lsp-smell/status',p=>{if(p.uri!==uri)return;if(p.state==='complete')resolve(p.diagnostics);if(p.state==='failed')reject(new Error(p.message));});
  connection.onClose(()=>reject(new Error('LSP connection closed before completed review')));
 });
 const failure=new Promise((_,reject)=>{
  timer=setTimeout(()=>reject(new Error('LSP timeout')),timeoutMs);
  child.on('error',reject);
  child.on('exit',code=>{if(code)reject(new Error(`LSP exited ${code}`));});
 });
 connection.onError(error=>rejectTransport(error));
 connection.listen();
 try {
 return await Promise.race([(async()=>{
  await connection.sendRequest('initialize',{processId:process.pid,rootUri:pathToFileURL(root).href,capabilities:{}});
  await connection.sendNotification('initialized',{});
  await connection.sendNotification('textDocument/didOpen',{textDocument:{uri,languageId:/\.[jt]sx$/.test(file)?'typescriptreact':'typescript',version:1,text}});
  const result=await diagnostics;
  await connection.sendRequest('shutdown'); await connection.sendNotification('exit');
  return result;
 })(),failure]);
 } finally {clearTimeout(timer);connection.dispose();child.kill();}
}
