import{createConnection,ProposedFeatures,TextDocuments,TextDocumentSyncKind}from'vscode-languageserver/node.js';
import{TextDocument}from'vscode-languageserver-textdocument';
import{readFileSync,appendFileSync}from'node:fs';
import{resolve}from'node:path';
import{fileURLToPath}from'node:url';
import{compile,analyze}from'./rules.js';
import{parseConfig}from'./config.js';
import{ReviewEngine}from'./review-engine.js';
const connection=createConnection(ProposedFeatures.all),documents=new TextDocuments(TextDocument);
let config,engine,rules=[];
function trace(event,data){if(process.env.LSP_SMELL_TRACE)appendFileSync(process.env.LSP_SMELL_TRACE,JSON.stringify({event,...data})+'\n');}
const status=params=>connection.sendNotification('lsp-smell/status',params);
connection.onInitialize(params=>{
 const root=params.rootUri?fileURLToPath(params.rootUri):process.cwd();
 config=parseConfig(JSON.parse(readFileSync(params.initializationOptions?.config||process.env.LSP_SMELL_CONFIG||resolve(root,'.lsp-smell.json'),'utf8')));
 if(config.mode==='ast')rules=compile(config.prompts.map(p=>p.prompt));
 else engine=new ReviewEngine({config,root,publish:p=>connection.sendDiagnostics(p),status,trace});
 trace('initialize',{mode:config.mode,promptIds:config.prompts.map(p=>p.id),provider:config.mode==='llm'?{type:config.provider.type,model:config.provider.model}:null});
 return{capabilities:{textDocumentSync:TextDocumentSyncKind.Incremental},serverInfo:{name:'lsp-smell',version:'0.2.0'}};
});
documents.onDidChangeContent(({document})=>{
 if(engine){engine.update(TextDocument.create(document.uri,document.languageId,document.version,document.getText()));return;}
 const diagnostics=analyze(document,rules);connection.sendDiagnostics({uri:document.uri,version:document.version,diagnostics});status({uri:document.uri,version:document.version,state:'complete',diagnostics});
 trace('diagnostics',{uri:document.uri,version:document.version,diagnostics});
});
documents.onDidClose(({document})=>engine?engine.close(document.uri):connection.sendDiagnostics({uri:document.uri,diagnostics:[]}));
connection.onShutdown(()=>engine?.stop());
process.once('SIGTERM',()=>{engine?.stop();setTimeout(()=>process.exit(0),600);});
process.once('SIGINT',()=>{engine?.stop();setTimeout(()=>process.exit(0),600);});
connection.onExit(()=>engine?.stop());
documents.listen(connection);connection.listen();
