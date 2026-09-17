export const outputSchema={type:'object',additionalProperties:false,required:['findings'],properties:{findings:{type:'array',maxItems:12,items:{type:'object',additionalProperties:false,required:['promptId','startLine','endLine','quote','message','confidence'],properties:{promptId:{type:'string'},startLine:{type:'integer',minimum:1},endLine:{type:'integer',minimum:1},quote:{type:'string',minLength:1,maxLength:2000},message:{type:'string',minLength:1,maxLength:2000},confidence:{type:'number',minimum:0,maximum:1}}}}}};
export function validateFindings(output,document,prompts,maxFindings=12){
 if(!output || typeof output!=='object' || !Array.isArray(output.findings)||output.findings.length>maxFindings)throw new Error('Invalid judge findings envelope');
 const text=document.getText(),lines=text.split('\n'), ids=new Set(prompts.map(p=>p.id));
 return output.findings.map(f=>{
  if(!f||!ids.has(f.promptId)||!Number.isInteger(f.startLine)||!Number.isInteger(f.endLine)||f.startLine<1||f.endLine<f.startLine||f.endLine>lines.length||typeof f.quote!=='string'||!f.quote||f.quote.length>2000||typeof f.message!=='string'||!f.message.trim()||f.message.length>2000||!Number.isFinite(f.confidence)||f.confidence<0||f.confidence>1)throw new Error('Invalid judge finding fields/range');
  const start=document.offsetAt({line:f.startLine-1,character:0});
  const end=f.endLine<lines.length?document.offsetAt({line:f.endLine,character:0}):text.length;
  const span=text.slice(start,end),at=span.indexOf(f.quote);
  if(at<0||span.indexOf(f.quote,at+1)>=0)throw new Error('Judge quote must match exactly once inside its stated lines');
  return {range:{start:document.positionAt(start+at),end:document.positionAt(start+at+f.quote.length)},severity:f.confidence>=0.7?2:3,source:'lsp-smell',code:f.promptId,message:`${f.message} [LLM, confianza ${Math.round(f.confidence*100)}%]`,data:{confidence:f.confidence,judge:true}};
 });
}
