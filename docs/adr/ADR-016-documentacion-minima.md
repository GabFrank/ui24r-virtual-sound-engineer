# ADR-016 — Documentación mínima para arrancar

**Estado:** Aceptada
**Fecha:** 2026-09-07
**Origen:** Auditoría de producto B-43, B-44.

## Contexto

El plan pedía diez documentos completos antes de escribir código funcional, entre ellos la especificación del protocolo, la de procesamiento de señal y la de flujos de interfaz.

Eso contradice su propia fase 0: **los spikes son código**. Y exigir la especificación del protocolo antes de saber qué soporta el protocolo produce un documento que se reescribe entero al terminar la fase 0.

## Decisión

El mínimo documental para arrancar es:

1. **Charters de spike**, una página cada uno: objetivo, montaje, pasos, criterio de aprobación numérico, evidencia a entregar, timebox.
2. **Matrices vacías**: capacidades del protocolo y hardware, listas para llenarse.
3. **Invariantes de seguridad** con su test.
4. **Registro de decisiones**, una página por decisión.
5. **Definición de terminado** y convenciones.

Todo lo demás son **documentos vivos por versión**. La especificación del protocolo es **resultado** del spike de capacidades, no su requisito.

## Consecuencias

- Se evita reescribir cuatro especificaciones al terminar la fase 0.
- Los documentos que sí existen tienen números y se pueden verificar.
- Hace falta disciplina: un documento vivo desactualizado es peor que ninguno. Por eso la definición de terminado exige actualizar las matrices.

## Alternativas descartadas

- **Escribir los diez documentos primero.** Parálisis por documentación, y retrabajo garantizado.
