# 120 — El umbral y la profundidad de la puerta, y si tiene histéresis

## Estado al 2026-09-17: SIN CERRAR, con dos corridas y un incidente

### La primera corrida: los controles pasaron y el número no sirve

Evidencia:
[`umbral-de-la-puerta-2026-09-16.txt`](../spikes/SPK-P0.10b-vu2/evidence/umbral-de-la-puerta-2026-09-16.txt).
C1 a C4 en verde, y aun así **no se publica ninguna pendiente**.

**Porque esta puerta es un interruptor.** La atenuación pasa de 20 dB a 0 **entre
dos escalones vecinos**, sin nada en el medio. Con una transición dura, **el
escalón de la escalera ES la resolución**: la apertura medida sólo puede tomar un
valor cada 3 dB.

| umbral → umbral | movimiento de la apertura | implicaría |
|---|---|---|
| 0,30 → 0,33 | +2,99 dB | 100 dB/unidad |
| 0,33 → 0,36 | +3,01 dB | 100 dB/unidad |
| **0,36 → 0,39** | **−0,02 dB** | **−1 dB/unidad** |
| 0,39 → 0,42 | +3,02 dB | 101 dB/unidad |
| 0,42 → 0,45 | +3,02 dB | 101 dB/unidad |

**Dos umbrales vecinos cayeron en el mismo escalón**, y ese cero arrastró el
ajuste a **74,4 dB por unidad**. Los otros cuatro intervalos dan 100.

**Ese 74,4 es del instrumento, no de la puerta, y por eso no se publica.** Lo que
sí se puede decir es una cota: por los extremos, 80 dB/unidad con ±3 dB de
cuantización sobre 12 — o sea **entre 60 y 100**. Incluye los 96 del cliente y no
los confirma.

### Lo que la primera corrida SÍ dejó

**La profundidad no llega adonde dicen ni el cliente ni el manual.**

| crudo | atenuación medida | `60a − 60` | diferencia |
|---|---|---|---|
| 1,00 | 0,0 dB | 0,0 | 0,0 |
| 0,85 | 8,9 dB | 9,0 | −0,1 |
| 0,70 | 17,6 dB | 18,0 | −0,4 |
| 0,55 | 25,1 dB | 27,0 | −1,9 |
| 0,40 | 28,5 dB | 36,0 | **−7,5** |
| 0,25 | 29,1 dB | 45,0 | **−15,9** |

**Acierta hasta 0,70 y después se satura en unos 29 dB.** El manual dice
«Depth -inf to 0dB» y el cliente −60: **ninguno de los dos.**

**Y esta corrida no puede decir de quién es ese techo.** Con la señal más baja a
−77,5 dBFS, 29 dB de atenuación la dejan en −106,5, y el piso de ruido está 25 dB
más abajo — así que **no es el piso**. Podría ser la puerta o podría ser una fuga
del banco a nivel fijo. **Lo que lo separa** es repetir con la fuente más baja: si
el techo la sigue, es de la puerta; si se queda en el mismo dBFS absoluto, es
fuga. **No se hizo.**

### La segunda corrida se murió, y el reparador plantó un filtro

Se afinó la escalera a 1,5 dB y se corrigió un defecto del análisis —el cruce de
la escalera descendente nunca matcheaba, así que la histéresis salía «fuera» en
las tres pruebas: no era que no hubiera, era que no se estaba buscando—.

**Esa corrida murió de golpe en C2, sin mensaje.** Evidencia truncada:
[`umbral-de-la-puerta-2026-09-16b.txt`](../spikes/SPK-P0.10b-vu2/evidence/umbral-de-la-puerta-2026-09-16b.txt).

El papelito quedó abierto e hizo su trabajo. **Y al repararlo se plantó un filtro
en la consola del usuario**, porque el reparador encendió el supresor con un
reproductor huérfano todavía sonando. Detectado, borrado y arreglado en la
herramienta. Ver
[el hallazgo](../backlog/hallazgo-el-reparador-planto-un-filtro.md).

### Qué falta para cerrar este ítem

1. **Volver a correr con la escalera fina**, que es lo que quedó a medias.
2. **Separar el techo de la profundidad de una fuga del banco**, con la fuente más
   baja.
3. **La histéresis**, que sigue sin medirse: la primera corrida la dejó
   indistinguible de la cuantización y la segunda no llegó.

---


**Contrato escrito el 2026-09-16, ANTES de tocar la consola.** Consola
192.168.0.78. Canal 10 (`i.9`) → general → entrada 1 de la Scarlett.

## Qué decide

Tres cosas, y las tres salen del mismo instrumento:

1. **A qué nivel abre la puerta**, y cuántos decibeles mueve eso por unidad del
   control. El cliente dice `VtoGATE_THRESH(a) = 96a − 90`.
2. **Cuánto atenúa cerrada.** El cliente dice `VtoGATE_DEPTH(a) = 60a − 60`. El
   [ítem 116](116-los-tiempos-de-la-puerta.md) tiene **un solo punto** —−21,8 dB
   medidos contra −20 predichos— y un punto no es una ley.
3. **Si abre y cierra en el mismo nivel**, o si cierra más abajo.

## La tercera es la que nadie documenta, y es la que se oye

**Una puerta que abre y cierra exactamente en el mismo nivel castañetea.** Con la
señal justo en el umbral, se abre y se cierra sola a cada oscilación, y eso suena
como un chisporroteo. La solución de manual es que **cierre más abajo de lo que
abre**: la diferencia se llama histéresis.

**El manual del fabricante no la nombra. El cliente de la consola tampoco** —cero
coincidencias de `hyster` en los dos—. Y ninguno de los cuatro proyectos de
terceros toca la puerta.

Así que **no se sabe si esta puerta la tiene**, y el manual ofrece otra respuesta
para el mismo problema: *«Hold… milliseconds to prevent chatter»*. Puede que
resuelva el castañeteo sólo con el sostenido, que el 116 midió exacto. **Medirlo
decide entre esas dos.**

## Cómo se mide

**Con la misma escalera de los ítems 117 a 119**, y por primera vez **también al
revés**.

- **Subiendo**, la salida arranca atenuada —la puerta cerrada— y en algún escalón
  se abre. **Ese es el nivel de apertura.**
- **Bajando**, arranca abierta y en algún escalón se cierra. **Ese es el de
  cierre.**
- **La diferencia entre los dos es la histéresis**, y si es cero, no tiene.

El nivel de transición se toma donde la atenuación cruza **la mitad de la
profundidad**. Es simétrico y no depende de cuánto atenúe.

Para el umbral se barre `gate.thresh` y se mira cuánto se corre la transición.
Para la profundidad se barre `gate.depth` y se mide la atenuación con la puerta
cerrada.

## Los tiempos se ponen al mínimo, y hay que decir por qué

`attack`, `hold` y `release` van a su valor más rápido para que cada escalón
llegue asentado. **Eso tiene una consecuencia sobre la histéresis**: con el
sostenido en su mínimo —1 ms— la puerta cierra en cuanto la señal baja, así que lo
que se mida es la histéresis **del detector**, no la que el usuario percibe con su
sostenido puesto. Se dice así.

## Los controles

**C1 — la escalera llega entera**: el escalón más bajo con la puerta **abierta**,
al menos 40 dB sobre el piso.

**C2 — con la puerta PUENTEADA la pendiente es 1,000 ± 0,02** en los catorce
escalones, subiendo **y bajando**. La escalera al revés es nueva y hay que
comprobar que no traiga nada suyo.

**C3 — la puerta cierra**: con el nivel más bajo, al menos **10 dB** de atenuación
contra la misma escalera puenteada.

**C4 — la transición es nítida**: tiene que completarse en **dos escalones o
menos**. Si tarda más, no hay «un nivel de apertura» y la histéresis no se puede
leer como una diferencia entre dos.

## Las expectativas, declaradas antes de mirar

- **L1 — el umbral es lineal en el crudo**, residuo máximo 1,5 dB, y se informa la
  pendiente contra los **96** del cliente.
- **L2 — la profundidad es lineal en el crudo**, y se informa contra `60a − 60`.
  **Se declara antes**: los extremos del cliente y del manual **no coinciden** —el
  cliente acota en −60 dB y el manual escribe «-inf»— y esta corrida no puede
  medir un infinito. Lo que puede es decir si la recta encaja donde sí llega.
- **L3 — la histéresis**: se informa el número, sin expectativa. **No hay base para
  predecir ni que exista ni que no**, y decirlo antes evita que cualquier
  resultado parezca confirmado.

**Si falla C1, C2, C3 o C4, no se publica nada.**

## Lo que esta corrida NO va a decir

- **Nada del cero de la escala**, igual que el compresor: se mide la pendiente.
- **Nada de la relajación de la puerta**, cuya forma el 116 refutó y que sigue sin
  ley. Eso necesita un modelo nuevo, no otra corrida de ésta.
- **Nada con el sostenido puesto**, explicado arriba.
- **Nada con señal real.**
- Un canal, una frecuencia, un día.

## Qué se escribe, y qué vuelve

Las claves del [116](116-los-tiempos-de-la-puerta.md) —`gate.{enabled,bypass,
thresh,depth,attack,hold,release}`— más el proceso del canal, con su `PREVIO`, su
`conRestauracion`, su papelito y su relectura por HTTP. **El fader del general no
se toca.**

## Trabajo previo

**Buscado el 2026-09-16 con los cuatro repositorios clonados y grepeados.**

- **Los cuatro: cero coincidencias** de `gate.thresh`, `gate.depth` y `hyster`.
  Ninguno toca la puerta. Ver
  [`trabajo-previo-de-terceros.md`](../referencia/trabajo-previo-de-terceros.md).
- **El manual**: «Gate Threshold **-inf to +6dB**», «Depth **-inf to 0dB**», y
  `Hold… to prevent chatter`. **No nombra la histéresis.**
- **El cliente**: `96a − 90` y `60a − 60`. **Tampoco la nombra** —cero
  coincidencias de `hyster` en el `mixer.html`—.
- **Los extremos del manual y del cliente se contradicen** en las dos: «-inf»
  contra −90 y contra −60. Queda anotado y **no se resuelve acá**.
- **Propio, ítem 116**: midió el sostenido exacto, la forma del ataque, refutó la
  de la relajación, y dejó la profundidad en **un punto**.
- **Propio, ítem 118**: el método de alinear curvas, que es el que se usa acá para
  el umbral.

**Nadie mide esto.** Sin segunda implementación, un resultado raro no tiene con
qué contrastarse.
