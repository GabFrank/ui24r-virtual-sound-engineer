# Auditoría del flujo de desarrollo — 2026-09-21

## Resultado

El retraso observado tiene causas concretas en el flujo: carga obligatoria de
historia, estado repetido que se contradice, verificación completa para cualquier
edición y pruebas que dependen del texto del código. La corrección concentra el
arranque en un estado breve, selecciona comprobaciones por impacto y prueba los
servicios reales en el recorrido de monitores que tenía el caso reproducible.

Se conservaron las protecciones de hardware y los permisos del producto. La
decisión pendiente de frecuencia/Q de la pieza 2 sigue siendo del usuario; esta
auditoría no eligió umbrales ni habilitó escrituras.

**Rama publicada:** `fix/flujo-de-desarrollo-ligero`, creada desde `8b4de18`.
Se consultaron las ramas remotas; era la punta más reciente al iniciar la
corrección. Incluye los tres commits posteriores a la primera inspección:
diagnóstico del banco, medición completa de EQ y nuevo cierre.

**Publicación completada el 2026-09-21:** al principio, el push HTTPS no encontró
credenciales y la API respondió `403 Resource not accessible by integration`.
La lista de repositorios habilitados en la instalación no incluía este proyecto.
El usuario lo agregó; se comprobó el acceso y se publicaron los tres commits
mediante el conector. No se abrió PR ni se integró a la rama de origen.

El conector crea nuevos metadatos de commit. Se conservaron los mensajes, el
orden y la base; cada árbol devuelto coincide con su árbol local. Tras descargar
la rama publicada, `git diff --exit-code` entre ambas puntas terminó sin cambios.

| Commit del respaldo local | Commit publicado | Contenido |
|---|---|---|
| `1ec5b8a` | `a3f171b` | Arranque y verificación por impacto |
| `dab1d27` | `a280aab` | Pruebas sobre servicios reales |
| `f9cd164` | `e8ca255` | Informe y entrega inicial |

El paquete anterior con bundle, parche e informe conserva el corte previo a la
publicación. No hay que aplicarlo sobre esta rama: los cambios ya están presentes.
Este ajuste de publicación sólo cambia el informe y el estado; corresponde
comprobar documentación, sin repetir las suites de código sobre árboles iguales.

## Qué se inspeccionó y cómo

- Documentos de entrada, ambas skills, referencias, cierres, contratos, reglas
  de contribución, protocolo de auditoría, scripts y workflows de CI/publicación.
- Historia reciente: en el corte original, 62 commits no merge entre el 17 y el
  20 de septiembre; 21 modificaban sólo Markdown, 17 tocaban skills y 20 cierres.
  Son categorías solapadas, no una medición de tiempo perdido.
- Recorrido de monitores y servicios de escucha, mediciones y diario; sus
  pruebas y comprobaciones de fuente. No se auditó de nuevo todo el DSP ni todo
  el Safety Engine como algoritmos de producto.
- Ejecuciones locales en Linux. Primera medición de ocho grupos sobre `09b0cbd`:
  148,778 segundos, instalación excluida, 9.125 líneas de salida. DSP y audio
  representaban aproximadamente dos tercios. Esto no mide la latencia de la Mac
  del usuario ni el tiempo total de una sesión de agente.
- Tras actualizar a `8b4de18`, la base pasó verificación; las correcciones se
  volvieron a verificar. La ejecución completa final de código con Node 22.23.2
  pasó los nueve grupos en 144,61 segundos de suma de etapas. No se atribuye esa
  pequeña diferencia a una aceleración de las suites: la mejora principal es
  **no ejecutar las que no corresponden** y no cargar su salida completa.

## Hallazgos y correcciones

| Prioridad | Hallazgo comprobado | Corrección aplicada |
|---|---|---|
| Alta | Las skills y los cierres mezclaban reglas permanentes con el estado de cada día. El cierre más nuevo heredaba los anteriores. | `AGENTS.md` y `docs/estado-actual.md` como entrada; cierres históricos sin herencia operativa; skills breves y hardware bajo demanda. |
| Alta | El arranque del último prompt exigía 13.738 palabras sumando prompt, ambas skills, cierre y hoja de ruta, antes de seguir sus referencias. | La entrada nueva ronda 1.650 palabras. Una prueba de arranque con contexto nuevo identificó 1b y su decisión sin reconstruir los cierres. |
| Alta | Estado contradictorio: referencias con techo de medidor obsoleto y una latencia puntual presentada como cifra general; skills y comentarios decían que monitores no tenía llamador o no subía. | Se retiraron cifras duplicadas de la referencia y se enlazaron las fuentes. Se corrigieron los comentarios contrastando llamadas reales; no se cambió el comportamiento de la pieza 1. |
| Alta | `verificar` repetía DSP y audio para una corrección editorial. | `verificar:cambio` selecciona por archivos; cambios de contrato, compartidos, herramientas o desconocidos conservan completa. Prosa ejecuta documentación; app ejecuta los grupos relevantes. |
| Alta | Los tests de cancelación copiaban la lógica y comprobaban expresiones exactas. Agregar llaves a una condición equivalente los rompía. | Se sustituyó ese archivo por 13 casos que importan clases de producción. Hay reloj controlado, SQLite real y prueba de reapertura del diario. |
| Media | La imposibilidad de importar decoradores con el runner de funciones puras se trataba como imposibilidad de probar servicios localmente. | Runner de integración con esbuild y Angular, disponible en `npm test`, sin requerir tablet. El transporte y el ejecutor controlado no certifican hardware. |
| Media | La CI ordinaria omitía `test:audio` y `test:guardas`, pese a describirse como equivalente a la comprobación local. | CI usa `npm run verificar`; conserva logs como artefactos y cancela ejecuciones sustituidas de la misma referencia. Publicación mantiene su flujo propio. |
| Media | Los resultados inundaban el contexto con miles de líneas. | Resumen por grupo con tiempos; logs íntegros y resultados JSON en `.artifacts`, fuera de Git. Un error conserva su código y muestra el final del log. |
| Media | La regla decía que rutas medidas revisaba todos los Markdown; el script sólo recorría README y Markdown directo de docs. | Alcance operativo explícito, incluyendo skills, estado, AGENTS y guías. Se preserva la historia fechada; una lectura imposible ya no se omite silenciosamente. |
| Media | La regla de trabajo previo pedía una declaración absoluta de ausencia, en conflicto con «no encontrado no significa inexistente». | Se exige sección de trabajo previo y descripción de fuentes/alcance; se elimina la frase absoluta como sustituto. El validador comprueba presencia, no calidad. |
| Media | El protocolo A/B completo se imponía a cualquier compromiso observable. | Revisión proporcional: diff para prosa, comportamiento para software, expectativas independientes y evidencia para riesgo alto. La revisión humana de cambios sensibles se conserva. |
| Media | `verificar:commits` terminaba con éxito si no existía `origin/main`. | Base explícita opcional y error visible si no puede resolverse; no se confunde «sin comprobar» con verde. No se reescribió historia ajena. |

## Pruebas que distinguen mejoras reales

| Comprobación | Resultado | Qué sostiene |
|---|---|---|
| Arranque por un agente sin historia previa | Identificó 1b y la necesidad de decisión; encontró contradicciones temporales entre scripts e instrucciones que se corrigieron | La entrada basta para orientarse en esta tarea; no demuestra eficacia universal |
| Cambio preparado en índice y revertido sólo en el archivo local | Detectado tras corregir el selector; el test falla al restaurar el defecto en copia aislada | La selección no pierde lo que entraría en el commit |
| Control de integración sobre producción | 13 casos pasan | Los recorridos descritos en la guía de integración se ejecutan |
| Agregar llaves a la condición de exclusión sin cambiar su significado | 13 casos pasan | Se eliminó el falso positivo reproducido en el test antiguo |
| Quitar el corte de cancelación posterior a la captura, en otro worktree | Un caso falla y los restantes pasan | La prueba observa el defecto de producción, no una copia desconectada |
| Falla de una suite dentro del runner | Conserva salida completa, código de error y marca ejecución parcial | El resumen no oculta un fallo ni presenta ejecución incompleta como completa |
| Suite completa en Node 22.23.2 | Nueve grupos con código 0 | Compilación/tipos y suites locales que se enumeran abajo |

La segunda revisión independiente, sobre integración, no terminó por límite del
servicio de agentes. No se cuenta como aprobada. Ese cambio recibió revisión del
autor, suite completa y pruebas discriminantes en un árbol aislado. La revisión
independiente del arranque y selector sí concluyó y su hallazgo fue reproducido.

## Comandos y evidencia de la entrega

```bash
npm run verificar
npm run test:integration --workspace mobile
npm run test:flujo
npm run verificar:cambio -- --base <commit-inicial> --plan
npm run verificar:cambio -- --base <commit-inicial>
npm run verificar:commits -- --base 8b4de18
```

En el cierre editorial, `verificar:cambio` seleccionó sólo documentación y
terminó en 4,32 segundos de etapa, frente a los 144,61 de completa. Es una
observación de esta máquina, no una promesa de tiempo en otras sesiones.

La verificación completa ejecuta documentación, plantillas, límites, lint/build,
unitarios e integración, DSP, audio, guardas y flujo. Las pruebas de flujo cubren
selección, rangos, índice, archivos nuevos, traslados, base inexistente y fallos.
Después de la corrida completa sólo se completaron datos de las fixtures —se
repitió integración— y se cerró documentación con su comprobación por impacto.

El paquete adjunto conserva los resúmenes y logs originales de verificación,
contexto antes/después y experimentos aislados. Los archivos de evidencia de
audio del repositorio no se modificaron. Las cifras de este informe describen
esta auditoría, no son nuevas constantes que mantener en cada sesión.

## Límites y siguiente paso

No se ejecutaron Android, plugin Capacitor, DOM de la pantalla ni pruebas contra
consola o tablet. No se habilitaron escrituras desde navegador ni se sustituyó
el diario de producción por memoria. No se declara que las guardas de prosa
entiendan toda la documentación; su alcance sigue siendo limitado y explícito.
La CI modificada no corrió en GitHub, porque no se pudo publicar la rama.

Los tests nuevos cubren los servicios y métodos enumerados en
[la guía de integración](../../desarrollo/pruebas-de-integracion.md), no todo el
producto de extremo a extremo. Los validadores de fuente de otras rutas quedan
como protección parcial hasta que una prueba real sustituya su cobertura.

Publicar estos commits requiere una conexión con escritura autorizada, o aplicar
el bundle/parche desde el equipo que ya puede hacer push. No hace falta repetir
la auditoría completa para publicar exactamente estos commits.

La siguiente tarea del producto es **1b: un kind, una unidad**. Las doce hojas
del EQ están medidas; falta decidir qué movimientos se permiten y con qué
unidad. Leer el estado, los apartados pertinentes del trabajo previo y presentar
opciones al usuario antes de la ADR y la implementación. El
[template de continuidad](../../templates/prompt-continuidad.md) evita arrastrar
inventarios, comandos de equipo y cierres que no intervienen en esa decisión.

## Cómo evaluar el flujo en las próximas sesiones

Durante unas pocas tareas, observar tiempo hasta el primer cambio útil, palabras
de contexto inicial, duración de comprobaciones elegidas y fallos escapados.
No agregar un formulario por tarea. Si aparece una omisión, corregir el alcance
con un caso reproducible; no volver a imponer toda la historia y toda la suite
por defecto. Una reducción de lectura no prueba por sí sola mayor corrección.
