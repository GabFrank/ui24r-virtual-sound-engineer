# ADR-035 — El tope se cuenta por parlante, no por clave

**Fecha:** 2026-09-18
**Estado:** **decidida, sin implementar.** Lo que hay hoy está medido y descrito
abajo; el núcleo —contar por destino audible— no existe en ninguna parte
(`grep destinoAudible` da cero). Lo que **sí** existe y esta decisión reusa está
en «Lo que ya está construido».
**Origen:** **Decisión del usuario**, eligiendo entre opciones el 2026-09-18,
sobre el defecto que [`2026-09-17b-donde-quedamos.md`](../pedidos/2026-09-17b-donde-quedamos.md)
ya había unificado en una frase: *«el tope se cuenta por clave y el oído es por
parlante»*.

## El problema, en una frase

**El freno cuenta por clave y el oído es por parlante.** El estado por ruta que el
motor consulta —el acumulado por sesión, el techo por ruta, las rutas ya tocadas
y, desde el 2026-09-18, la escucha comprobada— se indexa por **la cadena de la
ruta**. El músico no oye rutas: oye una cuña, y a esa cuña llegan varias.

**La frase no es de esta decisión.** La escribió la auditoría de la ruta repetida
el 2026-09-17, que encontró tres de los cuatro lados **juntos** y los unificó ahí
mismo: *«Las tres tienen la misma forma, y conviene leerlas juntas»*. Una primera
redacción de este ADR se atribuyó esa síntesis diciendo que el defecto había
aparecido «en cuatro auditorías, como si fueran cuatro hallazgos», y lo corrigió
una auditoría de fidelidad el 2026-09-18. Lo que esta decisión agrega es **qué se
hace**, y un cuarto lado que apareció después.

**Y hay un matiz sobre el mecanismo que conviene tener claro.** El tope **por
paso** no se indexa por ruta: es `delta > lim.porTransaccion`, sin mirar estado.
Que cuatro alias sumen 12 dB no es porque ese tope esté mal indexado, sino porque
**no hay ninguna agregación entre los cambios de una transacción**. Los que se
indexan por la cadena son el acumulado, las rutas tocadas, la escucha y el techo
por ruta —este último de **INV-010, no de INV-004**, distinción que una auditoría
anterior obligó a hacer y que la primera redacción de este ADR volvió a borrar—.

## Los cuatro lados, medidos

Las cifras se volvieron a medir con el motor real el 2026-09-18, antes de
escribir esta decisión, y **dos de las que venían de los documentos anteriores
resultaron falsas**. Están corregidas acá y donde vivían.

### 1. El mismo nombre escrito distinto

`clasificarRuta` devuelve `PREAMP_GAIN` para `hw.0.gain`, `hw.00.gain`,
`hw.000.gain` y `hw.0000.gain`, y ninguno está en `RAW_MAP`. El estado por ruta
usa la cadena cruda, así que son **cuatro presupuestos**.

**Medido: los cuatro de 3 dB pasan en una sola transacción — 12 dB con el tope
por transacción en 3.**

**En ráfaga son 24 dB, y no 36 como decía el repositorio desde el 2026-09-17b.**
La cuenta es aritmética: el acumulado son 6 dB por ruta, `PREAMP_GAIN` no declara
`techoAbsoluto` —así que el presupuesto siempre rige—, y cuatro rutas por 6 dB son
24. **Medido: dos transacciones y la tercera cae con `ACUMULADO_EXCEDIDO`.** El 36
corresponde a **seis** alias, y seis no entran: INV-005 acota a cuatro parámetros
por transacción en `ASSISTED`, así que se rechazan con `DEMASIADOS_PARAMETROS`.
El mismo 36 aparece en el documento del 2026-09-17b atribuido a **tres** alias,
que dan 18. La cifra viajó por tres conteos distintos sin volver a medirse.

**Y el número honesto no es 24: es que no hay número.** El patrón del alias es
`/^hw\.\d+\.gain$/`, sin cota, así que la familia es infinita y partiendo en
tandas de cuatro no hay techo. Citar «36» sugería un límite que no existe.

**Es la ganancia del previo**, el único parámetro que la aplicación mueve hoy de
punta a punta. **Lo que lo tapa no es una guarda sino un accidente**: el alias no
tiene valor confirmado y el ejecutor lo rechaza por INV-002.

**El envío a monitor ya está cerrado** por `esNivelDeEnvioAMonitor`, que exige la
forma canónica. Comprobado ejecutando: `i.03.aux.1.value` e `i.3.aux.01.value` se
rechazan con `PARAMETRO_NO_ESCRIBIBLE`, y `i.3.aux.1.value` pasa.

**Lo que NO está medido, y hay que decirlo:** que la **consola** trate los cuatro
alias como la misma perilla. Lo que está medido es que **el motor** los clasifica
igual y les da presupuestos separados. La consola publica `hw.0.gain`; nadie le
escribió `hw.00.gain` para ver si obedece, y no se puede medir sin abrir el camino
que INV-002 cierra. Una primera redacción afirmó «son la misma perilla» en
indicativo; lo correcto es que **el motor los trata como distintos y eso ya es el
defecto**, obedezca la consola o no.

### 2. El enlace estéreo: una orden, varias claves

Cuando dos canales están enlazados en estéreo, mover el envío de uno mueve el del
otro; si además el auxiliar está enlazado, son hasta cuatro claves.

**Y no es hipotético: está activo en la consola del usuario.** De las 38 claves
`stereoIndex`, **34 valen −1 y cuatro no**: `l.0 = 0`, `l.1 = 1`, `p.0 = 0`,
`p.1 = 1`. Son **dos pares estéreo reales ahora mismo** —las entradas de línea y
el reproductor—, que es justo lo que `protocol-spec.md` §4.5.1 ya decía desde el
2026-09-09. Una primera redacción de este ADR dijo «las 38 en −1, o sea nada
enlazado»: se miró el principio del volcado, que son los 24 canales de entrada, y
se generalizó al resto. Es la misma forma de error que este repositorio corrige
con los proyectos ajenos, cometida sobre el propio aparato.

### 3. Familias distintas sobre el mismo parlante

`i.3.mix` (fader), `i.3.eq.b1.gain` (una banda del ecualizador) e
`i.3.aux.1.value` (el envío a la cuña) son tres rutas con tres topes, y **pasan
juntas**: verificado con el motor, `PERMITIDO`, 3 + 4 + 2 = 9 dB, que son
exactamente sus tres `porTransaccion`.

**Pero en esta consola, hoy, el fader no llega a la cuña.** Medido en el volcado:
los **320** envíos a auxiliar tienen `post = 0` —antes del fader— y
`postproc = 1`. **Una primera redacción contó 240 y se quedó corta**: ésos son
los de los canales de entrada, los que ADR-028 abrió. Los otros **80** son las
entradas de línea (20), el reproductor (20) y los retornos de efecto (40), y
están igual. Dejaba afuera justo los del reproductor, cuya excepción INV-010
**enuncia y no tiene implementada** --hoy se rechazan por `SIN_LIMITE_DECLARADO`,
porque `PLAYER_SEND` no figura en `LIMITES`--, y las entradas de línea, que son dos de los cuatro
`stereoIndex` activos del §2 de este mismo ADR. Para esa combinación la tabla del
ítem 95 dice que el ecualizador
mueve el auxiliar (+24 dB de recorrido) y **el fader no lo mueve**. Así que el
movimiento real en la cuña es **6 dB** —ecualizador más envío—, no 9.

Una primera redacción citó el ítem 95 como si hubiera establecido que el envío es
post-fader. Midió lo contrario de lo que el aparato tiene puesto: el `post = 1` se
puso a mano durante aquella corrida y se restauró. **Que sean 6 y no 9 no cambia
la decisión** —el defecto es que nadie suma los caminos— pero sí cambia qué se
puede afirmar, y **hace que el modelo del destino audible tenga que leer `post` y
`postproc` del estado confirmado** en vez de suponerlos.

### 4. La escucha también se cuenta por clave

Apareció el 2026-09-18 al cerrar la comprobación de la escucha entre pasos.
`escuchaComprobada` no cruza `Measurement.channelId` contra la ruta, así que una
medición del canal 5 autoriza el paso siguiente sobre la cuña del canal 3, y una
misma medición autoriza a la vez todas las rutas que la citen.

## Lo que el usuario decidió

Tres preguntas, tres elecciones entre opciones, el 2026-09-18.

### 1. La unidad de cuenta es el destino audible

El estado por ruta —acumulado, rutas tocadas, escucha comprobada, y el techo por
ruta de INV-010— pasa a contarse sobre **a dónde llega el cambio**, no sobre cómo
se llama la clave.

Descartadas: «la misma perilla» —cerrar el alias y el enlace, dejando los otros
dos lados— y «la misma clave escrita de una sola forma» —cerrar sólo el alias—.
Las dos eran bastante más baratas y las dos volvían a partir en pedazos un
problema que costó descubrir que era uno.

### 2. Dos caminos al mismo parlante en una transacción se rechazan

No se suman: se rechaza la transacción, **igual que `RUTA_REPETIDA`**. La razón es
la misma y es de producto: adentro de una transacción no hay dónde escuchar, y si
el ecualizador y el envío se mueven juntos el músico oye el resultado y no sabe
cuál de los dos fue.

Descartadas: sumarlas y comparar contra el tope —más cómodo, pero una tanda que
cabe en el tope igual mueve varias cosas sin que nadie escuche cuál hizo qué— y
rechazar sólo si la suma se pasa —difícil de explicar y de auditar: el mismo
pedido a veces pasa y a veces no según cuánto se movió antes—.

**La autoría del argumento, dicha bien.** `RUTA_REPETIDA` se rechazó en vez de
acumular por razonamiento del agente, escrito en su commit; lo que el usuario
eligió aquel día fue **cuál de los cuatro hallazgos arreglar**, no cómo. Acá sí
eligió el cómo, entre tres opciones. Una primera redacción dijo que «ya lo había
descartado el día anterior», que invierte la autoría — el error que la skill del
proyecto marca como reincidente.

### 3. El destino audible tiene dos coordenadas: qué parlante y qué parte del espectro

**Cuatro bandas del ecualizador de un canal no son cuatro caminos al mismo
parlante, salvo que pisen la misma zona del espectro.** Dos bandas en 100 Hz y en
5 kHz son partes distintas del sonido y se pueden mover juntas; dos sobre el mismo
punto se suman, y **ésos son los 16 dB** —medido: cuatro bandas de +4 dB pasan
juntas, con el tope por banda en 4—.

Descartadas: tratar las cuatro bandas como cuatro caminos —lo más simple de
auditar, pero convierte ecualizar un canal en cuatro transacciones con diez
segundos de escucha entre cada una, unos cuarenta segundos por canal con la banda
esperando, cuando hoy se hace de una vez mirando el espectro— y hacer lo mismo
bajando la escucha mínima del ecualizador, que es cambiar una protección por otra
sin decirlo.

**Es lo físicamente correcto y lo más caro:** hay que decidir cuándo dos bandas se
pisan, y eso necesita la frecuencia y el Q de cada una.

## Lo que ya está construido, y esta decisión reusa

**La mitad que depende del estado de la consola ya existe en este repositorio, y
una primera redacción se la atribuyó a un tercero.**

- **`packages/mixer-adapter/src/pares-estereo.ts`** lee `stereoIndex`, deriva la
  semántica del `mixer.html` del aparato —0 es el primero del par, 1 el segundo,
  −1 sin enlazar—, expone `companeroDe()` y `paresEstereo()`, tiene test propio y
  está expuesto en el adaptador. **Medido el 2026-09-09**, con su fila en
  `capability-matrix.md` y su sección en `protocol-spec.md` §4.5.1, incluida la
  advertencia de que **escribir es destructivo** y la aplicación sólo lee.
- **`packages/mixer-adapter/src/que-entra-al-general.ts`** ya es un modelo de qué
  fuentes llegan a **un** destino audible, con faders y silencios del estado
  confirmado. Es el molde del que falta.

Lo que falta es el modelo de **qué llega a cada cuña**, y la agregación en el
motor.

## Lo que esta decisión NO resuelve

- **No dice cómo se calcula el destino audible.** Necesita qué canal manda a qué
  auxiliar y con cuánto, y **leer `post` y `postproc`** para saber si el fader y
  el proceso llegan. Es estado de la consola que hay que mantener.
- **No dice cuánto pesa cada camino.** Que el ecualizador esté antes del envío no
  hace que +4 dB de ecualizador sean +4 dB en la cuña. Sumar decibeles de familias
  distintas como si fueran el mismo decibel es una aproximación, y hay que
  escribir cuál.
- **No dice cuándo dos bandas del ecualizador se pisan.** Es la decisión 3 y le
  falta el criterio: cuántas octavas de solapamiento cuentan como el mismo punto.
- **No define la granularidad del parlante.** ¿Es el auxiliar 1, o la cuña física
  que suma el auxiliar 1 más lo que le llega del general? La respuesta decide los
  tres choques de abajo.
- **No está medido que la consola trate los alias como la misma clave**, sólo que
  el motor los trata como distintas.
- **No arregla la ganancia del previo del todo**, porque su ley no está medida y
  sin ley no hay decibeles que sumar. Es una tarea aparte, ya anotada.

### Tres choques con reglas que ya existen, y hay que resolverlos al implementar

Los encontró la auditoría de fidelidad del 2026-09-18, y ninguno estaba dicho.

1. **Con INV-005.** El límite de cuatro parámetros por transacción existe para
   permitir mover varias cosas juntas. La decisión 3 salva el caso del
   ecualizador, pero cualquier otro grupo al mismo destino sigue chocando.
2. **Con las transacciones de sistema.** Seleccionar un canal en el bus de
   análisis pone a menos infinito los otros envíos al mismo bus: muchos caminos
   al mismo destino en una transacción. **Tiene que quedar exenta**, como ya lo
   está del límite de parámetros —`correspondeExencionDeSistema` es el sitio—, y
   eso hay que escribirlo, no suponerlo.

   **Este punto decía «veintitrés» y subcontaba igual que el 240 que este mismo
   ADR corrigió tres secciones más arriba.** A un bus auxiliar le entran **32**
   envíos `.aux.` —24 canales, 2 de línea, 2 del reproductor, 4 de retornos de
   efecto—, así que elegir uno deja **31** a callar, no 23. El veintitrés contaba
   sólo los canales. **Y no era información nueva:** el anexo A-06 de la
   auditoría técnica ya decía «los sends de FX/player/line también alimentan el
   AUX», y el número se propagó sin esa salvedad hasta acá y hasta el docblock de
   `maximoDeParametros`.

   **Y al remedirlo apareció algo peor que el número, que es una decisión
   pendiente y no una errata.** La exención se concede por clase de parámetro, y
   `ANALYSIS_BUS_SELECT` sólo admite `ANALYSIS_BUS_SEND`. Pero `clasificarRuta`
   devuelve `ANALYSIS_BUS_SEND` **únicamente** para `i.N.aux.<bus>.value`: los
   ocho envíos restantes dan `LINE_INPUT`, `PLAYER_SEND` y `FX`. Como
   `correspondeExencionDeSistema` exige que **todas** las clases estén
   permitidas, la transacción que hace lo correcto —callar los 31— **pierde la
   exención entera** y vuelve a caer bajo el límite de cuatro de INV-005, o sea
   que se rechaza. Medido llamando a las dos funciones: con las clases de los 24
   canales devuelve `true`; agregándole una de línea, una del reproductor y una
   de efectos, `false`.

   Los 17 caminos `.mtx.` hacia el mismo número de destino quedan **fuera de esta
   cuenta a propósito**: clasifican como `MATRIX_SEND` y **no está medido** que
   lleguen al mismo parlante. Ver
   [los hallazgos del censo](../backlog/hallazgos-de-la-auditoria-del-censo-2026-09-18.md).
3. **Con [ADR-031](ADR-031-la-mezcla-de-conjunto-entra.md).** Equilibrar faders de
   varios canales es, por definición, varios caminos al mismo destino si el
   destino incluye el general. Depende enteramente de la granularidad de arriba.

## Trabajo previo

**Lo que aporta `fmalcher/soundcraft-ui`** (commit `2fc297f`, verificado) **no es
el dato sino el uso.** Su `AuxChannel` arma `allChannelIds` con hasta cuatro
identificadores —él mismo, el vecino en el bus, el mismo canal en el auxiliar
enlazado y el vecino en el enlazado— y `setFaderLevelRaw` escribe sobre **todos**.
O sea: agrupa las claves que una sola orden lógica toca, derivándolo de
`stereoIndex`. Ver `aux-channel.ts` y `channel.ts` (`linkedChannelIds`).

El dato en sí este repositorio ya lo tenía medido nueve días antes, arriba.

**Lo que ninguno de los cuatro tiene es un presupuesto de cuánto se puede mover
algo**, y por lo tanto tampoco la pregunta de sobre qué unidad contarlo.
Comprobado clonando y grepeando los cuatro árboles con `budget`, `presupuesto`,
`max(step|delta|change|gain|increase|boost)`, `rate limit`, `throttle`,
`cumulative`, `per session`, `safety`, `guardrail`, `limiter`, `soft limit`,
`dB cap`, `clamp`, `headroom`, `protect`, `interlock` y `confirmation required`.
Los únicos aciertos son recortes de rango —`clamp(v,0,1)`, `clamp(result,-6,57)`
en MyUiPro—, un `budgets` de tamaño de paquete de Angular y un límite de longitud
de nombre. Ninguno es un presupuesto de movimiento.

**Y es coherente**: los cuatro son bibliotecas de protocolo y clientes. Escriben
lo que el operador pide, cuando lo pide, y el que decide cuánto es suficiente es
el operador. Que agrupar claves enlazadas sí tenga precedente y agrupar por
destino audible no, se sigue de eso: lo primero es del protocolo, lo segundo es de
un asistente.

**El precedente que más manda está adentro.** `esNivelDeEnvioAMonitor` ya exige la
forma canónica para el envío a monitor con el argumento escrito de que *«es
también la forma con la que el estado por ruta puede contar»*. Esta decisión
generaliza eso de una familia a todas, y de la forma de la clave al destino del
sonido.
