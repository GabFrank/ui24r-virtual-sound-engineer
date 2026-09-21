# Ui24R Virtual Sound Engineer

Ingeniero de sonido virtual asistido por medición para consolas **Soundcraft Ui24R**.

El objetivo no es reemplazar a un ingeniero de sonido. Es que un músico que al mismo tiempo canta, toca, dirige y opera la consola disponga de un sistema capaz de **escuchar, medir, comparar, explicar, sugerir, aplicar cambios controlados y verificar si realmente mejoraron el sonido**.

**Plataforma:** Angular + Capacitor + Android (tablet).
**Filosofía:** offline-first, measurement-first, safe-by-design.
**Estado y siguiente tarea:** [docs/estado-actual.md](docs/estado-actual.md). Para trabajar, empezar por [AGENTS.md](AGENTS.md).

**La aplicación escribe en la consola, y conviene decir hasta dónde llega cada permiso.** El motor tiene tres categorías abiertas: la ganancia de entrada (ADR-026, decisión del usuario), el silencio de un canal para diagnosticar fuera del show (ADR-027, **propuesta del agente** que el usuario aceptó con el argumento que lo sostiene) y el nivel del envío a monitor, con techo y nunca durante el show (ADR-028, decisión del usuario). **Lo único que hoy llega a la consola desde una pantalla es la ganancia**: el envío a monitor tiene el camino construido y probado y ninguna pantalla lo llama todavía, y el silencio de canal no tiene camino de producción. Toda escritura pasa por el motor de seguridad y se confirma por una segunda conexión testigo. **No reproduce audio**: todo lo que necesita el micrófono de medición o la interfaz de audio sigue pendiente de los spikes. Ver [docs/flujo-de-usuario.md](docs/flujo-de-usuario.md) para lo que se puede hacer hoy, y la [auditoría externa del 2026-09-15](docs/backlog/auditorias/2026-09-15-auditoria-externa.md) para el estado real contado desde afuera.

| | |
|---|---|
| Tests en verde | Todos. El número exacto lo dice `npm run verificar` |
| Spikes cerrados | 0 de 23 |
| Controles de paso aprobados | 0 de 5 |
| Rutas crudas con conversión medida | 19 —la **frecuencia y el Q de las cuatro bandas** del ecualizador de canal contra el filtro real, medidas una banda por corrida; el pasa-altos y el pasa-bajos; la **ganancia de esas cuatro bandas**, también una por una; el envío a monitor contra la salida del auxiliar; la **ganancia del ecualizador gráfico de salida en sus dos superficies**, un auxiliar y el general; el **sostenido de la puerta**, la primera en el dominio del tiempo; y la **profundidad de la puerta**, acotada a donde el banco llega a verla—, todas con bucle externo. `validate-numeros` las cuenta |
| Rutas crudas que el motor deja escribir | **7 de esas 19**: el envío a monitor, la **ganancia de las cuatro bandas del ecualizador de canal** y la del **ecualizador gráfico de salida en sus dos superficies** —un auxiliar y el general—, todas en dB igual que el tope de su `kind`. Las otras diez del ecualizador —la frecuencia y el Q de las cuatro bandas, el pasa-altos y el pasa-bajos— las sigue rechazando INV-004: `LIMITES` da una unidad por `kind` y sus leyes están en Hz y en Q contra un tope en dB ([hallazgo](docs/backlog/hallazgo-un-kind-una-unidad-y-las-hojas-no-coinciden.md)). Medir la ganancia sí las mueve porque es la única hoja del ecualizador cuya unidad coincide con la del tope |

---

## Principios que gobiernan este repositorio

1. **Nada se asume del protocolo.** Ninguna función se implementa sobre un parámetro que no esté probado en [docs/capability-matrix.md](docs/capability-matrix.md).
2. **Nada se escribe sin invariante.** Toda escritura a la consola pasa por el Safety Engine y está cubierta por una invariante de [docs/safety-invariants.md](docs/safety-invariants.md) con su test.
3. **Ningún asistente habla con la consola.** Solo `MixerDomainAPI` escribe, y solo a través del pipeline `Assistant → Recommendation → Transaction → SafetyEngine → write()`.
4. **Primero medir, después corregir.** Cada corrección automática guarda estado, aplica un cambio pequeño, vuelve a medir y revierte si empeoró.
5. **La autoridad es humana.** La automatización avanza en el orden OBSERVAR → SUGERIR → ASISTIDO → AUTOMÁTICO CONTROLADO, y nunca salta etapas.

---

## Estado de los controles de paso

| Gate | Desbloquea | Estado |
|---|---|---|
| [G-A](docs/gates/G-A.md) | Foundation y MVP0 | ⬜ pendiente |
| [G-B](docs/gates/G-B.md) | Motor de audio nativo | ⬜ pendiente |
| [G-C](docs/gates/G-C.md) | MVP1 y Room-Correct | ⬜ pendiente |
| [G-D](docs/gates/G-D.md) | Soundcheck virtual | ⬜ pendiente |
| [G-E](docs/gates/G-E.md) | Aplicación asistida | ⬜ pendiente |

## Mapa de épicas

```text
EP-00 Gobernanza ──┐
EP-01 Spikes 0a ───┴► G-A ─► EP-02 Foundation ─► EP-03 MVP0 Console Telemetry & Gain
EP-04 Spikes consola + audio ─► G-B ─► DEC-19 ─► EP-05 Basic Audio Engine ─► G-C
G-C ─► EP-06 MVP1 Channel ─► EP-07 Room-Observe ─► EP-08 Mix-Live ∥ EP-10 Room-Correct
EP-11 SPK-P0.7a/b ─► G-D ─► Mix-A/B
EP-12 Suite de seguridad ─► G-E ─► EP-13 Assisted Apply ─► EP-14 Closed loop
EP-15 Post-MVP
```

## Estructura

| Ruta | Contenido |
|---|---|
| `apps/mobile` | Aplicación Angular + Capacitor. El plugin nativo de audio vive en `apps/mobile/android`. |
| `packages/domain` | Entidades, reglas y tipos del dominio. Sin dependencias de framework. |
| `packages/mixer-adapter` | `MixerDomainAPI` y el adaptador de Ui24R. Único punto que habla con la consola. |
| `packages/safety` | Motor de seguridad, diario write-ahead y ejecutor de transacciones. Tiene autoridad sobre cualquier asistente. |
| `packages/assistants` | Análisis y propuestas. Funciones puras: no tocan la consola ni la base. |
| `packages/store` | Puerto del almacén, esquema de la base y semántica de las consultas, con su SQL para poder probarlo. |
| `packages/logging` | Registro estructurado, sus sumideros y la lectura del registro guardado. |
| `packages/updater` | Política de actualización de la aplicación. TypeScript puro, sin red ni Android. |
| `packages/dsp-contract` | Tipos del puente entre el motor nativo de audio y la aplicación. |
| `docs/adr` | Decisiones de arquitectura. |
| `docs/spikes` | Charters de spikes con criterio de aprobación numérico, y su evidencia. |
| `docs/gates` | Actas de los controles de paso. |
| `docs/field` | Informes de prueba de campo. |
| `docs/backlog` | Plan final, auditorías, backlog y orden de implementación. |
| `tools/spikes` | Código de spikes. No requiere tests ni entra en el producto. |
| `tools/docs` | Validadores de documentación, plantillas, límites y commits; comandos y alcance en CONTRIBUTING.md. |
| `tools/mixer-sim` | Simulador del protocolo de la consola. Reproduce nuestras hipótesis, no la consola. |
| `tools/visual` | Capturas contra el simulador y recorrido automático del camino de usuario. |

## Documentos de entrada

- [Estado actual](docs/estado-actual.md) — siguiente tarea y decisiones vigentes; los planes históricos de abajo no son una cola de trabajo
- [Flujo de desarrollo](CONTRIBUTING.md) — comprobación por impacto y cierre de tareas

- [Alcance del MVP](docs/alcance-mvp.md) — qué entra y qué no en la primera entrega, decidido con el usuario. Reemplaza la escalera MVP0–MVP4b del plan de abajo
- [Auditoría externa del 2026-09-15](docs/backlog/auditorias/2026-09-15-auditoria-externa.md) — estado real, trabajo previo publicado y qué corroborar con la consola
- [Plan final](docs/backlog/00-plan-final.md)
- [Auditoría integrada y decisiones](docs/backlog/01-auditoria-integrada.md)
- [Backlog v1.1](docs/backlog/02-backlog.md)
- [Orden de implementación](docs/backlog/03-orden-implementacion.md)
- [Invariantes de seguridad](docs/safety-invariants.md)

## Desarrollo

```bash
npm install          # instala el workspace completo
npm run verificar    # lo mismo que corre la integración continua. Antes de empujar, siempre
npm run lint         # chequeo de tipos (tsc --noEmit) en los paquetes y compilación de la app
npm test             # tests unitarios
npm run validate:docs  # verifica que todo ID referenciado en docs exista
```

## Aviso de seguridad

Este software puede escribir sobre una consola de audio conectada a un sistema de amplificación. Una escritura equivocada puede dañar equipos y personas. No se ejecuta ninguna versión con capacidad de escritura sin su parte de la suite de seguridad en verde. Ver [docs/safety-invariants.md](docs/safety-invariants.md) y [CONTRIBUTING.md](CONTRIBUTING.md).
