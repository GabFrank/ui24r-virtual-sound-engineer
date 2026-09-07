# SPK-P0.9 — Concurrencia y presencia

**Estado:** Pendiente · **Timebox:** 3 días · **Control:** G-A
**Depende de:** SPK-P0.1 · **Bloquea a:** S-02.5b
**Montaje:** Ui24R, router, laptop con Node, navegador oficial abierto en otro equipo, teléfono con la aplicación oficial.

## Pregunta que responde

¿Se puede detectar de forma fiable que otro cliente cambió un parámetro, sin sobrescribir su cambio, y cómo se detecta que hay otra instancia de esta aplicación conectada?

## Pasos

1. Implementar un prototipo del almacén de estado confirmado alimentado solo por mensajes entrantes, con correlación por ventana temporal.
2. Ejecutar cien escrituras propias mientras un operador hace cien cambios desde el navegador oficial.
3. Recuperar una instantánea desde el navegador durante una escritura.
4. Arrastrar un fader en el navegador y observar la ráfaga.
5. Probar los dos mecanismos candidatos de presencia: el mensaje de sincronización con identificador propio, y una instantánea con nombre reservado renovada cada sesenta segundos.

## Criterios

| # | Criterio | Tipo | Umbral | Medido | Resultado |
|---|---|---|---|---|---|
| 1 | Cambios externos etiquetados correctamente | bloqueante | 100 de 100 | | ⬜ |
| 2 | Sobrescrituras de cambios ajenos | bloqueante | 0 | | ⬜ |
| 3 | Escrituras propias etiquetadas como propias | bloqueante | 98 % o más | | ⬜ |
| 4 | Recuperación de instantánea detectada como avalancha | bloqueante | 10 de 10, con más de 10 rutas en menos de 1 s | | ⬜ |
| 5 | Arrastre de fader agrupado como un único cambio externo | bloqueante | sí | | ⬜ |
| 6 | Mecanismo de presencia elegido y verificado | bloqueante | uno de los dos, con prueba de dos clientes | | ⬜ |

## Evidencia a entregar

- `evidence/concurrency-run.jsonl`, `evidence/bulk-detection.log`, `evidence/presence.md`.

## Acción ante fallo

Si no se puede detectar la ráfaga de forma fiable, la aplicación asistida queda condicionada: cada escritura exige confirmación humana del valor actual leído en pantalla, y el modo automático controlado no se habilita.
