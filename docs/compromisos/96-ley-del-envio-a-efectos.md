# 96 — La ley del envío a efectos

**Escrito antes de tocar la consola.** Citas del usuario:
[`00-lo-que-dijo-el-usuario.md`](../pedidos/00-lo-que-dijo-el-usuario.md).

## Qué se mide

`i.N.fx.M.value`, el envío del canal al bus de efectos. Va de 0 a 1 y nadie
sabe a cuántos dB. Es el paso 11 del camino del MVP, y entra porque el usuario
lo pidió explícitamente: *«tambien tiene que entrar al mpv, GATE, COMPRESOR, EQ,
EFFECTOS (porque el mix de una banda depende de estos y no solo de eq)»*.

## Por qué esto NO es la medición 94 otra vez

**Un bus auxiliar es una suma limpia. Un bus de efectos tiene un procesador
adentro.** La cadena es: envíos → suma → reverb o delay → fader del bus.

Y **nadie documentó dónde toma el medidor del bus**. Si toma después del
procesador, lo que se mediría no es la ley del envío sino envío × respuesta del
reverb, con cola y todo. Por eso la primera pregunta no es la ley: es dónde
toma el medidor. **Si esa sale mal, el resto de esta medición no se puede
hacer así y hay que decirlo en vez de forzarla.**

Suponer que la ley del envío a efectos es la del auxiliar porque «son los dos
envíos» sería exactamente el error que la 94 casi comete y que el auditor
nombró: dar por buena una ley porque es la de al lado.

## El banco

| Qué | Valor | Por qué |
|---|---|---|
| Fuente | tono de 1 kHz por la Scarlett al canal 10 (`i.9`) | el banco de siempre |
| Bus | **efecto 2** (`f.1`) | **cero canales le mandan**. `f.0` tiene diez, `f.2` ocho, `f.3` cuatro y está silenciado. Es el único bus limpio de la consola |
| Lectura | `decodificarVuBuses(...).efectos[1]`, los bytes `preIzq`/`preDer` | es bus **estéreo**, siete bytes, decodificador distinto del auxiliar |
| Testigo | `pre` del canal 10 | anterior a todo el procesamiento |

**Cuidado que la 95 dejó servido:** los cuatro envíos a efectos del canal 10
tienen **`post = 1`**, al revés que el auxiliar. O sea que el envío **sigue al
fader del canal**, y el fader no se toca durante el barrido.

## Lo que el auditor cambió, antes de medir

Corrió en contexto fresco **antes de la corrida** —corrigiendo la desviación de
la 95— y devolvió catorce trampas. Cuatro reescribieron el diseño:

**1. El mapa de bytes del bus de efectos no está verificado, y dos documentos se
contradicen sobre eso.** `busEstereo()` nombra `preIzq/preDer/postIzq/postDer`,
y su docblock dice que se midió «con el canal 10 asignado al **subgrupo 1**».
`capability-matrix.md` afirmaba «Cada byte identificado» para subgrupo **y**
efecto; `protocol-spec.md` §4.4 lo lista como **pendiente** en dos lugares. El
spec tenía razón y la matriz quedó corregida. **Un subgrupo no tiene procesador
y un bus de efectos sí: «previo» y «posterior» pueden no significar lo mismo.**

Consecuencia: **esta medición se parte en dos.** Primero el mapa de bytes, que
es el pendiente que el spec ya nombraba. La ley del envío no se puede medir
sobre un byte cuyo significado se supone.

**2. Un procesador transparente es indistinguible de no estar.** Mi prueba de R0
—cortar el envío y buscar cola— no separa «el medidor toma antes del procesador»
de «toma después de un procesador que en este estado no hace nada». Es la misma
estructura del episodio del micrófono en el general, retirado el 2026-09-11:
«no se movió» leído como «el silencio lo saca» cuando era «nunca llegó».
**Hace falta un control positivo**: cambiar algo del procesador que cambie su
ganancia y ver si el medidor se entera.

**3. El aislamiento de `f.1` se leyó del estado, no se probó.** Falta el control
negativo: poner `i.9.fx.1.value = 0` y confirmar que el bus cae al piso.

**4. Si el medidor toma después del procesador, hay un método que esquiva el
problema entero: sustitución.** En vez de creerle a la linealidad del medidor a
través de un reverb, **anular**: por cada valor de envío, compensar con
`i.9.mix` —cuya ley está medida y cierra en 0,06 dB— hasta que el medidor del
bus vuelva a la misma lectura. La ley sale de dB de fader conocidos contra crudo
de envío. **Y se autovalida: si no se puede anular, el procesador no es
invariante y la ley no existe como esta pregunta la plantea.**

Y una que no aplica pero conviene dejar escrita: el auditor avisó que `leer()`
devuelve lista vacía ante una trama corta, descartando lo ya leído. Es cierto y
**es deliberado** —su docblock lo dice: «preferimos no informar antes que
informar un byte de otra sección»—. El guion comprueba `undefined` antes de
usar, así que no se cuela un cero como lectura.

## Lo que predigo

| # | Predicción | Cómo se falsa |
|---|---|---|
| **R0** | **El medidor del bus toma DESPUÉS del procesador.** Al cortar el envío de golpe, el nivel baja con cola de reverb, no de una | Que caiga al piso en una o dos tramas: entonces toma antes y la medición es tan limpia como la del auxiliar |
| R1 | La ley del envío es la del fader, dentro de un escalón del medidor | Desvío mayor que un escalón en algún punto |
| R2 | Con `post = 1`, mover el fader del canal mueve el bus de efectos | Que no lo mueva |
| R3 | El testigo no deriva más de un escalón | Que derive |

**R0 es la que manda.** Si sale como la predigo, R1 sólo se puede medir en
régimen —con el tono sostenido y esperando a que el reverb se asiente— y con
ventanas mucho más largas. Queda declarado antes: **si R0 se confirma, el número
de R1 sale con una incertidumbre que no es la del auxiliar, y decir lo contrario
sería vender una precisión prestada.**

## Criterio, fijado antes

Todo se decide en **desvío absoluto contra la resolución del medidor**,
`MEDIDOR_RANGO_DB × VU_ESCALA` = 0,3334 dB. La razón medido/código no decide
nada: en la 94 dio 0,939 donde el desvío real era medio escalón, y tomarla como
criterio principal fue el defecto que el auditor de procedencia encontró.

## Qué se escribe y qué se restaura

| Ruta | Vuelve a |
|---|---|
| `i.9.fx.1.value` | **0** |
| `i.9.mix` | 0,7647058824 (sólo se toca para R2) |

Nada más. No se toca el tipo de efecto, ni sus parámetros internos —que están
fuera del MVP por decisión declarada—, ni el fader del bus, ni ninguna
instantánea.

## Lo que NO va a probar

- **Nada sobre los otros tres buses de efecto**, que además son de dos tipos
  distintos (`fxtype` 0 y 1).
- **Nada sobre cómo suena el efecto.** Los parámetros internos `par1`…`par6`
  están fuera del MVP.
- **Nada sobre los envíos de los otros 23 canales.**
- **Nada sobre el `postproc` del envío a efectos, porque no existe:** el envío a
  efectos tiene `post` propio y ningún `postproc`. Eso ya es un hallazgo: la
  simetría con el auxiliar que uno esperaría no está.
