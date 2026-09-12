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
