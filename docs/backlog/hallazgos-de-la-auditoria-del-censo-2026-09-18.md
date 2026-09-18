# Nueve hallazgos que dejó la auditoría del censo de envíos

**2026-09-18.** Salieron de auditar `9d1063f` —el commit que corrigió «240
envíos» por «320»— y ninguno cabía en esa tarea. Se anotan acá en vez de meterse
en el commit que los encontró, que es la regla del proyecto.

**Todos se leyeron del volcado del estado real, tomado el 2026-09-18 al revisar
el prompt para retomar.** El volcado no se commitea: trae los valores enteros y
el identificador de la unidad. Los conteos se reproducen pidiendo el estado y
contando con `grep`, y cada hallazgo dice con qué.

---

## 1. Hay 170 caminos a los buses que no publican `post`, y ADR-035 iba a leer `post`

**MEDIDO.** Además de los 320 envíos `.aux.`, el aparato publica **170 claves
`.mtx.`**: `a.N.mtx.M` (100, diez auxiliares por diez destinos), `s.N.mtx.M`
(60, seis subgrupos) y `m.mtx.M` (10, el general). Cada una trae `value`,
`postproc`, `pan` y `mute`.

**Ninguna trae `post`:** `grep -cE '\.mtx\.[0-9]+\.post\^'` da **0**, contra 320
para `.aux.`.

**Por qué importa para la pieza que sigue.** [ADR-035](../adr/ADR-035-el-tope-es-por-parlante-no-por-clave.md)
decide que el tope se cuente por **destino audible**, y deja sin definir cómo se
calcula ese destino, diciendo que «hay que leer `post` y `postproc`». Para estos
170 caminos **no hay `post` que leer**. Cualquier implementación que asuma que
todo camino publica las dos claves se cae, o peor, clasifica por omisión.

**Lo que NO está medido, y hay que decirlo con todas las letras.** Si estos
caminos terminan **en el mismo parlante** que un auxiliar es **INFERIDO y
dudoso**. El argumento tentador es que los destinos son `0..9`, el mismo rango
que los diez auxiliares, y que los diez `a.N.matrix` valen 0. No alcanza:
**nadie midió qué significa `a.N.matrix`**. En esta consola un auxiliar se puede
conmutar a matriz, así que el cero puede significar «este auxiliar no es
matriz», y entonces los destinos `mtx` son otros buses y no las cuñas.
`que-entra-al-general.ts:139` clasifica el sufijo `matrix` como `CAMINO` y no le
adjudica semántica.

Hoy los 170 están en `value = 0` y `mute = 0`, así que **no suenan y nada urge**.

**Qué haría falta para cerrarlo:** medir qué significa `a.N.matrix` y a dónde
sale un `mtx`, que es una medición con audio y no una lectura del volcado.

## 2. El «veintitrés» de ADR-035 subcontaba igual que el 240 que se corrigió

> **CERRADO el 2026-09-18**, en dos pases. El primero corrigió el número y
> escribió una explicación **falsa** de lo que pasaba; una auditoría adversarial
> la derribó y el segundo la reescribió. Lo que quedó: **el bus de análisis no se
> puede aislar por ningún camino**, que es peor que el choque de reglas que se
> había descrito. Ver el final de este punto. El número está corregido en ADR-035
> choque 2, en el docblock de `maximoDeParametros`, en el comentario de
> `PACING_MS` y en las filas de INV-004 e INV-005.

**MEDIDO.** El choque 2 de ADR-035 **decía** que seleccionar el bus de análisis
escribe «**veintitrés** envíos al mismo destino» y que hay que dejarlo exento.

Al bus auxiliar 1 le entran **32** envíos `.aux.`
(`grep -cE '\.aux\.0\.value\^'` = 32: 24 canales + 2 línea + 2 reproductor + 4
retornos), o sea **31 otros**, más **17** caminos `.mtx.`.

El veintitrés cuenta sólo los canales de entrada: **es el mismo error que
`9d1063f` vino a corregir, dejado en pie tres secciones más abajo del mismo
archivo**.

**Y no era información nueva.** El anexo A-06 de la auditoría técnica ya decía,
en su línea de impacto, «los sends de FX/player/line también alimentan el AUX».
El 23 se propagó desde ahí hasta el ADR y hasta el docblock de
`maximoDeParametros` **sin la salvedad que venía al lado**.

### 31 son rutas, no escrituras

Un envío en `value = 0` **ya está en menos infinito**, así que no hay que
callarlo. Medido en el volcado del 2026-09-18:

| bus | envíos con nivel ≠ 0 |
|---|---|
| 0 | 9 |
| 1 | 11 |
| 2 | 3 |
| 3 a 9 | **0** |

Cuántas escrituras hace falta **depende del estado y hay que leerlo**. Una
redacción anterior eligió el bus 2 para medir y no miró los valores de ese mismo
bus.

### Lo que apareció al corregirlo: el bus de análisis no se puede aislar

**MEDIDO, y son dos frenos encadenados.**

**Primero: `ANALYSIS_BUS_SEND` es inalcanzable dentro del motor.**
`clasificarRuta` sólo devuelve esa clase si se le pasa `busDeAnalisis`, y
**`engine.ts` la llama sin opciones** —líneas 136, 160 y 296—. Medido:

| Ruta | Con `busDeAnalisis` | **Como la ve el motor** |
|---|---|---|
| `i.3.aux.2.value` | `ANALYSIS_BUS_SEND` | **`MONITOR_AUX_SEND`** |
| `l.0.aux.2.value` | `LINE_INPUT` | `LINE_INPUT` |
| `p.0.aux.2.value` | `PLAYER_SEND` | `PLAYER_SEND` |
| `f.0.aux.2.value` | `FX` | `FX` |

Y por lo mismo, `correspondeExencionDeSistema('ANALYSIS_BUS_SELECT', …)` con
**sólo los 24 de canal**: `true` con `busDeAnalisis`, **`false` como lo ve el
motor**. La exención se pierde **con los ocho envíos que no son de canal y sin
ellos**. Un cambio declarado `ANALYSIS_BUS_SEND` muere antes, por
`RUTA_INCONSISTENTE`.

**Segundo, y sobrevive a cualquier arreglo del primero: `ANALYSIS_BUS_SEND` no
tiene entrada en `LIMITES`.** INV-004 la rechaza por no tener tope declarado.
`packages/safety/test/runner.test.ts` ya lo decía: «ninguna transacción de
sistema puede pasar el motor todavía».

> **Lo que se escribió mal en el primer pase, y lo cazó una auditoría
> adversarial.** Se dijo que la exención se perdía **por** los ocho envíos que no
> son de canal, y que «la que pasa es la que calla sólo 23». Lo primero es cierto
> de las dos funciones **aisladas** y falso **dentro del motor**; lo segundo es
> falso a secas: **no pasa ninguna**. El error de método es el de siempre acá:
> se midieron las piezas y se concluyó sobre el sistema.

### La decisión pendiente, que tampoco era la que se escribió

Se había escrito que ensanchar `PARAMETROS_DE_OPERACION_DE_SISTEMA` «ensancha la
superficie escribible», y **es falso**. Esa tabla se usa en **dos** sitios,
`maximoDeParametros` y el pacing, y **quién puede escribir lo decide
`OWNERSHIP`**. Medido: `esEscribible` da lo mismo antes y después —`LINE_INPUT` y
`FX` siguen en `false`—.

**La decisión real es otra y es más grande:** aislar el bus de verdad exige que
las **entradas de línea y los retornos de efecto pasen a ser escribibles**, y hoy
son `USER_ONLY`. Eso vive en `OWNERSHIP` y es **del usuario**, no de oficio.

## 6. `ANALYSIS_BUS_SEND` es inalcanzable: ninguna clave del aparato lo produce

> **Este título decía «y es el único routing que INV-008 admite», y es FALSO.**
> Medido: los routings escribibles son **tres** —`ANALYSIS_BUS_SEND`,
> `PLAYER_SEND` y `MONITOR_AUX_SEND`—, y el tercero lo abrió **ADR-028**, que
> este mismo día se citó cinco veces. La frase salió de la `nota` vieja de
> `ownership.ts` —«único routing que la aplicación escribe»— repetida como
> **MEDIDO** sin cruzarla contra `ownership.test.ts`, que declara los tres. Es
> exactamente el error de método que estos hallazgos denuncian, cometido al
> escribirlos.

**MEDIDO, y lo que sí es único:** de todas las clases de `OWNERSHIP`,
`ANALYSIS_BUS_SEND` es **la única que ninguna de las 6665 claves del aparato
produce**. Está declarada `SYSTEM` y `escribible: true`, y **ningún camino puede
producirla**, porque `engine.ts` llama a
`clasificarRuta(c.path)` sin `busDeAnalisis` en sus tres usos. Un solo cambio
bien formado sobre `i.0.aux.2.value` declarado `ANALYSIS_BUS_SEND` se rechaza por
`RUTA_INCONSISTENTE`.

No es una guarda que falla cerrada por diseño: es un dato que nadie pasa. El
docblock de `clasificar-ruta.ts` ya avisaba que «nadie en producción pasa este
dato», y lo enmarcaba como un riesgo para el envío de monitor; **la otra mitad de
la consecuencia —que la clase queda inalcanzable— no estaba dicha**.

## 7. Cuatro de cada cinco claves de envío del reproductor no se clasifican

**MEDIDO.** Es de los **envíos** del reproductor, no de sus claves en general:
de las 228 del reproductor hay 200 sin clasificar, que es otra cuenta y está en
el hallazgo 9. `clasificar-ruta.ts` sólo tiene el patrón
`/^p\.\d+\.aux\.\d+\.value$/`. Las otras cuatro subclaves —`mute`, `pan`,
`post`, `postproc`— dan **`null`**, o sea `RUTA_DESCONOCIDA`: son **80 claves del
volcado**. Para los canales, en cambio, las cinco están cubiertas.

**Importa por el anexo A-06**, que nombra **dos** mecanismos para aislar el bus:
«poner a −∞ **o mute**». Si se implementa por mute, el reproductor no se puede ni
nombrar. Falla cerrado, que es el lado bueno, pero no por decisión sino por
omisión del patrón.

## 3. El general tiene el ecualizador y el compresor enlazados

**MEDIDO.** `m.eq.linked = 1` y `m.dyn.linked = 1`. Los diez auxiliares tienen
`a.N.eq.linked = 0` y ninguno tiene `link2master`.

**Es el patrón de ADR-035 §2 —una orden, varias claves— y el ADR no lo
menciona.** Habla del enlace estéreo de los canales, que se lee de
`stereoIndex`, y esto se lee de otra clave. Una orden sobre el ecualizador o el
compresor del general toca los dos lados, así que el tope por clave vuelve a
quedar corto por el mismo motivo.

## 4. Dos disparadores del supresor del general están latcheados en 1

**MEDIDO.** `m.afs.clearfixed = 1` y `m.afs.clearlive = 1`. Son **los únicos dos
disparadores en 1 de todo el volcado**: `m.afs.clearall` está en 0 y los treinta
de los diez auxiliares también.

El supresor del general está **encendido**. Si el firmware los lee como pulso
pendiente, conviene saber qué pasa antes de la próxima corrida con tonos
sostenidos. **No se probó**, porque probarlo es escribir a la consola.

## 5. La matriz dice 19 fuentes y el aparato muestra 17

**MEDIDO contra el volcado, y choca con una medición de 2026-09-10.**
[`capability-matrix.md`](../capability-matrix.md) línea 113 afirma: «Tienen envío
a la matriz **19 fuentes**: los 10 auxiliares, los 6 subgrupos, el general y
**solo dos canales, `i.9` e `i.19`**», con evidencia en
`spikes/SPK-P0.2a/evidence/capacidades-que-faltan-2026-09-10b.txt`.

En el volcado del 2026-09-18 hay **17 fuentes** —los 10 auxiliares, los 6
subgrupos y el general— y **ni `i.9` ni `i.19` publican una sola clave `.mtx.`**
(`grep -cE '^SETD\^i\.(9|19)\.mtx\.'` = 0).

Una de las dos es vieja o falsa. Las posibilidades, sin elegir ninguna: que el
firmware cambiara entre el 2026-09-10 y hoy, que aquella medición contara mal, o
que los dos canales aparezcan sólo bajo una configuración que hoy no está puesta.
**Hasta resolverlo, la fila de la matriz no se puede citar como cierta.**

---

## 8. La exención de sistema anula el máximo también en OBSERVE y SUGGEST

**MEDIDO** llamando a `maximoDeParametros`:

| Nivel | Máximo declarado | Con operación de sistema |
|---|---|---|
| OBSERVE | **0** | **Infinito** |
| SUGGEST | **0** | **Infinito** |
| ASSISTED | 4 | Infinito |
| AUTO | 1 | Infinito |

En los dos niveles donde la aplicación **no debe escribir nada**, una transacción
de sistema queda sin cota de parámetros. **Hoy no muerde** porque ninguna clase de
operación de sistema tiene entrada en `LIMITES` y todas caen antes por falta de
tope declarado. Muerde **el día que se declare el primer tope**, que es
justamente lo que hay que hacer para desbloquear el hallazgo 2.

Misma forma que el 6 y el 7: una pieza que nadie conectó, que ningún test caza
porque no hay nada roto que probar.

## 9. Una de cada cinco claves del aparato no se clasifica, y la mayor no es la del reproductor

**MEDIDO** pasando las 6665 claves del volcado por `clasificarRuta` sin opciones,
que es como la llama el motor: **1324 dan `null`**, o sea `RUTA_DESCONOCIDA`.

| Familia | Clasificadas | Sin clasificar |
|---|---|---|
| `i` (canales) | 2712 | **540** |
| `a` (auxiliares) | 1050 | **280** |
| `p` (reproductor) | 28 | **200** |
| `l`, `s`, `f`, `v` | 246 / 612 / 452 / 36 | **0** |

**La asimetría con más forma de defecto: `a.N.dyn.*` y `a.N.gate.*`, 190 claves,
todas sin clasificar** —el compresor y la puerta de cada auxiliar—, mientras los
canales, las líneas, los subgrupos y los efectos sí clasifican los suyos, y
`m.dyn.*` clasifica como `OUTPUT_LIMITER`. INV-008 nombra explícitamente el
limitador de esos buses como de sólo lectura: hoy se rechaza **citando que la
ruta no se conoce**, cuando sí se conoce.

**Falla cerrado, que es el lado bueno.** Pero el motivo del rechazo es falso, y
un rechazo que miente sobre su causa es el que nadie investiga. El hallazgo 7 es
un caso particular de éste.

## Lo que tienen en común

Empezaron siendo cinco. El 6 y el 7 los encontró la auditoría de cerrar el
segundo; el 8 y el 9, la auditoría de esa corrección. **Cada ronda de auditoría
encontró más que la anterior**, y las dos últimas encontraron afirmaciones falsas
en los documentos que las anteriores habían escrito.

Cuatro de los nueve son **la misma forma de error**: un conteo hecho sobre una
familia de claves y escrito como si fuera el censo entero. El 240 que se corrigió
ese día, el veintitrés del ADR, el 19 de la matriz, y los caminos `.mtx.` que
nadie contó. La regla que dejan, que es la de leer el volcado entero dicha de
otro modo: **antes de escribir un número de claves, contar todas las familias que
pueden tenerlas, no la que se está mirando.**

Y el 6, el 7, el 8 y el 9 tienen **otra** forma en común, que es la que más caro
salió este día: **una pieza correcta que nadie conecta**.
`ANALYSIS_BUS_SEND` está declarado, tiene dueño y es escribible, y ningún camino
lo produce. Los cuatro patrones del reproductor faltan y nada se queja. Ninguno
de los dos lo caza un test, porque **no hay nada roto que probar: hay algo que no
existe**. Es la misma lección del arreglo que no arreglaba nada, del mismo día:
**mutar prueba que los tests cazan lo que hay; sólo atacar prueba que lo que hay
alcanza.**
