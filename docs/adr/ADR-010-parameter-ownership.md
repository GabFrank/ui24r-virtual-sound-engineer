# ADR-010 — Propiedad de parámetros y tipo Observación

**Estado:** Aceptada
**Fecha:** 2026-09-07
**Origen:** Auditoría de producto B-21, B-27; auditoría de calidad D-05, D-06.

## Contexto

La tabla de propiedad del plan asignaba once parámetros a tres asistentes y dejaba sin dueño: envíos auxiliares de monitores, fader general, silencios, alimentación fantasma, limitador, efectos, subgrupos, supresión de realimentación e instantáneas.

El usuario objetivo **depende de sus monitores para tocar**. Un asistente que "ayuda" moviendo un envío de monitor lo deja sin referencia en pleno show.

## Decisión

La propiedad se completa con la categoría **solo del usuario**, que la aplicación nunca escribe:

| Parámetro | Dueño |
|---|---|
| Ganancia de entrada, pasa altos, ecualizador de canal, compresor, puerta, deesser | Asistente de canal |
| Fader de canal, panorama | Asistente de mezcla |
| Ecualización, retardo y polaridad de salida | Asistente de sala |
| Envíos hacia el bus de análisis | Sistema |
| Reproductor: silencio, fader, envíos | Sistema, solo dentro de la reserva |
| Silencio de salidas durante medición por componente | Sistema, con restauración garantizada |
| Envíos auxiliares de monitores | **Solo del usuario** |
| Fader general, silencio de entradas y general | **Solo del usuario** |
| Alimentación fantasma | **Solo del usuario**, la aplicación solo lee |
| Limitador de salida | **Solo del usuario**, protege el sistema |
| Efectos, subgrupos, VCA | **Solo del usuario**, fuera de alcance |
| Supresión de realimentación | **Solo del usuario**, procedimiento manual |
| Instantáneas | Sistema, solo con prefijo propio |

Existe la excepción única de los envíos del reproductor hacia auxiliares de monitores, **solo hacia menos infinito y solo dentro de la reserva del reproductor**, porque es la forma de garantizar que la señal de medición no llega a los monitores.

Se agrega el tipo **Observación**: salida sin valor propuesto, para que un asistente pueda señalar algo fuera de su dominio sin poder tocarlo.

Desde MVP4b y solo en modo asistido, se habilitan los filtros de los buses declarados en el perfil del sistema de amplificación. Fader, silencio, retardo, polaridad y limitador de esos buses siguen siendo solo del usuario.

## Consecuencias

- Hay un test estático que enumera las rutas escribibles y verifica que ninguna sea de la categoría solo del usuario.
- Evita correcciones duplicadas entre asistentes y, sobre todo, evita dejar al músico sin monitores.

## Alternativas descartadas

- **Dejar los huecos sin asignar.** Un desarrollador razonable habría supuesto que lo no prohibido está permitido.
