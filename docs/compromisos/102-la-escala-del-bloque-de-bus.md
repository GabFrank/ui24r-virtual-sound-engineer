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

**Esta corrida cierra esa mitad para el bloque de auxiliar 5. Y la 94 leyó el
auxiliar 3.**

Eso hay que decirlo primero, porque la primera versión de este contrato afirmaba
que «las cifras de la 94 quedan en pie» sin mencionar que está midiendo **otro
bus**. La 94 leyó `decodificarVuBuses(...).auxiliares[2].pre` —el auxiliar 3— y
escribió ella misma: *«No prueba nada sobre los otros nueve auxiliares. Que los
diez compartan ley es plausible y no está medido.»* Hacer la extrapolación inversa
sin declararla sería el mismo error al revés.

El auxiliar 5 es el único cableado a la interfaz, así que no hay elección de qué
medir. **Lo que sí se puede es cerrar el salto midiendo en vez de suponerlo**, y
cuesta dos minutos: se barre **también** el envío al auxiliar 3 por los mismos
crudos y se comprueba que su byte `pre` dé el mismo. Si coinciden, la escala del
auxiliar 3 queda anclada al instrumento externo **por transitividad** y ahí sí la
94 queda en pie. Eso es **B7**.

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
interfaz sin tocar el medidor. El reconocimiento del 2026-09-13 midió el camino
—[`reconocer-auxiliar-2026-09-13.txt`](../spikes/SPK-P0.10b-vu2/evidence/reconocer-auxiliar-2026-09-13.txt)—:

| | |
|---|---|
| Envío en 0,75, fader del auxiliar en **el crudo 0,7647** — la unidad de *ganancia*, 0 dB, **no** el crudo 1,0, que son +10 | `pre` = `post` = **−47,33 dB** |
| Lo que ve la interfaz | **−8,55 dBFS**, con **107,3 dB** de margen en el bin |
| Ganancia de cadena desde `post` hasta la interfaz | **38,8 dB** |

Esa distinción entre «unidad» y «crudo 1,0» no es pedantería: confundirlas son
**diez decibeles** en toda la aritmética de niveles, y es exactamente el error que
costó la primera corrida de la 99b.

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
| **B3** | **`post` sigue a `pre`** dentro de 0,667 dB **en los puntos donde los dos bytes están en la ventana**, medido como el **rango** de `pre − post` y no como la distancia a un punto elegido | Que no: entre los dos hay algo que no es una ganancia estática |
| **B4** | **La atenuación del byte `pre` y la de la salida real coinciden** dentro de 0,667 dB, en la ventana | Que difieran. **El paso del bloque de auxiliar no es el del canal, y las cifras en dB de la 94 quedan tocadas** |
| **B5** | **El paso del bloque de auxiliar es 0,333401 dB**: la recta de bytes contra dB reales, por mínimos cuadrados con la ordenada libre sobre los puntos de la ventana, tiene esa pendiente dentro del **1 %** | Otra pendiente. El bloque de bus tiene su propia escala y **hay que rehacer las cifras de la 94 y de la 96b** |
| **B6** | **Ida y vuelta.** El mismo crudo da la misma atenuación bajando y subiendo, dentro de 0,667 dB | Histéresis o falta de asentamiento |

**B5 NO es subordinada a B4, y la primera versión de este contrato decía que sí.**
La cuenta, que no había hecho: si B4 pasa, cada punto queda a menos de 0,667 dB de
la recta exacta, y por mínimos cuadrados sobre este barrido eso **todavía admite
un error de pendiente de unos 5 %** — cinco veces el 1 % que B5 exige. Para que la
subordinación fuera cierta harían falta ~560 bytes de rango, o sea 187 dB, y la
ventana entera son 223.

Así que **B5 es independiente, y su modo de falla propio es el residuo
correlacionado con el byte** — que es exactamente el que la 94 midió: catorce
residuos del mismo signo creciendo hacia el piso. **Si B4 pasa y B5 falla, lo que
hay es un residuo estructurado, y eso es un hallazgo, no una contradicción.** Gana
B5, porque una cota puntual como B4 no ve la estructura.

### Y dos expectativas más, que el auditor levantó

| # | Predicción | Qué la falsaría |
|---|---|---|
| **B7** | **El auxiliar 3 y el 5 dan el mismo byte `pre` para el mismo envío**, dentro de 0,667 dB de rango | Que no: los dos buses no comparten escala, lo medido en el 5 no dice nada del 3, y **la 94 sigue sin rescatarse** |
| **B8** | **El punto de arranque repetido al cierre** cae dentro de **0,2 dB** en la salida real y de 0,667 dB en el medidor | Que no: se movió la perilla de entrada, el cable o el conversor — o el medidor tiene histéresis, que sería un hallazgo sobre el instrumento bajo prueba |

**B8 va aparte de B6 porque B6 no sirve para esto**: usa umbral 0,667, toma el
máximo sobre todos los crudos —así que el arranque queda diluido entre los
ruidosos de abajo— y compara sólo la salida real, nunca el medidor.

### Y lo que se informa sin puntuar

**Los puntos que caen debajo de la ventana.** Ahí el byte está aplastado contra el
piso y la salida real sigue viva: es el régimen exacto donde la 94 vio un residuo
unilateral y creciente y **no pudo decidir si era el piso del medidor o una
diferencia de ley**. Con la interfaz mirando, la pregunta tiene respuesta — si el
residuo es el piso, tiene que crecer exactamente lo que el byte deja de bajar. Se
agregaron crudos a propósito para poblar esa zona, y **se informa sin umbral
porque no estaba declarado antes de medir**.

**Y el piso del medidor del bus se mide en esta corrida**, con el envío en cero.
De ahí sale el 16 de la ventana, que hasta hoy era una afirmación heredada.

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
- **Dos auxiliares, un canal, una frecuencia, un nivel de fuente.** B7 ancla el
  auxiliar 3 al 5; de los otros ocho no se dice nada.
- **B3 no puede hablar de todo el barrido, por construcción.** `post` está unos
  14,7 dB por debajo de `pre` —es el atenuador fijo— así que toca su piso 14,7 dB
  antes, y la parte baja de la ventana queda sin control de `post`. Es una
  limitación del banco, no un resultado: bajar más el fader recorta menos pero
  ciega más a B3, y subirlo recorta.
- **Y un acuerdo dentro del umbral es una cota, no una identidad.**

## Restauración

Se escriben el envío, el fader del auxiliar, su puerta y su compresor, y el
compresor, la puerta y el de-esser del canal. **Todos se leen del aparato con
`exigirClave` antes de empezar**, la restauración va por `restaurarClaves`, que
**reconecta si el transporte se cae** —lo que la 101 aprendió a la mala— y se
comprueba **releyendo por HTTP**, un camino distinto del que escribió.

**No hay nada conectado a ninguna salida física** salvo los dos cables del bucle,
así que esta corrida no hace ruido en la sala.

---

# Resultado

**Corrida del 2026-09-13**, archivada en
[`escala-del-bloque-de-bus-2026-09-13.txt`](../spikes/SPK-P0.10b-vu2/evidence/escala-del-bloque-de-bus-2026-09-13.txt).
46 puntos, 44 útiles, 32 en la ventana del medidor.

## Las ocho expectativas

| # | Umbral | Resultado | |
|---|---|---|---|
| **B1** | medidor del canal quieto, 0,667 dB | **0,00 dB** | **PASA** |
| **B2** | referencia interna, 0,2 dB | **0,00 dB** | **PASA** |
| **B3** | `post` sigue a `pre`, 0,667 dB | **0,05 dB** de rango, 22 puntos sobre 21,7 dB | **PASA** |
| **B4** | byte `pre` contra la salida real, 0,667 dB | **0,18 dB** máximo, 16 puntos sobre 38,0 dB | **PASA** |
| **B5** | paso del bloque, 1 % | **0,331617** dB/byte contra 0,333401 — **0,53 %** | **PASA** |
| **B6** | histéresis, 0,667 dB | **0,00 dB** | **PASA** |
| **B7** | auxiliar 3 contra el 5, 0,667 dB de rango | **0,36 dB** de rango, 10 puntos | **PASA** |
| **B8** | camino de captura, 0,2 dB | **0,00 dB** | **PASA** |

## Lo que queda establecido

**El paso del bloque de auxiliar es el mismo que el del canal.** El byte `pre` y
la salida real coinciden dentro de **0,18 dB sobre 38 dB de recorrido**, medidos
con un conversor que no es el de la consola.

**Y el rango implicado es 79,57 dB** contra el 80 declarado. La 99b había medido
**79,91** sobre el bloque de **canal**. Dos bloques distintos de la trama, dos
instrumentos externos, dos corridas independientes, y los dos caen a medio punto
porcentual del 80.

**Con eso, las cifras en dB de la medición 94 quedan en pie** — pero sólo gracias
a B7, y conviene decir por qué.

## B7, que es la expectativa que de verdad rescata a la 94

La 94 leyó `auxiliares[2].pre`, o sea el **auxiliar 3**, y esta corrida mide el
**5**, que es el único cableado a la interfaz. Medir uno no mide el otro, y la
propia 94 escribió que no prueba nada sobre los otros nueve auxiliares.

B7 cierra el salto: se barrió **también** el envío al auxiliar 3, con el mismo
crudo, y sus bytes `pre` siguieron a los del 5 con un rango de diferencia de
**0,36 dB**. Misma pendiente ⇒ **la escala anclada en el auxiliar 5 vale para el 3
por transitividad**.

### Y hubo que explicar 22,67 dB antes de publicarlo

B7 informó la misma pendiente **con un desplazamiento constante de 22,67 dB**, y
el veredicto que el guión imprime dice «los dos buses dan el mismo byte», que es
**falso**. Publicar un número así sin explicarlo habría dejado la conclusión
colgando de algo que nadie entendía, así que se midió aparte
—[`diferencia-entre-buses-2026-09-13.txt`](../spikes/SPK-P0.10b-vu2/evidence/diferencia-entre-buses-2026-09-13.txt)—.

**La hipótesis obvia era falsa.** El auxiliar 3 tiene **tres canales más con el
envío abierto** —`i.1` en 0,355, `i.15` en 0,297 y `i.18` en 0,756— que la 94 ya
había encontrado. Pero con el tono apagado los dos buses leen el piso: esos
canales **no aportan nada**, están abiertos y mudos. Y una contribución aditiva
daría una diferencia **variable**; la medida dio −22,67 / −22,67 / −22,33 dB en
tres crudos distintos.

**Lo que sí era: el ecualizador gráfico del auxiliar 3.** Comparando las dos tiras
clave por clave, la única diferencia son las 31 bandas del gráfico y `eq.prmod`:

| Banda | Centro | Auxiliar 3 | En dB | Auxiliar 5 |
|---|---|---|---|---|
| 14 | 500 Hz | 0,0478 | **−13,6** | 0,5 (plano) |
| 15 | 630 Hz | 0 | **−15,0** | 0,5 |
| 16 | 800 Hz | 0 | **−15,0** | 0,5 |
| 17 | **1 kHz** | 0,0278 | **−14,2** | 0,5 |

Cuatro bandas contiguas al fondo alrededor de 500–1000 Hz: un ring-out de monitor.
**El tono de 1 kHz cae justo ahí.**

**El desplazamiento es estático, así que se cancela en una atenuación relativa al
arranque y la conclusión de B7 se sostiene.** Pero deja una pregunta nueva y
barata, anotada abajo.

## Lo que la 94 no pudo decidir, y esta corrida sí

La 94 vio debajo del piso del medidor un residuo unilateral y creciente, y no pudo
decir si era el piso o una diferencia de ley. Con la interfaz mirando:

| Crudo | Byte | Atenuación del medidor | De la salida real | Diferencia |
|---|---|---|---|---|
| 0,28 | **13** | 39,01 | 38,85 | **0,16** |
| 0,27 | **10** | 40,01 | 39,91 | **0,10** |
| 0,26 | **7** | 41,01 | 41,01 | **0,00** |
| 0,25 | **4** | 42,01 | 42,11 | **−0,11** |
| 0,20 | 0 | ∞ | 48,13 | — |

**El medidor no se comprime gradualmente cerca del piso: sigue siendo exacto hasta
el byte 4 y después cae a pico.** Es un acantilado en el byte 0, no una curva. La
ventana de bytes 16..239 que este proyecto usa es **conservadora por doce bytes**,
y eso ahora está medido.

Se informa sin umbral porque no estaba declarado antes de medir.

## Lo que sigue sin saberse

- **El bloque de EFECTOS sigue tocado.** Es estéreo de 7 bytes contra el mono de 5
  del auxiliar: son formatos distintos y medir uno no da el otro. **La 96b no
  queda rescatada por esta corrida.**
- **¿El byte `pre` de un bus está antes o después del ecualizador gráfico?** El
  corte del auxiliar 3 aparece en su `pre`, lo que dice que el gráfico está
  **aguas arriba** de ese medidor — y eso contradice la idea de que `pre` es «antes
  de todo el procesamiento del bus». La otra diferencia entre las dos tiras es
  `a.2.eq.prmod = 1` contra `a.4.eq.prmod = 0`, que podría ser justamente el
  selector de posición. **Se mide barato**: poner un corte profundo en el
  ecualizador del auxiliar 5 —que está plano y no tiene nada conectado— y ver si su
  `pre` baja.
- **Los otros ocho auxiliares.** B7 ancla el 3 al 5; de los demás no se dice nada.

## Restauración, comprobada

Las ocho claves releídas por HTTP, todas coincidiendo. Se puentearon durante la
corrida la puerta y el compresor del auxiliar y el compresor, la puerta y el
de-esser del canal, y se restauraron.
