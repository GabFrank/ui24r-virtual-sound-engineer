# ADR-015 — Un solo canal espectral a la vez

**Estado:** Aceptada
**Fecha:** 2026-09-07
**Origen:** Auditoría técnica A-22.
**Nota:** esta decisión se retira si el spike de conexión USB directa (ADR-018) resulta aprobado y se adopta.

## Contexto

La interfaz de audio tiene dos entradas. La entrada 1 es el micrófono de medición. Queda **una sola entrada** para la referencia eléctrica, y un auxiliar estéreo enlazado ocuparía las dos.

En consecuencia, la prueba de banda completa "analizando canales individuales" no es posible en paralelo, y el monitor durante el show solo puede vigilar nivel por canal, no espectro.

## Decisión

Se documenta explícitamente la restricción: **un canal espectral a la vez**.

El análisis multicanal usa los medidores de la consola, que entregan los 24 canales antes del proceso, después del proceso y después del fader simultáneamente, pero solo nivel.

El espectro se reserva para el canal seleccionado o para el general. La interfaz lo explica al usuario en la prueba de banda completa, en lugar de prometer algo que no puede dar.

El análisis espectral por fuente, exacto, solo existe en la mezcla comparada A/B, donde se reproduce la misma toma varias veces.

## Consecuencias

- El indicador de enmascaramiento en vivo es un aproximado, marcado como observación con confianza media como máximo, no un análisis por fuente.
- Si la conexión USB directa a la consola funciona, esta restricción desaparece y la prueba de banda completa se simplifica.

## Alternativas descartadas

- **Prometer análisis por canal en vivo.** No hay entradas físicas para hacerlo.
