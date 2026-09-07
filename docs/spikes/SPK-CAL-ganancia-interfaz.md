# SPK-CAL — Calibración de ganancia de la interfaz de audio

**Estado:** Pendiente · **Timebox:** 1 día · **Control:** G-B
**Depende de:** SPK-P0.5, SPK-P0.6', SPK-P0.3 · **Bloquea a:** S-05.8, S-06.2
**Montaje:** consola, interfaz con la entrada 2 en modo línea conectada al bus de análisis, tablet.

## Pregunta que responde

¿Se puede fijar un nivel de referencia repetible en la entrada 2, sabiendo que el potenciómetro de la interfaz no es legible por software?

Sin esto, ninguna medición es comparable entre sesiones.

## Pasos

1. Poner la ganancia de la entrada 2 en su **mínimo físico**, que es una posición repetible, con la entrada en modo línea.
2. Reproducir un tono de −20 dBFS desde el reproductor por el bus de análisis.
3. Ajustar el nivel fino con el **fader del bus de análisis**, que sí es controlable por software, hasta que la entrada 2 lea −20 dBFS.
4. Repetir el procedimiento completo en diez sesiones distintas, apagando y encendiendo entre una y otra.

## Criterios

| # | Criterio | Tipo | Umbral | Medido | Resultado |
|---|---|---|---|---|---|
| 1 | Procedimiento documentado y repetible | bloqueante | sí | | ⬜ |
| 2 | Dispersión entre diez sesiones sin tocar la interfaz | bloqueante | desviación típica de 0,2 dB o menos | | ⬜ |
| 3 | El ajuste fino por el fader del bus cae dentro del rango disponible | bloqueante | sí | | ⬜ |

## Nota sobre el método

Pedirle al usuario que gire un potenciómetro hasta medio decibel es frágil y hay que repetirlo en cada sesión. Fijar el potenciómetro en un tope físico y ajustar por software es repetible y no depende del pulso de nadie.

La detección de que alguien movió el potenciómetro, que es la invariante INV-027, se prueba en la historia del asistente de calibración, no aquí, porque requiere la aplicación.

## Evidencia a entregar

- `evidence/cal-sessions.csv` con las diez sesiones.
