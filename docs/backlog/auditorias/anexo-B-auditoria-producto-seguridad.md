# Auditoría B — Producto, Alcance, Proceso, Seguridad Operativa y UX
## Objeto: "Plan Maestro v1.1 — Ui24R Virtual Sound Engineer"

**Auditor:** independiente (lente producto / planificación / seguridad operativa / UX)
**Fecha:** 2026-09-07
**Fuera de alcance de esta auditoría:** feasibilidad técnica de protocolo, DSP y Android/USB (cubierta por la auditoría A en paralelo). Cuando un supuesto técnico condiciona una decisión de producto, se lo lista como supuesto a validar, no se lo evalúa.

Convención de referencias: `§N` = sección N del plan. Severidad: **CRÍTICO** (bloquea un backlog ejecutable o pone en riesgo el show/PA/oídos), **ALTO** (distorsiona el orden de entrega de valor o deja un hueco de seguridad), **MEDIO** (ambigüedad que genera retrabajo), **BAJO** (mejora).

---

## 0. Resumen ejecutivo

1. El plan es sólido en principios (measurement-first, safety-by-design, Parameter Ownership, transacciones) pero **no es todavía un plan ejecutable**: la mayoría de sus reglas de seguridad son slogans sin criterio de aceptación, los spikes de Fase 0 no tienen PASS medible y no hay estimaciones, roles, ni tiempos.
2. **Contradicción central de secuenciación:** el workflow del producto (§56, §121) arranca por Room → Channel → Mix, pero la entrega construye Channel → Virtual Soundcheck → Mix → Room. El usuario objetivo recibirá durante 3 MVPs una herramienta que no sigue su propio flujo de trabajo.
3. **El gate "todo PASS antes de MVP" (§128) es desproporcionado:** exige Virtual Soundcheck, Signal Return y Full Duplex antes de un MVP1 que no usa ninguno de los tres. Propongo gates escalonados por MVP.
4. **Existe un MVP0 sin hardware de audio** (solo Ui24R + tablet: telemetría, gain staging por medidores de consola, snapshots, log, E-Stop) que el plan no ve y que valida el 60 % de Fase 0 con riesgo cero para el PA.
5. **MVP1 pide capturar ECM8000 (§101.3) pero ninguna recomendación de MVP1 usa el micrófono** (§27: gain no usa FOH). Es hardware y riesgo (phantom, cableado) sin valor entregado.
6. **Huecos de seguridad operativa concretos:** phantom global de la Scarlett vs. entrada de línea de la Ui24R, nivel máximo/rampa del sweep, crash de la app a mitad de transacción, recall manual de snapshot con transacciones pendientes, E-Stop que depende de la red para cerrar el Analysis Return, watchdog del Analysis Return.
7. **Emergency Stop está mal definido:** "bloquear writes" y "permitir rollback" son contradictorios sin una lista blanca; y sus acciones remotas fallan justamente en el estado (DISCONNECTED) donde más se necesitan.
8. **Modelo de dominio incompleto:** no existe la entidad `Channel` (mapeo input Ui24R ↔ músico ↔ perfil ↔ rol), ni `Finding/Diagnosis`, ni `VirtualSoundcheckTake`, ni `MixCandidate`, ni `PAProfile`, ni `Snapshot`; `Recommendation`, `ChangeTransaction` y `Measurement` no se referencian entre sí por ID.
9. **UX para operador solo en escenario no está diseñada:** no hay wizard de setup/patcheo, ni calibración SPL ni de ganancia analógica de Scarlett, ni flujo de recuperación tras desconexión, ni modo Show, ni consideración de una mano / distancia / pantalla oscura / prompts audibles para medir posiciones caminando.
10. **Proceso:** 10 documentos antes de codificar (§126) contradice a la propia Fase 0 (los spikes son código). Mínimo real: charters de spike con PASS, matriz de capacidades, invariantes de seguridad y ADRs. El documento además termina truncado (§131).

---

## 1. Hallazgos por sección

### 1.1 Alcance y MVP (§4, §56, §89–§105, §120, §121)

**B-01 — CRÍTICO — Orden de construcción invertido respecto al orden de uso.**
Ref: §56, §121 vs §91–§94, §101–§103.
El workflow final (§121) y el de §56 es: Room → Channel → Record → Mix → Full Band → AFS2 → Show Ready. Los MVPs entregan Channel (MVP1) → Mix (MVP2) → Room (MVP3). Hasta MVP3, el usuario ecualiza canales y balancea faders sobre un PA sin corregir, y el plan mismo (§30, §117) dice que eso induce a corregir en el canal problemas que son de sala. Es decir, MVP1 y MVP2 operan en contra del principio "Diagnosis before Correction".
Además, §120 pone "Room measurement" en P1 (junto con Channel) pero §103 lo deja en MVP3.
Recomendación: separar Room en **Room‑Observe** (medir y mostrar respuesta/consistencia con ruido rosa, sin generador propio ni Analysis Return, sin escribir en consola) y **Room‑Correct** (generador + EQ de salida). Room‑Observe entra junto a Channel en el primer MVP con audio; Room‑Correct queda donde está. Ver propuesta de re‑secuenciación (§6).

**B-02 — CRÍTICO — MVP1 exige hardware que no aporta valor en MVP1.**
Ref: §101 ítems 3 y 4 vs §27–§28.
El Gain Assistant "no utilizará el volumen FOH como criterio primario" y analiza peak/headroom/ruido/clipping de la señal directa. Sin embargo MVP1 exige "capturar ECM8000". Ninguna de las 13 capacidades de MVP1 consume la medición acústica. Consecuencia: se arrastra al MVP1 el phantom, el cableado de micrófono, la calibración y los riesgos de §23–§24 sin entregar una recomendación adicional.
Recomendación: MVP1 = Ui24R + Scarlett Input 2 (Direct Reference) únicamente. El micrófono entra con Room‑Observe.

**B-03 — ALTO — Existe un MVP0 sin Scarlett que el plan no contempla.**
Ref: §5.1, §79, §80, §86, §87, §101.
La Ui24R expone por red medidores (peak/RMS/gate/comp reduction), gains, faders, mutes, snapshots. Con eso se puede entregar: telemetría por canal, gain staging por medidor de consola (peak/headroom/clip count durante una ventana de 15–20 s), snapshot automático, Change Log, Emergency Stop (parcial) y Session. Esto valida P0.1, P0.2, P0.8 y P0.9 con **cero riesgo acústico** y sin depender de la certificación de hardware USB (el mayor riesgo técnico del proyecto).
Recomendación: definir **MVP0 "Console Telemetry & Gain"** como primer entregable usable. Sus limitaciones (sin FFT, sin ruido de fondo real) se documentan.

**B-04 — ALTO — Virtual Soundcheck como prerequisito de Mix (Fase 4 antes de Fase 5) sobredimensiona el MVP2.**
Ref: §38–§40, §92, §102.1, §128.
Virtual Soundcheck exige grabación multipista, repatching de todos los inputs a playback y que la banda entregue un take completo. Para un músico‑operador solo, el costo en tiempo de soundcheck es alto y la dependencia técnica (§40 "se deberá investigar") aún está abierta. "Build Your Mix" incremental (§36–§37) y "Full Band Test" (§41) funcionan en vivo sin Virtual Soundcheck y ya entregan valor (recomendaciones de fader por rol).
Recomendación: MVP2a = Mix Observe/Suggest en vivo (Build Your Mix + Full Band + roles). MVP2b = Virtual Soundcheck A/B. La afirmación "A/B científicamente comparable" (§38) es el objetivo de MVP2b, no la condición de MVP2a.

**B-05 — ALTO — Show Monitor y Show Ready Dashboard no están en ninguna fase ni MVP.**
Ref: §77, §122, §123, §124.
Ambos aparecen en la arquitectura de dominio y en el workflow, pero no en §89–§104. Show Monitor es de solo lectura (bajo riesgo, alto valor para el usuario objetivo que está tocando y no mira la consola).
Recomendación: asignar Show Monitor (alertas: clipping, caída de nivel de lead vocal, master cerca de límite, red inestable) al MVP inmediatamente posterior a MVP0/MVP1. Show Ready Dashboard se entrega incrementalmente con cada asistente (cada uno aporta su score).

**B-06 — MEDIO — Transacciones aparecen en Fase 1 y otra vez en MVP4.**
Ref: §89 ("Transactions", "Emergency Stop") vs §104.1 ("agregar transactions").
Debe aclararse: Fase 1 implementa el *modelo* de transacción y el log; MVP4 habilita la *aplicación* de transacciones a la consola. Tal como está, dos equipos lo interpretarán distinto.

**B-07 — MEDIO — Tres niveles de "assisted/automation" incoherentes.**
Ref: §29 (Channel SUGGEST → ASSISTED), §95 (Fase 7 Assisted Apply general), §96 (Fase 8 automatización solo Room), §74 (solo HIGH elegible), §119 (OBSERVE→SUGGEST→ASSISTED→CONTROLLED AUTO).
No se define qué parámetros pasan a cada nivel y cuándo. Nota de producto: §96 elige Room (EQ de salida) como primer dominio de automatización, pero es el de **mayor radio de impacto** (afecta a todo el PA). El cambio de menor radio y más verificable es *un solo gain o fader de un canal*.
Recomendación: matriz Parámetro × Nivel de autonomía × MVP (ver §6, Rec‑07).

**B-08 — MEDIO — "AFS2 Ring‑Out" es un paso del workflow sin dueño ni definición.**
Ref: §56, §121.
No hay fase que lo implemente, no está en Parameter Ownership y el ring‑out implica subir micrófonos hasta el borde del feedback: es un procedimiento que la app **no debe automatizar**. Debe quedar como paso manual con checklist y, si la Capability Matrix lo permite, lectura del estado de AFS2.

**B-09 — BAJO — §105 excluye "soporte múltiples mixers" mientras §10 exige MixerAbstraction.**
No es contradicción, pero conviene explicitar: la abstracción es una decisión de arquitectura (costo bajo), el soporte es alcance (excluido). Evita que alguien "optimice" borrando la abstracción.

**B-10 — BAJO — El documento termina truncado.**
Ref: §131 ("La siguiente actividad recomendada es:"). Falta el cierre y, con él, la instrucción de qué hacer a continuación.

### 1.2 Fase 0 / Spikes P0.1–P0.10 (§78–§88, §128)

**B-11 — CRÍTICO — Ningún spike tiene criterio de PASS medible.**
Ref: §79–§88.
"Validar conexión", "validar estabilidad", "mínimo suficiente para detectar estabilidad térmica" no son gates. Sin números, el PASS es opinión. Propuesta de criterios mínimos (a ajustar por la auditoría técnica):

| Spike | Criterio de PASS propuesto |
|---|---|
| P0.1 Connectivity | 20 ciclos de desconexión forzada (apagar router / cambiar IP) → reconexión automática < 10 s en 20/20; 0 writes emitidos en estado ≠ CONNECTED; estado completo re‑leído tras cada reconnect. |
| P0.2 Capability Matrix | 100 % de las filas de la tabla §9 con las 4 columnas completas y evidencia (log). Para MVP0/1 basta el subconjunto: gain, fader, mute, HPF, PEQ, comp, gate, snapshot, meters. |
| P0.3 Android+Scarlett | Tablet candidata: 4 h continuas capturando 2 inputs @ 48 kHz con tablet **cargando** vía hub; 0 dropouts detectados por contador de xruns; temperatura estable. Phantom conmutable y detectado. |
| P0.4 Full duplex | 60 min reproduciendo sweep/pink y capturando 2 inputs; drift entre out e in medido y acotado (< 1 sample/min o documentado). |
| P0.5 Analysis Bus | Diferencia entre nivel esperado y medido en Input 2 < ±0,5 dB tras calibración; aislamiento: con el canal en mute en el bus, el resto de canales no aparece por encima de −80 dBFS. |
| P0.6 Signal Return | Con Analysis Return muteado, sweep a 0 dBFS produce < −90 dBFS en FOH mic; apertura solo dentro de ventana de generación; cierre confirmado por lectura de estado < 500 ms tras fin; ensayo de loop (Direct Monitor activado a propósito) detectado y abortado. |
| P0.7 Virtual Soundcheck | 3 playbacks del mismo take → diferencia de RMS por banda en Input 1 < ±0,5 dB (sin cambios de mezcla). Nº de pasos manuales necesarios para pasar a modo playback documentado (≤ N a definir). |
| P0.8 Snapshot/Transactions | Guardar/recuperar 50 veces; ningún snapshot manual alterado (hash antes/después); rollback granular restaura valor exacto en 100 % de 100 writes. |
| P0.9 Concurrency | 100 modificaciones concurrentes desde web Ui24R durante transacciones; 100 % detectadas como CONFLICT, 0 sobrescrituras. |
| P0.10 DSP | RMS ±0,1 dB, peak ±0,1 dB, FFT ±0,5 dB por banda 1/3 oct respecto a herramienta de referencia sobre el mismo archivo. |

**B-12 — ALTO — Gates faltantes.**
Ref: §14, §15–§17, §19, §20, §65.
- **Decisión de motor de audio básico** (WebAudio/AudioWorklet en WebView vs nativo): §14 la deja abierta y condiciona toda la Fase 2. Debe ser un spike con PASS (latencia y estabilidad de captura dual en WebView).
- **Certificación de tablet** como gate formal (§15–§16 lo describen como documento, no como gate). Carga simultánea + host USB es criterio explícito (§17).
- **Android lifecycle**: pantalla apagada, app en background, DND activo, llamada entrante → ¿se mantiene la captura y la conexión? Solo aparece en la matriz de fallos (§110), no en Fase 0. Para un show de 3 h es P0.
- **Loopback calibration** (§19) no es gate. Sin ella, P0.10 "response" y todo Room‑Correct son inciertos.
- **Calibración de ganancia analógica de Scarlett**: los potenciómetros de la 2i2 no son legibles por software. Sin un procedimiento de calibración (tono de referencia a dBFS conocido desde la Ui24R por el Analysis Bus), ningún nivel medido en Input 2 es comparable entre sesiones. Es un gate de producto, no solo técnico.
- **Firmware de Ui24R**: no se fija versión objetivo ni política ante actualización.

**B-13 — ALTO — "Todo PASS antes de MVP" (§128) frena valor y es contradictorio con §101.**
Ref: §128 vs §101.
De los 11 ítems de §128, MVP1 (tal como está) necesita 7 y MVP0 necesita 4. Exigir Virtual Soundcheck PASS para empezar a codificar el Gain Assistant puede retrasar meses el primer valor.
Recomendación (gates escalonados):

| Gate | Spikes requeridos | Desbloquea |
|---|---|---|
| **G‑A** | P0.1, P0.2 (subconjunto), P0.8, P0.9 | MVP0 Console Telemetry & Gain; Show Monitor read‑only |
| **G‑B** | G‑A + P0.3, P0.5, P0.10 (RMS/peak/FFT), tablet certificada, calibración ganancia Scarlett, lifecycle Android | MVP1 Channel (Direct Reference) |
| **G‑C** | G‑B + P0.4, P0.6, loopback, mic profile, nivel máx. de sweep | Room‑Observe (pink desde fuente externa) y luego Room‑Correct |
| **G‑D** | G‑B + P0.7 | Mix A/B (Virtual Soundcheck) |
| **G‑E** | todos + Safety acceptance §111 convertida a tests | Assisted Apply / Closed loop |

### 1.3 Safety Engine y reglas (§22–§24, §57–§64, §111, §115–§119)

**B-14 — CRÍTICO — Las reglas de §58 y §111 no son verificables.**
"Cambios pequeños", "no grandes movimientos de master", "límite de parámetros simultáneos", "registrar todo" no tienen número ni test. Ver tabla completa en §2 de este informe.

**B-15 — CRÍTICO — Phantom global de la Scarlett vs. entrada de línea de la Ui24R.**
Ref: §5.2, §5.3, §15, §58 ("no phantom automático").
La Scarlett 2i2 aplica +48 V a **ambas** entradas con un único botón. El ECM8000 (Input 1) lo necesita; el Input 2 recibe una salida de línea balanceada de la Ui24R. Con un cable XLR‑XLR en Input 2, el phantom llega a la salida AUX de la consola. Si el usuario usa un adaptador o un cable desbalanceado, hay riesgo de daño o de ruido/offset. El plan trata phantom solo como "no automático" (y de hecho la app no puede controlarlo: es un botón físico).
Recomendación: regla de cableado obligatoria en el wizard de setup: **Input 2 siempre por TRS 1/4" (jack), nunca XLR**, con confirmación explícita y foto/ilustración. El plan debe dejar de listar "no phantom automático" como regla de software y convertirlo en regla de hardware/UX + verificación (el wizard pregunta "¿Input 2 está conectado por jack TRS?").

**B-16 — CRÍTICO — Nivel máximo, rampa y abortos del generador no están definidos.**
Ref: §21, §22, §84.
No existe: nivel de arranque, rampa, tope de nivel digital, tope de SPL (si hay calibración) o proxy (clipping en Input 1), duración máxima, ni qué pasa si la Scarlett se desconecta con el Analysis Return abierto (el generador se detiene solo, pero el mute en la consola es remoto). Riesgo real: daño a drivers de PA y a la audición del operador que está en el escenario.
Recomendación: ver reglas S‑12 a S‑16 en la tabla §2.

**B-17 — CRÍTICO — Emergency Stop mal definido y dependiente de red.**
Ref: §63, §64.
- "Bloquear writes" + "permitir rollback" es contradictorio salvo lista blanca: tras E‑Stop, únicamente están permitidos writes de tipo `ROLLBACK` y `MUTE Analysis Return`.
- Dos de sus seis acciones ("cerrar Analysis Return", "permitir rollback") requieren conexión; en DISCONNECTED no ocurren. Debe existir separación **local‑first**: (1) acciones locales garantizadas < 200 ms (detener generador, silenciar salida Scarlett a −∞, cancelar automation, bloquear cola de writes); (2) acciones remotas con reintento y ack (mutear Analysis Return) y alerta visual/sonora si no hay ack en 2 s.
- No está definido cómo se **sale** del E‑Stop (rearme explícito, con re‑lectura de estado completo).
- No se define su lugar en pantalla (tamaño, siempre visible incluso dentro de wizards y modales), ni si funciona con la pantalla bloqueada (botón físico de volumen como atajo, por ejemplo).

**B-18 — ALTO — Crash de la app a mitad de una transacción.**
Ref: §62, §110.
No hay regla. Debe existir un **journal de transacciones persistido antes de cada write** (write‑ahead), y al reiniciar: detectar transacciones en estado APPLYING, re‑leer el estado real de la consola, mostrar "Transacción interrumpida: parámetros X, Y quedaron en valor Z (esperado W)" y ofrecer rollback/aceptar. Nunca reaplicar automáticamente.

**B-19 — ALTO — Recall manual de snapshot en la consola con transacciones pendientes.**
Ref: §59–§61, §110.
Si el usuario (o un compañero desde el teléfono) recupera un snapshot manual, cambian decenas de parámetros de golpe; el `expectedValue` de todas las transacciones pendientes queda inválido y el `rollbackState` apunta a un estado que ya no existe. El plan solo contempla conflictos parámetro a parámetro.
Recomendación: tratar un cambio masivo (> N parámetros en < 1 s, o evento de recall de snapshot si el protocolo lo expone) como **evento de invalidación global**: abortar todo, re‑leer, invalidar Measurements "before" y avisar al usuario. Asimismo, definir si el rollback de una transacción cuya base ya cambió está permitido (propuesta: no; solo rollback por snapshot con confirmación).

**B-20 — ALTO — Feedback/loop por Analysis Return: falta el watchdog y las condiciones de apertura.**
Ref: §22–§24, §84, §110.
El plan dice "muted by default" y "solo durante generación", pero no define: (a) precondiciones de apertura (canal identificado, estado de mute leído, send del Analysis Return hacia el Analysis Bus = −∞ verificado, sends a AUX de monitores = −∞ verificados, Direct Monitor confirmado off, nivel del PA confirmado por el usuario, cuenta regresiva); (b) **watchdog**: si el mute del Analysis Return cambia a "abierto" fuera de ventana de generación → re‑mute inmediato + alerta; (c) qué hacer si un tercero lo abre desde otro cliente.

**B-21 — ALTO — Mute, master, AUX de monitores y phantom no tienen regla explícita de "nunca tocar".**
Ref: §31, §58.
El músico‑operador depende de sus monitores (AUX). Un asistente que "ayuda" tocando un send de monitor puede dejarlo sin referencia en pleno show. El plan no lo prohíbe. Ver B‑27 y tabla §2 (S‑07..S‑10).

**B-22 — MEDIO — "Registrar todo" sin definición de qué, dónde, cuánto tiempo, y sin export.**
Ref: §58, §89 ("logging").
Debe definirse: contenido mínimo (comando raw enviado, ack, estado leído antes/después, usuario, origen), persistencia local (SQLite) con rotación, exportable como archivo para diagnóstico post‑show. Sin export, el soporte a distancia es imposible.

**B-23 — MEDIO — Atribución de `source` en VersionedParameterState (§60) probablemente no es posible.**
El enum (VirtualEngineer / Ui24RWeb / ExternalTablet / Unknown) supone que la consola informa qué cliente cambió un parámetro. Si el protocolo no lo hace (supuesto a validar por auditoría A), el dominio debe diseñarse para `source ∈ {SELF, EXTERNAL}` únicamente. No prometer en UI "cambiado desde el teléfono de X".

**B-24 — MEDIO — Grabación de interpretaciones (Virtual Soundcheck) sin política de datos.**
Ref: §39, §70.
Se graban tomas multipista de una banda. Falta: dónde viven (USB de la Ui24R vs tablet), retención, borrado, consentimiento de los integrantes, y si el archivo de sesión exportado incluye audio. Es un tema de producto, no técnico.

### 1.4 Entidades de dominio (§18, §26, §31, §34–§35, §60, §62, §67–§73)

**B-25 — CRÍTICO — No existe la entidad `Channel`.**
Ref: §25, §26, §33, §34, §67, §71.
Hay ChannelType (§25), ChannelProfile (§26), roles (§33), MixScene con "lead sources" (§34/§71) y BandProfile con "canales" (§67), pero ninguna entidad une **input físico de la Ui24R (índice) ↔ integrante ↔ instrumento ↔ ChannelProfile ↔ rol por defecto ↔ micrófono**. Sin ella no se puede persistir nada de lo demás. Propuesta: `ChannelAssignment { ui24rInputIndex, bandMemberId, instrument, channelProfileId, defaultRole, micModel, name(sync con consola) }` con clave por SoundSession y por defecto desde BandProfile.

**B-26 — ALTO — Rol duplicado entre ChannelProfile y MixScene.**
Ref: §26 ("rol; prioridad") vs §34/§71.
Un mismo canal tiene rol en el perfil (estático) y en la escena (dinámico). Definir: `ChannelProfile.defaultRole` es fallback; `MixScene.roles[channelId]` sobreescribe; el Mix Assistant lee siempre "rol efectivo = escena ?? default".

**B-27 — ALTO — Huecos en Parameter Ownership.**
Ref: §31.
Falta asignar (propuesta):

| Parámetro | Owner propuesto | Nota |
|---|---|---|
| AUX sends (monitores) | **USER‑ONLY** (read‑only para la app) | Crítico para músico‑operador |
| Analysis Bus sends / routing | **Measurement Engine (System)** | Único routing que la app escribe |
| Analysis Return: mute, fader, sends | **Safety Engine (System)** | Nadie más puede escribirlo |
| Master fader | **USER‑ONLY** en MVP; Room solo con cap ±1 dB y nunca > 0 dB en fases posteriores | |
| Mute de inputs / master | **USER‑ONLY** | Excepto Analysis Return |
| Phantom | **USER‑ONLY / hardware** | La app solo lee |
| Pan de salidas / matrices | Room Assistant | |
| Polaridad (input y output) | Input: Channel; Output: Room | |
| De‑esser | Channel Assistant | Está en la matriz §9 pero no en §31 |
| Output limiter | USER‑ONLY | Protección de PA: no automatizar |
| FX sends/returns, subgroups, VCA | Fuera de alcance; USER‑ONLY | Declararlo evita ambigüedad |
| AFS2 | Ui24R / USER‑ONLY | Coherente con §56 |
| Snapshots | Automation Engine (solo prefijo VSE_) | |
| Scarlett: ganancia analógica, 48 V, Direct Monitor | USER (hardware) | La app pide confirmación, no controla |

Además, §31 dice "puede generar observaciones sobre parámetros fuera de su dominio": debe existir un tipo de salida `Observation` (sin `proposedValue`) distinto de `Recommendation`.

**B-28 — ALTO — Measurement, Recommendation y ChangeTransaction no se enlazan por ID.**
Ref: §62, §72, §73.
`Recommendation.evidence` y `ChangeTransaction.measurementBefore/After` son campos libres. Deben ser referencias: `Recommendation.findingId`, `Recommendation.evidenceMeasurementIds[]`, `ChangeTransaction.recommendationIds[]`, `ChangeTransaction.measurementBeforeId / AfterId`, `Measurement.sessionId`, `Measurement.snapshotRef`. Sin esto, el "closed loop" y el aprendizaje (§99) no son reconstruibles.

**B-29 — ALTO — Falta la entidad `Finding` / `Diagnosis`.**
Ref: §47, §48, §117.
`consistencyScore` y `confidenceScore` se asignan a "cada problema", pero "problema" no es entidad. El principio Diagnosis‑before‑Correction (§117) implica: `Finding { bandHz, magnitude, positionsAffected, consistency, confidence }` → `Hypotheses[] { cause ∈ {CHANNEL, ROOM, PA, SUB, PLACEMENT}, likelihood }` → `Recommendation`. Sin esta cadena, la explicación de §3 ("la evidencia indica que el problema pertenece al sistema/sala") no se puede generar de forma determinística.

**B-30 — ALTO — Virtual Soundcheck no tiene entidad; tampoco "Mix A/B".**
Ref: §38–§41, §70.
Faltan `VirtualSoundcheckTake { location(USB Ui24R / tablet), fileRef, channelMap, sampleRate, duration, checksum, recordedAt, snapshotRef }` y `MixCandidate { label(A/B/C), parameterSet (faders/EQ relevantes), measurementIds[], score }`. También quién persiste el take: la Ui24R graba en su USB; la app solo tiene metadata. Debe decirse.

**B-31 — MEDIO — `Measurement` (§72) carece de campos que el resto del plan exige.**
Faltan: `referenceMode` (§8), `paComponent` (LEFT/RIGHT/SUB/FULL, §49), `channelId` (para Double Reference, §30), `sessionId`, `loopbackCalibrationId` (§19), `scarlettGainCalibrationId` (nuevo), `sceneId` (§34), `signalType` (sweep/pink/performance), `buildState` (§36).

**B-32 — MEDIO — Faltan `PAProfile` y `Snapshot`.**
Ref: §51 ("respetar rango útil del PA"), §61, §69.
Room EQ necesita el rango útil del PA (y del sub, crossover): `PAProfile { tops, subs, usableRange, crossoverHz, processorExterno? }` dentro de VenueProfile. `Snapshot` de lado app: `{ consoleName, isVSEAuto, createdAt, transactionId?, verifiedExists }` y política de retención (máximo N auto‑snapshots; limpieza solo de prefijo VSE_).

**B-33 — MEDIO — Scores (§122) sin definición.**
"ROOM 87/100", "MIX 91/100" no tienen fórmula ni entidad. Un score sin definición es un número que nadie puede testear ni explicar al usuario.

**B-34 — BAJO — `SoundSession` (§70) sin ciclo de vida.**
Estados (CREATED, SETUP, CALIBRATING, SOUNDCHECK, SHOW, CLOSED), reanudación tras crash, y qué sesión está "activa" cuando hay reconexión.

### 1.5 UX / workflows (§28, §46, §63, §64, §121–§123)

**B-35 — CRÍTICO — Falta wizard de onboarding/patcheo de hardware.**
Ref: §5, §7, §22, §121.
El checklist de §121 verifica "Analysis Bus ✓ / Analysis Return ✓" pero nada dice cómo el usuario los configura la primera vez: qué AUX elegir, cómo nombrarlo, cómo asegurarse de que no está en uso por monitores, qué input usar como Return, cableado (TRS en Input 2, XLR en Input 1), 48 V, Direct Monitor off, ganancias analógicas de la Scarlett a una marca fija. Este wizard es **condición de seguridad**, no un "nice to have", y pertenece a MVP1.

**B-36 — ALTO — Room measurement para un operador solo es físicamente inviable tal como está descripto.**
Ref: §46, §49.
La tablet está atada por USB a la Scarlett y la Scarlett a la consola (AUX) — pero el mic debe ir a 6–10 posiciones en la sala. El único que puede llevar el micrófono es el operador. Requiere: cable XLR largo o el operador carga tablet+hub+Scarlett (posible, pero el plan exige hub alimentado, §17). El wizard debe incluir: cuenta regresiva con **prompt audible** desde el PA (el operador está lejos de la tablet), auto‑inicio de la medición al detectar silencio/estabilidad, repetición si hay ruido, e indicación de tiempo total estimado. Además, QUICK (3 posiciones) × 6 componentes de PA (§49) × sweep = decenas de minutos; el modo QUICK debe medir FULL SYSTEM solamente.

**B-37 — ALTO — No hay flujo de recuperación tras desconexión.**
Ref: §64.
Están los estados, pero no: qué ve el usuario (banner persistente + estado de transacciones pendientes), qué se le pide (nada hasta CONNECTED), qué ocurre con la ventana de captura en curso (se descarta o se marca "sin telemetría"), y cómo se reconcilia el estado (resumen de diferencias detectadas tras re‑lectura: "3 parámetros cambiaron mientras no estábamos conectados").

**B-38 — ALTO — Falta "Modo Show".**
Ref: §77, §123.
Uso en escenario: tablet a 1–2 m, luz baja, una mano, manos ocupadas, riesgo de toques accidentales. Requisitos: tipografía ≥ 2× la normal, contraste alto, solo alertas críticas, bloqueo de pantalla contra toques (hold‑to‑unlock), E‑Stop siempre accesible, sin ningún write posible salvo E‑Stop/rollback. No está diseñado.

**B-39 — MEDIO — Calibración SPL y ganancia analógica sin wizard.**
Ref: §18, §20.
Se prohíbe afirmar SPL sin calibración, pero no hay wizard (calibrador de 94 dB o SPL meter externo) ni estado visible "SPL no calibrado" en la UI. Tampoco wizard para fijar la ganancia analógica de Scarlett (ver B‑12): "gire Input 2 hasta que el tono de −20 dBFS de la consola marque −20 ± 0,5 dBFS".

**B-40 — MEDIO — Presupuesto de tiempo por wizard no definido.**
Un soundcheck real dura 20–60 min. Cada wizard debe declarar duración estimada y tener "camino rápido". Si Room QUICK + 5 canales + Build Your Mix + Virtual Soundcheck supera 45 min, el producto no se usa.

**B-41 — MEDIO — UX de CONFLICT (§59) y de "Observation" no definida.**
Qué ve el usuario ante un conflicto: valor que esperábamos, valor actual, opciones (re‑calcular / descartar / aplicar igual con confirmación). Y cómo se presentan observaciones cross‑dominio (B‑27).

**B-42 — BAJO — Dark mode, idioma y accesibilidad.**
No se menciona dark mode (obligatorio en escenario), idioma de UI (el documento mezcla ES/EN), ni tamaño mínimo de targets táctiles.

### 1.6 Proceso y documentación (§1, §126–§128, §131)

**B-43 — ALTO — 10 documentos antes de codificar contradice la Fase 0.**
Ref: §1 ("descomponer en especificaciones antes de implementar"), §126 vs §78–§88.
Los spikes son código. Exigir Architecture, Domain Model, DSP Spec y UX Spec completos antes de saber qué soporta el protocolo produce documentos que se reescriben al terminar Fase 0.
Mínimo documental real para arrancar Fase 0:
1. **Spike charters** (1 página cada uno): objetivo, montaje, criterio PASS numérico, evidencia a entregar.
2. **Capability Matrix** (template ya en §9) y **Hardware Matrix** (§16), vacías, para llenar.
3. **Safety Invariants** (1–2 páginas): la tabla de §2 de este informe.
4. **ADR log** (decisiones de arquitectura, 1 página por decisión).
Los documentos A, B, E, F, H, I, J de §126 se escriben **por incrementos por MVP**, no por adelantado, y se consideran "vivos". Documento C (Protocol Spec) es el *resultado* de P0.2, no un prerequisito.

**B-44 — ALTO — No hay estimaciones, roles, cadencia, ni definición de hecho.**
Ref: todo el plan.
No hay: quién hace qué (¿un desarrollador? ¿agentes?), duración estimada de Fase 0, criterios de "Definition of Done" por historia, ni cadencia de revisión del plan. Para un backlog ejecutable esto es tan bloqueante como los supuestos técnicos.

**B-45 — MEDIO — No hay registro de riesgos ni owner de decisiones.**
Ref: §2 menciona "dos auditorías" pero no hay trazabilidad de qué hallazgo produjo qué cambio. Recomendación: registro de riesgos (ver §4 de este informe) y trazabilidad hallazgo → sección.

**B-46 — BAJO — Usuario objetivo no está descripto como persona.**
Ref: §129.
"Músico que canta, toca, dirige y opera" es correcto pero insuficiente: ¿una banda concreta (la del autor) o un producto para muchos? Determina certificación de hardware, idiomas, soporte, y si "Custom" en todas las listas es necesario en MVP.

---

## 2. Reglas de seguridad convertidas en criterios testeables

Cada regla de §58/§63/§111/§115–§119 y los riesgos faltantes, expresados como invariante verificable. "Test" indica cómo se demuestra (HIL = hardware‑in‑the‑loop).

| ID | Regla original (§) | Invariante testeable | Test |
|---|---|---|---|
| S‑01 | Snapshot antes de automatización (§58, §61) | Ninguna transacción pasa a APPLYING sin `snapshotRef` verificado (lista de snapshots re‑leída contiene el nombre). Nombre `VSE_AUTO_<ts>`. | Unit + HIL: intentar aplicar sin snapshot → rechazado; borrar snapshot en consola entre save y apply → transacción abortada. |
| S‑02 | Rollback granular (§58, §61) | Cada `Change` guarda `previousValue` leído de consola (no calculado). Rollback de un change restaura `previousValue` exacto y lo verifica por lectura. | HIL: 100 writes aleatorios + rollback → 100/100 coinciden. |
| S‑03 | Nunca sobrescribir snapshots manuales (§61) | La app solo crea/borra nombres con prefijo `VSE_`. Cualquier otro nombre es read‑only. Retención: máx. 20 auto‑snapshots; se borran los más antiguos `VSE_` solamente. | Unit: hash de snapshots no‑VSE antes/después de 200 operaciones = idéntico. |
| S‑04 | Cambios pequeños (§58, §115) | Por transacción, delta máximo por parámetro: fader ±3 dB; gain ±3 dB; EQ gain ±3 dB (output) / ±4 dB (input), Q ≥ 0,7 en outputs; HPF ≤ 1 octava; delay ≤ 5 ms por paso; master ±1 dB y **nunca** por encima del valor máximo previo de la sesión. Deltas mayores requieren dos transacciones separadas con verificación entre medio. | Unit: motor rechaza recomendaciones fuera de rango; HIL: asserts sobre comandos enviados. |
| S‑05 | Límite de parámetros simultáneos (§58, §116) | ASSISTED: ≤ 4 parámetros por transacción; CONTROLLED AUTO: ≤ 1. Writes secuenciales con ≥ 100 ms entre sí y ack de cada uno antes del siguiente. | Unit + log inspection. |
| S‑06 | No gain durante Full Band / show (§58) | Preamp gain solo escribible en `SessionState ∈ {CHANNEL_SETUP}`; bloqueado en FULL_BAND, SHOW y cualquier estado con Room o Mix activos. | Unit: state machine. |
| S‑07 | No phantom automático (§58) | La app **nunca** envía escritura de phantom (parámetro read‑only en MixerDomainAPI). Wizard exige confirmación "Input 2 por TRS". | Static: no existe método write para phantom; UX test. |
| S‑08 | No routing crítico sin validación (§58) | Únicos routings escribibles: sends hacia el Analysis Bus y mute/fader del Analysis Return. Todo otro routing, AUX de monitor, matrix, master, mute, limiter: read‑only. | Static + unit. |
| S‑09 | No grandes movimientos de master (§58) | Ver S‑04; además master nunca > 0 dB y nunca escrito en MVP0–MVP3. | Unit. |
| S‑10 | Monitores intocables (nuevo) | Ningún AUX marcado como monitor (todos salvo el Analysis Bus) recibe writes. | Unit + HIL. |
| S‑11 | Verificar estado antes de escribir (§58, §59) | Toda escritura va precedida de comparación `currentValue == expectedValue` con lectura ≤ 2 s de antigüedad; si difiere → CONFLICT, transacción PAUSED, sin write. Tras write: eco de estado esperado ≤ 500 ms; sin eco → change en UNVERIFIED y transacción detenida. | HIL: cambiar valor desde web durante apply → 100 % CONFLICT. |
| S‑12 | Analysis Return muted by default (§22) | Al conectar y al inicio de cada sesión, se lee y fuerza mute = ON del Analysis Return. Watchdog: si mute pasa a OFF fuera de ventana de generación → re‑mute ≤ 300 ms + alerta. | HIL: desmutear desde web → re‑mute automático medido. |
| S‑13 | Apertura del Return solo en generación (§22–§23) | Precondiciones (todas obligatorias): canal Return identificado; send Return→Analysis Bus = −∞ verificado; sends Return→AUX monitores = −∞ verificados; Direct Monitor confirmado OFF por el usuario; nivel de PA confirmado; Scarlett en salida −∞; cuenta regresiva 3 s visible y audible. | Unit: matriz de precondiciones; HIL: cualquier precondición falsa → generador no arranca. |
| S‑14 | Cierre inmediato al finalizar (§23) | Al terminar, cancelar, perder foco, perder USB o perder red: salida Scarlett → −∞ localmente ≤ 100 ms; mute Return enviado con ack ≤ 500 ms; sin ack → 3 reintentos + alerta sonora/visual persistente. | HIL: desconectar USB en medio de sweep; desconectar Wi‑Fi en medio de sweep. |
| S‑15 | Nivel máximo y rampa del generador (nuevo) | Arranque a −40 dBFS con rampa ≤ 6 dB/s; tope digital −12 dBFS por defecto (configurable hasta −6 con confirmación); duración máx. 30 s por señal; abort automático si Input 1 supera −3 dBFS o si SPL calibrado supera límite configurado (default 95 dB SPL). | Unit: generador; HIL: medir. |
| S‑16 | No loops (§24, §111) | Antes de abrir el Return: test de loop a −60 dBFS durante 500 ms; si se detecta correlación out→in por encima de umbral vía Input 2 (Direct Monitor o routing erróneo) → abort. | HIL: activar Direct Monitor a propósito → detección 10/10. |
| S‑17 | Bloqueo ante pérdida de conexión (§58, §64) | En UNSTABLE/RECONNECTING/DISCONNECTED: cola de writes vaciada, transacciones APPLYING → SUSPENDED, generador detenido. UNSTABLE = > 2 s sin heartbeat o > 10 % pérdida en 30 s (a calibrar en P0.1). | HIL con packet loss simulado. |
| S‑18 | No comandos pendientes tras reconnect (§58) | Al reconectar: cola = vacía (assert), estado completo re‑leído, diff mostrado al usuario, transacciones SUSPENDED requieren decisión humana. | HIL: 20 ciclos. |
| S‑19 | Emergency stop (§63) | Local (≤ 200 ms, sin red): stop generador, salida Scarlett −∞, cancelar automation, bloquear writes salvo lista blanca {ROLLBACK, MUTE_RETURN}. Remoto (con ack/reintento): mute Return. Rearme explícito con re‑lectura total. Botón visible en 100 % de pantallas y modales; tamaño ≥ 64 px. No mutea master ni canales. | UI test automatizado + HIL cronometrado. |
| S‑20 | Crash a mitad de transacción (nuevo) | Journal write‑ahead persistido antes de cada write. Al reiniciar: transacciones APPLYING detectadas, estado real leído, diff mostrado, opciones rollback/aceptar. Nunca reaplicar. | Kill de proceso durante apply, 20 veces. |
| S‑21 | Recall manual de snapshot con transacciones pendientes (nuevo) | Cambio masivo (> 10 parámetros en < 1 s) o evento de recall → invalidación global: abortar transacciones, invalidar Measurements "before" no cerradas, re‑leer, avisar. | HIL: recall desde web durante transacción. |
| S‑22 | Registrar todo (§58) | Cada write registra: ts, transacción, parámetro, expected, previous, sent, ack, verified. Log persistido en SQLite, rotación ≥ 30 sesiones, export a archivo desde la UI. | Unit + inspección. |
| S‑23 | Non‑destructive automation (§115) | Ninguna transacción CONTROLLED AUTO se cierra como KEEP sin `measurementAfterId`; si `score(after) < score(before) − tolerancia` → REVERT automático y verificado. | Unit con mediciones sintéticas. |
| S‑24 | Solo HIGH elegible a automatización (§74) | `confidence == HIGH` (definir: consistencia ≥ 80 % de posiciones y desviación ≥ 2× ruido de medición) es condición de `autoEligible`. LOW/INSUFFICIENT → solo Observation. | Unit. |
| S‑25 | Human authority (§119) | Todo apply en ASSISTED requiere acción explícita (hold 1 s o doble confirmación); no hay auto‑aceptación por timeout. | UI test. |
| S‑26 | Audio accidental de Android (§23) | Con DND activo y la app en foreground, ningún audio del sistema llega a la salida de la Scarlett cuando el Return está abierto: verificación por captura en Input 2/loopback durante P0.6. Si la app pierde foreground → S‑14. | HIL: disparar notificación con sonido durante sweep. |
| S‑27 | Scarlett gain touched (nuevo) | Si el nivel del tono de referencia en Input 2 difiere > 1 dB del calibrado, toda medición nueva se marca `calibrationState = INVALID` y la UI lo muestra. | HIL: mover potenciómetro. |

---

## 3. Supuestos no validados y ambigüedades (pregunta exacta a responder)

Cada ítem bloquea al menos una historia del backlog.

| # | Supuesto / ambigüedad | Pregunta exacta | Bloquea |
|---|---|---|---|
| A‑01 | Existe un tap point "RAW_INPUT" (pre‑EQ/pre‑HPF) enviable a un AUX (§8). | ¿Qué taps admite un AUX send de la Ui24R por canal (pre/post fader, pre/post EQ)? Si no hay pre‑EQ, ¿se acepta que el Gain Assistant mida post‑HPF? | Channel Assistant MVP1 |
| A‑02 | La banda objetivo tiene un AUX y un input libres para Analysis Bus/Return (§7, §22). | ¿Cuántos AUX usan como monitores y cuántos inputs ocupa la banda? | Setup wizard, MVP1 |
| A‑03 | Virtual Soundcheck es operable desde la app (§40, §85). | ¿Cuántos pasos manuales en la web de la Ui24R requiere pasar a playback y volver? ¿Es aceptable ≤ N pasos para el usuario? | MVP2b |
| A‑04 | El protocolo informa el origen de un cambio (§60). | ¿La consola distingue clientes en sus notificaciones de cambio? Si no: `source ∈ {SELF, EXTERNAL}`. | Concurrency, UX de conflicto |
| A‑05 | "Cambio pequeño" (§58) | ¿Cuáles son los deltas máximos por parámetro y nivel de autonomía? (propuesta S‑04) | Safety Engine |
| A‑06 | "HIGH / MEDIUM / LOW" (§74) | ¿Cuál es la definición numérica de cada nivel de confianza? | Recommendation Engine |
| A‑07 | Scores 0–100 (§122) | ¿Fórmula de ROOM score y MIX score? ¿Qué significa 87? | Dashboard |
| A‑08 | Usuario objetivo (§129) | ¿Es una banda concreta o un producto para varias? ¿Cuántas tablets/certificaciones? ¿Idioma de UI? | Hardware matrix, UX |
| A‑09 | Tiempo de soundcheck disponible | ¿Cuántos minutos hay típicamente entre llegada y show? ¿Cuál es el presupuesto por wizard? | Todos los wizards |
| A‑10 | Basic Audio Engine en WebView (§14) | ¿Se decide WebAudio o nativo para captura dual? ¿Cuál es el criterio? | Fase 2 |
| A‑11 | Loopback (§19) | ¿Se hace una vez (en casa) o en cada venue? ¿Requiere re‑patcheo físico durante el setup? | Room‑Correct |
| A‑12 | Ganancia analógica de Scarlett | ¿Se acepta un procedimiento de "marca fija" + tono de referencia? ¿Qué tolerancia? | Toda medición comparable |
| A‑13 | Nivel máximo de sweep | ¿Tope en dBFS? ¿Tope SPL? ¿Quién lo confirma antes de cada medición? | Room‑Correct, S‑15 |
| A‑14 | Sincronización medición ↔ playback en Virtual Soundcheck (§92 "measurement sync") | ¿Cómo se alinea el inicio de la medición con el inicio del playback (marcador, detección de transitorio, tiempo)? | MVP2b |
| A‑15 | Snapshots en consola | ¿Límite de cantidad? ¿Efectos de guardar snapshot durante el show (glitch)? | S‑01, S‑03 |
| A‑16 | Firmware Ui24R | ¿Versión objetivo y política ante actualización? | Capability Matrix |
| A‑17 | Recall de snapshot detectable (§110) | ¿La consola notifica un recall o solo llegan N cambios de parámetros? | S‑21 |
| A‑18 | Datos de grabaciones (§39) | ¿Dónde se guardan, cuánto tiempo, quién consiente? | MVP2b, export |
| A‑19 | AFS2 (§56) | ¿La app lee/escribe algo de AFS2 o el ring‑out es 100 % manual? | Workflow §121 |
| A‑20 | Fase 8 automatiza Room primero (§96) | ¿Se confirma que el primer dominio automatizado es EQ de salida (mayor radio de impacto) y no gain/fader de un canal? | Roadmap MVP4 |
| A‑21 | Room "QUICK" (§46) con componentes de PA (§49) | ¿QUICK mide solo FULL SYSTEM? ¿Cuántas posiciones × componentes son aceptables en tiempo? | Room wizards |
| A‑22 | Operación en pantalla bloqueada / app en background (§65) | ¿La captura y las alertas deben seguir con pantalla apagada durante el show? | Show Monitor, lifecycle gate |

---

## 4. Riesgos de producto / proceso — Top 10

| # | Riesgo | Severidad | Probabilidad | Mitigación |
|---|---|---|---|---|
| R‑01 | Fase 0 se extiende meses por gate monolítico (§128) y no se entrega valor; el proyecto pierde impulso. | CRÍTICO | Alta | Gates escalonados (B‑13); MVP0 sin Scarlett en semanas. |
| R‑02 | Daño a PA / audición por generador sin tope ni rampa, o Analysis Return abierto por error. | CRÍTICO | Media | S‑12…S‑16; watchdog; E‑Stop local‑first; Room‑Correct solo tras G‑C. |
| R‑03 | La app modifica un send de monitor o el master y el músico pierde referencia en show. | CRÍTICO | Media | S‑08…S‑10; Parameter Ownership completado (B‑27). |
| R‑04 | Producto construido en orden inverso a su uso: usuario ecualiza canales sobre sala sin corregir y desconfía de las recomendaciones. | ALTO | Alta | Room‑Observe adelantado; recomendaciones de canal con etiqueta "sin corrección de sala" hasta que haya Room. |
| R‑05 | Hardware Android/USB no certificable en la tablet disponible → toda la línea de medición cae. | ALTO | Media | MVP0 independiente de USB; certificación como gate G‑B; presupuesto para 2ª tablet. |
| R‑06 | Wizards demasiado largos para el tiempo real de soundcheck → no se usan. | ALTO | Alta | Presupuesto de tiempo por wizard (A‑09); caminos "quick"; medir tiempo en pruebas de campo. |
| R‑07 | Estado inconsistente tras crash / recall manual → rollback restaura un estado equivocado. | ALTO | Media | S‑20, S‑21; journal write‑ahead. |
| R‑08 | Parálisis por documentación (§126) / retrabajo de specs escritas antes de Fase 0. | ALTO | Alta | Mínimo documental (B‑43); docs vivos por MVP. |
| R‑09 | Mediciones no comparables entre sesiones por ganancia analógica de Scarlett no controlada. | MEDIO | Alta | Calibración por tono de referencia (S‑27, A‑12). |
| R‑10 | Recomendaciones no explicables (sin Finding/Diagnosis, sin enlaces por ID) → el usuario no confía y no aplica nada; el aprendizaje (§99) no tiene datos. | MEDIO | Media | B‑28, B‑29; modelo de dominio antes de MVP1. |

---

## 5. Recomendaciones de cambio al plan (numeradas)

**Rec‑01 — Introducir MVP0 "Console Telemetry & Gain" (sin Scarlett).**
Ui24R + tablet: conexión, telemetría, gain staging por medidores de consola, snapshot VSE_, Change Log, E‑Stop (parte local + mute Return si existe), Session. Gate G‑A. Objetivo: valor en semanas, y validación temprana de P0.1/P0.2/P0.8/P0.9.

**Rec‑02 — Redefinir MVP1 sin micrófono.**
Quitar §101.3 (ECM8000). MVP1 = Direct Reference (Input 2) + FFT/ruido/headroom + HPF/EQ/dinámica en SUGGEST + **Setup Wizard** + calibración de ganancia de Scarlett. Gate G‑B.

**Rec‑03 — Dividir Room en Room‑Observe y Room‑Correct.**
Room‑Observe (mic + ruido rosa desde una fuente que no requiera Analysis Return; mediciones multi‑posición; consistencia; sin writes) va inmediatamente después de MVP1 para alinear con §121. Room‑Correct (generador propio + Return + GEQ suggestions) después de G‑C.

**Rec‑04 — Dividir Mix en Mix‑Live y Mix‑A/B.**
Mix‑Live: roles, Build Your Mix, Full Band, fader suggestions en vivo (sin Virtual Soundcheck). Mix‑A/B: Virtual Soundcheck tras G‑D. Cambiar §92/§128 para que Virtual Soundcheck no sea prerequisito.

**Rec‑05 — Asignar Show Monitor y Show Ready Dashboard a fases.**
Show Monitor read‑only tras MVP0 (o MVP1). Dashboard incremental.

**Rec‑06 — Gates escalonados (G‑A…G‑E) reemplazan a §128.**
Con los criterios PASS numéricos de B‑11 y los gates faltantes de B‑12 (motor de audio, tablet, lifecycle, loopback, calibración Scarlett, firmware).

**Rec‑07 — Matriz Parámetro × Nivel de autonomía × MVP.**
Sustituye a §29/§95/§96/§119 dispersos. Propuesta inicial: ASSISTED primero para *un* parámetro de canal (gain o fader) con caps S‑04, no para EQ de salida; CONTROLLED AUTO solo Room‑Correct, solo cuts, solo HIGH, solo tras G‑E.

**Rec‑08 — Reescribir §58/§63/§111 como invariantes S‑01…S‑27** y convertirlas en la suite de aceptación de seguridad (unit + HIL). Ningún MVP con writes se libera sin la suite en verde.

**Rec‑09 — Redefinir Emergency Stop como local‑first** (S‑19), con lista blanca de writes, rearme explícito y presencia en el 100 % de pantallas.

**Rec‑10 — Completar Parameter Ownership** con USER‑ONLY explícito para monitores, master, mute, phantom, limiter, FX, AFS2, y con owner "System" para Analysis Bus/Return. Agregar tipo `Observation`.

**Rec‑11 — Completar el modelo de dominio antes de MVP1:** `ChannelAssignment`, `Finding/Hypothesis`, `VirtualSoundcheckTake`, `MixCandidate`, `PAProfile`, `Snapshot`, referencias por ID entre Measurement ↔ Recommendation ↔ ChangeTransaction, campos faltantes de `Measurement`, ciclo de vida de `SoundSession`, definición de scores.

**Rec‑12 — Agregar wizards faltantes a la UX Spec:** Setup/Patcheo (con regla TRS en Input 2), Calibración de ganancia Scarlett, Calibración SPL (opcional, con estado visible), Recuperación tras desconexión, Modo Show, UX de CONFLICT, prompts audibles y auto‑inicio para mediciones caminando, presupuesto de tiempo por wizard.

**Rec‑13 — Reducir §126 al mínimo documental** (charters de spike, matrices vacías, invariantes de seguridad, ADRs) y declarar el resto como documentos vivos por MVP. Agregar registro de riesgos, roles, estimaciones y DoD.

**Rec‑14 — Completar §131** y agregar una tabla de trazabilidad hallazgo → cambio para futuras versiones del plan.

**Rec‑15 — Definir política de datos** para grabaciones de Virtual Soundcheck y para el export de sesión.

### 5.1 Propuesta de re‑secuenciación

```text
FASE 0a  Spikes G‑A: P0.1 Connectivity · P0.2 Matrix (subconjunto) · P0.8 Snapshot · P0.9 Concurrency
         Docs: charters + matrices + invariantes S‑xx + ADRs
FASE 1   Foundation (Angular/Capacitor/SQLite/log/MixerAdapter/Safety model/Transactions model/E‑Stop local)
MVP0     Console Telemetry & Gain (sin Scarlett) + Show Monitor read‑only + Session/ChangeLog
FASE 0b  Spikes G‑B: P0.3 Android+Scarlett · tablet cert · lifecycle · P0.5 Analysis Bus · P0.10 DSP básico
         · calibración ganancia Scarlett · decisión motor de audio (WebView vs nativo)
FASE 2   Basic Audio Engine (captura dual, RMS/peak/FFT/ruido)
MVP1     Channel Assistant (Direct Reference) + Setup Wizard + Scarlett gain calibration   [SUGGEST]
FASE 0c  Spikes G‑C parte 1: mic profile · SPL calibration opcional
MVP1.5   Room‑Observe (mic + ruido rosa externo, multi‑posición, consistencia, target deviation, sin writes)
MVP2a    Mix‑Live (roles, Build Your Mix, Full Band, fader suggestions)                      [SUGGEST]
FASE 0c' Spikes G‑C parte 2: P0.4 Full duplex · P0.6 Signal Return · loopback · S‑12…S‑16 en HIL
MVP3     Room‑Correct (generador + Return + GEQ suggestions + before/after)                  [SUGGEST]
FASE 0d  Spike G‑D: P0.7 Virtual Soundcheck
MVP2b    Mix‑A/B (Virtual Soundcheck)
FASE 0e  Gate G‑E: suite de seguridad S‑01…S‑27 en verde (unit + HIL)
MVP4a    Assisted Apply — un parámetro de canal (gain/fader) con caps                        [ASSISTED]
MVP4b    Assisted Apply — Room‑Correct cuts, luego Closed Loop Room                         [CONTROLLED AUTO]
FASE 9+  Precision Engine · PA alignment · Learning · AI (sin cambios respecto al plan)
```

Este orden: (1) entrega valor sin hardware USB en semanas; (2) alinea la secuencia de entrega con el workflow real (Room‑Observe antes de Mix); (3) posterga las dos dependencias de mayor riesgo (Signal Return y Virtual Soundcheck) hasta que existan usuarios reales dando feedback; (4) hace que el primer write automatizado sea el de menor radio de impacto.

---

## 6. Nota de cierre

El plan v1.1 tiene la filosofía correcta; lo que le falta es convertir principios en invariantes numéricas, alinear el orden de entrega con el orden de uso, y admitir que el primer valor no necesita ni Scarlett ni Virtual Soundcheck. Con los cambios propuestos, el documento puede pasar de "visión auditada" a "backlog ejecutable" sin perder ninguno de sus principios de seguridad — de hecho los refuerza, porque cada uno pasa a tener un test.
