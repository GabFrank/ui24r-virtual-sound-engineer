# SPK-P0.10b — Calibración y balística de los medidores de la consola

**Estado:** Pendiente — la **forma** de la escala está medida con tonos (2026-09-08: **es lineal en decibeles**, y su recorrido dio ~84,5 dB en vez de los 80 del código, con una discrepancia sin resolver contra la comprobación cruzada del fader); faltan la correspondencia con dBFS absolutos, la balística y la tasa · **Timebox:** 3 días · **Control:** G-B
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
| 5 | Tabla de conversión si la lectura no es lineal en decibeles a fondo de escala | bloqueante | tabla o constancia de que no hace falta | **No hace falta tabla: la lectura es lineal en decibeles, y ahora está medido, no deducido.** Tres barridos con una fuente de nivel conocido dieron pendientes de 0,9438, 0,9379 y 0,9507 contra un recorrido supuesto de 80 dB, con desvío máximo de **0,21 dB** en el barrido más fino. Lo que estaba mal no era la forma sino el factor: el recorrido real es de **~84,5 dB (±0,6)**. Que esa escala sean dBFS sigue siendo otra afirmación y sigue sin medirse | ✅ |

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

Un escalón del byte serían **0,333 dB**.

> ⚠️ **La forma de esta recta es correcta y su factor no.** Los tonos, más abajo, confirmaron que la escala es lineal en decibeles y desmintieron el 80: el recorrido medido es de ~84,5 dB, así que la recta es `dB = 84,5 · posición − 84,5` y el escalón del byte son **0,352 dB**. Lo que sigue en esta sección se conserva porque es cómo se llegó hasta acá, no porque el número sea el bueno.

**Queda falsada la hipótesis anterior**, que era que la consola dibuja sus medidores con la misma regla que sus faders. No es así: con la ley del fader el byte 225 daba +4,6 dB.

**Comprobado contra el aparato en dos puntos independientes**, consola en `192.168.0.78`:

| Fuente | Byte | Según la recta | Lo que mostraba la consola |
|---|---|---|---|
| Guitarra en el canal 1 | entrada 225 | −5,0 dB de entrada; con el fader en −6,9 dB, **−11,9 a la salida** | −12 |
| Música por las RCA | salida 102 | **−46 dB** | coincide con la barra |

**Y comprobado de forma cruzada.** La consola dibuja la **salida** en la barra y la **entrada** como marca fantasma, así que la diferencia entre las dos tiene que ser el fader del canal:

| Canal | Diferencia con recorrido 80 | Diferencia con recorrido 84,5 | `i.N.mix` |
|---|---|---|---|
| 21 | 11,6 dB | 12,3 dB | −11,6 dB |
| 22 | 11,6 dB | 12,3 dB | −11,5 dB |

El reparto de bytes y la relación entre barra, fantasma y fader quedan comprobados: la diferencia entre los dos medidores *es* el fader, y eso no depende del recorrido.

> ⚠️ **El recorrido, en cambio, no cierra con el de los tonos, y queda como pregunta abierta.** Esta comprobación implica 79–80 dB; los barridos, 84–85. Está desarrollado en la sección 4.3 de [protocol-spec.md](../protocol-spec.md) y en «lo que sigue sin medirse», más abajo.

**Saturación:** la consola enciende su indicador cuando el medidor llega a la punta de la escala —`1 <= valor`, o sea 0 dB—, no por un umbral elegido a mano. Y el **bit 7 del último byte del canal es el indicador de puerta** (`GATEind`), **no saturación**: vale 1 en todos los canales quietos, y leerlo como clip da los veinticuatro canales saturando sin parar.

El detalle completo está en la sección 4 de [protocol-spec.md](../protocol-spec.md).

## Los tonos — 2026-09-08, criterio 5 contestado

### Montaje

Consola en `192.168.0.78`, firmware `3.4.8318-ui24`. Los tonos se generan en la iMac —seno de amplitud exacta, `amplitud = 10^(dB/20)` sobre el fondo de escala, sin nada en el medio— y salen por una interfaz **Focusrite Scarlett** hacia el **canal 10** de la consola: ganancia **+10 dB**, fader **0 dB**, alimentación fantasma **apagada**.

**El canal se puenteó antes de medir**, escribiendo `i.9.dyn.bypass = 1` y `i.9.gate.enabled = 0` directo por protocolo desde `tools/spikes/p0-10b-vu/escribir.ts`. Por qué importa está en la trampa de más abajo, y no es un detalle de procedimiento: es la diferencia entre medir el medidor y medir el compresor.

### Los tres barridos

Cada nivel suena cinco segundos, se descartan los primeros 1 500 ms —eso es la balística, no el nivel— y se promedia el byte `+1` de entrada del canal. La pendiente es una recta de mínimos cuadrados entre el nivel de la fuente y el nivel leído **con la conversión vieja**, la del recorrido de 80 dB. Una pendiente de 1,0 significaría que ese recorrido era el correcto.

| Barrido | Recorrido de la fuente | Pendiente | Desvío máximo | Recorrido implícito |
|---|---|---|---|---|
| 1 kHz | −40 a −3 dBFS | 0,9438 | 0,79 dB | 84,8 dB |
| 1 kHz | −32 a −14 dBFS, pasos de 2 | **0,9379** | **0,21 dB** | 85,3 dB |
| 400 Hz | −30 a −15 dBFS, pasos de 3 | 0,9507 | 0,39 dB | 84,1 dB |

El barrido del medio es el que manda, y por eso está en negrita: se hizo a propósito **sin los extremos**, donde cerca del fondo manda el ruido de la sala y cerca del tope cualquier eslabón de la cadena analógica puede estar limitando sin avisar. En esa zona, la única donde la cadena es indudable, la recta tiene un desvío máximo de **0,21 dB**.

Como control de sensatez del mismo dato: una rebaja de **18 dB** en la fuente movió el byte medio de **86,4 a 35,2**, que con el recorrido medido son 18 dB. Ese par está en un test del adaptador.

### Qué contesta y qué no

**La escala es lineal en decibeles, y ahora está medido.** Hasta hoy eso era una lectura del código de la consola: dos líneas de `mixer.html` que no dejaban otra interpretación posible. Leer bien un código y que el aparato haga lo que el código dice son dos afirmaciones distintas, y esta es la segunda. Tres barridos, dos frecuencias y desvíos por debajo de 0,8 dB —0,21 en el mejor— dicen que sí.

**El recorrido no son 80 dB sino ~84,5 (±0,6).** Los tres barridos lo sitúan entre 84,1 y 85,3; la constante `MEDIDOR_RANGO_DB` del adaptador pasó de 80 a **84,5** por esta medición, y con ella el escalón del byte pasó de 0,333 a **0,352 dB**. En la mitad de la barra la diferencia entre una y otra son más de dos decibeles.

**Causa probable, y se escribe como probable.** En `drawVUMarks` las marcas de la escala se dibujan sobre `a.h - 9` píxeles, mientras `paint()` dibuja la barra sobre `a.h` completo. Los nueve píxeles de diferencia estirarían el recorrido efectivo: `80 · h/(h − 9)` con la altura de tira de la consola da ~85 dB, que es del orden de lo medido. Nadie comprobó esa hipótesis contra el aparato —lo medido es el número, no su causa— y si resultara falsa el número sigue en pie. La consola arrastraría entonces una inconsistencia entre su propia barra y sus propios rótulos.

### La trampa: el primer barrido midió el procesamiento del canal, no el medidor

Vale documentarla porque el resultado **parecía razonable** y no lo era.

El primer intento dio pendiente **0,9155** y desvío máximo **1,59 dB**, con el paso de −6 a −3 dBFS leyéndose como **1,19 dB** en vez de 3. Ese último número es el que delata: no es ruido, es compresión.

El canal tenía su propio procesamiento activo: `i.9.gate.enabled = 1`, `i.9.dyn.bypass = 0`, `dyn.threshold = 0,875` y la relación en el máximo. La puerta recorta abajo y el compresor aplasta arriba, y las dos cosas juntas doblan la recta por las dos puntas.

**Medir el medidor de un canal con su propio procesamiento activo mide el procesamiento, no el medidor.** Con el compresor puenteado y la puerta apagada, el mismo barrido de 1 kHz pasó de 1,59 dB de desvío a 0,79, y el barrido acotado a 0,21.

Lo que hay que leer de acá para la próxima: antes de medir cualquier cosa en un canal, imprimir qué tiene puesto ese canal. Para eso están `estado-canal.ts` y `rutas-canal.ts`, y por eso `escribir.ts` imprime siempre el valor anterior antes de tocar nada.

## Lo que sigue sin medirse

**La correspondencia con dBFS absolutos, que es justamente lo que los tonos no contestaron.** El camino lleva una ganancia analógica **desconocida** —la perilla de la interfaz Scarlett más el previo del canal— que se mantuvo fija durante toda la corrida. Eso hace válidas las **diferencias**: la forma de la escala, su linealidad y su recorrido en decibeles. No hace válido ningún valor absoluto: «este tono de −20 dBFS llega como −20 a la entrada» exige conocer esa ganancia, y no sale de acá. En los propios barridos, el corte de la recta *es* la ganancia analógica del camino, o sea un dato del montaje y no del medidor.

Contestarlo exige un **bucle calibrado**: la ruta del paso 1, tonos de −20, −6 y −1 dBFS desde el auxiliar de análisis a una entrada en modo línea, sin perilla desconocida en el medio. Hasta que eso esté medido, «pico a menos un decibel» sigue sin significar nada y **este spike no se cierra**. Los criterios 1 y 2 siguen en blanco.

Y si alguien mueve la perilla de la interfaz en medio de una corrida, la corrida entera se descarta: no hay forma de notarlo en los números.

**El recorrido, que quedó con dos respuestas.** Los tonos dan 84–85 dB. La comprobación cruzada de la sesión anterior —diferencia entre los dos medidores contra el fader del canal— da 79–80, que es justo el `VU_RANGE` del código. Un 6 % de diferencia, y alguna de las dos mediciones lo tiene mal:

| Medición | Recorrido implícito | Qué compara | Fortaleza |
|---|---|---|---|
| Tres barridos de tonos | 84,1 a 85,3 dB | un medidor contra una fuente de nivel exacto | muchos puntos, pasos finos, desvío máximo de 0,21 dB |
| Comprobación cruzada | 79,3 a 80,0 dB | dos medidores entre sí, contra `faderADb` | dos puntos de una señal de música, y depende de una ley de fader que también es lectura de código |

Se adoptó el número de los tonos porque es la medición más fuerte y la única con una fuente conocida, pero **esto no está cerrado**. La hipótesis más económica es que `faderADb` tenga un error de escala del mismo orden, que la comprobación cruzada no puede ver porque afecta a sus dos términos por igual. El bucle calibrado del paso 1 resuelve las dos cosas de una vez: fija el recorrido en absoluto y de paso pone a prueba la ley del fader contra algo que no sea su propio código fuente.

Tampoco están medidas la balística —criterio 3— ni la tasa de tramas de medidores en las condiciones de este spike —criterio 4—. De la tasa hay un dato de contexto en SPK-P0.1: `VU2` se suprime en silencio, así que cualquier medida de tasa tiene que decir si había señal.

## Herramientas ya escritas

`tools/spikes/p0-10b-vu/` tiene las sondas que midieron todo lo de arriba, y sirven tal cual para lo que falta. Leen la consola sin la aplicación en el medio, que es lo que hace falta para no medir nuestros propios errores de conversión:

| Sonda | Qué hace |
|---|---|
| `sonda.ts` | el byte crudo de `VU2` para un canal y el nombre que ese canal tiene en el volcado |
| `sonda-gain.ts` | qué ruta trae cada canal, leído del volcado: fader, ganancia y nombre |
| `campos.ts` | los seis bytes del bloque de canal por separado, promediados sobre varios segundos |
| `entrada-vs-salida.ts` | entrada contra salida en un canal y el fader que las separa, que es la comprobación cruzada |
| `linealidad.ts` | **el barrido de tonos entero**: genera cada nivel, lo reproduce, promedia el byte y saca la recta con su pendiente y su desvío máximo |
| `prueba-tono.ts` | un solo tono a un solo nivel, para ver si la cadena analógica está viva antes de gastar un barrido |
| `tonos.html` | los mismos tonos desde el navegador, cuando conviene tener la mano en el volumen |
| `estado-canal.ts` | qué tiene puesto un canal —nombre, fantasma, ganancia, fader, silencio— antes de medirlo |
| `rutas-canal.ts` | todas las claves `i.N.*` y `hw.N.*` que la consola informa de un canal |
| `escribir.ts` | escritura directa para puentear el procesamiento. **No es la aplicación**: imprime siempre el valor anterior |
| `restaurar.ts` | devuelve una lista de rutas a su valor previo y comprueba por `INIT` que hayan quedado |
| `eco.ts` | el criterio 3 de SPK-P0.1: escribe, escucha seis segundos y después pide `INIT` |
| `probar-escritura.ts` | qué envoltorio acepta la consola para una escritura, probando cinco variantes |

## Evidencia a entregar

- `evidence/vu-calibration.csv`, `evidence/vu-ballistics.png`.

## Acción ante fallo

Si el medidor resulta demasiado lento para detectar picos cortos, la probabilidad de saturación se calcula sobre el conteo de eventos y no sobre el valor de pico, y se documenta la limitación en el asistente de ganancia.
