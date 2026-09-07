# SPK-P0.4' — Captura dual prolongada durante reproducción

**Estado:** Pendiente · **Timebox:** 3 días · **Control:** G-C
**Depende de:** S-05.1b, S-05.10 · **Bloquea a:** G-C
**Montaje:** tablet certificada, interfaz, consola reproduciendo ruido rosa, bucle eléctrico para la referencia.

## Pregunta que responde

¿La captura dual aguanta una hora sin cortes ni deriva mientras la consola reproduce?

Sustituye al requisito original de captura y reproducción sincronizadas, que ADR-003 declaró sobredimensionado.

## Pasos

1. Reproducir ruido rosa desde el reproductor durante sesenta minutos.
2. Capturar las dos entradas todo ese tiempo.
3. Medir por correlación el desfase entre las dos entradas al minuto uno y al minuto sesenta.
4. Calcular la función de transferencia en bucle eléctrico en ambos momentos y compararlas.

## Criterios

| # | Criterio | Tipo | Umbral | Medido | Resultado |
|---|---|---|---|---|---|
| 1 | Cortes en una hora | bloqueante | 1 o menos | | ⬜ |
| 2 | Deriva entre entrada 1 y entrada 2 | bloqueante | 0 muestras. Comparten conversor: cualquier valor distinto de cero es un error del código | | ⬜ |
| 3 | Estabilidad de la función de transferencia entre el minuto 1 y el 60 | bloqueante | ±0,3 dB | | ⬜ |

## Evidencia a entregar

- `evidence/60min-capture.log`, `evidence/drift.csv`, `evidence/tf-stability.png`.
