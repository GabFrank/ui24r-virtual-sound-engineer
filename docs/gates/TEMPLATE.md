# Acta de control G-X

**Estado:** Pendiente | Aprobado | Aprobado con salvedades | Rechazado
**Fecha:** _por completar_
**Responsable:** desarrollador principal
**Firma:** _nombre y fecha_

## Qué desbloquea

## Criterios

| Spike o criterio | Tipo | Umbral | Medido | Resultado |
|---|---|---|---|---|
| | bloqueante / informativo | | | ⬜ |

> ### Ningún criterio pasa a ✅ sin que lo mire alguien más
>
> **Regla establecida el 2026-09-10, después de contarlo.** Ese día se cerraron
> cuatro criterios bloqueantes. Una auditoría independiente **volvió uno a
> amarillo y le puso salvedades a dos**, y encontró además que el arreglo hecho
> para cerrar uno de ellos rompía la aplicación entera.
>
> No fue mala suerte. La forma se repitió seis veces en la misma jornada: **la
> comprobación compartía el error del programa, y entonces lo confirmaba en vez
> de encontrarlo.** Un contador con una fila escrita a mano. Tests que fabricaban
> un mensaje que el aparato no manda. Una columna llamada `ms` que era una espera
> del propio guion. Un recorrido empalmado de dos corridas, una de ellas
> descartada. Todos se leían igual de bien que un resultado bueno.
>
> **Lo que quien cierra un criterio no puede ver es justamente aquello sobre lo
> que ya se convenció.** Por eso la revisión no es una cortesía ni un trámite:
> es el único paso que mira desde afuera.
>
> En la práctica: quien propone el ✅ deja la evidencia archivada con
> `tools/spikes/medir.mjs` y **otro** contrasta cada cifra contra ese archivo,
> lee el método buscando qué no podría fallar, y comprueba que el enunciado del
> umbral se cumpla **entero** — no su primera mitad. Hasta entonces el criterio
> se queda en 🟡, que es una respuesta honesta y no una derrota.
>
> **Amarillo es información; verde prematuro es una mentira con fecha de
> vencimiento**, y el vencimiento cae el día del show.

## Decisiones derivadas

## Acción ante fallo

Un criterio bloqueante que falla admite **una sola repetición**. Si vuelve a fallar, se escala a decisión de alcance mediante una ADR. No se aprueba un control con un criterio bloqueante en rojo sin la ADR correspondiente.
