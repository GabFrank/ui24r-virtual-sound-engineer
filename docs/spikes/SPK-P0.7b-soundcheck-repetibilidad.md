# SPK-P0.7b — Soundcheck virtual, repetibilidad

**Estado:** Pendiente · **Timebox:** 3 días · **Control:** G-D
**Depende de:** SPK-P0.7a, S-05.5, S-05.6 · **Bloquea a:** G-D
**Montaje:** consola con una toma grabada, sistema de amplificación, micrófono, interfaz, tablet.

## Pregunta que responde

¿Dos reproducciones de la misma toma miden igual?

Toda la comparación de mezclas se apoya en esto. Si dos reproducciones del mismo pasaje no miden igual, comparar la mezcla A con la B no significa nada.

## Pasos

1. Grabar una toma de cinco minutos con la banda.
2. Reproducirla tres veces **sin tocar la mezcla**.
3. Medir en cada pasada el espectro por tercios de octava en la entrada 2, que es la referencia eléctrica, y en la entrada 1, que es el micrófono.
4. Alinear las tres pasadas por correlación de la referencia eléctrica.

## Criterios

| # | Criterio | Tipo | Umbral | Medido | Resultado |
|---|---|---|---|---|---|
| 1 | Dispersión por banda en la entrada 2 | bloqueante | ±0,3 dB | | ⬜ |
| 2 | Dispersión por banda en la entrada 1, por encima de 200 Hz | bloqueante | ±0,5 dB | | ⬜ |
| 3 | Dispersión por banda en la entrada 1, hasta 200 Hz | bloqueante | ±1 dB | | ⬜ |
| 4 | Alineación entre pasadas por correlación | bloqueante | 2 muestras o menos | | ⬜ |

La tolerancia mayor en graves es física: la sala varía más ahí, y una integración sobre cinco minutos no la elimina.

## Evidencia a entregar

- `evidence/three-passes.csv`, `evidence/alignment.txt`.

## Acción ante fallo

Si la repetibilidad no alcanza, el control G-D se cierra como fallo documentado y la comparación de mezclas se degrada: se marca con datos insuficientes y se advierte al usuario de que la diferencia observada puede ser de la reproducción y no de la mezcla.
