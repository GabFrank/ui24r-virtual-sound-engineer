# ADR-037 — Qué cuenta como que el músico estaba tocando

**Fecha:** 2026-09-19
**Estado:** **decidida e implementada, sin quien la dispare.** Cambia el mapeo que
las dos herramientas que escuchan usan --la ganancia y el envío a monitor--, así
que la pantalla de ganancia **sí** la estrena; el envío a monitor la estrena
cuando exista la pantalla por músico.
**Origen:** **Decisión del usuario**, en tres preguntas encadenadas el 2026-09-19,
más una cuarta que apareció implementando.
**Relacionada:** [ADR-036](ADR-036-la-escucha-de-una-cuna-se-comprueba-sobre-dos-medidores.md),
que decide **cuál** medidor se escucha, y
[ADR-035](ADR-035-el-tope-es-por-parlante-no-por-clave.md), que decide **a qué
ruta** autoriza una escucha. Ésta decide **qué cuenta como escucha**.

## El problema, en una frase

La aplicación declaraba dieciocho segundos de escucha cuando el músico había
tocado dos, y también cuando no había tocado nada.

## Cómo estaba, y por qué pasaba en verde

La pregunta «¿hubo escucha?» se apoyaba en dos cosas, y las dos flojas:

- **«El medidor se movió»** era un `max > min` sobre la ventana **entera**. Un
  solo escalón del medidor en cualquiera de los 360 instantes la satisfacía.
- **«Sonaron a la vez»** preguntaba **presencia** por encima del piso de ruido,
  no movimiento.

Con eso, todo instante en que los medidores estuvieran sobre el piso contaba como
escucha, aunque no pasara nada. Lo midió una auditoría adversarial el 2026-09-19
sobre la cadena completa, con la suite entera en verde; los números están en
[`hallazgos-de-las-auditorias-de-la-cuna-2026-09-19.md`](../backlog/hallazgos-de-las-auditorias-de-la-cuna-2026-09-19.md).

**Importa porque de esto cuelga un permiso.** El motor deja dar otro paso sobre la
misma cuña si hubo escucha en el medio. Una escucha declarada de más es una rampa
que sube sin que nadie haya oído nada.

## Lo que el usuario decidió, en tres preguntas

### 1. Movimiento **y** nivel, no una de las dos

Un instante cuenta como música si el medidor **se estaba moviendo ahí** y además
el nivel **está arriba**. Se le ofrecieron las dos por separado y las dos juntas;
eligió las dos juntas, que es lo más estricto.

### 2. El nivel se compara contra el pico de **esa misma escucha**

Y no contra un número fijo en decibeles. Se le ofrecieron las dos formas.

**Por qué la relativa, con sus dos motivos:** una vara fija no se puede elegir sin
medir en un escenario con banda —el único banco que este proyecto tiene es una
sala callada— y castigaría al músico que toca bajo, que es **el canal que el
asistente de ganancia existe para levantar**. Comparando contra el pico de su
propia ventana, la vara se acomoda sola a cada micrófono, instrumento y sala.

**No tiene precedente:** ver la sección de trabajo previo.

### 3. La distancia al pico son 20 dB

Se le ofrecieron 12, 20 y 30, y eligió como ingeniero de sonido: es la dinámica
que tiene una frase cantada o tocada de verdad. Más estricto haría repetir la
escucha a un instrumento de dinámica ancha; más generoso deja entrar el ambiente
de entre frases.

### Y una cuarta, que apareció implementando

La vara de **movimiento** se escribió primero como «más de un escalón del
medidor», apoyada en la resolución del propio instrumento para no elegir un
número. **No servía**: el ruido parejo de una sala se mueve varias veces eso sin
que nadie toque, así que la ventana en que **nadie tocaba** seguía declarando
dieciocho segundos. Se le contó al usuario con el test en rojo y eligió entre tres
salidas —elegir la vara, dejarlo abierto y anotado, o parar hasta poder medir— y
eligió **elegir la vara y escribirla como elegida**.

**Son 3 dB en medio segundo, ELEGIDOS Y NO MEDIDOS.** El argumento: tres
decibeles son el doble de potencia, o sea que la fuente hizo algo y no que el
número tembló; y son nueve veces el escalón del medidor, así que no puede salir de
la resolución del instrumento. **Se remide cuando se pueda**: hace falta una
ventana con alguien tocando por un micrófono en la sala donde está la MacBook,
contra otra de la sala sola, y hoy ahí no hay nadie que pueda tocar.

El tramo de medio segundo sí tiene sus dos cotas apoyadas en algo medido: por
abajo tiene que abarcar varias tramas del medidor —llegan con media 44,3 ms y
mediana 34 ms—, y por arriba tiene que ser más corto que una frase musical, o el
silencio entre dos notas se mezcla con las notas.

## Qué falta, dicho con todas las letras

- **Una fuente sostenida y pareja no cuenta.** Un tono, un acorde de órgano
  tenido. Un instrumento tocado no lo hace; un generador sí, y la aplicación no
  reproduce audio todavía. **El día que reproduzca tonos para medir, esta regla
  hay que volver a mirarla.**
- **Un escenario donde el ambiente esté a menos de 20 dB del músico.** Ahí la
  mitad del nivel no filtra nada y queda sosteniendo sola la del movimiento.
- **Que la cuña se haya movido POR ESTE MÚSICO sigue sin comprobarse.** El medidor
  del auxiliar es la suma del bus. Que el músico toque y que su cuña se mueva a la
  vez no dice que una cosa haya causado la otra, y en una cuña con una voz adentro
  pasan a la vez siempre. Es la misma familia que ADR-035 y **no la cierra esta
  decisión**.
- **La vara de movimiento es elegida.** Repetido acá a propósito: es el único
  número de esta decisión que no tiene medición detrás.

## Trabajo previo

**Buscado el 2026-09-19 en los cuatro repositorios, clonados y grepeados**, no de
memoria, en los mismos commits que el inventario declara.

**Ninguno de los cuatro decide si alguien está tocando a partir del medidor.** Lo
único que aparece con la palabra «umbral» es el parámetro de la puerta y del
compresor de la propia consola —un valor que se lee y se escribe—, que es otra
cosa. La fila quedó agregada en
[`trabajo-previo-de-terceros.md`](../referencia/trabajo-previo-de-terceros.md).

**Que no haya precedente es un dato: pide más cuidado, no menos.** Es parte de por
qué la vara elegida queda marcada como elegida en vez de pasar por medida.
