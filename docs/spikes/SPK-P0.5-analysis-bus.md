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

## Evidencia a entregar

- `evidence/bus-isolation.csv`, `evidence/tap-points.png`, `evidence/switch-timing.csv`.

## Acción ante fallo

Si el aislamiento no llega a −80 dBFS, el análisis por canal se marca con confianza limitada y se documenta el suelo real. Si la conmutación tarda demasiado, se reduce el número de canales del bus o se acepta el tiempo y se comunica en la interfaz.
