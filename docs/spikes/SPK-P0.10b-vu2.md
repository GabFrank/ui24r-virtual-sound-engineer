# SPK-P0.10b — Calibración y balística de los medidores de la consola

**Estado:** Pendiente — la **forma y el recorrido** de la escala quedaron cerrados el 2026-09-09 (**80 dB**, medidos moviendo el fader, o sea sin cadena analógica en el medio), y con ellos la **balística**, la **tasa**, la **respuesta en frecuencia**, el **techo** y la **repetibilidad**; falta lo único que siempre faltó: la **correspondencia con dBFS absolutos**, que son los criterios 1 y 2 · **Timebox:** 3 días · **Control:** G-B
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
| 1 | Lectura del medidor para −20, −6 y −1 dBFS | bloqueante | tres valores registrados | Sigue en blanco, y es lo que impide cerrar el spike. Exige el bucle calibrado del paso 1: sin conocer la ganancia analógica del camino, ningún byte se puede rotular con un dBFS | ⬜ |
| 2 | Valor de referencia de saturación, definido como la lectura a −1 dBFS | bloqueante | registrado | **El techo del medidor sí está medido** —el byte se clava en 239 y la lectura deja de subir en −0,7 dB, que es el valor 1,0 donde la consola enciende su clip—, pero eso es el tope de la escala, no «la lectura a −1 dBFS». Rotularlo en dBFS depende del criterio 1 | ⬜ |
| 3 | Balística: tipo, tiempo de subida y de caída | bloqueante | documentados con ráfaga | **Cinco ráfagas de 1 200 ms a −15 dBFS.** Subida: **0 ms**, no se resuelve —la lectura llega a la meseta dentro de una sola trama—. Caída de 20 dB: **mediana 37 ms**, mínimo 33, máximo 66. Nada por debajo de la cadencia de ~44 ms se puede afirmar. **La consola manda nivel instantáneo y la balística la dibuja su cliente** | ✅ |
| 4 | Tasa de tramas de medidores | bloqueante | tramas por segundo, registrado | **~44 ms entre tramas con señal**, medido en las condiciones de este spike y coincidente con los 44 ms de media que SPK-P0.1 midió desde la tablet. En silencio no hay tasa que medir: la consola suprime `VU2`, y ahí la media se va a 1 231 ms con p95 de 4 730 | ✅ |
| 5 | Tabla de conversión si la lectura no es lineal en decibeles a fondo de escala | bloqueante | tabla o constancia de que no hace falta | **No hace falta tabla: la lectura es lineal en decibeles y su recorrido es de 80 dB**, y las dos cosas están medidas contra el aparato. La medición que las fija es la del fader —ganancia digital, sin cadena analógica— y cierra en **0,06 dB sobre 38**. El escalón del byte son **0,333 dB**. Que esa escala sean dBFS sigue siendo otra afirmación y sigue sin medirse | ✅ |

## La escala: 80 dB, y cómo se llegó ahí dos veces

**La ley del medidor sale del `mixer.html` que sirve la propia consola.** Son dos piezas de su código y juntas no dejan otra lectura posible:

```js
VU_RANGE = 80
vuPosMark(dB, h) = -dB * h / VU_RANGE     // donde va cada marca de la escala
paint()          { c = h * this.value }   // alto de la barra, proporcional a la posicion
```

Barra proporcional a la posición y marcas espaciadas linealmente en decibeles dan una sola recta:

```
dB = 80 · posicion − 80        // 0 dB en la punta, −80 en el fondo
```

Un escalón del byte son **0,333 dB**, que es `MEDIDOR_RANGO_DB` —80— por la escala del byte. La constante vale 80, no 0,333.

**Queda falsada la hipótesis anterior**, que era que la consola dibuja sus medidores con la misma regla que sus faders. No es así: con la ley del fader el byte 225 daba +4,6 dB.

### El desvío a 84,5 dB, y por qué se volvió atrás

Vale contarlo entero, porque la trampa es sutil y se puede repetir.

El 2026-09-08 tres barridos de tono con una fuente de nivel conocido dieron pendientes de 0,9438, 0,9379 y 0,9507 contra el recorrido de 80, con desvíos máximos de 0,79, **0,21** y 0,39 dB. Rectas impecables, todas apuntando a un recorrido de ~85 dB. Con eso se cambió la constante a **84,5** —commit `7d4c619`— y se escribió ese número en la matriz de capacidades, en la especificación del protocolo y en este mismo documento.

Lo que faltaba mirar es que **esos barridos no coincidían entre sí**. Expresados en dB por escalón del byte:

| Barrido | Zona del medidor | dB por escalón |
|---|---|---|
| 1 kHz, −32 a −14 dBFS, pasos de 2, ganancia +10 | lecturas bajas | 0,3516 |
| 1 kHz, −40 a −3 dBFS, ganancia +10 | lecturas bajas | 0,3582 |
| 1 kHz, −33 a −6 dBFS, pasos de 3, ganancia +40 | lecturas altas | 0,3644 |

**Una escala tiene un solo factor.** Tres factores distintos según el nivel al que se mida no son una escala: son la cadena analógica metiendo la cola —el conversor, el cable, el previo, el ruido sumándose abajo—. El cuarto barrido, el de ganancia +40 y lecturas altas, es el que lo dejó a la vista: cambiar la zona del medidor cambiaba el factor.

### La medición que sí fija la escala

**Sin cadena analógica.** El fader del canal es una ganancia **digital dentro de la consola**: entre la fuente y el medidor no hay nada que pueda mentir. Con la fuente fija y el **medidor de entrada como testigo** —se mantuvo clavado en **−20,76 dB en las quince posiciones**, o sea que la fuente no se movió—, se recorrió el fader y se leyó el medidor de salida:

| | |
|---|---|
| crudo 0,7647 | byte de salida **181,0** |
| crudo 0,2000 | byte de salida **66,3** |
| recorrido del medidor | **114,7 escalones** |
| atenuación según la ley de fader de la consola | **38,19 dB** |
| lo que dan 114,7 escalones con `VU_RANGE = 80` | **38,24 dB** |

**Coincide en 0,05 dB sobre 38.** `VU_RANGE` y `VtoLIN` son dos hechos independientes del código de la consola, y concuerdan entre sí y con esta medición.

La constante volvió a 80 en el commit `98d59af`, y el test fuerte de la escala pasó a ser este y no el de la fuente externa: ata la conversión del medidor a la ley del fader con bytes medidos.

### La lección, que es lo único que aportan los barridos

> **Una fuente externa mide la cadena entera, no el medidor. Para medir el medidor hay que mover algo que ya esté adentro.**

Los datos de los barridos quedan archivados en `evidence/barridos-2026-09-08.txt` con el motivo por el que no sirven para fijar la escala. El episodio vale como advertencia; el número, no.

Como consecuencia, **también queda resuelta la discrepancia que este documento y `protocol-spec.md` dejaron abierta**: la comprobación cruzada entre los dos medidores y el fader daba 79–80 dB y los tonos daban 84–85. No había dos respuestas: había una medición limpia y otra contaminada, y la contaminada era la de los tonos. La hipótesis de que `faderADb` arrastrara un error de escala del mismo orden **queda descartada**, porque la medición del fader la habría amplificado y no lo hizo.

Cae con ella la «causa probable» que se había escrito para explicar los 84,5 —los nueve píxeles de diferencia entre `drawVUMarks` y `paint()`—. Era una explicación razonable para un número que no existía. Se anota acá para que nadie la vuelva a encontrar en un archivo viejo y la tome por buena.

## Comprobado contra el aparato

**En dos puntos independientes**, consola en `192.168.0.78`. Son lecturas a ojo de una barra en movimiento, así que valen con esa tolerancia:

| Fuente | Byte | Según la recta de 80 dB | Lo que mostraba la consola |
|---|---|---|---|
| Guitarra en el canal 1 | entrada 225 | −5,0 dB de entrada; con el fader en −6,9 dB, **−11,9 a la salida** | −12 |
| Música por las RCA | salida 102 | **−46 dB** | coincide con la barra |

**Y de forma cruzada.** La consola dibuja la **salida** en la barra y la **entrada** como marca fantasma, así que la diferencia entre las dos tiene que ser el fader del canal:

| Canal | Entrada (byte) | Salida (byte) | Diferencia con recorrido 80 | `i.N.mix` |
|---|---|---|---|---|
| 21 | 171,9 | 137,1 | **11,6 dB** | −11,6 dB |
| 22 | 174,9 | 140,1 | **11,6 dB** | −11,5 dB |

Cierra en una décima de decibel. El reparto de bytes, la relación entre barra, fantasma y fader, y el recorrido de 80 dB quedan comprobados a la vez.

## Lo demás que se midió el 2026-09-09

Todo contra la consola en `192.168.0.78`, firmware `3.4.8318-ui24`, canal 10 —rutas `i.9`—, con la fuente entrando desde la iMac por una Focusrite Scarlett.

### Respuesta en frecuencia: plana

Mismo nivel de fuente a tres frecuencias:

| Frecuencia | Byte |
|---|---|
| 100 Hz | 160,3 |
| 1 kHz | 160,7 |
| 10 kHz | 160,0 |

**0,23 dB de dispersión. No hay ponderación por frecuencia.** El medidor lee nivel y no un nivel ponderado, así que un pico de graves y uno de agudos cuentan lo mismo.

**Salvedad honesta:** la medición incluye la cadena analógica, que también es plana. Lo que se puede afirmar es que **no hay ponderación apreciable en el conjunto**, no que el medidor por separado sea plano. Para el uso que le damos —comparar el mismo canal consigo mismo— la distinción no cambia nada; si algún día hace falta afirmarlo del medidor solo, hay que moverlo desde adentro, como con el fader.

### Techo del medidor: `MEDIDOR_SATURACION = 1`, comprobado

Con la ganancia del canal al máximo —**57 dB**— y la fuente subiendo, **el byte se clava en 239 y la lectura deja de subir en −0,7 dB**. Coincide con el valor 1,0 —byte ~240— donde la consola enciende su indicador de clip.

Hasta hoy `MEDIDOR_SATURACION = 1` era una lectura de `setVU` en el `mixer.html`. Ahora está **comprobado contra el aparato**: el medidor no informa nada por encima de esa posición, así que no hay margen escondido arriba ni conviene elegir un umbral propio más bajo. El indicador de la consola y el tope de su escala son el mismo punto.

### Repetibilidad: 0,3 dB

El mismo tono medido en **tres corridas separadas en el tiempo** dio bytes **69,9 / 69,1 / 70,0**: **0,3 dB de dispersión**. Es el piso de ruido de la medición entera, montaje incluido, y es el número contra el que hay que comparar cualquier diferencia que el asistente de ganancia quiera declarar significativa.

### Balística: la dibuja el cliente, no la consola

Cinco ráfagas de **1 200 ms a −15 dBFS**:

| | |
|---|---|
| Subida | **0 ms** — no se resuelve: la lectura llega a la meseta dentro de una sola trama |
| Caída de 20 dB | **mediana 37 ms**, mínimo 33, máximo 66 |
| Cadencia con señal | ~44 ms |

**Nada por debajo de los 44 ms se puede afirmar**: la subida de 0 ms no significa que sea instantánea, significa que el muestreo no la ve.

La conclusión importa más que los números: **la consola manda nivel instantáneo y la balística la dibuja su cliente.** En el `mixer.html` eso son `GLOBAL_VU_FALL_SPEED = 0.01` y `PEAK_HOLD_TIME = 3`.

**Consecuencia para el producto:** la retención de picos es **una decisión nuestra, no algo heredado**. No hay una balística «de la consola» que haya que imitar para que los números coincidan con los de su pantalla; hay un nivel instantáneo y dos constantes de dibujo que el cliente oficial eligió. Podemos elegir otras —más lentas para leer de un vistazo a un metro de distancia, más rápidas para cazar picos— y seguir siendo fieles a lo que la consola informa. Lo que no podemos es presentar un pico retenido sin decir que es retenido.

Esto también responde por qué el criterio 3 se podía contestar sin el bucle calibrado: los tiempos son diferencias, y las diferencias no dependen de la ganancia del camino.

### La trampa que costó el primer barrido: el procesamiento del canal

Vale documentarla porque el resultado **parecía razonable** y no lo era.

El primer intento dio pendiente **0,9155** y desvío máximo **1,59 dB**, con el paso de −6 a −3 dBFS leyéndose como **1,19 dB** en vez de 3. Ese último número es el que delata: no es ruido, es compresión.

El canal tenía su propio procesamiento activo: `i.9.gate.enabled = 1`, `i.9.dyn.bypass = 0`, `dyn.threshold = 0,875` y la relación en el máximo. La puerta recorta abajo y el compresor aplasta arriba, y las dos cosas juntas doblan la recta por las dos puntas.

**Medir el medidor de un canal con su propio procesamiento activo mide el procesamiento, no el medidor.** Con el compresor puenteado —`i.9.dyn.bypass = 1`— y la puerta apagada —`i.9.gate.enabled = 0`—, el mismo barrido pasó de 1,59 dB de desvío a 0,79.

Lo que hay que leer de acá para la próxima: antes de medir cualquier cosa en un canal, imprimir qué tiene puesto ese canal. Para eso están `estado-canal.ts` y `rutas-canal.ts`, y por eso `escribir.ts` imprime siempre el valor anterior antes de tocar nada.

Es la misma trampa que la de los barridos, un escalón más afuera: la primera vez se coló el procesamiento del canal, la segunda la cadena analógica. **Lo que estorba siempre es lo que está entre la fuente y el medidor.**

## Lo que sigue sin medirse

**La correspondencia con dBFS absolutos, y nada más que eso.** El camino lleva una ganancia analógica **desconocida** —la perilla de la interfaz Scarlett más el previo del canal— que se mantuvo fija durante toda la corrida. Eso hace válidas las **diferencias**: la forma de la escala, su linealidad, su recorrido en decibeles, la balística, la respuesta en frecuencia y la repetibilidad. No hace válido ningún valor absoluto: «este tono de −20 dBFS llega como −20 a la entrada» exige conocer esa ganancia, y no sale de acá.

Contestarlo exige un **bucle calibrado**: la ruta del paso 1, tonos de −20, −6 y −1 dBFS desde el auxiliar de análisis a una entrada en modo línea, sin perilla desconocida en el medio. Hasta que eso esté medido, «pico a menos un decibel» sigue sin significar nada y **este spike no se cierra**. Los criterios 1 y 2 siguen en blanco.

Y si alguien mueve la perilla de la interfaz en medio de una corrida, la corrida entera se descarta: no hay forma de notarlo en los números.

**Qué evidencia falta archivar.** `evidence/barridos-2026-09-08.txt` cubre los barridos, la medición del fader y la balística. **La respuesta en frecuencia, el techo y la repetibilidad están medidos y anotados acá, pero su salida cruda no está archivada**, así que no cumplen el segundo punto de la definición de terminado de un spike. Ninguno de los tres es bloqueante, pero mientras no estén archivados valen como lo que son: números escritos a mano en un documento.

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
| `tres-clientes.ts` | tres conexiones a la vez, con una escribiendo: huellas del volcado y quién ve la escritura |

## Evidencia a entregar

- `evidence/barridos-2026-09-08.txt` — **entregada.** Barridos, la medición del fader que fija la escala, y la balística.
- `evidence/vu-calibration.csv` — pendiente: es la del bucle calibrado, criterios 1 y 2.
- La salida cruda de la respuesta en frecuencia, el techo y la repetibilidad — pendiente de archivar.

## Acción ante fallo

Si el medidor resulta demasiado lento para detectar picos cortos, la probabilidad de saturación se calcula sobre el conteo de eventos y no sobre el valor de pico, y se documenta la limitación en el asistente de ganancia.

**Lo medido dice que el medidor no es el cuello de botella: la cadencia sí.** La lectura llega a la meseta dentro de una sola trama, así que el límite no es la balística de la consola sino los ~44 ms entre tramas. Un pico más corto que eso puede caer entre dos tramas y no verse. Esa es la limitación real que el asistente de ganancia tiene que declarar.

## Evidencia archivada

Todo lo que esta carpeta guarda, con qué es cada cosa. Un archivo que nadie
cita es una medición que nadie va a encontrar cuando la necesite.

- `evidence/constantes-mixer-html-2026-09-09.txt` — captura archivada
- `evidence/techo-medidor-2026-09-09.txt` — el techo real del medidor: 255, no 239
- `evidence/ley-envio-aux-2026-09-12.txt` — **la ley del envío a un auxiliar**, del
  canal 10 al auxiliar 3, con tono de 1 kHz a −12 dBFS. 22 valores. El testigo del
  canal no derivó 0,00 dB, y el fader del canal no movió el auxiliar: `post = 0`
  manda de verdad. Rango útil: 18 dB, y ahí está su límite — ver abajo.
- `evidence/ley-envio-aux-caliente-2026-09-12.txt` — **corrida fallida, archivada
  a propósito.** Se pasó `""` como lista de valores para saltear ese argumento y
  llegar al siguiente; `??` no cae al valor por defecto con una cadena vacía, así
  que barrió un solo punto. Queda porque el guion **la archivó igual, sin
  quejarse**: ése era el defecto real, y se corrigió agregando una guarda que
  aborta con menos de cinco puntos.
- `evidence/bytes-del-bus-de-efecto-2026-09-12.txt` — **corrida fallida, archivada
  a propósito.** Rehizo a mano el desplazamiento en la trama y se salteó la
  sección del reproductor: leía otro bloque. Salió consistente y parecía «el bus
  no responde a nada»; lo delató que el byte valía 247, el centinela de «sin
  reducción».
- `evidence/bytes-del-bus-de-efecto-2026-09-12b.txt` — **qué mide cada byte del
  bloque de un bus de EFECTO**, que `protocol-spec.md` §4.4 listaba como
  pendiente. `+0/+1` previo y `+2/+3` posterior al fader del bus, verificado. Y
  el medidor toma **después** del procesador: cola de 1170 ms, izquierda y
  derecha descorrelacionadas con fuente mono, y 7,7 dB de dispersión entre 100 Hz
  y 10 kHz.
- `evidence/leyes-del-compresor-2026-09-12.txt`,
  `evidence/ley-de-la-razon-2026-09-12.txt` y
  `evidence/umbral-por-sustitucion-2026-09-12.txt` — **las leyes del compresor, y
  el resultado es que las del código no describen el aparato.** La rodilla dio
  una pendiente de umbral de 95,6 ± 6,3 dB por unidad; la sustitución dio 22,2,
  32,1 y 47,3 según la relación, y una ley del umbral no puede depender de la
  relación. La ley de la razón encaja a 6 dB de exceso —0,38 escalones de
  desvío— y falla a 18. El sospechoso, como hipótesis, es la escala del medidor
  de reducción por encima de 11 dB, que es donde deja de estar verificada.
- `evidence/calibrar-medidor-reduccion-2026-09-12.txt` — **el medidor de reducción
  contra la caída real de nivel, hasta 24,34 dB.** Extiende la verificación que
  antes llegaba a 10,80. Desvío máximo 0,35 dB = 0,52 escalones, **igual en el
  tramo que ya estaba verificado y en el que no**. Refuta la hipótesis de que el
  medidor fuera el culpable de las contradicciones del ítem 97: el error está en
  la ley. Y con datos confiables, `E·(1−a)` queda refutado — el exceso despejado
  va de 10,0 a 25,6 con fuente y umbral fijos.
- `evidence/controles-tras-96a-2026-09-12.txt` — la restauración tras el ítem 96a,
  releída por HTTP.
- `evidence/ley-envio-fx-2026-09-12.txt` y
  `evidence/ley-envio-fx-2026-09-12b.txt` — **la ley del envío a
  efectos**, dos corridas completas de cuatro series cada una: dos niveles de
  fader por ida y vuelta, con 6 s de asentamiento por punto: unas cinco veces
  los 1170 ms que tarda la cola en llegar a cero, porque el medidor toma después
  del reverb. El envío no se desvía de `faderADb`
  más de 0,25 dB en ninguno de los dieciséis puntos. **La prueba de linealidad
  no pudo decidir**: una corrida la falló y la otra cayó justo en el límite.
- `evidence/post-y-postproc-2026-09-12.txt` — **qué hacen `post` y `postproc` en
  el audio**: las cuatro combinaciones, cada una con el ecualizador plano,
  realzado y con el fader bajado. Las banderas son independientes y hacen lo que
  su nombre dice. Confirma de paso la ley del fader por un camino distinto.
- `evidence/controles-tras-postproc-2026-09-12.txt` — la restauración de esa
  medición, incluidas las cinco bandas del ecualizador.
- `evidence/controles-del-bus-2026-09-12.txt` — **los controles de esa medición**:
  la restauración releída por HTTP, el censo de quién más alimenta el auxiliar,
  el estado del supresor al terminar, el enlace estéreo y la dinámica del canal.
  Existe porque la primera versión los corrió desde un borrador y citó cifras
  que no estaban archivadas en ningún lado.
- `evidence/ley-envio-aux-caliente-2026-09-12b.txt` — la misma medición con el
  tono más caliente —a −1 dBFS en vez de −12—, para estirar el rango útil y ver
  si el desvío contra `faderADb` crece por encima de la resolución del medidor.
  El testigo del canal lo confirma: pasó de −48,66 a −37,66 dB.
