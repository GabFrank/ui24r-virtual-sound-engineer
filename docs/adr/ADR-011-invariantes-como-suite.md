# ADR-011 — Las invariantes son la suite de aceptación

**Estado:** Aceptada
**Fecha:** 2026-09-07
**Origen:** Auditoría de producto B-14 a B-20; auditoría de estructura C-02; auditoría de calidad D-02, D-19 a D-22.

## Contexto

Las reglas de seguridad del plan eran consignas: "cambios pequeños", "no routing crítico sin validación", "límite de parámetros simultáneos", "registrar todo". Ninguna tenía número ni forma de comprobarse. Una regla sin test es una intención.

Faltaban además escenarios enteros: caída de la aplicación a mitad de una transacción, recuperación manual de una instantánea con transacciones pendientes, nivel máximo del generador, alimentación fantasma global sobre una salida de línea.

La segunda ronda de auditoría encontró que, ya escritas, **una invariante era ella misma destructiva** y **cuatro no se podían testear** tal como estaban.

## Decisión

Las invariantes de [docs/safety-invariants.md](../safety-invariants.md) son **la suite de aceptación de seguridad**. Cada una tiene identificador, enunciado verificable, y la versión desde la que aplica; el objetivo es que cada una tenga además test unitario y test contra hardware real.

> Nota posterior: eran 33 al escribir este ADR y hoy son 34 —INV-034 llegó con la actualización dentro de la aplicación—. Los ADR se agregan y no se editan, pero el número era comprobable y ya no era cierto. Y la frase original decía «cada una tiene test unitario y test contra hardware real» en presente: es el objetivo, no el estado. Ningún test contra hardware existe todavía, y `docs/safety-invariants.md` lleva la cuenta de cuáles tienen test unitario.

La suite está **rebanada por versión** y cableada como dependencia: ninguna historia que escriba en la consola o reproduzca audio se cierra sin su rebanada en verde. No se agrupa toda al final.

Cada test lleva el identificador de su invariante en el nombre.

## Consecuencias

- Cuatro rebanadas: la de lectura y red, la del generador, la de medición por componente y la transaccional.
- El control G-E exige el cien por ciento en verde, unitario y sobre hardware.
- Cuesta más al principio. A cambio, ninguna versión con capacidad de escritura llega a un escenario real sin cobertura.

## Alternativas descartadas

- **Suite única al final.** Habría dejado tres versiones con escrituras sin un solo test de invariante.
