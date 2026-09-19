# ADR-031 — La mezcla de conjunto entra al MVP, y la aplicación mueve faders

**Fecha:** 2026-09-17
**Estado:** **decidida y sin implementar.** No hay etapa, ni asistente, ni ley
del fader de canal contra el audio.
**Origen:** **Decisión del usuario**, eligiendo entre tres opciones el
2026-09-17, en la recapitulación registrada en
[`pedidos/2026-09-17-recapitulacion-y-hoja-de-ruta.md`](../pedidos/2026-09-17-recapitulacion-y-hoja-de-ruta.md).

## El problema

El camino del MVP terminaba con cada instrumento ajustado y los monitores
puestos. **El usuario no hace eso**: después de los instrumentos «levanta uno por
uno, probando combinaciones —voz + guitarra, más una voz, el bajo, percusiones—»
y recién después ajusta monitores y general. Las fuentes de oficio lo llaman
«full band pass» y describen cómo armar esa mezcla. El alcance no lo tenía.

## Lo que el usuario decidió

**Entra, y la aplicación mueve los faders de canal**, dentro de topes, con el
mismo camino que todo lo demás: `Assistant → Recommendation → Transaction →
SafetyEngine → write()`. No sólo guía.

## Qué se descartó

| Opción | Por qué no |
|---|---|
| **Entra, pero sólo guía** — la aplicación lleva por las combinaciones y muestra medidores; los faders los mueve el usuario | Sin medición nueva y más barato. Descartado porque deja el criterio de terminado del MVP —«sin tocar la consola a mano en ningún momento»— roto justo en la etapa más larga del soundcheck. |
| **Queda para después** | Descartado porque es lo que el usuario hace en cada soundcheck; un MVP que no lo cubre lo deja haciendo a mano la mitad del trabajo. |

## Lo que esto obliga a medir, y es herramienta

- **La ley del fader de canal (`i.N.mix`) contra la salida real.** Hoy no está en
  `RAW_MAP`; su curva está leída del cliente y verificada contra la pantalla de
  la consola, no contra el audio. Es la misma medición que el
  [ítem 104](../compromisos/104-la-ley-del-envio-a-monitor.md) hizo para el
  envío a monitor, y se hace sin manos en el banco.
- **Dónde deriva el envío a monitor**, antes o después del fader. Si es después,
  mover faders en la mezcla cambia los monitores que ya quedaron bien, y la
  etapa de mezcla tiene que ir antes de la de monitores o compensar.

## Lo que esta decisión NO resuelve

- El **criterio** de la mezcla —qué sube y cuánto— no está decidido. Las fuentes
  dan un punto de partida (la voz principal al máximo antes del acople, después
  bombo y bajo) y el escenario da otro; ninguno es una ley.
- El **general** sigue siendo sólo del usuario (INV-009): la aplicación le pide
  que lo suba.
- `CHANNEL_FADER` tiene tope (3 dB por transacción, 6 por sesión) y dueño
  (`MIX_ASSISTANT`, escribible). Lo que falta es todo lo demás.

## Trabajo previo

**Buscado el 2026-09-17.** El inventario de los cuatro repositorios está en
[`trabajo-previo-de-terceros.md`](../referencia/trabajo-previo-de-terceros.md).

- **Los cuatro repositorios del protocolo** escriben el fader de canal como
  crudo; **ninguno arma una mezcla** ni decide cuánto sube cada canal. Sobre el
  criterio de mezcla no hay coincidencias en otros proyectos.
- **Fuentes de oficio**: gearnews describe el «full band pass» y el orden para
  armar la mezcla —voz principal primero, al máximo antes del acople; después
  bombo y bajo—; Reliable Audio Gear lo pone como paso después de los
  instrumentos y antes de guardar la escena. Citadas en
  [`pedidos/2026-09-17-recapitulacion-y-hoja-de-ruta.md`](../pedidos/2026-09-17-recapitulacion-y-hoja-de-ruta.md).
- **Propio**: [ADR-028](ADR-028-abrir-el-envio-a-monitor.md) abrió una
  categoría de escritura con techo; es el molde. Y
  [`orden-del-soundcheck.md`](../orden-del-soundcheck.md) ya había escrito que
  «el fader no es una etapa acá: el equilibrio entre canales es otra cosa» —
  esta decisión es esa otra cosa.
