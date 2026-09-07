# Ui24R Virtual Sound Engineer

Ingeniero de sonido virtual asistido por medición para consolas **Soundcraft Ui24R**.

El objetivo no es reemplazar a un ingeniero de sonido. Es que un músico que al mismo tiempo canta, toca, dirige y opera la consola disponga de un sistema capaz de **escuchar, medir, comparar, explicar, sugerir, aplicar cambios controlados y verificar si realmente mejoraron el sonido**.

**Plataforma:** Angular + Capacitor + Android (tablet).
**Filosofía:** offline-first, measurement-first, safe-by-design.
**Estado:** Fase 0 en curso. Ninguna función de producto está implementada todavía.

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
| `packages/dsp-contract` | Tipos del puente entre el motor nativo de audio y la aplicación. |
| `docs/adr` | Decisiones de arquitectura. |
| `docs/spikes` | Charters de spikes con criterio de aprobación numérico, y su evidencia. |
| `docs/gates` | Actas de los controles de paso. |
| `docs/field` | Informes de prueba de campo. |
| `docs/backlog` | Plan final, auditorías, backlog y orden de implementación. |
| `tools/spikes` | Código de spikes. No requiere tests ni entra en el producto. |
| `tools/hil` | Harness de pruebas contra hardware real. |
| `tools/docs` | Validador de identificadores y generador de dependencias inversas. |

## Documentos de entrada

- [Plan final](docs/backlog/00-plan-final.md)
- [Auditoría integrada y decisiones](docs/backlog/01-auditoria-integrada.md)
- [Backlog v1.1](docs/backlog/02-backlog.md)
- [Orden de implementación](docs/backlog/03-orden-implementacion.md)
- [Invariantes de seguridad](docs/safety-invariants.md)

## Desarrollo

```bash
npm install          # instala el workspace completo
npm run lint         # eslint en todos los paquetes
npm test             # tests unitarios
npm run validate:docs  # verifica que todo ID referenciado en docs exista
```

## Aviso de seguridad

Este software puede escribir sobre una consola de audio conectada a un sistema de amplificación. Una escritura equivocada puede dañar equipos y personas. No se ejecuta ninguna versión con capacidad de escritura sin su parte de la suite de seguridad en verde. Ver [docs/safety-invariants.md](docs/safety-invariants.md) y [CONTRIBUTING.md](CONTRIBUTING.md).
