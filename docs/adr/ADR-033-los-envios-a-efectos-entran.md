# ADR-033 — Los envíos a efectos entran: cuánto manda cada canal, con tope

**Fecha:** 2026-09-17
**Estado:** **decidida y sin implementar.** `FX` sigue `USER_ONLY` en
`ownership.ts` y no hay tope para el envío.
**Origen:** **Decisión del usuario**, eligiendo entre dos opciones el
2026-09-17, en la recapitulación registrada en
[`pedidos/2026-09-17-recapitulacion-y-hoja-de-ruta.md`](../pedidos/2026-09-17-recapitulacion-y-hoja-de-ruta.md).

## El problema: dos documentos decían cosas distintas

[`alcance-mvp.md`](../alcance-mvp.md) ponía **dentro** del MVP «cuánto manda cada
canal a cada efecto, y qué efecto es», citando al usuario. La
[matriz de autonomía](../autonomy-matrix.md) decía «efectos, subgrupos, VCA:
**sólo del usuario, fuera de alcance**». Las dos no pueden valer, y nadie lo
había notado porque ninguna herramienta llegaba hasta ahí.

## Lo que el usuario decidió

**Entra el envío de cada canal a cada efecto** (`i.N.fx.M.value`), con tope y
por el mismo camino que el envío a monitor. **Siguen siendo del usuario** los
parámetros internos de cada efecto (`par1`…`par6`) y el ecualizador del retorno
—el corte de agudos que él le hace al delay para que no acople—. Sobre ese
corte, la aplicación puede **recordárselo**, no hacerlo.

## Qué se descartó

| Opción | Por qué no |
|---|---|
| **Fuera por ahora** — corregir el alcance para que diga lo que dice la matriz | Descartado porque el usuario nombró los efectos entre lo que tiene que entrar («*tambien tiene que entrar al mvp, GATE, COMPRESOR, EQ, EFFECTOS*»), y porque su recorrido los ajusta en cada instrumento. |

## Lo que esta decisión NO resuelve

- **La ley del envío a efectos está acotada, no medida**
  ([96b](../compromisos/96b-la-ley-del-envio-a-efectos.md): no se desvía de
  `faderADb` más de 0,25 dB sobre 28 dB). Para un tope de pocos dB alcanza; si
  alguna vez hace falta más, se mide como el 104.
- **Dónde deriva el envío** —antes o después del fader— no está medido, y con la
  mezcla de conjunto dentro ([ADR-031](ADR-031-la-mezcla-de-conjunto-entra.md))
  importa por el mismo motivo que en los monitores.
- **Qué efecto es** —el tipo— se lee; no se decide acá si la aplicación lo cambia.

## Trabajo previo

**Buscado el 2026-09-17.** El inventario está en
[`trabajo-previo-de-terceros.md`](../referencia/trabajo-previo-de-terceros.md).

- **`fmalcher/soundcraft-ui`** expone los envíos a efectos como crudo, como
  cualquier envío. **Ninguno de los cuatro** decide cuánto mandar. Sobre el
  criterio no hay coincidencias en otros proyectos.
- **Propio**: [ADR-028](ADR-028-abrir-el-envio-a-monitor.md) abrió el envío a
  monitor sólo en su nivel, con techo. Esta decisión copia esa forma para el
  envío a efectos, y la matriz de autonomía se corrige en el mismo movimiento.
