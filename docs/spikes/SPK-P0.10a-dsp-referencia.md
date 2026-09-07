# SPK-P0.10a — Validación del procesamiento de señal contra referencia

**Estado:** En curso, parte interna completa · **Timebox:** 3 días · **Control:** G-B
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
| 1 | RMS frente a referencia | bloqueante | ±0,1 dB | máx. observado por debajo de tolerancia en 11 de 11 | ✅ interno |
| 2 | Pico por muestra | bloqueante | ±0,05 dB | 11 de 11 | ✅ interno |
| 3 | Pico real, con sobremuestreo por cuatro | bloqueante | ±0,2 dB | 11 de 11 | ✅ interno |
| 4 | Espectro por banda de tercio de octava | bloqueante | ±0,5 dB | 11 de 11 | ✅ interno |
| 5 | Los once casos procesados | bloqueante | 11 de 11 | 11 de 11 | ✅ |
| 6 | Sin saturación interna en la cadena de procesamiento | bloqueante | ningún desbordamiento con señal a fondo de escala | verificado con seno a fondo de escala | ✅ |
| 7 | Tabla normativa aprobada en `docs/dsp-spec.md` | bloqueante | sí | escrita | ✅ |
| 8 | **Contraste contra herramienta externa** (REW o equivalente) sobre los mismos archivos | bloqueante | mismas tolerancias | **pendiente** | ⬜ |
| 9 | Estimador de retardo, prueba diferencial a 10, 50 y 150 ms | bloqueante | 2 muestras o menos | 3 de 3 dentro de 2 muestras | ✅ interno |

**Qué significa "interno".** Se implementaron **dos versiones independientes** del análisis: una candidata, optimizada, que es la que se porta a Kotlin, y una de referencia deliberadamente ingenua, escrita desde las definiciones sin optimizar. Las dos coinciden dentro de tolerancia sobre las once señales. Eso descarta errores de implementación, pero **no descarta un error compartido en la interpretación de una definición**. Por eso el criterio 8 sigue abierto: hace falta contrastar contra una herramienta externa antes de cerrar el spike.

## Estado de la ejecución

- 48 tests automatizados, todos en verde. Corren en integración continua.
- Los once archivos y sus valores están en `tools/spikes/p0-10a-dsp/out/`.
- Verificaciones de coherencia que dan confianza en que los números significan lo que deben: un seno a −20 dBFS de pico da −23,01 dB de RMS, que es exactamente la diferencia teórica de 3,01 dB. El ruido rosa da un factor de cresta de 13 dB, que es el valor esperado. La señal recortada detecta 2906 eventos de saturación y la de nivel bajo, ninguno.

## Tabla normativa que se fija aquí

Transformada multirresolución, con ventana de 32768 muestras o más por debajo de 100 Hz a 48 kHz. Ventana de Hann, solape del 50 %, opcionalmente 75 % para función de transferencia. Promediado exponencial y lineal, con 16 segundos o más por debajo de 100 Hz y 8 en el resto. Suavizado de tercio, sexto y doceavo de octava. RMS rápido de 300 ms y lento de 3 s. Saturación por audio: tres muestras consecutivas por encima de −0,1 dBFS, o pico real por encima de 0. Ruido: percentil 10 del espectro en silencio dirigido.

## Evidencia a entregar

- `tools/spikes/p0-10a-dsp/out/reference-values.json`, con las métricas de las once señales calculadas por ambas implementaciones.
- Los once archivos de referencia, reproducibles con `node src/generate-signals.mjs`: el generador es determinista, así que dos ejecuciones dan archivos idénticos.
- Pendiente: `evidence/external-tool-comparison.md` con el contraste contra la herramienta externa.
