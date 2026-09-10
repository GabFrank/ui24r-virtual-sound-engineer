# Propiedad de parámetros y nivel de autonomía

Implementa ADR-010. El registro en código vive en `packages/domain/src/rules/ownership.ts`. `packages/domain/test/ownership.test.ts` verifica la coherencia interna de ese registro —ningún parámetro «solo del usuario» escribible, sin duplicados, sin tipos sin dueño—; **la correspondencia con la tabla de abajo se mantiene a mano**.

## Niveles

| Nivel | Qué significa |
|---|---|
| **OBSERVE** | La aplicación lee y muestra. No propone nada. |
| **SUGGEST** | Propone con evidencia. El usuario aplica a mano. La aplicación no escribe. |
| **ASSISTED** | El usuario aprueba cada cambio con una acción explícita, y la aplicación lo escribe, lo verifica y puede revertirlo. |
| **AUTO** | La aplicación aplica, vuelve a medir y conserva o revierte. Solo con confianza alta y un parámetro por transacción. |

## Propiedad

| Parámetro | Dueño | Nivel máximo por versión |
|---|---|---|
| Ganancia de entrada | Asistente de canal | **ASSISTED desde el 2026-09-09** (ADR-026), solo en configuración de canal y sin toma de soundcheck activa. Aplica con confianza ALTA o MEDIA; BAJA y SIN DATOS no habilitan |
| Filtro pasa altos, ecualizador de canal, compresor, puerta, deesser | Asistente de canal | SUGGEST |
| Fader de canal | Asistente de mezcla | SUGGEST hasta MVP4a, ASSISTED desde MVP4a |
| Panorama de canal | Asistente de mezcla | SUGGEST |
| Ecualización de salida sobre buses del perfil de amplificación | Asistente de sala | SUGGEST hasta MVP4b, ASSISTED y luego AUTO desde MVP4b, solo atenuaciones |
| Retardo y polaridad de salida | Asistente de sala | OBSERVE hasta post-MVP |
| Envíos hacia el bus de análisis | Sistema | Transacción de sistema, desde MVP1 |
| Reproductor: silencio, fader, envíos | Sistema | Solo dentro de la reserva, desde MVP1 |
| Silencio de buses del perfil de amplificación durante medición | Sistema | Transacción de sistema con restauración, desde MVP3 |
| Instantáneas con prefijo reservado | Sistema | Desde MVP0 |
| **Envíos auxiliares de monitores** | **Solo del usuario** | La aplicación nunca escribe. Excepción única: envíos del reproductor hacia menos infinito dentro de la reserva |
| **Fader general** | **Solo del usuario** | Nunca escrito en MVP0 a MVP3 |
| **Silencio de entradas y general** | **Solo del usuario** | Nunca |
| **Alimentación fantasma** | **Solo del usuario** | La aplicación solo lee |
| **Limitador de salida** | **Solo del usuario** | Protege el sistema, no se automatiza |
| **Efectos, subgrupos, VCA** | **Solo del usuario** | Fuera de alcance |
| **Supresión de realimentación** | **Solo del usuario** | Procedimiento manual con lista de verificación |
| Ganancia, alimentación y monitoreo directo de la interfaz de audio | Usuario, es hardware | La aplicación no puede leerlos ni escribirlos |

## Progresión de la autonomía

```text
OBSERVE ──► SUGGEST ──► ASSISTED ──► AUTO
MVP0        MVP1-MVP3    MVP4a         MVP4b
                         un parámetro   solo sala,
                         de canal       solo atenuaciones,
                                        solo confianza alta
```


## Qué falta para llegar a la automatización de show

ADR-023 fijó el destino: la aplicación va a automatizar la mezcla. Lo que sigue son las condiciones de cada escalón, escritas antes de intentarlo. Ninguna se cumple hoy.

| Para poder… | Hace falta | Estado |
|---|---|---|
| Escribir **cualquier** cosa | G-A cerrado: protocolo confirmado en hardware, política de confirmación de escrituras, concurrencia y alcance de la recuperación de instantáneas | ⬜ ningún spike cerrado |
| Escribir **un** parámetro de canal (ASSISTED) | Lo anterior, más la máquina de reconexión y el retroceso transaccional verificado por lectura | ⬜ |
| Escribir **un conjunto** —el balance de cuatro voces— | Una clase de transacción que garantice todo-o-nada sobre el conjunto, con verificación y reversión conjuntas. No alcanza con levantar el límite de cuatro de INV-005: el límite es lo que hoy hace que un fallo se pueda entender | ⬜ sin diseñar |
| Escribir **efectos y subgrupos** | Rehacer la propiedad de ADR-010, que hoy los declara «solo del usuario, fuera de alcance», con el mismo cuidado con que se escribió | ⬜ decisión pendiente, ya no bloqueada por el alcance |
| Apoyarse en el **CUE nativo** | SPK-FW3 criterio 5: que un CUE no toque los envíos de AUX, o que se puedan excluir. Si los toca y no se pueden excluir, este camino queda cerrado por INV-010 | ⬜ sin medir |
| **Transiciones graduales** en vez de escalón | SPK-FW3 criterio 8: que la consola sostenga el ritmo de escritura que pide una rampa | ⬜ sin medir |

**Lo que no está en la tabla porque no se mueve:** INV-010. Ningún envío de monitor recibe escrituras, en ningún nivel de autonomía y por ninguna versión. Un automatizador que puede alterar lo que oye un músico en el escenario no es un producto mejor.

El primer parámetro que se automatiza es **uno de canal**, ganancia o fader, porque es el cambio de menor alcance y el más fácil de verificar. La ecualización de sistema, que afecta a todo el sistema de amplificación, viene después.
