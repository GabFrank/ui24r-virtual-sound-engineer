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

### El supresor de la consola nos estaba midiendo a nosotros — 2026-09-10

**Es el hallazgo más importante de esta sesión de medición, y llegó destruyendo
una conclusión propia.**

`var.afsdata` publica la pila de filtros del supresor de realimentación:
frecuencia, profundidad y nivel detectado, en **dos pilas separadas** —los
automáticos y los fijos—. Comparando volcados de antes y después de una tanda de
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
cada tono *mientras se reproducía*. Y peor —**ya había un filtro de 1000 Hz a
−18 dB antes de empezar**, así que la primera medición de 1 kHz salió por un
notch. Eso explica una rareza que se vio y se dejó pasar: el pico no cayó en la
banda 67. **Se dejó pasar una anomalía que era la punta de esto.**

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

**Y los fijos no se pudieron borrar por protocolo, aunque se pidió.** Se probó
`clearfixed` y `clearall`, con el supresor encendido y apagado, en 1 y de vuelta
en 0: la cuenta no se movió nunca. `evidence/limpiar-afs-todo-2026-09-10.txt`.
Quedan los dos que ya estaban —200 Hz a −6 dB y 1000 Hz a −18— y hay que sacarlos
desde la pantalla de la consola. Lo más plausible es que pidan una confirmación,
que es razonable: un fijo lo colocó alguien afinando la sala.

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
cada tono es ahora el pico de su propio espectro en la banda que predice la ley.
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

### La pregunta original, tal como se planteó

Las bandas de 31, 63 y 125 Hz dieron **exactamente cero**, no «poco». El filtro
pasa-altos del canal está en `slope = 0` —apagado— y el ecualizador no está
puenteado pero tampoco corta ahí, así que no lo explica el canal.

Quedan dos candidatas sin separar: que la lluvia realmente no tenga energía
medible ahí a esta distancia, o que algo del camino la quite. **Separarlas
necesita una fuente de banda ancha con graves conocidos**, que es justo lo que
daría el ruido rosa desde el reproductor de la consola. No se resuelve con lo
que hay hoy y no se va a suponer.
