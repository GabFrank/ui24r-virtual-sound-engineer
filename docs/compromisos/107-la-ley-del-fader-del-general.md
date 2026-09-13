# 107 — La ley del fader del general, contra la salida real

**Contrato escrito el 2026-09-13, ANTES de tocar la consola.** Consola
192.168.0.78, fw 3.4.8318-ui24. Canal 10 (`i.9`) → general → **entrada 1** de la
Scarlett.

## Qué decide, y qué no

Es el **último requisito técnico de P6**. El usuario decidió el 2026-09-12,
eligiendo entre opciones, que la aplicación pueda bajar **el auxiliar y el
general** para cazar un acople: «*Los dos, con techo*».
`decision-bajar-buses-para-cazar-acoples.md` lista tres requisitos previos:

1. la ley de `a.N.mix` — **medida por el ítem 106**;
2. la ley de `m.mix` — **esto**;
3. **decidir el techo del general**, que **no es mío**: para una cuña, «hasta
   donde estaba» alcanza; para la sala, el usuario tiene una referencia que la
   aplicación no tiene —cuánta gente hay—.

Así que esta medición **no abre nada**. `m.mix` es la ruta más peligrosa de las
tres: mueve **la sala**. Sigue `USER_ONLY` y sigue necesitando su propio ADR.

## Por qué se puede correr sin el usuario presente, dicho para que se pueda objetar

El contrato **99a** declaró, con razón para el banco de entonces:

> *«Nada sobre `m.mix`. El general es otra ruta y va en otra medición: mover el
> fader del general con un tono sonando **cambia el volumen de la sala**, y eso se
> hace con el usuario presente o con su permiso explícito.»*

Dos cosas cambiaron y las dos son del usuario, no mías:

- **Su instrucción permanente de estas madrugadas dice que nada está conectado a
  ninguna salida física salvo los dos cables del bucle**, así que el general no
  llega a ningún parlante. La condición que hacía peligrosa esa escritura no se
  cumple en este banco.
- Los ítems **105 y 106 ya bajaron `m.mix` a 0**, el segundo durante cinco
  minutos, y quedó informado en los dos resúmenes.

Y esta corrida es **más conservadora que aquellas**: sólo baja desde donde el
usuario lo dejó, y **nunca escribe un crudo mayor que el previo**. El guion lo
exige clave por clave y aborta si algún punto del barrido lo violaría, antes de
escribir nada.

## El banco

El canal 10 con su tono, el fader del canal **donde está** —no se toca—, y se
barre **`m.mix`** desde su valor actual hacia abajo. Se mide la entrada 1.

**Lo que se neutraliza, y por qué:** `m.dyn.bypass = 1`. El compresor del general
está **activo** (`bypass = 0`) y es lo único del camino que no es una ganancia
estática: depende del nivel, y el barrido mueve cuarenta y ocho decibeles. Se
puentea y no se pone en 1:1 porque lo que se compara son diferencias contra el
arranque, y una compensación constante se cancela. Y `m.afs.enabled = 0`, por la
regla del 2026-09-13.

**Lo que NO se toca: el ecualizador del general.** Es la corrección de sala del
usuario. Es estática, así que se cancela en toda atenuación relativa al arranque;
lo único que podría hacer es comerse el recorrido si tuviera una caída profunda en
1 kHz, y de eso se ocupa C1 midiendo. Se registra y se deja.

**Se exige sin escribir:** `i.9.mute = 0`, `m.dim = 0` —un dim cambia el nivel y
no está medido—, `m.safe = 0`, y que el crudo más alto del barrido no supere el
previo.

## Los controles positivos

**C1 — el tono llega.** La entrada 1 tiene que estar al menos **85 dB** por
encima del piso efectivo, que es la condición necesaria para que L5 pueda pasar
—45 de margen por punto más 40 de recorrido—. Si no, se aborta en el sitio, y el
mensaje distingue «el tono no entra» de «el piso quedó alto».

**C2 — la fuga hacia la entrada 1, medida.** Con `m.mix = 0` el general no saca
nada, así que lo que quede de 1 kHz en la entrada 1 entra por otro lado. El piso
efectivo es el mayor entre esa fuga y el ruido del bin, y **todo punto que no esté
45 dB por encima se anula**.

Y esto responde de paso algo que el ítem 105 dejó abierto: aquella corrida mostró
que la fuga hacia la entrada 2 **viaja por el camino del general**, sin poder
separar si el cruce ocurre adentro de la Scarlett o en la etapa de salida de la
consola. **Esta corrida mira la otra punta**: si con el general en 0 la entrada 1
sigue viendo 1 kHz, eso es la salida de la interfaz cruzándose a su propia
entrada, y el candidato «etapa de salida de la consola» queda sin sostén.

## Las expectativas, declaradas antes de mirar

**L1 — el medidor del canal no se mueve** más de 0,667 dB: el fader del general
está aguas abajo, así que la fuente tiene que quedarse quieta. Si se mueve, la
corrida no vale.

**L2 — la referencia interna de la interfaz no deriva** más de 0,1 dB. Es el único
control sobre el **instrumento**; todo lo demás vigila la consola.

**L3 — la salida real contra `faderADb`**, desvío máximo por debajo de un escalón
del medidor (0,334 dB) en los puntos no anulados.

**L3b — y el residuo no tiene estructura**: pendiente por debajo de 0,002 dB/dB y
al menos un tercio de los cambios de signo esperables. **Es la que decide.**

Y acá tiene un trabajo extra: el ítem 106 encontró en el fader del **bus** un
residuo **positivo** y estructurado por debajo de −42 dB, que ninguna fuga
explica. Si el general lo repite, es una propiedad de la ley o de la consola; si
no, era del bus. **Los dos resultados dicen algo**, y por eso esta expectativa se
declara igual que allá, sin ajustarle el umbral.

**L4 — ida y vuelta** dentro de 0,667 dB.

**L5 — recorrido de al menos 40 dB** entre los puntos no anulados. Con el
arranque en −18 dBFS y el piso cerca de −117, la regla de 45 dB corta en −72, o
sea 54 dB disponibles; el barrido cubre 48. Pasa con holgura **si el tono llega**.

**L6 — el crudo escrito contra el releído**, con el veredicto en decibeles: el
tope es una décima de escalón. Dos crudos fuera de la rejilla de centésimos a
propósito.

**Mínimos, porque sin ellos una expectativa decide en el vacío:** 10 puntos
útiles para L3 y L3b, 20 cuadros VU2 por captura, y L4 y L6 informan cuántos
pares compararon antes del número.

**Si falla C1, L1, L2 o L5, no se imprime ley.** Y si el punto de referencia está
anulado, tampoco: de él cuelgan todas las atenuaciones, y un tope recortado
publicaría un hallazgo **falso** contra la consola.

## Lo que esta corrida NO va a decir

- **Nada sobre el cero absoluto.** Es relativa al arranque.
- **Nada sobre la ley inversa.** Se mide crudo → dB.
- **Nada por encima de donde el usuario dejó el fader.** El barrido sólo baja, así
  que la parte de arriba del recorrido queda sin medir. Es deliberado.
- **Nada sobre el techo del general**, que es la decisión que falta y no es mía.
- Un día, una frecuencia, un nivel de fuente. Y un acuerdo dentro del umbral es
  una **cota**, no una identidad.

## Restauración

`m.mix`, `m.dyn.bypass`, `m.afs.enabled`. Leídos por HTTP antes, restaurados por
`restaurarClaves()` dentro de `conRestauracion`, verificados releyendo por HTTP. Y
la pila de filtros del supresor se compara antes contra después.

**No se toca**: la instantánea «Alma caninde», la fantasma del canal 9, el
ecualizador del general.
