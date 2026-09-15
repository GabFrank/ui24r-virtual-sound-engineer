# SPK-P0.5 — Bus de análisis

**Estado:** Pendiente · **Timebox:** 3 días · **Control:** G-B
**Depende de:** SPK-P0.2a · **Bloquea a:** SPK-CAL, S-06.1a, S-06.3
**Montaje:** Ui24R, un auxiliar libre, interfaz de audio o una entrada libre en modo línea, generador de tono.

## Pregunta que responde

¿Se puede aislar un solo canal en un bus auxiliar, con qué nivel, con qué aislamiento y en cuánto tiempo se conmuta de canal?

## Pasos

1. Poner el canal elegido a cero decibeles en el bus y el resto a menos infinito.
2. Medir el nivel resultante y compararlo con el esperado.
3. Con un tono en un canal no seleccionado, medir su presencia en el bin correspondiente del análisis.
4. Aplicar una ecualización extrema al canal y verificar que los puntos de derivación antes y después del proceso se distinguen en el espectro.
5. Comprobar si la marca de protección ante recuperación de instantánea protege el bus.
6. Con un canal enlazado en estéreo, poner uno a cero y observar el vecino.
7. Medir el tiempo real de conmutar de canal, con el ritmo de escritura de 20 ms de las transacciones de sistema.

## Criterios

| # | Criterio | Tipo | Umbral | Medido | Resultado |
|---|---|---|---|---|---|
| 1 | Nivel medido frente al esperado, tras calibración | bloqueante | ±0,5 dB | | ⬜ |
| 2 | Aislamiento, medido en el bin del tono con ventana de 32768 y Hann, con tono a −6 dBFS en un canal no seleccionado | bloqueante | por debajo de −80 dBFS | | ⬜ |
| 3 | Puntos de derivación antes y después del proceso distinguibles | bloqueante | diferencia visible con ecualización extrema | | ⬜ |
| 4 | La marca de protección ante recuperación protege el bus | informativo | sí o no | | ⬜ |
| 5 | Comportamiento del enlace estéreo sobre los envíos | bloqueante | documentado | | ⬜ |
| 6 | Tiempo de conmutación de canal | bloqueante | medido; es el número que adopta la historia del gestor del bus | | ⬜ |

## Resultado colateral — 2026-09-09: la consola ya tiene un analizador

**Ninguno de los seis criterios de arriba está medido todavía.** Lo que sí apareció, midiendo otra cosa, es que la pregunta de fondo de este spike —*ver el espectro de un canal*— tiene una segunda respuesta que no necesita el bus auxiliar.

El flujo `RTA`, que el proyecto usaba como latido y tiraba a la basura, es el **analizador de espectro de la consola**: 122 bandas de un doceavo de octava, de ~20,9 Hz a ~22,6 kHz, a 0,375 dB por byte, a unas 30 tramas por segundo. Sube al instante y cae 20 dB en ~300 ms. La fuente se elige con `var.rta`, que acepta `i.N` y `m`. Está en `docs/protocol-spec.md` §4.5 y en `evidence/rta-es-espectro-2026-09-09.txt`.

**Qué cambia para este spike.** El camino del bus auxiliar existía porque se daba por hecho que no había forma de ver un canal aislado. Ahora hay dos caminos, y no son equivalentes:

| | Analizador de la consola (`RTA`) | Bus auxiliar (este spike) |
|---|---|---|
| Cuesta cableado | no | sí, ocupa un auxiliar |
| Se nota en la consola | **sí, `var.rta` es global** | no |
| Canales a la vez | uno | uno |
| Resolución | 1/12 de octava, fija | la que se elija al analizar |
| Punto de derivación | el que la consola use, sin elegir | elegible (antes o después del proceso) |

O sea que el analizador de la consola es más barato y menos flexible, y tiene un costo que el bus auxiliar no tiene: **le cambia la pantalla al operador** (R-28, ADR-025).

**Este spike no se cierra ni se descarta.** Sus criterios 3 y 6 —distinguir los puntos de derivación, y cuánto tarda conmutar de canal— siguen sin respuesta por el camino del `RTA`: la consola no dice de dónde saca su espectro, y no está medido cuánto tarda en asentarse después de cambiar `var.rta`. Lo que sí corresponde es revisar la prioridad: si el analizador de la consola alcanza para la detección de realimentación, el bus auxiliar deja de ser bloqueante y pasa a ser la opción precisa para cuando haga falta elegir el punto de derivación.

## Evidencia a entregar

- `evidence/bus-isolation.csv`, `evidence/tap-points.png`, `evidence/switch-timing.csv`.

## Acción ante fallo

Si el aislamiento no llega a −80 dBFS, el análisis por canal se marca con confianza limitada y se documenta el suelo real. Si la conmutación tarda demasiado, se reduce el número de canales del bus o se acepta el tiempo y se comunica en la interfaz.

## Evidencia archivada

Todo lo que esta carpeta guarda, con qué es cada cosa. Un archivo que nadie
cita es una medición que nadie va a encontrar cuando la necesite.

- `evidence/realimentacion-2026-09-09.txt` — el detector de realimentación contra el espectro real
- `evidence/rta-no-es-espectro-2026-09-09.txt` — **conclusión retractada** el mismo día: decía que el `RTA` no traía espectro. Se conserva porque el error es instructivo
- `evidence/var-rta-2026-09-09.txt` — qué hay en `var.rta` antes de tocarlo
- `evidence/rta-general-2026-09-09.txt` — la ley de bandas mirando el general: son las mismas 122 y la misma ley, contra una nota anterior que decía 78
- `evidence/espectro-en-la-tablet-2026-09-09.txt` — el espectro y el aviso funcionando contra la consola: detectó 1 kHz sostenida y acotó el canal, y devolvió el analizador al salir

## El analizador sobre un micrófono real — 2026-09-10

Hasta hoy el `RTA` solo se había mirado con **tonos por línea**: señales de una
sola frecuencia, generadas y entradas por la Scarlett. Con un Behringer B2 en el
canal 9 y lluvia afuera —ruido de banda ancha, estacionario y gratis— se pudo
mirar con una fuente acústica de verdad, y sin armar ningún lazo: el canal está
en silencio, y tanto su medidor de entrada como el analizador son anteriores.

Evidencia: `evidence/espectro-microfono-2026-09-10.txt`, y el encendido del
fantasma en `evidence/fantasma-canal9-2026-09-10.txt`.

746 tramas, todas con contenido. **75 de las 122 bandas con energía**, pico en
2 kHz a 21 dB, con la forma que uno esperaría de lluvia: nada abajo, el grueso
entre 250 Hz y 8 kHz.

**Y el vigilante de realimentación no dio un solo aviso.** Es la prueba contra
falsos positivos que nunca se había hecho con una fuente real: el ruido sube
todas las bandas a la vez, y una realimentación es una sola que no baja.

### ¿El analizador se puede apuntar a un auxiliar? — NO CONCLUYE, 2026-09-10

**Por qué importa, y no es curiosidad.** El analizador se sabe apuntar a un canal
—`i.N`— y al general —`m`—. Pero la consola tiene 10 auxiliares, 6 subgrupos y 4
efectos, y **un auxiliar es un envío de monitor**: es donde más acopla en vivo,
porque el parlante apunta al cantante y el micrófono del cantante apunta al
parlante. Un detector que solo mira el general está mirando donde el acople **se
escucha**, no donde nace.

**Dos intentos, ninguna conclusión, y cada uno falló por algo distinto.** Se
anotan los dos porque el modo de fallo es lo único que este spike produjo, y
sirve para que el tercero no lo repita.

**Primer intento** —`evidence/rta-sobre-buses-2026-09-10.txt`—: se bajó el
general a cero para no sacar nada por el monitor, y con eso **el control conocido
también quedó sin señal**. Un experimento cuyo control falla no distingue «este
bus no sirve de fuente» de «a este bus no le llegó nada». No concluye.

**Segundo intento** —`evidence/rta-sobre-buses-b-2026-09-10.txt`—: se dejó el
general arriba y se agregó el control que faltaba, el **medidor del bus** leído
de la cola de `VU2`, que dice si al bus le llegó señal con independencia del
analizador. Eso sirvió y mostró dos cosas:

- **Al auxiliar no le llegó el tono**: −67 dB en su medidor, con el envío del
  canal puesto en 0,8. El ruteo de un envío auxiliar necesita más de lo que se
  hizo, y hasta saber qué, la pregunta sobre el auxiliar no se puede ni plantear.
- **El general sí llevaba el tono —−21,7 dB en su medidor— y el analizador leyó
  0,4.** Eso parecía contradecir lo ya medido el 2026-09-09, que el general sirve
  de fuente. No lo contradice: **el guion cambiaba `var.rta` cinco veces seguidas
  con 2,5 s entre medio**, y la medición del 09 apuntó a una sola fuente y
  esperó. No es que el general no sirva; es que no se le dio tiempo.

**Lo que hay que hacer distinto la próxima vez**: una fuente por corrida con su
espera, comprobar el ruteo con el medidor del bus **antes** de preguntarle al
analizador, y no bajar el control para proteger el monitor —para eso está bajar
el auxiliar, no el general—.

### La respuesta de la cadena entera, con ruido rosa — 2026-09-10

**La primera curva completa**, y la materia prima de cualquier calibración. Se
generó ruido rosa por Voss-McCartney, se reprodujo por el monitor y se midió el
espectro en **las dos puntas**: el canal donde entra —sin acústica en el medio— y
el micrófono después del aire. `evidence/ruido-rosa-por-el-aire-2026-09-10.txt`.

| | Resultado |
|---|---|
| El ruido **tal como entra** | plano dentro de 6 dB: de 25 a 31 dB en todo el recorrido. El generador sirve |
| Por el aire, **hasta 125 Hz** | **cero absoluto** |
| De 177 a 354 Hz | sube de golpe: 2,6 → 9,3 → 15,2 |
| De 354 Hz a 5,7 kHz | parejo entre 13 y 21 dB |
| Pico en 8 kHz | 22,7 dB |
| Arriba de 11 kHz | cae: 17,7 → 8,7 → 2,6 |

**Un Rokit 8 llega a unos 35 Hz**, así que ese corte alrededor de 150 Hz **no es
el límite del monitor**: es un pasa-altos, y el candidato sigue siendo el
conmutador de corte de graves del propio B2.

**Por qué esto no contradice la medición con tonos**, donde 63 Hz sí aparecía a
13,6 dB: un tono concentra toda su energía en **una banda**, y el ruido rosa la
reparte entre las 122. En los graves, donde además la cadena atenúa, la energía
por banda del ruido cae por debajo del piso del analizador. Las dos mediciones
dicen lo mismo con distinta sensibilidad, y la del tono es la que llega más abajo.

**Y qué es esta curva, exactamente.** Es la respuesta de **toda la cadena**
—Scarlett, canal, general, Rockit, sala, B2, previo— y **no la del micrófono**.
Sin una referencia plana en algún punto no se pueden separar. Sirve para
repetibilidad y para comparar micrófonos entre sí; no para verdad absoluta. Esa
distinción tiene que sobrevivir a cualquier función de calibración que se
construya encima.

### La ley del analizador es la misma en todas las bandas — 2026-09-10

**El agujero que cierra.** `RTA_DB_POR_BYTE = 0,375` se estableció con tonos a
1 kHz y **nunca se comprobó en otra frecuencia**. Todo el detector de
realimentación supone que un byte vale lo mismo abajo que arriba: compara una
banda contra sus vecinas y contra su propio pasado, así que si el analizador
pesara distinto los graves, el umbral de 9 dB sobre la vecindad significaría una
cosa a 200 Hz y otra a 5 kHz.

**Por qué esto se puede contestar y la medición acústica no.** Un tono por el
aire pasa por el parlante, la sala y el micrófono, y ninguno de los tres es
plano: la caída no se puede repartir. Pero el analizador se puede apuntar a un
**canal**, y ahí no hay acústica en el medio. El tono entra por la Scarlett
siempre al mismo nivel eléctrico, así que **cualquier diferencia entre bandas es
del analizador**. Con el supresor apagado, claro.

| Tono | Nivel eléctrico | El analizador lee | Desvío neto contra 1 kHz |
|---|---|---|---|
| 63 Hz | −21,7 dB | 58,0 dB | **−2,1 dB** |
| 125 Hz | −21,7 dB | 60,2 dB | +0,2 dB |
| 250 Hz | −21,7 dB | 60,3 dB | +0,2 dB |
| 500 Hz | −21,7 dB | 60,4 dB | +0,3 dB |
| 1 kHz | −21,3 dB | 60,4 dB | — |
| 2 kHz | −21,7 dB | 60,4 dB | +0,3 dB |
| 4 kHz | −21,7 dB | 60,1 dB | +0,0 dB |
| 8 kHz | −22,0 dB | 59,5 dB | −0,2 dB |

**Pesa parejo.** De 125 Hz a 8 kHz el desvío neto —descontando lo que ya venía
distinto en el nivel eléctrico— no pasa de 0,3 dB. Solo a **63 Hz** hay unos
−2 dB, que es poco y en el extremo del recorrido.

**Qué habilita.** Que los umbrales del detector de realimentación signifiquen lo
mismo en todo el espectro, que es lo que se venía suponiendo sin comprobar.

**Y qué descarta, retroactivamente.** La caída de graves de la medición acústica
**no era del analizador**: acá el mismo tono de 63 Hz por vía eléctrica se lee
2 dB abajo, no veinte. Lo que se pierda por el aire se pierde en el aire.

`evidence/ley-rta-por-frecuencia-2026-09-10.txt`.

### El supresor de la consola nos estaba midiendo a nosotros — 2026-09-10

**Es el hallazgo más importante de esta sesión de medición, y llegó destruyendo
una conclusión propia.**

`var.afsdata` publica la pila de filtros del supresor de realimentación en **dos
pilas separadas** —los automáticos y los fijos—. De cada registro se leyeron con
confianza **los dos primeros campos**: frecuencia en Hz y profundidad en dB. Hay
un campo que parece un nivel detectado, pero no se verificó. Comparando volcados de antes y después de una tanda de
tonos:

```
                 automáticos                           fijos
antes:   1000 Hz(−18)                            200 Hz(−6)  1000 Hz(−18)
después: 1000  500  250  125  63  40  (−18 c/u)  200 Hz(−6)  1000 Hz(−18)
```

**El supresor escuchó los tonos de prueba, los tomó por realimentación y le puso
un notch de −18 dB a cada uno.** Y tiene razón desde su punto de vista: un tono
sostenido es, para un supresor, indistinguible de un acople.

**Qué invalida.** Toda la tabla de graves de más abajo: la consola iba notcheando
cada tono *mientras se reproducía*. En cada tanda el de 1 kHz es el **primer**
tono, así que la primera tanda lo midió antes de que existiera su propio notch y
la segunda ya salió por él —de ahí que ese número se moviera tanto—.

> **Acá se había escrito algo más fuerte y no se sostiene.** Decía que ya había
> un filtro de 1000 Hz «antes de empezar» y que por eso el pico no cayó en la
> banda 67. En las **tres** corridas archivadas el pico de 1 kHz cae en la banda
> 67, y el filtro previo no está en ningún volcado archivado: los dos datos
> venían de corridas que no se guardaron. La explicación que sí se sostiene es la
> de arriba, y no necesita postular nada.

**Qué sobrevive.** Que de 250 Hz a 1 kHz el tono aparece en la banda que predice
la ley medida. Eso es una comprobación de *dónde* cae la energía y no de cuánta,
así que un notch no la afecta.

**Qué obliga.** Cualquier medición acústica por el general de esta consola tiene
que hacerse **con el supresor apagado**, y volver a encenderlo al terminar. Sin
eso, el instrumento se defiende de la medición.

**Y qué regala.** El asistente de realimentación puede leer `var.afsdata` y saber
qué frecuencias la consola ya mató. Avisar de una que la consola resolvió es
ruido; y que la consola esté peleando es, en sí, información que hoy tiramos.

Los cinco filtros agregados se borraron con `m.afs.clearlive`, que limpia la pila
de automáticos y **no toca la de fijos**. `evidence/limpiar-afs-2026-09-10.txt`.

**Y los fijos no se pudieron borrar por protocolo, aunque el usuario autorizó
hacerlo.** Cuatro intentos archivados —`clearfixed` y `clearall`, cada uno con el
supresor encendido y apagado, devolviendo el disparador a 0 entre medio—: la pila
de fijos no se movió en ninguno. `evidence/borrar-fijos-2026-09-10.txt`, que
además relee por HTTP después de cada intento y deja constancia del estado final.

> **Esto ya se había contestado antes, y la respuesta no era verificable.** La
> primera prueba corrió en un guion de diagnóstico que después se borró, y lo que
> quedó archivado —`evidence/limpiar-afs-todo-2026-09-10.txt`— **no distingue
> nada**: su encabezado dice el mismo comando que el archivo anterior, así que de
> él solo se puede leer «una pila que no cambió», no qué se le mandó. La medición
> era real y no quedaba en ningún lado. Es el mismo error que este
> proyecto lleva todo el día encontrando, cometido **justo después de construir
> el mecanismo que existe para impedirlo**. Lo encontró una auditoría.

**Y de quién es cada filtro fijo, que estaba mal atribuido.** El volcado
archivado del 2026-09-08 —`SPK-P0.1/evidence/volcado-inicial.txt`— tiene en la
pila de fijos **uno solo: 199,98 Hz a −6 dB**. El de **1000 Hz a −18 dB no estaba
ahí**, y −18 dB es exactamente lo que la consola le planta a un tono sostenido,
que es lo que se estuvo haciendo ese día. Lo más probable es que sea **nuestro**,
de la primera sesión de mediciones, y no del usuario afinando la sala.

O sea que llevamos plantando filtros en esta consola desde el 2026-09-08 sin
darnos cuenta.

**Cómo se destapó**, porque el camino importa: se repitió la tanda de tonos
esperando ver mejorar los graves y **empeoró todo, incluido 1 kHz**, que no tenía
por qué moverse. Esa asimetría fue lo que hizo mirar el supresor en vez de
seguir culpando al equipo: **1 kHz pasó de 28,9 a 13,8 dB**, mientras 500 pasaba
de 30,7 a 26,1 y 250 de 28,4 a 23,6. El de 1 kHz se movió mucho más que los
otros dos, y no tenía por qué moverse en absoluto.
`evidence/tono-por-el-aire-2026-09-10b.txt`. En la misma tanda se remidió el
fondo y estaba plano en ~0 dB: había parado de llover, lo que confundía todavía
más la lectura hasta separar las dos cosas.
`evidence/espectro-microfono-2026-09-10b.txt`.

### La medición buena: con el supresor apagado — 2026-09-10

Rehecha con `m.afs.enabled = 0` mientras duraba, y devuelto a 1 al terminar.
`evidence/tono-por-el-aire-sin-afs-2026-09-10.txt`.

| Tono | Entra al canal 10 | Con supresor | **Sin supresor** |
|---|---|---|---|
| 1 kHz | −21,7 dB | 28,9 dB | **37,1 dB** |
| 500 Hz | −21,7 dB | 30,7 dB | **45,4 dB** |
| 250 Hz | −21,7 dB | 28,4 dB | **42,2 dB** |
| 125 Hz | −21,7 dB | 5,8 dB | **18,1 dB** |
| 63 Hz | −21,7 dB | 0,1 dB | **13,6 dB** |
| 40 Hz | −21,3 dB | 0,0 dB | 0,0 dB |

**Los 63 Hz sí llegan.** Pasaron de 0,1 a 13,6 dB con solo apagar el supresor, y
**cinco de los seis tonos** —de 63 Hz a 1 kHz— son ahora el pico de su propio
espectro en la banda que predice la ley. El de 40 Hz sigue sin aparecer.
La conclusión de «los graves no llegan» era **casi toda el supresor**, no el
equipo.

**Lo que queda de verdad**, ya sin contaminación: hay una caída real por debajo
de 250 Hz —42,2 a 18,1 a 13,6— y a 40 Hz no llega nada. Eso sí puede ser el
límite del Rockit, el corte del B2 o la sala, y sigue sin separarse. Pero es una
caída mucho más suave y más creíble que la que se había medido.

**Y la lección de método**: la primera tabla no estaba mal medida, estaba medida
**a través de un instrumento que reaccionaba a la medición**. Ningún cuidado en
el arnés lo habría evitado; lo que lo destapó fue que un número se moviera cuando
no tenía por qué —el de 1 kHz— y no darlo por ruido.

### La primera medición, contaminada — se deja como registro

> **Todo lo que sigue salió con el supresor puesto y está corregido arriba.** Se
> deja porque el método vale y porque la contaminación misma fue el hallazgo.

Se mandaron tonos conocidos por el aire: PC → Scarlett → canal 10 → general →
Rockit → **aire** → B2 → canal 9 → analizador, con el canal del micrófono en
silencio para que no hubiera lazo. Y se midió a la vez el nivel **eléctrico** que
entraba al canal del tono, que es lo que parte la pregunta en dos.
`evidence/tono-por-el-aire-2026-09-10.txt`.

| Tono | Entra al canal 10 | Lo ve el micrófono |
|---|---|---|
| 1 kHz | −21,7 dB | **28,9 dB** y es el pico |
| 500 Hz | −21,7 dB | **30,7 dB** y es el pico |
| 250 Hz | −21,7 dB | **28,4 dB** y es el pico |
| 125 Hz | −21,7 dB | 5,8 dB |
| 63 Hz | −21,7 dB | 0,1 dB |
| 40 Hz | −21,7 dB | 0,0 dB |

**El nivel eléctrico es idéntico en las seis, incluidos 40 Hz.** O sea que el
tono llega a la consola igual de fuerte siempre: no es la Scarlett, ni el cable,
ni el archivo. **La pérdida es enteramente acústica**, y es brutal: 23 dB entre
250 y 125 Hz, y nada por debajo.

Y no es de la consola: el ecualizador del general está **plano** —todas sus
bandas en 0,5— y sin puentear.

**Dónde sí, y acá hay que ser honesto con lo que se sabe y lo que no.** Con la
consola y el camino eléctrico descartados quedaba «del monitor para adelante», y
se llegó a escribir que era el Rockit. **Esa conclusión no se sostiene**, porque
la eliminación tenía un agujero: **el micrófono también es un aparato con filtro
propio**. El Behringer B-2 trae un conmutador de corte de graves en su cuerpo, y
si está puesto explica parte de esto. Lo señaló el usuario.

Quedan entonces dos candidatos, y **no se van a suponer**:

- El **corte de graves del propio B2**. Se distingue por el símbolo: línea
  horizontal recta es respuesta plana; línea que sube hacia la derecha es el
  filtro puesto.
- El **ajuste de graves del Rockit**, que esos monitores traen en el panel
  trasero junto con modos de sala.

**Y ninguno de los dos explica la magnitud por sí solo**, que es la parte que
todavía no cierra: los cortes de graves de micrófono suelen ser de 6 dB por
octava, y acá hay **unos 23 dB en una sola octava**. Cuatro veces más
pronunciado. Así que o hay dos filtros sumándose, o hay un tercer factor que no
se identificó —el propio `RTA` podría pesar distinto las bandas graves, y eso
nunca se midió: la ley de 0,375 dB por byte se estableció a 1 kHz—.

La forma de cerrarlo es barata y no necesita razonar: **se mueve el conmutador
del micrófono y se vuelve a correr esta misma tabla**. La comparación
antes/después dice cuánto era el micrófono y cuánto queda por explicar.

> **La lección no es sobre graves.** El razonamiento fue «no es A, no es B,
> entonces es C», y estaba mal porque la cadena tenía un eslabón más que el
> razonamiento. Una eliminación solo vale si la lista está completa, y la lista
> de una cadena de audio incluye **cada aparato que la toca**, no solo los que
> uno estaba mirando.

**Lo que sí queda establecido**: la cadena acústica completa funciona y el `RTA`
la sigue —de 250 Hz a 1 kHz el tono aparece exactamente en su banda y es el pico
del espectro— y la anomalía tiene un lugar concreto donde buscarla en vez de ser
un misterio repartido.

### La pregunta original — RESUELTA, se deja el rastro

> **Contestada el mismo día**: con el supresor apagado la cadena entrega 63 y
> 125 Hz con claridad, así que el cero de la lluvia era de la lluvia y no de un
> corte del camino. Lo que sigue es cómo se planteó, y las tres afirmaciones que
> hace sobre el estado de la consola —el pasa-altos en `slope = 0`, el
> ecualizador del canal, el del general en 0,5— **se leyeron de volcados que no
> se archivaron**.

Las bandas de 31, 63 y 125 Hz dieron **exactamente cero**, no «poco». El filtro
pasa-altos del canal está en `slope = 0` —apagado— y el ecualizador no está
puenteado pero tampoco corta ahí, así que no lo explica el canal.

Quedan dos candidatas sin separar: que la lluvia realmente no tenga energía
medible ahí a esta distancia, o que algo del camino la quite. **Separarlas
necesita una fuente de banda ancha con graves conocidos**, que es justo lo que
daría el ruido rosa desde el reproductor de la consola. No se resuelve con lo
que hay hoy y no se va a suponer.


---

## La primera realimentación de verdad — 2026-09-11

Los tres umbrales del detector estaban marcados como **«elegidos, no medidos»** y
**«sin validar contra una realimentación real»** desde el primer día. Ahora hay
una, provocada a propósito con el usuario en la sala y la mano en el monitor.

### El montaje, y por qué los dos intentos anteriores no llegaron

Condensador B2 en el puerto 9, Rokit 8 como general a 1,7 m, uno frente al otro.
Dos intentos previos subieron el **fader** del canal y no pasó nada: 24 dB de
recorrido con el espectro quieto. El fader no puede crear señal que no llegó —
el previo estaba en 0,25 y el micrófono entregaba demasiado poco. **La variable
era la ganancia del previo.**

Y algo más importante: las dos corridas anteriores se hicieron con un **receptor
Bluetooth enchufado a las entradas RCA, abiertas a 0 dB**, metiendo un tono en el
general de forma continua. Lo encontró el oído del usuario. Ésta es la primera
medición de espectro del proyecto con el fondo limpio: **0,00 dB en las 122
bandas**, con control positivo que confirma que el analizador ve.

### Lo medido

| Previo | Banda más alta | Nivel | Exceso sobre vecinas |
|---|---|---|---|
| 25,9 dB | 43 (~250 Hz) | 1,9 | 1,9 |
| 28,9 dB | 40 (~210 Hz) | 5,3 | 5,2 |
| 31,9 dB | 56 (~530 Hz) | 12,8 | **8,2** ← último estable |
| 33,9 dB | 105 (~**8980 Hz**) | **55,9** | **19,4** ← arrancó |

**Dos decibeles de ganancia produjeron 43 de nivel.** Eso no es un aumento: es
una fuga. Y arrancó en **~9 kHz**, no en los graves. El usuario lo escuchó y lo
confirmó: *«sonó exactamente así»*. Evidencia: `evidence/lazo-por-el-previo-2026-09-11.txt`

### Qué le dice a cada umbral

**`MARGEN_SOBRE_VECINAS_DB = 9` cae entre los dos valores, y eso lo salva — pero
por poco.** El último paso estable ya daba **8,2 dB**; la fuga, 19,4. El umbral
está a **0,8 dB** de dispararse sobre una sala que no tiene nada. Una sala un
poco más resonante lo cruza sin que pase nada, y ahí vuelve el cartel que no se
apaga.

**`PISO_UTIL_DB = 12` deja afuera el arranque.** El último paso estable estaba en
12,8 dB de nivel: apenas por encima del piso. O sea que el detector recién
empieza a mirar cuando el fenómeno ya está encima, y el margen para avisar antes
es de un solo paso de ganancia.

**Lo que sí separa limpio es el crecimiento**, que es lo que la regla «no cayó
como debía» ya intenta capturar: entre estable y fuga hay **43 dB de salto con
2 dB de causa**. Ninguna resonancia hace eso.

### Lo que esta medición NO autoriza a decir

Es **una sala, un micrófono, una posición y una corrida**. No es una ley: es el
primer punto de una curva que no existe. Una sala con más absorción, o un
micrófono con otra directividad, va a realimentar en otra frecuencia y con otros
márgenes.

Y **el supresor de la consola estaba encendido** durante toda la corrida, así
que pudo haber puesto filtros mientras el lazo crecía. No se comparó `var.afsdata`
antes y después: fallo de método de esta corrida, anotado.

Para mover los umbrales con fundamento hacen falta más salas. Lo que esta corrida
sí cambia es que **ya no hay que elegirlos a ciegas**.
