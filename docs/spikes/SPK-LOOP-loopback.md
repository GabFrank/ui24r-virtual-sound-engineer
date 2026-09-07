# SPK-LOOP — Loopback e igualación de entradas

**Estado:** Pendiente · **Timebox:** 3 días · **Control:** G-C
**Depende de:** S-05.4 · **Bloquea a:** S-07.0, S-07.4, G-C
**Montaje:** interfaz de audio, cable en Y, cable de la salida de la interfaz a la entrada 2, tablet.

## Pregunta que responde

¿Cuánto difieren las dos entradas entre sí, y cuál es el desfase temporal entre ellas?

La función de transferencia divide una entrada por la otra. Si las entradas no responden igual, esa diferencia aparece como si fuera respuesta de la sala.

## Pasos

1. Con un cable en Y, llevar la misma señal a las dos entradas, con nivel de −20 dBFS o menos en la entrada 1 para no saturar la entrada de micrófono.
2. Medir la respuesta relativa entre entradas y el desfase temporal.
3. Guardar el resultado como parte del estado de calibración.
4. Medir, de forma informativa, la latencia de ida y vuelta desde la salida de la interfaz a la entrada 2.
5. Prototipar la verificación de cables de la invariante INV-030: antes de abrir la salida, comprobar que el bus de análisis ya no llega a la entrada 2; al terminar, comprobar que volvió.

## Criterios

| # | Criterio | Tipo | Umbral | Medido | Resultado |
|---|---|---|---|---|---|
| 1 | Respuesta relativa entre entradas, de 20 Hz a 20 kHz | bloqueante | ±0,2 dB | | ⬜ |
| 2 | Desfase temporal entre entradas | bloqueante | medido y guardado | | ⬜ |
| 3 | Latencia de ida y vuelta de la interfaz | informativo | documentada | | ⬜ |
| 4 | Verificación de cables antes y después | bloqueante | detecta el cable no reconectado | | ⬜ |

## Evidencia a entregar

- `evidence/in1-in2-response.csv`, `evidence/cable-check.md`.

## Acción ante fallo

Si la diferencia entre entradas supera medio decibel en alguna zona, se guarda como corrección y se aplica a todas las mediciones, marcando en el estado de calibración que la igualación fue necesaria.
