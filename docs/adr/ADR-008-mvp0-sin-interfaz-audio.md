# ADR-008 — Primer entregable sin interfaz de audio

**Estado:** Aceptada
**Fecha:** 2026-09-07
**Origen:** Auditoría de producto B-02, B-03.

## Contexto

El primer entregable del plan exigía capturar el micrófono de medición, pero **ninguna de sus trece capacidades usaba esa captura**: el asistente de ganancia, por definición del propio plan, no usa el volumen de sala como criterio. Se arrastraba el micrófono, la alimentación fantasma, el cableado y su riesgo sin entregar nada a cambio.

Al mismo tiempo, la consola entrega por red medidores, ganancias, faders, silencios e instantáneas. Con eso solo ya se puede entregar: telemetría por canal, ajuste de ganancia por medidores, instantánea automática, registro de cambios, monitor durante el show y paro de emergencia.

## Decisión

Se define **MVP0 "Telemetría y ganancia"**: consola más tablet, sin interfaz de audio y **sin ninguna escritura**.

El MVP1 se redefine sin micrófono: consola, interfaz de audio y referencia eléctrica directa por la entrada 2. El micrófono entra con Room-Observe.

## Consecuencias

- Valida conectividad, matriz de capacidades, instantáneas y concurrencia **con riesgo acústico cero**.
- Entrega valor en unas nueve semanas, independientemente de que la tablet certifique o no, que es el mayor riesgo técnico del proyecto.
- Sus límites se documentan: sin FFT, sin ruido de fondo real, sin nada acústico.

## Alternativas descartadas

- **Empezar por el MVP1 del plan.** Exigía hardware sin entregar valor adicional.
