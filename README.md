# LSP Smell

**Prompts libres → una IA revisora pequeña → diagnósticos durante la edición.**

Un LSP asíncrono por stdio que pregunta a un modelo por antipatrones semánticos. Puedes dar una política en lenguaje natural o varias, sin aprender una gramática. Cada prompt conserva su identidad en los diagnósticos. Proveedor/modelo y presupuesto son configurables.

```json
{
  "prompts": [
    {"id":"ownership","prompt":"Revisa quién es dueño de cada tarea. No aceptes correlacionar un evento con el último turno solo porque llegó después. Si falta identidad fiable, indícalo; no inventes un owner."},
    {"id":"readiness","prompt":"Detecta si se da por lista una operación por haber esperado un tiempo fijo en vez de observar su finalización. Un timeout que solo falla es válido: no marques todos los timers."}
  ],
  "provider":{"type":"codex-cli","command":"codex","model":"gpt-5.6-luna","effort":"low"},
  "limits":{"debounceMs":350,"maxConcurrency":2,"timeoutMs":45000,"maxCalls":12,"maxCallUsd":0.1,"maxTotalReservedUsd":1.2}
}
```

`prompts` también acepta un string o una lista de strings. `context` permite añadir contratos del proyecto. Todos los prompts se evalúan en una llamada para la versión actual del archivo, no una llamada por política.

## Qué cambió en 0.2

La implementación inicial 0.1 confundió la idea con un compilador de frases a reglas AST. No era el producto solicitado. El núcleo ahora es el juez LLM de prompts arbitrarios; AST queda como modo auxiliar explícito (`"mode":"ast"`) para políticas mecánicas antiguas. Las evidencias AST anteriores se conservan como historial, **no demuestran el juez LLM**.

El juez no demuestra corrección. Puede omitir errores, interpretar mal un contrato y producir falsos positivos. Cada hallazgo incluye mensaje, quote/rango verificable y confianza declarada por el modelo, no calibrada estadísticamente. No hay autofix: el agente contrasta el aviso y decide la corrección; los tests de contrato siguen siendo necesarios.

## Con hook o con LSP

### Instalar proyecto-local

Requiere Node.js 20+, npm y un proveedor/juez autorizado. El adaptador por defecto usa Codex CLI y su autenticación existente para Luna. El adaptador Claude sigue disponible. Los modelos consumen cuota. No se crean credenciales ni se conecta una API de pago nueva.

```bash
git clone git@github.com:double-thinker/lsp-smell.git
cd lsp-smell
npm ci
npm test
# Configura .lsp-smell.json en la raíz de tu proyecto.
```

`npm test` es offline: los transportes simulados comprueban protocolo, no se venden como demos de IA.

### Hook de Claude Code

```bash
cd /ruta/a/tu-proyecto
claude --plugin-dir /ruta/a/lsp-smell/integrations/claude-hooks
```

Tras `Edit|Write`, el hook conecta con este LSP y espera la revisión LLM completa. Entrega los hallazgos como `additionalContext` antes del siguiente paso del agente. No ocupa una extensión LSP: puedes conservar el servidor de tipos habitual. No cubre ediciones por Bash u otras herramientas.

El hook es síncrono para asegurar entrega; el servidor LSP es asíncrono. El hook arranca/cierra un servidor por edición, por lo que no aprovecha debounce/caché entre llamadas del hook, pero su presupuesto se conserva en disco. El LSP persistente sí combina cambios rápidos y cancela versiones antiguas. Este plugin debe cargarse desde el checkout completo; no copies solo la subcarpeta a un marketplace.

### LSP estándar directo

```bash
node /ruta/a/lsp-smell/src/server.js --stdio
```

El cliente envía `initialize`, `didOpen`, `didChange` y `didClose`; recibe `publishDiagnostics` versionados. La configuración se carga de `<rootUri>/.lsp-smell.json`, `initializationOptions.config` o `LSP_SMELL_CONFIG`. Reinicia para cambiar configuración. No necesita puertos, no sustituye navegación ni typechecking.

Mientras una revisión está pendiente se retiran los diagnósticos antiguos. Un resultado vacío en ese instante NO significa «revisión limpia»: el adaptador usa `lsp-smell/status` (`pending`, `complete`, `failed`) y espera `complete`. Un fallo se muestra como `review-unavailable`, no como éxito. Los clientes estándar ven el diagnóstico informativo de error aunque no entiendan la notificación adicional.

### Compatibilidad comprobada y límites

- **Claude Code:** la [documentación oficial](https://code.claude.com/docs/en/plugins-reference#lsp-servers) limita una extensión al primer servidor registrado. El plugin LSP raíz no es una solución multi-LSP y en nuestras pruebas headless anteriores su entrega asíncrona no llegó al modelo. Preferimos el hook que no reemplaza el servidor existente.
- **OpenCode:** [configuración](https://opencode.ai/docs/lsp/) y [código revisado](https://github.com/anomalyco/opencode/blob/5a8335857b0ebec44ef6aa1d52b339cf25c329ca/packages/opencode/src/lsp/lsp.ts#L254) permiten servidores coincidentes y agregan diagnósticos. No hemos ejecutado una sesión coding real allí ni medido cómo espera revisiones LLM lentas.
- **Codex:** no hay integración nativa LSP confirmada ni adaptador Codex probado en este repo. No basta que [sus plugins](https://learn.chatgpt.com/docs/plugins) admitan MCP para afirmar LSP.

Ejemplo OpenCode para adaptar, conservando otros servidores:

```json
{"lsp":{"smell":{"command":["node","/ruta/a/lsp-smell/src/server.js","--stdio"],"extensions":[".ts",".tsx",".js",".jsx"]}}}
```

## Prompts semánticos reales

[`examples/semantic/.lsp-smell.json`](examples/semantic/.lsp-smell.json) contiene dos prompts libres: no inventar readiness con un delay y no marcar ready tras un fallo. La fixture usa una promesa sin esperar y un timer. La solución correcta depende del contrato, no de prohibir `.substr` ni encontrar un nombre específico.

Otros ejemplos sustentados en [incidentes documentados de nuestros repos](docs/real-world-smells.md):

- Un turno nuevo no debe heredar al propietario antiguo. El juez necesita el contrato de handoff, no solo ver `??=`.
- Eventos de tareas deben asociarse mediante identidad, no FIFO ni recencia, salvo garantía explícita del protocolo.
- Una ausencia tras una ventana temporal no prueba finalización ni fracaso. Diferenciar watchdog legítimo de resultado inventado exige contexto.
- Un consumidor que falla no puede dejar una proyección eternamente «activa». Revisar supervisión y cierre, sin exigir `await` indiscriminadamente.

Solo se envía el archivo revisado más contexto configurado; no se lee automáticamente todo el repo. Si el contrato vive en otro archivo, añádelo al contexto o trata el aviso como incierto. El LLM no ejecuta herramientas ni modifica código. El código y sus comentarios se presentan como datos, pero esto no elimina todo riesgo de prompt injection.

## Adaptadores y neutralidad

Incluidos:
1. `codex-cli`: Luna (`gpt-5.6-luna`) con esfuerzo `low`. "Light" corresponde a `low`, no es un valor literal válido. Autenticación existente, cwd temporal vacío, sandbox read-only y configuración aislada por invocación.
2. `claude-cli`: autenticación actual, modelo configurable, salida estructurada y límite CLI. No cambia auth ni configuración global.
3. `command`: ejecutable confiable que recibe un JSON por stdin y devuelve `{findings:[...]}` por stdout. Puede envolver un proveedor HTTP, un modelo local o un SDK sin acoplar el servidor a una marca.

[Contrato neutral completo](docs/adapter-protocol.md), esquema y requisitos de cancelación/coste. Se investigó AI SDK en fuentes primarias, pero no se instaló ni probó un adaptador AI SDK. No lo anunciamos como integración implementada.

## Latencia y control de trabajo

No prometemos milisegundos: cada revisión LLM tiene latencia real de proveedor y, con CLI, arranque adicional. En la primera validación, dos revisiones y una repetición diagnóstica alcanzaron el watchdog de 45 s; un probe simple de conectividad sí respondió. Esos intentos no se cuentan como éxito. La repetición con watchdog de 90 s devolvió hallazgos en 65,1 s. La demo final siguiente se guarda separada de los ejemplos AST históricos.

- Debounce configurable, 350 ms por defecto.
- Concurrencia por proceso: 2 en el ejemplo incluido (1 si se omite), máximo 4. Revisiones de documentos independientes pueden ejecutarse en paralelo. Los hooks arrancan procesos separados: no comparten semáforo, sí el ledger si usan la misma raíz.
- Los prompts del mismo documento se agrupan en una llamada. Readiness y propagación de errores comparten contrato: separarlos duplica contexto y puede generar avisos contradictorios. No hay fan-out por prompt ni aceleración medida atribuible a él. Cada llamada paralela reserva presupuesto compartido antes de arrancar.
- Una edición nueva cancela la revisión previa; nunca publica su resultado para la versión nueva.
- Timeout de 45 s por defecto, configurable hasta 120 s. Cancelación local no garantiza que el proveedor deje de facturar trabajo ya enviado.
- Documento completo hasta 32.000 caracteres por defecto, más un resumen del cambio acotado. Si excede el límite falla visiblemente; no manda medio archivo y lo declara limpio.
- Salida y número de hallazgos limitados; rangos/quotes verificados contra el documento, no confiados al modelo.
- Caché en memoria desactivada por defecto (`cacheEntries: 0`); si se activa, clave incluye URI, contenido, prompts, contexto y modelo. No persiste código en caché de disco.

## Luna light: validación acotada

Se verificó `gpt-5.6-luna` en el catálogo local de Codex CLI 0.153.4: admite `low`, `medium`, `high`, `xhigh`, `max`. Elegimos `low`, descrito como razonamiento ligero. La [documentación oficial de razonamiento](https://developers.openai.com/api/docs/guides/reasoning) distingue esfuerzo de razonamiento y modelo. No sustituimos Luna por Haiku.

La nueva autorización permitió exactamente 3 invocaciones, en un ledger separado explícito. El histórico Haiku permanece en 8/8. Las dos primeras revisiones independientes arrancaron en paralelo y terminaron dentro de 7,96 s de tiempo total, pero el parser rechazó eventos `item.error` no fatales junto al resultado. No se cuentan como diagnósticos válidos. Se corrigió el parser para distinguir esos avisos de operaciones con herramientas y de `turn.failed`.

La tercera llamada produjo un diagnóstico válido en **7,32 s**: faltaba esperar `initializeSession()` antes de `markReady()`, lo que viola el contrato de éxito/error. Rango comprobado contra el texto real. Son medidas de una prueba, no un benchmark ni garantía de latencia.

[Evidencia de los primeros intentos](evidence/luna-live.json) y [último intento válido](evidence/luna-final-attempt.json). Se usó el motor real con subprocess Codex y publicación de diagnostics; esta prueba no es una nueva sesión coding ni demuestra corrección automática con Luna. La sesión coding documentada abajo sigue siendo la de Haiku. No quedaba presupuesto para repetir el ciclo con Luna. Codex JSONL reporta tokens, no coste USD ni atestación del modelo backend: registramos modelo/esfuerzo solicitados, sin inventar coste o confirmación de servidor.

`node scripts/demo-luna.js` es opt-in y conserva el ledger `.demo/luna-light`. Tras estos intentos está agotado, no lo borres para repetir. Hace falta nueva autorización. `--last-only` solo selecciona una revisión, nunca reinicia el contador.

## Demo LLM real, incluida su imperfección

Sesión coding `15ace1e3-c71a-489a-a8fd-f9ebf12845df`, Claude Code 2.1.273. Sonnet 5 editó una fixture sembrada con inicialización sin `await` y retardo fijo; Haiku 4.5 recibió los dos prompts libres del ejemplo semántico. El hook entregó sus mensajes al agente: no se inyectó un diagnóstico escrito a mano ni se llamó al AST.

1. Primera revisión: dos hallazgos correctos, orden causal y propagación del error. El agente añadió `await`.
2. Segunda revisión: un aviso **falso positivo**. Exigió marcar ready «inmediatamente», aunque el contrato solo exigía hacerlo después de inicializar. El agente eliminó un delay ya inocuo. Conservamos el aviso y verificamos que la versión intermedia también pasaba el contrato.
3. Tercera revisión: cero hallazgos. Tests ejecutados sobre el código real comprobaron pending, éxito y rechazo. Tanto la versión intermedia como la final pasan.

Latencias del juez: **39,3 s / 56,0 s / 8,7 s**, sin caché. Coste de tarifa reportado por las tres llamadas: **0,096225 USD**; agente coding aparte: 0,0482048 USD. No son necesariamente cargos extra al plan. Son tres mediciones de una fixture, no benchmark ni garantía. La vía CLI es funcional pero **todavía no cumple una experiencia de feedback casi instantáneo**. Una API directa o modelo local detrás del adaptador requiere su propia medición y autorización; no afirmamos haberla probado.

[Evidencia de sesión y config exacta](evidence/llm-session.json), [feedback entregado](evidence/llm-delivery.log), [eventos LSP y presupuesto](evidence/llm-lsp-events.json), [tests del contrato y falso positivo](evidence/llm-contract-checks.json), [calibración y fallos previos](evidence/llm-calibration.json), [extracto para slide](evidence/llm-slide.txt).

```bash
# Consume cuota real. Usa una carpeta de demo confiable y nunca resetea su ledger.
CLAUDE=/ruta/a/claude scripts/demo-llm.sh
```

El ejemplo usa un watchdog de 90 s por la latencia observada de CLI. El script conserva configuración y presupuesto existentes. Si ya está agotado, necesita autorización nueva; no se elude creando otro ledger. `scripts/check-semantic.js` ejecuta solamente la fixture confiable, no debe aplicarse a código no confiable.

## Presupuesto: no se reinicia al reiniciar el hook

Antes de cada llamada se reserva `maxCallUsd` y una llamada en `.lsp-smell-budget.json`, con bloqueo exclusivo y escritura atómica. Cancelaciones y errores también consumen la reserva. El ledger persiste entre procesos; una nueva sesión no recibe automáticamente presupuesto nuevo. Caché no consume otra llamada.

`maxCalls` y `maxTotalReservedUsd` cortan nuevas admisiones. Por defecto 12 llamadas y 1,2 USD **reservados**, no una medición de gasto. Claude recibe además `--max-budget-usd`, cuyo control puede aplicarse entre turnos; no es garantía bancaria de coste máximo de una request ya en vuelo. Otros comandos deben implementar sus límites de proveedor. Los límites por tokens/facturación remota dependen del adaptador. Reiniciar, borrar el ledger o crear otra carpeta para eludir un límite no es un procedimiento de recuperación: requiere nueva autorización expresa del usuario.

Un ledger corrupto/bloqueado falla cerrado. No se borra automáticamente un lock tras un crash: verifica que no quede el proceso propietario antes de recuperarlo. Concurrencia entre varios procesos puede producir un fallo de lock visible, no una segunda llamada escondida.

## Prompt de instalación para tu agente

```text
Instala LSP Smell desde el repo privado https://github.com/double-thinker/lsp-smell
solo en este proyecto. Lee AGENTS.md y el README actual. No sobreescribas carpetas
ni configuración; revisa estado y haz git pull antes de cambiar un repo existente.
No cambies remotos, autenticación, configuración global ni visibilidad del repo.

LSP Smell llama a una IA con UNO O VARIOS PROMPTS LIBRES; no es un compilador AST.
Pídeme mis criterios semánticos y el contexto/contrato relevante. Configura prompts,
proveedor/modelo autorizado, debounce, timeout, concurrencia y presupuesto persistente.
No conectes una API facturable nueva ni cambies credenciales sin autorización.
Muestra que el código revisado será enviado al proveedor configurado.

Detecta el cliente y su versión. En Claude usa --plugin-dir con integrations/claude-hooks
sin sustituir su LSP de tipos ni otros hooks. En OpenCode verifica soporte de la versión,
agrega lsp.smell conservando claves existentes y respeta JSONC si aplica. En otros
clientes usa LSP stdio solo si es compatible; no inventes flags o soporte Codex.

Ejecuta npm ci y npm test (offline). Luego, con presupuesto autorizado, haz una prueba
LLM REAL y una sesión coding: cambio -> diagnóstico recibido -> corrección -> revisión
y test del contrato. Registra latencia, modelo y coste reportado, sin secretos.
No confundas resultado pendiente/vacío con verificación limpia, ni uses mocks como demo.
Si el presupuesto se agota, para y pide autorización; no resetees contadores.
Devuelve configuración/launcher, comandos de uso y desinstalación, evidencia y límites.
```

## Tests y evidencia histórica

`npm test` comprueba debounce, versiones obsoletas, cancelación, concurrencia, timeout, caché, presupuesto durable, esquema/rangos, transporte neutral, LSP real por stdio y hook. No llama a modelos. Las pruebas con IA son opt-in y consumen cuota.

La carpeta `evidence/` conserva los experimentos 0.1 (`real-session.json`, `lifecycle-session.json`): fueron AST determinista y **no son evidencia del producto LLM 0.2**. Las reglas antiguas pueden usarse explícitamente con `mode: ast`, pero no reemplazan los prompts libres del modo por defecto. El catálogo antiguo mantiene valor como fuente de incidentes; sus detectores AST son auxiliares.
