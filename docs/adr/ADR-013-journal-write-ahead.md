# ADR-013 — Diario de transacciones antes de escribir

**Estado:** Aceptada
**Fecha:** 2026-09-07
**Origen:** Auditoría de producto B-18, B-19.

## Contexto

El plan no contemplaba qué ocurre si la aplicación se cae a mitad de una transacción de cuatro escrituras. Tampoco qué ocurre si el usuario, o un compañero desde su teléfono, recupera una instantánea manual mientras hay transacciones pendientes: cambian decenas de parámetros de golpe, el valor esperado de todas las transacciones abiertas queda inválido y el estado de retroceso apunta a algo que ya no existe.

## Decisión

**Diario escrito antes de cada escritura**, persistido en base de datos local.

Al iniciar la aplicación, las transacciones que quedaron aplicando o verificando se detectan, se lee el estado real de la consola, se muestra la diferencia y se ofrece retroceder o aceptar. **Nunca se reaplica automáticamente.**

Una avalancha externa, más de diez rutas distintas en menos de un segundo o un cambio de la instantánea actual, suspende las transacciones abiertas e invalida las mediciones previas no cerradas.

El retroceso por cambio individual se deshabilita si la base cambió. En ese caso solo queda el retroceso por instantánea, con confirmación y aviso de alcance.

## Consecuencias

- Una escritura cuesta una escritura en disco previa. Es aceptable: la cadencia máxima de escrituras es de una cada 100 ms en modo asistido.
- El alcance de la recuperación de instantánea de la consola es desconocido: se mide en un spike con diferencia completa de estado antes y después.

## Alternativas descartadas

- **Confiar solo en las instantáneas para retroceder.** El plan mismo lo prohíbe en sus directivas, y una instantánea no distingue qué cambió la aplicación de qué cambió el usuario.
