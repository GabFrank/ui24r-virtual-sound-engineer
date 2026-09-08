# SPK-FW3 — Capacidades del firmware 3.x y contenido del CUE

**Estado:** Pendiente · **Timebox:** 5 días · **Control:** G-B
**Depende de:** SPK-P0.2a · **Bloquea a:** toda la fase de automatización por canción
**Montaje:** Ui24R con firmware 3.x, router, laptop, un show de trabajo desechable.

## Pregunta que responde

[El documento de hallazgos](../hallazgos-firmware-y-contexto-musical.md) afirma que la consola sabe hacer internamente bastante más de lo que documenta el manual base, y propone apoyarse en eso en vez de procesar por fuera. La idea es buena y el orden es el correcto —preguntar primero si la consola ya lo hace—, pero **ninguna de esas capacidades está verificada**, y la matriz de capacidades de este repositorio no las menciona siquiera como desconocidas.

Este spike las convierte en filas medidas: qué existe, qué se controla por protocolo, qué se puede leer, y sobre todo **qué toca un CUE**.

Lo último es lo que decide una arquitectura entera. Si un CUE incluye envíos de AUX, recuperarlo desde la aplicación mueve la mezcla personal de un músico en pleno show, y eso lo prohíbe INV-010. La alternativa A del documento —apoyarse en el CUE nativo— depende por completo de esta respuesta.

## Pasos

1. Registrar el firmware exacto y compararlo con el listado en la matriz de capacidades (INV-033).
2. Volcar el estado completo, activar cada función desde la interfaz web de la consola, volver a volcar y comparar: eso da la clave cruda de cada capacidad sin adivinarla. Una por una: sidechain entre subgrupos, RTA hold y share, AFS2 en fijo y en directo, pre-delay del Lexicon, punto de derivación de los envíos de efectos, matriz de patcheo, canales DSP que no corresponden a entradas físicas, buses auxiliares y de matriz existentes, filtros pasa altos y pasa bajos en auxiliares.
3. Para cada clave encontrada: leerla, escribirla, volver a leerla, y anotar rango y unidad. Lo que no se pueda escribir queda como solo lectura, no como «probablemente sí».
4. **Contenido del CUE, campo por campo.** Volcar el estado completo, recuperar un CUE, volver a volcar, y comparar. La pregunta concreta: ¿aparecen `i.N.aux.B.value`, `i.N.aux.B.mute` o `a.B.mix` en el diff?
5. Lo mismo para la instantánea completa, y anotar en qué se diferencian.
6. Si el CUE incluye AUX: buscar si existe alguna forma de excluirlos —una opción de alcance, un `safe` por canal— y verificarla con el mismo método.
7. Medir la frecuencia segura de escritura: ráfagas de 10, 20 y 50 escrituras por segundo sobre cuatro faders, contando cuántas confirma la consola y cuántas descarta.

## Criterios

| # | Criterio | Tipo | Umbral | Medido | Resultado |
|---|---|---|---|---|---|
| 1 | Firmware registrado y contrastado con la matriz | bloqueante | sí | | ⬜ |
| 2 | Clave cruda de cada capacidad afirmada, o constancia de que no existe | bloqueante | 9 de 9 filas resueltas | | ⬜ |
| 3 | Lectura y escritura probadas para cada clave encontrada | bloqueante | 100 % de las encontradas | | ⬜ |
| 4 | **Contenido del CUE campo por campo** | bloqueante | lista completa | | ⬜ |
| 5 | **¿El CUE toca envíos de AUX?** | bloqueante | sí o no, con el diff como prueba | | ⬜ |
| 6 | Si toca AUX: ¿se puede excluir? | bloqueante | sí o no, verificado | | ⬜ |
| 7 | Diferencia entre CUE e instantánea completa | bloqueante | documentada | | ⬜ |
| 8 | Frecuencia de escritura sostenida sin descartes | bloqueante | escrituras por segundo, medido | | ⬜ |
| 9 | El sidechain entre subgrupos existe y es controlable | informativo | sí o no | | ⬜ |
| 10 | El RTA de la consola es legible por red | informativo | sí o no | | ⬜ |

## Evidencia a entregar

- `evidence/fw3-diffs/*.json`: un diff por capacidad, del volcado antes y después.
- `evidence/cue-vs-snapshot.json`: los dos alcances, campo por campo.
- `evidence/ritmo-escritura.jsonl`: enviadas, confirmadas y descartadas por ráfaga.

## Acción ante fallo

Si el criterio 5 da que el CUE toca AUX y el 6 da que no se puede excluir, **la recuperación de CUE desde la aplicación queda prohibida** por INV-010, y la automatización por canción se limita a escritura directa de parámetros de FOH. Eso no bloquea el proyecto: cambia la alternativa elegida, y es exactamente para eso que se mide antes de construir.

Si el criterio 8 da menos escrituras por segundo de las que necesita una rampa, las transiciones entre perfiles son escalón y no rampa. Se dice en la documentación en vez de prometer algo que la consola no sostiene.
