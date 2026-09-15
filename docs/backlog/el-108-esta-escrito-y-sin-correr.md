# El ítem 108 está escrito, auditado cinco veces, y sin correr

**2026-09-13.** Contrato:
[`108-la-ley-de-la-ganancia-del-ecualizador.md`](../compromisos/108-la-ley-de-la-ganancia-del-ecualizador.md).
Guion: `tools/spikes/p0-10b-vu/ley-ganancia-del-eq.ts`. **No hay evidencia
archivada porque no corrió**, y este archivo existe para que eso no se lea como
un olvido.

## Qué mide y por qué importa

`i.N.eq.bM.gain` es **la única hoja del ecualizador que la aplicación podría
escribir**. Las cuatro leyes que midió el ítem 101 —frecuencia y Q de la campana,
y los dos filtros de corte— están en Hz y en Q, y el tope de su `kind` está en dB,
así que el motor las rechaza por INV-004 y tiene razón: un tope de 4 dB no acota
un salto de frecuencia. Está en
[`hallazgo-un-kind-una-unidad-y-las-hojas-no-coinciden.md`](hallazgo-un-kind-una-unidad-y-las-hojas-no-coinciden.md).

La ganancia **está en dB**, igual que el tope. Medirla es lo único que convierte
al ecualizador de canal —432 de las 834 rutas escribibles, «el corazón del
producto» según el propio recorrido que las cuenta— en algo que la aplicación
pueda tocar.

Y decide una contradicción abierta: la tabla declara **±15 dB** y el ítem 101 vio
**+20,0 exactos** en el extremo. Los dos no pueden ser ciertos.

## En qué estado quedó

Cinco rondas de auditoría aplicadas. La última cerró un ALTA y dejó sin bloquear:

| | |
|---|---|
| **MEDIA** | L8 sólo ve un recorte que ocurra **aguas abajo de donde el medidor del canal toma**, y dónde toma no está medido. El contrato lo dice; no es un defecto, es un límite |
| **BAJA** | el docblock de `tono()` cita las frecuencias viejas en un lugar |

**La sexta ronda no se pidió.** El patrón de la noche fue que cada ronda
encontraba algo, y dos veces lo que encontraba lo había introducido el arreglo de
la anterior. Correr con eso sin una vuelta más sería apostar a que la racha se
cortó sola.

## Lo que hace falta para correrla

1. **Una sexta auditoría** sobre lo que cambió en la quinta —L8 midiendo pico
   contra potencia, el control de calidad de las capturas de L1, el aviso del
   clamp, `refM` por sentido y el mínimo de L4—.
2. **Nada del usuario.** El banco está cableado y la corrida sólo toca el canal 10
   y el compresor del general, todo restaurado por `restaurarClaves()` y
   verificado por HTTP.
3. Unos **seis minutos** de consola.

## Y una cosa que la corrida va a dejar de regalo

L8 no sabe si el medidor de la consola es de pico o de potencia, así que **mide
las dos** y dice cuál ajusta. El ítem 99b calibró la escala del medidor con un
solo seno, donde pico y eficaz se diferencian en una constante que se absorbe en
la calibración y se cancela en toda diferencia: **el estímulo de dos tonos es la
primera vez en este proyecto que la distinción importa**. Sale medida sin costo.
