# Ui24R Virtual Sound Engineer — Plan final

**Fecha:** 2026-09-07 · **Entrada:** Plan Maestro v1.1 · **Salida:** backlog técnico ejecutable v1.1 (126 ítems) auditado dos veces.

## Cómo se llegó hasta acá

1. **Dos auditorías independientes del Plan Maestro.** Una técnica (protocolo Ui24R verificado contra el código de `soundcraft-ui-connection` v7.0.3, Android/USB contra AOSP y Oboe, Focusrite y HARMAN): 34 hallazgos. Otra de producto, proceso, seguridad operativa y UX: 46 hallazgos y 27 invariantes.
2. **Integración:** 18 decisiones de arquitectura (ADR-01…18) que resuelven las divergencias entre auditores y gobiernan todo lo demás.
3. **Backlog v1.0:** 15 épicas, 108 ítems ordenados, criterios de aceptación, dependencias.
4. **Dos auditorías independientes del backlog.** Una estructural (grafo verificado con script): 19 hallazgos. Otra de calidad, números y riesgo: 51 hallazgos.
5. **Backlog v1.1:** 126 ítems, 33 invariantes, planes B, re-estimación.

## Los cinco cambios que más mueven el proyecto

**1. El motor de audio va nativo desde el primer día.** El plan proponía WebAudio dentro del WebView para el motor básico. En Android eso no permite elegir el dispositivo USB ni obtener dos entradas independientes sin procesamiento: el pipeline mezcla a mono y aplica ganancia automática. Todas las métricas de nivel y ruido quedarían contaminadas. Se sustituye por un plugin Capacitor propio en Kotlin, con el procesamiento en el lado nativo y solo métricas cruzando el puente.

**2. El generador de señal deja de ser el tablet y pasa a ser la consola.** El plan enviaba barridos desde Android por la salida de la Scarlett hacia un canal de retorno de la Ui24R. Android enruta notificaciones y audio de otras apps a la salida USB y la aplicación no puede impedirlo; si la red cae con el canal abierto, tampoco puede cerrarlo. Se usa el reproductor interno de la Ui24R con los archivos en el pendrive. Desaparece la clase entera de riesgo, y el paro de emergencia pasa a ser un comando local.

**3. Primero se entrega algo sin la interfaz de audio.** Existe un producto usable solo con la consola y el tablet: telemetría por canal, ajuste de ganancia con los medidores de la propia mesa, instantáneas, registro de cambios, monitor de show y paro de emergencia. Valida el 60 % de la fase 0 sin riesgo acústico y entrega valor en unas nueve semanas, en lugar de esperar meses a que se certifique el hardware USB.

**4. El orden de entrega se alinea con el orden de uso.** El flujo del producto es sala, luego canales, luego mezcla; el plan entregaba canales, mezcla y sala. Durante dos versiones el usuario habría ecualizado canales sobre una sala sin corregir, justo lo que el propio plan prohíbe. La sala se parte en dos: observar (medir sin escribir) llega temprano, corregir llega después.

**5. Las reglas de seguridad pasan a ser tests.** Trece consignas del tipo "cambios pequeños" o "registrar todo" se convirtieron en 33 invariantes numéricas con su prueba, unitaria y sobre hardware. Ninguna versión que escriba en la consola se libera sin su parte de la suite en verde.

## Riesgos que quedan abiertos

| Riesgo | Cómo se acota |
|---|---|
| El escalado de los parámetros de ecualización y dinámica no está documentado; escribir un valor mal mapeado produce un cambio extremo en vivo | Spikes de captura de tráfico, tabla de conversión con test de ida y vuelta, y rechazo de todo valor fuera de tabla. Está fuera del camino crítico. |
| La tablet puede no certificar (cortes de audio, carga simultánea, USB) | Dos candidatas en la matriz antes de empezar, y una alternativa: conectar la consola directamente por USB al tablet, lo que eliminaría la interfaz externa. Spike de dos días. |
| El protocolo no confirma las escrituras ni identifica quién cambió un parámetro | Estado propio alimentado solo por los mensajes entrantes, correlación temporal para distinguir cambios propios de ajenos, y una política de confirmación por parámetro definida tras el primer spike. |
| Repetibilidad del soundcheck virtual | Spike específico antes de construir nada; si no hay posicionamiento por protocolo, se reproduce siempre desde el inicio y se alinea por correlación. |

## Números

| | |
|---|---|
| Ítems del backlog | 126 |
| Esfuerzo | 289–404 días-persona (medio ≈ 345) |
| De ellos, trabajo humano con hardware | 92 días, no paralelizable |
| Primer entregable usable | 9–11 semanas |
| Asistente de canal completo | 5–6 meses |
| Producto con aplicación asistida y lazo cerrado | 10–12 meses |
| Invariantes de seguridad | 33, todas con test |
| Gates | 5, con criterios bloqueantes y protocolo de fallo |

## Qué se puede empezar hoy

- **Sin nada de hardware:** repositorio, decisiones de arquitectura, charters de spikes, matrices, invariantes, validación del procesamiento de señal en escritorio, proyecto Angular, persistencia y modelo de dominio.
- **Con la consola y el router:** el bloque completo de spikes de protocolo y el primer producto usable.
- **Lo primero que hay que comprar o confirmar:** un pendrive rápido en formato FAT32 de 32 GB o menos, un concentrador USB con alimentación, y decidir qué salida auxiliar de la consola se reserva para análisis.

## Documentos

| Archivo | Contenido |
|---|---|
| `00-plan-final.md` | Este documento |
| `01-auditoria-integrada.md` | Conclusiones integradas de las dos auditorías del plan, 18 decisiones de arquitectura, supuestos a confirmar |
| `02-backlog.md` | Backlog v1.1: 15 épicas, historias con criterios de aceptación y dependencias |
| `03-orden-implementacion.md` | Orden exacto de 126 ítems, esfuerzo, camino crítico, planes B |
| `04-invariantes-seguridad.md` | 33 invariantes con su test y la versión desde la que aplican |
| `anexo-A…D` | Las cuatro auditorías completas |
| `v1.0/` | Backlog previo a la segunda ronda de auditoría, para trazabilidad |
