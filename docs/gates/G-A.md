# Acta de control G-A

**Estado:** ⬜ Pendiente
**Responsable:** desarrollador principal

## Qué desbloquea

El adaptador de la consola, la máquina de estados de conexión, y con ellos el primer entregable completo.

## Criterios

| Spike | Criterio | Tipo | Umbral | Medido | Resultado |
|---|---|---|---|---|---|
| P0.1 | Reconexión automática por cada modo de corte | bloqueante | 20 de 20 en 10 s o menos | **Un modo de tres.** Wifi cortada: 20 de 20 desde la tablet, mediana 3,7 s, máximo 5,0. Faltan router apagado y cambio de IP, que necesitan a alguien físicamente ahí | ⬜ |
| P0.1 | Cadencia de medidores registrada y umbral de inestabilidad fijado | bloqueante | tres estadísticos | `RTA` desde la tablet: media 33 ms, p95 40 ms, mediana 33 ms, idéntico en silencio y con señal → **umbral de inestabilidad 99 ms**. Se mide sobre `RTA` y nunca sobre `VU2`, que la consola calla en silencio | ✅ |
| P0.1 | La consola devuelve eco de las escrituras propias | informativo | sí o no | **No.** Seis segundos escuchando, cero líneas para la ruta escrita, en dos parámetros distintos. La escritura sí se aplica y sí se difunde a los demás clientes | ✅ |
| ACK-POLICY | Tabla de confirmación por parámetro completa | bloqueante | 100 % de las filas | Sin escribir. El **mecanismo** ya está elegido y medido —segunda conexión testigo, 27 ms—, así que lo que falta es redacción y no laboratorio | ⬜ |
| P0.2a | Subconjunto del primer entregable confirmado en hardware | bloqueante | 100 % de la lista | | ⬜ |
| P0.2a | Especificación del protocolo versión 1 generada | bloqueante | sí | | ⬜ |
| P0.9 | Sobrescrituras de cambios ajenos | bloqueante | 0 | | ⬜ |
| P0.9 | Avalancha detectada | bloqueante | 10 de 10 | | ⬜ |
| P0.9 | Mecanismo de presencia elegido | bloqueante | uno, verificado | Sin elegir, y ahora tiene un requisito más: la política de confirmación usa una **segunda conexión propia**, así que el mecanismo de presencia tiene que distinguir nuestro testigo de un segundo operador | ⬜ |
| P0.8 | Instantáneas manuales intactas | bloqueante | hash idéntico tras 50 ciclos | | ⬜ |
| P0.8 | Alcance de la recuperación documentado | bloqueante | campo por campo | | ⬜ |
| P0.7a | Grabación de 22 pistas sin fallos | bloqueante | 3 de 3 | | ⬜ |
| P0.7a | Existe posicionamiento por protocolo | informativo | sí o no | | ⬜ |

## Decisiones derivadas

Se van anotando a medida que salen, no al cerrar: una decisión escrita el día que se toma es la que se puede rastrear después.

| Decisión | Qué se decidió | De dónde sale |
|---|---|---|
| **Umbral de inestabilidad de la conexión** | **99 ms**, tres veces el intervalo medio de `RTA` medido desde la tablet. Se vigila `RTA` y **nunca** `VU2` | SPK-P0.1, criterio 4 |
| **Política de confirmación de escrituras** | **Segunda conexión testigo**, medida en 27 ms. Costo: el testigo recibe el volcado completo y los flujos de medidores. La ADR está en redacción | SPK-ACK-POLICY |
| **Mecanismo de presencia** | Sin elegir | SPK-P0.9, criterio 6 |
| **Plan del soundcheck virtual** | Sin elegir | SPK-P0.7a |

> **Este control no cierra todavía, y lo que falta no es medición sino acceso físico.** Los dos criterios que quedan de SPK-P0.1 —los otros dos modos de corte y los diez minutos de tres clientes— y buena parte de SPK-P0.8 y SPK-P0.7a necesitan a alguien delante del aparato. Es el R-18 en concreto: el carril de hardware no se paraleliza.
