# Cinco hallazgos que dejó la auditoría del censo de envíos

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

## 2. El «veintitrés» de ADR-035 subcuenta igual que el 240 que se corrigió

> **CERRADO el 2026-09-18**, y al cerrarlo apareció algo peor que el número:
> aislar el bus de análisis **pierde la exención de sistema entera**. Ver el
> final de este punto. El número quedó corregido en ADR-035 choque 2, en el
> docblock de `maximoDeParametros` y en la fila de INV-004 de
> `safety-invariants.md`.

**MEDIDO.** El choque 2 de ADR-035 dice que seleccionar el bus de análisis
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

### Lo que apareció al corregirlo, y es una decisión pendiente

**MEDIDO llamando a las funciones del motor**, con el bus de análisis en 2:

| Ruta | Clase |
|---|---|
| `i.3.aux.2.value` | `ANALYSIS_BUS_SEND` |
| `l.0.aux.2.value` | `LINE_INPUT` |
| `p.0.aux.2.value` | `PLAYER_SEND` |
| `f.0.aux.2.value` | `FX` |

`PARAMETROS_DE_OPERACION_DE_SISTEMA.ANALYSIS_BUS_SELECT` admite **una sola
clase**, `ANALYSIS_BUS_SEND`, y `correspondeExencionDeSistema` exige que
**todas** las clases de la transacción estén permitidas. Resultado medido: con
las clases de los 24 canales devuelve `true`; agregándole una de línea, una del
reproductor y una de efectos, **`false`**.

**O sea que la transacción que hace lo correcto —callar los 31— pierde la
exención y vuelve a caer bajo el límite de cuatro de INV-005, que la rechaza
entera.** La que pasa es la que calla sólo 23 y deja ocho fuentes sonando en el
bus de medición, que es justo lo que el anexo A-06 advertía.

**Hoy no muerde**, porque ningún camino de la aplicación propone todavía estos
cambios. **Qué clases debe admitir `ANALYSIS_BUS_SELECT` es decisión del
usuario**, no de oficio: ensancha la superficie escribible hacia el reproductor,
las entradas de línea y los retornos.

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

## Lo que estos cinco tienen en común

Cuatro de los cinco son **la misma forma de error**: un conteo hecho sobre una
familia de claves y escrito como si fuera el censo entero. El 240 que se corrigió
ese día, el veintitrés del ADR, el 19 de la matriz, y los caminos `.mtx.` que
nadie contó. La regla que dejan, que es la de leer el volcado entero dicha de
otro modo: **antes de escribir un número de claves, contar todas las familias que
pueden tenerlas, no la que se está mirando.**
