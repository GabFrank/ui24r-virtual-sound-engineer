# ADR-001 — Motor de audio nativo desde el primer día

**Estado:** Aceptada
**Fecha:** 2026-09-07
**Origen:** Auditoría técnica, hallazgos A-16 y A-17.

## Contexto

El Plan Maestro v1.1 dividía el trabajo en un motor básico sobre WebAudio dentro del navegador embebido y un motor de precisión nativo para más adelante. La verificación mostró tres obstáculos:

- Chrome y el WebView de Android **no permiten elegir un dispositivo de entrada USB concreto** por identificador. La enumeración típica ofrece solo "Default".
- La cadena de captura de Android **mezcla a mono** aunque se pida `channelCount: 2`, y con cancelación de eco activa duplica un canal.
- Poner en falso `echoCancellation`, `autoGainControl` y `noiseSuppression` no garantiza saltar el procesamiento de la capa de abstracción: la fuente de audio la elige el navegador, no la página.

Sin control del dispositivo y sin garantía de dos canales limpios, ninguna métrica de nivel, ruido o saturación es confiable.

## Decisión

El motor de audio es **nativo desde la fase 1**: un plugin Capacitor propio en Kotlin, con `AudioRecord` o AAudio, `AudioSource.UNPROCESSED` y `setPreferredDevice` sobre el dispositivo USB elegido.

El procesamiento de señal vive **del lado nativo**. Al WebView llegan métricas y espectros reducidos, nunca audio en crudo: 48 kHz por 2 canales en coma flotante son unos 384 kB/s sostenidos, y el puente de Capacitor serializa a JSON.

WebAudio queda para visualización y para la aplicación web secundaria, que es de solo lectura.

## Consecuencias

- Se necesita competencia en Kotlin y en la capa de audio de Android desde el principio. El plugin es una historia grande, dividida en captura y en servicio.
- La certificación de la tablet pasa a ser condición de paso, no un documento.
- El contrato del puente (`packages/dsp-contract`) hay que diseñarlo explícitamente: tipos de evento, tasa máxima, número de bins.
- Se gana: dos entradas independientes garantizadas, sin ganancia automática, con marcas de tiempo de muestra y contador de cortes.

## Alternativas descartadas

- **WebAudio para el motor básico.** No garantiza entradas independientes ni ausencia de procesamiento automático.
- **Plugins de terceros existentes.** Los evaluados capturan en mono, remuestrean por interpolación lineal y no seleccionan dispositivo USB.
