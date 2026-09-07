# ADR-019 — Arquitectura con o sin interfaz de audio externa

**Estado:** **Reservada.** Se decide en DEC-19, después del control G-B.
**Origen:** ADR-018, spike SPK-P0.3b.

## Contexto

Está pendiente de medición. La Ui24R es además una interfaz de audio USB de 32 entradas y 32 salidas. Si una tablet Android la enumera y negocia sus canales, la arquitectura cambia de raíz.

Esta decisión no se puede tomar antes de tener el número. Escribirla ahora sería inventar.

## Lo que se decide aquí, cuando toque

Si SPK-P0.3b resulta aprobado y se adopta la variante sin interfaz externa:

- Quedan **canceladas o reescritas**: la calibración de ganancia de la interfaz, el gestor del bus de análisis, el asistente de calibración, el asistente de loopback y la parte correspondiente del estado de calibración.
- El plugin de captura **ya está escrito para N canales**, así que no se reescribe.
- Se **retira la ADR-015**: habría espectro por canal simultáneo, y la prueba de banda completa se simplifica.
- El micrófono de medición entra **por una entrada de la consola**, con alimentación fantasma desde la mesa. La regla de cableado "entrada 2 solo por conector TRS" desaparece, y con ella el riesgo R-05.
- Aparece un spike nuevo de certificación de tablet con la consola por USB durante cuatro horas.

Si resulta rechazado, o si resulta aprobado pero se descarta por razones prácticas, por ejemplo porque obliga a llevar el cable del micrófono desde el rack hasta la sala, esta decisión se cierra como *Rechazada* con el motivo escrito y no se vuelve sobre el tema.

## Criterio de decisión

No basta con que funcione técnicamente. Se evalúa también: dónde queda físicamente la tablet durante el show, qué largo de cable de micrófono hace falta, y si la banda tiene entradas libres en la consola.
