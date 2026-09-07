# SPK-P0.8 — Instantáneas y alcance de la recuperación

**Estado:** Pendiente · **Timebox:** 3 días · **Control:** G-A
**Depende de:** SPK-P0.2a · **Bloquea a:** S-02.13
**Montaje:** Ui24R con un show de trabajo, router, laptop.

## Pregunta que responde

¿Se puede guardar y recuperar instantáneas sin tocar las del usuario, y qué incluye exactamente una recuperación?

Lo segundo importa porque el retroceso por instantánea es la última red de seguridad: si no se sabe qué restaura, no se sabe qué promete.

## Pasos

1. Crear un show dedicado. Si el protocolo no permite crearlo, hacerlo a mano y documentarlo.
2. Cincuenta ciclos de guardar y recuperar con nombres del prefijo reservado.
3. Calcular el hash del estado de las instantáneas manuales antes y después.
4. Volcar el estado completo antes y después de una recuperación, y comparar campo por campo.
5. Guardar una instantánea con un nombre que ya existe, y observar el comportamiento.
6. Guardar una instantánea con audio pasando y escuchar si produce un corte audible.

## Criterios

| # | Criterio | Tipo | Umbral | Medido | Resultado |
|---|---|---|---|---|---|
| 1 | Ciclos de guardar y recuperar correctos | bloqueante | 50 de 50 | | ⬜ |
| 2 | Instantáneas manuales intactas | bloqueante | hash idéntico antes y después de 50 ciclos | | ⬜ |
| 3 | Alcance de la recuperación documentado: ¿incluye ganancia, alimentación fantasma, supresión de realimentación, patcheo, retardos, reproductor? | bloqueante | lista completa campo por campo | | ⬜ |
| 4 | Comportamiento al guardar sobre un nombre existente | bloqueante | documentado | | ⬜ |
| 5 | Existencia de borrado o renombrado por protocolo | informativo | sí o no | | ⬜ |
| 6 | Corte audible al guardar con audio pasando | informativo | sí o no | | ⬜ |

## Evidencia a entregar

- `evidence/snapshot-cycles.jsonl`, `evidence/recall-diff.json`, `evidence/manual-hash.txt`.

## Acción ante fallo

Si la recuperación no restaura la ganancia de entrada, el retroceso por instantánea deja de ser red de seguridad para ese parámetro y el retroceso transaccional pasa a ser obligatorio antes de habilitar cualquier escritura de ganancia.
