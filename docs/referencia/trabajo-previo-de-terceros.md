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
sobre todo el proyecto— y es la **tercera** vez que este repositorio la corrige.

## Los cuatro, con la versión que se miró

| Proyecto | Commit mirado | Último cambio | Qué es |
|---|---|---|---|
| [`fmalcher/soundcraft-ui`](https://github.com/fmalcher/soundcraft-ui) | `7ba8065`, y **vuelto a mirar el 2026-09-17 en `2fc297f`** | 2026-09-09 | Biblioteca TypeScript del protocolo, con documentación propia. La más completa de las cuatro |
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
| `ioBroker.soundcraft`, `ndikanov/ui24`, `NaturalDevCR/MyUiPro` | **No.** Cero coincidencias de `fadeTo`, `fadeTime`, `easing` o `ramp` en los tres árboles |

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

### El borde del silencio, que es el problema que falta resolver

Y es el aporte más directo, porque fmalcher lo resolvió de una forma que la
nuestra descarta con motivo:

| | Cómo trata el silencio |
|---|---|
| `DBToFaderValue(db)` | `if (db <= -200) return 0` — por debajo de −200 dB, crudo cero |
| `faderValueToDB(v)` | `if (lin < 1e-10) return -Infinity` — por debajo de una amplitud de 1e−10, lee silencio |
| `linkTo` (nivel enlazado) | `Math.max(v, -100)` — al propagar un nivel, piso en −100 dB |

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

## Cómo se usa este documento

**Antes de escribir «ninguno de los cuatro hace X», buscá X acá.** Si no está,
cloná y grepeá otra vez, y agregá la fila. Lo que no vale es una afirmación
general sacada de una búsqueda del parámetro del día: es la forma de error que
este repositorio ya corrigió con `afs.*`, con `eq.peak` y ahora con esto.

**Y el dato tiene fecha.** Los commits están en la tabla de arriba. Un repositorio
que cambió desde entonces pide volver a mirar, no confiar en esta página.
