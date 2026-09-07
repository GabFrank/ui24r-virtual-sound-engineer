# SPK-LIFE — Ciclo de vida de Android con audio

**Estado:** Pendiente · **Timebox:** 3 días · **Control:** G-B
**Depende de:** SPK-P0.3 · **Bloquea a:** S-02.14, S-05.1b
**Montaje:** tablet certificada, interfaz, concentrador, consola.

## Pregunta que responde

¿La captura y la conexión sobreviven a lo que pasa de verdad durante un show de tres horas?

## Pasos

Para cada escenario, con captura activa y conexión establecida, observar qué ocurre y cuánto tarda en recuperarse: pantalla apagada durante treinta minutos, aplicación en segundo plano durante diez, modo no molestar activo, llamada entrante simulada, desconexión y reconexión del cable USB.

## Criterios

| # | Criterio | Tipo | Umbral | Medido | Resultado |
|---|---|---|---|---|---|
| 1 | Captura continúa con la pantalla apagada | bloqueante | 30 min sin cortes, o comportamiento documentado | | ⬜ |
| 2 | Captura continúa con la aplicación en segundo plano | bloqueante | 10 min, o documentado | | ⬜ |
| 3 | Modo no molestar no interrumpe la captura | bloqueante | sí | | ⬜ |
| 4 | Comportamiento ante llamada entrante | bloqueante | documentado, con tiempo de recuperación | | ⬜ |
| 5 | Reconexión del cable USB | bloqueante | la aplicación se recupera sin reiniciar | | ⬜ |

## Evidencia a entregar

- `evidence/lifecycle-matrix.md` con un resultado por escenario.

## Acción ante fallo

Cada escenario que falla se convierte en una restricción de uso documentada y visible en la aplicación. Por ejemplo: si la captura muere con la pantalla apagada, el modo show exige pantalla encendida y lo dice, en lugar de fallar en silencio a mitad del concierto.
