# SPK-REPEAT — Repetibilidad de la medición de sala

**Estado:** Pendiente · **Timebox:** 3 días · **Control:** G-C
**Depende de:** S-07.4 · **Bloquea a:** S-07.6, S-14.2
**Montaje:** sala, sistema de amplificación, micrófono, interfaz, tablet, consola.

## Pregunta que responde

¿Cuánto varía una medición de sala cuando no cambia nada?

Sin este número, el lazo cerrado no tiene tolerancia: decidiría conservar o revertir sobre el ruido de su propia medición, y oscilaría.

## Pasos

1. En una sala, ejecutar la medición rápida cinco veces seguidas **sin tocar absolutamente nada**, volviendo a colocar el micrófono en las mismas posiciones marcadas.
2. Calcular la desviación típica del puntaje de sala y la desviación típica por banda de tercio de octava de la desviación al objetivo.
3. Repetir en una segunda sala de características distintas.

## Criterios

| # | Criterio | Tipo | Umbral | Medido | Resultado |
|---|---|---|---|---|---|
| 1 | Cinco mediciones en cada una de dos salas | bloqueante | 10 mediciones | | ⬜ |
| 2 | Desviación típica del puntaje de sala, por sala | bloqueante | calculada y guardada en el perfil del lugar | | ⬜ |
| 3 | Desviación típica por banda | bloqueante | calculada y guardada | | ⬜ |

## Uso del resultado

La tolerancia del lazo cerrado, que es la invariante INV-023, se define como el mayor entre dos veces la desviación típica del puntaje para ese lugar y dos puntos. Una sala sin este número **no habilita el lazo cerrado**.

## Evidencia a entregar

- `evidence/repeatability-<sala>.csv` por cada sala.
