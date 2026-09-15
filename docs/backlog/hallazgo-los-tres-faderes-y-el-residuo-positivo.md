# La ley del fader del general, y el residuo que aparece en dos faders distintos

**Ítem 107, 2026-09-13.** Evidencia:
`docs/spikes/SPK-P0.10b-vu2/evidence/ley-del-fader-del-general-2026-09-13.txt`.
Contrato: `docs/compromisos/107-la-ley-del-fader-del-general.md`.

## El resultado

`faderADb` —`VtoLIN`, la curva que la consola sirve en su `mixer.html`— describe
la salida **física** del general con:

| tramo | acuerdo |
|---|---|
| primeros **26 dB** de atenuación | **≤ 0,007 dB** |
| 26 a 44 dB | de 0,004 a 0,025 dB |
| 44 a 48 dB | 0,043 dB |
| cota sobre todo el recorrido (L3) | **0,05 dB**, contra un escalón de medidor de 0,333 |

Seis de las siete expectativas pasaron. El medidor del canal no se movió en 46
puntos, la referencia interna de la interfaz no derivó, la ida y la vuelta
coincidieron dentro de 0,01 dB, y la consola devolvió cada crudo sin redondear.
**Ningún punto se anuló.**

**Con esto P6 tiene sus dos requisitos técnicos.** Falta el tercero, que no es
técnico: *decidir el techo del general*, y es del usuario porque él tiene una
referencia que la aplicación no tiene —cuánta gente hay en la sala—.

## Y L3b volvió a fallar, con el mismo signo que en el bus

Pendiente **+0,00057 dB/dB**, 27 signos positivos contra 17, dos cambios de signo
donde se esperarían veintidós.

El contrato del 107 había declarado, antes de mirar, qué significaría cada
resultado:

> *«El ítem 106 encontró en el fader del **bus** un residuo positivo y
> estructurado por debajo de −42 dB, que ninguna fuga explica. Si el general lo
> repite, es una propiedad de la ley o de la consola; si no, era del bus. **Los dos
> resultados dicen algo.**»*

**Lo repite.** Dos faders distintos, medidos por dos caminos físicos distintos
—el auxiliar 5 a la entrada 2, el general a la entrada 1— dan residuos positivos
con la misma forma: plano arriba, creciente abajo.

| corrida | qué barrió | pendiente | signo |
|---|---|---|---|
| **104** | el envío de un canal a un auxiliar | −0,00125 dB/dB | negativo, **explicado** por una fuga que suma |
| **106** | el fader de un bus auxiliar | +0,00146 dB/dB | positivo |
| **107** | el fader del general | +0,00057 dB/dB | positivo |

La 104 midió otra cosa —un envío, no un fader— y su residuo se explicó midiendo
la fuga. Los dos faders no.

## La forma tiene una firma, y hasta dónde llega

Un residuo **plano arriba y creciente abajo** es lo que deja **una constante
restada a la ganancia lineal**: arriba no se nota, abajo se come una fracción
cada vez mayor. Ajustando `lineal_real = lineal_ideal − k`:

| corrida | residuo sin modelo | residuo con el modelo | k ajustada |
|---|---|---|---|
| **107** | 0,043 dB, 11+/7−, 6 cambios | **0,0067 dB, 9+/9−, 4 cambios** | 1,66·10⁻⁵ |
| **106** | 0,119 dB, 6+/6−, 1 cambio | 0,016 dB, 1+/11−, 1 cambio | 2,08·10⁻⁵ |

**En el general el modelo cierra**: el residuo baja seis veces y los signos quedan
repartidos, o sea que no queda estructura que explicar. **En el bus no**: baja
mucho pero los signos siguen unilaterales, así que ahí hay algo más.

**Lo que NO se puede decir.** Las dos `k` difieren un 26 % entre sí, y ninguna es
exactamente una potencia de dos —2⁻¹⁶ = 1,53·10⁻⁵, contra 1,66 y 2,08—. Así que
la firma es **compatible** con un coeficiente de ganancia truncado, y eso no es lo
mismo que haberlo medido. Decir «la consola trunca la ganancia a 16 bits» sería
exactamente la clase de salto que este proyecto viene evitando toda la noche.

Lo que sí queda: una forma que ajusta, un orden de magnitud, y **un candidato
concreto que antes no había** —el 106 se quedó sin ninguno después de descartar la
fuga en antifase—.

## Lo que esto significa para el producto

**Nada que corregir.** Sobre los primeros 26 dB el acuerdo es de 0,007 dB y la
cota sobre los 48 es de 0,05, contra un escalón de medidor de 0,333 y contra
límites de producto de 2 y 3 dB por transacción. La desviación está dos órdenes
de magnitud por debajo de lo que cualquier uso necesita.

Lo que cambia es lo que se puede **afirmar**: `faderADb` no es la ley exacta del
aparato en el fondo del recorrido, y ahora está medido en dos faders.

## Lo que esta corrida NO dice

- **Nada por encima de donde el usuario dejó el fader.** El barrido sólo baja, a
  propósito: `m.mix` mueve la sala. La parte de arriba del recorrido —de 0,7643 a
  1,0, que son diez decibeles— **queda sin medir**.
- **Nada sobre el cero absoluto.** Relativa al arranque.
- **Nada sobre la ley inversa.** Se midió crudo → dB.
- **Nada sobre el techo del general**, que es la decisión que falta.
- Un día, una frecuencia, un nivel de fuente. Y un acuerdo dentro del umbral es
  una **cota**, no una identidad.
