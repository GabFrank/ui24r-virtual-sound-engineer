# Parámetros normativos de análisis

Se fija en SPK-P0.10a y se valida en cada integración continua contra los archivos de referencia. Cambiar cualquiera de estos números **invalida las mediciones anteriores** y exige una ADR.

## Captura

| Parámetro | Valor |
|---|---|
| Frecuencia de muestreo | 48 kHz, fija. La consola trabaja a 48 kHz |
| Profundidad | coma flotante de 32 bits internamente; 24 bits al grabar a archivo |
| Fuente de audio | sin procesar. Si el dispositivo no la soporta, se documenta la alternativa y su efecto medido |

## Espectro

| Parámetro | Valor |
|---|---|
| Transformada | multirresolución: 32768 muestras o más por debajo de 100 Hz, 8192 por encima |
| Ventana | Hann |
| Solape | 50 %, opcionalmente 75 % para función de transferencia |
| Promediado lineal | 16 s o más por debajo de 100 Hz, 8 s por encima |
| Promediado exponencial | constante de tiempo configurable, por defecto 2 s |
| Suavizado | tercio, sexto o doceavo de octava, según el uso |
| Rango | 20 Hz a 20 kHz |

La ventana de 32768 muestras a 48 kHz da bins de 1,46 Hz. La banda de tercio de octava centrada en 31,5 Hz va de 28,1 a 35,5 Hz, o sea 7,3 Hz de ancho: caben cinco bins. Con 16384 solo caben dos o tres, que no alcanzan para una media estable.

## Nivel

| Métrica | Definición |
|---|---|
| RMS rápido | integración de 300 ms |
| RMS lento | integración de 3 s |
| Pico por muestra | máximo del valor absoluto en la ventana |
| Pico real | sobremuestreo por cuatro, según la recomendación de medición de sonoridad |
| Factor de cresta | pico dividido por RMS, en decibeles |

## Definiciones que tienen que ser únicas en todo el proyecto

| Concepto | Definición |
|---|---|
| **Saturación por audio** | tres muestras consecutivas con valor absoluto por encima de −0,1 dBFS, **o** pico real por encima de 0 dBTP |
| **Saturación por telemetría** | una trama del medidor previo al proceso por encima del valor de referencia de saturación, que se calibra en SPK-P0.10b con un tono a −1 dBFS. Tramas consecutivas cuentan como un solo evento |
| **Ruido de fondo** | percentil 10 del espectro durante una ventana de silencio dirigido |
| **Relación señal a ruido** | RMS lento de la señal menos ruido de fondo, en la banda útil del perfil |
| **Probabilidad de saturación** | fracción de ventanas con pico por encima de −1 dBFS durante la captura |

El límite de −0,1 dBFS en vez de 0 existe porque algunas capas de audio entregan 0,9999 como fondo de escala.

## Función de transferencia

| Parámetro | Valor |
|---|---|
| Método | doble canal: H(f) = S12 / S11 |
| Coherencia | γ² = |S12|² / (S11 · S22) |
| Promedios mínimos para aplicar la máscara de coherencia | **16**. Con menos, la coherencia está sesgada hacia uno y todos los bins se marcan como insuficientes |
| Umbral de máscara | 0,7 |
| Umbral para generar un hallazgo de ecualización | 0,8 |
| Compensación de retardo | obligatoria antes de calcular H(f) |

## Estimador de retardo

| Parámetro | Valor |
|---|---|
| Método | correlación cruzada entre entrada 1 y entrada 2 |
| Rango de búsqueda | 0 a 200 ms |
| Precisión exigida, banda ancha | prueba **diferencial**: se mide el retardo con 0 ms configurado y con 10, 50 y 150 ms, y la diferencia tiene que coincidir con lo configurado dentro de 2 muestras |
| Precisión exigida, banda estrecha | para señales de menos de 500 Hz de ancho de banda, un octavo del período de la frecuencia superior, con correlación sobre la envolvente |

La precisión se exige sobre el **incremento** y no sobre el valor absoluto, porque el retardo absoluto suma latencias fijas que nadie conoce: la de la consola, la del procesamiento del sistema de amplificación y la propagación acústica, que son unos 2,9 ms por metro.

## Archivos de referencia

Silencio, seno, ruido rosa, barrido, voz, guitarra, bajo, percusión, banda completa, señal saturada y señal muy débil. Se generan con `tools/spikes/p0-10a-dsp`.

## Tolerancias frente a la referencia

| Métrica | Tolerancia |
|---|---|
| RMS | ±0,1 dB |
| Pico por muestra | ±0,05 dB |
| Pico real | ±0,2 dB |
| Espectro por banda de tercio de octava | ±0,5 dB |
