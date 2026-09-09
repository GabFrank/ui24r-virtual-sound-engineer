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

## Nota de archivo — 2026-09-09

Este spike tuvo durante un día dos archivos de evidencia que **no le corresponden**: `ley-ganancia-2026-09-09.txt` y `curva-ganancia-completa-2026-09-09.txt`. Miden la curva de ganancia del **previo de la consola**, que no responde ninguno de los tres criterios de acá —este spike pregunta cómo fijar un nivel repetible con el potenciómetro de la **interfaz de audio**—. Se movieron a `SPK-P0.2a/evidence/`, que es el spike de curvas.

Queda anotado en vez de borrado porque el error es instructivo: la evidencia estaba archivada, el spike parecía tener trabajo hecho, y **ninguno de sus criterios estaba medido**. Los tres siguen sin medir.

## Criterios## Criterios

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
