# Qué hace cada proyecto de terceros, mirado y no recordado

**Levantado el 2026-09-16 clonando los cuatro repositorios y grepeándolos.** Este
documento existe para que una afirmación sobre trabajo previo se compruebe
contra un archivo, y no contra la memoria de quien la escribe.

**Por qué hacía falta.** El usuario había dejado una instrucción permanente:
*«recuerda de investigar exactamente lo que vas a medir en los repositorios
citados como fuentes, necesito que me digas explícitamente que lo hiciste porque
veo que de alguna forma este paso siempre se "les olvida"»*. Tenía razón: al
auditar la madrugada aparecieron **dos afirmaciones falsas** sobre estos
repositorios, repetidas en cuatro documentos. Las dos tienen la misma forma —un
`grep` negativo del parámetro del día, ampliado en silencio a una conclusión
sobre todo el proyecto— y a la fecha de este documento era la **tercera** vez que este repositorio la corregía. **Hubo una cuarta el 2026-09-17**, sobre la rampa, y está más abajo.

## Los cuatro, con la versión que se miró

| Proyecto | Commit mirado | Último cambio | Qué es |
|---|---|---|---|
| [`fmalcher/soundcraft-ui`](https://github.com/fmalcher/soundcraft-ui) | `7ba8065`, y **vuelto a mirar el 2026-09-17 en `2fc297f`** | **2026-09-17** | Biblioteca TypeScript del protocolo, con documentación propia. La más completa de las cuatro |
| [`Dennion/ioBroker.soundcraft`](https://github.com/Dennion/ioBroker.soundcraft) | `bc2e0a9` | 2025-12-07 | Adaptador de domótica. **Usa la biblioteca de fmalcher**, no habla el protocolo por su cuenta |
| [`ndikanov/ui24`](https://github.com/ndikanov/ui24) | `235fba1` | 2020-07-29 | Un `custom.min.js` de 40 KB que se inyecta en el cliente oficial |
| [`NaturalDevCR/MyUiPro`](https://github.com/NaturalDevCR/MyUiPro) | `20ad8b1` | 2025-07-31 | Aplicación Quasar que abre varias ventanas del cliente a la vez, **más su propio control por MIDI** |

## Qué ESCRIBE cada uno en la consola

Esto es lo que las afirmaciones anteriores tenían mal, así que va primero.

| | Escribe parámetros de mezcla | Cuáles |
|---|---|---|
| `fmalcher/soundcraft-ui` | **Sí** | fader, silencio, solo, panorama, envíos, matriz, automix, ganancia del previo |
| `ioBroker.soundcraft` | **Sí** | `setFaderLevel`, `setPan`, `setMute`, y `hw(n).setGain()` — la ganancia del previo, como crudo 0..1 |
| `ndikanov/ui24` | **No** | sólo `settings.cue`, `settings.playMode`, `settings.shuffle`: el reproductor |
| `NaturalDevCR/MyUiPro` | **Sí** | `SETD^i.N.gain` y `SETD^i.N.hiz`, desde su `mixer-store.ts` |

## Qué CONVIERTE cada uno a unidades reales

Ésta es la pregunta que le importa a este proyecto, porque una conversión ajena
es una hipótesis contra la cual contrastar.

| | Conversiones publicadas |
|---|---|
| `fmalcher/soundcraft-ui` | **fader** (`faderValueToDB` / `DBToFaderValue`), **medidor** (`vuValueToDB` = mapeo lineal a −80..0 dB), **retardo**, **peso de automix**, y **la ganancia del previo**: `setGainDB` mapea linealmente a −6..+57 dB para la Ui24R. Nada del ecualizador, el compresor, la puerta ni el deesser |
| `ioBroker.soundcraft` | ninguna propia. Usa la biblioteca de fmalcher y expone el crudo 0..1 |
| `ndikanov/ui24` | ninguna |
| `NaturalDevCR/MyUiPro` | **la ganancia de entrada**: `gainValueToDB(V) = 63·V − 6`, acotada a −6..+57 dB, y su inversa |

### La ley de ganancia, contrastada: los dos publican la misma recta, y el fabricante no

Es la única conversión ajena que toca un parámetro que este proyecto escribe en
producción, así que se comparó. **Y las dos implementaciones independientes
publican exactamente la misma ley**: una recta de −6 a +57 dB. `fmalcher` la
escribe como `linearMappingRangeToValue(dbValue, -6, 57)`; MyUiPro como
`63·V − 6`. Son la misma fórmula.

**El cliente del fabricante no usa una recta.** Usa una tabla de 64 entradas,
`VtoGAIN24(a) = ui24pgains[64·a] − 1`, del mismo rango −6..+57 pero
**escalonada**: de 2 en 2 dB abajo, de 1 en 1 arriba.

| crudo | tabla del cliente | la recta de los dos | diferencia |
|---|---|---|---|
| 0,000 | −6 dB | −6,00 dB | 0,00 |
| 0,250 | 10 dB | 9,75 dB | −0,25 |
| 0,500 | 26 dB | 25,50 dB | −0,50 |
| 0,750 | 42 dB | 41,25 dB | −0,75 |
| 0,984 | 57 dB | 56,02 dB | −0,98 |

**La recta es una aproximación de los extremos de esa tabla**: acierta en las
puntas, se va hasta casi un decibel en el medio, y **pierde el escalonado** —que
es justo lo que este repositorio ya tenía documentado como la trampa de esa
curva: la ganancia tiene 48 valores posibles, no un continuo—.

**Y la medición propia dice algo más fuerte todavía.** El 2026-09-09
—[`ley-ganancia-2026-09-09.txt`](../spikes/SPK-P0.2a/evidence/ley-ganancia-2026-09-09.txt)—
se midió que **el audio real** se aparta incluso de la tabla del fabricante,
hasta 1,33 dB por encima de los 24 dB. O sea: **las tres fuentes escritas
describen la pantalla, y la única que describe el aparato es la medición de este
repositorio.** Es, hasta donde muestra esta búsqueda, el dato más preciso que hay
publicado sobre esa curva.

**Esto es lo que se perdió por no mirar.** Hasta hoy los documentos de este
repositorio decían que MyUiPro «no toca parámetros de mezcla». Si se hubiera
mirado, la comparación de arriba —dos implementaciones ajenas contra el cliente
contra el audio— habría estado disponible desde el principio, y es exactamente la
clase de contraste que este proyecto dice buscar.

### De yapa, una corroboración del medidor

`vuValueToDB` de fmalcher mapea el medidor a **−80..0 dB**. Este repositorio midió
el recorrido del medidor en **80 dB** después de haberlo documentado mal en 84,5
midiendo con tonos por la interfaz. Coincide, y es una fuente independiente.

## Subir un envío de a poco: fmalcher SÍ tiene una rampa

**Mirado el 2026-09-17**, al construir la subida de monitor de
[ADR-034](../adr/ADR-034-poner-el-nivel-de-monitor-y-retocarlo.md). Es la
corrección de una afirmación propia: esa ADR escribió que ninguno de los cuatro
«tiene presupuesto, techo ni **rampa**», y lo de la rampa es falso. Cuarta vez
que este repositorio escribe la versión cómoda de un «no encontré».

| | Rampa sobre un envío |
|---|---|
| `fmalcher/soundcraft-ui` | **Sí, y sobre este mismo parámetro.** `AuxChannel extends SendChannel extends Channel`, y `Channel` trae `fadeTo(destino, tiempoMs, curva, fps)` y `fadeToDB`. Cuatro curvas —lineal y tres suavizados— y 25 cuadros por segundo por omisión |
| `ndikanov/ui24`, `NaturalDevCR/MyUiPro` | **No.** Cero coincidencias de `fadeTo`, `fadeTime`, `easing` o `ramp` en su código propio |
| `ioBroker.soundcraft` | **No la llama, pero la tiene.** No hay coincidencias propias, y su `package.json` declara `soundcraft-ui-connection`: la rampa **está disponible** en ese proyecto. Poner «No» a secas acá habría sido la forma exacta de error que este documento existe para impedir —el grep del término del día ampliado a una conclusión sobre el proyecto— |

**Qué clase de rampa es, que no es la misma que la nuestra.** La de fmalcher es
una **transición automática y suave hacia un destino**, pensada para automatizar
un show: se le da un destino y un tiempo, y ella interpola. No escucha entre paso
y paso, no tiene presupuesto, no tiene techo, no tiene tope por paso, y **recorta
en vez de negarse** cuando el pedido se va de rango (`clamp(targetValue, 0, 1)`).

La nuestra es lo contrario en su motivo: un paso, **el músico escucha**, otro
paso, con el detector de realimentación corriendo en el medio. La pausa no es una
limitación técnica: es el punto.

**Que exista igual cambia el estado del asunto.** Significa que subir un envío
progresivamente desde código es cosa hecha y probada por otro, y que lo que este
proyecto agrega no es la mecánica de la rampa sino **cuándo parar y con permiso de
quién**.

### Y el precedente más directo de todos, que una etiqueta equivocada tapó

**La primera versión de esta sección llamó `linkTo` a lo que se llama
`changeFaderLevelDB`**, y lo describió como «al propagar un nivel enlazado». No
existe ningún `linkTo` en el árbol de `fmalcher`: cero coincidencias. Lo encontró
una auditoría de fidelidad el mismo día, en el documento escrito justamente para
que esto no pase.

Y la etiqueta equivocada tapaba el hallazgo: `changeFaderLevelDB(offsetDB)`
—`facade/channel.ts`, heredado por `AuxChannel`— es **«subir o bajar un envío una
cantidad de decibeles desde donde está, con piso»**, que es literalmente la
operación de ADR-034. El piso de −100 dB se aplica al nivel actual antes de sumar
el ajuste, o sea que resuelve el mismo problema del borde del silencio: cómo sumar
decibeles a algo que está en −∞.

### La propagación por enlace estéreo, que acá cuenta por ruta

`Channel.setFaderLevelRaw` escribe el nivel **en todos los `linkedChannelIds`**, y
`AuxChannel` arma esa lista con hasta **cuatro** rutas: el canal, su vecino
enlazado en el bus, el mismo canal en el auxiliar estéreo-enlazado, y el vecino en
ese auxiliar. Una sola llamada de «poner el nivel del envío» puede escribir cuatro
`i.N.aux.M.value`.

**Importa acá porque este proyecto cuenta por ruta**: el presupuesto acumulado, el
techo por ruta y el máximo de cuatro parámetros por transacción de INV-005 se
llevan por clave. Si alguna vez se implementa el enlace estéreo, una sola decisión
de producto van a ser varias escrituras y varios presupuestos.

(Del mismo tipo: `DBToFaderValue` **también recorta por arriba**, `if (dbValue >=
10) return 1`, lo que refuerza el «ellos recortan» de más abajo.)

### El borde del silencio, que es el problema que falta resolver

Y es el aporte más directo, porque fmalcher lo resolvió de una forma que la
nuestra descarta con motivo:

| | Cómo trata el silencio |
|---|---|
| `DBToFaderValue(db)` | `if (db <= -200) return 0` — por debajo de −200 dB, crudo cero |
| `faderValueToDB(v)` | `if (lin < 1e-10) return -Infinity` — por debajo de una amplitud de 1e−10, lee silencio |
| `changeFaderLevelDB(offsetDB)` | `Math.max(v, -100) + offsetDB` — antes de sumar un ajuste relativo, pone piso en −100 dB al nivel **actual del propio canal** |

**Es una convención, no una medición.** Sale de leer su código, así que es
`INFERIDO` y vale como hipótesis: `DigiMixer` recorta el medidor en 240 y está
mal. Lo que muestra es que **hay un precedente para elegir un piso finito y
escribir ahí**, en vez de tratar el silencio como un caso aparte.

**Y va en la dirección contraria a la decisión de este proyecto**, lo cual es
justo para lo que sirve un contraste. Ellos **recortan**: cualquier pedido fuera
de rango se convierte en el extremo más cercano. Acá la regla 1 dice que no se
escribe donde nadie midió, y la ley del envío está medida entre el crudo 0,25 y el
1,0; por eso ADR-034 eligió saltar a −32,14 dB —el punto más bajo que se sabe
escribir— y `aRaw` contesta `FUERA_DE_RANGO` por debajo, en vez de recortar.

**Ninguno de los cuatro decide cuánto mandar a la cuña de un músico**, y eso sí
sigue en pie: los cuatro son bibliotecas de protocolo o clientes, no asistentes.
Ninguno tiene presupuesto por sesión, techo de nominal, ni la distinción entre
poner un nivel y retocarlo.

## Qué NO tiene ninguno de los cuatro

Comprobado con `grep` sobre los cuatro árboles, la misma tarde:

- **El ecualizador gráfico de salida como parámetro**: cero coincidencias de
  `eq.peak`, `graphic` o `geq` en código. `fmalcher` **sí** trae su estructura
  entera —31 bandas por lado del general, 31 por auxiliar, con `linked`— pero
  **dentro de un volcado de estado de ejemplo**, sin una sola línea de código que
  lo lea. Es un dato archivado, no una funcionalidad.
- **Cualquier conversión del ecualizador, el compresor, la puerta o el deesser.**
- **La semántica del supresor de realimentación.** `fmalcher` enumera sus doce
  claves en un tipo; nadie dice qué combinación de `logic` y `fmode` es cada modo.
- **El espejo del enlace L/R del ecualizador.** `fmalcher` sí implementa el espejo
  del **enlace estéreo de canal**, del lado del cliente, y su documentación dice
  que así es como lo hace el cliente oficial — lo que corrobora la forma del
  hallazgo propio sobre `m.eq.linked`.

## El medidor del auxiliar en un cliente en marcha: DOS de los cuatro

**Mirado el 2026-09-19**, al darle escucha al envío a monitor
([ADR-036](../adr/ADR-036-la-escucha-de-una-cuna-se-comprueba-sobre-dos-medidores.md)).
La pregunta es distinta de la de la fila del medidor de canal: no si convierten el
byte a decibeles, sino si **publican el medidor de un auxiliar** en un cliente que
está corriendo. Este proyecto lo decodificaba desde el 2026-09-09 y sólo lo leían
los guiones de medición.

| | Medidor del auxiliar en vivo |
|---|---|
| `fmalcher/soundcraft-ui` | **Sí.** `VuProcessor.aux(n)` da un flujo por auxiliar con `vuPost` y `vuPostFader`. Su `parseVuMessageArray` recorre la cola con las cuentas de la cabecera —`input, player, sub, fx, aux, master, line` de a 6, 6, 7, 7, 5, 5 y 6—, igual que `vu-buses.ts` |
| `Dennion/ioBroker.soundcraft` | **Sí, y los publica como estados.** Bajo `enableVuMeter` suscribe el flujo de fmalcher y escribe `aux.N.vuPost` y `aux.N.vuPostFader`, más los del general, las entradas y los efectos |
| `NaturalDevCR/MyUiPro` | **No.** Declara `soundcraft-ui-connection` en sus dependencias, así que **la rampa y el medidor están disponibles** en ese proyecto; lo que no hay es uso: cero coincidencias de `vuProcessor` o `vuData` en su código propio. Decir «no tiene» a secas sería el error que este documento existe para impedir |
| `ndikanov/ui24` | **No.** Es un `custom.min.js` inyectado en el cliente oficial: el medidor lo dibuja el cliente y este proyecto no lo lee |

**Y hay una corroboración independiente del reparto de los dos bytes, que es lo
que más importa de esta fila.** fmalcher los nombra `vuPost` (`+0`) y
`vuPostFader` (`+1`), o sea **el segundo después del fader del auxiliar**. Este
repositorio llegó a lo mismo midiendo, el 2026-09-09: moviendo `a.0.mix`, **el
`+1` siguió al fader y el `+0` no** —docblock de `busMono` en `vu-buses.ts`—. Dos
caminos distintos, leer código ajeno y mover el aparato, y coinciden.

*Una redacción del 2026-09-19 apoyaba esto en «el barrido de la 94 puso ese fader
en 0,45», y era falso: el 0,45 es de la 102 y la 104, sobre el auxiliar 5, y la 94
midió el auxiliar 3 sin tocar su fader. Lo corrigió una auditoría de fidelidad. La
conclusión no cambia; la evidencia verdadera es la del `a.0.mix`, y es más fuerte.*

**Lo que esto NO corrobora:** a cuántos decibeles equivale un escalón de esos
bytes en el bloque de bus. fmalcher aplica al auxiliar la misma escala lineal de
−80..0 que al canal, y eso en este repositorio sigue siendo lo que la 102 dejó
abierto. Vale como hipótesis, que es lo que vale siempre el trabajo previo.

## Comprobar que se escuchó entre un cambio y el siguiente: ninguno de los cuatro

**Clonado y grepeado de nuevo la noche del 2026-09-17**, en los mismos commits de la tabla
de arriba —`2fc297f`, `20ad8b1`, `235fba1`, `bc2e0a9`—, buscando
`measurement`, `settling`, `settle`, `dwell`, `cooldown`, `debounceTime`,
`throttleTime`, `minInterval`, `rateLimit`, `elapsed` y `lastChange` sobre los
cuatro árboles enteros.

| | Comprueba que se midió entre dos cambios |
|---|---|
| `fmalcher/soundcraft-ui` | **No.** Los 42 aciertos de `elapsed` son el tiempo transcurrido del **reproductor** y del grabador multipista (`selectPlayerElapsedTime`, `selectMtkElapsedTime`): un dato que la consola publica, nada que ver con espaciar escrituras. Los dos de `debounceTime` son uno solo, `race(store.state$.pipe(debounceTime(25)), timer(250))` en `utils.ts`, que espera a que el volcado de estado se aquiete **al conectar** |
| `NaturalDevCR/MyUiPro` | **No.** Sus 10 aciertos de `elapsed` son el mismo tiempo del reproductor, leído de la biblioteca de `fmalcher` |
| `ndikanov/ui24` | **No.** Cero aciertos de cualquiera de los once términos |
| `Dennion/ioBroker.soundcraft` | **No.** Cero aciertos propios |

**Y no es un descuido de ellos: es que hacen otra cosa.** Los cuatro son
bibliotecas de protocolo y clientes, no asistentes. Un cliente escribe lo que el
operador le pide en el momento en que se lo pide, y el operador es quien escucha;
no hay nada entre la intención y la escritura que deba comprobar nada. La rampa
de `fmalcher` —`fadeTo`, anotada más arriba— es lo más cerca que hay, y va en
dirección contraria: interpola sola, sin escuchar en el medio, porque su motivo
es que la transición no se note.

**Y se estresó la afirmación negativa con términos que el primer grep no traía**
—`throttle`, `debounce`, `setInterval`, `pollInterval`, `lastUpdate`, `backoff`,
`since`, `ramp`, `fadeTo`—, que es el paso que las cuatro veces anteriores faltó.
Lo único que aparece es el `debounce(handleRetry, 1000)` de **reconexión** de
MyUiPro y el `pollInterval` de **lectura** de ioBroker. Ninguno condiciona una
escritura a que se haya medido.

**Que no haya precedente es un dato, y pide más cuidado, no menos.** La guarda
que este proyecto puso el 2026-09-18 —que la escucha resuelva a una medición
real, de esta sesión, con señal de una lista blanca, de duración mínima por clase
de parámetro, no anterior a la escritura y **con su ventana terminada**— **no
tiene con qué contrastarse**. No hay una implementación ajena que diga si diez
segundos son muchos o pocos, ni si exigir señal deja fuera un caso legítimo. Y se
vio lo que cuesta: la primera versión de esa guarda tenía cinco condiciones y no
cerraba el agujero, y lo encontró una auditoría, no un precedente.

## Decidir si alguien está tocando, mirando el medidor

**Buscado el 2026-09-19**, en los mismos commits de la tabla de arriba, clonando y
grepeando: `silen`, `noise floor`, `activity`, `isActive`, `hasSignal`,
`signalPresent`, `threshold`.

| | Decide «hay alguien tocando» a partir del medidor |
|---|---|
| `fmalcher/soundcraft-ui` | **No.** Las únicas coincidencias de `threshold` fuera de un JSON de ejemplo son dos campos de su modelo de estado --el umbral del **compresor** y el del **de-esser**--: un parámetro que se lee y se escribe, no una decisión sobre la señal |
| `Dennion/ioBroker.soundcraft` | **No.** Una sola coincidencia en todo el repositorio, y es un comentario de la configuración de sus tests |
| `ndikanov/ui24` | **No.** Cero coincidencias |
| `NaturalDevCR/MyUiPro` | **No.** Lo que aparece es un mensaje de «silenciar todos los canales» de su traducción y un registro de cuando la pestaña se oculta |

**Dos de los cuatro publican el medidor y no concluyen nada con él; los otros dos
ni lo leen.** Lo dice la tabla de «Medidor del auxiliar en vivo» de más arriba:
`ndikanov/ui24` es una inyección en el cliente oficial y el medidor lo dibuja el
cliente, y `NaturalDevCR/MyUiPro` tiene la biblioteca disponible y cero uso.

> **Acá decía «los cuatro publican el medidor», y era falso.** Lo cazó una
> auditoría de fidelidad el 2026-09-19, el mismo día que se escribió. **Y es
> exactamente el patrón que este documento existe para impedir**: un motivo que
> suena bien --«son clientes, muestran el número»-- al lado de una conclusión
> correcta, cuando **la evidencia verdadera estaba dieciséis líneas más arriba en
> este mismo archivo y era MÁS FUERTE**: que dos ni lo lean refuerza todavía más
> que no hay precedente. Es la segunda vez en el día con la misma forma.

Es coherente con para qué están hechos: son clientes y puentes de domótica, que
muestran el número o lo reexportan. Preguntarle al medidor si el músico estaba
tocando es una pregunta que aparece recién cuando algo **escribe** en la consola y
necesita saber si puede volver a escribir.

**Y el término que se grepeó no alcanza a la puerta**, dicho para que nadie repita
la búsqueda creyendo que sí: en `fmalcher` el campo de la puerta se llama
`thresh`, no `threshold`. La conclusión no cambia --ese campo tampoco decide nada
sobre la señal-- pero el detalle que se citaba como grepeado no era el que el grep
devolvía.

**Que no haya precedente es un dato: pide más cuidado, no menos.** Por eso la vara
de movimiento de [ADR-037](../adr/ADR-037-que-cuenta-como-que-el-musico-estaba-tocando.md)
queda marcada como **elegida y no medida**, en vez de pasar por medida apoyándose
en que nadie contradice.

## La pantalla por músico: la tiene la propia consola, y se llama MOREME

**Mirado el 2026-09-20**, al construir la primera mitad de la pantalla por
músico. La pregunta era cómo presenta cada uno **la mezcla de monitor de una
persona**: elegir a alguien y ver lo que le llega a su cuña.

**El precedente más fuerte no está en los cuatro repositorios: está en el manual
del fabricante que este repositorio tiene archivado desde hace semanas, y que
ningún documento citaba.**

> *«MOREME allows users to assign their own personal channel, and create a
> personal monitoring mix with a single large fader. MOREME channel names are
> highlighted in orange. To assign an input channel to the MOREME fader,
> long-press a channel name and select the ASSIGN ME function. Use the same
> process to assign an Aux bus as 'ME OUT'.»*
>
> — `manual-ui24r-v1.0.txt`, **§3.3 (tablet) y §3.4 (teléfono)**, donde el texto
> está repetido palabra por palabra. En el teléfono es una pantalla principal; en
> la tablet, el panel lateral o la vista vertical.

**Y la §6.2 dice otra cosa, que conviene no mezclar.** Es la sección que se llama
MOREME y sostiene lo esencial --canales propios, `ASSIGN ME`, `ASSIGN ME OUT`, un
fader grande único, «mezclar tu propio sonido contra el de los demás»-- pero
**no trae el párrafo de arriba y no nombra el naranja en ninguna parte**. La
primera redacción de esta sección le atribuyó a §6.2 la cita y el resaltado; lo
cazó una auditoría de fidelidad el mismo día.

O sea: **la Ui24R ya tiene una pantalla por músico**, con la misma unidad de
cuenta —la persona, no el auxiliar—, la misma pareja de datos —su canal y su
auxiliar— y **el propio instrumento resaltado**. Las dos decisiones de forma que
esta pieza iba a tomar ya estaban tomadas por el aparato, y el usuario las conoce
porque son las de su consola.

Lo que MOREME **no** hace es lo que la aplicación agrega, y conviene tenerlo
separado para no creer que el trabajo ya está hecho: no mide, no tiene techo, no
distingue poner el nivel de retocarlo, y no escucha entre un paso y el siguiente.
Y está pensada para el teléfono del músico; la de la aplicación es para la tablet
de quien opera, con el músico enfrente.

**Es la tercera vez que este repositorio encuentra la respuesta en su propio
archivo** --ver [`hallazgo-la-respuesta-estaba-archivada.md`](../backlog/hallazgo-la-respuesta-estaba-archivada.md)--.
El manual está listado como «tercera fuente, no superior», y eso lo volvió fácil
de no abrir.

### Y en los cuatro repositorios, una sola cosa parecida

| | Vista de la mezcla de un auxiliar |
|---|---|
| `fmalcher/soundcraft-ui` | **Sí, pero es un banco de pruebas.** `packages/testbed` tiene una ruta `auxbus/:bus` --`AuxBusPage`-- que elige un auxiliar por número y muestra, de cada camino que entra, su nivel, su pre/post y su silencio. **Cablea cuatro canales de ejemplo a mano** --`input(2)`, `line(1)`, `player(1)`, `fx(2)`-- para ejercitar la API: no recorre los canales ni sabe de personas. La forma sirve; el contenido no pretende ser un producto |
| `Dennion/ioBroker.soundcraft` | **El dato sí, la vista no.** Crea un objeto por auxiliar con una carpeta `aux.N.input` dentro y un hijo por fuente, `aux.N.input.M` --su propio README lo ejemplifica con `aux.3.input.2.faderLevel`--, o sea que **modela «lo que entra a este auxiliar»** como estructura. Es domótica: no hay pantalla. *(La primera redacción escribió `aux.N.inputs`, en plural, que no existe en ese repositorio: una clave inventada en el documento que existe para que las claves no se inventen. La cazó una auditoría de fidelidad el mismo día.)* |
| `NaturalDevCR/MyUiPro` | **No tiene vista propia, y no es que le falte**: es un contenedor de `iframe` con selector de disposición que empotra `mixer.html` de la consola, y **cero coincidencias de `aux` en su código**. Lo que muestre de monitores será lo que muestre el cliente oficial --pero eso es **inferencia mía y no un hallazgo**: `MOREME` no aparece ni una vez en ese repositorio. La primera redacción lo escribió en negrita como si lo dijera el código— |
| `ndikanov/ui24` | **No la implementa, pero la nombra.** Es un parche que se inyecta **en el cliente oficial**, así que lo que su código menciona --`E_MODE.MOREME`, `moremeWidget`, `E_MODE.AUX`, `auxWidget`-- es del cliente de la consola y no suyo: no hay ninguna definición de esos widgets en el repositorio. Dicho de otro modo, **confirma que esos modos existen en la interfaz oficial**, y nada más |

**Y ninguno de los cuatro decide cuánto mandar a la cuña de un músico**, que es
lo que ya decía la sección de la rampa y sigue valiendo: son bibliotecas de
protocolo, adaptadores y contenedores, no asistentes.

### De yapa, un dato del aparato que esta pantalla todavía no mira

`fmalcher` expone `AuxBus.isMatrix$`: en la Ui24R **un auxiliar se puede convertir
en una matriz**, y entonces lo que lo alimenta son otras claves --`a.N.mtx.M`-- y
no los envíos `i.N.aux.M.value`. La clave que lo dice está en la consola del
usuario: `a.N.matrix`, una por auxiliar, en el inventario del 2026-09-11.

**Este proyecto no la lee, y la pantalla por músico tampoco. Pero ya la tenía
censada como hueco conocido antes de que `fmalcher` la trajera**:
`que-entra-al-general.ts` la lista como `{ sufijo: 'matrix', familias: ['a'],
clase: 'CAMINO' }`, en un módulo cuyo tipo dice literalmente «una ruta que existe
en la consola y este módulo no lee». O sea que el aporte de `fmalcher` es **el
uso** --qué cambia cuando vale uno-- y no el dato; presentarlo como hallazgo
ajeno sería, por segunda vez en esta misma sección, no mirar el archivo propio.
Queda anotado y no
entra como tarea, por la regla de la hoja de ruta: para que muerda, el usuario
tiene que convertir un auxiliar en matriz **y además** declararlo como monitor en
su perfil de amplificación. **Daño máximo hoy: la pantalla muestra una lista de
envíos que no es la que alimenta esa salida.** No escribe nada --esta pieza es de
sólo lectura-- así que no hay riesgo para su equipo. **Y el valor de esa clave en
su aparato no se sabe**: el inventario guarda las claves observadas, no sus
valores.

## Los preajustes de la consola: ninguno de los cuatro los toca

**Clonado y grepeado el 2026-09-20**, en los mismos commits de la tabla de
arriba, al contestar si el protocolo deja listar, leer y guardar preajustes
(pieza 2, el ecualizador de canal). Se buscaron `PRESETLIST`, `READPRESET`,
`WRITEPRESET`, `RENAMEPRESET`, `DELETEPRESET`, `prname` y `prmod` sobre los
cuatro árboles enteros, y además `preset` sin distinguir mayúsculas.

| | Preajustes de canal, ecualizador o dinámica |
|---|---|
| `fmalcher/soundcraft-ui` | **No.** Ninguno de los cinco comandos aparece. `prname` y `prmod` aparecen **sólo dentro de `example-state.json`** —su volcado de estado de ejemplo, con `"prname": "Male Vocal"` incluido— y **ni una línea de código los lee**. Es exactamente la misma forma que el ecualizador de salida: el dato archivado, la funcionalidad no |
| `Dennion/ioBroker.soundcraft` | **No.** Cero coincidencias en el código. Lo único es una viñeta de su `README` —«*Preset recall through ioBroker scripts*», en una lista de casos de uso— que promete que **el usuario** puede escribir un script que recupere valores, no que el adaptador hable el vocabulario de preajustes. Decir que «tiene recall de presets» apoyándose en esa línea sería el error de este documento al revés |
| `ndikanov/ui24` | **No.** Cero coincidencias de `preset` en todo el repositorio |
| `NaturalDevCR/MyUiPro` | **No.** Cero coincidencias de `preset` en todo el repositorio. Empotra el cliente oficial en un `iframe`, así que el gestor de preajustes que el usuario ve ahí **es el de la consola** |

**Lo que sí hay, y es el precedente útil.** `fmalcher` implementa la **misma
forma de mensaje** para otra familia: `resource-lists.ts` modela literalmente la
lista plana `CMD^entrada^entrada…` y la usa con `SHOWLIST`, `SNAPSHOTLIST` y las
listas del reproductor, con un `requestResourceList` que manda el pedido y
espera la respuesta por el mismo nombre de comando. `PRESETLIST` es esa misma
forma. O sea: **la mecánica de pedir una lista y leerla está resuelta por otro**;
lo que no hay en ningún lado es el vocabulario de preajustes ni nada que decida
qué preajuste corresponde a qué instrumento.

**Que no haya precedente es un dato, y pide más cuidado.** Cargar un preajuste
en esta consola **no es un comando**: el aparato devuelve el contenido y el
cliente lo escribe clave por clave. Ningún proyecto ajeno ejerció ese camino,
así que no hay con qué contrastar cuántas escrituras seguidas tolera la consola
ni en qué orden conviene mandarlas.

## Cómo se usa este documento

**Antes de escribir «ninguno de los cuatro hace X», buscá X acá.** Si no está,
cloná y grepeá otra vez, y agregá la fila. Lo que no vale es una afirmación
general sacada de una búsqueda del parámetro del día: es la forma de error que
este repositorio ya corrigió con `afs.*`, con `eq.peak` y ahora con esto.

**Y el dato tiene fecha.** Los commits están en la tabla de arriba. Un repositorio
que cambió desde entonces pide volver a mirar, no confiar en esta página.
