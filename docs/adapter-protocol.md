# Adaptadores de juez, protocolo v1

El núcleo no depende de un proveedor, SDK ni regex de política. Un adaptador implementa:

```js
async function invokeJudge(request, config, { signal, root }) {
  return { output: { findings: [] }, usage: { /* métricas opcionales */ } };
}
```

`request` incluye `protocol: "lsp-smell/judge-v1"`, `model`, `limits`, `policies: [{id,prompt}]`, `projectContext`, `document: {uri,languageId,version,lines:[{line,text}]}` y `change: {startLine,before,after,truncated}`. Las líneas empiezan en 1. Se entrega el documento completo dentro del límite, más resumen de cambios; nunca se declara limpio un documento truncado.

## Adaptador neutral de proceso

```json
{"provider":{"type":"command","command":"node","args":["/ruta/a/mi-juez.js"],"model":"modelo-pequeño"}}
```

Un proceso por revisión, sin shell. Recibe un JSON por stdin y devuelve un único JSON por stdout. El input añade `outputSchema`; el ejecutable debe tratar los prompts de proyecto como instrucciones de revisión y el código como datos, nunca ejecutar el código. Su stdout tiene este contrato:

```json
{"findings":[{"promptId":"ownership","startLine":8,"endLine":8,"quote":"owner ||= incoming;","message":"Un owner anterior puede impedir instalar al nuevo; comprueba la transición documentada.","confidence":0.85}],"usage":{"reportedCostUsd":0.002}}
```

Cada quote debe existir exactamente una vez dentro de las líneas declaradas. Los rangos LSP UTF-16 los calcula el host, no se confía en offsets inventados por el modelo. Prompts desconocidos, rangos inválidos, JSON roto o resultados demasiado grandes producen revisión incompleta, nunca «sin smells». La confianza viene del modelo, no está calibrada ni es una probabilidad medida de corrección. Por debajo de 0,7 se muestra como información, no se descarta silenciosamente.

El adaptador debe:
- no reintentar llamadas por su cuenta;
- respetar límites de tokens/coste enviados si el proveedor ofrece esos controles;
- terminar al recibir SIGTERM y no dejar hijos propios desacoplados;
- devolver usage real cuando exista, sin inventar precios;
- gestionar sus credenciales fuera del repositorio. El host no lee ni extrae claves.

El host limita llamadas admitidas, reserva presupuesto por llamada, impone timeout, mata solo el grupo de procesos que acaba de crear y limita stdout. Un comando arbitrario es código confiable del usuario, no un sandbox: podría ignorar controles de gasto remotos. El host no puede garantizar una factura máxima de un proveedor que no aplica límites duros.

## Adaptador Claude CLI incluido

Usa autenticación ya existente, `-p`, modelo configurable, tools vacíos, skills desactivadas, MCP externo desactivado, sin persistir sesión del juez, esquema JSON en el prompt con validación estricta del host y `--max-budget-usd`. No usa `--bare`: esta versión de Claude ignora OAuth en modo bare. No cambia `CLAUDE_CONFIG_DIR`, credenciales ni configuración global. El entorno `CLAUDECODE` se elimina únicamente del subprocess del juez para permitir el print acotado desde un hook de una sesión Claude; no abre un agente interactivo ni le da herramientas.

Se usa `--safe-mode` solo en el subprocess del juez: desactiva customizaciones del proyecto/usuario, conserva autenticación y políticas administradas y evita recursión de hooks. No modifica ficheros de configuración. No prometemos aislamiento equivalente a una API. Sonnet como agente que modifica código y Haiku como juez son sesiones distintas; el juez no puede editar. Los logs diagnósticos opcionales (`LSP_SMELL_CLAUDE_DEBUG`) deben mantenerse privados.

## AI SDK

Se revisó la [referencia primaria de generateText](https://ai-sdk.dev/docs/reference/ai-sdk-core/generate-text): acepta modelo, salida estructurada, `abortSignal`, límites de salida, timeout y reintentos configurables. Sería una implementación válida detrás del adaptador neutral, con `maxRetries: 0` y `Output.object(...)`; no se instaló ni se afirma haber probado esa integración. Elegimos un protocolo de proceso pequeño para no imponer SDK/proveedor ni activar APIs nuevas. La vía LLM probada se documenta en README con sus mediciones reales.

La salida textual puede ser JSON puro o un único bloque Markdown JSON completo. No extraemos JSON de prosa arbitraria ni corregimos valores inventados. La validación local se mantiene después de quitar solo ese envoltorio.

## Adaptador Codex CLI / Luna

`{"provider":{"type":"codex-cli","command":"codex","model":"gpt-5.6-luna","effort":"low"}}`

Usa `codex exec --ignore-user-config --ephemeral --skip-git-repo-check --sandbox read-only --json` en un directorio temporal vacío. Conserva CODEX_HOME y su autenticación, sin leer ni copiar secretos. Los overrides por invocación desactivan shell, plugins, hooks, apps, colaboración, búsquedas y documentos AGENTS. No se modifica configuración global. Requiere CLI con esos flags (probado 0.153.4), no implica soporte LSP nativo de Codex.

El host exige un solo turno completado y una respuesta JSON, rechaza eventos de ejecución de herramientas y fallos de turno. Los `item.error` no fatales se contabilizan en usage; no equivalen por sí solos a herramientas ejecutadas. Los rangos y el contenido siguen pasando la validación común. El parser no convierte un turno incompleto en revisión limpia.

Este CLI no ofrece aquí un hard cap USD por llamada: maxCallUsd es reserva contable, no límite de factura. Se aplican máximo de invocaciones, timeout, bytes y cancelación del grupo de procesos. Los reintentos internos del transporte Codex no se contabilizan como invocaciones distintas del host; no prometemos exactamente una petición HTTP por llamada. Coste no reportado se conserva null. El modelo solicitado no se presenta como atestación del backend. Un API directo con límite de salida sería una alternativa futura, no implementada ni activada.
