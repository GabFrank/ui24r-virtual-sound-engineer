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

### Una pregunta que queda abierta

Las bandas de 31, 63 y 125 Hz dieron **exactamente cero**, no «poco». El filtro
pasa-altos del canal está en `slope = 0` —apagado— y el ecualizador no está
puenteado pero tampoco corta ahí, así que no lo explica el canal.

Quedan dos candidatas sin separar: que la lluvia realmente no tenga energía
medible ahí a esta distancia, o que algo del camino la quite. **Separarlas
necesita una fuente de banda ancha con graves conocidos**, que es justo lo que
daría el ruido rosa desde el reproductor de la consola. No se resuelve con lo
que hay hoy y no se va a suponer.
