# Ui24R Virtual Sound Engineer — Backlog técnico ejecutable v1.1

**Base:** Plan Maestro v1.1 → Auditoría integrada (ADR-01…ADR-18) → Backlog v1.0 → Auditorías C (estructura) y D (calidad) → **v1.1**.
**Cambios principales v1.0 → v1.1:** generador seguro adelantado a EP-05 (C-01/D-01); suite de seguridad rebanada por MVP y cableada como dependencia (C-02); gates cableados en el grafo (C-03); P0.3b antes de P0.3 con decisión DEC-19 (C-07); spikes nuevos SPK-ACK-POLICY, SPK-P0.7a/b, SPK-P0.10b, SPK-P0.2b, SPK-PA-BUS, SPK-REPEAT; historias divididas (S-02.5, S-02.9, S-02.10, S-05.1, S-06.1) y nuevas (S-05.10, S-07.0, S-11.6, S-12.1a-d, S-12.2a-b, DEC-19); invariantes renombradas INV-nn y ampliadas a 33 (D); números corregidos (pre-roll, nivel operativo, delay finder diferencial, clip, Findings por frecuencia, confianza por dominio); criterios de éxito y plantilla para pruebas de campo (D-49); DoD para historias y spikes, protocolo de FAIL de gates (D-50/51); re-estimación (+20 %).

## Convenciones

- `EP-nn` épica · `S-nn.m` historia · `SPK-*` spike (PASS numérico, no AC funcionales) · `DEC-*` decisión · `G-x` gate · `INV-nn` invariante (ver [docs/safety-invariants.md](../safety-invariants.md)).
- Prioridad: P0 (bloquea lo posterior) · P1 (valor de producto) · P2 (asistido) · P3 (post-MVP).
- Tamaño en días-persona: **S** = 1 · **M** = 2–3 · **L** = 4–5 · **XL** = 6–9 (solo cuando la división no reduce el riesgo).
- Carril: **CORE** (dominio, safety, datos) · **MIXER** (protocolo, adapter) · **AUDIO** (plugin nativo, DSP) · **UX** (pantallas, wizards) · **FIELD** (humano con hardware: spikes, HIL, campo, gates; **capacidad 1**, no paralelizable con otro FIELD).
- Cada historia declara solo *Depende de* (la lista inversa se genera en `docs/` por script; C-12). El orden global está en `03-orden-implementacion.md`.
- AC negativos obligatorios en toda historia que escribe en la consola o reproduce audio: "Given <precondición falsa>, When …, Then no se envía el comando, se muestra el motivo y se registra".

**Definition of Done — historia:** todos los AC con evidencia enlazada (id de test, log, captura) · tests unitarios en verde · log estructurado · Capability/Hardware Matrix y ADR actualizados si aplica · CHANGELOG · revisión por **persona** si toca `write()`, Safety Engine, generador o invariantes (agente solo como pre-revisión) · la rebanada de EP-12 que le corresponde en verde.
**Definition of Done — spike:** charter cerrado con PASS/FAIL por criterio y evidencia en `docs/spikes/<id>/` · matrices y registro de riesgos actualizados · ADR si cambia una decisión · código en `tools/spikes/` sin obligación de tests ni CHANGELOG · timebox respetado o extensión aprobada por escrito.
**Gates:** acta en `docs/gates/G-x.md` con tabla *criterio → bloqueante/informativo → resultado → acción en FAIL*; un solo re-run por criterio bloqueante antes de escalar a decisión de alcance (ADR); owner = desarrollador principal; acta firmada con fecha.

**Mapa de épicas y gates (v1.1)**

```text
EP-00 Gobernanza ──┐
EP-01 Spikes 0a ───┴► G-A ─► EP-02 Foundation (+S-12.1a) ─► EP-03 MVP0 Console Telemetry & Gain
EP-04 Spikes consola + audio ─► G-B ─► DEC-19 ─► EP-05 Basic Audio Engine + generador seguro + S-12.1b/2a ─► G-C
G-C ─► EP-06 MVP1 Channel ─► EP-07 Room-Observe (MVP1.5) ─► EP-08 Mix-Live (MVP2a) ∥ EP-10 Room-Correct (MVP3)
EP-11 SPK-P0.7a/b ─► G-D ─► Mix-A/B (MVP2b)
EP-12 S-12.1c/d + S-12.2b + S-12.3 ─► G-E ─► EP-13 Assisted Apply canal (MVP4a) ─► EP-14 Room asistido + closed loop (MVP4b)
EP-15 Post-MVP (esbozo)
```

---

## EP-00 — Gobernanza, repositorio y documentación mínima  (P0 · CORE)

### S-00.1 Crear repositorio y estructura base
- Tamaño: S · Depende de: —
- AC: (1) Repo GitHub `ui24r-virtual-sound-engineer`, rama `main` protegida (PR obligatorio). (2) Monorepo: `apps/mobile` (Angular + Capacitor; plugin nativo en `apps/mobile/android`), `packages/domain`, `packages/mixer-adapter`, `packages/dsp-contract`, `docs/` (adr, spikes, gates, field, matrices, specs vivas), `tools/hil`, `tools/spikes`, `tools/docs` (validador de IDs y generador de dependencias inversas). (3) CI: lint + unit + build APK debug por PR; commitlint. (4) `README` con mapa de épicas y estado de gates.

### S-00.2 Registro de ADR
- Tamaño: S · Depende de: S-00.1
- AC: `docs/adr/ADR-01…18.md` (Contexto / Decisión / Consecuencias / Hallazgos de origen), estado `Accepted`; plantilla; ADR-19 reservado para DEC-19.

### S-00.3 Charters de spikes con PASS numérico
- Tamaño: M · Depende de: S-00.1
- AC: un charter por spike de este backlog (P0.1, ACK-POLICY, P0.2a/b/c, P0.3, P0.3b, LIFE, P0.4', P0.5, P0.6', P0.7a/b, P0.8, P0.9, P0.10a/b, CAL, LOOP, SAFE-GEN, PA-BUS, REPEAT) con objetivo, montaje, pasos, PASS numérico copiado de aquí, evidencia a entregar, timebox, criterios bloqueantes vs informativos.

### S-00.4 Capability Matrix v0, Hardware Matrix y registro de riesgos
- Tamaño: S · Depende de: S-00.1
- AC: `docs/capability-matrix.md` (40 filas del anexo A; columnas función, API tipada, RAW path, unidad, estado, probado, versión librería 7.0.3, firmware). `docs/hardware-matrix.md` (tablet, Android/API, interfaz, hub, pendrive, **router**, dual input, UNPROCESSED, xruns/3 h, carga+host, estado) con **≥ 2 tablets candidatas** listadas antes de SPK-P0.3. `docs/risk-register.md` con los riesgos de las 4 auditorías, owner y mitigación (incluye "solo 2 salas probadas de los 6 tipos de §109").

### S-00.5 Definition of Done, convenciones y flujo de ramas
- Tamaño: S · Depende de: S-00.1
- AC: `CONTRIBUTING.md` con DoD historia y DoD spike (texto de arriba), naming de ramas, commits, regla "ningún write RAW fuera de tabla", regla "ningún MVP con writes sin su rebanada de EP-12", checklist de PR (riesgo, impacto en seguridad, matriz actualizada, evidencia por AC), plantilla de informe de campo (`docs/field/TEMPLATE.md`, anexo D §6).

### S-00.6 Invariantes de seguridad v1.1
- Tamaño: S · Depende de: S-00.1
- AC: `docs/safety-invariants.md` = [docs/safety-invariants.md](../safety-invariants.md) (INV-01…INV-33) con estado por invariante (definida / unit / HIL).

---

## EP-01 — Fase 0a: spikes de consola  (P0 · MIXER/FIELD) → G-A

Montaje: Ui24R + router dedicado + laptop/tablet con Node. No requiere Scarlett.

### SPK-P0.1 Conectividad, reconexión, echo y cadencia VU2
- Tamaño: M · Depende de: S-00.3
- PASS: (1) 20 ciclos por cada modo de corte (apagar router, cambiar IP, cortar Wi-Fi) → reconexión automática < 10 s **desde que la red vuelve a estar disponible** en 20/20, con volcado completo recibido. (2) Echo: ¿un `SETD` propio vuelve por `inbound$`? SÍ/NO con captura (informativo; activa SPK-ACK-POLICY). (3) Cadencia VU2: intervalo medio, mediana, p95, jitter → T_gap = 3× media. (4) 3 clientes simultáneos 10 min: estado final idéntico entre clientes.

### SPK-ACK-POLICY Política de confirmación de writes
- Tamaño: S · Depende de: SPK-P0.1
- PASS: `docs/ack-policy.md` (1 página): tabla parámetro → método de confirmación {ECHO, VU, RECONNECT-DUMP, NONE} y texto normativo de INV-11 ajustado al resultado de P0.1.

### SPK-P0.2a Capability Matrix — lectura/escritura básica
- Tamaño: XL · Depende de: S-00.4, SPK-P0.1
- PASS: (1) CONFIRMADO en hardware: fader canal/master, mute, pan, name, gain preamp, phantom (lectura), AUX send level/mute/pre-post/pre-post-proc, MTX fuente master, delay de salidas, **Player L/R: mute, fader, pan, sends a todos los buses, estado PLAYING**, snapshots (save/load/list), shows, Media Player (listas, load, play, stop), multitrack (rec/play/stop/soundcheck, `recording$`), device info. (2) `settings.auxsendpoint`/`mtxsendpoint`: efecto documentado. (3) Stereo link: efecto sobre sends del canal vecino documentado. (4) Entregables: Capability Matrix v1 y `docs/protocol-spec.md` v1 (mensajes, paths, unidades) generado desde la matriz.

### SPK-P0.9 Concurrencia y presencia
- Tamaño: M · Depende de: SPK-P0.1
- PASS: (1) Prototipo `ConfirmedStateStore` desde `inbound$` + correlación SELF/EXTERNAL (ventana 300 ms; 1 000 ms durante ráfaga): 100 cambios externos durante 100 writes propios → 100 % EXTERNAL, 0 sobrescrituras, ≥ 98 % SELF. (2) Recall desde la web durante escritura → ráfaga (> 10 paths en < 1 s) detectada 10/10. (3) Arrastre de fader → un único cambio externo. (4) Mecanismo de presencia para INV-32 validado (`BMSG^SYNC` o snapshot `VSE_LOCK_*`).

### SPK-P0.8 Snapshots y alcance del recall
- Tamaño: M · Depende de: SPK-P0.2a
- PASS: show `VSE` creado (por protocolo o manual, documentado); 50 ciclos save/load `VSE_AUTO_*` 50/50; hash de snapshots manuales idéntico; diff completo del estado tras `LOADSNAPSHOT` (¿incluye gain, phantom, AFS2, patch, delays, Player?); comportamiento de nombre existente; delete/rename por protocolo SÍ/NO; glitch audible al guardar SÍ/NO.

### SPK-P0.7a Virtual Soundcheck — protocolo (solo consola)
- Tamaño: M · Depende de: SPK-P0.2a
- PASS: captura de mensajes al seleccionar sesión y arrastrar la barra de tiempo (seek/selección SÍ/NO); REC/PLAY/STOP por protocolo 3/3 sin `busy$` con pendrive candidato (22 canales, 5 min); pasos manuales para entrar/salir ≤ 3; `hw.disablegain` y `scsrc` documentados, incluido **canal LIVE con `scsrc` = hardware durante Soundcheck**; pendrive en Hardware Matrix. Si REC no es posible por protocolo: plan B documentado (REC manual en la web + detección por lectura).

### SPK-P0.10a Validación DSP básica y parámetros normativos (desktop, sin hardware)
- Tamaño: M · Depende de: S-00.3
- PASS: referencia (Python/REW) vs prototipo del DSP sobre los mismos archivos (silencio, sine, pink, sweep, voz, **guitarra, bajo, percusión, full band**, clipping, **very low signal**): RMS ± 0,1 dB; sample-peak ± 0,05 dB; true-peak (BS.1770-4, ×4) ± 0,2 dB; FFT ± 0,5 dB por banda 1/3 oct. Tabla normativa en `docs/dsp-spec.md`: FFT multi-resolución (≥ 32k @ 48 kHz para < 100 Hz), Hann, solape 50 % (75 % opcional en TF), promediado exponencial y lineal (≥ 16 s para < 100 Hz, 8 s resto), suavizado 1/3-1/6-1/12, RMS fast 300 ms / slow 3 s, clip por audio = ≥ 3 muestras consecutivas ≥ −0,1 dBFS o > 0 dBTP, ruido = percentil 10 del espectro en silencio dirigido, "no clipping interno" (§112) verificado en la cadena de procesamiento.

### G-A — Gate
- Tamaño: S · Depende de: SPK-P0.1, SPK-ACK-POLICY, SPK-P0.2a, SPK-P0.9, SPK-P0.8, SPK-P0.7a
- AC: acta con bloqueantes (P0.9 sobrescrituras = 0; P0.2a subconjunto MVP0 CONFIRMADO; P0.8 snapshots manuales intactos) e informativos (echo, seek, glitch). Desbloquea EP-02/EP-03.

---

## EP-02 — Foundation  (P0 · CORE/MIXER/UX)

### S-02.1 Proyecto Angular + Capacitor + Android
- Tamaño: M · Depende de: S-00.1
- AC: Angular LTS (standalone, signals), Capacitor 6, Android minSdk 29, tema oscuro único, APK debug en CI, arranque < 3 s, landscape bloqueado, nombre de app.

### S-02.2 Persistencia SQLite
- Tamaño: M · Depende de: S-02.1
- AC: `@capacitor-community/sqlite` con migraciones versionadas; repositorio genérico tipado; test de migración desde v0; export/import de la base a archivo.

### S-02.3 Logging estructurado
- Tamaño: M · Depende de: S-02.2
- AC (INV-22): eventos `ts, sessionId, category, level, payload`; writes con `transactionId, path, expected, previous, sent, ack, verified`; rotación ≥ 30 sesiones; export `.jsonl`; sin PII de terceros.

### S-02.4 Modelo de dominio v1
- Tamaño: XL · Depende de: S-00.2, S-02.2
- AC: (1) Entidades TS con validación: `BandProfile`, `BandMember`, `ChannelAssignment` (ui24rInputIndex, bandMemberId, instrument, channelProfileId, defaultRole, micModel, name, **isLive**), `ChannelProfile` (rangos, no presets), `MusicalRole`, `MixScene`, `PerformanceContext`, `VenueProfile` (historial de sesiones, house curve, measurements, corrections, historical score), `PAProfile` (**components[] {name, bus: master|aux N|mtx N, muteable}**, outputBuses[], tops, subs, crossoverHz, usableRange, **generatorFaderDb**), `MeasurementMicProfile`, `SoundSession`, `Measurement` (source, referenceMode, paComponent, channelId, position, micProfileId, calibrationStateId, sceneId, signalType, buildState, **directRef/acousticRef**, metrics), `Finding` → `Hypothesis` → `Recommendation` (campos §73 + `findingId`, `evidenceMeasurementIds[]`, `status`, `verification`, `currentUnknown`), `Observation`, `ChangeTransaction` (`recommendationIds[]`, `snapshotRef`, `measurementBeforeId/AfterId`, `changes[]` con `previousValue`, `confirmedBy`), `Snapshot`, `VersionedParameterState` (value, version, timestamp, source ∈ SELF/EXTERNAL/UNKNOWN), `VirtualSoundcheckTake`, `MixCandidate`, `CalibrationState`. (2) `docs/domain-model.md` generado desde los tipos. (3) 100 % round-trip SQLite. (4) **Confianza por dominio:** Room — consistencia ≥ 0,8 y |desviación| ≥ 2·σ_banda (SPK-REPEAT); Channel — dos capturas consecutivas con el mismo Finding (misma banda ± 1/6 oct, mismo signo) y SNR ≥ 20 dB en la banda; Mix — Finding presente en ≥ 2 de 3 ventanas de 10 s; MEDIUM/LOW con umbrales a la mitad; INSUFFICIENT_DATA si duración < mínimo o `calibrationState = INVALID`. (5) Fórmulas de `roomScore` (target deviation, consistency, smoothness, noise floor) y `mixScore` con ejemplos numéricos en `docs/scores.md`.

### S-02.5a MixerDomainAPI y mock
- Tamaño: M · Depende de: G-A, S-02.4
- AC: interfaz sin referencia a `soundcraft-ui-connection` (lint de imports); `read(param) → {value, confirmedAt, source, version, storeState}`; `write(param, value, expected) → {status: APPLIED|CONFLICT|UNVERIFIED|REJECTED, confirmedBy}`; mock configurable con/sin echo según P0.1.

### S-02.5b ConfirmedStateStore y correlación
- Tamaño: M · Depende de: S-02.5a, SPK-P0.9
- AC (ADR-05): store alimentado solo por `inbound$`; estado VALID/INVALID (INV-11); test: un write propio no confirmado no aparece como confirmado; correlación SELF/EXTERNAL (300 ms / 1 000 ms en ráfaga); `BulkExternalChange` (> 10 paths en < 1 s o cambio de `currentSnapshot`); presencia INV-32.

### S-02.5c Cobertura de parámetros del adapter
- Tamaño: M · Depende de: S-02.5b, SPK-P0.2a
- AC: fader, mute, pan, name, gain (lectura y escritura), phantom (lectura), AUX sends (nivel, mute, pre/post, pre/post-proc), MTX fuente, delays de salida, VU2 → dB, snapshots, shows, Media Player incl. Player L/R (mute, fader, sends, estado), multitrack (`recording$`, `soundcheck$`, `scsrc`), device info (modelo, firmware → INV-33).

### S-02.6 Tabla de mapeo RAW y round-trip
- Tamaño: M · Depende de: S-02.5c
- AC (ADR-06): módulo `raw-map` `{path, rawMin, rawMax, unit, toRaw(), fromRaw(), physicalMin, physicalMax}`; round-trip ≤ 1 % del rango con ≥ 5 puntos por parámetro del subconjunto de P0.2a; `write()` rechaza path sin entrada o valor fuera de rango físico; INV-33 aplicada (firmware ≠ matriz → sin RAW).

### S-02.7 Máquina de estados de conexión
- Tamaño: M · Depende de: S-02.5b
- AC (INV-17/18): CONNECTED/UNSTABLE/RECONNECTING/DISCONNECTED; UNSTABLE por cadencia VU2 (gap > T_gap o p95 > 2× mediana); al reconectar, store INVALID hasta volcado completo y evento `StateResynced` con diff; tests con mock simulando gaps.

### S-02.8 Registro de Parameter Ownership
- Tamaño: S · Depende de: S-02.5a
- AC (ADR-10, INV-07/08/09/10): tabla owner por parámetro (Channel / Mix / Room / System / USER-ONLY); `write()` rechaza USER-ONLY con error tipado; test estático que enumera los paths escribibles y verifica INV-08 e INV-10 (única excepción Player→monitor hacia −∞ en PLAYER_RESERVE).

### S-02.9a Pipeline único de escritura, lint y lista blanca
- Tamaño: M · Depende de: S-00.6, S-02.3, S-02.7, S-02.8
- AC: `Assistant → Recommendation → Transaction → SafetyEngine.check() → MixerDomainAPI.write()` es el único camino (lint); lista blanca de writes durante bloqueo {MEDIA_STOP, MTK_STOP, mute Player L/R, ROLLBACK, restauraciones System}; bloqueo por estado de conexión (INV-17).

### S-02.9b Reglas por invariante y matriz de autonomía
- Tamaño: M · Depende de: S-02.9a
- AC: predicados con ID: INV-04 (deltas y topes acumulados), INV-05 (límites y exención System con pacing 20 ms), INV-06 (gain solo en CHANNEL_SETUP), INV-08/09/10, INV-24; matriz Parámetro × Nivel de autonomía × MVP en código y `docs/autonomy-matrix.md`; un test por invariante.

### S-02.12 SoundSession y ciclo de vida
- Tamaño: M · Depende de: S-02.4
- AC: `docs/session-lifecycle.md` con tabla de transiciones `CREATED → SETUP → CALIBRATING → ROOM_OBSERVE → CHANNEL_SETUP → SOUNDCHECK_REC → MIX → SOUNDCHECK_PLAY ⇄ MIX → FULL_BAND → RINGOUT → SHOW → CLOSED`; retroceso a CHANNEL_SETUP solo sin `VirtualSoundcheckTake` activo (INV-06) y con invalidación explícita de Measurements posteriores; ROOM_OBSERVE/ROOM_CORRECT re-entrantes desde MIX; test matriz estado × transición; una sola sesión activa; reanudación tras crash; la sesión referencia `venueProfileId` (crear/elegir venue al iniciar) y `bandProfileId`; snapshot inicial y final; export `.zip` (`session.json` + `events.jsonl` + `report.md`, sin audio).

### S-02.10a Transacciones: estados, journal write-ahead, recuperación
- Tamaño: M · Depende de: S-02.9b
- AC: estados DRAFT → APPROVED → SNAPSHOTTED → APPLYING → VERIFYING → APPLIED | PARTIAL | CONFLICT | SUSPENDED | ROLLED_BACK; journal en SQLite antes de cada write (INV-20); al iniciar, transacciones APPLYING/VERIFYING listadas con diff real; nunca reaplicadas (test: kill simulado entre write 2 y 3 de 4).

### S-02.10b Rollback granular, ráfagas y confirmedBy
- Tamaño: M · Depende de: S-02.10a
- AC: rollback por change restaura `previousValue` leído y verifica (INV-02); rollback de transacción en orden inverso; `BulkExternalChange` → SUSPENDED + `measurementBefore` invalidado (INV-21); `confirmedBy` por change según SPK-ACK-POLICY.

### S-02.11 Emergency Stop local-first
- Tamaño: L · Depende de: S-02.9a
- AC (INV-19): botón ≥ 64 px en el 100 % de pantallas y modales (test de UI que recorre todas las rutas); acciones locales ≤ 200 ms sin red; remotas con reintento ×3 y confirmación; sin confirmación en 2 s → alerta persistente; no toca master ni canales; rearme explícito con re-lectura total.

### S-02.13 Snapshot manager
- Tamaño: M · Depende de: SPK-P0.8, S-02.5c, S-02.10a
- AC (INV-01/03): solo `VSE_AUTO_<ts>` en show `VSE`; colisión comprobada en `shows$`; retención 20; ninguna transacción a APPLYING sin `snapshotRef` verificado; hash de no-VSE intacto en HIL.

### S-02.14 Ciclo de vida Android
- Tamaño: M · Depende de: S-02.1, S-02.7
- AC: Foreground Service con notificación persistente; wake lock parcial y Wi-Fi lock; conexión sobrevive a pantalla apagada 30 min y background 10 min (documentado); al iniciar sesión, si DND está OFF se sugiere activarlo (intent a ajustes) y el estado DND se muestra en START SESSION; política de batería recomendada.

### S-12.1a Tests unitarios de invariantes — MVP0/MVP1 (lectura, routing, red, E-Stop)
- Tamaño: M · Depende de: S-02.9b, S-02.10b, S-02.11, S-02.13
- AC: tests con ID para INV-03, 07, 08, 09, 10, 17, 18, 19, 21 (detección), 22, 24, 32, 33; corren en CI.

---

## EP-03 — MVP0: Console Telemetry & Gain  (P1 · UX/CORE) — sin Scarlett, sin writes

### S-03.1 Wizard de conexión
- Tamaño: M · Depende de: G-A, S-02.5c, S-02.7
- AC: IP o descubrimiento; modelo y firmware comparados con la Capability Matrix (INV-33: aviso y RAW deshabilitado si difiere); estado de conexión en header (4 estados); recuerda última IP y **SSID** (aviso si cambia respecto a la sesión anterior); READ-ONLY si hay otra instancia (INV-32).

### S-03.2 ChannelAssignment y BandProfile
- Tamaño: M · Depende de: S-02.4, S-03.1
- AC: 24 inputs con nombre sincronizado; asignar integrante, instrumento, ChannelProfile (Lead Vocal, Backing Vocal, Acoustic Guitar, Electric Guitar, Bass, Percussion, Flute, Keyboard, Playback, Speech, Custom), rol por defecto, micrófono, **isLive**; guardar/precargar BandProfile; renombres en consola detectados y ofrecidos para re-mapear.

### S-03.3 Vista de telemetría
- Tamaño: M · Depende de: S-03.1
- AC: por canal VU pre/post/post-fader en dB, gain, fader, mute; **contador de clips por telemetría** = frames de `vuPre` ≥ V_clip (calibrado en SPK-P0.10b; frames consecutivos = 1 evento); refresco ≥ 10 fps, ningún frame > 50 ms en 60 s (profiler); texto centrado ≥ 16 px.

### S-03.9 Recuperación tras desconexión
- Tamaño: M · Depende de: S-02.7
- AC (B-37): banner persistente con estado; captura en curso marcada "sin telemetría"; al reconectar, resumen "N parámetros cambiaron mientras no estábamos conectados" con lista; ninguna acción automática; (desde MVP4a) lista de transacciones SUSPENDED.

### S-03.4 Gain Assistant por telemetría (SUGGEST)
- Tamaño: L · Depende de: S-03.2, S-03.3, S-02.9b, SPK-P0.10b
- AC: (1) por canal: instrucción según perfil, ventana 15–20 s, cuenta regresiva, captura de `vuPre` y `gainDB`. (2) peak, promedio (RMS 3 s), headroom vs objetivo del perfil, probabilidad de clip (fracción de frames ≥ V_clip), estabilidad (σ del nivel), gain actual y recomendado. (3) Recomendación con campos §42/§73 y `confidence` (definición Channel de S-02.4); delta ≤ INV-04; etiqueta "sin corrección de sala" hasta que exista Room. (4) Cero writes (test). (5) 5 perfiles iniciales con rangos en `docs/channel-profiles.md`, checklist de revisión con fecha y firma del usuario.

### S-03.5 UI de recomendaciones y observaciones
- Tamaño: M · Depende de: S-03.4
- AC: tarjeta con parameter, current (o "desconocido" si `currentUnknown`), proposed, delta, reason, confidence, evidence (enlace a Measurement), risk, expectedImpact; estados ACCEPTED (manual) / DISMISSED / EXPIRED; `Observation` sin proposedValue con etiqueta de dominio; filtros.

### S-03.7 Show Monitor (solo lectura)
- Tamaño: M · Depende de: S-03.3, S-03.2
- AC: alertas: clipping en canal (≥ 3 eventos en 10 s); lead vocal ≥ 4 dB por debajo de su referencia (promedio de `vuPostFader` en el Full Band Test o "marcar ahora") durante ≥ 10 s con voz activa (`vuPre` ≥ −40 dB); master ≥ V(−3 dBFS) durante ≥ 5 s continuos; red UNSTABLE; alerta visual grande + opcional sonora en la tablet (nunca por USB); histórico; cero writes (test). Nota en UI: alertas espectrales solo con Input 2 = MASTER_REFERENCE (EP-08).

### S-03.8 Modo Show
- Tamaño: M · Depende de: S-03.7, S-02.11
- AC (B-38): texto ≥ 24 px, contraste ≥ 7:1, solo alertas críticas y estado de red, bloqueo de toques con hold-to-unlock 1,5 s, E-Stop accesible, ningún write salvo lista blanca; entrada/salida explícita.

### S-03.6 Change log y resumen de sesión
- Tamaño: S · Depende de: S-02.12, S-03.5
- AC: log cronológico (SELF/EXTERNAL) y recomendaciones; resumen al cerrar; export `.zip` (S-02.12).

### S-03.10 Prueba de campo MVP0
- Tamaño: M · Depende de: S-03.1…S-03.9, S-12.1a
- AC: ensayo real en modo avión + Wi-Fi local (offline-first); informe con plantilla `docs/field/TEMPLATE.md`. **Éxito:** ≥ 80 % de canales ≤ 5 min; ≥ 50 % de recomendaciones aceptadas o valoradas ≥ 4/5; 0 falsos positivos de clipping confirmados; 0 writes en el log. **Fracaso (re-ejecutar):** cualquier write; > 1 crash; > 2 alertas de red falsas.

---

## EP-04 — Fase 0b: spikes de consola y de audio  (P0 · FIELD/MIXER/AUDIO) → G-B

Los spikes marcados *(solo consola)* pueden ejecutarse en paralelo con EP-03.

### SPK-P0.6' Media Player como generador *(solo consola)*
- Tamaño: M · Depende de: SPK-P0.2a
- PASS: archivos pink/sine/burst (WAV 48 kHz, tope −12 dBFS, pre-roll INV-15) reproducidos desde el Player; PLAY→audio p50/p95 documentado (informativo); **STOP→silencio en Input 2 ≤ 500 ms p95 (bloqueante)**; sends Player→AUX de monitores −∞ y verificados por lectura; mute Player L/R 10/10; PLAYER_RESERVE prototipo: hash del Player idéntico tras reservar/liberar; notificación sonora durante reproducción → < −90 dBFS en Input 2 (INV-26).

### SPK-P0.10b Calibración y balística del VU2 *(solo consola)*
- Tamaño: M · Depende de: SPK-P0.2a, SPK-P0.6'
- PASS: tono −20 / −6 / −1 dBFS por **loop físico AUX ANALYSIS → input libre en modo línea** → lectura `vuPre` documentada (V_clip = lectura a −1 dBFS); balística (peak vs RMS, ataque/caída) con burst; tasa de frames; si 0 dB del VU ≠ 0 dBFS, tabla de conversión.

### SPK-P0.5 Analysis Bus *(solo consola)*
- Tamaño: M · Depende de: SPK-P0.2a
- PASS: canal X a 0 dB, resto −∞: nivel en Input 2 (o input línea libre) esperado ± 0,5 dB; aislamiento medido en el bin del tono (FFT 32k, Hann, tono −6 dBFS en canal no seleccionado) < −80 dBFS; taps PRE-PROC / POST-PROC / POST verificados con EQ extremo; `a.B.safe` protege el bus ante recall SÍ/NO; **stereo link:** con X linkeado a X+1, ¿X+1 también cambia? aislamiento resultante; tiempo real de conmutación con pacing 20 ms (número que adopta S-06.3).

### SPK-P0.2b Capability Matrix — procesamiento de canal *(solo consola)*
- Tamaño: XL · Depende de: SPK-P0.2a, S-02.6
- PASS: HPF (freq, slope), PEQ b1–b4/b5 (gain, q, freq), comp (threshold, ratio, attack, release, gain), gate (thresh, depth), de-esser: tabla raw↔físico ≥ 7 puntos por parámetro extraída del JS de la web app o capturada; escritura probada en hardware: *Given canal de prueba sin señal, fader −∞, mute ON, fuera de todo AUX (verificado por lectura) y master muteado manualmente (confirmación), When se escribe cada parámetro al 10/50/90 % del rango, Then la lectura coincide ± 1 % y ningún otro path cambió (diff del store = solo el path escrito)*; nunca en SHOW. Matriz v2. FAIL → plan B "valores absolutos sin current" (03 §Bifurcaciones).

### SPK-P0.2c Capability Matrix — salidas *(solo consola)*
- Tamaño: L · Depende de: SPK-P0.2a, S-02.6
- PASS: para AUX/master: PEQ (bandas, gain, q, freq), HPF/LPF, GEQ 31 bandas (existe por red SÍ/NO; si NO, Room-Correct usa PEQ), delay, polaridad, AFS2 lectura (numfixed/numtotal): tabla ≥ 7 puntos, round-trip ≤ 1 %, escritura probada con el mismo protocolo negativo de P0.2b en una salida no usada; matriz v3.

### S-06.7 raw-map v2 (procesamiento y salidas)
- Tamaño: M · Depende de: SPK-P0.2b, SPK-P0.2c
- AC: entradas de `raw-map` para todos los parámetros de P0.2b/P0.2c con tests de round-trip; parámetros FAIL marcados `unmapped` (write rechazado, lectura permitida si es posible).

### SPK-PA-BUS Topología muteable de salidas *(solo consola)*
- Tamaño: S · Depende de: SPK-P0.2a
- PASS: para master/AUX/MTX: qué se puede mutear individualmente por protocolo; efecto audible (clic) del mute en salidas; tiempo mute→silencio en Input 2; documentado para `PAProfile.components[].muteable`.

### SPK-P0.3b Ui24R USB-B directo al tablet (timebox 2 días)
- Tamaño: S · Depende de: S-00.3
- PASS/FAIL: tablet enumera la Ui24R por USB-B; canales de captura negociados; si ≥ 24 canales @ 48 kHz estables 30 min → informativo para DEC-19. Se ejecuta **antes** de SPK-P0.3.

### SPK-P0.3 Certificación tablet + Scarlett
- Tamaño: L · Depende de: S-00.3, SPK-P0.3b
- PASS (bloqueante): tablet candidata con hub PD: 4 h capturando 2 canales @ 48 kHz cargando; xruns ≤ 1/h; temperatura estable; `PROPERTY_SUPPORT_AUDIO_SOURCE_UNPROCESSED` (true o fallback documentado); Input 1 ≠ Input 2; phantom conmutado a mano detectado; fila completa en Hardware Matrix. FAIL → segunda tablet (timebox 5 d) → si FAIL, ADR de alcance.

### SPK-LIFE Ciclo de vida Android con audio
- Tamaño: M · Depende de: SPK-P0.3
- PASS: captura USB con pantalla apagada 30 min, background 10 min, DND activo, llamada entrante: SÍ/NO + comportamiento; los NO → restricciones de UX documentadas.

### SPK-CAL Calibración de ganancia de Scarlett
- Tamaño: S · Depende de: SPK-P0.5, SPK-P0.6', SPK-P0.3
- PASS: Input 2 en modo línea con gain al **mínimo físico**; tono −20 dBFS desde el Player por el Analysis Bus; ajuste fino a −20 ± 0,2 dBFS con el fader master del AUX ANALYSIS (owner System); 10 sesiones → σ ≤ 0,2 dB sin tocar la Scarlett.

### G-B — Gate
- Tamaño: S · Depende de: SPK-P0.10a, SPK-P0.3b, SPK-P0.3, SPK-LIFE, SPK-P0.5, SPK-P0.6', SPK-P0.10b, SPK-CAL, SPK-PA-BUS
- AC: acta; bloqueantes: P0.3 (xruns, UNPROCESSED o fallback, carga+host), P0.6' STOP ≤ 500 ms e INV-26, P0.5 aislamiento; informativos: P0.3b, LIFE; §112 verificado punto por punto (repetibilidad, dual input, no clipping interno, FFT/RMS, captura estable, generador); Hardware Matrix con ≥ 1 tablet Certified.

### DEC-19 Decisión de arquitectura con/sin Scarlett (ADR-19)
- Tamaño: S · Depende de: SPK-P0.3b, G-B
- AC: ADR-19 escrito. Si P0.3b PASS y se adopta: SPK-CAL, S-05.8 (parte Scarlett), S-06.2, S-06.3, SPK-LOOP, S-07.0 → CANCELLED o reescritas; S-05.1 captura N-canal; ADR-15 retirado (espectro por canal simultáneo); FOH mic por input de la Ui24R; nuevo SPK-P0.3c "certificación tablet + Ui24R USB-B 4 h". Si FAIL o no se adopta: sin cambios.

---

## EP-05 — Basic Audio Engine nativo y generador seguro  (P1 · AUDIO/CORE) → G-C

### S-05.1a Plugin Capacitor: enumeración y captura N-canal
- Tamaño: L · Depende de: SPK-P0.3, DEC-19, S-02.1
- AC (ADR-01): Kotlin: enumerar dispositivos USB de entrada/salida; abrir captura de **N canales (N ≥ 2)** 48 kHz float/24 bit sobre el dispositivo elegido (`setPreferredDevice`); `AudioSource.UNPROCESSED` con fallback declarado en el resultado; test instrumentado Input 1 ≠ Input 2.

### S-05.1b Plugin: servicio, xruns, timestamps, eventos USB
- Tamaño: M · Depende de: S-05.1a, S-02.14
- AC: contador de xruns y `AudioTimestamp`; eventos conexión/desconexión USB; Foreground Service compartido; test instrumentado de 30 min sin xruns en la tablet certificada.

### S-05.2 Métricas de nivel nativas
- Tamaño: M · Depende de: S-05.1a
- AC: RMS fast/slow, sample-peak, true-peak (BS.1770-4 ×4), crest, clipping (≥ 3 muestras ≥ −0,1 dBFS o > 0 dBTP), noise floor (percentil 10 en silencio); por canal cada 100 ms; validado por S-05.9.

### S-05.3 FFT multi-resolución, suavizado y promediado
- Tamaño: L · Depende de: S-05.1a
- AC: según `docs/dsp-spec.md`; bandas 1/3, 1/6, 1/12 oct 20 Hz–20 kHz; promediado exponencial y lineal (≥ 16 s < 100 Hz); ≤ 15 % de un núcleo (medido).

### S-05.6 Ventanas de grabación
- Tamaño: M · Depende de: S-05.1a
- AC: ventana de N s a WAV 48 kHz 24 bit N-canal con metadata (sessionId, measurementId, calibrationStateId); reproducción por auriculares de la Scarlett solo si el Setup verificó que Scarlett OUT no está cableada a la consola y nunca durante una captura; retención configurable.

### S-05.5 Delay finder
- Tamaño: M · Depende de: S-05.3
- AC: correlación cruzada Input 1 vs Input 2, rango 0–200 ms; **test diferencial**: τ₀ con delay de salida 0 ms y τ_k con 10/50/150 ms → |(τ_k − τ₀) − k| ≤ 2 muestras (banda ancha); para señales con ancho de banda < 500 Hz, precisión ≤ 1/8 del período de la frecuencia superior con correlación sobre envolvente; compensación aplicada antes de H(f).

### S-05.4 Transfer function dual-canal y coherencia
- Tamaño: L · Depende de: S-05.3, S-05.5
- AC (ADR-03): H(f) = S12/S11 (magnitud y fase), γ² = |S12|²/(S11·S22); máscara con umbral 0,7 (≥ 0,8 para Findings de EQ) y **solo con ≥ 16 promedios** (menos → "insuficiente"); validado por loopback eléctrico con pink: magnitud ± 0,5 dB y γ² > 0,95 en 20 Hz–20 kHz.

### S-05.7 Contrato del bridge y visualización
- Tamaño: M · Depende de: S-05.2, S-05.3
- AC: `packages/dsp-contract` (levels, spectrum ≤ 240 bins, TF, coherence, delay, xruns); ≤ 20 eventos/s; servicio Angular con signals; ≥ 20 fps y ningún frame > 50 ms (profiler); ningún PCM cruza el bridge (test).

### S-05.8 Estado de calibración aplicado a mediciones
- Tamaño: M · Depende de: S-05.2, SPK-CAL
- AC: `CalibrationState { scarlettGainRefDbfs, analysisBusTrimDb, in1In2Offset[], loopbackId?, splOffset?, validUntil }` en toda Measurement; INV-27 (> 1 dB → INVALID y aviso); sin calibración → `NONE` y `confidence` ≤ MEDIUM.

### S-05.9 Suite de validación DSP automatizada
- Tamaño: M · Depende de: SPK-P0.10a, S-05.2, S-05.3, S-05.4, S-05.5
- AC: los 11 archivos de referencia procesados por el código nativo y comparados dentro de las tolerancias de P0.10a; "no clipping interno" verificado; corre en CI por PR que toca `android/dsp`.

### S-05.10 PlayerService seguro y biblioteca mínima de señales
- Tamaño: M · Depende de: SPK-P0.6', S-02.10b, S-02.11, S-05.1a, S-05.2
- AC: implementa INV-12 (PLAYER_RESERVE con guardado, confirmación, restauración y watchdog), INV-13 (matriz de precondiciones: cada una falsa → no `MEDIA_PLAY`, motivo mostrado y registrado; test por precondición), INV-14 (stop en fin/cancel/foco/USB/red; abort por ausencia de referencia ≤ 1,5 s), INV-15 (pre-roll, tope, nivel operativo por VenueProfile, +6 dB con hold, −10 dB máx. sin SPL, abort Input 1 > −3 dBFS), INV-26; biblioteca mínima: tono −20 dBFS, pink 16 s, archivo de aislamiento (INV-16), con checksum verificado en el pendrive al iniciar; estado del generador visible siempre.

### SPK-SAFE-GEN Invariantes del generador en HIL
- Tamaño: M · Depende de: S-05.10
- PASS (bloqueante, 10/10 cada uno): reserva/liberación con hash idéntico; desmute desde web → restauración ≤ 300 ms; cada precondición falsa → no arranca; E-Stop durante pink → silencio ≤ 500 ms; caída de red durante pink → stop local + alerta; caída de USB → MEDIA_STOP confirmado; send Player→Analysis a −∞ → stop ≤ 2 s; con `generatorFaderDb = −18` ningún `p.N.mix` > −18; notificación sonora → < −90 dBFS.

### S-12.1b Tests unitarios de invariantes del generador
- Tamaño: S · Depende de: S-05.10, S-12.1a
- AC: tests con ID para INV-12, 13, 14, 15, 16, 26, 27.

### S-12.2a Harness HIL — lectura, red y generador
- Tamaño: M · Depende de: S-12.1b, S-00.1
- AC: `tools/hil`: 20 ciclos de reconexión sin writes pendientes (INV-17/18); `netem loss 10 %` y `delay 200 ms` (INV-17); router reboot; Wi-Fi débil (atenuación/distancia); notificación durante Player (INV-26); potenciómetro movido (INV-27); desmutear Player desde web (INV-12); patch del bus a monitor (INV-16); dos tablets (INV-32); informe automático PASS/FAIL.

### SPK-P0.4' Captura dual prolongada durante Player
- Tamaño: M · Depende de: S-05.1b, S-05.10
- PASS: 60 min de pink desde el Player con captura dual: xruns ≤ 1/h; deriva Input 1 vs Input 2 = 0 muestras (mismo ADC; ≠ 0 = bug); H(f) en loopback eléctrico estable ± 0,3 dB entre minuto 1 y 60.

### SPK-LOOP Loopback e igualación In1/In2
- Tamaño: M · Depende de: S-05.4
- PASS: misma señal en Y a ambas entradas (nivel ≤ −20 dBFS en In1) → respuesta relativa In1/In2 ± 0,2 dB 20 Hz–20 kHz y offset temporal; Scarlett OUT → Input 2: latencia ida/vuelta (informativa); `CalibrationState.in1In2Offset` guardado; verificación de cables antes/después (INV-30) prototipada.

### S-07.0 Wizard de loopback
- Tamaño: M · Depende de: SPK-LOOP, S-05.8, S-05.10
- AC (INV-30): abre Scarlett OUT solo dentro del wizard; verificación "AUX desconectado" antes y "cable del AUX restaurado" después; tope −20 dBFS, ≤ 20 s; energía no correlacionada > −60 dBFS → descartar; guarda `in1In2Offset[]` y `loopbackId`; estado "sin igualación" visible en Room; test HIL: salir sin reconectar → START SESSION bloqueado.

### SPK-P0.7b Virtual Soundcheck — repetibilidad
- Tamaño: M · Depende de: SPK-P0.7a, S-05.5, S-05.6
- PASS: 3 playbacks del mismo take → RMS 1/3 oct en Input 2 ± 0,3 dB; Input 1 ± 0,5 dB > 200 Hz y ± 1 dB ≤ 200 Hz (integración sobre los 5 min); alineación por correlación de Input 2 ≤ 2 muestras.

### G-C — Gate
- Tamaño: S · Depende de: SPK-P0.4', SPK-LOOP, SPK-P0.2c, SPK-SAFE-GEN, SPK-PA-BUS, S-12.2a
- AC: acta; bloqueantes: SAFE-GEN 10/10 en todos, P0.4' deriva 0, S-12.2a en verde; informativos: GEQ vs PEQ, LOOP latencia; §112 re-verificado. Desbloquea EP-06 (writes de Analysis Bus) y EP-10.

---

## EP-06 — MVP1: Channel Assistant con Direct Reference  (P1 · UX/CORE/MIXER)

### S-06.1a Wizard de setup y patcheo
- Tamaño: M · Depende de: SPK-P0.5, S-03.1, S-05.1a, S-05.10, S-12.1b
- AC (B-35, B-15): (1) Selección del AUX (o MTX) de análisis; verifica que no alimenta monitores (todos los sends a −∞ al inicio), lo marca `safe`, lo nombra `ANALYSIS`. (2) Paso "Reservar Player para VSE" (INV-12) con vista previa de cambios y confirmación; rechazado si el Player está reproduciendo. (3) Checklist con ilustraciones: Input 1 XLR (mic), **Input 2 solo TRS 1/4"** con confirmación explícita; 48 V solo si Input 1 es el mic; Direct Monitor OFF; hub PD; pendrive con biblioteca (checksum); Scarlett OUT no cableada a la consola. (4) Cada ítem OK / pendiente / falla; bloqueo de avance si falla un ítem de seguridad. (5) ≤ 10 min primera vez, ≤ 2 min con valores guardados.

### S-06.1b Test de aislamiento del bus
- Tamaño: M · Depende de: S-05.10, S-05.5, S-06.1a
- AC (INV-16): pink de pre-roll solo al Analysis Bus 3 s; correlación In2↔In1 > 0,3 → abort y bloqueo de Setup; ejecutado antes de la primera medición y tras cada cambio de Setup; HIL: patch a monitor a propósito → 10/10; correcto → 0 falsos positivos.

### S-06.2 Wizard de calibración de ganancia de Scarlett
- Tamaño: M · Depende de: SPK-CAL, S-05.8, S-06.1a, S-05.10
- AC: Input 2 gain al mínimo físico; tono −20 dBFS por el Player; trim con el fader del AUX ANALYSIS (transacción System) hasta −20 ± 0,2 dBFS; guarda `CalibrationState`; re-verificación al inicio de cada medición; test HIL: +1 dB en el knob → INVALID y aviso (INV-27); aviso si el tono no llega (ruta rota, INV-14).

### S-06.3 Gestor del Analysis Bus
- Tamaño: L · Depende de: SPK-P0.5, S-02.10b, S-06.1a, S-12.1a, G-C
- AC: `selectChannel(channelId, referenceMode)` como transacción System (INV-05 exención, pacing 20 ms, verificación de conjunto ≤ 1 s) sobre los sends del bus; taps RAW_INPUT/POST_PROCESSING/POST_FADER; MASTER_REFERENCE por MTX; stereo link: si replica, el par es unidad de análisis y la UI lo indica, si no, se verifica que X+1 sigue a −∞; restauración al terminar, ante E-Stop y ante desconexión (estado conocido, INV-28 análogo); tiempo de conmutación ≤ el medido en P0.5.

### S-06.4 Ventana de captura por canal y Measurement
- Tamaño: M · Depende de: S-06.3, S-05.6, S-05.7, S-05.2
- AC: elegir canal → modo → instrucción → cuenta regresiva → captura 15–20 s con VU2 + Input 2 (+ **Input 1 si hay FOH mic**: Measurement con `directRef` y `acousticRef`, §30); metricas, calibrationState y WAV; repetir/descartar.

### S-06.5 Análisis espectral, ruido y SNR por perfil
- Tamaño: L · Depende de: S-06.4, S-02.4
- AC: por perfil: rango útil, energía por bandas, ruido de fondo, SNR, resonancias (> 6 dB sobre suavizado 1/3 oct en 1/12), **sibilancia** (energía 5–9 kHz ≥ energía 1–4 kHz − 6 dB en ≥ 10 % de ventanas de 100 ms con voz activa), **exceso de graves** (< 150 Hz ≥ 150–1 000 Hz + 3 dB en voz/guitarra acústica); **Double Reference**: desviación acústico vs directo > 6 dB en bandas donde el directo es normal → Hypothesis ROOM/PA con prioridad sobre CHANNEL; Findings con `confidence` (definición Channel).

### S-06.6 Sugerencias de HPF, EQ y dinámica (SUGGEST)
- Tamaño: XL · Depende de: S-06.5, S-06.7
- AC: HPF (frecuencia), hasta 2 bandas PEQ (cuts preferidos, boost ≤ 3 dB), compresor (threshold = percentil 90 del RMS fast − 3 dB; ratio por perfil: 2:1 voz, 3:1 bajo, …), gate (percusión/voz con ruido alto), de-esser (sibilancia); cadena Finding → Hypothesis → Recommendation con explicación determinística; valores actuales por RAW (o `currentUnknown` si `unmapped`); sin writes (test); **golden set** ≥ 10 capturas reales etiquetadas (HPF ± 1/3 oct; PEQ ± 1/3 oct y ± 1,5 dB) → ≥ 8/10 coinciden; 0 recomendaciones fuera de INV-04.

### S-06.8 Checklist "START SESSION"
- Tamaño: S · Depende de: S-06.1a, S-06.2, S-02.14
- AC (§121): Ui24R / Scarlett / FOH mic / Analysis Bus / Player reservado / Red / DND / aislamiento (INV-16) / cable AUX (INV-30 si hubo loopback), cada uno por lectura real; entra solo con obligatorios OK.

### S-06.9 Prueba de campo MVP1
- Tamaño: M · Depende de: S-06.1a…S-06.8, S-12.2a
- AC: ensayo real; plantilla. **Éxito:** ≥ 70 % de recomendaciones valoradas ≥ 4/5 tras aplicar a mano; calibración válida toda la sesión (sin INVALID no provocado); tiempo por canal ≤ 5 min. **Fracaso:** ≥ 2 recomendaciones fuera de INV-04; INVALID no explicado; cualquier incidente.

---

## EP-07 — Room-Observe (MVP1.5)  (P1 · UX/AUDIO/CORE) — sin writes de EQ

### S-07.1 MeasurementMicProfile e importación de calibración
- Tamaño: S · Depende de: S-02.4
- AC: campos §18; importa archivo freq/dB; sin archivo → recomendaciones > 4 kHz con `confidence = LOW`.

### S-07.2 Calibración SPL opcional
- Tamaño: M · Depende de: S-07.1, S-05.8
- AC: calibrador 94 dB @ 1 kHz o SPL meter externo; estado "SPL no calibrado" visible en Room; sin calibración solo dB relativos (§20) y tope de fader −10 dB (INV-15).

### S-07.3 Wizard multi-posición
- Tamaño: L · Depende de: S-06.1a, S-06.2, S-05.10, SPK-SAFE-GEN, S-05.7
- AC (B-36): QUICK (3 posiciones, FULL SYSTEM) y STANDARD (6); mapa; **un archivo compuesto por posición** (voz "posición N, listo en 5…" + 1 s silencio + pre-roll + pink 16 s + beep) en la biblioteca con checksum y tope; inicio de la ventana por **onset del pink en Input 2**; repetición si sample-peak en Input 1 > RMS slow + 15 dB o γ² media < 0,5; AC negativo INV-13; tiempo total estimado; QUICK ≤ 15 min en campo.

### S-07.4 Medición con pink y transfer function
- Tamaño: M · Depende de: S-05.4, S-05.5, S-07.3, SPK-LOOP, S-12.1b
- AC: Input 2 = MASTER_REFERENCE; por posición H(f), fase, γ², delay; `paComponent = FULL`; bins γ² < 0,7 excluidos; sin `in1In2Offset` → `in1In2Equalized = false` y `confidence` ≤ MEDIUM; AC negativo INV-13.

### SPK-REPEAT Repetibilidad de la medición de sala
- Tamaño: M · Depende de: S-07.4
- PASS: QUICK ×5 sin tocar nada en dos salas → σ de `roomScore` y σ por banda 1/3 oct de la desviación al target; valores guardados por `VenueProfile` (INV-23).

### S-07.5 House curves y desviación al target
- Tamaño: M · Depende de: S-07.4
- AC: presets Live Music, Acoustic, Speech, Bass Enhanced, Custom, Band Signature (vacío) definidos en `docs/house-curves.md` como tabla 1/3 oct con fuente; test que carga cada preset (31 valores); desviación por banda promedio y por posición; target superpuesto con |Δ| coloreado (≤ 2 / 2–4 / > 4 dB).

### S-07.6 Consistencia, Findings e hipótesis
- Tamaño: L · Depende de: S-07.5, S-02.4, SPK-REPEAT
- AC: `consistencyScore` por banda; reglas: exceso/defecto global = mismo signo ≥ 2 dB en ≥ 80 % (QUICK 3/3, STANDARD 5/6); null localizado = 1 posición ≤ −8 dB y resto dentro de ± 3 dB del target; inconsistencia espacial = σ > 6 dB (< 100 Hz), > 4 dB (100–500 Hz), > 3 dB (> 500 Hz) con suavizado 1/3 oct; problema multi-posición = mismo signo ≥ 2 dB en 50–80 %; Hypothesis (ROOM / PA / PLACEMENT) con explicación; validado con espectros sintéticos (uno por Finding) y datos de S-07.8.

### S-07.7 Room score e informe
- Tamaño: M · Depende de: S-07.6
- AC: `roomScore` (docs/scores.md) con desglose; informe con Findings y Observations ("se recomendaría −2,5 dB en 125 Hz", no aplicable); comparación con la última sesión del mismo `VenueProfile`; cero writes de EQ (test).

### S-07.8 Prueba de campo Room-Observe
- Tamaño: M · Depende de: S-07.1…S-07.7
- AC: dos salas; **referencia externa** (REW/Smaart en las mismas posiciones, mismo mic). **Éxito:** top-3 Findings coinciden en banda (± 1/3 oct) y signo con la referencia en 2/2; QUICK ≤ 15 min. **Fracaso:** Finding de exceso global que la referencia no muestra; γ² media < 0,7 en > 30 % de bandas.

---

## EP-08 — Mix-Live (MVP2a)  (P1 · UX/CORE)  ∥ EP-10

### S-08.1 Roles, MixScene y PerformanceContext
- Tamaño: M · Depende de: S-03.2, S-02.4
- AC: roles LEAD/SUPPORT/RHYTHMIC/FOUNDATION/AMBIENCE/SOLO/BACKGROUND; `MixScene` por canción/sección; rol efectivo = escena ?? default; selección ≤ 2 toques; escenas en BandProfile.

### S-08.2 Build Your Mix
- Tamaño: L · Depende de: S-08.1, S-06.3, S-05.7
- AC (§36–37): secuencia configurable; cada estado captura 20 s de VU2 + espectro del master (MTX → Input 2) + FOH mic si conectado; comparación con el estado anterior (energía, espectro, balance post-fader, dinámica); Measurements con `buildState`.

### S-08.3 Análisis incremental y proxy de solapamiento
- Tamaño: L · Depende de: S-08.2
- AC: delta de energía por bandas; **proxy de solapamiento** = bandas 1/3 oct donde el master en el estado N supera al N−1 en < 1 dB pese a `vuPostFader` de la fuente añadida ≥ −20 dB ("no aparece"), o donde sube > 6 dB (acumulación); Observation con `confidence ≤ MEDIUM` y nota "espectro por fuente no disponible en vivo"; loudness momentáneo aproximado del master.

### S-08.4 Objetivos por rol y recomendaciones de fader (SUGGEST)
- Tamaño: L · Depende de: S-08.3, S-02.9b
- AC: relación por rol = diferencia entre promedios energéticos de `vuPostFader` (dB → potencia → media 3 s → dB), proxy de nivel, configurable (LEAD +2 a +4 sobre SUPPORT; BACKGROUND −3 a −6; …); solo faders, delta ≤ INV-04; "smallest effective change"; ninguna recomendación de EQ o gain (test).

### S-08.5 Full Band Test
- Tamaño: M · Depende de: S-08.4
- AC (ADR-15): 30 s con banda completa: VU2 por canal, espectro del master, FOH mic; tabla canal → OK / ±dB; nota "un canal espectral a la vez"; Findings por rol; fija la referencia del lead vocal para el Show Monitor.

### S-08.6 Mix score y Show Ready Dashboard
- Tamaño: M · Depende de: S-08.5, S-07.7, SPK-P0.2c
- AC: `mixScore`; dashboard ROOM / MIX / HEADROOM / CLIPPING / NETWORK / AFS2 / SNAPSHOT (§122); AFS2 como paso manual con checklist y lectura de estado si la matriz lo permite (B-08).

### S-08.7 Prueba de campo Mix-Live
- Tamaño: M · Depende de: S-08.1…S-08.6
- AC: **Éxito:** Build Your Mix ≤ 15 min; ≥ 60 % de recomendaciones de fader valoradas ≥ 4/5; 0 recomendaciones de EQ/gain desde Mix. **Fracaso:** > 1 recomendación fuera de INV-04.

---

## EP-10 — Room-Correct (MVP3)  (P1 · AUDIO/CORE/UX) — sugerencias de EQ de salida, sin writes de EQ  ∥ EP-08

### S-12.1c Test de invariante INV-28
- Tamaño: S · Depende de: S-12.1b, S-02.10b
- AC: unit para INV-28 (topología, timeout 120 s, lista visible, estado conocido ante red/E-Stop).

### S-10.1 Biblioteca completa de señales
- Tamaño: S · Depende de: S-05.10
- AC (INV-15): sweep log 20 Hz–20 kHz (10 s), pink 16 s, sine 1 kHz/100 Hz (5 s), burst (3 s), cada uno con pre-roll + 1 s estable; total ≤ 30 s; test de envolvente RMS (monótona en pre-roll, ± 0,5 dB en señal útil); checksums.

### S-10.2 Medición por componente de PA
- Tamaño: L · Depende de: S-10.1, S-07.4, S-02.10b, G-C, S-12.1c, SPK-PA-BUS
- AC (§49): solo componentes con `muteable = true` en `PAProfile.components`; si L/R comparten master → secuencia reducida (SUB ONLY / FULL, o FULL) explicada en UI; mutes como transacción System con restauración garantizada (INV-28: timeout 120 s, lista visible, estado conocido); Measurement con `paComponent`; STANDARD/ADVANCED; AC negativo: bus con sends de monitor activos → rechazado.

### S-10.3a Motor de reglas de EQ de sala
- Tamaño: XL · Depende de: S-07.6, S-10.2
- AC (§51–52): preferir cuts; boosts ≤ 2 dB; no rellenar nulls; solo Findings con `consistency ≥ 0,8` y `confidence HIGH/MEDIUM`; Q ≥ 0,7; límites por frecuencia (< 60 Hz solo si PAProfile lo cubre; > 8 kHz solo con mic calibrado); "smallest effective change" (mínimo de filtros que reduce ≥ 50 % la desviación RMS); `expectedImpact` con desviación predicha; **12 casos sintéticos con resultado esperado** (freq ± 1/6 oct, gain ± 1 dB, Q ± 30 % o "ningún filtro") → 12/12; asserts: 0 boosts > 2 dB, 0 filtros sobre consistency < 0,8.

### S-10.3b Mapeo a GEQ/PEQ de salida
- Tamaño: M · Depende de: S-10.3a, S-06.7
- AC: filtros → bandas GEQ o PEQ del bus de `PAProfile.outputBuses`; valores actuales leídos (o `currentUnknown`); Recommendation por filtro con delta ≤ INV-04; sin writes (test).

### S-10.4 Comparación antes/después, informe y dashboard
- Tamaño: M · Depende de: S-10.3b, S-07.7
- AC: el usuario aplica a mano; re-medición QUICK; comparación (desviación al target, consistencia, score); veredicto KEEP/REVERT sugerido con tolerancia INV-23; enlaces por ID; informe `report.md`; ROOM en el dashboard.

### S-10.6 Prueba de campo Room-Correct
- Tamaño: M · Depende de: S-10.1…S-10.4
- AC: dos salas; §114 verificado. **Éxito:** Δ RMS al target ≥ 1 dB y `roomScore` + ≥ tolerancia en ≥ 1/2 salas; 0 boosts > 2 dB; 0 filtros sobre nulls. **Fracaso:** score empeora en ambas salas.

---

## EP-11 — Virtual Soundcheck y Mix-A/B (MVP2b)  (P1 · MIXER/AUDIO/UX)

### G-D — Gate
- Tamaño: S · Depende de: SPK-P0.7a, SPK-P0.7b
- AC: acta con seek/selección (informativo), REC por protocolo o plan B, pendrive certificado, repetibilidad §113 demostrada (bloqueante). Desbloquea S-11.1.

### S-11.1 VirtualSoundcheckTake y control de grabación
- Tamaño: M · Depende de: G-D, S-02.4
- AC: entidad (location, fileRef, channelMap, sampleRate, duration, checksum, recordedAt, snapshotRef); "REC → banda toca → STOP"; takes ≤ 5 min si no hay seek; INV-29 para `MTK_REC_TOGGLE` (leer `recording$`, no enviar si ya está, esperar ≤ 1 s o bloquear); Preamp Gain congelado (INV-06) mientras exista un take; audio solo en el pendrive, metadata en la app; aviso de consentimiento al grabar; plan B REC manual guiado si P0.7a lo determinó.

### S-11.2 Control de playback y verificación del patch
- Tamaño: M · Depende de: S-11.1
- AC (INV-29): activar Soundcheck solo con `recording$ = false` y canales `isLive` con `scsrc` hardware verificado (o lista con confirmación); PLAY/STOP/(seek si existe; si no, desde 0); desactivar restaura patch verificado; "SOUNDCHECK ACTIVO" visible en todas las pantallas; HIL: canal LIVE con scsrc = pista → rechazado 10/10.

### S-11.3 Alineación de mediciones por correlación
- Tamaño: M · Depende de: S-05.5, S-05.6, S-11.2
- AC: alineación al inicio del take por correlación de Input 2 ≤ 2 muestras; segmentos por tiempo relativo; `INVALID` si falla.

### S-11.4 MixCandidate y comparación A/B/C
- Tamaño: L · Depende de: S-11.3, S-08.4
- AC: `MixCandidate` = snapshot VSE + faders + Measurements (master y FOH) + score; comparación por bandas y por canal; recomendación de cuál conservar con `confidence`; sin writes.

### S-11.5 Ciclo recomendado → aplicar manual → repetir → comparar
- Tamaño: M · Depende de: S-11.4
- AC: flujo guiado; historial de candidatos; A vs B distinguible con confidence ≥ MEDIUM en 3 pasadas.

### S-11.6 Prueba de campo Mix-A/B
- Tamaño: M · Depende de: S-11.1…S-11.5
- AC: **Éxito:** 3 pasadas: Input 2 ± 0,3 dB, Input 1 ± 0,5 / ± 1 dB; alineación ≤ 2 muestras; A vs B distinguible; 0 canales LIVE afectados. **Fracaso:** alineación fallida en > 1 pasada; cualquier canal vivo silenciado.

---

## EP-12 — Suite de aceptación de seguridad  (P0 para MVP4 · CORE/FIELD) → G-E

(S-12.1a en EP-02; S-12.1b y S-12.2a en EP-05; S-12.1c en EP-10.)

### S-12.1d Tests unitarios de invariantes transaccionales
- Tamaño: M · Depende de: S-12.1c, S-02.10b, S-02.11
- AC: INV-01, 02, 04 (writes y topes acumulados), 05, 06, 11, 20, 21 (abortar), 23, 25, 29, 30, 31; cobertura 100 % del pipeline de escritura.

### S-12.2b Harness HIL — transacciones
- Tamaño: XL · Depende de: S-12.1d, S-12.2a
- AC: 100 writes + rollback (INV-02); 200 operaciones sin tocar snapshots manuales (INV-03); conflicto desde web 100/100 (INV-11); kill ×20 (INV-20); recall desde web (INV-21); corte de red con LEFT muteado y espera 120 s (INV-28); Soundcheck con canal LIVE (INV-29); bloqueo de pantalla en closed loop (INV-31); firmware editado (INV-33); informe automático.

### S-12.3 Matriz de fallos §110
- Tamaño: M · Depende de: S-12.2b
- AC: Scarlett desconectada, mic desconectado, consola apagada, app en background, tablet bloqueada, USB reconectado, cambio manual concurrente, Player desmuteado por terceros: ejecutados y documentados (observado vs esperado).

### G-E — Gate
- Tamaño: S · Depende de: S-12.1d, S-12.2b, S-12.3
- AC: acta; bloqueante: 100 % de INV-01…33 con unit y HIL en verde; §111 punto por punto.

---

## EP-13 — MVP4a: Assisted Apply sobre un parámetro de canal  (P2 · CORE/UX)

### S-13.1 Pipeline de aplicación asistida y matriz de autonomía
- Tamaño: L · Depende de: G-E, S-02.10b
- AC (§95): Recommendation → aprobación explícita (hold 1 s, INV-25) → snapshot VSE_AUTO → Transaction (1 parámetro: gain en CHANNEL_SETUP o fader en MIX; API tipada, sin RAW) → write con read-compare (INV-11) → `confirmedBy` según ACK-POLICY → APPLIED/UNVERIFIED → medición "after" opcional; `docs/autonomy-matrix.md` sincronizada + test: en MVP4a solo gain y fader admiten ASSISTED.

### S-13.2 UX de CONFLICT
- Tamaño: M · Depende de: S-13.1
- AC: valor esperado, valor actual, origen (EXTERNAL); opciones recalcular / descartar / aplicar igual con doble confirmación; nada automático por timeout.

### S-13.3 UI de rollback
- Tamaño: M · Depende de: S-13.1
- AC: transacciones de la sesión con changes; rollback por change o transacción con verificación; por snapshot con confirmación y aviso de alcance (P0.8); deshabilitado si la base cambió (INV-21) salvo por snapshot.

### S-13.5 Prueba de campo MVP4a
- Tamaño: M · Depende de: S-13.1…S-13.3
- AC: ≥ 10 applies asistidos. **Éxito:** 10/10 APPLIED o CONFLICT explicado; 0 UNVERIFIED silenciosos; rollback probado ≥ 2 veces con verificación; 0 incidentes (definición en 04). **Fracaso:** cualquier incidente.

---

## EP-14 — MVP4b: Room asistido y closed loop  (P2 · CORE/AUDIO)

### S-14.1 Escritura de EQ de salida con caps
- Tamaño: M · Depende de: S-06.7, S-13.1, S-10.3b
- AC (INV-08 ampliada): ASSISTED sobre filtros de `PAProfile.outputBuses`: solo cuts, ≤ 3 dB, ≤ 4 filtros, Q ≥ 0,7; verificación por lectura; snapshot previo; test estático de paths.

### S-14.2 Closed loop de sala
- Tamaño: L · Depende de: S-14.1, S-10.4, SPK-REPEAT
- AC (INV-23, INV-31): CONTROLLED AUTO solo Room-Correct: Measure QUICK → Apply (1 filtro, HIGH) → Remeasure → KEEP si `roomScore` mejora ≥ tolerancia y Δ RMS ≥ 0,5 dB, REVERT verificado si no; converge = dos iteraciones sin mejora → STOP_CONVERGED; se detiene por 5 iteraciones, E-Stop, INV-31 o REVERT ×2 → STOP_<motivo>; cada iteración = ChangeTransaction completa; serie de `roomScore` por iteración en el informe.

### S-14.3 Re-medición post-AFS2 y estado AFS2
- Tamaño: S · Depende de: S-14.2
- AC: paso RINGOUT manual con checklist, re-medición QUICK y comparación; estado AFS2 guardado si la matriz lo permite.

### S-14.4 Prueba de campo MVP4b
- Tamaño: M · Depende de: S-14.1…S-14.3
- AC: dos salas. **Éxito:** converge o se detiene con motivo en 2/2; 0 incidentes; INV-31 verificada a propósito. **Fracaso:** oscilación KEEP/REVERT ≥ 2 veces.

---

## EP-15 — Post-MVP (esbozo)  (P3)

- **Precision Audio Engine:** IR por deconvolución, ETC, RT60, group delay, sub alignment.
- **PA alignment avanzado:** L/R, sub, crossover, polaridad, output delay (matriz v3 cubre delay y polaridad).
- **Learning:** Mix Signature histórica, VenueProfile con historial, adaptación de perfiles.
- **AI layer:** explicación e interpretación sobre Metrics + Recommendations + histórico; sin acceso a MixerDomainAPI (lint).
- **Analysis Return (opcional):** solo si el Player resulta insuficiente; reutiliza S-12…S-16 originales del anexo B.
- **PWA secundaria (solo lectura):** visor de telemetría/dashboard en navegador; sin captura ni writes.
- **Multi-mixer:** segundo adapter contra `MixerDomainAPI`.
- **Cobertura ampliada:** segunda tablet/hub certificados; los 6 tipos de sala de §109; alertas espectrales del Show Monitor.
