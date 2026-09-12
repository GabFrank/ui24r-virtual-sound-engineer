# 95 — Qué hacen `post` y `postproc` en el audio

**Escrito antes de tocar la consola.** Citas del usuario:
[`00-lo-que-dijo-el-usuario.md`](../pedidos/00-lo-que-dijo-el-usuario.md).

## Qué se mide y por qué es lo más peligroso de la lista

Cada envío a auxiliar tiene dos banderas propias:

- **`post`** — si se deriva antes o después del **fader** del canal.
- **`postproc`** — si se deriva antes o después del **procesamiento** del canal.

Las dos están confirmadas como rutas que se escriben y se difunden (matriz de
capacidades, 2026-09-10). **Su efecto sobre el audio, no.**

**Por qué importa.** Si el envío es post-procesamiento, el asistente ecualiza un
canal pensando en la sala y **le mueve el monitor al músico sin decírselo a
nadie**. No es un ajuste global que se mire una vez: son **240 banderas
independientes** —24 canales × 10 auxiliares— y `settings.auxsendpoint`, el
ajuste global, **no las reescribe** (medido el 2026-09-10: al cambiarlo la
consola difundió cero rutas más).

## Lo que ya se sabe, de la medición 94

**`post = 0` aísla de verdad.** Cuatro posiciones del fader del canal 10
—0,765 / 0,50 / 0,30 / 0,765— y el auxiliar 3 leyó `−59,00 dB` las cuatro.
Evidencia: `ley-envio-aux-caliente-2026-09-12b.txt`.

Eso mata de paso una duda que el auditor había levantado: `settings.auxsendpoint`
vale 1 y **no pisa** al `post` del envío.

Queda por medir la otra mitad, que son tres preguntas.

## Lo que predigo, antes de medir

| # | Predicción | Cómo se falsa |
|---|---|---|
| Q1 | Con `post = 1`, mover el fader del canal **sí** mueve el auxiliar, dB por dB | Que no se mueva, o que se mueva otra cantidad |
| Q2 | Con `postproc = 1` —como está hoy— realzar una banda del ecualizador **sí** mueve el auxiliar | Que no lo mueva: entonces `postproc` no significa lo que dice la matriz |
| Q3 | Con `postproc = 0`, el mismo realce **no** mueve el auxiliar | Que lo mueva |
| Q4 | Las dos banderas son **independientes**: las cuatro combinaciones se comportan como el producto de las dos reglas | Que alguna combinación haga algo que no se predice desde las otras tres |

**Q4 es la que vale.** Q1 a Q3 son casi definiciones; lo que nadie midió es si
la consola las combina como uno espera, y es lo que un asistente va a asumir sin
pensarlo.

## Cómo se separa una cosa de otra

El ecualizador es el único bloque del canal que se puede mover **sin tocar el
nivel de entrada** y con efecto conocido: realzar una banda al máximo sobre un
tono de esa misma frecuencia sube el canal una cantidad medible. Ya está medido
que el ecualizador **no toca** el punto `pre` del medidor del canal (2026-09-09),
así que ese punto sigue sirviendo de testigo.

El compresor **no** sirve para esto: hoy está en 1:1 —inerte— y ponerlo a
comprimir cambia el nivel de una forma que depende del programa.

## Qué se escribe y qué se restaura

| Ruta | Vuelve a |
|---|---|
| `i.9.aux.2.value` | 0 |
| `i.9.aux.2.post` | 0 |
| `i.9.aux.2.postproc` | 1 |
| `i.9.mix` | 0,7647058824 |
| `i.9.eq.b3.gain` y `.freq` | 0,5 y 0,7563259869 |

Comprobado releyendo por HTTP, camino distinto del que escribió.

## Lo que NO va a probar

- **Nada sobre los otros 239 envíos.** Se mide uno.
- **Nada sobre el envío a efectos**, que tiene `post` propio y ningún `postproc`.
- **No dice cuál manda si el global y el del envío se contradicen.** La 94 vio
  un caso —`auxsendpoint = 1` con `post = 0` ganando el del envío— y un caso no
  es una regla.

---

# Resultado

**Medido el 2026-09-12.** Evidencia:
`evidence/post-y-postproc-2026-09-12.txt` (las doce lecturas) y
`evidence/controles-tras-postproc-2026-09-12.txt` (la restauración).

## Las cuatro predicciones

| # | Predicción | Resultado |
|---|---|---|
| Q1 | Con `post = 1` el fader mueve el auxiliar, dB por dB | **Confirmada.** −11,55 y −11,51 dB contra −11,62 que predice la ley: 0,20 y 0,32 escalones |
| Q2 | Con `postproc = 1` el ecualizador mueve el auxiliar | **Confirmada.** +24,00 dB en el auxiliar contra +24,00 en el canal |
| Q3 | Con `postproc = 0` el ecualizador **no** lo mueve | **Confirmada.** 0,00 dB, con el ecualizador actuando +24,00 en el canal |
| Q4 | Las dos banderas son independientes | **Confirmada.** Las cuatro combinaciones son el producto exacto de las dos reglas |

## La tabla

| `post` | `postproc` | ¿el EQ mueve el auxiliar? | ¿el fader lo mueve? |
|---|---|---|---|
| 0 | 1 | **+24,00 dB** | no |
| 0 | 0 | no | no |
| 1 | 1 | **+24,00 dB** | **−11,55 dB** |
| 1 | 0 | no | **−11,51 dB** |

**Ninguna sorpresa, y ése es el resultado.** Las banderas hacen lo que su nombre
dice y se combinan como uno esperaría. Lo que no se podía dar por sabido era
justamente eso: son 240 banderas independientes y nadie las había medido.

## El control que hizo falta y casi no está

**Un «el auxiliar no se movió» no prueba nada por sí solo**: es indistinguible
de «el ecualizador no hizo nada». Por eso la corrida lee **tres** medidores del
canal, cada uno con su papel:

- **`pre`** (+0), anterior a todo el procesamiento, es el testigo. Quedó en
  −37,66 dB en las doce lecturas, sin mover un decimal.
- **`entrada`** (+1), que viene procesado, es la **prueba de que el ecualizador
  actuó**. En las cuatro filas de realce subió +24,00 dB, incluidas las dos
  donde el auxiliar no se movió.
- **el auxiliar**, que es lo que se mide.

Sin el segundo, las filas de `postproc = 0` habrían «confirmado» Q3 por el
motivo equivocado. La salida del guion lo dice en texto para que nadie lo lea
mal después.

## Una confirmación cruzada de la medición 94

La 94 midió la ley del envío **barriendo el valor del envío**. Acá el envío
quedó fijo en 0,8 y se movió **el fader del canal**: otro parámetro, otro
mecanismo, y el auxiliar bajó −11,55 y −11,51 dB contra los −11,62 que predice
`faderADb`. Dentro de un escalón por los dos lados.

Es el principio de «verificar por un camino distinto del que escribió» aplicado
a la ley misma, y no estaba planeado: salió de que Q1 necesitaba mover el fader.

## Lo que NO prueba

- **Nada sobre los otros 239 envíos.** Se midió uno.
- **Nada sobre el envío a efectos**, que tiene `post` propio y **ningún**
  `postproc`. Es el ítem 96 y no se puede deducir de acá.
- **No dice cuál manda si el global y el del envío se contradicen.** Con
  `settings.auxsendpoint = 1` fijo, el `post` del envío decidió en las cuatro
  combinaciones. Eso acota el caso a un valor del global, no a los dos.
- **No dice qué pasa con la puerta ni con el compresor.** Se movió el
  ecualizador, que es un bloque del procesamiento; que los otros dos viajen por
  el mismo punto de derivación es plausible y no está medido.
- **No dice nada sobre el orden dentro del procesamiento.** «Post-proceso» acá
  significa «después del ecualizador»; dónde cae exactamente respecto de la
  puerta y el compresor no se midió.
- **«Post-ecualizador» no es «post-procesamiento», y el lector va a leer lo
  segundo.** Lo dice el auditor y tiene razón en que la palabra arrastra más de
  lo probado: no se tocó la puerta, ni el compresor, ni el de-esser —que ni
  siquiera informa cuánto atenúa—, ni el pasa-altos, ni el retardo, ni la
  polaridad.
- **«El medidor del auxiliar se movió X dB» no es «al músico se le movió el
  monitor X dB».** No hay nada conectado a ningún auxiliar: todo este resultado
  vive dentro del medidor de la propia consola, cuya correspondencia con dBFS
  reales sigue sin medir. Para la conclusión de producto —que ecualizar mueve el
  retorno— eso alcanza, porque lo que importa es **que** se mueva; para decir
  cuánto, no.
- **Nivel no es señal.** Dos puntos de derivación que dan el mismo nivel a 1 kHz
  pueden diferir en fase y en latencia. Para un monitor que se suma con el
  sonido acústico de la sala, eso no es un detalle menor.

## Lo que encontró el auditor de expectativas

Trece trampas, en contexto fresco. **Doce quedan descartadas — y la mayoría no
por un control que yo hubiera diseñado, sino por el propio resultado.** La
diferencia importa y se dice: un estímulo de +24,00 dB deja poco margen para que
algo pase inadvertido, y elegir un estímulo grande sí fue decisión de diseño,
pero el resto es suerte con forma de rigor.

| Trampa | Por qué no aplica |
|---|---|
| **«`postproc` puede no existir en `i.9`»**, porque la matriz de capacidades dice que existe en todos «menos en `i.9` e `i.19`» | **Es la mejor de las trece y la respuesta es empírica**: si la clave no existiera, `pp = 0` y `pp = 1` se comportarían igual. Dan resultados opuestos. La frase de la matriz es ambigua y se refiere al envío a la **matriz**, no al auxiliar |
| Corrimiento de índice: `a.2` contra `auxiliares[2]`, `i.9` contra la posición 9 | El medidor que leí **respondió a las escrituras sobre `i.9.aux.2.*`**. Eso ata el índice: si estuviera leyendo otro bus, no se movería |
| Coerción silenciosa: que `post = 1` fuerce `postproc = 1` | Las cuatro combinaciones dieron **cuatro comportamientos distintos**. Si hubiera coerción, `post=1 pp=0` se comportaría como `post=1 pp=1`, y no lo hace |
| La dinámica se come el estímulo | El auxiliar se movió **+24,00** y el canal **+24,00**: idénticos. Un compresor actuando haría que el auxiliar se moviera menos |
| El estímulo del ecualizador no existe | `entrada` subió +24,00 dB en las cuatro filas de realce |
| Saturación | `pre` en −37,66 y `entrada` en −13,65, los dos lejos del techo |
| El medidor del bus es el posterior al fader, que vale 0 con el bus abajo | Se lee `+0`, anterior al fader del bus. Y se movió |
| El notch del supresor a 1 kHz | `a.2.afs.enabled = 0` y cero filtros, comprobado al terminar |
| Otras fuentes sumando en el bus | Tres canales le mandan, sin señal. Si alguna dominara, el realce no daría +24,00 exactos |
| Muestreo contra el tic, `VU2` que se calla | 55 a 58 tramas por lectura, parejas en las doce |

**La única que no pude descartar** es la que el propio documento ya declaraba:
`settings.auxsendpoint` quedó fijo en 1 durante toda la corrida, así que esto
acota el caso a un valor del global.

## Una desviación del protocolo, dicha

**El auditor de expectativas se lanzó con la medición ya corriendo**, no antes.
El contrato sí se escribió antes de tocar el aparato —que es la parte que
protege contra ajustar la predicción al dato— pero el auditor independiente
llegó tarde. No vio resultados ni el contrato ni el guion, así que sus trampas
siguen siendo predicciones ciegas; lo que se perdió es la garantía de orden.

## Restauración

Comprobada releyendo por HTTP, camino distinto del que escribió:
`i.9.aux.2.value = 0`, `i.9.mix = 0.7647058824`, `i.9.aux.2.post = 0`,
`i.9.aux.2.postproc = 1` y **las cinco bandas del ecualizador en 0,5**. Esa
última se agregó al guion de controles por esta medición: dejar las bandas
realzadas sería devolverle al usuario un canal ecualizado que él no ecualizó.
