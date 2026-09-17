"""Extract tool edits, hook output and final answer, never private thinking/auth metadata."""
import json, pathlib
root=pathlib.Path(__file__).resolve().parents[1]
e=root/'evidence'
rows=[json.loads(x) for x in (e/'raw-hook-session.jsonl').read_text().splitlines()]
result=next(x for x in rows if x.get('type')=='result')
out={'session_id':result['session_id'],'model':'claude-sonnet-5','claude_code':'2.1.273','integration':'PostToolUse hook -> real stdio LSP -> additionalContext','edits':[],'final_answer':result['result'],'duration_ms':result['duration_ms'],'reported_list_price_usd':result['total_cost_usd']}
for row in rows:
 if row.get('type')=='assistant':
  for c in row.get('message',{}).get('content',[]):
   if c.get('type')=='tool_use' and c.get('name')=='Edit':
    v=c['input']; out['edits'].append({'file':'sample.ts','old':v['old_string'],'new':v['new_string'],'timestamp':row.get('timestamp')})
(e/'real-session.json').write_text(json.dumps(out,ensure_ascii=False,indent=2)+'\n')
trace=[json.loads(x) for x in (e/'raw-hook-lsp.jsonl').read_text().splitlines()]
for x in trace:
 if 'uri' in x:x['uri']='file:///demo/sample.ts'
(e/'lsp-events.json').write_text(json.dumps(trace,ensure_ascii=False,indent=2)+'\n')
lines=[x for x in (e/'raw-hook-debug.log').read_text().splitlines() if 'provided additionalContext' in x or 'Checking first line for async:' in x and 'LSP Smell' in x]
(e/'hook-delivery.log').write_text('\n'.join(lines)+'\n')
