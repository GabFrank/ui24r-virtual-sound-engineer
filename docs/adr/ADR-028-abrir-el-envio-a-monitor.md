# ADR-028 — Abrir el envío a monitor, con techo

**Fecha:** 2026-09-12
**Estado:** aceptado
**Origen:** **Decisión del usuario**, respondiendo a una pregunta de opción
múltiple el 2026-09-11. Textual en
[`docs/pedidos/00-lo-que-dijo-el-usuario.md`](../pedidos/00-lo-que-dijo-el-usuario.md).

## Lo que el usuario decidió

> Los envíos de monitor: **«Sí, y también para el ajuste normal de monitores»**

O sea: no sólo para diagnosticar una realimentación. También para el ajuste
corriente.

Y fijó el techo, en la misma tanda de respuestas:

> Techo al subir: **«Hasta donde estaba antes de que yo lo bajara, y ni un paso
> más»**

Su propio método empieza por bajar el nivel:

> *«Si el acople es muy fuerte entonces bajo el nivel del auxiliar o pa,
> dependiendo de donde se escucha, luego vuelvo a subir de a poco buscando el
> acople nuevamente y empiezo a mutear canal por canal en busqueda…»*

**Y esto es un recorte de ese pedido, que hay que declarar.** «El nivel del
auxiliar» es `a.N.mix`, el fader del bus; «pa» es `m.mix`, el general. **Este ADR
no abre ninguno de los dos**: abre el envío por canal, `i.N.aux.M.value`, que es
un parámetro distinto con otro dueño.

El propio proyecto ya lo había avisado por escrito, en
`docs/pedidos/2026-09-12-diagnostico-y-mediciones.md`: *«la pregunta fundía dos
cosas… hay que separarlos al implementarlo»*. Se separaron y **se implementó
uno**. El otro —bajar el auxiliar o el general para cazar un acople, que es
literalmente el primer paso del método del usuario— sigue cerrado.

**Lo que falta ahí es el ADR y las leyes, no la decisión.** Esto decía «necesita
su propia decisión» y el usuario ya la había tomado el mismo día, eligiendo
entre opciones: «*Los dos, con techo*» —el auxiliar y el general—, registrado en
`docs/pedidos/00-lo-que-dijo-el-usuario.md` y en
`docs/backlog/decision-bajar-buses-para-cazar-acoples.md`. Lo que falta es medir
la ley de `a.N.mix` y de `m.mix`, decidir el techo del general, y escribir el
ADR.

Presentar como no decidido algo que el usuario decidió es la regla dura del
proyecto invertida: el error habitual es firmar como del usuario una decisión
del agente, y éste es el mismo error en la otra dirección. Lo encontró una
auditoría de coherencia.

## Por qué recién ahora

La decisión es del 2026-09-11 y el código no la reflejaba. **No por olvido:**
INV-004 rechaza todo parámetro sin límite declarado, y un límite en decibeles no
se puede declarar sin saber cuántos decibeles es un crudo.

Esa ley se midió el 2026-09-12 (ítem 94), **y hay que citarla como quedó y no
como conviene**: el desvío contra `faderADb` **no supera un escalón del medidor
—0,3334 dB— en los catorce puntos comparados, sobre 27,87 dB desde el tope**, con
el testigo del canal sin derivar 0,00 dB. El desvío máximo observado es **0,31 dB**.

*(La primera versión de este ADR decía «0,25 dB sobre 28 dB». El 0,25 es el
anteúltimo punto de la lista, no el máximo, y el 28 redondea hacia arriba un
27,87: los dos ajustes van en la misma dirección, desvío más chico sobre
recorrido más largo. Lo encontró una auditoría de fidelidad, y la cifra estaba
propagada a tres archivos.)*

**Y la ley no quedó cerrada.** La predicción «el envío usa la ley del fader»
**falló** bajo el criterio registrado antes de medir, y con el criterio corregido
**no se puede decidir**: el peor caso compatible con lo medido es ~0,48 dB, más
de un escalón, y el residuo es unilateral y creciente —la firma de una diferencia
de ley que la corrida vio y no pudo resolver—. Lo que la 94 autoriza es una
**acotación**, no una identidad, y es suficiente para declarar un límite.

**La ley se midió en un canal y un auxiliar.** Este ADR la usa para abrir 240
rutas. Que los diez auxiliares compartan ley es plausible y **no está medido**;
la 94 lo declara entre lo que no prueba.

Abrir la escritura antes de eso habría sido escribir a ciegas un parámetro que
el músico escucha mientras toca.

## Lo que se abre, y lo que no

**Sólo el nivel:** `i.N.aux.M.value`. Son 240 rutas, veinticuatro canales por
diez auxiliares, y la cuenta de rutas escribibles del motor pasa de 690 a 930
**exactamente +240**.

**No se abren `mute`, `pan`, `post` ni `postproc`**, aunque `clasificar-ruta`
las clasifique bajo el mismo `kind` —lo hace porque INV-010 razona sobre el
conjunto de rutas de monitor, y ahí las cinco cuentan—.

**Y esto casi se abre de más.** Abrir el `kind` habría abierto **1210 rutas en
vez de 240**. Lo frenó el test que cuenta las rutas escribibles, que existe con
esta instrucción escrita: *«un número que se actualiza sin mirar deja de ser una
guarda»*.

**De esas 1210, diez no son hojas del envío: son `a.N.mix`**, el fader de cada
bus auxiliar, o sea **el volumen entero de cada cuña**. `clasificar-ruta` los
mete bajo el mismo `kind`, así que lo único que hoy los mantiene cerrados es la
lista blanca del motor —que acepta exactamente `i.N.aux.M.value` y nada más—.
No es «una hoja más»: es el parámetro que el usuario nombra en la cita de arriba.

*(La primera versión decía +1200 y no mencionaba `a.N.mix`. Las dos cosas las
encontró la auditoría de fidelidad, que además señaló la ironía: el fader del
bus es exactamente «el nivel del auxiliar» que el usuario dice bajar.)*

La distinción no es formal. **La medición 95, del mismo día, mostró qué hacen
esas banderas en el audio:** con `postproc = 1` el envío sigue al ecualizador dB
por dB —+24,00 en el canal, +24,00 en el monitor—. Escribir `post` o `postproc`
es recablear el monitor del músico, no ajustarlo. Y son 240 banderas
independientes que el ajuste global `settings.auxsendpoint` no reescribe.

## Las tres guardas

| Guarda | Qué hace | De dónde sale |
|---|---|---|
| **Sólo `i.N.aux.M.value`** | Rechaza toda otra ruta del `kind`, **incluidos los diez `a.N.mix`** | Interpretación mía del alcance del «ajuste normal de monitores» que el usuario autorizó |
| **Techo por ruta** | No sube más allá del valor que la ruta tenía **cuando la aplicación la bajó**, en decibeles; si la aplicación no la bajó, no hay techo | La **regla** es del usuario: «*Hasta donde estaba antes de que yo lo bajara, y ni un paso más*». **Cómo se ancla es decisión del agente y no es lo mismo** — ver abajo. *(Esta celda describía el ancla **derogada**, «cuando el asistente la tocó por primera vez», cuarenta líneas antes de que este mismo ADR la corrigiera. Es la clase de contradicción interna que hace que el lector se lleve la versión que leyó primero.)* |
| **No durante el show** | `sessionState === 'SHOW'` rechaza | Mismo criterio que ADR-027 |

**La asimetría del techo es decisión del agente, no del usuario.** Al usuario se
le preguntó una sola cosa —«techo al subir»— y nunca se le ofreció un piso; su
silencio no es una decisión. Bajar no tiene tope propio —de la magnitud se ocupa
INV-004— y subir sí, con este razonamiento, que es mío: bajar de más molesta al
músico; subir de más le puede arruinar el oído o disparar el acople que se estaba
cazando.

*(La primera versión de esta línea decía «es del usuario». Lo encontró la
auditoría de fidelidad, y es la misma forma del error que ya corrigió una vez en
ADR-027.)*

**El techo incluye su propio valor**, o sea que llegar exactamente ahí está
permitido. Es interpretación mía del «ni un paso más», que la respalda pero no la
dice. Hay un test que la fija, porque un `>` contra un `>=` es la clase de
diferencia que nadie nota hasta que importa.

### El techo sólo existe si la app bajó, y la primera versión rompía el caso principal

**Corregido el 2026-09-12, por una pregunta del usuario de una línea:** *«¿qué
pasa si al iniciar el soundcheck están todos abajo? ¿La app podrá levantar?»*.

No podía. El techo se anotaba en la **primera escritura, fuera cual fuera**, así
que con el envío en el piso quedaba clavado ahí y la aplicación no podía subir ni
un decibel. Comprobado ejecutando el motor: `INV-010 — no sube más allá de donde
estaba: −88 dB pedidos contra un techo de −90`.

**El contexto se había perdido.** La pregunta que el usuario respondió con «hasta
donde estaba antes de que yo lo bajara» estaba en el bloque de **diagnóstico de
acoples**, entre «provocar el acople» y «acople combinado». Era el techo para
**restaurar algo que se bajó**. La línea contigua de sus respuestas autoriza otra
cosa: «*Sí, y también para el ajuste normal de monitores*». **Tomé un techo de un
contexto y lo apliqué a los dos**, y el que rompía era justamente el que él había
autorizado de forma más amplia.

Decisión del usuario, 2026-09-12: **el techo existe sólo si la app bajó.** Si
nadie bajó nada, no hay techo y rigen los topes de magnitud.

**Es la tercera vez en esta tanda que una restricción sale más ancha que el
permiso** —la primera fue el silencio de canal en ADR-027, la segunda el alcance
de este mismo ADR— y **la primera que la encuentra el usuario y no una
auditoría**. Vale anotarlo: las tres veces el error no estuvo en implementar mal
una regla, sino en llevar una regla a un contexto donde nadie la había puesto.

### El ancla del techo no es la del usuario, y hay que decirlo

El usuario dijo «antes de que **yo** lo bajara»: su ancla es el valor **previo a
que él bajara** la cuña. Lo implementado se ancla en **la primera vez que el
asistente tocó la ruta**.

**Las dos coinciden sólo cuando el que bajó fue el asistente.** Si el usuario ya
bajó a mano y después entra la aplicación, el techo se fija en el valor ya bajado
y el techo que él pidió queda inalcanzable.

La regla del usuario, tal como la dijo, necesita seguir los cambios externos —
saber qué valor había antes de que él lo moviera— y eso hoy no existe. **Esta es
la operacionalización del agente.** La primera versión de este ADR la firmaba
como «palabras del usuario», y el propio proyecto ya había registrado el mismo
tropiezo sobre esta misma frase: *«es la segunda vez que un "yo" suyo se
convierte en autoridad de la app»*. Con ésta van tres.

## Los límites, y por qué son más apretados que los del fader

```
MONITOR_AUX_SEND: { porTransaccion: 2, acumuladoPorSesion: 4, unidad: 'dB' }
CHANNEL_FADER:    { porTransaccion: 3, acumuladoPorSesion: 6, unidad: 'dB' }
```

El fader de canal lo escucha el operador, que está mirando la consola. **El
monitor lo escucha el músico, que está tocando y no puede avisar.** Dos
decibeles de golpe en una cuña son bastante más de lo que parecen desde la
mesa.

**Estos dos números son decisión del agente, no del usuario.** Se pueden
discutir; lo que no se puede es no tenerlos, porque sin límite declarado
INV-004 rechaza la escritura entera.

## Lo que queda sin hacer, y hay que decirlo

**Nada de esto hace nada en la aplicación todavía, y la primera versión de esta
sección lo decía a medias.** Decía que faltaba el techo, lo cual deja la imagen
de una función viva a la que le falta una guarda. Son tres huecos y el primero
se los come a los otros dos.

**1. Ningún camino de la aplicación propone un cambio de envío a monitor.** El
único `CambioPropuesto` que se construye en producción en todo el repositorio es
`aplicar-ganancia.service.ts`, con `kind: 'PREAMP_GAIN'`. **ADR-028 no cambia
nada observable hoy**: abre una puerta que nadie usa todavía. Lo que hace es
dejar la regla escrita y probada para cuando el camino exista.

**Actualización del 2026-09-13: el hueco 1 ya no tiene excusa técnica.** Faltaba
la ley de conversión —sin ella el motor no podía atar la magnitud al crudo— y la
midió el ítem 104 contra un convertidor externo: `i.N.aux.M.value` entró a la
tabla en `PROBADO`, en dB, que es la unidad del tope de este `kind`.

Y con eso se destaparon dos cosas que hacían falta y nadie sabía:

- **`entrada()` no resolvía ninguna ruta concreta.** `verificarAtadura` devolvía
  `SIN_LEY_VERIFICADA` en los 24 canales, o sea que la guarda que ata la magnitud
  al crudo estaba enchufada al motor y no podía disparar nunca. Arreglado con
  `canonizarRuta`.
- **Los tests de este ADR ponían el nivel en dB en el campo del CRUDO**
  —`valorPropuesto: -6`, cuando el crudo de un envío va de 0 a 1—, que es la
  misma confusión que la guarda existe para cazar. Pasaban porque no podía
  disparar.

**Actualización de la misma fecha: los huecos 1 y 2 están cerrados.**

- **El hueco 1**, con `apps/mobile/src/app/monitor/bajar-envio.service.ts` y la
  regla `puedeBajarEnvioAMonitor` en `@vse/assistants`, donde se prueba. Es el
  segundo sitio de producción del repositorio que construye un
  `CambioPropuesto`, y el centinela que contaba «exactamente uno» lo comprobó el
  día que nació: pasa el crudo como crudo y los decibeles como magnitud.
- **El hueco 2 también, y resultó no necesitar lo que esta sección decía.**
  `techoPorRuta` no hace falta que salga del «historial de la sesión»:
  `registrarTecho` lo construye **de los cambios mismos** —guarda dónde estaba la
  ruta la primera vez que la aplicación la bajó, y el primer descenso gana—. El
  dueño natural de esa memoria es quien baja, y quien baja es ese servicio. El
  mapa vive ahí y se pasa lleno en cada transacción.

**El hueco 3 sigue abierto**: `acumuladoPorRuta` y `rutasYaTocadas` siguen
vacíos, así que `acumuladoPorSesion: 4` no acota nada y sólo funciona el
`porTransaccion: 2`.

**Y lo que falta para que esto se vea: ninguna pantalla llama al servicio.**
Existe el camino y está probado; falta quién lo dispare. Decirlo es la diferencia
entre una función y la promesa de una función.

Ver `docs/backlog/hallazgo-la-guarda-de-magnitud-no-podia-disparar.md`.

**2. El techo no se llena.** `techoPorRuta` llega vacío porque hace falta el
historial de la sesión, que tampoco alimenta `acumuladoPorRuta` ni
`rutasYaTocadas`.

**3. Y de los dos límites que este ADR presenta como la guarda de magnitud, uno
es inerte por el mismo motivo.** Con `acumuladoPorRuta` vacío, `acumuladoEnSesion`
es siempre 0 y el `acumuladoPorSesion: 4` **no acota nada**. Sólo el
`porTransaccion: 2` funciona. Por la misma razón, `esPrimerCambioDelParametro`
es siempre verdadero y la cláusula `SIN_MEDICION_INTERMEDIA` de INV-004 nunca se
dispara.

Decirlo es la diferencia entre una guarda y la promesa de una guarda —y este
proyecto ya tiene documentado un commit que dijo que la aplicación «lee» algo que
no leía—. **La auditoría de fidelidad señaló que la primera versión se
enorgullecía de declarar el hueco del techo mientras callaba los otros dos, en la
misma sección.**

### Y un efecto lateral que no vi al escribir esto

Mientras `MONITOR_AUX_SEND` no se escribía, que nadie pasara `busDeAnalisis` a
`clasificarRuta` era el lado seguro: sin ese dato todo envío se clasifica como
monitor, y ningún monitor se escribía. **ADR-028 dio vuelta ese argumento.** Ahora
los veinticuatro envíos hacia el bus de análisis se tratan como envíos de monitor
**escribibles**, con los topes y el techo de un monitor en vez de los de un bus de
medición. El motor llama a `clasificarRuta` sin opciones y nadie en producción
pasa el dato.

Hoy no tiene consecuencia, por el hueco 1. El día que la tenga, sí. Los dos
lugares que afirmaban lo contrario —el docblock de `OpcionesDeClasificacion` y
la fila de `busDeAnalisis` en `safety-invariants.md`— quedaron corregidos.

## Libertad que el usuario dejó escrita

> *«si futuramente aparece un bloqueo relacionado (pensando ya) al modo live,
> tienes libertad de retirarlo o que el motivo sea otro que si tiene sentido
> para nosotros»*

La guarda del show entra en esa categoría: el modo live es una función que hoy
no existe. Se puede retirar cuando exista, o cambiarle el motivo por uno que
sirva.
