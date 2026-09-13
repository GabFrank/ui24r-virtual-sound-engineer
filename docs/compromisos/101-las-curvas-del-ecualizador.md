# 101 — Las curvas del ecualizador, medidas contra el filtro

**Fecha: 2026-09-13.** Consola 192.168.0.78, fw 3.4.8318-ui24. Canal 10 (`i.9`),
la línea de la Scarlett, con el bucle a la interfaz. Contrato escrito **antes** de
escribir nada en el ecualizador.

## Qué se decide

`RAW_MAP` tiene dos entradas del ecualizador en estado `INFERIDO`:

| Ruta | Función | Origen |
|---|---|---|
| `i.N.eq.b1.freq` | `20·1102,5^V` | `mixer.html` de la consola |
| `i.N.eq.b1.q` | `0,05·300^V` | `mixer.html` de la consola |

`INFERIDO` no habilita escritura. Para que la aplicación pueda tocar un
ecualizador hacen falta medidas, y esta corrida las busca.

**Y la hipótesis competidora es concreta**, porque es la que el código tenía hasta
ayer: rectas de 20 a 20 000 Hz y de 0,3 a 10.

### Lo que ya se sabe sin medir, y que no alcanza

Los valores **de fábrica** del canal, evaluados con las dos leyes:

| Banda | Crudo de fábrica | Con `20·1102,5^V` | Con la recta |
|---|---|---|---|
| b1 | 0,3286901902 | **200 Hz** | 6 587 Hz |
| b2 | 0,5584347738 | **1 000 Hz** | 11 178 Hz |
| b3 | 0,7563259869 | **4 000 Hz** | 15 131 Hz |
| b4 | 0,8871249640 | **10 000 Hz** | 17 745 Hz |
| b5 | 0,9542171999 | **16 000 Hz** | 19 085 Hz |

Y el Q de fábrica, 0,5252185347: **exactamente 1,000** con la exponencial, 5,395
con la recta.

Seis números caen en valores redondos con una ley y en absurdos con la otra —
cinco bandas apretadas en la última octava y media no es el reparto de ningún
ecualizador. **Pero esto es evidencia sobre la codificación, no sobre el filtro.**
Dice qué números muestra el cliente de la consola; no dice a qué frecuencia
filtra el DSP. Esta corrida mide lo segundo.

## El método

**No se le pregunta a la consola dónde puso el filtro: se mide el filtro.**

1. **Un multitono**, suma de senoides en frecuencias repartidas por octava a lo
   largo de todo el espectro audible. Va por la Scarlett al canal 10.
2. **Los canales 3 y 4 de la interfaz devuelven lo transmitido, exacto.** Así que
   la respuesta se calcula como **capturado ÷ transmitido, tono por tono**, y una
   irregularidad del camino de reproducción no se confunde con una del filtro.
3. **Cada tono se mide en su propio bin**, por Goertzel, igual que la 99b. Las
   frecuencias caen en bins enteros para que no haya pérdida de ventana y la
   separación entre tonos es de muchos bins, para que no se derramen entre sí.
4. **Primero la línea base con el ecualizador puenteado.** Todo lo que siga se
   mide como **diferencia contra esa línea**, así que cualquier irregularidad del
   camino —de la interfaz, del cable, del previo— se cancela.
5. **Después, la banda 1 con la ganancia al máximo** y la frecuencia en varios
   crudos. La curva que aparece es la del filtro, y su pico es `f0`.
6. **El pico se interpola.** Con tonos cada 1/12 de octava, una parábola sobre
   `(log f, dB)` en el máximo y sus dos vecinos ubica `f0` mejor que la
   separación entre tonos.

**La ganancia se escribe en crudo, no en dB.** Su ley no se conoce —es una de las
entradas que quedaron sin tocar— y no hace falta: se escribe el crudo 1,0, que es
el extremo, y **cuánto sube es un resultado**, no un supuesto.

### Por qué el multitono y no un barrido

Un barrido de un tono por vez son cien capturas por cada crudo de frecuencia que
se quiera probar. El multitono mide **toda la respuesta en una captura**, y como
el nivel de cada tono se mide contra el mismo tono en la referencia, no hace falta
que los tonos tengan todos el mismo nivel ni que el camino sea plano.

## Las expectativas

Falsables, con su umbral, antes de correr.

**El instrumento es el mismo de la 99b y sus errores son los mismos**: el ruido en
el bin —un punto vale con **45 dB** o más de margen— y el recorte, que se mira con
`recorteExacto` y con el pico. **Y hay uno nuevo, propio de esta medición: la
resolución en frecuencia.** Con tonos cada 1/12 de octava, la interpolación
parabólica ubica el pico dentro de **±1,5 %** cuando la curva es suave cerca del
máximo; se declara así y no mejor.

| # | Predicción | Qué la falsaría |
|---|---|---|
| **E1** | **La línea base es plana.** Con el ecualizador puenteado, capturado ÷ transmitido no se aparta más de **1,0 dB** entre 40 Hz y 16 kHz, después de restarle su propia media | Que no lo sea: el banco no sirve de referencia y todo lo demás es la suma del banco y el filtro |
| **E2** | **La banda 1 es un filtro de campana**, no un estante: con la ganancia al máximo la curva sube, alcanza un máximo y **vuelve a bajar** a los dos lados, al menos 6 dB de cada lado | Que no baje de un lado: es un estante, y «frecuencia central» quiere decir otra cosa |
| **E3** | **`f0` sigue `20·1102,5^V`** dentro del **5 %**, en al menos 6 crudos repartidos entre 0,1 y 0,9 | Que se desvíe. La función del `mixer.html` no describe el filtro |
| **E4** | **La recta queda excluida.** En al menos un crudo, `f0` se aparta de `20 + 19980·V` en más de un **factor de 2** | Que no: los dos modelos serían indistinguibles con este instrumento y la corrida no decide nada |
| **E5** | **El Q sigue `0,05·300^V`** dentro de un **factor de 1,3**, medido como `f0 / Δf` con `Δf` el ancho a **mitad de la ganancia en dB** | Que se desvíe más. Ojo: el umbral es flojo a propósito, porque la definición de Q de un filtro de campana varía entre fabricantes; sirve para separar 1,0 de 5,4, no para afinar una cifra |
| **E6** | **Ida y vuelta.** Repetir el primer crudo al final da el mismo `f0` dentro de **1,5 %** y la misma línea base dentro de **0,5 dB** | Que no: algo del banco se movió y la corrida no vale |

### Lo que NO se declara con umbral

**La ganancia máxima se informa, no se puntúa.** El manual dice ±20 dB y el
código ±15, y esta corrida va a ver cuánto sube la campana con el crudo en 1,0.
Pero el pico de una campana **no es** la ganancia del parámetro salvo que el
filtro esté normalizado de cierta manera, y eso no se sabe. Se publica el número
con esa salvedad y **no se toca la entrada de la ganancia**.

## Lo que esta corrida NO va a poder decir

- **Nada sobre las otras cuatro bandas.** Se mide `b1`. Que `b2`…`b5` usen la
  misma ley es lo más probable y no está medido.
- **Nada sobre el pasa-altos ni el pasa-bajos.** Son otros parámetros y otra
  forma.
- **Nada sobre la ganancia del ecualizador**, por lo dicho arriba.
- **Y medir la curva no la vuelve `PROBADO` en las dos direcciones.** Esto mide
  crudo → Hz. Que `toRaw` acierte es lo mismo invertido **sólo si la función es la
  que se midió**; si `f0` sigue la exponencial pero con otra base, la inversa
  también cambia. Se declara qué quedó medido y en qué dirección.
- **Un canal, una banda, un nivel de estímulo.**

## Restauración

Se escriben **`i.9.eq.bypass`, `i.9.eq.b1.freq`, `i.9.eq.b1.gain` y
`i.9.eq.b1.q`**, y los cuatro valores previos se leen del aparato con
`exigirClave`, que falla si la lectura no llegó en vez de suponer. La restauración
va por `conRestauracion`, que corre también si llega una señal, y se comprueba
**releyendo por HTTP**, que es un camino distinto del que escribió.

**No hay nada conectado a ninguna salida física** salvo los dos cables del bucle,
así que esta corrida no hace ruido en la sala. El supresor del general se apaga
mientras suena el estímulo y se restaura: un tono sostenido le planta notches.
