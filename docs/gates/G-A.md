# Acta de control G-A

**Estado:** ⬜ Pendiente
**Responsable:** desarrollador principal

## Qué desbloquea

El adaptador de la consola, la máquina de estados de conexión, y con ellos el primer entregable completo.

## Criterios

| Spike | Criterio | Tipo | Umbral | Medido | Resultado |
|---|---|---|---|---|---|
| P0.1 | Reconexión automática por cada modo de corte | bloqueante | 20 de 20 en 10 s o menos | | ⬜ |
| P0.1 | Cadencia de medidores registrada y umbral de inestabilidad fijado | bloqueante | tres estadísticos | | ⬜ |
| P0.1 | La consola devuelve eco de las escrituras propias | informativo | sí o no | | ⬜ |
| ACK-POLICY | Tabla de confirmación por parámetro completa | bloqueante | 100 % de las filas | | ⬜ |
| P0.2a | Subconjunto del primer entregable confirmado en hardware | bloqueante | 100 % de la lista | | ⬜ |
| P0.2a | Especificación del protocolo versión 1 generada | bloqueante | sí | | ⬜ |
| P0.9 | Sobrescrituras de cambios ajenos | bloqueante | 0 | | ⬜ |
| P0.9 | Avalancha detectada | bloqueante | 10 de 10 | | ⬜ |
| P0.9 | Mecanismo de presencia elegido | bloqueante | uno, verificado | | ⬜ |
| P0.8 | Instantáneas manuales intactas | bloqueante | hash idéntico tras 50 ciclos | | ⬜ |
| P0.8 | Alcance de la recuperación documentado | bloqueante | campo por campo | | ⬜ |
| P0.7a | Grabación de 22 pistas sin fallos | bloqueante | 3 de 3 | | ⬜ |
| P0.7a | Existe posicionamiento por protocolo | informativo | sí o no | | ⬜ |

## Decisiones derivadas

_Por completar al cerrar: política de confirmación de escrituras, umbral de inestabilidad, mecanismo de presencia, plan del soundcheck virtual._
