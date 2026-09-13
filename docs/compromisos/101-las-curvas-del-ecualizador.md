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

## Las precondiciones, verificadas ANTES de escribir nada

**Entre la banda 1 y la entrada de la interfaz no hay sólo un cable.** Está el
resto del canal —su compresor, su puerta, su de-esser— y después el general
entero. El estímulo sube hasta **12 dB de pico** cuando la campana se levanta, y
cualquier cosa dependiente del nivel aplasta justamente la punta de la campana,
que es de donde salen `f0`, la altura y el Q.

**Una ganancia estática se cancela en la resta contra la línea base. Una no lineal
no.** Ésa es toda la regla, y es la que la 99b tuvo que aprender midiendo.

| Qué | Cómo queda | Por qué |
|---|---|---|
| Compresor del canal | **se puentea** | depende del nivel |
| Puerta del canal | **se apaga** | ídem |
| De-esser del canal | **se apaga** | es un compresor **de banda**, y actúa justo donde la campana levanta: el peor de todos |
| Compresor del general | **se puentea** | la 99b ya lo había establecido |
| Ecualizador del general, su fader, el supresor apagado | se leen, se registran, **no se tocan** | son ganancias **estáticas** y se cancelan en la resta |
| Bandas b2…b5, pasa-altos, pasa-bajos | se leen y **su contribución se mide** | ver abajo |

**Y la línea base se toma con el ecualizador ADENTRO, no puenteado.** Puentearlo
entero y después meterlo entero haría que la resta entregue
`b1 × b2 × b3 × b4 × b5 × hpf × lpf`, y no `b1`. Con el ecualizador adentro y
**b1 en su ganancia neutra**, las otras cuatro bandas y los dos filtros están en
las **dos** capturas y se cancelan igual que se cancela la interfaz, el cable y el
previo.

Que la ganancia previa de b1 sea neutra **no se supone**: se toman las dos líneas
base —puenteada y adentro— y su diferencia **es** la contribución del resto del
ecualizador. Se mide y se publica.

## El nivel del estímulo, que decide si la corrida sirve

La primera versión de este contrato ponía el pico del estímulo en **−8 dBFS**, y
los números dicen que habría recortado antes de medir nada:

- La 99b midió en **este mismo banco**, este canal, con `hw.9.gain = 0,2508445026`:
  tono a −15 dBFS, pico capturado −6,9. Son **+8,1 dB de ganancia de cadena**.
- Con el estímulo a −8 dBFS, la **línea base** llega a **+0,1 dBFS**.
- Y la campana encima sube el pico **+8,6 dB** con 15 dB de ganancia y **+12,0 dB**
  con 20 —medido sintetizando los 104 tonos con el filtro—, y la ganancia del
  parámetro **no se conoce**.

Así que el estímulo va a **−27 dBFS de pico**, que deja cada tono en −58,2 dBFS:
contra el piso del bin que la 99b midió en este banco, **56 dB de margen**, once
arriba de los 45 que se exigen. Bajar el estímulo no cuesta nada; recortar arruina
la corrida entera. **Y el recorrido se calcula del banco antes de barrer**: si no
alcanza, la corrida aborta diciendo cuántos decibeles hay que bajar.

## El control positivo, sin el cual la corrida miente en la dirección más fuerte

Si la escritura no llega al filtro —el Easy EQ activo, el crudo no aceptado, la
banda no enganchada— lo que se mide es ruido. Y sobre ruido puro este instrumento
**devuelve un pico en el 98 % de los sorteos** y un Q de **mediana 15,5**. La
corrida cerraría diciendo *«el `mixer.html` no describe el filtro»*, que es la
conclusión más fuerte y más equivocada que puede emitir.

Así que antes de barrer se comprueba que **la campana suba al menos 6 dB**, y si
no sube, la corrida aborta nombrando `eq.easy` y `eq.prmod`. Y se **relee el crudo
escrito por HTTP**: la 99b midió que el crudo del *fader* no se redondea, pero del
ecualizador no se sabía nada, y una cuantización se comería el 5 % de E3 sin tener
nada que ver con la ley.

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
| **E1** | **La línea base es plana.** Con el ecualizador puenteado, capturado ÷ transmitido no se aparta más de **1,0 dB** entre 40 Hz y **15 343 Hz**, que es donde el estímulo termina de verdad, después de restarle su propia media | Que no lo sea. **Y no invalida el resto**: todo lo que sigue se mide como diferencia contra la línea base, y una irregularidad **estática** del camino se cancela ahí. Lo que falsa es la afirmación «el banco es plano», que es un dato sobre el banco y se publica como tal |
| **E2** | **La banda 1 es un filtro de campana**, no un estante: con la ganancia al máximo la curva sube, alcanza un máximo y **vuelve a bajar al menos 6 dB de cada lado**, **en los crudos cuya campana entra entera en la ventana de 40 Hz a 15 343 Hz** | Que no baje de un lado **en un crudo que sí entra entero**: es un estante. En los crudos de los extremos el lado corto es el que da contra el borde del estímulo —una campana con `f0` en 57 Hz sólo puede caer 5,6 dB antes de los 40 Hz— y ahí se informa y **no se puntúa**: lo que limita es la ventana, no el filtro |
| **E3** | **`f0` sigue `20·1102,5^V`** dentro del **5 %**, en al menos 6 crudos repartidos entre 0,1 y 0,9 | Que se desvíe. La función del `mixer.html` no describe el filtro |
| **E4** | **La recta queda excluida.** En al menos un crudo, `f0` se aparta de `20 + 19980·V` en más de un **factor de 2** | Que no: los dos modelos serían indistinguibles y la corrida no decide nada. **Y es subordinada, declarado acá para que nadie la lea como confirmación independiente:** el factor entre las dos leyes en los ocho crudos va de **1,64 a 52,75**, así que **si E3 pasa, E4 pasa necesariamente**. Su valor es el otro: si E3 *falla*, E4 dice si falló porque la ley es la recta (factor ≈ 1) o porque no es ninguna de las dos |
| **E5** | **El Q sigue `0,05·300^V`** dentro de un **factor de 1,3**, medido como `f0 / Δf` con `Δf` el ancho a **mitad de la ganancia en dB** | Que se desvíe más. Ojo: el umbral es flojo a propósito, porque la definición de Q de un filtro de campana varía entre fabricantes; sirve para separar 1,0 de 5,4, no para afinar una cifra |
| **E6** | **Ida y vuelta.** Repetir **el crudo de 1 kHz** —el mejor condicionado, con 55 tonos de un lado y 47 del otro— da el mismo `f0` dentro de **1,5 %** y la misma línea base dentro de **0,5 dB** de forma | Que no: algo del banco se movió. **Y el nivel se publica aparte**: a las dos líneas base se les resta su media, así que una deriva **uniforme** del camino de captura es invisible en la comparación de formas — y es la que sesga todas las alturas y por tanto todos los Q (medido: 0,5 dB de deriva mueve un Q de 1,004 a 0,963) |

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
- **El tope del recorrido no queda medido.** El `mixer.html` declara 20 Hz …
  22 050 Hz y esta corrida mide `V` entre 0,15 y 0,90, porque afuera de eso el
  pico cae en el borde de la ventana. Con el 5 % de E3 la familia de `A·B^V` que
  también pasa tiene la base entre **968 y 1256**, lo que en `V = 1` es una
  frecuencia entre **18 083 y 26 885 Hz**. La corrida publica esa cota calculada
  sobre sus propios datos: *«`20·1102,5^V` medida»* se va a leer como «el rango
  20–22 050 está medido», y no lo está.
- **Y E5 tampoco fija la base en 300.** La familia que cae dentro del factor 1,3
  admite bases entre 67 y 1343. E5 separa la exponencial de la recta y poco más,
  que es para lo que se puso.
- **La dispersión de las alturas no es una no linealidad de la ganancia.** En los
  crudos bajos la campana se sale por abajo de la ventana y en los altos el biquad
  se deforma cerca de Nyquist: los dos extremos miden **la ventana**. Si hace falta
  una cifra de ganancia es la del control positivo a 1 kHz, y sola.
- **`eq.easy` y `eq.prmod` se leen y se registran, no se verifican.** Están vistos,
  no comprobados — salvo por lo que el control positivo delata de manera indirecta.

## Restauración

Se escriben **`i.9.eq.bypass`, `i.9.eq.b1.freq`, `i.9.eq.b1.gain` y
`i.9.eq.b1.q`**, y los cuatro valores previos se leen del aparato con
`exigirClave`, que falla si la lectura no llegó en vez de suponer. La restauración
va por `conRestauracion`, que corre también si llega una señal, y se comprueba
**releyendo por HTTP**, que es un camino distinto del que escribió.

**No hay nada conectado a ninguna salida física** salvo los dos cables del bucle,
así que esta corrida no hace ruido en la sala. El supresor del general se apaga
mientras suena el estímulo y se restaura: un tono sostenido le planta notches.

---

# Resultado

**Corrida del 2026-09-13**, archivada en
`docs/spikes/SPK-P0.2b/evidence/curvas-del-ecualizador-2026-09-13b.txt`.
Canal 10, multitono de 104 tonos de 40 Hz a 15 343 Hz, pico del estímulo a
−27 dBFS, 14,6 dB de recorrido antes del recorte.

## Las seis expectativas

| # | Umbral | Resultado | |
|---|---|---|---|
| **E1** | línea base plana, 1,0 dB | **0,82 dB** | **PASA** |
| **E2** | campana, 6 dB de caída a los dos lados | **6 de 6** curvas | **PASA** |
| **E3** | `f0` contra `20·1102,5^V`, 5 % | **0,24 %** sobre 6 crudos | **PASA** |
| **E4** | la recta excluida, factor > 2 | **factor 43,4** | **PASA** (subordinada) |
| **E5** | `Q` contra `0,05·300^V`, factor 1,3 | **×1,02** sobre 5 crudos | **PASA** |
| **E6** | la vuelta, 1,5 % y 0,5 dB | **0,03 %** y 0,09 dB | **PASA** |

Y la dispersión punto a punto entre las dos líneas base dio **0,024 dB rms**, por
debajo de los 0,05 de los que cuelga la resolución declarada: el ±1,5 % se
sostiene.

## Las dos leyes, medidas contra el filtro

| Crudo | `f0` medido | `20·1102,5^V` | La recta que el código tenía | Error |
|---|---|---|---|---|
| 0,2500 | **116 Hz** | 115 | 5 015 | 0,2 % |
| 0,3287 | **200 Hz** | 200 | 6 587 | 0,2 % |
| 0,5584 | **1 001 Hz** | 1 000 | 11 178 | 0,1 % |
| 0,6500 | **1 900 Hz** | 1 899 | 13 007 | 0,1 % |
| 0,7563 | **4 006 Hz** | 4 000 | 15 131 | 0,1 % |
| 0,9000 | **10 929 Hz** | 10 944 | 18 002 | −0,1 % |

| Crudo | `Q` medido | `0,05·300^V` | La recta | Factor contra la recta |
|---|---|---|---|---|
| 0,3500 | **0,376** | 0,368 | 3,69 | ×0,10 |
| 0,4500 | **0,660** | 0,651 | 4,67 | ×0,14 |
| 0,5252 | **1,010** | 1,000 | 5,39 | ×0,19 |
| 0,6200 | **1,728** | 1,717 | 6,31 | ×0,27 |
| 0,7000 | **2,691** | 2,710 | 7,09 | ×0,38 |

**Los tres crudos de fábrica cayeron donde la exponencial decía**: 200 Hz, 1 kHz y
4 kHz, y el Q de fábrica en 1,010. Eso no era una predicción del contrato, pero
estaba anotado antes de medir y salió.

## Lo que se promovió, y hasta dónde

`i.N.eq.b1.freq` y `i.N.eq.b1.q` pasan a **`PROBADO`** — las primeras dos rutas
escribibles por vía cruda que tiene este proyecto.

**Pero con el rango medido, no con el del recorrido entero.** Se declara
`rawMin`/`rawMax` en 0,25–0,90 y 0,35–0,70, con lo que `aRaw` rechaza con
`FUERA_DE_RANGO` cualquier frecuencia fuera de 115 Hz … 10,9 kHz o cualquier Q
fuera de 0,37 … 2,71. Los extremos del parámetro caen fuera de la ventana del
estímulo: ahí el pico de la campana da contra el borde y lo que se mediría sería
el borde.

**Y la cota está publicada**: la familia de `A·B^V` que también cae dentro del 5 %
en los crudos medidos tiene la base entre **949 y 1268**, o sea que en el crudo
1,0 la frecuencia queda entre **17 530 y 27 675 Hz** contra los 22 050 declarados.
El tope **no está medido**.

## Un hallazgo que no era el objetivo: la ganancia sube 20 dB, no 15

La campana subió **20,0 dB exactos** en los ocho puntos del barrido, con el crudo
de ganancia en 1,0. `raw-map.ts` declara ±15 dB y el manual ±20.

**No alcanza para cambiar la entrada, y se dice por qué.** El pico de una campana
no es el parámetro de ganancia salvo que el filtro esté normalizado de cierta
manera, y eso no se sabe. Y se midió **un solo crudo de ganancia** —el extremo—,
así que de la *forma* de esa ley no se sabe nada: podría no ser lineal. Queda
`DESCONOCIDO` con el hallazgo anotado.

## Dos corridas, y por qué

La primera **perdió el WebSocket a mitad de camino y la restauración también
falló**, dejando la consola con cinco claves cambiadas. Se restauró a mano y se
verificó por HTTP.

La causa la documenta el propio transporte: el latido `ALIVE` va en un
`setInterval` de 1000 ms, y `respuesta()` hacía **seis a diez segundos de cálculo
sincrónico**, que bloquean el bucle de eventos. Bloquearlo diez segundos es
exactamente lo mismo que no mandar el latido. Ahora el análisis cede el turno una
vez por tono, y existe `restaurarClaves()`, que **reconecta antes de restaurar** —
lo que vale para los 46 guiones del proyecto, no sólo para éste.

## Restauración, comprobada

Las nueve claves releídas por HTTP, todas coincidiendo. Se puentearon durante la
corrida el compresor del canal, su puerta, su de-esser y el compresor del general
—todo lo dependiente del nivel— y se restauraron.
