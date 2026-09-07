# ADR-009 — Sala y mezcla se parten en dos

**Estado:** Aceptada
**Fecha:** 2026-09-07
**Origen:** Auditoría de producto B-01, B-04.

## Contexto

El flujo del producto, según el propio plan, es: sala, canales, grabación, mezcla, banda completa, supresión de realimentación. Pero el orden de entrega era canales, mezcla, sala.

Durante dos versiones el usuario habría ecualizado canales y balanceado faders sobre un sistema sin corregir. El plan mismo advierte que eso induce a corregir en el canal lo que es problema de sala, y lo llama principio de diagnosticar antes de corregir.

Por otro lado, el soundcheck virtual era prerequisito de la mezcla. Exige grabación multipista, repatcheo de todas las entradas y que la banda entregue una toma completa. Para un músico que además opera, el costo en tiempo es alto, y la dependencia técnica seguía sin verificar.

## Decisión

**La sala se parte en dos.** Room-Observe mide, calcula consistencia y desviación al objetivo, y **no escribe nada**. Llega justo después del asistente de canal, alineando la entrega con el flujo real. Room-Correct genera señal, mide por componente y propone ecualización de sistema, y llega después de su propio control de paso.

**La mezcla se parte en dos.** Mix-Live entrega roles, construcción progresiva de mezcla, prueba de banda completa y recomendaciones de fader, todo en vivo y sin soundcheck virtual. Mix-A/B entrega la comparación reproducible, después de su control de paso.

Room-Correct y Mix-Live pueden correr en paralelo si hay dos carriles.

## Consecuencias

- Hasta que exista Room, las recomendaciones de canal se etiquetan "sin corrección de sala".
- El soundcheck virtual deja de bloquear la mezcla.
- El primer dominio que se automatiza no es la ecualización de salida, que afecta a todo el sistema, sino un parámetro de un canal, que es el cambio de menor alcance y el más fácil de verificar.

## Alternativas descartadas

- **Mantener el orden del plan.** Entregaba durante meses una herramienta que contradice su propio principio de diagnóstico.
