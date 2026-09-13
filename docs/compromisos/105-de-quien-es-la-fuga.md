# 105 — De quién es la fuga de 1 kHz

**Contrato escrito el 2026-09-13 a las 05:42, ANTES de tocar la consola.**
Depende de: `docs/backlog/hallazgo-el-residuo-de-la-94-no-es-la-ley.md`.

## Qué pregunta

La 104 midió, con el envío del canal 10 al auxiliar 5 **cerrado en 0**, un tono
de 1 kHz a **−91,77 dBFS** en la entrada 2 de la interfaz: 25 dB por encima del
piso del bin de ese banco, o sea una señal y no ruido. Ese aditivo explica todo
el residuo que la 94 había declarado indecidible.

La 104 no pudo decir **de dónde sale**, y la respuesta cambia qué se puede
medir: si la fuga es de la consola, es una propiedad del aparato; si es del
banco, ninguna medición de esta serie puede bajar de unos 70 dB sin corregirla.

## El banco

El mismo de la 104. Salida de la interfaz → entrada 10 de la consola; general →
entrada 1 de la interfaz; auxiliar 5 → entrada 2. Tono de 1 kHz. **El envío
`i.9.aux.4.value` queda en 0 toda la corrida: esto no barre nada.**

## Los estados, y qué separa cada uno

| | estado | qué saca del camino |
|---|---|---|
| **E0** | como está | reproduce el número de la 104 |
| **E1** | `m.mute = 1` | la entrada 1 de la interfaz se queda sin señal |
| **E2** | `m.mute = 0`, `i.9.mute = 1` | la consola se queda sin tono en todos sus buses |
| **E3** | el tono apagado | el piso real del bin, en este mismo estado |

Lectura: en los cuatro se mide el bin de 1 kHz de la entrada 2.

## Las expectativas, declaradas antes de mirar

**L1 — E0 reproduce la 104.** El bin de 1 kHz en E0 tiene que dar
−91,77 ± 1,5 dBFS. Si no, el banco cambió entre las dos corridas y **ninguna de
las otras tres lecturas significa nada**: se aborta y se dice.

**L2 — E3 baja al piso.** Con el tono apagado, el bin tiene que caer por debajo
de −110 dBFS. Si no, hay una fuente de 1 kHz que no es el tono que este guion
reproduce, y la pregunta está mal planteada.

**L3 — el veredicto, que es una tabla y no un umbral.** Un estado «cae» si baja
más de 10 dB respecto de E0, y «queda» si baja menos de 3 dB. Entre 3 y 10 dB no
se decide y se dice que no se decide.

| E1 | E2 | conclusión |
|---|---|---|
| cae | — | la fuga entraba por la **entrada 1 de la interfaz**: diafonía del bucle del general. Es del banco |
| queda | cae | la fuga es **de la consola**: la tira le llega al bus auxiliar sin pasar por el envío |
| queda | queda | la fuga es **anterior al mute del canal**: o la salida de la interfaz se cruza a su propia entrada 2, o la etapa de entrada de la consola la filtra. **Esta corrida no separa esas dos**, y separarlas pide desenchufar un cable |

**L4 — el testigo de que el tono no se movió.** El bin de 1 kHz de la entrada 1
en E0 y en E2: entre los dos tiene que haber una caída grande (el mute del canal
apaga el general), y en E0 tiene que estar donde la 104 lo dejó. Si la entrada 1
no cambia al mutear el canal, **el mute no hace lo que se cree** y E2 no prueba
nada.

**L5 — la restauración.** `m.mute`, `i.9.mute` y `m.afs.enabled` releídos por
HTTP al terminar, comparados contra lo leído al empezar.

## Lo que esta medición NO va a decir

- **Nada sobre la magnitud de la fuga en otras frecuencias.** Un tono, 1 kHz.
- **Nada sobre si la fuga es coherente o incoherente.** El bin de Goertzel da
  amplitud, no fase, y sin fase no se sabe cómo se suma.
- **Nada sobre el auxiliar 3 ni sobre el bloque de efectos.**
- Si el veredicto es «queda/queda», **no dice cuál de las dos**.

## Lo que se escribe, y cómo vuelve

`m.mute`, `i.9.mute`, `m.afs.enabled` —éste último a 0 mientras suene, por la
regla del 2026-09-13—. Los tres leídos por HTTP antes, restaurados por
`restaurarClaves()` dentro de `conRestauracion`, verificados por HTTP después.

**No se toca**: la instantánea «Alma Caninde», la fantasma del canal 9, ni el
envío `i.9.aux.4.value`, que ya vale 0 y se deja.
