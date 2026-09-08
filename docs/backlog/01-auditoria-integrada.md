# Ui24R Virtual Sound Engineer — Auditoría integrada del Plan Maestro v1.1

**Fecha:** 2026-09-07
**Fuentes:** Auditoría A (feasibilidad técnica y arquitectura, 34 hallazgos, verificada contra `soundcraft-ui-connection` v7.0.3, AOSP, Oboe, HARMAN, Focusrite) y Auditoría B (producto, alcance, proceso, seguridad operativa y UX, 46 hallazgos, 27 invariantes de seguridad). Ambas se adjuntan completas como anexos.
**Propósito:** consolidar hallazgos, resolver divergencias entre auditores y fijar las decisiones que gobiernan el backlog técnico.

> **Este documento no se edita.** Es el registro de lo que la auditoría dijo el 2026-09-07, y su numeración de epics es la que la auditoría propuso, anterior al backlog v1.1. Un caso concreto: **EP-09 no existe en el backlog** — los spikes de audio de fase 0b terminaron consolidados en EP-04, y la numeración se cerró saltando del EP-08 al EP-10. Corregir la cita para que cuadre con el backlog de hoy falsificaría el registro, así que se deja como está y se anota acá. El validador de identificadores trata este archivo y los anexos como registros congelados por el mismo motivo.

---

## 1. Veredicto

El Plan Maestro v1.1 tiene la filosofía correcta (measurement-first, safety-by-design, Parameter Ownership, transacciones, Human Authority) y **no es todavía ejecutable**. Cuatro problemas lo bloquean:

1. **Dos supuestos técnicos centrales son falsos o inviables tal como están escritos:** (a) el Basic Audio Engine en WebAudio dentro de un WebView Android no puede capturar dos entradas USB independientes sin procesamiento; (b) la ruta de generación Android → Scarlett OUT → Analysis Return → PA es estructuralmente insegura, porque Android enruta notificaciones y audio de otras apps a la salida USB y la app no puede impedirlo.
2. **El orden de construcción está invertido respecto al orden de uso** (Room → Channel → Mix en el workflow; Channel → Mix → Room en los MVPs), y el gate monolítico "todo PASS antes de cualquier MVP" retrasa meses el primer valor.
3. **Las reglas de seguridad son slogans** sin número ni test, y faltan escenarios críticos: crash a mitad de transacción, recall manual de snapshot, nivel máximo del generador, phantom global de la Scarlett sobre una salida de línea.
4. **El modelo de dominio y el protocolo tienen huecos concretos:** no existe la entidad `Channel`; el protocolo no identifica al cliente que escribe ni confirma escrituras; la librería mezcla escrituras propias en su estado; HPF/PEQ/comp/gate/GEQ/AFS2 no tienen API tipada y su escalado es desconocido.

Nada de esto invalida el producto. Todo tiene una solución concreta, y en varios casos la solución simplifica el sistema (menos hardware en el camino crítico, menos requisitos de sincronía, menos escrituras peligrosas).

---

## 2. Divergencias entre auditores y cómo se resuelven

| Tema | Auditoría A | Auditoría B | Resolución adoptada |
|---|---|---|---|
| Generador de estímulo | Usar el Media Player de la Ui24R; sacar el Analysis Return del MVP (A-20) | Mantener Analysis Return con 5 invariantes de protección (S-12…S-16) | **A.** El Media Player elimina la clase de riesgo entera en vez de mitigarla. Analysis Return queda como épica opcional post-MVP4, solo si el Player resulta insuficiente. Las invariantes S-12…S-16 se reescriben para el Player (mute y sends de Player L/R). |
| Fuente para gain staging | VU pre-proceso + gain de la mesa (A-31) | MVP0 con medidores de consola, sin Scarlett (B-03) | **Coinciden.** Gain Assistant usa telemetría de la mesa; Input 2 aporta espectro y ruido a partir de MVP1. |
| Loopback | Redefinir como igualación In1/In2 + calibración de nivel de Input 2 con tono de la mesa (A-23) | Loopback como gate antes de Room-Correct (B-12) | **Ambas.** Loopback redefinido según A, y es gate G-C según B. |
| Full duplex | Sobredimensionado; basta captura dual sample-sincrónica (A-21) | P0.4 con 60 min de play+capture (B-11) | **A.** P0.4 pasa a "captura dual sample-sincrónica durante reproducción del Player, 60 min, deriva medida". |
| Contenido del Basic Engine | Debe incluir dual-FFT, coherencia y delay finder (A-29/A-30) | No opina | **A.** Sin coherencia, Room-Observe da EQ errónea en salas reverberantes. |
| Primer parámetro automatizado | No opina | Gain o fader de un canal, no EQ de salida (B-07) | **B.** Menor radio de impacto. |
| Interfaz de audio | Spike alternativo Ui24R USB-B 32×32 directo al tablet (A-27) | No opina | **Spike acotado a 2 días** (P0.3b). Si funciona, elimina Scarlett, phantom, Analysis Bus y el límite de un canal espectral. |

---

## 3. Decisiones de arquitectura (ADR) que gobiernan el backlog

Cada decisión cita el hallazgo que la origina. Se registran como ADR-nn en el repositorio del proyecto.

| ADR | Decisión | Origen |
|---|---|---|
| ADR-01 | **Motor de audio nativo desde Fase 1.** Plugin Capacitor propio (Kotlin, AudioRecord/AAudio, `UNPROCESSED`, `setPreferredDevice`, Foreground Service). DSP en el lado nativo; al WebView llegan métricas y espectros decimados, nunca PCM. WebAudio solo para visualización y para la PWA secundaria. | A-16, A-17 |
| ADR-02 | **Generador de estímulo = Media Player de la Ui24R.** Archivos de sweep, pink, sine y burst preparados en el pendrive. Referencia eléctrica por Analysis Bus a Input 2. Scarlett OUT solo para loopback y auriculares. **Analysis Return fuera del MVP.** | A-20, B-16, B-20 |
| ADR-03 | **Basic Audio Engine incluye transfer function dual-canal (magnitud, fase relativa), coherencia γ² y delay finder.** Precision Engine = IR por deconvolución, ETC, RT60, group delay, sub alignment. Se retira "full duplex sincronizado" como requisito. | A-21, A-29, A-30 |
| ADR-04 | **Gain staging desde telemetría de la mesa** (`vuPre` + `gainDB`). Input 2 aporta espectro, ruido y SNR. Preamp Gain se congela mientras Soundcheck está activo; orden obligatorio Gain → Record. | A-12, A-31, B-03 |
| ADR-05 | **`ConfirmedStateStore` propio alimentado solo por `inbound$`.** Ninguna verificación ni rollback lee el `state$` de la librería. `source ∈ {SELF, EXTERNAL, UNKNOWN}` por correlación temporal (ventana ≈300 ms). Ráfagas (> 10 parámetros en < 1 s, cambio de `currentSnapshot`) = evento de invalidación global. | A-01, A-02, A-09, B-19, B-23 |
| ADR-06 | **RAW es camino de primera clase del `Ui24rMixerAdapter`.** Toda escritura RAW pasa por una tabla de mapeo (path, rango raw, unidad física, función, test de round-trip). Ningún valor fuera de tabla se envía. Versión de librería (7.0.3) y firmware de la mesa forman parte de la Capability Matrix. | A-03, A-04 |
| ADR-07 | **Gates escalonados G-A…G-E** reemplazan a §128. Cada MVP desbloquea con su gate. | B-11, B-13, A-28.5 |
| ADR-08 | **MVP0 "Console Telemetry & Gain" sin Scarlett** es el primer entregable usable. | B-03 |
| ADR-09 | **Room se divide en Room-Observe (sin writes) y Room-Correct. Mix se divide en Mix-Live y Mix-A/B (Virtual Soundcheck).** Room-Observe se entrega antes que Mix, alineando entrega con el workflow §121. | B-01, B-04 |
| ADR-10 | **Parameter Ownership completo con USER-ONLY explícito** (AUX de monitores, master, mute, phantom, limiter, FX, VCA, AFS2) y owner "System" para Analysis Bus y Player. Nuevo tipo de salida `Observation` (sin `proposedValue`). | B-21, B-27 |
| ADR-11 | **Invariantes de seguridad S-01…S-27** (versión ajustada a ADR-02) son la suite de aceptación de seguridad. Ningún MVP con escrituras se libera sin la suite en verde (unit + hardware-in-the-loop). | B-14, B-17…B-20 |
| ADR-12 | **Emergency Stop local-first:** acciones locales garantizadas ≤ 200 ms sin red; acciones remotas con ack y reintento; lista blanca de writes durante bloqueo {MEDIA_STOP, MTK_STOP, mute Player L/R, ROLLBACK}; rearme explícito con re-lectura total; visible en el 100 % de pantallas. | A-26, B-17 |
| ADR-13 | **Journal write-ahead de transacciones.** Persistido antes de cada write; al reiniciar, transacciones en APPLYING se muestran con diff y nunca se reaplican. | B-18 |
| ADR-14 | **Modelo de dominio ampliado antes de MVP1:** `ChannelAssignment`, `Finding` → `Hypothesis` → `Recommendation`, `VirtualSoundcheckTake`, `MixCandidate`, `PAProfile`, `Snapshot`, enlaces por ID entre Measurement ↔ Recommendation ↔ ChangeTransaction, ciclo de vida de `SoundSession`, campos faltantes de `Measurement`, fórmula de scores. | B-25…B-34, A-25 |
| ADR-15 | **Un solo canal espectral a la vez** (Input 2). El análisis por canal en Full Band es por VU2 (nivel) o secuencial. Documentado en UI. | A-22 |
| ADR-16 | **Documentación mínima para arrancar:** charters de spike con PASS numérico, matrices vacías, invariantes, ADRs. El resto son documentos vivos por MVP. La Protocol Spec es resultado de P0.2, no prerequisito. | B-43 |
| ADR-17 | **Wizards obligatorios:** Setup/Patcheo (regla: Input 2 solo por TRS), Calibración de ganancia de Scarlett con tono de la mesa, Calibración SPL opcional con estado visible, Recuperación tras desconexión, Modo Show, UX de CONFLICT. Mediciones multi-posición con prompts audibles y auto-inicio. | B-15, B-35…B-41, A-19 |
| ADR-18 | **Spike P0.3b (2 días):** Ui24R USB-B 32×32 directo al tablet Android. Si PASS, se abre una variante de arquitectura sin Scarlett que se evalúa antes de Fase 2. | A-27 |

---

## 4. Hallazgos críticos y altos consolidados (lista de trabajo)

Cada fila se convierte en al menos una historia del backlog. "Resuelto por" indica la épica/historia.

| ID | Hallazgo | Sev. | Resuelto por |
|---|---|---|---|
| A-16/A-17 | WebAudio inviable para captura dual; plugin nativo necesario | CRÍTICO | EP-05 |
| A-20 / B-16 / B-20 | Audio de Android al PA por Analysis Return; generador sin tope | CRÍTICO | ADR-02, EP-04 (P0.6'), EP-10 |
| A-01 / A-02 | Sin identidad de cliente ni ACK; estado optimista de la librería | CRÍTICO/ALTO | EP-01 (P0.1 echo), EP-02 (ConfirmedStateStore) |
| A-03 / A-04 | Sin API tipada para procesamiento; escalado desconocido | ALTO | EP-01 (P0.2), EP-09 (P0.2 completa) |
| A-29 / A-30 | Falta coherencia y delay finder → EQ de sala errónea | ALTO | EP-05 |
| A-31 / A-12 | Gain staging con telemetría de la mesa; gain congelado en Soundcheck | ALTO | EP-03, EP-11 |
| A-19 | Scarlett no observable: ganancia, Auto Gain, Clip Safe, Direct Monitor | ALTO | EP-06 (calibración), EP-09 (loopback) |
| A-22 | Un canal espectral a la vez | ALTO | ADR-15, EP-08 |
| B-01 / B-04 | Orden invertido; Virtual Soundcheck como prerequisito | CRÍTICO/ALTO | ADR-09, orden global |
| B-02 / B-03 | MVP1 exige mic sin usarlo; existe MVP0 sin Scarlett | CRÍTICO/ALTO | ADR-08, EP-03, EP-06 |
| B-11 / B-13 | Spikes sin PASS medible; gate monolítico | CRÍTICO/ALTO | EP-01, EP-04, EP-09, EP-11, ADR-07 |
| B-14 / B-17 / B-18 / B-19 | Reglas no verificables; E-Stop; crash; recall manual | CRÍTICO/ALTO | EP-02, EP-12, EP-13 |
| B-15 | Phantom global vs. salida de línea en Input 2 | CRÍTICO | EP-06 (Setup Wizard, regla TRS) |
| B-21 / B-27 | Monitores, master, mute sin regla "nunca tocar" | ALTO | EP-02 (ownership), EP-12 |
| B-25 / B-28 / B-29 / B-30 | Entidades faltantes y sin enlaces por ID | CRÍTICO/ALTO | EP-02 (dominio) |
| B-35 / B-36 / B-37 / B-38 | Wizards faltantes: setup, medición caminando, reconexión, Modo Show | CRÍTICO/ALTO | EP-06, EP-07, EP-03 |
| B-43 / B-44 | Documentación desproporcionada; sin estimaciones ni DoD | ALTO | EP-00 |
| A-13 / A-14 / A-11 | Virtual Soundcheck: pendrive, sin seek, alineación por correlación | MEDIO | EP-11 |
| A-07 / B-19 | Snapshots sobrescriben sin confirmación; alcance desconocido | MEDIO | EP-01 (P0.8) |

---

## 5. Cambios al Plan Maestro (para la versión 1.2)

1. §8: reemplazar "comprobar experimentalmente" por el mapeo confirmado (RAW_INPUT = AUX send PRE + PRE-PROC; POST_PROCESSING = PRE + POST-PROC; POST_FADER = POST; MASTER_REFERENCE = MTX con fuente master). Verificar `settings.auxsendpoint/mtxsendpoint`.
2. §9: adoptar la Capability Matrix v0 (anexo) y añadir filas: Output PEQ, Polaridad, Recall safe, selección de sesión MTK/seek, patch de soundcheck, ACK/echo, RTA, Ui24R USB-B, Media Player.
3. §13–14: "Basic y Precision nativos; WebAudio solo visualización". Dual-FFT, coherencia y delay finder pasan al Basic Engine.
4. §21–24, §63: generador = Media Player; Analysis Return opcional post-MVP; whitelist de writes de seguridad; estados seguros por defecto sin escritura.
5. §27–28: Gain Assistant desde `vuPre` + `gainDB`; calibración de balística del VU2 en P0.10.
6. §38–40: grabación post-preamp declarada; Preamp Gain congelado en Soundcheck; alineación A/B por correlación de Input 2; pendrive certificado en la matriz de hardware.
7. §59–60: `source ∈ {SELF, EXTERNAL, UNKNOWN}`; `ConfirmedStateStore`; ráfagas como evento bulk.
8. §62: `ChangeTransaction.changes[].confirmedBy ∈ {ECHO, VU, TIMEOUT, NONE}`; rollback parcial.
9. §64: `UNSTABLE` derivado de la cadencia de frames VU2; invalidar estado en reconexión hasta el volcado completo.
10. §31: tabla de ownership completa (anexo B-27) + tipo `Observation`.
11. §58, §63, §111, §115–119: reemplazar por invariantes S-01…S-27 (versión ajustada).
12. §78–88, §128: spikes con PASS numérico; gates G-A…G-E; nuevos spikes P0.1-echo, P0.3b USB-B, P0.6' Player como generador, P0.10 VU2, lifecycle Android, certificación de tablet, calibración de Scarlett.
13. §89–104: nueva secuencia (ver Plan Final). MVP0 nuevo; MVP1 sin micrófono; Room-Observe antes de Mix; Virtual Soundcheck después de Room-Correct; primer Assisted Apply sobre un parámetro de canal.
14. §16: columnas "UNPROCESSED", "xruns/3 h", "carga + host", "hub", "pendrive".
15. §19: loopback redefinido (igualación In1/In2 + nivel absoluto de Input 2).
16. §24: verificación de Direct Monitor por test de loop electroacústico, no por confirmación.
17. §56: "re-measure después de AFS2 ring-out"; guardar estado AFS2 en la sesión.
18. §41/§77/§93: explicitar "un canal espectral a la vez".
19. §126: documentación mínima (ADR-16).
20. §131: completar el cierre con la referencia al backlog.

---

## 6. Supuestos que el backlog asume explícitamente (a confirmar por el usuario)

| # | Supuesto | Si es falso… |
|---|---|---|
| U-01 | La banda objetivo tiene un AUX libre para Analysis Bus (o acepta sacrificar uno) | El Setup Wizard debe ofrecer MTX como alternativa; se valida en P0.5 |
| U-02 | Hay un pendrive en la Ui24R para Player y multitrack | Room-Correct y Mix-A/B se retrasan hasta certificarlo |
| U-03 | Existe una tablet Android ≥ 10 (API 29) candidata a certificación | MVP0 sigue viable; MVP1 espera certificación |
| U-04 | Un desarrollador principal más agentes; tamaños en días-persona de referencia | Los tamaños se reescalan, el orden no cambia |
| U-05 | Idioma de UI: español; nombres de entidades y código en inglés | Sin impacto en el orden |
| U-06 | Presupuesto de soundcheck por wizard: ≤ 10 min Setup, ≤ 5 min por canal, ≤ 15 min Room QUICK | Se ajustan los caminos "quick" |
| U-07 | Grabaciones de Virtual Soundcheck viven en el pendrive de la Ui24R; la app guarda solo metadata | Política de datos a definir |

---

## Anexos

- `anexo-A-auditoria-tecnica.md` — Auditoría A completa (34 hallazgos, Capability Matrix v0, fuentes).
- `anexo-B-auditoria-producto-seguridad.md` — Auditoría B completa (46 hallazgos, 27 invariantes, 22 supuestos).

---

## 7. Segunda ronda: auditoría del backlog (C y D)

El backlog v1.0 derivado de estas decisiones fue auditado por dos agentes independientes más. Sus conclusiones están en `anexo-C` (estructura: grafo, orden, completitud) y `anexo-D` (calidad: criterios de aceptación, números, invariantes, riesgo, estimaciones), y están aplicadas en el backlog v1.1.

**Lo que encontraron y que obligó a cambiar decisiones:**

1. **El backlog violaba dos de sus propias ADR.** El reproductor se usaba como generador en MVP1 y MVP1.5, pero el servicio que implementa las invariantes de generación estaba dos versiones más adelante (ADR-02); y había escrituras en la consola en tres versiones antes de que existiera una sola prueba de la suite de seguridad (ADR-11). Corregido adelantando el generador seguro y rebanando la suite por versión.
2. **Una invariante era, en sí, destructiva.** "Al conectar, forzar mute y sends a −∞ del reproductor" habría silenciado la música de entrada o el clic de monitores de la banda. Se convierte en una reserva explícita, con guardado del estado previo, confirmación del usuario y restauración verificada.
3. **Tres números eran físicamente incorrectos.** La rampa de 6 dB/s consumía la mitad de un barrido de 10 segundos, dejando los graves 10 a 28 dB por debajo. El tope digital de −12 dBFS no acota el nivel acústico. La prueba del estimador de retardo comparaba contra un retardo absoluto que nadie conoce. Corregidos con pre-roll a nivel constante, nivel operativo del fader con techo, y prueba diferencial.
4. **Cuatro invariantes no eran testeables** tal como estaban: la antigüedad de lectura en un protocolo que solo empuja estado, la pérdida de paquetes sobre TCP, el ritmo de escrituras contra el tiempo de conmutación del bus, y la excepción de los envíos del reproductor a monitores.
5. **Faltaban cinco escenarios:** soundcheck activado con canales vivos, generador local durante el wizard de loopback, tablet bloqueada durante el lazo cerrado, dos instancias de la app, y firmware distinto al certificado. Son las invariantes INV-29 a INV-33.
6. **ADR-19 queda reservada** para la decisión con o sin interfaz externa, que se toma formalmente en DEC-19 tras el gate G-B.

**Efecto en las estimaciones:** el backlog pasó de 108 a 126 ítems y de ≈ 255 a ≈ 345 días-persona de esfuerzo medio, con 92 días de trabajo humano con hardware que no se paraleliza. El calendario realista es 10 a 12 meses hasta la versión con aplicación asistida y lazo cerrado, y 9 a 11 semanas hasta el primer entregable usable.
