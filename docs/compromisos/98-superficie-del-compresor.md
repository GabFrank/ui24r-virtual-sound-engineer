# 98 — La superficie del compresor: umbral × relación

**Fecha: 2026-09-12.** Consola 192.168.0.78, fw 3.4.8318-ui24. Canal 10 (`i.9`),
la línea de la Scarlett. Contrato escrito **antes** de tocar la consola.

## Por qué este barrido y no otro

La medición 97 refutó el modelo que estaba escrito —`VtoTHRESH(a) = −90 + 96a`
con `VtoRATIO(a) = 1/a` y rodilla dura— y dejó dos cortes de la superficie que
**no se pueden reconciliar entre sí**: la relación `−20·log₁₀(a)` encaja dentro
de 0,48 dB con el umbral en 0,14 y predice 6,02 dB donde se midieron 2,98 con el
umbral en 0,4672.

Con dos cortes no se puede decidir si esa discrepancia es la ley o la
saturación. Lo que hace falta es la **superficie**: la reducción como función de
las dos variables a la vez.

## El método, y por qué este y no el de la 97

**La reducción se mide como caída de nivel, no se despeja de una rodilla.**

La 97 ubicó una «rodilla» —el primer crudo de umbral con reducción informada
mayor que cero— y de ahí despejó el exceso. Una auditoría de aritmética mostró
el sesgo: el medidor de reducción tiene un piso de **0,984 dB**, así que para
que salga de cero hace falta `0,984/(1−a)` dB de exceso real. Con `a = 0,1` son
**1,09 dB**. O sea que en la rodilla la señal ya estaba 1,09 dB sobre el umbral,
y todo exceso despejado de ahí arrastra ese sesgo —el «exceso de 6 dB» de la 97
era de 7,09—.

Acá no se despeja nada. Se usa el método que la 97 terminó validando con su
propia corrida de calibración:

1. **La fuente se queda quieta.** Un tono de 1 kHz por la Scarlett, un solo
   nivel, la ganancia del previo sin tocar.
2. **Para cada umbral, se lee una referencia con `ratio = 1`**, que es «el
   compresor puesto y sin comprimir». Deliberadamente **no** `dyn.bypass`:
   puentear saca el bloque entero con su ganancia de compensación, y la
   diferencia mezclaría reducción con compensación. Es el error que ya costó dos
   corridas.
3. **La reducción real** de cada punto es la caída de `entrada` (byte `+1`,
   procesado y pre-fader) respecto de la referencia **de su propio umbral**.
4. **`pre` (byte `+0`, antes de todo) es el testigo.** Si se mueve, la fuente se
   movió y el punto no vale.
5. El medidor de reducción (`+5`) se lee también, como **segundo instrumento**,
   no como fuente de verdad.

## La rejilla

**Umbrales** (crudo), seis: `0,10 · 0,18 · 0,26 · 0,35 · 0,4672 · 0,55`.

El 0,4672 está porque es donde la 97 midió los 2,98 dB que no encajan, y el 0,14
de la 97 queda entre el 0,10 y el 0,18: los dos cortes anteriores caen dentro de
esta rejilla y la superficie tiene que reproducirlos.

**Relaciones** (crudo `a`), ocho más la referencia: `1,0` (referencia) · `0,9` ·
`0,7` · `0,5` · `0,35` · `0,25` · `0,15` · `0,10` · `0,05`.

Son 54 puntos. A seis segundos por punto —asentamiento más ventana— son unos
seis minutos de tono sostenido.

## Expectativas registradas

Falsables, con su umbral, **antes de correr**. El umbral es de **dos escalones**
del instrumento cuando la cantidad es diferencia de dos lecturas, que es el caso
de toda reducción de esta corrida
(`docs/backlog/hallazgo-umbral-de-una-diferencia.md`).

| # | Predicción | Qué la falsaría |
|---|---|---|
| S1 | **Las seis referencias de `ratio = 1` coinciden entre sí** dentro de dos escalones del medidor de nivel (0,667 dB). Con la relación en 1 no hay compresión, así que el umbral no debería cambiar nada | Que difieran. Significaría que el umbral hace algo por sí solo —compensación que sigue al umbral, o que `ratio = 1` no es exactamente 1:1— y **la definición de reducción de esta corrida se cae** |
| S2 | **El testigo `pre` no se mueve** más de dos escalones en los 54 puntos | Que se mueva. La fuente cambió y los puntos afectados no valen |
| S3 | **La reducción crece monótonamente** al bajar `a`, para cada umbral fijo | Que no. Sería la firma de una saturación, y hay que ubicarla antes de ajustar nada |
| S4 | **La reducción crece monótonamente** al bajar el umbral, para cada `a` fijo | Que no |
| S5 | **Los dos cortes de la 97 se reproducen.** Con el umbral en 0,4672 y `a = 0,5` tiene que salir 2,98 ± 0,67 dB | Que no salga. Significaría que algo del banco cambió entre el 97 y esto, y **la corrida entera queda en duda** |
| S6 | **El medidor de reducción concuerda con la caída medida** dentro de un escalón de reducción (0,667 dB) en todo punto donde informe más que su piso | Que no. Contradiría la calibración de la 97, que lo validó hasta 24,34 dB |
| S7 | **`−20·log₁₀(a)` NO describe la superficie.** Si describiera la reducción en función de `a` solamente, sería la misma curva a los seis umbrales | Que sea la misma curva a los seis. Entonces la reducción no depende del umbral, que es absurdo para un compresor y habría que explicar los 2,98 de la 97 de otro modo |

## Lo que esta corrida NO va a poder decir, dicho antes

- **Nada sobre los tiempos.** Ataque y relajación no se miden acá: cada punto se
  lee después de asentarse. Sigue pendiente (C5 de la 97).
- **Nada sobre la rodilla blanda.** `dyn.softknee` se deja como está y no se
  barre. Si está encendido, lo que se mide es la superficie **con** esa rodilla.
- **Un canal, una frecuencia, un nivel de fuente.** Igual que la 97.
- **Nada sobre `outgain`.** Se deja quieto. La ganancia de compensación queda
  dentro de la medición, y por eso la referencia es `ratio = 1` y no `bypass`.
- **Y no se va a ajustar una curva y publicarla.** Ni con 54 puntos. Lo que se
  busca es la **forma** de la superficie y si los dos cortes de la 97 caen en
  ella; una fórmula sale de acá sólo si se sostiene en los seis umbrales a la
  vez. Los tres barridos de 84,5 dB que este proyecto tuvo que retirar eran
  rectas impecables, y lo que los delató fue que no coincidían entre sí.

## Restauración

Lo que se escribe: `i.9.dyn.threshold`, `i.9.dyn.ratio`, y `m.afs.enabled` en 0
mientras el tono suena —el supresor aprende notches de −18 dB con un tono
sostenido, y ya le plantó seis al general una vez—.

Los tres valores previos **se leen del aparato antes de empezar** con
`exigirClave`, no se escriben a mano. La restauración va por `conRestauracion`,
que corre también si llega una señal. Y se comprueba **releyendo por HTTP**, que
es un camino distinto del WebSocket que escribió.
