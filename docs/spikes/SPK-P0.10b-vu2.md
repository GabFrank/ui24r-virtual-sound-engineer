# SPK-P0.10b — Calibración y balística de los medidores de la consola

**Estado:** Pendiente · **Timebox:** 3 días · **Control:** G-B
**Depende de:** SPK-P0.2a, SPK-P0.6' · **Bloquea a:** S-03.3, S-03.4
**Montaje:** Ui24R, pendrive con tonos, un cable para el bucle físico desde el auxiliar de análisis a una entrada libre en modo línea.

## Pregunta que responde

¿Qué relación hay entre la lectura de los medidores y el nivel digital real, y cómo responden en el tiempo?

Todo el asistente de ganancia del primer entregable se apoya en estos medidores. Sin saber a qué corresponde su lectura, "pico a menos un decibel" no significa nada.

## Pasos

1. Enviar tonos de −20, −6 y −1 dBFS por un bucle físico desde el auxiliar de análisis a una entrada libre en modo línea. Se usa un bucle físico y no el canal del reproductor para no depender de la ganancia del reproductor.
2. Registrar la lectura del medidor previo al proceso para cada nivel.
3. Enviar ráfagas cortas y medir los tiempos de subida y de caída de la lectura.
4. Medir la tasa de tramas de medidores.
5. Si la lectura de cero decibeles no corresponde a fondo de escala, construir la tabla de conversión.

## Criterios

| # | Criterio | Tipo | Umbral | Medido | Resultado |
|---|---|---|---|---|---|
| 1 | Lectura del medidor para −20, −6 y −1 dBFS | bloqueante | tres valores registrados | | ⬜ |
| 2 | Valor de referencia de saturación, definido como la lectura a −1 dBFS | bloqueante | registrado | | ⬜ |
| 3 | Balística: tipo, tiempo de subida y de caída | bloqueante | documentados con ráfaga | | ⬜ |
| 4 | Tasa de tramas de medidores | bloqueante | tramas por segundo, registrado | | ⬜ |
| 5 | Tabla de conversión si la lectura no es lineal en decibeles a fondo de escala | bloqueante | tabla o constancia de que no hace falta | | ⬜ |

## Evidencia a entregar

- `evidence/vu-calibration.csv`, `evidence/vu-ballistics.png`.

## Acción ante fallo

Si el medidor resulta demasiado lento para detectar picos cortos, la probabilidad de saturación se calcula sobre el conteo de eventos y no sobre el valor de pico, y se documenta la limitación en el asistente de ganancia.
