# Documentación

## Para arrancar

| Documento | Qué contiene |
|---|---|
| [backlog/00-plan-final.md](backlog/00-plan-final.md) | Resumen ejecutivo del proyecto |
| [backlog/01-auditoria-integrada.md](backlog/01-auditoria-integrada.md) | Las cuatro auditorías integradas y las 18 decisiones |
| [backlog/02-backlog.md](backlog/02-backlog.md) | Épicas, historias, criterios de aceptación y dependencias |
| [backlog/03-orden-implementacion.md](backlog/03-orden-implementacion.md) | Los 126 ítems en orden, esfuerzo, camino crítico y planes B |
| [backlog/hallazgo-capturas-huerfanas.md](backlog/hallazgo-capturas-huerfanas.md) | Renumerar el flujo visual deja capturas que el validador no ve: comprueba en un solo sentido |
| [backlog/decision-bajar-buses-para-cazar-acoples.md](backlog/decision-bajar-buses-para-cazar-acoples.md) | El usuario autorizó bajar el auxiliar y el general; qué falta medir y decidir antes de abrirlos |
| [backlog/hallazgo-umbral-de-una-diferencia.md](backlog/hallazgo-umbral-de-una-diferencia.md) | El umbral de «un escalón» rechaza por construcción cuando se aplica a una diferencia de dos lecturas |

## Vigentes durante todo el proyecto

| Documento | Qué contiene | Se actualiza |
|---|---|---|
| [safety-invariants.md](safety-invariants.md) | Las 34 invariantes con su test |
| [design-system.md](design-system.md) | Fichas, primitivas y puntos de corte de la interfaz |
| [alcance-mvp.md](alcance-mvp.md) | **Qué entra y qué no en la primera entrega.** Decidido el 2026-09-11 |
| [flujo-de-usuario.md](flujo-de-usuario.md) | Qué se puede hacer hoy con la aplicación, de punta a punta |
| [actualizacion-en-app.md](actualizacion-en-app.md) | Actualización desde GitHub y ceremonia del almacén de claves |
| [visual/](visual/) | Capturas contra el simulador y qué encontró cada tanda | Solo por ADR |
| [capability-matrix.md](capability-matrix.md) | Qué expone el protocolo y qué está probado | En cada spike de capacidades |
| [hardware-matrix.md](hardware-matrix.md) | Qué hardware está certificado | En cada certificación |
| [risk-register.md](risk-register.md) | Riesgos, responsable y mitigación | En cada control de paso |
| [adr/](adr/) | Decisiones de arquitectura | Se agregan, no se editan |
| [spikes/](spikes/) | Charters con criterio numérico y su evidencia | Al cerrar cada spike |
| [inventario/](inventario/) | Inventarios de claves capturados contra la consola real, por firmware y fecha | Al capturar |
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
| [pedidos/00-lo-que-dijo-el-usuario.md](pedidos/00-lo-que-dijo-el-usuario.md) | Lo que el usuario dijo, textual y sin glosa. Todo lo demás es interpretación |
| [pedidos/2026-09-12-plan-de-la-madrugada.md](pedidos/2026-09-12-plan-de-la-madrugada.md) | Las siete mediciones y los cinco ítems de producto de la noche del 12 al 13, con lo que se promete y lo que no |
| [pedidos/2026-09-12-el-plano-como-mesa-de-trabajo.md](pedidos/2026-09-12-el-plano-como-mesa-de-trabajo.md) | Por qué el plano no es un instrumento de medición, qué se midió para saberlo, y las distancias en vivo que faltan |
| [pedidos/01-auditoria-de-fidelidad.md](pedidos/01-auditoria-de-fidelidad.md) | Los 24 hallazgos de contrastar los documentos derivados contra ese original: la cita inventada, la autoría invertida, la restricción de más |
| [piloto-de-deteccion.md](piloto-de-deteccion.md) | Cuántos defectos sembrados se detectan, por familia: la medida que distingue mejorar de cambiar de disfraz |
| [protocolo-de-verificacion.md](protocolo-de-verificacion.md) | Cómo se verifica acá: el contrato antes de implementar, los dos auditores y cuándo interviene cada uno |
| [orden-del-soundcheck.md](orden-del-soundcheck.md) | En qué orden el recorrido guiado lleva a la banda, y de qué fuentes sale ese orden |
| [ack-policy.md](ack-policy.md) | Cómo se da por aplicada una escritura. El mecanismo está elegido y medido: segunda conexión testigo, ADR-024 |
| [protocol-spec.md](protocol-spec.md) | El protocolo de la Ui24R medido contra el aparato: verbos, tramas, medidores, curvas |
