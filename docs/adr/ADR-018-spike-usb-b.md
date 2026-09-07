# ADR-018 — Spike de conexión USB directa a la consola

**Estado:** Aceptada
**Fecha:** 2026-09-07
**Origen:** Auditoría técnica A-27.

## Contexto

La Ui24R es además una interfaz de audio USB de 32 entradas y 32 salidas, compatible con la clase estándar. Los primeros envíos son el general y los auxiliares; los 22 restantes son las entradas de la consola.

Android admite captura multicanal por índice en dispositivos que lo permitan. Si la tablet y la consola negocian esa conexión, **desaparecen de golpe**: la interfaz externa, sus dos ganancias analógicas no observables, la alimentación fantasma global, el bus de análisis con sus veinticuatro envíos, y la restricción de un solo canal espectral.

Estado: desconocido en Android. No hay evidencia ni a favor ni en contra.

## Decisión

Se ejecuta un spike acotado a **dos días**, colocado **antes** de la certificación de la tablet con la interfaz externa, no después: si resulta aprobado, no tiene sentido haber gastado cinco días certificando un montaje que se descarta.

Si la tablet enumera la consola y negocia 24 canales o más a 48 kHz de forma estable durante 30 minutos, se abre la decisión DEC-19 y se escribe la ADR-019 con la variante sin interfaz externa.

El plugin de captura se escribe desde el principio para **N canales**, con N mayor o igual a 2, para que no haya que reescribirlo en ninguna de las dos ramas.

## Consecuencias

- Dos días de riesgo a cambio de eliminar, potencialmente, cuatro de los diez riesgos técnicos principales.
- Si falla, se descarta con evidencia y no se vuelve sobre el tema.
- Aunque resulte aprobado, la decisión de adoptarlo no es automática: el micrófono pasaría a entrar por la consola, la tablet quedaría junto al rack y el cable del micrófono tendría que llegar hasta la sala.

## Alternativas descartadas

- **No investigarlo.** Es la única vía conocida que elimina la mayor parte de los riesgos de hardware del proyecto.
