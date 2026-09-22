# 118 — El umbral del compresor: ¿cuántos decibeles mueve cada vuelta del control?

## MEDIDO el 2026-09-16: 96,4 dB por unidad. La pendiente del cliente ACIERTA.

Evidencia:
[`umbral-del-compresor-2026-09-16c.txt`](../spikes/SPK-P0.10b-vu2/evidence/umbral-del-compresor-2026-09-16c.txt).
Los cuatro controles en verde, con la cadena en **0,9970** de pendiente puenteada.

| se lee el nivel donde la reducción llega a | pendiente medida | residuo máx. | puntos |
|---|---|---|---|
| 2 dB | 96,7 dB/unidad | **0,04 dB** | 6 |
| 3 dB | 96,7 dB/unidad | 0,15 dB | 6 |
| 6 dB | 95,9 dB/unidad | 0,06 dB | 5 |
| **promedio** | **96,4** | — | — |

**El cliente dice 96. Cociente 1,005.** Y las tres formas de leerlo coinciden
dentro del **0,9 %**, que es C4: el resultado no depende de dónde se mire.

### Lo que esto corrige, que es más grande que la medición

**`VtoTHRESH` figuraba como REFUTADA, y no lo estaba.**

El [ítem 97](97-leyes-del-compresor.md) refutó la **conjunción** —umbral +
relación + rodilla dura—, y de ahí se pasó a marcar **las dos fórmulas** como
refutadas. Eso afirma más de lo medido: si una de las tres piezas está mal, el
conjunto falla sin que las otras tengan la culpa.

El [ítem 117](117-la-curva-del-compresor.md) midió que **el error estaba en la
relación**. Éste midió el umbral **solo** —alineando curvas de reducción, sin
suponer ninguna relación— y aguanta.

**Corregido donde estaba**: en `protocol-spec.md` §6.3, en `raw-map.ts` —que pasa
de `REFUTADO` a `INFERIDO`— y en los dos tests que exigían el estado viejo.

**Y NO pasa a `PROBADO`, que sería el otro exceso.** Una ley son dos cosas y acá
hay una: **falta el cero**. Para decir «el crudo 0,5 son −42 dB **en la consola**»
hay que anclar su escala interna contra el banco, y este banco no tiene ese ancla.
El contrato lo dice desde antes de medir.

### Y apareció un tercer culpable del que nadie sospechaba

**La rodilla dura tampoco es cierta.** La pendiente por encima del codo **sube con
el nivel**: de 0,05 pegada al codo hasta 0,55 veinte decibeles más arriba, en los
cinco umbrales. Ver
[el hallazgo](../backlog/hallazgo-el-compresor-no-tiene-una-relacion.md).

**Eso obliga a releer el 117**, cuya «relación» resulta ser el promedio de una
curva en una ventana, y explica la deriva del 3 % que aquel ítem había dejado
anotada sin explicación.

### Dos corridas fallaron antes, las dos en C4, y las dos aportaron

1. [`umbral-del-compresor-2026-09-16.txt`](../spikes/SPK-P0.10b-vu2/evidence/umbral-del-compresor-2026-09-16.txt):
   con la escalera de doce escalones, los umbrales altos dejaban la rodilla
   **fuera del recorrido** y el ajuste se apoyaba contra el borde. C4 falló con
   0,709 de deriva.
2. [`umbral-del-compresor-2026-09-16b.txt`](../spikes/SPK-P0.10b-vu2/evidence/umbral-del-compresor-2026-09-16b.txt):
   con la escalera extendida a catorce escalones y cuatro puntos mínimos por lado
   —o sea, **corregida la geometría**— C4 **volvió a fallar**, con 0,155.

**Que fallara la segunda vez es lo que convirtió un problema en un hallazgo.** La
primera era del borde; la segunda no podía serlo. Lo que quedaba era que el modelo
de dos rectas estuviera mal, y lo estaba.

**No se aflojó C4 en ningún momento.** Se cambió el método por uno que no supone
la forma de la curva.

---


**Contrato escrito el 2026-09-16, ANTES de tocar la consola.** Consola
192.168.0.78. Canal 10 (`i.9`) → general → entrada 1 de la Scarlett.

## Qué decide, y por qué la pregunta cambió hoy

**Cuánto se mueve el punto donde el compresor empieza a actuar, por cada unidad
del control.** El cliente dice `VtoTHRESH(a) = −90 + 96a`, o sea **96 dB por
unidad de crudo**, y el manual declara el mismo recorrido: «Threshold -90dB +6dB».

**Esa fórmula figura como REFUTADA en la tabla de conversión, y leyéndola de cerca
resulta que nunca se probó sola.** Textual del [ítem 97](97-leyes-del-compresor.md):

> *«`VtoTHRESH(a) = −90 + 96a` **junto con** `VtoRATIO(a) = 1/a` y una rodilla
> dura no describen este compresor.»*

Es una refutación de **la conjunción**. Y el [ítem 117](117-la-curva-del-compresor.md),
medido hoy, encontró que **`1/a` está mal por un factor**: la relación real es
`1 + 0,548·(1/a − 1)`. O sea que **el culpable podía ser enteramente la relación**,
y el umbral estar sano.

**Esta corrida lo prueba solo**, sin suponer ninguna relación.

## Cómo se mide

**Mirando dónde cae la rodilla.** La escalera del 117 —doce niveles de entrada en
una captura— parte la curva en dos: abajo pendiente 1, arriba la relación. **El
punto donde se cruzan las dos rectas es el umbral.**

Se repite con varios crudos de `i.9.dyn.threshold` y **se mira cuánto se corre la
rodilla**. Si el cliente tiene razón, moverla 0,05 de crudo la corre 4,8 dB.

**Esto no supone ninguna relación**: la rodilla es donde las dos rectas se cortan,
y eso no cambia según cuánto comprima la de arriba.

## La rodilla se calcula por CRUCE, no por escalón

El 117 informaba en qué escalón caía, y eso da tres decibeles de resolución —el
paso de la escalera—. **Con 96 dB por unidad, tres decibeles son 0,03 de crudo, y
el barrido entero entra en 0,16.** Con esa resolución no se distingue nada.

Así que acá la rodilla sale del **cruce de las dos rectas ajustadas**, que usa los
doce puntos y da una posición continua. Es el mismo dato, leído mejor.

## Lo que esta corrida puede y no puede afirmar, dicho antes

**Puede afirmar la PENDIENTE**: cuántos decibeles por unidad de crudo. Eso no
necesita saber a qué nivel interno de la consola corresponde cada dBFS del banco,
porque es una diferencia.

**No puede afirmar el CERO.** Para decir «el crudo 0,5 es −42 dB **en la consola**»
haría falta anclar la escala interna del aparato con la del banco, y este banco no
tiene ese ancla: entre la salida de la interfaz y el canal hay un previo analógico
cuya ganancia se lee de la pantalla y **no está medida contra el audio**.

**Se informa el cruce en dBFS del banco**, que es reproducible acá y no
generalizable. Decirlo antes evita que el número se cite después como si fuera la
escala de la consola.

## Los controles

**C1 — la escalera llega entera**: el escalón más bajo, al menos 40 dB sobre el
piso.

**C2 — con el compresor puenteado la pendiente es 1,000 ± 0,02.** El mismo control
que hizo honesto al 117: si la cadena no es lineal, cualquier rodilla que salga es
suya.

**C3 — la rodilla cae DENTRO de la escalera en todos los crudos**, con al menos
tres escalones de cada lado. El crudo que no lo cumpla **se informa y se descarta**,
no se ajusta con él.

**C4 — la relación no se mueve.** Con el mismo `ratio` fijo, la pendiente de
arriba tiene que dar lo mismo en todos los umbrales, dentro de **0,05**. Si
cambia, la rodilla que se está midiendo no es sólo el umbral y el ajuste mezcla
dos cosas.

## Las expectativas, declaradas antes de mirar

- **L1 — la rodilla se mueve de forma lineal con el crudo**, con residuo máximo de
  **1,5 dB**.
- **L2 — la pendiente**: se informa el número medido y se compara con los **96**
  del cliente. **Hay tope**: si cae entre **86 y 106** —±10 %— la fórmula del
  cliente queda **confirmada en su pendiente**, y eso sería un cambio de estado
  real para una entrada que hoy dice REFUTADO.
- **L3 — monotonía**: más crudo, rodilla más arriba.

**Si falla C1, C2 o C4, no se publica ninguna pendiente.**

## Lo que esta corrida NO va a decir

- **Nada del cero de la escala**, explicado arriba.
- **Nada de la rodilla blanda**: `softknee` se lee y se deja.
- **Nada del umbral de la puerta**, que usa la misma función del cliente y **no se
  mide acá**. Si el compresor la confirma, la de la puerta sigue sin probar: la
  tabla de conversión ya dice que apoyarse en eso sería afirmar más de lo medido.
- **Un canal, una relación, una frecuencia, un día.**

## Qué se escribe, y qué vuelve

Las mismas claves del [117](117-la-curva-del-compresor.md), con su `PREVIO`, su
`conRestauracion`, su papelito y su relectura por HTTP. **El fader del general no
se toca.**

## Trabajo previo

**Buscado el 2026-09-16 con los cuatro repositorios clonados**, y sobre todo en
casa, que es donde estaba lo que cambia la pregunta.

- **`fmalcher/soundcraft-ui`** lleva `threshold` como número crudo y **no lo
  convierte**. Los otros tres no lo tocan. Ver
  [`trabajo-previo-de-terceros.md`](../referencia/trabajo-previo-de-terceros.md).
- **El cliente**: `VtoTHRESH(a) = −90 + 96a`. **El manual coincide**: «Threshold
  -90dB +6dB», que es la misma recta evaluada en 0 y en 1.
- **Propio, ítem 97**: la refutación es **de la conjunción**, no del umbral solo.
  Su prueba —tres curvas de sustitución que deberían coincidir y no coinciden— cae
  igual si el error está en la relación.
- **Propio, ítem 117**: midió que el error **está** en la relación.
- **Propio, ítem 98**: vio una pendiente cercana a **95,6** por sustitución y
  **se prohibió publicarla**, por venir despejada a través de una meseta. Esta
  corrida no despeja nada: mide dónde está la rodilla.

**Que el 98 haya visto 95,6 no es una confirmación**, y conviene decirlo antes de
medir: es un número obtenido con un método que ese mismo ítem declaró inválido
para esto. **Si esta corrida da algo parecido, será la primera vez que el número
salga de un método válido** — y si da otra cosa, no habrá contradicción que
explicar, porque aquél nunca valió.
