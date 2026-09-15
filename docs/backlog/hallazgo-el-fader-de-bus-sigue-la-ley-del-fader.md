# La ley del fader de un bus auxiliar, medida contra la salida real

**Ítem 106, 2026-09-13.** Evidencia:
`docs/spikes/SPK-P0.10b-vu2/evidence/ley-del-fader-de-bus-2026-09-13.txt`.
Contrato: `docs/compromisos/106-la-ley-del-fader-de-bus-contra-la-salida-real.md`.
Reemplaza a la 99a, cuyo método era el mismo y cuyo techo declarado —«esto es
autoconsistencia y no calibración»— ya no aplica.

## Lo que decide

El usuario decidió el 2026-09-12 que la aplicación pueda **bajar el auxiliar y el
general** para cazar un acople. `a.N.mix` va de 0 a 1 y nadie sabía a cuántos
decibeles corresponde; sin ese eje no se puede declarar un límite en dB, e
INV-004 rechaza todo parámetro sin límite. Es lo que bloqueaba **P6**.

**No decide que `a.N.mix` deba abrirse.** No es el envío de un canal: es el
volumen entero de esa cuña. Medir la ley es el requisito, no la decisión.

## El resultado

`faderADb` —o sea `VtoLIN`, la curva que la consola sirve en su propio
`mixer.html`— describe la salida **física** del bus con:

| tramo | acuerdo |
|---|---|
| primeros **42 dB** de atenuación | **≤ 0,010 dB** |
| 42 a 48 dB | 0,044 dB |
| 48 a 55 dB | 0,119 dB |
| cota sobre todo el recorrido (L3) | **0,14 dB**, contra un escalón del medidor de 0,333 |

Siete de las ocho expectativas pasaron: el `pre` del bus no se movió (está antes
del fader, como estaba medido), el medidor del canal tampoco, la referencia
interna de la interfaz no derivó, el recorrido útil fue de 55,21 dB sobre 40
puntos, la ida y la vuelta coincidieron dentro de 0,02 dB, y la consola devolvió
cada crudo sin redondear.

## Y L3b falló: el residuo está estructurado

Pendiente **+0,00146 dB/dB**, 26 signos positivos contra 12, **dos** cambios de
signo donde con residuos independientes se esperarían diecinueve.

L3b estaba declarada antes de mirar y es la que decide, por lo que la 104 tuvo
que aprender: una cota de máximo absoluto no ve una desviación que crece. Así que
esto es el hallazgo, no una contradicción con el PASA de L3.

**Y el signo es el opuesto al de la 104.** Aquella midió el envío en este mismo
banco y dio −0,00125 dB/dB, un residuo **negativo** que se explicó por una fuga
que **suma**. Acá el residuo es **positivo**: la atenuación real es *mayor* que la
que predice la ley, y una fuga que suma no puede hacer eso.

### Dos candidatos, y uno lo descartó la propia corrida

La fuga en **antifase** —que restaría amplitud y atenuaría de más— explicaría la
forma. Pero tendría que estar a **−90 dB** de la referencia, y **C2 midió la fuga
total de esta corrida en −104,4 dB**: catorce decibeles más chica que lo que el
modelo necesita. Queda descartada con el dato de la misma corrida.

Lo que queda abierto es si el fader del bus **se aparta de `VtoLIN` por debajo de
−42 dB**, o si hay algo del banco a nivel bajo que no está identificado.

### Lo que hay que decir del tamaño de la evidencia

**La estructura la cargan los dos puntos más bajos.** Sobre los primeros
diecisiete el residuo es plano en ±0,010 dB. Los dos que se despegan —crudo 0,20
y 0,15— tienen 56 y 49 dB de margen, o sea un error de instrumento de 0,014 y
0,031 dB, y sus residuos son 0,044 y 0,119: tres y cuatro veces el error. Están
por encima del ruido, **y son los dos más cercanos al umbral de anulación**, que
la corrida puso en 45 dB. El punto siguiente, crudo 0,10, quedó anulado con 41 dB
de margen.

Con eso: el hallazgo es real y está acotado, y no aguanta que se lo estire.

## Qué desbloquea

**P6.** La ley de `a.N.mix` está medida contra un convertidor externo, que es el
primero de los tres requisitos que `decision-bajar-buses-para-cazar-acoples.md`
declara. Faltan los otros dos: la ley de `m.mix` —el general, que es otra ruta y
otra medición— y **decidir el techo del general**, que es del usuario porque él
tiene una referencia que la aplicación no: cuánta gente hay en la sala.

**No se agrega `a.N.mix` a la tabla de conversión todavía.** `rutasProbadas()`
está documentada como «las únicas escribibles por vía cruda», y esta ruta no está
abierta ni va a estarlo sin su ADR. Agregarla ahí haría que esa frase deje de ser
cierta.

## Lo que esta corrida NO dice

- **Nada sobre `m.mix`.** Otra ruta, otra medición.
- **Nada sobre el cero absoluto.** Es relativa al tope del barrido: un error de
  escala constante es invisible por construcción.
- **Nada sobre la ley inversa.** Se midió crudo → dB.
- **Un bus de diez, un día, una frecuencia, un nivel de fuente.** Nada sobre los
  otros nueve auxiliares, ni los subgrupos, ni los efectos.
- **Un acuerdo dentro del umbral es una cota, no una identidad.**

## Y una corroboración que salió de regalo

C2 midió la fuga de 1 kHz con el fader del general en 0: **−117,07 dBFS**, contra
un ruido de bin de −118,74. O sea que la fuga desapareció en el ruido, **25,3 dB
por debajo** de lo que midió la 104 con el general arriba.

El ítem 105 había concluido que la fuga viaja por el camino del general, con una
**cota** —«cayó al menos 30,4 dB»—. Esta corrida lo vuelve a medir en otro banco,
con otro propósito, y da lo mismo. No estaba buscándolo.
