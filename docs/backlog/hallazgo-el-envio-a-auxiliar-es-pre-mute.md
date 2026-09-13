# Hallazgo: el envío a auxiliar es pre-fader **y pre-mute**

**Medido el 2026-09-13, ítem 105, control positivo C2.** Evidencia:
`docs/spikes/SPK-P0.10b-vu2/evidence/de-quien-es-la-fuga-2026-09-13.txt`.

## El dato

Con el envío `i.9.aux.4.value` abierto en 1,0 y un tono de 1 kHz sonando, se
muteó el canal 10 y se volvió a medir la salida física del auxiliar 5:

```
C1  envio ABIERTO en 1,0              -12.68 dBFS   margen 103 dB
C2  envio abierto + canal MUTEADO     -12.68 dBFS   margen 104 dB
```

**Cero coma cero cero decibeles.** Mutear el canal no le saca ni un decibel al
envío a auxiliar.

Es una medición de margen alto —103 dB de margen en el bin— y no depende de
ninguna de las guardas que esta corrida falló: las dos lecturas salen de la
misma configuración y sólo se diferencian en el mute.

## Por qué importa

El proyecto tenía medido que el envío es **pre-fader** (`i.9.aux.4.post = 0`, y
está en el volcado). **De la relación con el mute no sabía nada**, y no es lo
mismo: son dos puntos distintos de la tira.

Para la aplicación, esto es una regla de operación real: **mutear un canal no
silencia lo que ese canal manda al monitor del músico.** Un asistente que
proponga «muteá el canal 10» para sacar algo de la mezcla de monitores está
proponiendo algo que no hace nada. Lo que hay que bajar es el envío.

Y para las mediciones de esta serie, es lo que convirtió al estado E2 del ítem
105 en inservible: el control positivo lo dijo antes de que la corrida se
apoyara en él, que es exactamente para lo que estaba puesto.

## Lo que esto NO dice

- **Un canal, un auxiliar, un nivel.** No se probó en otras tiras ni en los
  buses de efectos.
- Nada sobre `i.N.aux.M.postproc`, que es otra derivación distinta.
- Nada sobre si el mute de un **bus** (`a.N.mute`) se comporta igual.
