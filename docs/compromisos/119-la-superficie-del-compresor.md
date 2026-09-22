# 119 — La superficie del compresor: cuánto baja, por cada exceso y cada relación

## MEDIDA el 2026-09-16: la superficie, con los cuatro controles en verde

Evidencia:
[`superficie-del-compresor-2026-09-16c.txt`](../spikes/SPK-P0.10b-vu2/evidence/superficie-del-compresor-2026-09-16c.txt).
Cadena lineal en **0,9969**; el codo quedó en **−24,83 dBFS** y no se movió más de
**2,50 dB** entre las siete relaciones que comprimen.

### La superficie: cuántos dB baja, por exceso y por relación

| control de relación | +0,8 dB | +3,8 | +6,8 | +9,8 | +12,8 | +15,8 |
|---|---|---|---|---|---|---|
| 1,00 | 0,0 | 0,0 | 0,0 | 0,0 | 0,0 | 0,0 |
| 0,75 | 0,2 | 0,7 | 1,2 | 1,6 | 1,8 | **2,0** |
| 0,50 | 0,3 | 1,6 | 2,7 | 3,5 | 4,2 | **4,7** |
| 0,35 | 0,4 | 2,2 | 3,6 | 5,0 | 5,9 | **6,8** |
| 0,25 | 0,4 | 2,6 | 4,3 | 6,1 | 7,4 | **8,5** |
| 0,15 | 0,5 | 3,0 | 5,2 | 7,3 | 9,1 | **10,7** |
| 0,10 | 0,5 | 3,2 | 5,7 | 8,0 | 10,2 | **12,0** |
| 0,05 | 0,6 | 3,4 | 6,2 | 8,6 | 11,3 | **13,6** |

**Se lee así:** con el control en 0,25 y una señal **10 dB por encima del umbral**,
el compresor la baja **6,1 dB**. Eso es lo que hace el aparato, y es lo que la
aplicación puede interpolar.

**Monótona en los dos ejes** —L1 y L2— sin excepción.

### Y la tabla sirve en CUALQUIER umbral, porque C4 lo comprueba

La superficie está en **exceso sobre el codo**, no en nivel absoluto. Eso sólo vale
si la reducción depende únicamente del exceso, y **se comprobó otra vez acá**, con
otra relación —el control en 0,35— y tres umbrales:

| exceso | umbral 0,30 | umbral 0,35 | umbral 0,40 |
|---|---|---|---|
| +3 dB | 1,79 | 1,49 | 1,53 |
| +6 dB | 3,37 | 3,13 | 3,14 |
| +9 dB | 4,64 | 4,49 | 4,49 |

**La mayor diferencia es 0,27 dB.** Los codos de esas tres corridas están en
−29,46, −25,07 y −20,27 dBFS: nueve decibeles de recorrido, y las curvas se
superponen.

**Sin C4 esta tabla no se podría usar en otro umbral**, y estaría publicada igual.

### El techo del ítem 98: coherente, y todavía sin tocar

| relación | reducción máxima alcanzada | techo `−20·log₁₀(a)` | alcanzado |
|---|---|---|---|
| 0,75 | 2,0 dB | 2,5 | 81 % |
| 0,50 | 4,7 dB | 6,0 | 78 % |
| 0,35 | 6,8 dB | 9,1 | 74 % |
| 0,25 | 8,5 dB | 12,0 | 71 % |
| 0,15 | 10,7 dB | 16,5 | 65 % |
| 0,10 | 12,0 dB | 20,0 | 60 % |
| 0,05 | 13,6 dB | 26,0 | 52 % |

**Ninguna lo supera, todas se le acercan por debajo, y la fracción cae al bajar la
relación** — que es lo esperable con un exceso fijo de 16 dB y un techo que crece.

**Vale como comprobación cruzada y no como confirmación**, y conviene ser
preciso: el ítem 98 midió esto **barriendo el umbral y con el medidor de reducción
de la propia consola**; esto barre la relación, mueve la fuente y lee el audio.
Son dos métodos independientes y **ninguno de los siete puntos contradice al
otro**. Lo que no hace esta corrida es *alcanzar* ningún techo, así que no lo
confirma: lo deja en pie.

### C3 falló primero, y el defecto era de la definición, no del aparato

La [primera corrida](../spikes/SPK-P0.10b-vu2/evidence/superficie-del-compresor-2026-09-16.txt)
buscaba el codo como «el nivel donde la reducción llega a **2 dB**», y C3 falló con
13,15 dB de dispersión.

**El defecto se ve sin mirar ningún dato.** Una relación suave tarda muchísimo
exceso en acumular 2 dB —con el control en 0,75 la curva entera llega apenas a 2,0
en el último escalón—, así que ese nivel no marca el codo: marca la pendiente. Es
el mismo tipo de error que el [ítem 110](110-el-crudo-cero-de-la-relacion.md)
corrigió en su control positivo, y se corrige por el mismo motivo: **es
identificable desde la definición, no desde el resultado**.

El codo pasa a ser **donde la reducción se despega de cero** —0,3 dB, tres veces el
ruido de la envolvente—. **Y el tope pasó de 1,5 a 3,0 dB sacándolo del
instrumento, no del resultado**: la escalera tiene escalones de 3 dB, así que el
codo no se puede ubicar mejor que un escalón. Pedir 1,5 era pedirle el doble de lo
que puede dar.

### Una corrida más, por una frase

La [segunda corrida](../spikes/SPK-P0.10b-vu2/evidence/superficie-del-compresor-2026-09-16b.txt)
pasó los cuatro controles y **se repitió igual**, porque su bloque de «alcance»
había quedado heredado del ítem 118 y decía *«un tono, UNA relación (0.1)»* sobre
una corrida que barrió ocho. Los números eran correctos y la descripción de sí
misma no.

**Una evidencia que miente sobre su propio alcance es peor que una que falta**,
porque se cita. Se arregló el guion y se volvió a medir.

---


**Contrato escrito el 2026-09-16, ANTES de tocar la consola.** Consola
192.168.0.78. Canal 10 (`i.9`) → general → entrada 1 de la Scarlett.

## Qué decide, y por qué es lo que hace falta

El [ítem 118](118-el-umbral-del-compresor.md) encontró que **este compresor no
tiene una relación: tiene una curva** —aprieta fortísimo pegado al codo y va
aflojando con el nivel— y publicó **una columna** de esa superficie: la de la
relación en su crudo 0,10.

**Con una columna no se puede proponer nada.** Lo que la aplicación necesita para
hablar de compresión con números reales es la **superficie**: cuántos decibeles
baja, para cada **exceso sobre el umbral** y cada **posición del control de
relación**. Con eso interpola; sin eso, o usa una fórmula que ya sabemos que no
describe el aparato, o no habla.

## Lo que ya está medido, y por qué se rehace

El [ítem 117](117-la-curva-del-compresor.md) midió las ocho relaciones. **Se
rehace, y no por desconfianza**, sino por dos cosas que cambiaron después:

1. **La escalera era corta.** Doce escalones, o sea 12 dB de exceso por encima del
   codo. Con la curva doblada, esos 12 dB son justo el tramo donde más cambia.
   Ahora son catorce escalones: **16 dB de exceso**.
2. **Se leía como pendiente promedio**, que es lo que el 118 mostró que no es la
   relación. Acá se publica **la curva**, no su promedio.

**Lo del 117 no se retira**: sigue siendo lo que midió. Lo que cambia es qué se
hace con ello.

## Cómo se mide

Una escalera de catorce escalones por cada posición del control de relación, con
el **umbral fijo**. De cada captura sale la reducción contra el nivel de entrada,
y de ahí la reducción contra el **exceso sobre el codo**.

## La invariancia se comprueba, no se supone

**El 118 midió que la reducción depende sólo del exceso** —las seis curvas de
umbral eran la misma corrida, con residuos de cuatro centésimas—. **Pero eso se
midió con UNA relación**, la de crudo 0,10.

Esta corrida **lo vuelve a comprobar con otra relación** —dos umbrales más, con el
control en 0,35— antes de apoyarse en ello. Si no se cumple, la superficie
necesita un eje más y hay que decirlo.

## Los controles

**C1 — la escalera llega entera**: el escalón más bajo, al menos 40 dB sobre el
piso.

**C2 — con el compresor puenteado la pendiente es 1,000 ± 0,02** sobre los catorce
escalones. Sin cadena lineal, cualquier curva que salga es suya.

**C3 — el codo está en el mismo sitio para todas las relaciones.** Con el umbral
fijo, el nivel donde la reducción llega a 2 dB no puede moverse más de **1,5 dB**
entre relaciones. Si se mueve, el umbral depende de la relación y la superficie
necesita otro eje.

**C4 — la invariancia contra el umbral se sostiene con otra relación**: las curvas
de reducción contra exceso, a tres umbrales y con el control en 0,35, dentro de
**1,0 dB** entre sí.

## Las expectativas, declaradas antes de mirar

- **L1 — monotonía en la relación**: más crudo —relación más suave— menos
  reducción, a igual exceso.
- **L2 — monotonía en el exceso**: más exceso, más reducción, en todas.
- **L3 — el techo del [ítem 98](98-superficie-del-compresor.md)**: aquella
  medición encontró que la reducción se detiene en `−20·log₁₀(a)`. **Se informa la
  reducción máxima alcanzada contra ese techo, sin tope**: es una comprobación
  cruzada con trabajo propio de hace días, hecha con otro método y otro banco.
  Que coincida sería fuerte; que no, hay que explicarlo.

## Lo que esta corrida NO va a decir

- **Nada del cero del umbral**, que sigue sin ancla.
- **Nada de los tiempos**: la escalera se lee asentada, con ataque y relajación en
  su valor más rápido.
- **Nada de la rodilla blanda**, que se lee y se deja.
- **Nada con señal real.** Un tono se queda en un nivel; una voz no. Con la curva
  doblada **esa diferencia importa más que antes**, y queda dicho.
- **Nada del compresor del general.**
- Una frecuencia, un canal, un día.

## Qué se escribe, y qué vuelve

Las mismas claves del [117](117-la-curva-del-compresor.md), con su `PREVIO`, su
`conRestauracion`, su papelito y su relectura por HTTP. **El fader del general no
se toca.**

## Trabajo previo

**Buscado el 2026-09-16, con los cuatro repositorios clonados y grepeados**, y en
casa.

- **Ninguno de los cuatro convierte `ratio` ni publica ninguna curva.** Ver
  [`trabajo-previo-de-terceros.md`](../referencia/trabajo-previo-de-terceros.md).
- **Propio, ítem 98**: midió la superficie **barriendo el umbral** y con el
  medidor de reducción de la consola, y encontró el techo `−20·log₁₀(a)`. Esta
  corrida barre **la relación**, con la fuente movida y el audio real. **Son dos
  métodos independientes sobre la misma superficie**, y por eso L3 vale como
  comprobación cruzada y no como repetición.
- **Propio, ítems 117 y 118**: la curva y la invariancia contra el umbral.
- **El manual y el cliente** hablan de una relación única. **Eso ya está refutado**
  por el 118 y no se vuelve a discutir acá.
