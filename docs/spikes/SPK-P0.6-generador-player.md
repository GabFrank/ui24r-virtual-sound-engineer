# SPK-P0.6' — Reproductor de la consola como generador

**Estado:** Pendiente · **Timebox:** 3 días · **Control:** G-B
**Depende de:** SPK-P0.2a · **Bloquea a:** SPK-P0.10b, SPK-CAL, S-05.10, S-07.4
**Montaje:** Ui24R, pendrive con la biblioteca de señales, sistema de amplificación a volumen bajo, interfaz de audio con la entrada 2 conectada al bus de análisis, tablet.

## Pregunta que responde

¿El reproductor interno sirve como generador seguro, y se puede garantizar que ningún audio de Android llega al sistema de amplificación?

Esta es la verificación central de ADR-002. Si falla, hay que reabrir la decisión del generador.

## Pasos

1. Preparar los archivos con el nivel de arranque, la rampa y el tope de la invariante INV-015, con suma de verificación.
2. Reproducir y medir el tiempo desde la orden hasta que hay audio, y desde la orden de detención hasta el silencio en la entrada 2.
3. Poner a menos infinito los envíos del reproductor a todos los auxiliares de monitores y verificarlo por lectura.
4. Silenciar el reproductor por protocolo, diez veces.
5. Prototipo de reserva: leer el estado completo del reproductor, modificarlo, restaurarlo y comparar hashes.
6. Con el reproductor sonando, disparar una notificación sonora en la tablet y medir qué aparece en la entrada 2.

## Criterios

| # | Criterio | Tipo | Umbral | Medido | Resultado |
|---|---|---|---|---|---|
| 1 | Detención hasta silencio en la entrada 2 | bloqueante | percentil 95 en 500 ms o menos | | ⬜ |
| 2 | Orden de reproducción hasta audio | informativo | percentiles 50 y 95 documentados | | ⬜ |
| 3 | Envíos del reproductor a monitores a menos infinito, verificado por lectura | bloqueante | todos | | ⬜ |
| 4 | Silencio del reproductor por protocolo | bloqueante | 10 de 10 | | ⬜ |
| 5 | Reserva y liberación con estado idéntico | bloqueante | hash idéntico | | ⬜ |
| 6 | Notificación de Android durante la reproducción | bloqueante | por debajo de −90 dBFS en la entrada 2 (INV-026) | | ⬜ |

## Evidencia a entregar

- `evidence/stop-latency.csv`, `evidence/player-reserve-hash.txt`, `evidence/android-notification.wav`.

## Acción ante fallo

Si la detención tarda más de medio segundo, hay que evaluar si el silencio del canal del reproductor es más rápido que la orden de detención y usar ese camino primero. Si el tiempo sigue siendo alto, entra como riesgo en el registro y el nivel del generador se reduce.
