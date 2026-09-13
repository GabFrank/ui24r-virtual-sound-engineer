# 104 — La ley del envío a monitor, contra la salida real

**Fecha: 2026-09-13.** Consola 192.168.0.78, canal 10 (`i.9`) → auxiliar 5
(`a.4`) → entrada 2 de la interfaz. Contrato escrito **antes** de tocar nada.

## Qué decide, y por qué vale la pena

`i.N.aux.M.value` son **240 rutas** que ADR-028 decidió abrir a la aplicación, con
techo y fuera del show. El techo ya tiene productor. **Lo que falta es la
conversión**: sin una ley medida, `aRaw` rechaza con `NO_PROBADO` y
`verificarAtadura` no puede atar la magnitud al crudo, así que el motor seguiría
juzgando lo que el llamador declara.

**La medición 94 intentó esto y se declaró indecidible.** Su conclusión, textual:

> *«El desvío observado contra `faderADb` no supera un escalón del medidor en los
> catorce puntos comparados, sobre 27,87 dB desde el tope. Eso es todo.»*

Y su propia sección de cierre dice qué haría falta:

> *«Rehacer este barrido por el auxiliar 5, que tiene el ecualizador plano y está
> cableado a la interfaz. Con 22,67 dB más de recorrido y la salida real mirando,
> la ley del envío se mediría sobre el doble de tramo y contra un instrumento
> externo. No está hecho.»*

Esto es eso.

### Lo que ya se sabe del banco, y de dónde sale

La medición 102 barrió este mismo envío por este mismo camino —para otra cosa: su
contrato declara *«nada sobre la ley del envío»*— y su evidencia archivada
contiene la salida real en 22 crudos.

**Ese dato NO se usa como resultado**: se usa para saber qué esperar y para elegir
los umbrales antes de medir. Lo que dice, calculado sobre
[`escala-del-bloque-de-bus-2026-09-13.txt`](../spikes/SPK-P0.10b-vu2/evidence/escala-del-bloque-de-bus-2026-09-13.txt):

| | |
|---|---|
| Tramo de la salida real | **54,86 dB** — casi el doble de los 27,87 de la 94 |
| Desvío contra `faderADb` | **0,21 dB** máximo, y por debajo de 0,03 en 20 de 22 puntos |
| Dónde crece | en el punto más bajo, que es el de peor margen |

Así que la predicción de esta corrida es concreta y falsable: **si el desvío
supera 0,3 dB, algo no está donde este proyecto cree.**

## El método

El mismo de la 102, que el banco ya tiene caracterizado:

1. **Tono de 1 kHz** al canal 10 por la Scarlett, la fuente quieta.
2. **El fader del auxiliar como atenuador fijo** en 0,45, para que la interfaz no
   recorte con el envío en 1,0. Es una ganancia estática y se cancela.
3. **Se barre `i.9.aux.4.value`** y se mide la **salida real** por la entrada 2.
4. **La atenuación se compara contra `faderADb`**, que es la ley que la 94
   registró como hipótesis P1 y no pudo decidir.

**Y el crudo se relee por HTTP en cada punto — leyendo UNA clave, no las 6665.**
`estadoPorHttp` paga su tope de 8000 ms **en cada llamada**, y no por lentitud:
`/raw` entrega el volcado y después **sigue emitiendo `RTA` a 30 Hz**, así que la
carrera de 900 ms sin datos con la que corta nunca la gana el silencio. Con 46
puntos serían **368 segundos** de los 900 que dura el tono, para leer una clave
por punto. Lo midió un auditor antes de correr. La 99b midió que el crudo del
*fader* no se redondea; del **envío** no se sabe, y la 102 no lo comprobó — un
auditor lo marcó. Si la consola redondeara, el error entraría en la ley sin tener
nada que ver con ella.

## Las precondiciones

| Qué | Cómo queda |
|---|---|
| Puerta y compresor del auxiliar | **se puentean** — dependen del nivel |
| Compresor, puerta y de-esser del canal | **se puentean** |
| Supresor del auxiliar | se **exige** apagado: 900 s de tono sostenido le plantan filtros |
| Ecualizador del auxiliar 5 | plano —**medido**: 0 de 31 claves fuera del centro— y no se toca |
| Quién más alimenta el auxiliar 5 | se censa y **aborta** si hay otra tira abierta |

## Las expectativas

| # | Predicción | Qué la falsaría |
|---|---|---|
| **L1** | **El medidor del canal no se mueve** más de 0,667 dB: el envío es pre-fader | Que se mueva |
| **L2** | **La referencia interna no se mueve** más de 0,2 dB | Que se mueva |
| **L3** | **La atenuación de la salida real sigue a `faderADb`** dentro de **0,3 dB** en los puntos con 45 dB de margen | Que se desvíe. Sería la primera evidencia medida afuera de que el envío **no** usa la ley del fader |
| **L3b** | **El residuo no está estructurado**: la recta de `d` contra la atenuación predicha tiene pendiente dentro de **0,004 dB/dB**, y el signo no es unilateral | Que lo esté. **Y es la expectativa que de verdad decide** — ver abajo |
| **L4** | **El recorrido medido supera los 45 dB** | Menos: no mejora lo suficiente sobre los 27,87 de la 94 para valer la corrida |
| **L5** | **La consola no redondea el crudo del envío**: lo releído coincide con lo escrito | Que redondee: el error entra en la ley y hay que descontarlo |
| **L6** | **Ida y vuelta** dentro de 0,3 dB | Histéresis o falta de asentamiento |
| **L7** | **El arranque repetido al cierre** dentro de **0,2 dB** | Se movió la ganancia analógica de captura |

### El 0,3 dB de L3 no es holgura sobre ruido, y hay que decirlo antes

La primera versión de este contrato decía «lo esperable es 0,03; pedir 0,3 deja un
factor diez». **Es falso, y lo encontró un auditor recalculando los residuos de la
102 punto por punto.** El peor punto que L3 va a puntuar desvía **0,21 dB**, así
que el margen real es **1,4×**, no diez.

Peor: ese crecimiento **no es ruido**. En el crudo 0,15 el instrumento erra
0,024 dB y el desvío es 0,211 — nueve veces. Y los 22 residuos tienen **el mismo
signo**, todos superan el error del instrumento, y **crecen monótonamente desde el
crudo 0,30**.

**Eso es la firma que la medición 94 describió** —*«unilateral y creciente,
truncado por el piso»*— reproducida en un banco **donde ya no hay piso de medidor
que la explique**.

Así que: el umbral se deja en 0,3 para no cambiarlo después del dato, y se declara
por adelantado que **un PASA de L3 con el máximo por encima de 0,10 dB no es un
acuerdo: es el residuo de la 94 dentro de la cota.**

### Y por eso L3b, que es la que decide

**Una cota de máximo absoluto no ve la estructura.** La medición 102 había
declarado su B5 independiente de B4 por exactamente este motivo, y el guión de
esta corrida —que se deriva del suyo— se llevó B5 y dejó la cota.

**L3b es independiente de L3 y se declara antes de mirar.** Su modo de falla
propio es el residuo correlacionado con el crudo. **Si L3 pasa y L3b falla, gana
L3b y el hallazgo es la estructura**, no el acuerdo.

**L4 casi no puede fallar, y también se declara.** La regla que anula por debajo
de 45 dB de margen, con el piso del bin de este banco, garantiza puntos útiles
hasta unos −73 dBFS: unos 60 dB de tramo. L4 no es una predicción sobre la
consola sino un control de que el banco no se degradó.

**L1 no prueba que el envío sea pre-fader.** Barrer un envío no mueve el medidor
del canal del que se deriva, esté donde esté la derivación. L1 es el testigo de
que la fuente no se movió; que `post = 0` se lee del aparato y **se exige**.

**Y L5 sólo puede ver un redondeo si el barrido pasa por crudos que la rejilla del
redondeo no contiene**: `0,95` sobrevive exacto a cualquier cuantizador a
centésimos. Se agregaron dos crudos fuera de la rejilla a propósito.

### Y lo que se informa sin puntuar

**Los puntos anulados por margen, con su desvío contra `faderADb` y el error de su
instrumento al lado.** En la 102 el crudo 0,10 desviaba **1,01 dB** con un error
de instrumento de 0,06: **está descartado por higiene, no por ruido**, y el hecho
de que el veredicto de L3 dependa de si ese punto entra o no **es parte del
resultado**.

## Lo que esta corrida NO va a poder decir

- **Nada sobre el cero absoluto.** Es una medición **relativa al crudo 1,0**, así
  que un error de escala constante es invisible por construcción. Que el crudo
  0,7647 sea «0 dB de envío» no se mide acá — la 94 ya había declarado esa
  predicción infalsable desde el diseño.
- **Nada sobre la ley inversa.** Esto mide crudo → dB. Que `dbAFader` acierte es
  lo mismo invertido **sólo si la función es la que se midió**, y la inversa
  arrastra la pendiente local.
- **Un auxiliar, un canal, una frecuencia, un nivel de fuente.** De los otros
  nueve auxiliares no se dice nada.
- **Y un acuerdo dentro del umbral es una cota, no una identidad.**

## Restauración

**Siete claves** —el envío, el fader del auxiliar, su puerta y su compresor, y el
compresor, la puerta y el de-esser del canal— leídas con `exigirClave` antes de
escribir, restauradas por `restaurarClaves` —que reconecta— y comprobadas
**releyendo por HTTP**.

**El supresor no se escribe nunca**: se exige apagado y la corrida aborta si no lo
está, que es más barato y más seguro que restaurarlo. La primera versión de esta
sección prometía apagar el tono y esperar dos segundos antes de tocarlo — un
párrafo heredado de otro spike, porque **este guión no toca el supresor en ningún
momento**.

*(La 102 restauraba ocho claves: la octava era el envío al auxiliar 3, de su
control cruzado, que esta corrida no hace.)*
