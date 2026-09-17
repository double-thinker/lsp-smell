# Smells con evidencia de nuestros repositorios

Nota 0.2: estas lecciones alimentan ahora prompts libres del juez LLM. Los dos detectores AST descritos abajo son auxiliares históricos de 0.1, no el núcleo del producto. La demo semántica y sus límites están en el README y evidence/llm-session.json.

Investigación de solo lectura del 17/09/2026. Fuente principal: `agent-runtime/docs/learnings/`, que documenta incidentes en código enviado y enlaza commits. No son bugs descubiertos en este MVP ni se atribuye cada línea a un modelo concreto: la documentación acredita los fallos, no una auditoría de autoría IA. La búsqueda PKM con qmd no aportó ejemplos de código más precisos que este catálogo.

Las rutas siguientes son relativas al repo indicado. El checkout de agent-runtime consultado estaba en `e3681360dfd708fc264dc0bb13c15886d1c2b652`. No se modificaron esos repositorios.

## 1. Propietario antiguo conservado por `??=`: implementado

Evidencia: `agent-runtime/docs/learnings/L-01-ownership-by-nullish-slot.md:5-13,23-26,35-41`. La asignación exacta en [da104e3, provider.ts:296](https://github.com/double-thinker/agent-runtime/blob/da104e3/src/providers/claude-sdk-query/provider.ts#L296) es `this.currentTurnRun ??= activeRun`, verificada además con `git show`. El learning documenta que el mismo patrón existía en la vía PTY (líneas 12-13). La repetición entre ambos providers está documentada; no se ha reconstruido aquí todo su historial.

Efecto: los frames del turno B podían enrutarse al propietario A y dejar B esperando. No es una preferencia estética por `=`.

Detector MVP: `BinaryExpression` con operador `??=` y nombre exacto de destino declarado por el prompt, sea identificador, miembro o acceso literal. Prompt: `Prohíbe ??= en currentTurnRun; usa transición explícita`.

Falsos positivos: otro objeto o variable con el mismo nombre podría ser una caché válida. Por eso es opt-in; el detector no resuelve símbolos ni tipos. Falsos negativos: alias, nombres distintos o asignaciones equivalentes escritas como condición. La reparación depende del contrato: instalar explícitamente al nuevo owner o rechazar conflicto, no cambiar ciegamente el operador.

El repo original ya tiene `sg-rules/no-nullish-ownership-assignment.yml` con scopes por archivo y sufijos de campo. Este MVP no sustituye su CI: lleva una variante explícita y más estrecha al momento de editar.

## 2. Correlacionar eventos por `shift/pop`: implementado

Evidencia: `agent-runtime/docs/learnings/L-02-identity-free-fifo-matching.md:5-14,22-27,35-40`. En [00eb2a5, provider.ts:754](https://github.com/double-thinker/agent-runtime/blob/00eb2a5/src/providers/claude-sdk-query/provider.ts#L754), comprobado con `git show`, se tomaba `run.pendingNativeContinuationTaskIds.shift()`. La misma familia aparece documentada en `persistentTurnBoundaries` del camino PTY (línea 14).

Efecto: un evento ausente, duplicado o reordenado puede cerrar la continuación equivocada. El orden solo sería válido si el protocolo lo garantizase.

Detector MVP: llamada a `shift` o `pop` sobre el registro de nombre exacto que declara el prompt. Ejemplo: `Prohíbe shift en pendingNativeContinuationTaskIds; usa identidad explícita`. Se pueden declarar ambas operaciones por separado. No marca `queue.shift()` en una cola ordinaria.

Falsos positivos: un registro homónimo podría ser FIFO legítimo. Falsos negativos: alias, destructuring y helpers indirectos. No demuestra que la alternativa esté correlacionada correctamente: hacen falta tests de eventos duplicados y fuera de orden. El original ya tiene `sg-rules/no-shift-on-pending-registries.yml`.

## 3. Desacoplar un consumidor con `void drain.catch().finally()`: candidato

Evidencia: `agent-runtime/docs/learnings/L-13-fire-and-forget-consumers.md:5-15,23-28,36-41`, que enlaza [agentbridge bd3c11a, agent.ts:1729](https://github.com/double-thinker/agentbridge/blob/bd3c11a/src/agent.ts#L1729). Un error de callback podía terminar el consumo antes del cierre autoritativo, dejando actividad fantasma. El learning relaciona dos hallazgos de auditoría; no lo contamos como dos reintroducciones independientes del mismo código.

Detector posible: `VoidExpression` cuya cadena raíz sea una promesa de drain declarada por configuración y termine en `catch(...).finally(...)`. Existe la regla enfocada `agentbridge/sg-rules/no-fire-and-forget-owned-drain.yml`.

Falsos positivos: consumidores intencionadamente desprendidos que ya tienen supervisión externa. Falsos negativos: aliases, otros nombres o supervisión perdida dentro de helpers. No está implementado aquí: «tiene owner y reconcilia fallo» requiere verificar ciclo de vida, no basta buscar `.catch` ni exigir `await` en todas partes.

## 4. Identidad de control extraída de texto renderizable: candidato

Evidencia: `agent-runtime/docs/learnings/L-06-in-band-text-as-control.md:5-12,20-24,32-37`, [da104e3, provider.ts:1004](https://github.com/double-thinker/agent-runtime/blob/da104e3/src/providers/claude-sdk-query/provider.ts#L1004). `background-foreground-session-redesign.md:230` documenta otra lectura sin protección en PTY y contrasta con el tailer que sí comprobaba el origen. Es recurrencia de la familia, no evidencia de que toda regex XML sea incorrecta.

Detector posible: `.match()` con literal regex que contenga `task-id`, solo en módulos de atribución declarados. Debería excluir explícitamente el decoder de frontera que valida origen. Ya existe `sg-rules/no-task-id-regex-on-text.yml` en el original.

Falsos positivos: renderizar XML legítimo, tests o decoders autorizados. Falsos negativos: regex construida, otras funciones o helpers. No implementado en el MVP: sin scopes/excepciones documentados se convertiría en una prohibición demasiado amplia. La alternativa correcta usa metadata del proveedor, no necesariamente eliminar todo parsing.

## 5. Tratar tiempo transcurrido como readiness/resultado: no es lint general

Evidencia repetida en dos contextos: `agent-runtime/docs/learnings/L-14-time-as-readiness.md:5-12` documenta prompts perdidos pese a un delay de dos segundos; `L-27-observation-window-as-outcome.md:8-13` documenta un probe de 15 segundos que declaraba una regresión antes de que entrara el handler real. El segundo explica expresamente en líneas 34-45 por qué no añadió una regla AST universal.

Detector limitado posible: señalar `Promise.race` con delay en archivos de probes previamente delimitados como petición de revisión. No puede determinar por AST si el timeout es un watchdog válido que falla o una falsa prueba de éxito/ausencia.

No implementado. Prohibir `setTimeout`, `sleep` o `Promise.race` produciría falsos positivos graves y no acreditaría causalidad. Mejor tests de edges reales, watchdog que solo falla y revisión semántica. Un juez LLM podría ayudar a revisar intención, pero tampoco probaría el contrato y no existe en este producto.

## Criterio

Se implementaron los dos primeros porque tienen repetición documentada y una forma estructural delimitable. No se convirtieron reglas operativas de puertos, calendario o despliegue en lint de código, ni se presentó el catálogo como cinco errores nuevos de IA demostrados. El valor es adelantar feedback que ya tiene fundamento técnico y evidencia.
