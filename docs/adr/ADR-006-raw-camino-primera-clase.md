# ADR-006 — La ruta cruda es camino de primera clase

**Estado:** Aceptada
**Fecha:** 2026-09-07
**Origen:** Auditoría técnica A-03, A-04.

## Contexto

La biblioteca comunitaria expone con interfaz tipada: fader, silencio, panorama, ganancia, alimentación fantasma, envíos auxiliares con sus puntos de derivación, matriz, retardos de salida, instantáneas, medidores, reproductor y grabador multipista con modo soundcheck.

**No expone con interfaz tipada**: filtro pasa altos, ecualizador paramétrico, compresor, puerta de ruido, deesser, ecualización de salida, supresión de realimentación ni inversión de polaridad. Las claves existen en el modelo de estado, pero **el escalado de los valores es desconocido**: todo lo que la biblioteca convierte usa rangos de 0 a 1 con funciones de mapeo no triviales.

Es decir: todo el asistente de canal y toda la ecualización de sistema dependen de la ruta cruda.

## Decisión

La ruta cruda es **camino de primera clase** del adaptador, no un recurso de último momento.

Toda escritura cruda pasa por una tabla de mapeo con: ruta, rango crudo, unidad física, función de conversión en ambos sentidos, y test de ida y vuelta. **Ningún valor sin entrada en la tabla se envía**, y ningún valor fuera del rango físico se envía.

La versión de la biblioteca y el firmware de la consola forman parte de la matriz de capacidades. Firmware distinto al certificado deshabilita toda escritura cruda (INV-033).

## Consecuencias

- Dos spikes dedicados a construir la tabla, uno para procesamiento de canal y otro para salidas, capturando el tráfico de la propia interfaz web de la consola.
- Si un spike falla, las recomendaciones se emiten con valor absoluto sugerido y sin valor actual ni delta, para aplicar a mano. No bloquea el primer nivel de aplicación asistida, que usa solo ganancia y fader, ambos tipados.
- Vale la pena contribuir el resultado a la biblioteca comunitaria: reduce el mantenimiento futuro.

## Alternativas descartadas

- **Tratar la ruta cruda como respaldo.** Habría dejado el asistente de canal sin base.
