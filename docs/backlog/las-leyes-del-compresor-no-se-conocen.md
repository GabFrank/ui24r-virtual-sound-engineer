# Las leyes del compresor no se conocen

**Estado: abierto.** Abierto el 2026-09-12 por el resultado negativo de la
medición 97, y registrado acá el mismo día porque una auditoría de coherencia
notó que **el único lugar donde vivía era el documento de la medición**. Un
resultado negativo sin entrada en el backlog es un resultado que nadie vuelve a
mirar.

## Qué se sabe

Las dos leyes que estaban escritas —leídas del `mixer.html` de la consola, no
medidas— **están refutadas contra el aparato**:

- `VtoTHRESH(a) = −90 + 96a`
- `VtoRATIO(a) = 1/a`

Con esas dos y una rodilla dura, el exceso despejado va de **10,0 a 25,6 dB en
la misma corrida, con fuente y umbral quietos**. Tiene que ser constante y no lo
es. Las pendientes por sustitución dependen de la relación y los cocientes dan
1,58 a 2,42 donde el modelo pide 3,00 (2,69 con los excesos reales).

**Y no es culpa del instrumento.** El medidor de reducción se calibró contra la
caída real de nivel leída en el medidor del canal, con `ratio = 1` como
referencia: sigue hasta 24,34 dB con 0,35 dB de desvío, igual en el tramo que ya
estaba verificado y en el que no. La hipótesis de que el medidor se rompía
arriba de 11 dB quedó refutada por la corrida diseñada para poder refutarla.

Lo único que **sí** está medido del ratio es su **sentido**: con `a = 1` y el
umbral en 0,14 la reducción informada es 0,00 y `entrada = pre`. O sea que el
crudo 1 no comprime, que es lo que induce al error con más facilidad.

## Qué sigue, y por qué en ese orden

**1. El barrido en dos dimensiones, umbral × relación.** Da la superficie en vez
de dos cortes, que es lo que hace falta: la relación `−20·log₁₀(a)` encaja dentro
de 0,48 dB en un umbral y predice 6,02 donde se midieron 2,98 en otro. Con dos
cortes no se puede decidir si la segunda discrepancia es la ley o la saturación.

**Y usa el método de `calibrar-medidor-de-reduccion.ts`, no el de la rodilla.**
La rodilla se definió como «el primer crudo con reducción > 0», y hacen falta
1,09 dB de exceso para que el medidor salga de cero con a = 0,1: el exceso
despejado de una rodilla arrastra ese sesgo. Medir la caída de nivel con
`ratio = 1` como referencia no lo arrastra.

**Lo que explícitamente no se hace**: ajustar una curva a los doce puntos de un
solo umbral y publicarla. Saldría una recta impecable, como los tres barridos de
84,5 dB que este proyecto tuvo que retirar, y lo que los delató fue que no
coincidían entre sí — que es la situación actual.

**2. Los tiempos, C5.** Ataque y relajación **no se midieron**, y la 97 lo
declara. Quedan para después de que la ley estática se entienda: medir la
dinámica de un bloque cuyo régimen permanente no se conoce es medir dos cosas a
la vez.

## Qué queda mientras tanto

`packages/mixer-adapter/src/raw-map.ts` conserva la entrada del umbral con la
ley refutada, en estado `INFERIDO`, **a propósito**: `INFERIDO` impide escribir
por `aRaw()`, y sacarla dejaría el parámetro sin unidad declarada, que es lo que
INV-004 usa para rechazar. Lo que hay anotado en el código es que `fromRaw`,
`fisicoMin` y `fisicoMax` de esa entrada se calculan con una ley que no
describe el aparato.

El paso 9 del camino del MVP sigue sin ley medida, y ahora se sabe además que la
que estaba escrita no sirve.
