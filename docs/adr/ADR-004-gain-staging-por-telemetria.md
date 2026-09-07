# ADR-004 — Ajuste de ganancia por telemetría de la consola

**Estado:** Aceptada
**Fecha:** 2026-09-07
**Origen:** Auditoría técnica A-12, A-19, A-31; auditoría de producto B-03.

## Contexto

El plan medía la ganancia de entrada a través de la cadena de la interfaz externa. Esa cadena suma **dos ganancias analógicas que la aplicación no puede leer**: el envío auxiliar de la consola y el preamplificador de la interfaz, cuyo potenciómetro el usuario puede mover en cualquier momento y cuyo estado no es accesible por software desde Android.

En cambio, la consola entrega por red los medidores de cada canal antes del proceso, después del proceso y después del fader, más la ganancia actual del preamplificador. Es telemetría directa, sin intermediarios.

Además, la grabación multipista de la consola ocurre **después del preamplificador**. En modo soundcheck la ganancia analógica no afecta a la señal reproducida, así que ninguna recomendación de ganancia evaluada sobre una reproducción es válida.

## Decisión

El asistente de ganancia calcula pico, margen, probabilidad de saturación y estabilidad desde **el medidor previo al proceso más la ganancia leída de la consola**. La entrada 2 aporta espectro, ruido y relación señal-ruido, no nivel absoluto.

El orden es obligatorio: **ganancia primero, grabación después**. La ganancia del preamplificador queda congelada mientras exista una toma de soundcheck virtual o el modo soundcheck esté activo (INV-006).

## Consecuencias

- El primer entregable no necesita la interfaz de audio (ver ADR-008).
- Hay que calibrar el medidor: la relación entre su lectura y el nivel digital real es desconocida y se mide en un spike propio.
- Si el usuario cambia la ganancia después de grabar, la toma deja de representar el show. La aplicación lo impide.

## Alternativas descartadas

- **Medir nivel por la entrada 2.** Dos ganancias desconocidas en serie, una de ellas un potenciómetro físico.
