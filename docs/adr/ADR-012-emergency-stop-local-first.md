# ADR-012 — Paro de emergencia local primero

**Estado:** Aceptada
**Fecha:** 2026-09-07
**Origen:** Auditoría técnica A-26; auditoría de producto B-17.

## Contexto

El paro de emergencia del plan tenía seis acciones: detener el generador, cancelar la automatización, bloquear escrituras, cerrar el retorno de análisis, conservar la conexión y permitir el retroceso.

Dos problemas. "Bloquear escrituras" y "permitir retroceso" se contradicen, porque un retroceso es una escritura. Y dos de las seis acciones **requieren red**, justo en el estado en que más falta hacen. Tampoco estaba definido cómo se sale del paro.

## Decisión

El paro de emergencia es **local primero**:

- **Acciones locales garantizadas en 200 ms o menos, sin red**: detener el generador local, cancelar la automatización, vaciar y bloquear la cola de escrituras salvo lista blanca.
- **Lista blanca durante el bloqueo**: detención del reproductor, detención de la grabación multipista, silencio del reproductor, retroceso, y restauración de las reservas y silencios de sistema.
- **Acciones remotas con confirmación y tres reintentos**. Sin confirmación en dos segundos, alerta visual y sonora persistente.
- **No silencia el general ni los canales.** Un paro de emergencia que apaga el show no se usa nunca.
- **Rearme explícito**, con relectura completa del estado y confirmación.
- Botón de 64 píxeles o más, **visible en el cien por ciento de pantallas y diálogos**, verificado por un test de interfaz que recorre todas las rutas.

## Consecuencias

- La aplicación siempre puede detener lo que ella misma generó, incluso sin red.
- Los estados seguros de la consola se dejan por construcción al terminar cada operación, para no depender de una escritura de emergencia.

## Alternativas descartadas

- **Paro que silencia el general.** Apagar un show entero es peor que el problema que resuelve.
