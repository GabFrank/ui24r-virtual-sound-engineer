# SPK-SAFE-GEN — Invariantes del generador sobre hardware

**Estado:** Pendiente · **Timebox:** 3 días · **Control:** G-C
**Depende de:** S-05.10 · **Bloquea a:** G-C, S-06.1a, S-07.3, S-07.4
**Montaje:** consola, sistema de amplificación a volumen bajo pero audible, interfaz, tablet, red que se pueda cortar a voluntad.

## Pregunta que responde

¿Las invariantes del generador se cumplen contra hardware real, incluidos los casos en que algo se rompe a mitad de la reproducción?

Es el control que separa "la aplicación puede reproducir por el sistema de amplificación" de "la aplicación no debería reproducir todavía".

## Criterios

Todos bloqueantes. Todos exigen **diez de diez**.

| # | Criterio | Invariante | Umbral | Medido | Resultado |
|---|---|---|---|---|---|
| 1 | Reserva y liberación del reproductor con estado idéntico | INV-012 | hash idéntico | | ⬜ |
| 2 | Alguien desactiva el silencio del reproductor desde el navegador oficial | INV-012 | restaurado en 300 ms o menos, con alerta | | ⬜ |
| 3 | Cada precondición falsa impide la reproducción | INV-013 | ninguna orden enviada, motivo mostrado y registrado | | ⬜ |
| 4 | Paro de emergencia durante la reproducción | INV-019, INV-014 | silencio en 500 ms o menos | | ⬜ |
| 5 | Caída de red durante la reproducción | INV-014 | detención local y alerta persistente | | ⬜ |
| 6 | Desconexión del cable USB durante la reproducción | INV-014 | orden de detención enviada y confirmada | | ⬜ |
| 7 | Envío del reproductor al bus de análisis puesto a menos infinito a propósito | INV-014 | detención en 2 s o menos por ausencia de referencia | | ⬜ |
| 8 | Techo de nivel respetado | INV-015 | con el nivel operativo fijado en −18 dB, ninguna orden supera ese valor | | ⬜ |
| 9 | Notificación sonora de Android durante la reproducción | INV-026 | por debajo de −90 dBFS en la entrada 2 | | ⬜ |
| 10 | Bus de análisis conectado a un monitor a propósito | INV-016 | detectado y abortado | | ⬜ |

## Evidencia a entregar

- `evidence/safe-gen-runs.jsonl` con los cien intentos y sus tiempos.
- `evidence/estop-timing.csv`.

## Acción ante fallo

Cualquier criterio por debajo de diez de diez **impide abrir la corrección de sala**. No hay repetición de conveniencia: si el generador no se detiene de forma fiable, no reproduce por el sistema de amplificación de nadie.
