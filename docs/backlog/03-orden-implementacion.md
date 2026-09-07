# Orden exacto de implementación v1.1

Secuencia global de 126 ítems. Un ítem empieza cuando todos los de su columna *Depende de* están cerrados. Los bloques marcados `∥` corren en paralelo si hay dos carriles activos. **Verificación mecánica: 0 ciclos, 0 violaciones de orden** (ningún ítem depende de otro con número mayor).

**Carriles:** CORE (dominio, safety, datos) · MIXER (protocolo, adapter) · AUDIO (plugin nativo, DSP) · UX (pantallas, wizards) · **FIELD (humano con hardware, capacidad 1, no paralelizable con otro FIELD)**.
**Tamaños (días-persona):** S = 1 · M = 2–3 · L = 4–5 · XL = 6–9.

## Bloque A — Gobernanza y spikes de consola (→ G-A)

| # | ID | Título | Carril | Tam. | Depende de |
|---|---|---|---|---|---|
| 001 | S-00.1 | Repositorio y estructura | CORE | S | — |
| 002 | S-00.2 | Registro de ADR | CORE | S | 001 |
| 003 | S-00.3 | Charters de spikes | CORE | M | 001 |
| 004 | S-00.4 | Matrices y registro de riesgos | CORE | S | 001 |
| 005 | S-00.5 | DoD, convenciones, plantilla de campo | CORE | S | 001 |
| 006 | S-00.6 | Invariantes INV-01…33 | CORE | S | 001 |
| 007 | SPK-P0.1 | Conectividad, echo, cadencia VU2 | FIELD | M | 003 |
| 008 | SPK-ACK-POLICY | Política de confirmación de writes | MIXER | S | 007 |
| 009 | SPK-P0.2a | Capability Matrix lectura/escritura básica | FIELD | XL | 004,007 |
| 010 | SPK-P0.9 | Concurrencia y presencia | FIELD | M | 007 |
| 011 | SPK-P0.8 | Snapshots y alcance del recall | FIELD | M | 009 |
| 012 | SPK-P0.7a | Virtual Soundcheck protocolo | FIELD | M | 009 |
| 013 | SPK-P0.10a | Validación DSP y parámetros normativos | AUDIO | M | 003 |
| 014 | G-A | Gate G-A | CORE | S | 007-012 |

## Bloque B — Foundation  *(∥ bloque D)*

| # | ID | Título | Carril | Tam. | Depende de |
|---|---|---|---|---|---|
| 015 | S-02.1 | Angular + Capacitor + Android | UX | M | 001 |
| 016 | S-02.2 | SQLite | CORE | M | 015 |
| 017 | S-02.3 | Logging estructurado | CORE | M | 016 |
| 018 | S-02.4 | Modelo de dominio v1 | CORE | XL | 002,016 |
| 019 | S-02.5a | MixerDomainAPI y mock | MIXER | M | 014,018 |
| 020 | S-02.5b | ConfirmedStateStore y correlación | MIXER | M | 019,010 |
| 021 | S-02.5c | Cobertura de parámetros del adapter | MIXER | M | 020,009 |
| 022 | S-02.6 | Tabla RAW y round-trip | MIXER | M | 021 |
| 023 | S-02.7 | Estados de conexión | MIXER | M | 020 |
| 024 | S-02.8 | Parameter Ownership | CORE | S | 019 |
| 025 | S-02.14 | Ciclo de vida Android y DND | UX | M | 015,023 |
| 026 | S-02.9a | Pipeline único, lint, lista blanca | CORE | M | 006,017,023,024 |
| 027 | S-02.9b | Reglas por invariante y matriz de autonomía | CORE | M | 026 |
| 028 | S-02.12 | SoundSession y ciclo de vida | CORE | M | 018 |
| 029 | S-02.10a | Transacciones, journal, recuperación | CORE | M | 027 |
| 030 | S-02.10b | Rollback granular, ráfagas, confirmedBy | CORE | M | 029 |
| 031 | S-02.11 | Emergency Stop local-first | CORE/UX | L | 026 |
| 032 | S-02.13 | Snapshot manager | MIXER | M | 011,021,029 |
| 033 | S-12.1a | Tests unitarios invariantes MVP0/MVP1 | CORE | M | 027,030,031,032 |

## Bloque D — Spikes solo-consola  *(∥ bloques B y C; carril FIELD)*

| # | ID | Título | Carril | Tam. | Depende de |
|---|---|---|---|---|---|
| 034 | SPK-P0.6' | Media Player como generador | FIELD | M | 009 |
| 035 | SPK-P0.10b | Calibración y balística del VU2 | FIELD | M | 009,034 |
| 036 | SPK-P0.5 | Analysis Bus | FIELD | M | 009 |
| 037 | SPK-PA-BUS | Topología muteable de salidas | FIELD | S | 009 |
| 038 | SPK-P0.2b | Matriz procesamiento de canal | FIELD | XL | 009,022 |
| 039 | SPK-P0.2c | Matriz de salidas | FIELD | L | 009,022 |
| 040 | S-06.7 | raw-map v2 | MIXER | M | 038,039 |

## Bloque C — MVP0: Console Telemetry & Gain  → **hito MVP0**

| # | ID | Título | Carril | Tam. | Depende de |
|---|---|---|---|---|---|
| 041 | S-03.1 | Wizard de conexión | UX | M | 014,021,023 |
| 042 | S-03.2 | ChannelAssignment y BandProfile | UX/CORE | M | 018,041 |
| 043 | S-03.3 | Telemetría | UX | M | 041,035 |
| 044 | S-03.9 | Recuperación tras desconexión | UX | M | 023 |
| 045 | S-03.4 | Gain Assistant por telemetría | CORE/UX | L | 042,043,027,035 |
| 046 | S-03.5 | UI recomendaciones y observaciones | UX | M | 045 |
| 047 | S-03.7 | Show Monitor read-only | UX | M | 042,043 |
| 048 | S-03.8 | Modo Show | UX | M | 047,031 |
| 049 | S-03.6 | Change log y resumen | UX | S | 028,046 |
| 050 | S-03.10 | Prueba de campo MVP0 | FIELD | M | 041-049,033 |

## Bloque E — Spikes de hardware y decisión de arquitectura (→ G-B, DEC-19)

| # | ID | Título | Carril | Tam. | Depende de |
|---|---|---|---|---|---|
| 051 | SPK-P0.3b | Ui24R USB-B directo (2 d) | FIELD | S | 003 |
| 052 | SPK-P0.3 | Certificación tablet + Scarlett | FIELD | L | 003,051 |
| 053 | SPK-LIFE | Ciclo de vida Android con audio | FIELD | M | 052 |
| 054 | SPK-CAL | Calibración de ganancia de Scarlett | FIELD | S | 036,034,052 |
| 055 | G-B | Gate G-B | CORE | S | 013,051-054,034-037 |
| 056 | DEC-19 | Decisión con/sin Scarlett (ADR-19) | CORE | S | 051,055 |

## Bloque F — Basic Audio Engine, generador seguro y calibración (→ G-C)

| # | ID | Título | Carril | Tam. | Depende de |
|---|---|---|---|---|---|
| 057 | S-05.1a | Plugin captura N-canal | AUDIO | L | 052,056,015 |
| 058 | S-05.1b | Plugin: servicio, xruns, timestamps | AUDIO | M | 057,025 |
| 059 | S-05.2 | Métricas de nivel nativas | AUDIO | M | 057 |
| 060 | S-05.3 | FFT, suavizado, promediado | AUDIO | L | 057 |
| 061 | S-05.6 | Ventanas de grabación | AUDIO | M | 057 |
| 062 | S-05.5 | Delay finder | AUDIO | M | 060 |
| 063 | S-05.4 | Transfer function y coherencia | AUDIO | L | 060,062 |
| 064 | S-05.7 | Bridge y visualización | AUDIO/UX | M | 059,060 |
| 065 | S-05.8 | Estado de calibración | AUDIO/CORE | M | 059,054 |
| 066 | S-05.9 | Suite de validación DSP | AUDIO | M | 013,059,060,063,062 |
| 067 | S-05.10 | PlayerService seguro y biblioteca mínima | CORE/AUDIO | M | 034,030,031,057,059 |
| 068 | SPK-SAFE-GEN | Invariantes del generador en HIL | FIELD | M | 067 |
| 069 | S-12.1b | Tests unitarios invariantes del generador | CORE | S | 067,033 |
| 070 | S-12.2a | Harness HIL lectura, red, generador | FIELD/CORE | M | 069,001 |
| 071 | SPK-P0.4' | Captura dual prolongada durante Player | FIELD | M | 058,067 |
| 072 | SPK-LOOP | Loopback e igualación In1/In2 | FIELD | M | 063 |
| 073 | S-07.0 | Wizard de loopback | UX/AUDIO | M | 072,065,067 |
| 074 | SPK-P0.7b | Virtual Soundcheck repetibilidad | FIELD | M | 012,062,061 |
| 075 | G-C | Gate G-C | CORE | S | 071,072,039,068,037,070 |

## Bloque G — MVP1: Channel Assistant  → **hito MVP1**

| # | ID | Título | Carril | Tam. | Depende de |
|---|---|---|---|---|---|
| 076 | S-06.1a | Wizard de setup y patcheo | UX | M | 036,041,057,067,069 |
| 077 | S-06.1b | Test de aislamiento del bus | AUDIO | M | 067,062,076 |
| 078 | S-06.2 | Calibración de ganancia de Scarlett | UX | M | 054,065,076,067 |
| 079 | S-06.3 | Gestor del Analysis Bus | MIXER/CORE | L | 036,030,076,033,075 |
| 080 | S-06.4 | Captura por canal y Measurement | UX/AUDIO | M | 079,061,064,059 |
| 081 | S-06.5 | Análisis espectral, ruido, SNR | CORE | L | 080,018 |
| 082 | S-06.6 | Sugerencias HPF/EQ/dinámica | CORE/UX | XL | 081,040 |
| 083 | S-06.8 | Checklist START SESSION | UX | S | 076,078,025 |
| 084 | S-06.9 | Prueba de campo MVP1 | FIELD | M | 076-083,070 |

## Bloque H — Room-Observe  → **hito MVP1.5**

| # | ID | Título | Carril | Tam. | Depende de |
|---|---|---|---|---|---|
| 085 | S-07.1 | MeasurementMicProfile | CORE | S | 018 |
| 086 | S-07.2 | Calibración SPL opcional | UX | M | 085,065 |
| 087 | S-07.3 | Wizard multi-posición | UX | L | 076,078,067,068,064 |
| 088 | S-07.4 | Pink y transfer function | AUDIO/CORE | M | 063,062,087,072,069 |
| 089 | SPK-REPEAT | Repetibilidad de la medición de sala | FIELD | M | 088 |
| 090 | S-07.5 | House curves y target | CORE/UX | M | 088 |
| 091 | S-07.6 | Consistencia, Findings, hipótesis | CORE | L | 090,018,089 |
| 092 | S-07.7 | Room score e informe | UX | M | 091 |
| 093 | S-07.8 | Prueba de campo Room-Observe | FIELD | M | 085-092 |

## Bloque I — Mix-Live  → **hito MVP2a**  *(∥ bloque J)*

| # | ID | Título | Carril | Tam. | Depende de |
|---|---|---|---|---|---|
| 094 | S-08.1 | Roles, MixScene, PerformanceContext | CORE/UX | M | 042,018 |
| 095 | S-08.2 | Build Your Mix | UX/CORE | L | 094,079,064 |
| 096 | S-08.3 | Análisis incremental y solapamiento | CORE | L | 095 |
| 097 | S-08.4 | Objetivos por rol y faders | CORE | L | 096,027 |
| 098 | S-08.5 | Full Band Test | UX/CORE | M | 097 |
| 099 | S-08.6 | Mix score y Show Ready Dashboard | UX | M | 098,092,039 |
| 100 | S-08.7 | Prueba de campo Mix-Live | FIELD | M | 094-099 |

## Bloque J — Room-Correct  → **hito MVP3**  *(∥ bloque I)*

| # | ID | Título | Carril | Tam. | Depende de |
|---|---|---|---|---|---|
| 101 | S-12.1c | Test invariante INV-28 | CORE | S | 069,030 |
| 102 | S-10.1 | Biblioteca completa de señales | CORE/AUDIO | S | 067 |
| 103 | S-10.2 | Medición por componente de PA | CORE/UX | L | 102,088,030,075,101,037 |
| 104 | S-10.3a | Motor de reglas de EQ de sala | CORE | XL | 091,103 |
| 105 | S-10.3b | Mapeo a GEQ/PEQ | MIXER/CORE | M | 104,040 |
| 106 | S-10.4 | Antes/después, informe, dashboard | UX/CORE | M | 105,092 |
| 107 | S-10.6 | Prueba de campo Room-Correct | FIELD | M | 102-106 |

## Bloque K — Virtual Soundcheck y Mix-A/B (G-D)  → **hito MVP2b**

| # | ID | Título | Carril | Tam. | Depende de |
|---|---|---|---|---|---|
| 108 | G-D | Gate G-D | CORE | S | 012,074 |
| 109 | S-11.1 | VirtualSoundcheckTake y grabación | CORE/UX | M | 108,018 |
| 110 | S-11.2 | Playback y verificación del patch | MIXER/UX | M | 109 |
| 111 | S-11.3 | Alineación por correlación | AUDIO | M | 062,061,110 |
| 112 | S-11.4 | MixCandidate y A/B/C | CORE/UX | L | 111,097 |
| 113 | S-11.5 | Ciclo recomendado → manual → comparar | UX | M | 112 |
| 114 | S-11.6 | Prueba de campo Mix-A/B | FIELD | M | 109-113 |

## Bloque L — Suite de aceptación de seguridad (→ G-E)

| # | ID | Título | Carril | Tam. | Depende de |
|---|---|---|---|---|---|
| 115 | S-12.1d | Tests unitarios invariantes transaccionales | CORE | M | 101,030,031 |
| 116 | S-12.2b | Harness HIL transacciones | FIELD/CORE | XL | 115,070 |
| 117 | S-12.3 | Matriz de fallos §110 | FIELD | M | 116 |
| 118 | G-E | Gate G-E | CORE | S | 115,116,117 |

## Bloque M — Assisted Apply y closed loop  → **hitos MVP4a / MVP4b**

| # | ID | Título | Carril | Tam. | Depende de |
|---|---|---|---|---|---|
| 119 | S-13.1 | Pipeline de aplicación asistida | CORE/UX | L | 118,030 |
| 120 | S-13.2 | UX de CONFLICT | UX | M | 119 |
| 121 | S-13.3 | UI de rollback | UX | M | 119 |
| 122 | S-13.5 | Prueba de campo MVP4a | FIELD | M | 119-121 |
| 123 | S-14.1 | Escritura de EQ de salida con caps | MIXER/CORE | M | 040,119,105 |
| 124 | S-14.2 | Closed loop de sala | CORE | L | 123,106,089 |
| 125 | S-14.3 | Re-medición post-AFS2 | UX | S | 124 |
| 126 | S-14.4 | Prueba de campo MVP4b | FIELD | M | 123-125 |

---

## Esfuerzo por bloque

| Bloque | Ítems | S/M/L/XL | Mín | Medio | Máx | de los cuales FIELD |
|---|---|---|---|---|---|---|
| A Gobernanza + spikes consola | 14 | 7/6/0/1 | 25 | 29,5 | 34 | 17,5 |
| B Foundation | 19 | 1/16/1/1 | 43 | 53 | 63 | 0 |
| D Spikes solo-consola | 7 | 1/4/1/1 | 19 | 23 | 27 | 20,5 |
| C MVP0 | 10 | 1/8/1/0 | 21 | 25,5 | 30 | 2,5 |
| E Spikes hardware + DEC-19 | 6 | 4/1/1/0 | 10 | 11 | 12 | 9 |
| F Audio Engine + generador | 19 | 2/14/3/0 | 42 | 50,5 | 59 | 12,5 |
| G MVP1 | 9 | 1/5/2/1 | 25 | 30 | 35 | 2,5 |
| H Room-Observe | 9 | 1/6/2/0 | 21 | 25 | 29 | 5 |
| I Mix-Live | 7 | 0/4/3/0 | 20 | 23,5 | 27 | 2,5 |
| J Room-Correct | 7 | 2/3/1/1 | 18 | 21,5 | 25 | 2,5 |
| K Mix-A/B | 7 | 1/5/1/0 | 15 | 18 | 21 | 2,5 |
| L Suite de seguridad | 4 | 1/2/0/1 | 11 | 13,5 | 16 | 10 |
| M MVP4a/4b | 8 | 1/5/2/0 | 19 | 22,5 | 26 | 5 |
| **Total** | **126** | | **289** | **≈ 345** | **404** | **92** |

**Calendario.** El carril FIELD (92 días) es trabajo humano con hardware: no lo absorben los agentes ni se paraleliza consigo mismo. Con un desarrollador principal que absorbe FIELD y la revisión humana obligatoria de seguridad, más agentes en CORE/MIXER/AUDIO/UX:

| Hito | Trabajo acumulado (medio) | Calendario estimado |
|---|---|---|
| MVP0 | ≈ 131 días (A+B+D+C) | 9–11 semanas |
| MVP1 | ≈ 222 días (+E+F+G) | 5–6 meses |
| MVP1.5 Room-Observe | ≈ 247 | 6–7 meses |
| MVP2a / MVP3 (en paralelo) | ≈ 292 | 7–8 meses |
| MVP2b | ≈ 310 | 8–9 meses |
| MVP4a / MVP4b | ≈ 345 | **10–12 meses** |

Un segundo humano con acceso al hardware (aunque sea a tiempo parcial, solo para spikes y campo) recorta 2–3 meses. Los agentes no recortan el carril FIELD.

## Camino crítico

`001 → 003 → 007 → 009 → 036 → 054 → 052 → 055 → 056 → 057 → 060 → 062 → 063 → 072 → 075 → 088 → 091 → 104 → 105 → 119 → 123 → 124 → 126`

Pasa por: Capability Matrix → Analysis Bus → calibración → certificación de tablet → G-B → plugin nativo → FFT → delay finder → transfer function → loopback → G-C → medición de sala → Findings → motor de reglas de EQ → Assisted Apply → closed loop.

**Riesgos de calendario sobre el camino crítico:** certificación de la tablet (052), estabilidad del plugin nativo (057), calibración e igualación de entradas (054, 072) y la suite de seguridad (bloque L). El mapeo RAW de procesamiento (038/039) **no** está en el camino crítico: solo condiciona las sugerencias de canal (082), el mapeo a GEQ (105) y MVP4b.

## Bifurcaciones del orden (planes B)

| Escenario | Se detecta en | Ítems afectados | Plan B |
|---|---|---|---|
| **P0.3b PASS** (Ui24R USB-B 32×32 hacia el tablet) | 051, decidido en 056 | 054, 065 (parte), 078, 079, 072, 073, 036, ADR-15 | DEC-19 escribe ADR-19. Analysis Bus, calibración de Scarlett, gestor del bus, loopback y wizard de loopback → CANCELLED o reescritas. El plugin ya es N-canal (057). Se retira ADR-15: análisis espectral por canal simultáneo, lo que simplifica el Full Band Test. El micrófono de medición entra por un input de la Ui24R (phantom desde la mesa; la regla "Input 2 solo TRS" desaparece). Nuevo SPK-P0.3c: certificación tablet + Ui24R USB-B, 4 h. |
| **Tablet no certifica** (052 FAIL) | 052 | Todo E–M | Segunda tablet de la Hardware Matrix (timebox 5 días). Mientras tanto avanzan los ítems solo-consola (bloque D) y el MVP0 completo, que no dependen de USB. Si ninguna certifica en dos intentos: decisión de alcance por ADR (otra tablet, u otro runtime de medición fuera de §11). |
| **P0.2b / P0.2c FAIL** (mapeo RAW no reproducible) | 038 / 039 | 082, 105, EP-14 | Las recomendaciones se emiten con valor absoluto sugerido, sin `current` ni `delta` (`currentUnknown = true`), para aplicar a mano. MVP4a **no se afecta** (gain y fader son API tipada). MVP4b se difiere a EP-15 hasta que exista mapeo. Las filas quedan DESCONOCIDO en la Capability Matrix. |
| **P0.7a sin seek o sin REC por protocolo** | 012 (bloque A) | 109, 110, 111, 112 | Sin seek: playback siempre desde 0 y takes ≤ 5 min. Sin REC por protocolo: la app guía la grabación manual en la web oficial y detecta el estado por lectura. Si tampoco hay lectura de estado: Mix-A/B se degrada a comparación de dos capturas en vivo (marcada `INSUFFICIENT_DATA` para §113) y G-D se cierra como FAIL documentado. |
| **Sin echo de writes** (007) | 007, 008 | 019–022, 119 | SPK-ACK-POLICY fija el método por parámetro: VU para fader/mute/gain con señal; el resto continúa en ASSISTED con `confirmedBy = TIMEOUT` y aviso "no verificable"; en CONTROLLED AUTO, todo parámetro sin ECHO ni VU es inelegible (INV-11). |

## Qué se puede empezar hoy

Sin hardware disponible: 001–006 (repositorio, ADR, charters, matrices, DoD, invariantes), 013 (validación DSP en escritorio con archivos), 015–018 (proyecto Angular, SQLite, logging, modelo de dominio).
Con la consola y el router, sin Scarlett ni tablet certificada: todo el bloque A, todo el bloque D y el MVP0 completo.
