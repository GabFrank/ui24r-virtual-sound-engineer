# SPK-P0.10a — Validación del procesamiento de señal contra referencia

**Estado:** Pendiente · **Timebox:** 3 días · **Control:** G-B
**Depende de:** S-00.3 · **Bloquea a:** S-05.9, S-03.4
**Montaje:** ninguno. Corre en escritorio sobre archivos.

## Pregunta que responde

¿Nuestras métricas coinciden con una herramienta de referencia sobre los mismos archivos, y cuáles son los parámetros normativos de análisis?

Se ejecuta sin hardware, así que puede correr desde el primer día en paralelo con todo lo demás.

## Pasos

1. Generar los archivos de referencia: silencio, seno, ruido rosa, barrido, voz, guitarra, bajo, percusión, banda completa, señal saturada, señal muy débil.
2. Procesarlos con la implementación de referencia y con nuestro código.
3. Comparar y ajustar hasta entrar en tolerancia.
4. Fijar la tabla normativa en `docs/dsp-spec.md`.

## Criterios

| # | Criterio | Tipo | Umbral | Medido | Resultado |
|---|---|---|---|---|---|
| 1 | RMS frente a referencia | bloqueante | ±0,1 dB | | ⬜ |
| 2 | Pico por muestra | bloqueante | ±0,05 dB | | ⬜ |
| 3 | Pico real, según la recomendación con sobremuestreo por cuatro | bloqueante | ±0,2 dB | | ⬜ |
| 4 | Espectro por banda de tercio de octava | bloqueante | ±0,5 dB | | ⬜ |
| 5 | Los once casos procesados | bloqueante | 11 de 11 | | ⬜ |
| 6 | Sin saturación interna en la cadena de procesamiento | bloqueante | ningún desbordamiento con señal a fondo de escala | | ⬜ |
| 7 | Tabla normativa aprobada en `docs/dsp-spec.md` | bloqueante | sí | | ⬜ |

## Tabla normativa que se fija aquí

Transformada multirresolución, con ventana de 32768 muestras o más por debajo de 100 Hz a 48 kHz. Ventana de Hann, solape del 50 %, opcionalmente 75 % para función de transferencia. Promediado exponencial y lineal, con 16 segundos o más por debajo de 100 Hz y 8 en el resto. Suavizado de tercio, sexto y doceavo de octava. RMS rápido de 300 ms y lento de 3 s. Saturación por audio: tres muestras consecutivas por encima de −0,1 dBFS, o pico real por encima de 0. Ruido: percentil 10 del espectro en silencio dirigido.

## Evidencia a entregar

- `evidence/reference-values.json` y la salida de la comparación.
