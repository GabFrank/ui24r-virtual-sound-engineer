# Propiedad de parámetros y nivel de autonomía

Implementa ADR-010. El registro en código vive en `packages/domain/src/ownership.ts` y hay un test estático que verifica que estas dos tablas coinciden.

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
| Ganancia de entrada | Asistente de canal | SUGGEST hasta MVP4a, ASSISTED desde MVP4a, solo en configuración de canal |
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

El primer parámetro que se automatiza es **uno de canal**, ganancia o fader, porque es el cambio de menor alcance y el más fácil de verificar. La ecualización de sistema, que afecta a todo el sistema de amplificación, viene después.
