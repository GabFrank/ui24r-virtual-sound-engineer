# SPK-PA-BUS — Topología de salidas silenciables

**Estado:** Pendiente · **Timebox:** 1 día · **Control:** G-B
**Depende de:** SPK-P0.2a · **Bloquea a:** S-10.2
**Montaje:** Ui24R, sistema de amplificación a volumen bajo, interfaz de audio.

## Pregunta que responde

¿Qué salidas se pueden silenciar individualmente, y sirve eso para medir el lado izquierdo, el derecho y los subgraves por separado?

El plan asumía que la medición por componente se logra silenciando salidas. Pero el general es un bus estéreo con un solo silencio: "solo izquierdo" únicamente es posible si los lados salen por buses distintos.

## Pasos

1. Para el general, cada auxiliar y cada matriz, comprobar si existe silencio individual por protocolo.
2. Medir el tiempo desde la orden de silencio hasta el silencio real en la entrada 2.
3. Escuchar si el silencio produce un chasquido audible en la salida.
4. Documentar la topología concreta del sistema de amplificación de la banda.

## Criterios

| # | Criterio | Tipo | Umbral | Medido | Resultado |
|---|---|---|---|---|---|
| 1 | Lista de buses con silencio individual | bloqueante | completa | | ⬜ |
| 2 | Tiempo de silencio, medido en la entrada 2 | bloqueante | registrado | | ⬜ |
| 3 | Chasquido audible al silenciar | informativo | sí o no | | ⬜ |
| 4 | Topología del sistema de amplificación de la banda documentada | bloqueante | qué sale por dónde | | ⬜ |

## Evidencia a entregar

- `evidence/mute-topology.md`, `evidence/mute-timing.csv`.

## Acción ante fallo

Si los dos lados comparten el general y no hay forma de separarlos, la secuencia de medición por componente se reduce a lo que sí sea silenciable, y la interfaz lo explica en lugar de ofrecer una secuencia imposible.
