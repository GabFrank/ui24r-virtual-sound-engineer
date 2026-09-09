# SPK-P0.10b — Calibración y balística de los medidores de la consola

**Estado:** Pendiente — **falta lo que solo miden los tonos**; la ley del medidor ya está resuelta (2026-09-08) · **Timebox:** 3 días · **Control:** G-B
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
| 5 | Tabla de conversión si la lectura no es lineal en decibeles a fondo de escala | bloqueante | tabla o constancia de que no hace falta | la lectura **es** lineal en decibeles sobre la escala de la consola: `dB = 80·posición − 80`. Que esa escala sean dBFS es otra afirmación y no está medida | ⬜ |

## Lo que ya se resolvió el 2026-09-08, sin tonos

**La ley del medidor sale del `mixer.html` que sirve la propia consola**, no de una hipótesis. Son dos piezas de su código y juntas no dejan otra lectura posible:

```js
VU_RANGE = 80
vuPosMark(dB, h) = -dB * h / VU_RANGE     // donde va cada marca de la escala
paint()          { c = h * this.value }   // alto de la barra, proporcional a la posicion
```

Barra proporcional a la posición y marcas espaciadas linealmente en decibeles dan una sola recta:

```
dB = 80 · posicion − 80        // 0 dB en la punta, −80 en el fondo
```

Un escalón del byte son **0,333 dB**.

**Queda falsada la hipótesis anterior**, que era que la consola dibuja sus medidores con la misma regla que sus faders. No es así: con la ley del fader el byte 225 daba +4,6 dB.

**Comprobado contra el aparato en dos puntos independientes**, consola en `192.168.0.78`:

| Fuente | Byte | Según la recta | Lo que mostraba la consola |
|---|---|---|---|
| Guitarra en el canal 1 | entrada 225 | −5,0 dB de entrada; con el fader en −6,9 dB, **−11,9 a la salida** | −12 |
| Música por las RCA | salida 102 | **−46 dB** | coincide con la barra |

**Y comprobado de forma cruzada.** La consola dibuja la **salida** en la barra y la **entrada** como marca fantasma, así que la diferencia entre las dos tiene que ser el fader del canal:

| Canal | Diferencia entrada − salida | `i.N.mix` |
|---|---|---|
| 21 | 11,7 dB | −11,6 dB |
| 22 | 11,7 dB | −11,5 dB |

Una décima de decibel. La recta, el reparto de bytes y la ley del fader quedan comprobados a la vez, con una fuente que no hizo falta calibrar.

**Saturación:** la consola enciende su indicador cuando el medidor llega a la punta de la escala —`1 <= valor`, o sea 0 dB—, no por un umbral elegido a mano. Y el **bit 7 del último byte del canal es el indicador de puerta** (`GATEind`), **no saturación**: vale 1 en todos los canales quietos, y leerlo como clip da los veinticuatro canales saturando sin parar.

El detalle completo está en la sección 4 de [protocol-spec.md](../protocol-spec.md).

## Lo que sigue sin medirse

**La correspondencia con dBFS reales.** La recta de arriba da el número que ve el operador en la pantalla de su consola, que es lo que hace falta para hablar su mismo idioma. Que ese número sean dBFS es otra afirmación, y la única forma de contestarla es la del paso 1: tonos de −20, −6 y −1 dBFS por un bucle físico. Hasta que eso esté medido, «pico a menos un decibel» sigue sin significar nada y **este spike no se cierra**.

Tampoco están medidas la balística —criterio 3— ni la tasa de tramas de medidores en las condiciones de este spike —criterio 4—. De la tasa hay un dato de contexto en SPK-P0.1: `VU2` se suprime en silencio, así que cualquier medida de tasa tiene que decir si había señal.

## Herramientas ya escritas

`tools/spikes/p0-10b-vu/` tiene las sondas que midieron todo lo de arriba, y sirven tal cual para lo que falta. Leen la consola sin la aplicación en el medio, que es lo que hace falta para no medir nuestros propios errores de conversión:

| Sonda | Qué hace |
|---|---|
| `sonda.ts` | el byte crudo de `VU2` para un canal y el nombre que ese canal tiene en el volcado |
| `sonda-gain.ts` | qué ruta trae cada canal, leído del volcado: fader, ganancia y nombre |
| `campos.ts` | los seis bytes del bloque de canal por separado, promediados sobre varios segundos |
| `entrada-vs-salida.ts` | entrada contra salida en un canal y el fader que las separa, que es la comprobación cruzada |

## Evidencia a entregar

- `evidence/vu-calibration.csv`, `evidence/vu-ballistics.png`.

## Acción ante fallo

Si el medidor resulta demasiado lento para detectar picos cortos, la probabilidad de saturación se calcula sobre el conteo de eventos y no sobre el valor de pico, y se documenta la limitación en el asistente de ganancia.
