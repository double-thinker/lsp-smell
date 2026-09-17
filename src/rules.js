import ts from 'typescript';
// Intentionally bounded natural-language grammar. Never guesses unsupported intent.
export function compile(prompts) {
  if (!Array.isArray(prompts)) throw new Error('prompts must be an array');
  return prompts.map((prompt, index) => {
    if (typeof prompt !== 'string') throw new Error('Each prompt must be a string');
    const method = /^(?:prohíbe|prohibe|ban)\s+(?:el método\s+|method\s+)?([\w$]+)(?:\(\))?\s*[;,]\s*(?:usa|use)\s+([\w$]+)(?:\(\))?\.?$/i.exec(prompt.trim());
    const imp = /^(?:prohíbe|prohibe|ban)\s+import(?:ar)?\s+["']([^"']+)["']\s*[;,]\s*(?:usa|use)\s+["']([^"']+)["']\.?$/i.exec(prompt.trim());
    const ownership = /^(?:prohíbe|prohibe|ban)\s+\?\?=\s+(?:en|on)\s+([\w$]+)\s*[;,]\s*(?:usa transición explícita|use explicit transition)\.?$/i.exec(prompt.trim());
    const fifo = /^(?:prohíbe|prohibe|ban)\s+(shift|pop)\s+(?:en|on)\s+([\w$]+)\s*[;,]\s*(?:usa identidad explícita|use explicit identity)\.?$/i.exec(prompt.trim());
    if (ownership) return {id:`smell-${index+1}`,kind:'ownership',field:ownership[1],prompt};
    if (fifo) return {id:`smell-${index+1}`,kind:'fifo',method:fifo[1].toLowerCase(),field:fifo[2],prompt};
    if (!method && !imp) throw new Error(`Unsupported prompt: ${prompt}. Use: Prohíbe substr; usa slice OR Prohíbe importar "lodash"; usa "lodash-es"`);
    return {id:`smell-${index+1}`, kind:method?'method':'import', banned:(method||imp)[1], replacement:(method||imp)[2], prompt};
  });
}
function accessName(node) {
  while(ts.isParenthesizedExpression(node)) node=node.expression;
  if(ts.isIdentifier(node)) return node.text;
  if(ts.isPropertyAccessExpression(node)) return node.name.text;
  if(ts.isElementAccessExpression(node) && node.argumentExpression && ts.isStringLiteral(node.argumentExpression)) return node.argumentExpression.text;
}
export function analyze(document, rules) {
  const source = ts.createSourceFile(document.uri, document.getText(), ts.ScriptTarget.Latest, true, /react|tsx|jsx/.test(document.languageId)?ts.ScriptKind.TSX:ts.ScriptKind.TS);
  const result=[];
  function visit(node) {
    for (const rule of rules) {
      let target, message;
      if (rule.kind==='ownership' && ts.isBinaryExpression(node) && node.operatorToken.kind===ts.SyntaxKind.QuestionQuestionEqualsToken && accessName(node.left)===rule.field) {
        target=node.operatorToken;
        message=`No uses ??= en ${rule.field}: puede conservar al propietario anterior. Usa una transición explícita que instale al nuevo propietario o rechace el conflicto. No basta sustituir el operador sin verificar el contrato.`;
      }
      if (rule.kind==='fifo' && ts.isCallExpression(node) && accessName(node.expression)===rule.method && (ts.isPropertyAccessExpression(node.expression)||ts.isElementAccessExpression(node.expression)) && accessName(node.expression.expression)===rule.field) {
        target=node.expression;
        message=`No uses ${rule.method}() en ${rule.field}: el orden no demuestra identidad. Correlaciona por el ID explícito del evento y conserva los elementos no relacionados. Una cola FIFO ordinaria no está prohibida.`;
      }
      if (rule.kind==='method' && ts.isCallExpression(node)) {
        const e=node.expression;
        if (ts.isPropertyAccessExpression(e) && e.name.text===rule.banned) target=e.name;
        if (ts.isElementAccessExpression(e) && e.argumentExpression && ts.isStringLiteral(e.argumentExpression) && e.argumentExpression.text===rule.banned) target=e.argumentExpression;
      }
      if (rule.kind==='import') {
        let literal;
        if (ts.isImportDeclaration(node)||ts.isExportDeclaration(node)) literal=node.moduleSpecifier;
        if (ts.isCallExpression(node) && (node.expression.kind===ts.SyntaxKind.ImportKeyword || (ts.isIdentifier(node.expression)&&node.expression.text==='require'))) literal=node.arguments[0];
        if (literal && ts.isStringLiteral(literal) && (literal.text===rule.banned||literal.text.startsWith(rule.banned+'/'))) target=literal;
      }
      if(target) result.push({range:{start:document.positionAt(target.getStart(source)),end:document.positionAt(target.getEnd())}, severity:2, source:'lsp-smell',code:rule.id,message:message || `${rule.banned} está prohibido por la política del proyecto. Usa ${rule.replacement}. Revisa equivalencia semántica antes de sustituir.`, data:{prompt:rule.prompt}});
    }
    ts.forEachChild(node,visit);
  }
  visit(source); return result;
}
