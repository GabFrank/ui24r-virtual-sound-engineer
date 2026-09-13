# 108 — La ley de la ganancia del ecualizador de canal

**Contrato escrito el 2026-09-13, ANTES de tocar la consola.** Consola
192.168.0.78. Canal 10 (`i.9`) → general → entrada 1 de la Scarlett, el mismo
banco que el ítem 107.

## Qué decide

`i.N.eq.bM.gain` es **la única hoja del ecualizador que la aplicación podría
escribir**, y hoy no puede.

El ítem 101 midió cuatro leyes del ecualizador contra el filtro real —frecuencia
de la campana, su Q, y las de los dos filtros de corte— y el 2026-09-13 apareció
que **ninguna sirve para escribir**: `LIMITES` da una unidad por `kind`, y
`CHANNEL_EQ` tiene su tope en dB mientras esas cuatro están en Hz y en Q. El
motor las rechaza con INV-004 y tiene razón: un tope de 4 dB no acota un salto de
frecuencia. Está en
[`hallazgo-un-kind-una-unidad-y-las-hojas-no-coinciden.md`](../backlog/hallazgo-un-kind-una-unidad-y-las-hojas-no-coinciden.md).

**La ganancia no tiene ese problema: está en dB, igual que el tope de su `kind`.**
Así que medirla es lo único que convierte al ecualizador de canal —432 de las 834
rutas escribibles, y lo que el propio recorrido llama «el corazón del producto»—
en algo que la aplicación pueda tocar.

Hoy la tabla dice `lineal(−15, +15)` y `DESCONOCIDO`. El 101 encontró, sin
buscarlo, que la campana **sube 20,0 dB** en su extremo, y dejó escrito por qué
eso no alcanza:

> *«El pico de una campana no es el parámetro de ganancia salvo que el filtro esté
> normalizado de cierta manera, y eso no se sabe. Y se midió **un solo crudo de
> ganancia** —el extremo—, así que de la *forma* de esa ley no se sabe nada.»*

## Qué se mide, y por qué es la magnitud correcta

**Cuántos decibeles cambia el nivel en la frecuencia central de la banda, como
función del crudo.** No «el parámetro de ganancia del filtro»: la aplicación va a
decir «realzá esta banda 3 dB» y lo que importa es que el audio suba 3 dB ahí. Esa
es la cantidad que `fromRaw` tiene que devolver, y no depende de cómo esté
normalizado el filtro por dentro.

## El banco, y dos cosas que salieron gratis

- **La banda 2 ya está exactamente en 1000,0 Hz.** Su crudo es
  `0,5584347738`, que es el que la ley medida por el 101 da para 1 kHz. **No se
  escribe la frecuencia**: una clave menos que tocar y una menos que restaurar.
- **Las cinco bandas están planas** (`gain = 0,5`), y se exige que sigan así.

Se baja `i.9.mix` a **0,50** para hacer lugar: con el fader donde está, un realce
de +20 dB pondría la entrada en −9,6 dBFS y la suma de los dos tonos recortaría.

**Estímulo de DOS tonos: 1000 Hz y 100 Hz**, cada uno a −18 dBFS. El de 100 Hz no
es decoración: ver el control C2.

Se neutraliza el compresor, la puerta y el de-esser del canal —dependen del nivel
y el barrido mueve cuarenta decibeles— y `m.afs.enabled`, por la regla del
2026-09-13.

**Se exige sin escribir:** `i.9.eq.bypass = 0`, `i.9.eq.prmod = 0`,
`i.9.eq.easy = 0`, las cinco bandas en `gain = 0,5`, `i.9.mute = 0`, y que los
filtros de corte no toquen 1 kHz ni 100 Hz —`hpf.freq` está en el crudo 0, que
son 20 Hz, y `lpf.freq` en 1, que son 22 050—.

## Los controles positivos

**C1 — el tono llega.** El bin de 1 kHz tiene que estar al menos 85 dB por encima
del piso efectivo, que es lo que L4 necesita para poder pasar.

**C2 — la banda es LOCAL, y esto es lo que hace honesta a la medición.** Mientras
el bin de 1 kHz se mueve cuarenta decibeles, **el de 100 Hz no se puede mover más
de 0,5 dB**. Si se mueve, lo que cambió no fue la banda sino algo global —el
fader, la ganancia, el compresor que no se puenteó— y **la corrida no mide la ley
del ecualizador**: mide otra cosa.

Es el testigo que los barridos de fader no podían tener, porque ahí lo que se
movía era global por definición. Acá se puede, y por eso se exige.

## Las expectativas, declaradas antes de mirar

**L1 — el crudo 0,5 es el punto plano.** La diferencia entre el nivel en 0,5 y el
nivel con el ecualizador puenteado tiene que ser menor que 0,2 dB. Si no lo es,
`0,5` no es «0 dB» y toda la tabla de conversión que lo supone está mal.

**L2 — la referencia interna de la interfaz no deriva** más de 0,05 dB. Es el
único control sobre el instrumento.

**L3 — la ley es lineal en el crudo.** Ajustando una recta a los puntos, el
residuo máximo tiene que ser menor que **0,3 dB**. Es lo que la tabla declara hoy
—`lineal(−15, +15)`— y lo que hay que poner a prueba: si la ley fuera, por
ejemplo, lineal en la ganancia *lineal* y no en decibeles, el residuo lo diría.

**L3b — y el residuo no tiene estructura**: pendiente por debajo de 0,002 dB/dB y
al menos un tercio de los cambios de signo esperables. Es la que decide, por lo
que aprendieron el 104, el 106 y el 107.

**L4 — el recorrido total es de al menos 30 dB**, y se informa cuál es. La tabla
dice ±15 —o sea 30 de recorrido— y el 101 vio +20 en el extremo, que serían 40.
**Los dos números no pueden ser ciertos**, y esta corrida dice cuál es.

**L5 — la simetría.** |dB en el crudo 0| y |dB en el crudo 1| no difieren más de
0,5 dB. Una asimetría sería un hallazgo: muchos ecualizadores cortan más de lo que
realzan, y la tabla no lo contempla.

**L6 — ida y vuelta** dentro de 0,5 dB.

**L7 — el crudo escrito contra el releído**, con dos crudos fuera de la rejilla de
centésimos a propósito.

**Mínimos**: 10 puntos útiles para L3 y L3b, 20 cuadros por captura. Si falla C1,
C2, L1, L2 o L4, **no se imprime ley**. Y si el punto de referencia está anulado,
tampoco.

## Lo que esta corrida NO va a decir

- **Nada sobre las otras cuatro bandas ni sobre los otros canales.** Una banda de
  cinco, un canal de veinticuatro.
- **Nada sobre el ecualizador de salida** (`m.eq.*`, `a.N.eq.*`), que es otro
  `kind` y otra medición.
- **Nada sobre la forma de la campana.** Se mide la altura en el centro, no el
  ancho ni las faldas. El Q se deja donde está y se registra.
- **Nada sobre el parámetro interno del filtro.** Se mide el efecto en el audio,
  que es lo que el producto necesita y lo que `fromRaw` tiene que devolver.
- Una frecuencia, un Q, un nivel de fuente. Y un acuerdo dentro del umbral es una
  **cota**, no una identidad.

## Restauración

`i.9.eq.b2.gain`, `i.9.mix`, `i.9.dyn.bypass`, `i.9.gate.enabled`,
`i.9.deesser.enabled`, `m.afs.enabled`. Leídos por HTTP antes, restaurados por
`restaurarClaves()` dentro de `conRestauracion`, verificados releyendo por HTTP. Y
la pila de filtros del supresor se compara antes contra después.

**No se toca**: la instantánea «Alma caninde», la fantasma del canal 9, la
frecuencia y el Q de la banda, ni las otras cuatro bandas.
