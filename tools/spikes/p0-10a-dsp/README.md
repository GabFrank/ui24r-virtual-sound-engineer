# SPK-P0.10a — Validación de procesamiento de señal

Corre en escritorio, sin hardware. Genera los archivos de referencia, calcula las métricas con dos implementaciones independientes y compara contra las tolerancias de [docs/dsp-spec.md](../../../docs/dsp-spec.md).

```bash
node src/generate-signals.mjs      # genera los 11 archivos de referencia en out/
node src/report.mjs                # calcula métricas y escribe out/reference-values.json
npm run test:dsp                   # ejecuta la comparación contra tolerancias
```

## Por qué dos implementaciones

Comparar nuestro código contra sí mismo no prueba nada. Aquí hay:

- **`analyzer.mjs`**: la implementación candidata, la que después se porta a Kotlin.
- **`reference.mjs`**: una implementación deliberadamente ingenua y lenta, escrita a partir de las definiciones, sin optimizar. Es la que hace de referencia.

Si las dos coinciden dentro de tolerancia sobre once señales de características muy distintas, es difícil que ambas estén mal de la misma forma. La validación contra una herramienta externa se hace además de esto, no en lugar de esto, y su resultado se archiva en `docs/spikes/SPK-P0.10a-dsp-referencia.md`.

## Señales

Silencio, seno a 1 kHz, ruido rosa, barrido logarítmico, voz sintética, guitarra sintética, bajo sintético, percusión sintética, banda completa, señal saturada y señal muy débil a −60 dBFS.

Las señales "instrumentales" son sintéticas: suma de armónicos con envolvente. No pretenden sonar reales, sino tener la distribución espectral y la dinámica de cada familia, que es lo que las métricas miden.
