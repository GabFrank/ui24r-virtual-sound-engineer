# El enlace L/R del ecualizador de salida lo hace el cliente, no la consola

**2026-09-16.** Salió de la corrida del [ítem 112](../compromisos/112-la-ley-del-ecualizador-del-general.md)
y se cerró leyendo el cliente que la propia consola sirve. Evidencia:
[`ley-del-eq-del-general-2026-09-16b.txt`](../spikes/SPK-P0.2c/evidence/ley-del-eq-del-general-2026-09-16b.txt).

## Qué se vio

El ecualizador del general está enlazado —`m.eq.linked = 1`— y la corrida barrió
`m.eq.peak.l.17` por sus once valores, de 0 a 1. **El lado derecho no se movió:**
`m.eq.peak.r.17` valía 0,5 antes y 0,5 al final.

Esa observación sola **no alcanza**, y conviene decirlo: la restauración devuelve
el lado izquierdo a 0,5, así que si el enlace fuera de la consola, restaurar uno
habría restaurado el otro y el antes/después daría igual de todos modos.

## Qué lo cierra

**El cliente escribe las dos claves él mismo.** Del `mixer.html` que sirve la
consola, bajado el 2026-09-16:

```js
getValue(this.key + "eq.linked")
  ? (setValue(this.key + "eq.peak.l." + a, b), setValue(this.key + "eq.peak.r." + a, b))
  : setValue(this.key + (this.stereo ? (this.right ? "eq.peak.r." : "eq.peak.l.") : "eq.peak.") + a, b)
```

Y en otro punto, para el caso de una sola banda:

```js
getValue(... "eq.linked") && setValue(this.key.replace(".l.", ".r."), b)
```

O sea: **`m.eq.linked` es una convención del cliente.** La consola guarda el
valor de la clave y no replica nada. Si algo escribe un solo lado, la consola
queda con los dos lados distintos —y el usuario ve su ecualizador del general
asimétrico, sin que nada haya avisado—.

## Por qué importa para el producto

Cuando la aplicación llegue a tocar el ecualizador de salida —que es la
superficie por donde sale la mezcla— **tiene que escribir los dos lados** siempre
que `linked` esté en 1, y leer los dos antes. Escribir uno solo no es «la mitad
del cambio»: es dejarle la mezcla desbalanceada en esa banda.

Es la misma familia de trampa que ya está documentada en este repositorio con
otro nombre —**«la misma regla implementada dos veces»**, del adaptador y la
interfaz—, sólo que acá la segunda implementación es la del fabricante y la
nuestra todavía no existe. La diferencia es que esta se puede prevenir antes de
escribir la primera línea.

**Queda como tarea, no hecha:** ninguna ruta del ecualizador de salida es
escribible por la aplicación hoy, así que no hay nada roto. Cuando se abra, la
regla va con su invariante y su prueba.

## Lo que esto NO dice

- **Nada de si las dos mitades suenan igual.** Sólo dice quién copia el valor. La
  ley se midió en el lado izquierdo —la master 1 es la que vuelve al banco— y el
  derecho **no se midió**: medirlo pide cambiar un cable.
- **Nada de `m.dyn.linked`**, que el cliente trata en la misma línea y no se miró.
- **Nada de los auxiliares.** Son mono en este aspecto: sus bandas son
  `a.M.eq.peak.K`, sin lado.

## Trabajo previo

**Los cuatro repositorios, clonados y grepeados el 2026-09-16.** Y esta vez no
sólo hubo precedente: hay una implementación independiente que llegó a la misma
conclusión, por otro camino y para otro enlace.

**`fmalcher/soundcraft-ui` hace exactamente esto, del lado del cliente.** Su
documentación lo dice en una página propia, `docs/more/stereolink.md`:

> «All commands respect the stereo link settings: if a channel is linked, all
> actions like fader level, mute, solo, etc. will be **mirrored to the linked
> channel**.» […] «This behavior **matches the way the original web app handles
> stereo-linking**.»

Y lo implementa: `getLinkedChannelNumber(channel, stereoIndex)` en `utils.ts`, y
cada fachada que escribe —`master-channel.ts`, `aux-channel.ts`, `fx-channel.ts`,
`matrix-utils.ts`— manda **las dos** escrituras.

**Eso confirma el patrón, no el caso.** Su enlace es el **estéreo de canal**
(`stereoIndex`), no `m.eq.linked`, y no hay una sola línea suya sobre el
ecualizador. Lo que aporta es más fuerte que una coincidencia de nombre: **en
esta consola el espejo del enlace lo hace el cliente**, y un segundo
implementador tuvo que descubrirlo y escribirlo. Nuestra observación sobre
`m.eq.linked` es un caso más de la misma regla, no una rareza.

- **`Dennion/ioBroker.soundcraft`**, **`ndikanov/ui24`**, **`NaturalDevCR/MyUiPro`**:
  cero coincidencias de `eq.linked` ni de espejo de enlace.

**Nadie documenta el enlace del ecualizador del general.** Que `m.eq.linked`
aparezca en el modelo de estado de fmalcher —está, junto a `bypass`, `prmod`,
`hpf`, `lpf` y las 31 bandas de cada lado— no dice si la consola la obedece. Esa
es la pregunta, y la respuesta es que no.

> **Corregido antes de commitear.** El borrador de este documento decía que
> fmalcher «no usa `linked` para nada, sólo el dato en el volcado de ejemplo».
> Era falso, y la comprobación que lo desmintió es la que la propia regla de este
> repositorio pide: clonar y grepear en vez de recordar. La versión falsa era
> además la cómoda —dejaba el hallazgo sin precedente— y ése es justamente el
> sesgo que obliga a comprobar.
