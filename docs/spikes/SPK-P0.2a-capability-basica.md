# SPK-P0.2a — Matriz de capacidades, lectura y escritura básica

**Estado:** Pendiente · **Timebox:** 8 días · **Control:** G-A
**Depende de:** S-00.4, SPK-P0.1 · **Bloquea a:** SPK-P0.8, SPK-P0.7a, SPK-P0.5, SPK-P0.6', SPK-PA-BUS, SPK-P0.2b, SPK-P0.2c, S-02.5c
**Montaje:** Ui24R, router, laptop con Node, navegador con la interfaz web oficial de la consola.

## Pregunta que responde

¿Qué funciones expone realmente el protocolo, con qué ruta, en qué unidad y con qué rango?

Ninguna función de producto se implementa sobre un parámetro que no esté probado aquí.

## Pasos

1. Para cada función, mover el control en la interfaz web oficial mientras se captura el tráfico, y anotar ruta, valores crudos y valor mostrado.
2. Escribir el parámetro desde el código y verificar por lectura.
3. Para los envíos auxiliares, comprobar el efecto de la configuración global de punto de derivación.
4. Para el enlace estéreo, comprobar si mover un canal arrastra a su vecino.
5. Volcar la tabla resultante en `docs/capability-matrix.md` y generar `docs/protocol-spec.md`.

## Criterios

| # | Criterio | Tipo | Umbral | Medido | Resultado |
|---|---|---|---|---|---|
| 1 | Confirmadas en hardware: fader de canal y general, silencio, panorama, nombre, ganancia de entrada, alimentación fantasma en lectura, envíos auxiliares con nivel, silencio y ambos puntos de derivación, matriz con el general como fuente, retardos de salida, instantáneas, shows, información del dispositivo | bloqueante | 100 % de esa lista | | ⬜ |
| 2 | Reproductor: silencio, fader, panorama, envíos a todos los buses, estado de reproducción, listas, carga, reproducción y detención | bloqueante | 100 % | | ⬜ |
| 3 | Grabación multipista: grabar, reproducir, detener, modo soundcheck, estado de grabación | bloqueante | 100 % | | ⬜ |
| 4 | Efecto de la configuración global de punto de derivación sobre el significado de antes y después del fader | bloqueante | documentado | | ⬜ |
| 5 | Enlace estéreo: si mover un canal arrastra al vecino en sus envíos | bloqueante | documentado con captura | | ⬜ |
| 6 | `docs/capability-matrix.md` versión 1 y `docs/protocol-spec.md` versión 1 generados | bloqueante | ambos | | ⬜ |

## Evidencia a entregar

- `evidence/traffic/` con una captura por función.
- `evidence/roundtrip.jsonl` con los resultados de escritura y lectura.

## Acción ante fallo

Una función que no aparezca por protocolo se marca DESCONOCIDO en la matriz y **no se planifica ninguna historia sobre ella**. Si es la lectura de los medidores lo que falla, cae el asistente de ganancia del MVP0 y hay que rediseñarlo sobre la entrada 2, lo que exige la interfaz de audio y mueve el primer entregable entero.
