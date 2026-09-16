# El medidor no se emite por reloj: se emite por cambio

**2026-09-15.** Sale de diagnosticar por qué el ítem 108 no podía correr.
Instrumento: `tools/spikes/p0-10b-vu/llega-el-tono.ts`. Evidencia:
[`llega-el-tono-2026-09-15b.txt`](../spikes/SPK-P0.10b-vu2/evidence/llega-el-tono-2026-09-15b.txt).

## Lo medido

Tres ventanas de 6 s sobre el mismo canal, con el supresor apagado y comprobado:

| | cuadros | por segundo | pico del canal | valores distintos |
|---|---|---|---|---|
| en silencio | 138 | 23,0 | −69,7 dB | **13** |
| **con tono de 1 kHz** | **12** | **2,0** | −22,7 dB | **1** |
| en silencio otra vez | 137 | 22,8 | −69,3 dB | 15 |

**Con el tono, las doce lecturas traen el mismo valor.** En silencio, el ruido de
fondo fluctúa y cada cuadro trae algo nuevo.

La consola emite `VU2` **cuando el nivel cambia**, no a cadencia fija. Un tono
sostenido —un nivel perfectamente quieto— es el estímulo que menos cuadros
produce.

## Una corrida anterior, y un veredicto que se contradecía a sí mismo

La primera versión de este instrumento corrió minutos antes y está archivada en
[`llega-el-tono-2026-09-15.txt`](../spikes/SPK-P0.10b-vu2/evidence/llega-el-tono-2026-09-15.txt).
Midió lo mismo —el medidor del canal subiendo con el tono, la cadencia
desplomándose— y después **imprimió «EL TONO NO LLEGA»**, contradiciendo la línea
que él mismo había escrito dos renglones arriba.

El defecto era del razonamiento, no de la medición: el veredicto se decidía por
el margen del bin que vuelve por la interfaz, y eso mezcla dos preguntas
distintas —si el tono **entra** a la consola, y si el camino de **vuelta** lo
trae—. Con el retorno caído, la primera respuesta salía mal por culpa de la
segunda.

Se separaron las dos preguntas, y quien contesta la primera pasó a ser el
instrumento más directo que hay: **el medidor de la propia consola**. Queda
archivado porque es otra vez la misma familia de defecto que persiguió a toda
esta sesión —un instrumento que informa con seguridad algo que sus propios datos
desmienten— y porque el arreglo se ve mejor contra el error.

## Esto RESUELVE una contradicción, no la abre

Un documento anterior de este backlog dejó asentado que cinco archivos del
repositorio afirmaban que la consola calla el `VU2` **en silencio** —«una trama
en 30 s», medido el 2026-09-08— y que el 2026-09-15 se medían 22,5/s en silencio
real. Se declaró como un desacuerdo sin resolver.

**No era un desacuerdo: era la misma regla vista desde dos lados.**

- El 2026-09-08 se comparó **música** contra **silencio digital**. La música
  cambia todo el tiempo → 1 932 tramas en 90 s. El silencio digital no cambia
  nunca → 1 trama en 30 s.
- El 2026-09-15 se comparó **ruido de fondo** contra **tono fijo**. El ruido
  fluctúa → 23/s. El tono no se mueve → 2/s.

Las dos corridas son correctas y las dos miden lo mismo: **la cadencia sigue al
cambio, no al reloj.** Lo que estaba mal era la descripción —«se calla en
silencio»—, que es un caso particular enunciado como si fuera la regla.

**Qué cambia para INV-017.** Nada de la decisión: vigilar `RTA` y nunca `VU2`
sigue siendo lo correcto, y ahora con mejor motivo. El motivo escrito —«se calla
en silencio»— era demasiado estrecho: `VU2` también se calla con una señal
**quieta**, que es una condición mucho más común en un escenario que el silencio
digital —una nota sostenida, un acople estable, un tono de prueba—. La
justificación se fortalece; el enunciado había que corregirlo.

## Qué le hace esto al ítem 108

**Le explica los dos fallos y deja en evidencia una guarda con la premisa dada
vuelta.**

`CUADROS_MINIMOS = 20` existe con este argumento: *«menos cuadros que esto y el
promedio no es un promedio»*. Eso supone que los cuadros son muestras ruidosas
que hay que promediar para sacarles el ruido.

Con este hallazgo, **el supuesto se da vuelta justo en el estímulo que el 108
usa**: el 108 mide con un tono sostenido, o sea con el medidor quieto, o sea con
la consola emitiendo poquísimos cuadros **porque no hay nada nuevo que contar**.
Los 12 cuadros de la corrida traían **un solo valor**: promediarlos da
exactamente lo mismo que promediar 200.

O sea que la guarda rechaza datos buenos, y los rechaza **más cuanto mejor se
comporta el banco**: cuanto más limpio y estable el tono, menos cuadros manda la
consola, más cerca del rechazo queda la corrida. Una guarda que se endurece con
la calidad de la medición está midiendo otra cosa.

**No se arregla en este commit, y el motivo es que el arreglo correcto no se
sabe todavía.** Bajar el número sería tratar el síntoma. Lo que la guarda quería
proteger —que el promedio del medidor signifique algo— sigue siendo legítimo, y
la forma correcta de comprobarlo con un flujo por cambio es probablemente mirar
la **dispersión** de los valores y no su cantidad: un solo valor repetido es
señal perfecta, y tres valores muy separados son señal mala aunque sean tres. Eso
pide su propio contrato, escrito antes de tocar el guion.

## Y el banco está caído, que es lo que bloquea de verdad

La misma corrida midió el camino de vuelta, y ahí hay un problema físico que
ninguna guarda arregla:

- El tono **entra** bien: el medidor del canal sube **47,0 dB**, de −69,7 a
  −22,7 dB. Lo dice la consola.
- El tono **vuelve** a la interfaz a **−94,09 dBFS**, apenas **23,0 dB** sobre el
  ruido de su propio bin. El contrato del 108 espera unos 94 dB.

**Faltan unos 70 dB en el retorno.**

La primera hipótesis fue la perilla de ganancia de la entrada 1 de la Scarlett
—el rango del aparato son unos 69 dB, una coincidencia tentadora—. **Se
descartó midiendo:** el piso de ruido de la entrada 1 está en −62,5 dBFS y el de
la entrada 2 en −83,7. Una entrada con la ganancia al mínimo es la más silenciosa,
no la más ruidosa; el dato dice lo contrario de lo que esa hipótesis predice.

**Lo que queda, y encaja con lo ya documentado:** 23 dB sobre el ruido no es una
señal atenuada, es el nivel de una **filtración**. Y esa filtración por la
entrada 1 ya está medida y escrita en
[`hallazgo-la-fuga-viaja-por-la-salida-del-general.md`](hallazgo-la-fuga-viaja-por-la-salida-del-general.md),
cuya acción pendiente —**«desenchufar el cable de la entrada 1 y repetir E0»**—
nunca se cerró. La lectura más simple es que ese cable quedó desenchufado, flojo
o mal asentado desde entonces, y que lo que se está midiendo no es el retorno
sino la fuga. Un piso de ruido alto en una entrada sin nada conectado es lo
esperable de una entrada flotando.

Comprobado y descartado del lado de la consola: `hwoutm.0.src = m.0` y
`hwoutm.1.src = m.1`, o sea que las salidas Master llevan la mezcla general. El
problema está del cable para acá.

**Queda para el usuario**, que es lo único que no se puede medir desde acá:
revisar que el cable de Master 1 esté firme en la entrada 1 de la Scarlett, de
los dos lados. Hasta entonces el 108 no puede correr, y **subir ganancia sería lo
peor que se puede hacer**: amplificaría la fuga y produciría una ley con aspecto
de medición.

## Trabajo previo

Se buscó, a pedido del usuario. Cuatro implementaciones de terceros hablan este
protocolo —[`fmalcher/soundcraft-ui`](https://github.com/fmalcher/soundcraft-ui),
[`Dennion/ioBroker.soundcraft`](https://github.com/Dennion/ioBroker.soundcraft),
[`ndikanov/ui24`](https://github.com/ndikanov/ui24),
[`NaturalDevCR/MyUiPro`](https://github.com/NaturalDevCR/MyUiPro)— y **ninguna
documenta la cadencia del `VU2` ni su dependencia del cambio**. Todas lo tratan
como un flujo que llega cuando llega, que es suficiente para mostrar un vúmetro
en pantalla y no para promediar una medición.

De un tutorial suelto —[blechtrottel.net](https://blechtrottel.net/en/jswebsockets.html)—
salió el dato de que la consola cierra la conexión sin `3:::ALIVE`. Se comprobó:
`Ui24rTransport` ya manda el latido. No era la causa, pero era la pregunta
correcta.

**Este hallazgo no tiene precedente publicado que se haya encontrado**, así que
hay que tratarlo con más cuidado, no con menos: está medido en una consola, un
firmware y un día.
