# Documentación

## Para arrancar

| Documento | Qué contiene |
|---|---|
| [backlog/00-plan-final.md](backlog/00-plan-final.md) | Resumen ejecutivo del proyecto |
| [backlog/01-auditoria-integrada.md](backlog/01-auditoria-integrada.md) | Las cuatro auditorías integradas y las 18 decisiones |
| [backlog/02-backlog.md](backlog/02-backlog.md) | Épicas, historias, criterios de aceptación y dependencias |
| [backlog/03-orden-implementacion.md](backlog/03-orden-implementacion.md) | Los 126 ítems en orden, esfuerzo, camino crítico y planes B |

## Vigentes durante todo el proyecto

| Documento | Qué contiene | Se actualiza |
|---|---|---|
| [safety-invariants.md](safety-invariants.md) | Las 34 invariantes con su test |
| [design-system.md](design-system.md) | Fichas, primitivas y puntos de corte de la interfaz |
| [flujo-de-usuario.md](flujo-de-usuario.md) | Qué se puede hacer hoy con la aplicación, de punta a punta |
| [actualizacion-en-app.md](actualizacion-en-app.md) | Actualización desde GitHub y ceremonia del almacén de claves |
| [visual/](visual/) | Capturas contra el simulador y qué encontró cada tanda | Solo por ADR |
| [capability-matrix.md](capability-matrix.md) | Qué expone el protocolo y qué está probado | En cada spike de capacidades |
| [hardware-matrix.md](hardware-matrix.md) | Qué hardware está certificado | En cada certificación |
| [risk-register.md](risk-register.md) | Riesgos, responsable y mitigación | En cada control de paso |
| [adr/](adr/) | Decisiones de arquitectura | Se agregan, no se editan |
| [spikes/](spikes/) | Charters con criterio numérico y su evidencia | Al cerrar cada spike |
| [gates/](gates/) | Actas de los controles de paso | Al cerrar cada control |
| [field/](field/) | Informes de prueba de campo | Al cerrar cada versión |

## Documentos vivos, por versión

| Documento | Estado |
|---|---|
| [dsp-spec.md](dsp-spec.md) | Parámetros normativos de análisis |
| [scores.md](scores.md) | Fórmulas de los puntajes de sala y mezcla |
| [house-curves.md](house-curves.md) | Curvas objetivo, por banda |
| [channel-profiles.md](channel-profiles.md) | Perfiles de canal, con rangos y objetivos |
| [instrumentos.md](instrumentos.md) | Catálogo de instrumentos por fuente, variante y rol, y su enlace con los perfiles |
| [microfonos](microfonos.md) | Qué números cambian con cada micrófono y cuáles no. Fase futura, anotada ahora porque decide dónde vive una constante |
| [session-lifecycle.md](session-lifecycle.md) | Estados de la sesión y sus transiciones |
| [autonomy-matrix.md](autonomy-matrix.md) | Propiedad de parámetros y nivel de autonomía por versión |
| [logging.md](logging.md) | Formato del registro estructurado |
| [domain-model.md](domain-model.md) | Entidades y relaciones. Se genera desde los tipos |
| [ack-policy.md](ack-policy.md) | Cómo se da por aplicada una escritura. El mecanismo está elegido y medido: segunda conexión testigo, ADR-024 |
| [protocol-spec.md](protocol-spec.md) | El protocolo de la Ui24R medido contra el aparato: verbos, tramas, medidores, curvas |
