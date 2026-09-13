# 105 — De quién es la fuga de 1 kHz

**Primera versión escrita el 2026-09-13 a las 05:42. Rehecha a las 06:20 después
de una auditoría que la habría dejado publicar un veredicto falso.**
Depende de: `docs/backlog/hallazgo-el-residuo-de-la-94-no-es-la-ley.md`.

## Qué pregunta

La 104 midió, con el envío del canal 10 al auxiliar 5 **cerrado en 0**, un tono
de 1 kHz a **−91,77 dBFS** en la entrada 2 de la interfaz: 25 dB por encima del
piso del bin de ese banco, o sea una señal y no ruido. Ese aditivo explica todo
el residuo que la 94 había declarado indecidible.

La 104 no pudo decir **de dónde sale**, y la respuesta cambia qué se puede
medir: si la fuga es de la consola, es una propiedad del aparato; si es del
banco, ninguna medición de esta serie puede bajar de unos 70 dB sin corregirla.

## Lo que la primera versión de este contrato hacía mal

Se anota porque es el defecto más caro de esta serie y ya salió tres veces.

El −91,77 **no se midió con la consola en reposo**: se midió adentro de la
neutralización de la 104, con `a.4.mix = 0,45` como atenuador fijo. En reposo ese
fader vale **0**, y `faderADb(0) = −∞`. Un guion que fuera a reproducir ese
número sin reproducir el banco mediría el piso del bin en los cuatro estados, las
cuatro caídas darían ≈ 0 dB, y la tabla de veredictos imprimiría, serena y
falsa, «la fuga es anterior al mute del canal» **sobre una cadena de medición
muerta**. La expectativa que tenía que atajarlo fallaba, sí, pero no detenía
nada y acusaba a un banco que no había cambiado.

De ahí salen las dos reglas duras de abajo: **el banco se reproduce clave por
clave**, y **una guarda que falla ABORTA antes del veredicto**, no lo comenta.

## El banco, reproducido clave por clave

Igual que la 104, y por eso se listan: `a.4.mix = 0,45`,
`a.4.gate.enabled = 0`, `a.4.dyn.bypass = 1`, `i.9.dyn.bypass = 1`,
`i.9.gate.enabled = 0`, `i.9.deesser.enabled = 0`, `m.afs.enabled = 0`.
Todas leídas por HTTP antes, restauradas por `restaurarClaves()`.

Y se **exige**, sin escribir: `i.9.aux.4.value = 0` al empezar, `a.4.mute = 0`,
`m.mix` no abajo, `i.9.mute = 0`, `hwoutaux.4.src = a.4`, y que ninguna otra tira
tenga el envío a este auxiliar abierto.

## El control positivo, que va ANTES de todo

Sin esto, dos cosas quedaban supuestas y las dos deciden el resultado.

**C1 — ¿llega el tono a la consola?** Se abre `i.9.aux.4.value` a 1,0 y se mide
la entrada 2. Tiene que dar cerca de los −12,7 dBFS que midió la 104. Si da el
piso, **el tono no está entrando** —la salida por omisión de la Mac no es la
interfaz, o el cable— y no hay nada que medir: se aborta.

**C2 — ¿el mute del canal está en el camino del auxiliar?** Con el envío todavía
abierto, se mutea el canal y se vuelve a medir. El envío es **pre-fader**
(`i.9.aux.4.post = 0`); que además sea pre-mute o post-mute **este proyecto no lo
midió nunca**. Si el mute no corta el auxiliar, E2 no separa nada y la fila que
lo usa queda declarada inservible en la propia salida.

Después se cierra el envío a 0 y se desmutea. Los dos valores vuelven por
`PREVIO`.

**Lo que C2 prueba y lo que no, dicho acá porque el guion no puede decirlo.** C2
establece que el mute está **antes de la derivación del envío**. El camino que E2
tiene que cortar es el de la **fuga**, que por definición no pasa por el envío —esa
es la medición entera—. Si la fuga fuera diafonía de la tira al bus en el sumador,
o algo analógico aguas abajo del mute, la respuesta de C2 **no se transfiere**. Es
una plausibilidad fuerte, no una prueba, y la fila que la usa hereda esa limitación.

## Los estados

| | estado | qué saca del camino |
|---|---|---|
| **E0** | banco reproducido, envío en 0 | reproduce el número de la 104 |
| **E1** | `m.mix = 0` | el general en la entrada 1 de la interfaz — y adentro de la consola **sólo si el mute está antes del sumador, que nadie midió** |
| **E2** | `m.mix` restaurado, `i.9.mute = 1` | la tira, **si C2 dijo que el mute está en ese camino** |
| **E3** | el tono apagado, **con la consola como en E0** | el piso real del bin |

En los cuatro se mide el bin de 1 kHz de la **entrada 2** (el auxiliar) y de la
**entrada 1** (el general), que es el testigo.

## Las guardas, declaradas antes de mirar. Si una falla, NO se imprime veredicto

**G1 — E0 reproduce la 104.** −91,77 ± 1,5 dBFS. Si no, el banco no es el mismo
y ninguna de las otras lecturas significa nada.

**G2 — la caída máxima observable alcanza para decidir.** El margen del bin en
E0 tiene que ser ≥ 15 dB. Es una consecuencia aritmética y no una opinión: si E0
está a 7 dB del piso, una caída de más de 7 dB **no puede ocurrir**, la fila
«cae» es inalcanzable por construcción y el guion está obligado a imprimir
«queda» diga lo que diga la física.

**El general de esta consola no tiene mute.** Comprobado sobre el volcado el
2026-09-13: 736 claves con `mute` y ninguna es `m.*`. Sólo existe `m.dim`, cuya
profundidad nadie midió, así que usarlo dejaría una atenuación de tamaño
desconocido justo donde se clasifica con umbrales de 3 y 10 dB. **E1 baja el
fader del general a 0**, que es −∞ y no admite discusión.

**G3 — el testigo del general.** `generalDb` tiene que caer más de 10 dB en E1
respecto de E0. Es la comprobación de que la escritura llegó y de que el bucle
del general desapareció de la entrada 1 — la premisa entera de E1. Ídem para E2.

**G4 — E3 baja al piso.** Por debajo de −110 dBFS, **medido con la consola como
en E0**: si se midiera con el canal muteado, una fuente ajena de 1 kHz que entre
por el canal estaría tapada y la guarda pasaría sin ver nada.

**G5 — la restauración**, releída por HTTP.

## El veredicto

Un estado «cae» si baja más de 10 dB respecto de E0 y «queda» si baja menos de
3 dB. Entre 3 y 10 no se decide y se dice. **Una subida de más de 3 dB —que el
nivel suba al mutear— no es «queda»**: es una anomalía y se informa como tal. Los
3 dB son la misma banda muerta en las dos direcciones, a propósito: por debajo de
eso el instrumento no separa una subida de «no cambió».

| E1 | E2 | conclusión |
|---|---|---|
| cae | cae | la fuga viaja **aguas abajo del fader del general**. Y acá el cambio de `m.mute` a `m.mix` ayuda en vez de estorbar: un fader de general es **post-suma por construcción**, así que E1 no toca el bus interno, sólo lo que sale de él. Si el nivel cae, la fuga está en la salida del general, su cable, la entrada 1 y lo que se cruce desde ahí — y **queda excluida** la diafonía del sumador interno, que E1 no habría eliminado. Lo que esta corrida sigue sin separar es si el cruce ocurre adentro de la Scarlett o en la etapa de salida de la consola |
| queda | cae | la fuga es **de la consola**: la tira le llega al bus auxiliar sin pasar por el envío |
| queda | queda | la fuga es **anterior al mute del canal**. Dos candidatos que esta corrida NO separa: la salida de la interfaz cruzándose a su propia entrada 2, o la etapa de entrada de la consola |
| cae | queda | **contradictorio**: mutear el canal saca el tono también del general, así que si E1 cae, E2 tiene que caer. Si aparece, es un hallazgo sobre `i.9.mute` y no un veredicto sobre la fuga |

Si C2 dijo que el mute no está en el camino del auxiliar, las filas que usan E2
se declaran inservibles y sólo se informa E1.

## Lo que esta medición NO va a decir

- **Nada sobre otras frecuencias.** Un tono, 1 kHz.
- **Nada sobre si la fuga es coherente o incoherente.** El bin da amplitud y no
  fase, y sin fase no se sabe cómo se suma.
- **Nada sobre el auxiliar 3 ni el bloque de efectos.**
- En dos de las cuatro filas, **no dice cuál de los dos candidatos**. Separarlos
  pide desenchufar el cable de la entrada 1, que necesita una mano.

## Aviso para quien la corra

**Baja el fader del general del usuario a 0 durante unos 7 segundos.** Es el
primer guion de esta serie que lo hace. No se corre con público. Nada está conectado a
ninguna salida física salvo los dos cables del bucle.

**Y abre el envío del canal 10 al auxiliar 5 en 1,0 durante unos 7 segundos**,
con el bus vivo en 0,45 y el tono sonando. Es la escritura más ruidosa de la
corrida, el auxiliar 5 de una Ui24R es por omisión un envío a monitor, y el guion
lo avisa por pantalla antes de hacerlo. Durante toda la corrida —unos 48 s— el
fader de ese bus queda en 0,45 donde el usuario lo tenía en 0: es el banco de la
104 y no hay forma de medir sin eso.

**Hace falta que el fader del general esté arriba y el canal 10 sin mutear.** El
guion se niega a correr si no, porque con el general ya abajo E1 no saca nada del
camino y el falso «queda» sería indetectable.

**No se toca**: la instantánea «Alma caninde», la fantasma del canal 9.
