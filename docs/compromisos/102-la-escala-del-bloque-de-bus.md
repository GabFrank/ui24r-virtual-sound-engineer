# 102 — La escala en dB del bloque de bus, contra un instrumento externo

**Fecha: 2026-09-13.** Consola 192.168.0.78, fw 3.4.8318-ui24. Canal 10 (`i.9`),
auxiliar 5 (`a.4`), con la salida del auxiliar cableada a la entrada 2 de la
interfaz. Contrato escrito **antes** de tocar nada.

## Qué decide, y por qué es la medición de más valor que queda

`docs/protocol-spec.md` §4.4 dice, con todas las letras:

> *«Lo que sigue abierto es la otra mitad: a cuántos dB equivale un escalón de
> esos bytes. La 96b los convierte con la escala del medidor de **canal**, que no
> está medida sobre este bloque, así que todas sus cifras en dB heredan esa
> suposición.»*

La **99b** ancló la escala del medidor **de canal** a un instrumento externo
—rango implicado 79,91 dB contra el 80 declarado— y declaró explícitamente que
**eso no rescata a la 94 ni a la 96b**:

> *«esta corrida mide el byte `+2` de la sección de **entradas**, y la 94 leyó el
> bloque de **auxiliar** y la 96b el de **efectos**, que están en la cola de la
> trama, tienen otro paso, y cuya escala en dB `protocol-spec` §4.4 declara **no
> medida** sobre esos bloques.»*

**Esta corrida cierra esa mitad para el bloque de auxiliar.** Si el paso resulta
ser el mismo 0,333401 dB, las cifras en dB de la 94 quedan en pie. Si no, la 94
queda tocada y hay que decir en cuánto.

## Qué se barre, y por qué ése y no otro

**Se barre el envío del canal al auxiliar, y se lee el byte `pre`.** Los tres
motivos, en orden:

1. **La 94 leyó `pre`, no `post`.** Barrer el fader del auxiliar movería `post` y
   dejaría `pre` quieto: se mediría el byte que la 94 **no** usó.
2. **El envío es pre-fader** —`i.9.aux.4.post = 0`, leído del aparato— así que el
   fader del canal no lo toca. El envío es el único mando que mueve `pre`.
3. **Con el fader del auxiliar quieto, la salida física sigue a `pre` exactamente**,
   porque entre los dos sólo hay ganancias estáticas. Eso es lo que permite
   comparar el byte contra el instrumento externo.

**Y el fader del auxiliar se usa como atenuador fijo**, para bajar el nivel a la
interfaz sin tocar el medidor. El reconocimiento del 2026-09-13 midió el camino:

| | |
|---|---|
| Envío en 0,75, fader del auxiliar en unidad | `pre` = `post` = **−47,33 dB** |
| Lo que ve la interfaz | **−8,55 dBFS**, con **107,3 dB** de margen en el bin |
| Ganancia de cadena hasta la interfaz | **38,8 dB** |

O sea que el auxiliar llega a la interfaz **veinte decibeles más caliente** que el
general. Sin bajarlo, subir el envío recorta.

## Las precondiciones

**El auxiliar tiene puerta y compresor, y los dos dependen del nivel.** Leídos del
aparato: `a.4.gate.enabled = 1` y `a.4.dyn.bypass = 0`. El barrido mueve el nivel
decenas de decibeles, así que los dos se **puentean** y se restauran — la misma
regla que la 99b y la 101: *una ganancia estática se cancela en una atenuación
relativa; una no lineal no.*

| Qué | Cómo queda | Por qué |
|---|---|---|
| Puerta del auxiliar | **se apaga** | depende del nivel; en el reconocimiento estuvo abierta en las 101 tramas, pero eso fue a **un** nivel |
| Compresor del auxiliar | **se puentea** | ídem, y su medidor de reducción se sigue leyendo en cada punto |
| Ecualizador del auxiliar | se lee y **no se toca** | es estático y se cancela |
| Supresor del auxiliar | ya está apagado (`a.4.afs.enabled = 0`); se registra | |
| Compresor, puerta y de-esser del **canal** | se puentean | están aguas arriba del envío |
| El general | **no interviene**: el camino medido no pasa por él | |

## Las expectativas

Falsables, con su umbral, antes de correr.

**El umbral del medidor es de dos escalones —0,667 dB—** en toda diferencia de dos
lecturas. **El instrumento externo** aporta su propio error, que depende del
margen sobre el ruido del bin: `8,686 × 10^(−margen/20)` dB. Un punto vale con
**45 dB** o más, que son 0,05 dB. En el reconocimiento sobró: 107 dB.

**Y la ventana del medidor**: sólo se puntúan los puntos cuyo byte esté entre
**16 y 239**. Por debajo el medidor está aplastado contra el piso y la salida real
sigue viva —el residuo que la 94 confundió con una diferencia de ley—; por encima,
los bytes 240 a 255 informan posiciones mayores que 1.

| # | Predicción | Qué la falsaría |
|---|---|---|
| **B1** | **El medidor del canal no se mueve** más de 0,667 dB en todo el barrido | Que se mueva: el envío no está donde este proyecto cree, o se movió la fuente |
| **B2** | **La referencia interna de la interfaz no se mueve** más de 0,2 dB | Que se mueva: cambió el camino de reproducción |
| **B3** | **`post` sigue a `pre`** dentro de 0,667 dB en todo el barrido | Que no: entre los dos hay algo que no es una ganancia estática, y el fader del auxiliar estuvo quieto todo el tiempo |
| **B4** | **La atenuación del byte `pre` y la de la salida real coinciden** dentro de 0,667 dB, en la ventana | Que difieran. **El paso del bloque de auxiliar no es el del canal, y las cifras en dB de la 94 quedan tocadas** |
| **B5** | **El paso del bloque de auxiliar es 0,333401 dB**: la recta de bytes contra dB reales, por mínimos cuadrados con la ordenada libre sobre los puntos de la ventana, tiene esa pendiente dentro del **1 %** | Otra pendiente. El bloque de bus tiene su propia escala y **hay que rehacer las cifras de la 94 y de la 96b** |
| **B6** | **Ida y vuelta.** El mismo crudo da la misma atenuación bajando y subiendo, dentro de 0,667 dB | Histéresis o falta de asentamiento |

**B5 queda declarada subordinada a B4 por adelantado**, igual que la 99b: con un
tramo mayor a 33,4 dB, B5 no puede fallar si B4 pasa. Su valor es publicar el
**rango implicado** —`paso / VU_ESCALA`— para contrastarlo contra el 80 declarado.

## Lo que esta corrida NO va a poder decir

- **Nada del bloque de efectos.** El de auxiliar es **mono de 5 bytes** y el de
  efectos **estéreo de 7**: son formatos distintos y medir uno no da el otro. **La
  96b sigue tocada** aunque esto pase, y hay que decirlo.
- **Nada sobre la ley del envío.** Esto mide a cuántos dB equivale un **escalón
  del medidor**, no qué dB corresponden a cada crudo del envío. Son dos preguntas
  distintas y la 94 contestó la segunda.
- **Nada en dBu ni dBFS absolutos.** Entre la salida del auxiliar y la interfaz
  hay una ganancia que nadie midió. Son **diferencias** por un camino que no se
  toca.
- **Nada sobre un error de escala constante**, invisible por construcción en una
  medición relativa al arranque.
- **Un auxiliar, un canal, una frecuencia, un nivel de fuente.**
- **Y un acuerdo dentro del umbral es una cota, no una identidad.**

## Restauración

Se escriben el envío, el fader del auxiliar, su puerta y su compresor, y el
compresor, la puerta y el de-esser del canal. **Todos se leen del aparato con
`exigirClave` antes de empezar**, la restauración va por `restaurarClaves`, que
**reconecta si el transporte se cae** —lo que la 101 aprendió a la mala— y se
comprueba **releyendo por HTTP**, un camino distinto del que escribió.

**No hay nada conectado a ninguna salida física** salvo los dos cables del bucle,
así que esta corrida no hace ruido en la sala.
