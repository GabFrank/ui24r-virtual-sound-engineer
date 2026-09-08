# ADR-022 — Qué canción se está tocando entra por un puerto, no por la interfaz

**Estado:** Aceptada
**Fecha:** 2026-09-08
**Origen:** [documento de hallazgos y lineamientos](../hallazgos-firmware-y-contexto-musical.md), secciones 13 a 35.

## Contexto

La banda ya usa en los shows una aplicación propia, CanindeChords, que administra repertorio, lista de temas y —lo que importa acá— **cuál canción está abierta en este momento**. Ya sincroniza ese dato entre dispositivos y ya tiene un evento equivalente a «cambió la canción», con identificador de canción y de sesión.

La propuesta es que, más adelante, un cambio de canción allá dispare acá un perfil de mezcla: jerarquía vocal, efectos, automatización. No se implementa ahora —depende de una fase de automatización que a su vez depende de spikes sin cerrar— pero condiciona una decisión que sí se toma hoy: **de dónde sale «la canción actual»**.

Hay dos formas de equivocarse, y las dos son caras después.

La primera es que la aplicación tenga su propia lista de canciones y su propio orden. Sería una segunda fuente de verdad para algo que ya tiene dueño, y en un show las dos se desincronizan: el orden de la lista no se respeta, se salta, se repite, se improvisa. El documento lo dice con claridad y coincide con lo observable: **la posición en la lista no es autoridad musical; el identificador de la canción sí.**

La segunda es que la selección de canción viva en la pantalla. Si el único camino para decir «ahora suena esta» es un toque en la interfaz, agregar después una fuente externa obliga a reescribir todo lo que cuelga de ahí.

## Decisión

El estado musical vive en un **contexto de show** con una entrada única, conceptualmente `fijarCancionActual(idExterno)`, independiente de quién la llame: la pantalla hoy, CanindeChords o un pedal mañana. El motor de mezcla no sabe quién originó el cambio.

Tres reglas concretas se derivan de eso, y son lo único que se adopta ahora:

1. **El perfil de mezcla se referencia por identificador externo estable,** no por una fila de una tabla de canciones propia. La aplicación no administra repertorio.
2. **La pantalla no es la única forma de fijar la canción actual.** Es una fuente más entre varias.
3. **Sin fuente externa, la aplicación funciona igual.** La selección a mano no es un modo degradado: es el modo que existe primero, y el que queda si no hay red.

## Consecuencias

Se gana que la integración futura sea agregar una fuente, no reescribir un núcleo.

Se pierde poco, porque hoy no hay nada construido encima: es una decisión tomada antes de tener el problema, que es cuando salen baratas.

**No se escribe código todavía.** Un puerto sin implementación real, con un solo llamador que es la pantalla, sería justo lo que este repositorio lleva anotado como problema —cosas que existen y no tienen quien las llame—. La decisión se registra acá y se implementa cuando exista el perfil de mezcla por canción, que es su primer usuario de verdad.

Queda explícito lo que **no** decide esta ADR: si la aplicación llega a escribir efectos, subgrupos o cuatro faders a la vez. Eso contradice la matriz de autonomía vigente y es una decisión de alcance abierta, anotada como R-21. Que el contexto musical entre por un puerto no autoriza a escribir nada nuevo.

## Alternativas descartadas

**Que la aplicación administre su propia lista de temas.** Duplica una fuente de verdad que ya existe y ya funciona en shows. Se descarta.

**Acoplar la configuración de consola a la entidad canción de CanindeChords.** Guardar allá canal, fader o reverberación ata dos proyectos que tienen ciclos de vida distintos, y convierte cualquier cambio del modelo de mezcla en un cambio de la aplicación de acordes. La única atadura es el identificador.

**Esperar a la fase de automatización para decidirlo.** Es la alternativa por defecto y la que se descarta con esta ADR: la decisión cuesta un párrafo hoy y una refactorización después.
