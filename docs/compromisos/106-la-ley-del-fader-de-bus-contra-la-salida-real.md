# 106 — La ley del fader de un bus, contra la salida real

**Contrato escrito el 2026-09-13, ANTES de tocar la consola.** Consola
192.168.0.78, fw 3.4.8318-ui24. Canal 10 (`i.9`) → auxiliar 5 (`a.4`) → entrada 2
de la Scarlett.

## Qué reemplaza, y por qué ahora

El contrato **99a** (2026-09-12) diseñó esta misma medición contra el medidor de
la consola, y declaró honestamente su techo:

> *«Esto es autoconsistencia y no calibración: se contrasta un medidor de la
> consola contra la ley que otro medidor de la misma consola sostiene.»*

**Ese techo ya no está.** El auxiliar 5 está cableado a la entrada 2 de la
interfaz, y los ítems 102, 104 y 105 lo caracterizaron. Así que la ley se mide
contra un convertidor externo y no contra la propia consola. El 99a queda
reemplazado por esto; su método sigue siendo válido y su limitación ya no aplica.

## Qué decide

El usuario decidió el 2026-09-12, eligiendo entre opciones, que la aplicación
pueda **bajar el auxiliar y el general** para cazar un acople: «*Los dos, con
techo*». `a.N.mix` va de 0 a 1 y **nadie sabe a cuántos decibeles corresponde**,
y sin ese eje no se puede declarar un límite en dB — e INV-004 rechaza todo
parámetro sin límite declarado. Es lo que hoy bloquea **P6**.

**No decide que `a.N.mix` deba abrirse.** `a.N.mix` no es el envío de un canal,
es **el volumen entero de esa cuña**. Medir la ley es el requisito de INV-004, no
la decisión; abrirla necesita su propio ADR.

## El banco, y qué se escribe

`i.9.aux.4.value = 0,45` fijo, como fuente del bus. Con el bus al tope eso
**debería** poner la interfaz cerca de los −12,68 dBFS que midió la 104 con la
cadena al revés — y ese número **se imprime como referencia y no se compara
contra nada**, por lo que dice C1 más abajo: sale de suponer que el fader del
bus sigue `faderADb`, que es la hipótesis bajo prueba.

*(La primera versión de esta sección decía «si sale otra cosa, el banco se
movió», y veintiocho líneas más abajo el mismo documento lo declaraba falso y
peligroso. El arreglo se aplicó en un lugar y no en el otro — el mismo descuido
que en el guion, donde el control viejo sobrevivió al lado del nuevo.)*

Se barre **`a.4.mix`**, que es lo que se mide.

**Y se baja el fader del general a 0 durante toda la corrida**, que es nuevo y
sale de un hallazgo. El ítem 105 midió que la fuga de 1 kHz que ensucia el fondo
de estas mediciones **viaja por el camino del general**: con `m.mix = 0` cayó al
menos 30,4 dB y se hundió bajo el piso de su propia captura. Bajarlo acá no
cuesta nada —esta medición usa la entrada 2, no la 1— y **compra el fondo del
barrido**, que es justo donde la 94 no pudo decidir.

Se neutraliza, como en la 104: puerta y compresor del bus, compresor, puerta y
de-esser del canal, y `m.afs.enabled = 0` mientras el tono suene.

Se **exige sin escribir**: `a.4.mute = 0`, `a.4.afs.enabled = 0`,
`hwoutaux.4.src = a.4`, `i.9.mute = 0`, el ecualizador del bus plano, y cero
tiras además del canal 10 mandando a este auxiliar.

## Los controles positivos, antes de todo

**C1 — el tono llega, y nada más que eso.** Con el envío en 0,45 y el bus al tope,
la entrada 2 tiene que estar **al menos 85 dB por encima del piso efectivo**, que
no es un número elegido: es la condición necesaria para que L5 pueda pasar —45 dB
de margen para que un punto valga, más 40 de recorrido entre el mejor y el peor—.
Exigir menos abre una franja donde C1 dice «el tono llega», se barren cinco
minutos con el general del usuario en 0, y L5 falla por aritmética. En este banco
se esperan 104 dB. Si
no, el tono no está entrando —la salida por omisión de la Mac puede no ser la
interfaz— y no hay nada que medir: **el guion lanza en el sitio**, adentro de
`conRestauracion`, que es donde la excepción pasa por la restauración.

**Y NO compara contra un nivel absoluto, que es un error que esta versión del
contrato tuvo que corregir.** La primera decía «−12,68 ± 3 dBFS, y si sale otra
cosa el banco se movió». Es falso y peligroso: ese −12,68 sale de suponer que el
fader del **bus** sigue `faderADb`, que es justo la hipótesis bajo prueba. Con un
tope del bus de +6 dB en vez de +10, C1 leería −16,68 y abortaría — **el control
mataría la corrida exactamente cuando hay hallazgo**. Se comprobó con la
aritmética de la 104 antes de correr nada.

El control del banco que **no** es circular es L7.

**C2 — la fuga, medida y no supuesta.** Con el bus al tope y el **envío cerrado**,
se mide el bin de 1 kHz. Eso es lo que entra por fuera del camino que se barre.
No se aborta por esto: **el número se usa**. El piso efectivo de la corrida es el
mayor entre el ruido del bin y esta fuga, y **todo punto que no esté 45 dB por
encima del piso efectivo se ANULA** —se informa y no se puntúa—.

La distinción importa: `pisoDelBin` promedia bins vecinos salteando los de
guarda, así que **una fuga coherente en 1 kHz es invisible para esa estimación**.
Medirla aparte es lo que impide publicar como medidos los puntos que la fuga
sostiene.

## Las expectativas, declaradas antes de mirar

**L1 — el `pre` del auxiliar no se mueve.** Está antes del fader del bus (medido
el 2026-09-09). Más de 0,667 dB en todo el barrido lo falsa, y reabriría qué es
ese byte.

**L2 — el medidor del canal no se mueve** más de 0,667 dB: la fuente cambió y la
corrida no vale.

**L3 — la salida real contra `faderADb`.** Desvío máximo por debajo de un escalón
del medidor (0,334 dB) en los puntos no anulados.

**L3b — y el residuo no tiene estructura.** Pendiente del residuo contra la
atenuación **por debajo de 0,002 dB/dB**, y al menos un tercio de los cambios de
signo que se esperarían con residuos independientes. Los dos números van acá y no
sólo en el código: una expectativa cuyo umbral no está pre-registrado no es una
expectativa. **Es la expectativa que decide**, y está
acá porque la 104 tuvo que agregarla: una cota de máximo absoluto no ve una
desviación que crece, que es exactamente la firma que la 94 declaró indecidible.
Su modo de falla propio es el residuo correlacionado, y una cota no puede verlo.

**L4 — ida y vuelta.** El mismo crudo da la misma atenuación bajando y subiendo,
dentro de 0,667 dB.

**L5 — recorrido de al menos 40 dB** entre los puntos no anulados, y la
aritmética se escribe para que el número no sea una opinión:
`faderADb(1,0) − faderADb(0,10) = 62,86 dB`. Con el piso del bin de este banco
(≈ −117 dBFS) la regla de 45 dB corta en −72 dBFS y deja ≈ 59 dB útiles, así que
40 pasa cómodo **si `m.mix = 0` efectivamente baja la fuga**. Si no la baja
—piso ≈ −91,8— quedan 34 dB y L5 falla. Por eso el guion **comprueba que
`m.mix = 0` llegó** en vez de suponerlo: sin esa comprobación, L5 fallaría
acusando «el banco se degradó», que es la consola equivocada.

**L7 — la referencia interna de la interfaz no deriva** más de **0,1 dB**, y el
número sale de L3b: una pendiente de 0,002 dB/dB sobre los ~59 dB de recorrido
son 0,118 dB de deriva total, así que un tope más grueso dejaría que el
instrumento **fabricara el hallazgo de L3b** sin que este control se entere. La
104 midió 0,00 dB sobre 50 capturas con un tope de 0,2: apretar no cuesta nada. Es el
**único control sobre el instrumento** de toda la corrida: la entrada 3 es un
retorno interno de la Scarlett y no pasa por la consola, así que si deriva, lo
que cambió es la computadora o el conversor. Todo lo demás vigila la consola.

**L6 — el crudo escrito contra el releído por HTTP**, y el veredicto **en
decibeles y no en bits**: lo que importa no es si la consola redondea sino cuánto
cuesta en la unidad de L3. El tope es una décima de escalón (0,033 dB). Un
redondeo a 1e-4 en el crudo vale ~0,005 dB y rechazarlo sería rechazar por algo
que no se puede ver.

Dos crudos del barrido están fuera de la rejilla de centésimos a propósito: sin
ellos esta expectativa no puede fallar.

**Los mínimos, porque sin ellos una expectativa decide en el vacío.** Hacen falta
**10 puntos útiles** para que L3 y L3b digan algo —con uno solo, la pendiente del
residuo da `NaN`, la comparación contra el umbral es falsa, y L3b imprimiría
«PASA, sin estructura que explicar» sobre un punto—; **20 cuadros VU2** por
captura para que un promedio sea un promedio; y L4 y L6 informan **cuántos pares
compararon** antes del número, porque cero pares dejaba «diferencia máxima
0,00 dB — PASA», que no distingue «no hubo diferencia» de «no se comparó nada».

**Si cualquiera de C1, L1, L2, L5 o L7 falla, NO se imprime ley.** Una ley
publicada sobre una cadena de medición rota se ve igual de seria y es falsa.

## Lo que esta corrida NO va a decir

- **Nada sobre `m.mix`.** El general es otra ruta y otra medición.
- **Nada sobre el cero absoluto.** Es relativa al tope del barrido: un error de
  escala constante es invisible por construcción.
- **Nada sobre la ley inversa.** Se mide crudo → dB.
- **Un bus de diez, un día, una frecuencia, un nivel de fuente.** Nada sobre los
  otros nueve auxiliares, ni los subgrupos, ni los efectos —que son estéreo y
  tienen otro reparto de bytes—.
- **Un acuerdo dentro del umbral es una COTA, no una identidad.** Dice que si hay
  diferencia es menor que la resolución; no dice que sean la misma ley. La
  tentación de escribir «el fader del bus usa la ley del fader» va a estar igual.

## Restauración

`i.9.aux.4.value`, `a.4.mix`, `m.mix`, `a.4.gate.enabled`, `a.4.dyn.bypass`,
`i.9.dyn.bypass`, `i.9.gate.enabled`, `i.9.deesser.enabled`, `m.afs.enabled`.
Todos leídos por HTTP antes, restaurados por `restaurarClaves()` dentro de
`conRestauracion`, y verificados releyendo por HTTP.

**Y la pila de filtros del supresor se compara antes contra después**, porque de
todas las claves que se escriben, `m.afs.enabled` es la única cuya pérdida no
mueve ninguna expectativa y sí le deja al usuario una notch de −18 dB.

## Aviso

**Baja el fader del general a 0 durante toda la corrida** —unos **cinco minutos**,
no tres: 42 puntos a ~5,8 s cada uno más el preámbulo— y abre el envío del canal
10 al auxiliar 5 en 0,45. Nada está conectado a ninguna salida
física salvo los dos cables del bucle.

**No se toca**: la instantánea «Alma caninde», la fantasma del canal 9.
