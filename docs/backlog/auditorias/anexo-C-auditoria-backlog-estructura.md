# Auditoría C — Integridad estructural del backlog (dependencias, orden, completitud, consistencia)

**Objeto:** `out/01-auditoria-integrada.md`, `out/02-backlog.md`, `out/03-orden-implementacion.md`, `out/04-invariantes-seguridad.md` (contrastados con `plan-maestro-v1.1.md` §1–§131 y ADR-01…18).
**Método:** lectura completa + script `tools/graph_check.py` que parsea 02 y 03, construye ambos grafos y reporta mecánicamente ciclos, violaciones de orden, huérfanos, asimetrías `Bloquea a`↔`Depende de`, diferencias 02 vs 03, sumas por bloque y camino más largo. Salida completa en `tools/graph_check_output.txt` y resumida al final de este informe.
**Fuera de alcance (otro auditor):** calidad de los AC, testeabilidad, riesgo, estimaciones absolutas. Aquí solo se verifica la **aritmética** de las estimaciones y su consistencia entre documentos.

---

## Resumen ejecutivo

1. El grafo es **acíclico** en 02 y en 03, no hay violaciones de orden numérico (N depende de M > N) y los 108 ítems de 03 coinciden 1:1 con 02 en ID y tamaño. La base es sólida.
2. Pero el orden **viola dos ADR que él mismo declara**: el Media Player se usa como generador en MVP1/MVP1.5 (S-06.1, S-06.2, S-07.3, S-07.4) mientras el servicio de generador seguro (S-10.1) y sus invariantes HIL (SPK-SAFE-GEN) están en los bloques I/J, después de MVP2a (ADR-02/ADR-11); y hay writes a consola en MVP1/MVP1.5/MVP3 (S-06.3, Player, S-10.2) antes de que exista una sola historia de EP-12 (ADR-11).
3. **Tres de los cinco gates son nodos colgantes** (G-A, G-C, G-D: nada depende de ellos). G-D además está colocado *después* de la épica que debería desbloquear. ADR-07 no está cableado en el grafo.
4. El **camino crítico declarado no es un camino**: 6 de sus 20 aristas no existen en 03. El camino más largo real pasa por P0.5 → CAL → G-B → S-05.1 → S-05.8 → S-06.2 → S-07.x → S-10.3 → S-14.x, y 053/079 (mapeo RAW) **no** están en él; la dependencia 100 ← 053 es innecesaria.
5. Faltan dependencias evidentes: S-02.5 ← SPK-P0.2a, S-07.4 ← SPK-LOOP, S-08.6 ← SPK-P0.2c, S-06.1 ← generador + delay finder, S-10.x ← G-C.
6. Las **sumas de esfuerzo por bloque están por debajo del mínimo aritmético** en A, B y G; el total ≈ 255 está en el extremo inferior del rango real 244–324 (media 284).
7. SPK-P0.3b (USB-B directo) está mal secuenciado: depende de P0.3 (L) cuando solo necesita la tablet; si da PASS invalida 6 ítems ya planificados y no hay ítem de decisión ni plan B escrito.
8. Cobertura Plan/ADR: 13 huecos, ninguno bloqueante, pero cinco merecen historia propia (wizard de loopback, VenueProfile en UI, Double Reference §30, PWA secundaria en EP-15, casos faltantes de la Test Matrix Audio/Network).
9. Consistencia interna: máquina de estados de SoundSession sin transiciones y con orden contrario a §121; estado `PAUSED` (04) vs `CONFLICT` (02); colisión de IDs `S-nn` (invariantes) vs `S-nn.m` (historias); S-28 sin test; 22 referencias comodín/huérfanas (`S-09.3`, `S-10.x`, `P0.10b`, `tools/hil`, "sección 8 de 01").
10. Granularidad: 6 historias L son XL encubiertas (SPK-P0.2a, S-02.5, S-02.9, S-02.10, S-06.7, S-06.1-AC2); 2 historias S deberían fusionarse. Con las correcciones de este informe el backlog queda ejecutable.

---

## Hallazgos

### C-01 · CRÍTICO · Generador usado en MVP1/MVP1.5 antes de que exista el generador seguro
**Ubicación:** S-06.1 AC2 (054), S-06.2 (055), S-07.3 (064), S-07.4 (065) vs S-10.1 (082) y SPK-SAFE-GEN (080); `04` filas S-12'…S-16', S-26'.
**Descripción:** S-06.1 reproduce "tono breve por Player" para el test de loop (S-16'), S-06.2 reproduce el tono −20 dBFS, S-07.3 emite prompts audibles por el PA y S-07.4 reproduce pink al PA. Todo eso ocurre en los bloques F/G. El `GeneratorService` "que solo reproduce si las precondiciones S-13' están verificadas" es S-10.1 (bloque J, #082) y la validación HIL de S-12'…S-16' es SPK-SAFE-GEN (bloque I, #080). Es decir, la app reproduce señal al PA durante dos MVPs sin el componente que implementa las invariantes de generación. `04` agrava la inconsistencia: S-12'/S-13'/S-14'/S-15'/S-26' "aplican desde MVP1.5" pero el Player ya se usa en MVP1 (S-06.1/S-06.2); solo S-16' dice MVP1.
**Corrección propuesta (texto para pegar):**
- En 02, mover S-10.1 a EP-05 como **S-05.10 "Biblioteca de señales y GeneratorService seguro"** con el mismo texto de AC y `Depende de: SPK-P0.6', S-02.11, S-05.1, S-05.2` (S-05.2 aporta el nivel de Input 1 para el abort de S-15'). `Bloquea a: S-06.1, S-06.2, S-07.3, S-07.4, SPK-SAFE-GEN, S-12.1`.
- Mover SPK-SAFE-GEN de EP-09 a EP-04/EP-05 con `Depende de: S-02.11, SPK-P0.6', S-05.1, S-05.10` y colocarlo en 03 inmediatamente después de S-05.10 (ver orden corregido, filas 052a/052b). G-C deja de listarlo; pasa a ser precondición de **S-06.1**.
- S-06.1: añadir `Depende de: S-05.10, S-05.5` (el test de loop es una correlación out→in). S-06.2: añadir `S-05.10`. S-07.3 y S-07.4: añadir `S-05.10, SPK-SAFE-GEN`.
- En 04, cambiar "Aplica desde" de S-12', S-13', S-14', S-15', S-26' a **MVP1**.

### C-02 · CRÍTICO · Writes a consola en MVP1, MVP1.5 y MVP3 sin ninguna historia de EP-12 cerrada (viola ADR-11 y el DoD)
**Ubicación:** S-06.3 (056, transacción System sobre sends del AUX), S-12' (mute forzado de Player L/R al conectar), S-07.4/S-10.1 (MEDIA_PLAY/STOP), S-10.2 (083, mutes de salidas) vs EP-12 completo en bloque L (096–099).
**Descripción:** ADR-11: "Ningún MVP con escrituras se libera sin la suite en verde". El DoD de 02 dice "ninguna historia que escriba en la consola se cierra sin pasar la parte de la suite de seguridad (EP-12) que le corresponde", pero EP-12 no tiene partes: S-12.1 es una única L que depende de S-10.1 (082) y S-12.2 es una única L a continuación. Resultado: MVP1 (escribe sends), MVP1.5 (escribe Player) y MVP3 (escribe mutes de salida) se entregan con cero tests HIL de invariantes. Las invariantes que 04 marca "Aplica desde MVP0/MVP1" (S-03, S-07…S-10, S-17, S-18, S-19, S-22, S-27, S-16') no tienen dónde verificarse antes del bloque L.
**Corrección propuesta:** dividir EP-12 en rebanadas por MVP y cablearlas como dependencias:
```
### S-12.1a Tests unitarios de invariantes — MVP0/MVP1 (lectura, routing, red, E-Stop)
- Tamaño: M · Depende de: S-02.9, S-02.10, S-02.11, S-02.13 · Bloquea a: S-03.10, S-06.3.
- AC: tests con ID para S-03, S-07, S-08, S-09, S-10, S-17, S-18, S-19, S-21 (detección), S-22, S-24; corren en CI.
### S-12.1b Tests de invariantes del generador
- Tamaño: S · Depende de: S-05.10, S-12.1a · Bloquea a: S-06.1, S-07.4.
- AC: S-12', S-13', S-14', S-15', S-16', S-26', S-27 (unit: matriz de precondiciones, archivos, rampa, tope).
### S-12.1c Test de invariante S-28 (medición por componente)
- Tamaño: S · Depende de: S-12.1b, S-02.10 · Bloquea a: S-10.2.
### S-12.1d Tests de invariantes transaccionales
- Tamaño: M · Depende de: S-12.1c · Bloquea a: G-E.
- AC: S-01, S-02, S-04 (writes), S-05, S-06, S-11, S-20, S-21 (abortar), S-23, S-25; cobertura 100 % del pipeline de escritura.
### S-12.2a Harness HIL — lectura, red y generador
- Tamaño: M · Depende de: S-12.1b, S-00.1 (tools/hil) · Bloquea a: S-06.9, S-07.8.
- AC: 20 ciclos de reconexión sin writes pendientes (S-17/S-18), packet loss 10 % y reboot de router (S-17), Wi-Fi débil (atenuación/distancia), notificación sonora durante Player (S-26'), potenciómetro movido (S-27), desmutear Player desde web (S-12'), Direct Monitor ON a propósito (S-16'); informe PASS/FAIL.
### S-12.2b Harness HIL — transacciones
- Tamaño: L · Depende de: S-12.1d, S-12.2a · Bloquea a: S-12.3.
- AC: 100 writes + rollback (S-02), 200 operaciones sin tocar snapshots manuales (S-03), conflicto desde web 100/100 (S-11), kill ×20 (S-20), recall desde web (S-21), corte de red con LEFT muteado (S-28).
```
S-12.3 y G-E quedan como están, dependiendo de S-12.2b. (SPK-SAFE-GEN cubre la parte HIL del generador antes de MVP1; S-12.2a la re-ejecuta como regresión.)

### C-03 · ALTO · Gates G-A, G-C y G-D son nodos colgantes; G-D está después de la épica que debe desbloquear
**Ubicación:** 03 #012, #081, #095; mapa de épicas en 02.
**Descripción (mecánico):** en 03 nadie depende de 012 (G-A), 081 (G-C) ni 095 (G-D). Solo G-B → 044 y G-E → 100 están cableados. El mapa de 02 dice `EP-11 Spike P0.7 ─► G-D ─► EP-11 Mix-A/B`, pero G-D "Depende de: SPK-P0.7, S-11.1…S-11.5", o sea que el gate se revisa **después** de construir lo que debía desbloquear. ADR-07 ("cada MVP desbloquea con su gate") no se cumple en el grafo.
**Corrección propuesta:**
- S-02.5 (017) y S-02.6 (018): añadir `Depende de: G-A`. S-03.1 (027): añadir `G-A`.
- S-10.1→S-05.10 no necesita G-C; S-10.2 (083), S-10.3a (084): añadir `Depende de: G-C`.
- G-D: `Depende de: SPK-P0.7a, SPK-P0.7b` · `Bloquea a: S-11.1`; AC: "acta con existencia de seek/selección, pendrive certificado, repetibilidad de 3 pasadas (§113) demostrada en el spike". La verificación de repetibilidad end-to-end pasa a S-11.5 AC + prueba de campo nueva **S-11.6 Prueba de campo Mix-A/B** (S, `Depende de: S-11.1…S-11.5`), que hoy falta (todas las demás épicas de producto tienen una).
- Mapa de 02: `EP-11 SPK-P0.7a/b ─► G-D ─► S-11.1…S-11.6 (MVP2b)`.

### C-04 · ALTO · Dependencias faltantes evidentes (una historia consume lo que otra produce sin declararlo)
**Ubicación / corrección (texto para las columnas `Depende de` de 02 y 03):**
| Historia | Falta depender de | Por qué |
|---|---|---|
| S-02.5 (017) | SPK-P0.2a (008) | AC5 cubre gain/phantom/AUX/MTX/VU2/snapshots/Player/multitrack: son las filas que P0.2a confirma. El propio camino crítico de 03 asume 008 → 017 pero la arista no existe. |
| S-07.4 (065) | SPK-LOOP (078) | H(f)=S12/S11 necesita `in1In2Offset[]` (igualación In1/In2 ± 0,2 dB) que produce LOOP. Hoy LOOP corre 13 ítems después de la primera medición de sala. Alternativa mínima: S-07.4 AC "sin LOOP, Measurement marca `in1In2Equalized=false` y `confidence` ≤ MEDIUM". |
| S-08.6 (075) | SPK-P0.2c (079) | "AFS2 lectura de estado si la matriz lo permite" — la fila AFS2 (numfixed/numtotal) se prueba en P0.2c, que está después. O mover la lectura de AFS2 a SPK-P0.2a AC1. |
| S-06.1 (054) | S-05.10 (nuevo), S-05.5 (048) | Test de loop electroacústico = reproducir tono + correlación out→in. |
| S-06.4 (057) | S-05.2 (045) | Métricas de nivel para "captura 15–20 s con VU2 + Input 2". |
| S-10.2 (083), S-10.3a (084) | G-C (081) | Ver C-03. |
| S-11.3 (092) | S-05.6 (047) | Alineación por correlación con "el inicio del take" requiere la ventana grabada de Input 2. |
| S-02.13 (026) | S-02.5 (017) | Lee `shows$`/snapshots por el adapter (02 lo declara en "Bloquea a" de S-02.5 pero no en S-02.13). |
| S-12.2 (097) | S-00.1 | "tools/hil" no es un ID; el directorio lo crea S-00.1 AC2. |

### C-05 · ALTO · El camino crítico declarado no es un camino del grafo y no es el más largo
**Ubicación:** 03 §"Camino crítico".
**Descripción (mecánico):** de las 20 aristas declaradas, 6 no existen en 03: 008→017, 017→022 (solo transitiva), 024→031, 031→037, 065→067 (solo transitiva), 085→100. En particular 031→037 es falsa por construcción (el bloque D corre en paralelo con C) y 085→100 es falsa (S-13.1 no depende de S-10.3b). El camino más largo real (tamaño máximo por ítem) es:
`001 → 003 → 007 → 008 → 040 → 042 → 043 → 044 → 045 → 051 → 055 → 064 → 065 → 066 → 067 → 084 → 085 → 105 → 106 → 107 → 108` = 65 días (máx.), y pasa por **SPK-P0.5 → SPK-CAL → G-B → S-05.8 → S-06.2 → S-07.3**, no por 053/079. Con las dependencias faltantes de C-03/C-04 añadidas, el camino más largo pasa a 71 d y atraviesa **SPK-LOOP → G-C → S-10.1 → S-12.x → G-E**. Consecuencias: (a) el texto "los tres riesgos con mayor impacto en el camino crítico son 037, 053/079 y 044" es incorrecto para 053/079 — no están en el camino; (b) 100 ← 053 (S-13.1 depende de S-06.7) es una restricción innecesaria: MVP4a solo escribe gain y fader, ambos con API tipada (S-02.5), no RAW de procesamiento.
**Corrección propuesta:** reemplazar el párrafo por:
> Camino crítico (dependencias reales, tamaño máximo): 001 → 003 → 007 → 008 → 040 → 042 → 043 → 044 → 046 → 048 → 049 → 049a (LOOP) → 081 (G-C) → 083 → 084 → 085 → 096–099 (EP-12) → 100 → 105 → 106 → 108. Los riesgos de calendario sobre él son: certificación de tablet (037, vía G-B), estabilidad del plugin nativo (044), calibración e igualación In1/In2 (042, LOOP) y la suite de seguridad (EP-12). El mapeo RAW (053/079) está fuera del camino crítico y solo condiciona S-06.6, S-10.3b y EP-14.
Y en S-13.1: `Depende de: G-E, S-02.10` (quitar S-06.7).

### C-06 · ALTO · Sumas de esfuerzo por bloque por debajo del mínimo aritmético; total inconsistente
**Ubicación:** 03 §"Resumen de esfuerzo por bloque".
**Descripción (recalculado con S=1, M=2–3, L=4–5 sobre las filas de 03):**
| Bloque | Ítems (S/M/L) | Mín | Medio | Máx | Declarado |
|---|---|---|---|---|---|
| A | 6/5/1 | 20 | 23 | 26 | 17 ← **menor que el mínimo** |
| B | 2/8/4 | 34 | 40 | 46 | 33 ← menor que el mínimo |
| C | 2/7/1 | 20 | 24 | 28 | 20 |
| D | 3/3/1 | 13 | 15 | 17 | 14 |
| E | 0/6/3 | 24 | 28,5 | 33 | 27 |
| F | 2/3/4 | 24 | 27,5 | 31 | 24 |
| G | 2/4/2 | 18 | 21 | 24 | 17 ← menor que el mínimo |
| H | 2/2/3 | 18 | 20,5 | 23 | 19 |
| I | 1/3/1 | 11 | 13 | 15 | 13 |
| J | 2/3/2 | 16 | 18,5 | 21 | 19 |
| K | 1/4/2 | 17 | 20 | 23 | 19 |
| L | 1/1/2 | 11 | 12,5 | 14 | 13 |
| M | 4/3/2 | 18 | 20,5 | 23 | 20 |
| **Total** | | **244** | **284** | **324** | **255** |
**Corrección propuesta:** sustituir la tabla por la de arriba (columnas Mín/Medio/Máx) y el total por "≈ 244–324 días-persona (media 284)". Las frases de calendario ("7–9 meses", "MVP0 en 6–8 semanas") las evalúa el otro auditor; aquí solo consta que el camino más largo hasta MVP0 (036) es de 36 días-máx y hasta MVP1 (061) de 47, mientras que el esfuerzo A+B+C es 74–100 días: con dos carriles reales, MVP0 no baja de 8–10 semanas.

### C-07 · ALTO · SPK-P0.3b mal secuenciado y sin plan de bifurcación (ADR-18)
**Ubicación:** 03 #038 (`Depende de: 037`), G-B (#043), S-05.1 (#044).
**Descripción:** P0.3b solo necesita la tablet, un cable USB-B y la consola; no necesita la Scarlett ni la certificación de 4 h de P0.3. Hacerlo depender de 037 (L, 5 días de trabajo humano) significa que si P0.3b da PASS se habrán gastado esos 5 días certificando un montaje que se descarta. Si PASS, quedan invalidados o cambian: 040 SPK-P0.5 (Analysis Bus innecesario: todos los canales llegan por USB), 042 SPK-CAL, 051 S-05.8 (CalibrationState sin Scarlett), 055 S-06.2, 056 S-06.3, 078 SPK-LOOP, ADR-15 (un canal espectral). Ni 02 ni 03 tienen ítem de decisión ni "variante B" del orden; G-B solo dice "decisión sobre ADR-19".
**Corrección propuesta:**
- 03: `038 SPK-P0.3b · Depende de: 003` y colocarlo **antes** de 037 (primer ítem del bloque D). Timebox 2 días se mantiene.
- Nuevo ítem `043a DEC-19 Decisión de arquitectura con/sin Scarlett` (S, CORE, `Depende de: 038, 043`): AC "ADR-19 escrito; si PASS: 040/042/051/055/056/078 se marcan CANCELLED o REWRITTEN con nuevo AC; S-05.1 pasa a captura N-canal; ADR-15 se retira; si FAIL: sin cambios".
- S-05.1 (044): reescribir AC como "abrir captura de **N** canales (N ≥ 2) sobre el dispositivo elegido" para que el plugin no haya que reescribirlo en ninguna de las dos ramas.

### C-08 · ALTO · Máquina de estados de SoundSession inconsistente con el workflow y con las invariantes
**Ubicación:** S-02.4 AC1 (estados), S-02.12 ("transición de estados validada"), 04 S-06 (`SessionState = CHANNEL_SETUP`, "con Room o Mix activos", "Soundcheck ON"), S-11.1/S-11.2, S-02.10 vs 04 S-11.
**Descripción:** (a) Los estados se enumeran `CREATED/SETUP/CALIBRATING/CHANNEL_SETUP/ROOM/MIX/FULL_BAND/SHOW/CLOSED` en ese orden, contrario al workflow §121/§56 y a ADR-09 (Room-Observe **antes** de Channel). (b) Ninguna historia define la tabla de transiciones ni si se puede volver a CHANNEL_SETUP desde MIX (necesario en la práctica: retocar gain tras el Full Band está prohibido por S-06, pero desde MIX → CHANNEL_SETUP → ¿se invalidan Measurements y MixCandidates?). (c) No existe estado para Virtual Soundcheck (REC/PLAY); S-06 lo trata como flag ("Soundcheck ON", "take activo") y S-11.2 como "estado SOUNDCHECK ACTIVO visible en todas las pantallas". (d) Estados de transacción: S-02.10 lista `DRAFT → APPROVED → SNAPSHOTTED → APPLYING → VERIFYING → APPLIED | PARTIAL | CONFLICT | SUSPENDED | ROLLED_BACK`; 04 S-11 dice "transacción **PAUSED**". (e) `SETUP` vs `CALIBRATING`: no se dice cuál cubre S-06.1 y cuál S-06.2/S-07.2.
**Corrección propuesta:** en S-02.12 añadir AC:
> Tabla de transiciones en `docs/session-lifecycle.md`: `CREATED → SETUP (wizard S-06.1) → CALIBRATING (S-06.2/S-07.2) → ROOM_OBSERVE → CHANNEL_SETUP → SOUNDCHECK_REC → MIX → SOUNDCHECK_PLAY ⇄ MIX → FULL_BAND → RINGOUT → SHOW → CLOSED`; retrocesos permitidos: cualquier estado → CHANNEL_SETUP solo si no hay `VirtualSoundcheckTake` activo (S-06) y con invalidación explícita de Measurements posteriores; ROOM_OBSERVE/ROOM_CORRECT re-entrantes desde MIX. Cada write del Safety Engine consulta el estado (S-06, S-09). Test: matriz estado × transición.
En 04 S-11 sustituir "transacción PAUSED" por "transacción **CONFLICT**". En 02 S-02.4 reordenar la enumeración conforme a la tabla.

### C-09 · ALTO · SPK-P0.7 mezcla preguntas de protocolo (solo consola) con repetibilidad acústica (necesita el motor de audio) y está en #089
**Ubicación:** SPK-P0.7 (089, `Depende de: 008, 048`), S-11.2 ("seek si existe; si no, siempre desde 0").
**Descripción:** las respuestas "¿existe seek/selección de sesión por protocolo?", "¿la grabación MTK falla con `busy$`?", "`hw.disablegain` y `scsrc`" condicionan el diseño de S-11.1/S-11.2/S-11.3 y el alcance de S-06 (gain congelado) — y solo necesitan consola + pendrive. Sin embargo el spike entero espera al delay finder (048) por el criterio de alineación ≤ 2 muestras, y se ejecuta en el bloque K, tras MVP3. Si la respuesta es "no hay seek ni REC por protocolo", se descubre con ~60 ítems de retraso.
**Corrección propuesta:** dividir:
```
### SPK-P0.7a Virtual Soundcheck — protocolo (solo consola)
- Tamaño: M · Depende de: SPK-P0.2a · Bloquea a: S-11.1, G-D.
- PASS: captura de mensajes al seleccionar sesión y arrastrar la barra de tiempo (seek SÍ/NO); REC/PLAY/STOP de MTK por protocolo 3/3 sin busy$ en pendrive candidato (22 canales, 5 min); pasos manuales para entrar/salir ≤ 3; hw.disablegain y scsrc documentados; pendrive en Hardware Matrix. Si REC no es posible por protocolo: plan B documentado = REC manual en la web oficial + detección del estado por lectura.
### SPK-P0.7b Virtual Soundcheck — repetibilidad
- Tamaño: M · Depende de: SPK-P0.7a, S-05.5, S-05.6 · Bloquea a: G-D.
- PASS: 3 playbacks del mismo take → RMS 1/3 oct en Input 2 ± 0,3 dB y en Input 1 ± 0,5 dB; alineación por correlación ≤ 2 muestras.
```
03: P0.7a al bloque A/C (fila 010a), P0.7b al bloque E/F (tras 048).

### C-10 · MEDIO · Huecos de cobertura Plan Maestro / ADR
Ver tabla completa más abajo. Los cinco que requieren historia nueva o AC nuevo:
1. **Wizard de loopback (§19, ADR-17):** SPK-LOOP dice "wizard con instrucciones de cableado" pero un spike no entrega código de producto; ninguna historia lo implementa. Añadir **S-07.0 "Wizard de loopback e igualación In1/In2"** (M, UX/AUDIO, `Depende de: SPK-LOOP, S-05.8, S-05.10`): abre Scarlett OUT solo dentro del wizard (S-26'), guarda `in1In2Offset[]` y `loopbackId` en `CalibrationState`, estado "sin igualación" visible en Room.
2. **VenueProfile (§69) sin UI ni enlace:** está en S-02.4 como entidad, pero ninguna historia crea/selecciona un venue ni lo enlaza a SoundSession/Measurements/roomScore histórico. Añadir a S-02.12 AC: "la sesión referencia `venueProfileId` (crear/elegir venue al iniciar); Room-Observe guarda `measurements` y `historical score` en el venue". Añadir a S-07.7: "informe comparado con la última sesión en el mismo venue si existe".
3. **Double Reference Channel Analysis (§30, directiva §127.10):** S-06.4 captura "VU2 + Input 2"; Input 1 (FOH mic) no se captura por canal, y S-06.6 solo menciona "Hypothesis (CHANNEL vs ROOM/PA)". Añadir a S-06.4 AC: "si hay FOH mic conectado, captura simultánea de Input 1; Measurement con `directRef` e `acousticRef`"; a S-06.5: "comparación directo vs. acústico por bandas; desviación > 6 dB en bandas donde el directo es normal → Hypothesis ROOM/PA con prioridad sobre la de CHANNEL".
4. **PWA secundaria (§11, ADR-01):** no aparece ni en EP-15. Añadir viñeta en EP-15: "**PWA secundaria (solo lectura):** visor de telemetría/dashboard en navegador; sin captura ni writes".
5. **Test Matrix Audio (§108) y Network (§107):** P0.10a/S-05.9 no incluyen guitarra, percusión, full band ni "very low signal"; ninguna historia prueba "weak Wi-Fi". Añadir los 4 archivos a SPK-P0.10a PASS y a S-05.9; "Wi-Fi débil" a S-12.2a (C-02).

### C-11 · MEDIO · Referencias huérfanas, comodines e IDs inexistentes
**Salida mecánica (02):** `S-02.6 → S-09.3` (no existe; EP-09 solo tiene spikes: debe ser **SPK-P0.2c**); `SPK-LOOP → S-10.x`, `S-00.2 → S-02.x`, `SPK-P0.2a → S-03.x`, `S-02.4 → EP-03…EP-14`, `S-00.1 → todo`, `S-02.1 → todo UX`, `S-12.2 → tools/hil`, y 9 referencias a épicas enteras (`EP-01`, `EP-04`, …). Además: S-00.3 lista un charter **P0.10b** que no existe en ningún documento (probable intención: calibración/balística de VU2, hoy fundida en SPK-P0.2a AC2) y **omite SAFE-GEN**; 02 cabecera cita "sección 8 de `01-auditoria-integrada.md`" (01 tiene 6 secciones; la tabla de ownership está en anexo B, B-27); S-07.2 cita "S-20 del plan" (es **§20**; S-20 es la invariante del journal); S-06.7 se titula "P0.2b" pero es historia con "PASS/AC" híbrido.
**Corrección propuesta:** (a) `S-02.6 · Bloquea a: S-06.7, SPK-P0.2c`; (b) S-00.3: quitar "P0.10b", añadir "SAFE-GEN, P0.7a/b"; (c) sustituir comodines por IDs concretos o por "todas las historias de EP-nn" y que el script de CI de `docs/` valide que cada ID referenciado existe; (d) cabecera 02: "Ownership de parámetros en anexo B, hallazgo B-27, y ADR-10"; (e) S-07.2: "§20 del plan"; (f) renombrar S-06.7 a **SPK-P0.2b + S-06.7**: el spike (tabla raw↔físico, escritura en canal de prueba) y la historia (módulo `raw-map` v2 + tests) separados — hoy 03 lo marca MIXER/FIELD y lo cuenta como una L.

### C-12 · MEDIO · 16 asimetrías `Bloquea a` ↔ `Depende de` en 02
**Salida mecánica:** S-02.2→S-02.12; S-02.3→S-02.10; S-02.5→S-02.9/10/11/12/13; SPK-P0.6'→S-07.4; S-05.1→S-05.4/5/7/8; S-06.1→S-06.4/5/6/7. En todos los casos el bloqueador declara bloquear a X pero X no lo lista en `Depende de`. Dos son materiales: **S-02.13 no declara S-02.5** (usa el adapter) y **S-07.4 no declara SPK-P0.6'** (usa el Player). Las otras son transitivas (inofensivas pero ruido para quien planifica con la columna `Depende de`).
**Corrección propuesta:** eliminar la columna `Bloquea a` escrita a mano y generarla desde `Depende de` (inversa del grafo) en el script de docs; añadir explícitamente `S-02.13 · Depende de: SPK-P0.8, S-02.5, S-02.10` y `S-07.4 · Depende de: …, SPK-P0.6'`.

### C-13 · MEDIO · Colisión de espacios de ID e invariante S-28 sin test
**Ubicación:** 04 (IDs `S-01`…`S-28`), 02 (IDs `S-nn.m`), S-12.1 ("S-01…S-27"), S-12.2.
**Descripción:** "S-02" es a la vez la invariante de rollback y el prefijo de la épica Foundation; "S-20 del plan" ya produjo una confusión (C-11). S-28 (nueva en 04) no está en la lista de S-12.1 ("S-01…S-27") ni en el harness S-12.2. S-12.2 tampoco lista S-13'/S-15'/S-16' (los cubre SPK-SAFE-GEN, pero la suite de regresión debería re-ejecutarlos).
**Corrección propuesta:** renombrar invariantes a `INV-01…INV-28` en 04, 02 y 01 (búsqueda/reemplazo `\bS-(\d\d)'?\b` fuera de encabezados `S-nn.m`); S-12.1: "un test por invariante INV-01…INV-28"; S-12.2 (o S-12.2a/b de C-02): añadir INV-28, INV-13', INV-15', INV-16'.

### C-14 · MEDIO · SPK-CAL depende lógicamente de la app que depende de SPK-CAL
**Ubicación:** SPK-CAL PASS último criterio ("cambio de 1 dB en el potenciómetro detectado por la app (S-27)"), S-05.8 (`Depende de: SPK-CAL`), S-06.2.
**Descripción:** el criterio exige la detección por la app (S-05.8/S-06.2), que a su vez dependen del spike. No es un ciclo en el grafo porque el criterio no está modelado, pero el spike no puede cerrarse antes que la historia.
**Corrección propuesta:** quitar ese criterio de SPK-CAL (queda: procedimiento + 10 repeticiones ≤ 0,5 dB) y añadirlo a S-06.2 AC: "test HIL: mover el potenciómetro 1 dB → `CalibrationState = INVALID` y aviso (S-27)".

### C-15 · MEDIO · Historias XL encubiertas y historias triviales
**Salida mecánica:** L con ≥ 5 AC independientes: SPK-P0.2a (5), S-02.5 (6), S-02.9 (5), S-02.10 (5), S-03.4 (5). Por inspección: S-06.7 (7 procesadores × ≥ 7 puntos + escritura en hardware) y S-06.1 AC2 (checklist + test de loop electroacústico = feature de audio).
**Corrección propuesta (divisiones):**
- **SPK-P0.2a** → `SPK-P0.2a` (filas de lectura/escritura básicas + settings, L) y **`SPK-P0.10b Calibración y balística del VU2`** (M, `Depende de: SPK-P0.6'`; coincide con el charter ya listado en S-00.3 y con 01 §5.5 "calibración de balística del VU2 en P0.10"). La lectura de HPF/PEQ/comp/gate (AC3) pasa a SPK-P0.2b.
- **S-02.5** → `S-02.5a MixerDomainAPI + mock` (M), `S-02.5b ConfirmedStateStore + correlación SELF/EXTERNAL + ráfagas` (M), `S-02.5c Cobertura de parámetros del adapter` (M, `Depende de: SPK-P0.2a`).
- **S-02.9** → `S-02.9a Pipeline único + lint + lista blanca` (M), `S-02.9b Reglas por invariante + matriz de autonomía` (M).
- **S-02.10** → `S-02.10a Estados + journal write-ahead + recuperación tras crash` (M), `S-02.10b Rollback granular + BulkExternalChange + confirmedBy` (M).
- **S-06.7** → `SPK-P0.2b` (spike: tablas raw↔físico, escritura en canal de prueba; L) y `S-06.7 raw-map v2 + round-trip tests` (M).
- **S-06.1** → `S-06.1a Wizard de setup/patcheo (checklist, AUX safe, TRS, 48 V, hub, pendrive)` (M) y `S-06.1b Test de loop electroacústico (INV-16')` (M, AUDIO, `Depende de: S-05.10, S-05.5`).
- **Fusiones:** S-13.4 (S) dentro de S-13.1 (es un AC de S-13.1: "docs/autonomy-matrix.md sincronizada + test"); S-10.5 (S) dentro de S-10.4 ("informe y ROOM en el dashboard"). S-00.5 y S-00.6 pueden quedarse separadas (dueños distintos).

### C-16 · MEDIO · Orden y paralelismo: valor tardío evitable y carril FIELD no modelado
**Ubicación:** bloques D–K de 03; notas "puede hacerse durante…".
**Descripción:** (a) 03 reconoce en prosa que 040, 041, 053, 062, 063, 070, 079, 089 pueden adelantarse, pero la numeración (que es "el orden recomendado con un solo carril") no lo refleja; quien siga la secuencia numérica los hará tarde. (b) El bloque I (G-C) está después de H, pero sus ítems solo dependen de E (044, 049, 041, 025): G-C puede cerrarse durante F/G, y entonces **J (Room-Correct) puede correr en paralelo con H (Mix-Live)** en el otro carril, adelantando MVP3 ≈ 20 días. (c) Los 25 ítems FIELD (007–010, 036–042, 053, 061, 069, 076–080, 088, 089, 097, 098, 104, 108) requieren al desarrollador humano con hardware y son mutuamente excluyentes; ninguno de los cinco "carriles" lo modela. La afirmación "bloque D en paralelo con C" solo vale si el humano hace spikes mientre los agentes hacen UX de MVP0 — plausible, pero G-B suma ≥ 11 días-humano seguidos (037+038+039+042).
**Corrección propuesta:** (a) renumerar según la tabla "Orden corregido" de abajo; (b) declarar en 03 un sexto carril **HUMANO/FIELD de capacidad 1** y anotar por bloque los días-humano; (c) mover I a continuación de E y marcar "J ∥ H".

### C-17 · MEDIO · Plan B ausente para los cuatro escenarios de riesgo de secuencia
**Ubicación:** 03 (no existe sección); 02 solo tiene "si no, siempre desde 0" en S-11.2 y "si NO, Room-Correct usa PEQ" en SPK-P0.2c.
**Corrección propuesta:** añadir a 03 la sección "Bifurcaciones del orden":
| Escenario | Detección | Ítems afectados | Plan B (texto a incorporar) |
|---|---|---|---|
| **P0.3b PASS** (Ui24R USB-B 32×32) | #038 (adelantado, C-07) | 037 (parte Scarlett), 040, 042, 051, 055, 056, 078, ADR-15 | DEC-19 (C-07). S-05.1 N-canal. Analysis Bus, SPK-CAL, S-06.2, S-06.3, SPK-LOOP → CANCELLED. `CalibrationState` se reduce a `splOffset`. ADR-15 retirado: S-08.5 pasa a análisis espectral por canal simultáneo. FOH mic entra por un input de la Ui24R (phantom desde la mesa; regla TRS de B-15 desaparece). Nuevo spike SPK-P0.3c "certificación tablet + Ui24R USB-B 4 h" reemplaza a 037. |
| **Tablet no certifica** (037 FAIL) | #037 | Todo D–M | Hardware Matrix con ≥ 2 candidatas antes de 037 (S-00.4 AC); repetir 037 con la segunda (timebox 5 d). Mientras tanto avanzan los ítems solo-consola: 026a (P0.2b), 026b (P0.2c), 010a (P0.7a), 040, 041, 062, 070, y MVP0 completo (U-03). Si ninguna certifica en 2 intentos: escalar a decisión de producto (tablet distinta / laptop Linux como runtime de medición — fuera de §11). |
| **P0.2b/P0.2c FAIL** (mapeo RAW no reproducible) | #026a / #026b (adelantados) | S-06.6, S-10.3b, EP-14 | S-06.6: recomendaciones con valor **absoluto** sugerido, sin `current` ni `delta` (campo `currentUnknown=true`), aplicadas a mano. S-10.3b: idem para filtros de salida. EP-13 **no se afecta** (gain/fader tipados). EP-14 pasa a EP-15 hasta que exista mapeo. Capability Matrix marca las filas DESCONOCIDO. |
| **P0.7 sin seek / sin REC por protocolo** | #010a (P0.7a adelantado) | S-11.1, S-11.2, S-11.3, S-11.4 | Sin seek: playback siempre desde 0; takes limitados a ≤ 5 min (AC nuevo en S-11.1); S-11.3 alinea por correlación (ya previsto). Sin REC por protocolo: S-11.1 pasa a "guiar REC manual en la web oficial + detectar estado por lectura"; el take se registra al detectar STOP. Si tampoco hay lectura de estado MTK: Mix-A/B se degrada a comparación de dos capturas en vivo con la banda (marcado `INSUFFICIENT_DATA` para §113) y G-D se cierra como FAIL documentado. |

### C-18 · BAJO · Foundation para un MVP0 de solo lectura incluye transacciones y snapshot manager
**Ubicación:** 024 S-02.10, 026 S-02.13, 030 S-03.9 (`Depende de: 024`).
**Descripción:** MVP0 no escribe (S-03.4 AC4, S-03.7). S-02.10 (L) y S-02.13 (S) solo se necesitan a partir de S-06.3 (primera transacción System). No están en el camino más largo hasta 036 (que pasa por 016→017→019→027→028→031), así que no retrasan MVP0 en el modelo de dos carriles, pero son 5–6 días de esfuerzo antes del primer valor y S-03.9 puede cumplirse con S-02.7 solamente ("transacciones suspendidas" = lista vacía en MVP0).
**Corrección propuesta (opcional):** `S-03.9 · Depende de: S-02.7`; mover 024 y 026 al final del bloque C (después de 036) sin cambiar dependencias. Si se prefiere mantener el E-Stop y el journal desde el día 1 por coherencia de UI, dejar como está y anotar la decisión.

### C-19 · BAJO · Convenciones y referencias menores
- `backlog-conventions.md`: L = "1 semana", XL > 1 semana, IDs `ORD-nnn`, formato "Como <rol> quiero…"; 02 usa L = 4–5 días, sin `ORD-`, sin "Como… quiero…". Unificar (02 manda; actualizar el borrador o borrarlo).
- S-08.6 (S): Show Ready Dashboard (§122, 7 indicadores) + `mixScore` + checklist AFS2 en una S. Como mínimo M; o mover dashboard a **S-08.6b** (M, UX).
- §112 (acceptance audio) no lo cita ningún gate; añadir a G-B y G-C AC: "§112 verificado punto por punto (repetibilidad, dual input, no clipping interno, FFT/RMS, captura estable, generador)". "No clipping interno" añadir a S-05.9.
- §126.C Protocol Spec: ADR-16 dice que es resultado de P0.2; ninguna historia entrega `docs/protocol-spec.md`. Añadir a SPK-P0.2a entregable: "`docs/protocol-spec.md` v1 (mensajes, paths, unidades) generado desde la Capability Matrix".
- §66 router dedicado / §106: Hardware Matrix (S-00.4) no tiene columna "router"; S-03.1 no advierte si la tablet está en una red distinta a la de la sesión anterior. Añadir columna y AC "recuerda SSID; aviso si cambia".
- §65 DND: SPK-LIFE lo observa; ninguna historia lo aplica. Añadir a S-02.14 AC: "al iniciar sesión, si DND está OFF, sugerir activarlo (intent a ajustes); estado DND visible en el checklist START SESSION".
- §77/§123 "Bass energy increased": Show Monitor (S-03.7) no tiene alertas espectrales; añadir a S-08.5 o EP-15 una nota "alertas espectrales del Show Monitor cuando Input 2 = MASTER_REFERENCE".
- §109 salas: solo "dos salas" en S-07.8/S-10.6/S-14.4; los 6 tipos (incl. outdoor) no se cubren. Anotar en EP-15 o en el registro de riesgos.
- G-B AC "Hardware Matrix con ≥ 1 tablet Certified" vs §106 "diferentes tablets": añadir "segunda tablet/hub certificados" a EP-15.

---

## Salida del script de verificación (`tools/graph_check.py`, resumida)

```text
=== 02: historias parseadas: 108        === 03: ítems: 108
=== 02: ciclos: ninguno                  === 03: ciclos: ninguno
=== 03: violaciones de orden (N depende de M con M > N): total 0
=== IDs en 02 que no están en 03: []     === IDs en 03 que no están en 02: []
=== Tamaño distinto 02 vs 03: ninguno

=== 02: referencias no resolubles a un ID concreto (huérfanos / comodines):
   S-00.1 -> todo | S-00.2 -> S-02.x | S-00.3 -> EP-01, EP-04, EP-09, EP-11 | S-00.6 -> EP-12
   SPK-P0.2a -> S-03.x | S-02.1 -> todo UX | S-02.4 -> EP-03…EP-14 | S-02.5 -> EP-03
   S-02.6 -> S-09.3 (NO EXISTE) | S-02.9 -> EP-03 | S-02.10 -> EP-13 | S-02.11 -> EP-03 | S-02.12 -> EP-03
   S-05.4 -> EP-07, EP-10 | S-06.7 -> EP-13 | SPK-LOOP -> S-10.x | SPK-P0.2c -> EP-14 | S-12.2 -> tools/hil

=== 02: "Bloquea a" declarado sin "Depende de" recíproco (16):
   S-02.2→S-02.12 · S-02.3→S-02.10 · S-02.5→S-02.9, S-02.10, S-02.11, S-02.12, S-02.13
   SPK-P0.6'→S-07.4 · S-05.1→S-05.4, S-05.5, S-05.7, S-05.8 · S-06.1→S-06.4, S-06.5, S-06.6, S-06.7

=== Dependencias distintas 02 vs 03 (03 añade, 02 no las tiene):
   008 SPK-P0.2a +SPK-P0.1 · 011 SPK-P0.10a +S-00.3 · 042 SPK-CAL +SPK-P0.6' · 044 S-05.1 +G-B · 052 S-05.9 +S-05.6
   (ninguna dependencia de 02 queda sin cubrir, ni transitivamente, en 03)

=== Gates: dependientes directos en 03:
   012 G-A: NINGUNO (colgante) · 043 G-B: 044 · 081 G-C: NINGUNO (colgante) · 095 G-D: NINGUNO (colgante) · 099 G-E: 100

=== Esfuerzo por bloque (min/medio/max vs declarado):
   A 20/23/26 (17) · B 34/40/46 (33) · C 20/24/28 (20) · D 13/15/17 (14) · E 24/28.5/33 (27) · F 24/27.5/31 (24)
   G 18/21/24 (17) · H 18/20.5/23 (19) · I 11/13/15 (13) · J 16/18.5/21 (19) · K 17/20/23 (19) · L 11/12.5/14 (13)
   M 18/20.5/23 (20) · TOTAL 244/284/324 (255)

=== Camino crítico declarado: aristas inexistentes en 03:
   008→017 (no, ni transitiva) · 017→022 (solo transitiva) · 024→031 (no) · 031→037 (no) · 065→067 (solo transitiva) · 085→100 (no)
=== Camino más largo real (tamaño máx.): 65 d
   001→003→007→008→040→042→043→044→045→051→055→064→065→066→067→084→085→105→106→107→108
=== Con correcciones C-03/C-04 (S-02.5←P0.2a, S-10.x←G-C, S-07.4←LOOP): 71 d
   001→003→007→008→040→042→043→044→046→048→049→078→081→082→096→097→098→099→100→105→106→107→108
=== Quitar 100←053 no cambia el camino (053 no está en él)
=== Camino más largo hasta MVP0 (036): 36 d · MVP1 (061): 47 d · MVP1.5 (069): 51 d · MVP2b (095): 57 d · MVP3 (088): 60 d

=== Historias con ≥ 5 AC: SPK-P0.2a(L,5) · SPK-P0.8(M,5) · S-02.5(L,6) · S-02.9(L,5) · S-02.10(L,5) · S-03.4(L,5)
=== Ítems FIELD (humano + hardware): 25
   007 008 009 010 036 037 038 039 040 041 042 053 061 069 076 077 078 079 080 088 089 097 098 104 108
```

---

## Tabla de huecos de cobertura Plan Maestro / ADR

| Requisito / decisión | Cobertura en backlog | Estado | Acción |
|---|---|---|---|
| §11 PWA secundaria (ADR-01 "WebAudio … para la PWA secundaria") | ninguna, ni en EP-15 | **HUECO** | EP-15 viñeta (C-10.4) |
| §12 Offline-first | implícito | parcial | S-03.10/S-06.9 AC: "ensayo en modo avión + Wi-Fi local, sin Internet" |
| §16/§106 Hardware Matrix, distintas tablets/hubs/router | S-00.4, SPK-P0.3 (1 tablet) | parcial | columna router; segunda tablet en EP-15 (C-19) |
| §17 Scarlett power | SPK-P0.3 (hub PD) | cubierto | — |
| §18 MeasurementMicProfile | S-07.1 | cubierto | — |
| §19 Loopback calibration (wizard) | SPK-LOOP (spike) | **HUECO** de historia | S-07.0 (C-10.1) |
| §20 SPL digital vs acústico | S-07.2 | cubierto | — |
| §21–24 generador/Analysis Return/Direct Monitor | SPK-P0.6', S-10.1, S-06.1, EP-15 | cubierto, **mal ordenado** | C-01 |
| §25–29 Channel Assistant, perfiles, gain, procesamiento | S-03.2/3.4, S-06.5/6.6/6.7 | cubierto | — |
| §30 Double Reference Channel Analysis | S-06.6 solo "Hypothesis CHANNEL vs ROOM" | **parcial** | C-10.3 |
| §31 Parameter Ownership (+ADR-10, Observation) | S-02.8, S-03.5 | cubierto (pan como owner Mix no se usa: aceptable) | — |
| §32–37 Mix Assistant, roles, MixScene, PerformanceContext, Build Your Mix | S-08.1…S-08.3 | cubierto | — |
| §38–40 Virtual Soundcheck | SPK-P0.7, S-11.1…S-11.3 | cubierto; spike mal ubicado | C-09; falta prueba de campo S-11.6 (C-03) |
| §41 Full Band (ADR-15) | S-08.5 | cubierto | — |
| §42–43 recomendaciones de mix / closed loop mixing | S-08.4, S-11.5, S-13.1 (fader en MIX) | cubierto | — |
| §44 Live Mix Automation | excluido | cubierto (explícito) | — |
| §45–54 Room measurements, multi-posición, consistency, PA component, target, EQ rules, closed loop, métricas | EP-07, EP-10, EP-14 | cubierto | — |
| §55 Room advanced metrics (Precision) | EP-15 | diferido explícito | — |
| §56 AFS2 (re-medición post ring-out; estado guardado) | S-08.6 (checklist), S-14.3 | cubierto; lectura de estado depende de P0.2c | C-04 (S-08.6 ← P0.2c) |
| §57–64 Safety, reglas, concurrencia, VersionedParameterState, rollback, ChangeTransaction, E-Stop, connection safety | EP-02, 04 | cubierto | C-08 (PAUSED/CONFLICT), C-13 |
| §65 Android lifecycle (Foreground, wake/Wi-Fi lock, screen off, background, batería, **DND**) | S-02.14, SPK-LIFE | DND solo observado | C-19 |
| §66 router dedicado | montaje EP-01 | no verificado por la app | C-19 |
| §67 BandProfile | S-03.2, S-08.1 | cubierto | — |
| §68 Mix Signature | EP-15 "Learning"; S-07.5 "Band Signature vacío" | diferido explícito | — |
| §69 VenueProfile (historial, house curve, corrections, score) | solo entidad en S-02.4 | **HUECO** funcional | C-10.2 |
| §70–74 SoundSession, MixScene, Measurement, Recommendation, Confidence | S-02.4, S-02.12 | cubierto; transiciones sin definir | C-08 |
| §75–76, §125 AI layer | EP-15 (+lint sin acceso a MixerDomainAPI) | diferido explícito | — |
| §77/§123 Show Monitor | S-03.7 | alertas espectrales no cubiertas | C-19 |
| §78–88 spikes P0.1–P0.10 | EP-01/04/09/11 | cubierto; P0.10b fantasma | C-11, C-15 |
| §89–104 fases/MVPs | reordenados por ADR-09 | cubierto | — |
| §105 exclusiones | respetadas (multi-mixer en EP-15) | cubierto | — |
| §107 Test Matrix Network (packet loss, reconnect, IP, router reboot, multi-cliente, **weak Wi-Fi**) | SPK-P0.1, S-12.2 | weak Wi-Fi no cubierto; HIL tardío | C-02, C-10.5 |
| §108 Test Matrix Audio (11 casos) | SPK-P0.10a/S-05.9: 7 de 11 | **parcial** | C-10.5 |
| §109 Test Matrix Rooms (6 tipos) | "dos salas" ×3 | parcial | C-19 |
| §110 Test Matrix Failure | S-12.3 | cubierto; tardío para MVP1 | C-02 |
| §111 Acceptance Safety | G-E | cubierto | — |
| §112 Acceptance Audio | disperso; ningún gate lo cita | parcial | C-19 |
| §113 Acceptance Mix | G-D | cubierto; gate mal colocado | C-03 |
| §114 Acceptance Room | S-07.6, S-10.6 | cubierto | — |
| §115–119 principios | S-02.9, S-14.2, S-08.4 | cubierto | — |
| §121 START SESSION / workflow | S-06.8; estados de sesión | cubierto; orden de estados contrario | C-08 |
| §122 Show Ready Dashboard | S-08.6 (S), S-10.5 | cubierto, subdimensionado | C-19 |
| §126 documentos (ADR-16 mínimo) | EP-00 | Protocol Spec sin entregable | C-19 |
| §127 directivas | DoD/lint | cubierto | — |
| §128 → gates G-A…G-E (ADR-07) | 02/03 | **no cableado** | C-03 |
| ADR-01…06, 08…10, 12…16 | EP-05, EP-04, EP-05, EP-03/11, S-02.5, S-02.6, EP-03, EP-07…11, S-02.8, S-02.11, S-02.10, S-02.4, S-08.5, EP-00 | cubiertos | — |
| ADR-11 (suite antes de cualquier MVP con writes) | EP-12 en bloque L | **violado por el orden** | C-02 |
| ADR-17 wizards (Setup, Calibración Scarlett, SPL, Recuperación, Modo Show, CONFLICT, multi-posición) | S-06.1, S-06.2, S-07.2, S-03.9, S-03.8, S-13.2, S-07.3 | cubiertos; falta loopback | C-10.1 |
| ADR-18 P0.3b + variante sin Scarlett | SPK-P0.3b | sin ítem de decisión ni plan B | C-07, C-17 |

---

## Propuesta de orden corregido (solo filas que cambian o se añaden)

Numeración con sufijo para no renumerar los 108 ítems; "∥" = puede correr en paralelo en otro carril. Tamaños según C-15 cuando aplica división.

| # | ID | Título | Carril | Tam. | Depende de | Cambio |
|---|---|---|---|---|---|---|
| 008 | SPK-P0.2a | Capability Matrix subconjunto (sin VU2 ni procesamiento) | MIXER/FIELD | L | 004, 007 | AC2→010b, AC3→026a; entrega `docs/protocol-spec.md` v1 |
| 010a | SPK-P0.7a | Virtual Soundcheck — protocolo (seek/REC/scsrc) | MIXER/FIELD | M | 008 | **nuevo** (de 089) |
| 010b | SPK-P0.10b | Calibración y balística del VU2 | FIELD | M | 008, 041 | **nuevo** (de 008 AC2) |
| 012 | G-A | Gate G-A | CORE | S | 007–010, 010a | añade 010a |
| 017 | S-02.5a/b/c | MixerDomainAPI + mock / ConfirmedStateStore / cobertura | MIXER | M+M+M | **008, 012**, 007, 009, 016 | añade 008 y G-A; dividida |
| 018 | S-02.6 | Tabla RAW y round-trip | MIXER | M | 008, 012, 017 | añade G-A |
| 022 | S-02.9a/b | Pipeline+lint+whitelist / Reglas+matriz | CORE | M+M | 006, 015, 019, 020 | dividida |
| 024 | S-02.10a/b | Journal+recuperación / Rollback+bulk | CORE | M+M | 022 | dividida |
| 026 | S-02.13 | Snapshot manager | MIXER | S | 010, **017**, 024 | añade 017 |
| 026a | SPK-P0.2b | Matriz procesamiento de canal (spike) | MIXER/FIELD | L | 008, 018 | **de 053**, adelantado (solo consola) ∥ bloque C |
| 026b | SPK-P0.2c | Matriz de salidas (EQ/GEQ/delay/polaridad/AFS2) | MIXER/FIELD | L | 008, 018 | **de 079**, adelantado ∥ bloque C |
| 026c | S-06.7 | raw-map v2 + round-trip (historia) | MIXER | M | 026a, 018 | resto de 053 |
| 026d | S-12.1a | Tests unitarios invariantes MVP0/MVP1 | CORE | M | 022, 024, 025, 026 | **nuevo** (C-02) |
| 027 | S-03.1 | Wizard de conexión | UX | M | 012, 017, 019 | añade G-A |
| 030 | S-03.9 | Recuperación tras desconexión | UX | M | 019 | quita 024 (C-18, opcional) |
| 036 | S-03.10 | Prueba de campo MVP0 | FIELD | S | 027–035, 026d | añade 026d |
| 037a | SPK-P0.3b | Ui24R USB-B directo (timebox 2 d) | FIELD | S | 003 | **antes** de 037; quita 037 |
| 037 | SPK-P0.3 | Certificación tablet + Scarlett | FIELD/AUDIO | L | 003, 037a | se ejecuta solo si 037a FAIL o como respaldo |
| 043 | G-B | Gate G-B | CORE | S | 011, 037–042 | sin cambio de deps |
| 043a | DEC-19 | Decisión con/sin Scarlett (ADR-19) y poda del backlog | CORE | S | 037a, 043 | **nuevo** (C-07) |
| 044 | S-05.1 | Plugin de captura **N-canal** | AUDIO | L | 013, 037/037a, 043, 043a | AC N canales |
| 049a | SPK-LOOP | Loopback e igualación In1/In2 | FIELD/AUDIO | M | 049 | **de 078**, adelantado |
| 049b | S-07.0 | Wizard de loopback | UX/AUDIO | M | 049a, 051, 052a | **nuevo** (C-10.1) |
| 052a | S-05.10 | Biblioteca de señales + GeneratorService seguro | CORE/AUDIO | M | 041, 025, 044, 045 | **de 082 (S-10.1)** (C-01) |
| 052b | SPK-SAFE-GEN | Invariantes del generador en HIL | FIELD | M | 025, 041, 044, 052a | **de 080** (C-01) |
| 052c | S-12.1b | Tests unitarios invariantes del generador | CORE | S | 052a, 026d | **nuevo** (C-02) |
| 052d | S-12.2a | Harness HIL lectura/red/generador (+ Wi-Fi débil) | FIELD/CORE | M | 052c, 001 | **nuevo** (C-02) |
| 052e | SPK-P0.4' | Captura dual prolongada durante Player | FIELD | M | 044, 041 | **de 077**, adelantado |
| 052f | SPK-P0.7b | Virtual Soundcheck — repetibilidad | FIELD/MIXER | M | 010a, 048, 047 | **de 089** (C-09) |
| 052g | G-C | Gate G-C | CORE | S | 052e, 049a, 026b, 052b | **de 081**; se cierra al final del bloque E → J ∥ H |
| 054 | S-06.1a | Wizard de setup y patcheo | UX | M | 040, 027, 044, 052c | dividida (C-15) |
| 054a | S-06.1b | Test de loop electroacústico (INV-16') | AUDIO/UX | M | 052a, 048, 054 | **nuevo** |
| 055 | S-06.2 | Calibración de ganancia de Scarlett (+ test S-27) | UX | M | 042, 051, 054, 052a | añade 052a; absorbe criterio de SPK-CAL (C-14) |
| 056 | S-06.3 | Gestor del Analysis Bus | MIXER/CORE | M | 040, 024, 054, **026d** | añade S-12.1a (C-02) |
| 057 | S-06.4 | Captura por canal y Measurement (+ Input 1 si FOH) | UX/AUDIO | M | 056, 047, 050, **045** | añade 045; AC §30 |
| 059 | S-06.6 | Sugerencias HPF/EQ/dinámica | CORE/UX | L | 058, **026c** | era 053 |
| 061 | S-06.9 | Prueba de campo MVP1 | FIELD | S | 054–060, **052d** | añade HIL a |
| 064 | S-07.3 | Wizard multi-posición | UX | L | 054, 055, 041, 050, **052a, 052b** | añade generador |
| 065 | S-07.4 | Pink + transfer function | AUDIO/CORE | M | 049, 048, 064, **049a, 041, 052c** | añade LOOP, P0.6', tests |
| 075 | S-08.6 | Mix score y dashboard | UX | M | 074, 068, **026b** | tamaño M; añade P0.2c |
| 082 | — | (S-10.1 movido a 052a) | | | | **eliminado** |
| 082a | S-12.1c | Test INV-28 | CORE | S | 052c, 024 | **nuevo** |
| 083 | S-10.2 | Medición por componente de PA | CORE/UX | L | 052a, 065, 024, **052g, 082a** | añade G-C, INV-28 |
| 084 | S-10.3a | Motor de reglas de EQ de sala | CORE | L | 067, 083, **052g** | añade G-C |
| 085 | S-10.3b | Mapeo a GEQ/PEQ | MIXER/CORE | M | 084, **026b** | era 079 |
| 087 | — | (S-10.5 fusionada en 086) | | | | **eliminado** |
| 089 | — | (SPK-P0.7 dividido en 010a/052f) | | | | **eliminado** |
| 089a | G-D | Gate G-D | CORE | S | 010a, 052f | **antes** de S-11.1 (C-03) |
| 090 | S-11.1 | VirtualSoundcheckTake y grabación (takes ≤ 5 min; plan B REC manual) | CORE/UX | M | 089a, 016 | deps a G-D |
| 092 | S-11.3 | Alineación por correlación | AUDIO | M | 048, 091, **047** | añade 047 |
| 095a | S-11.6 | Prueba de campo Mix-A/B | FIELD | S | 090–094 | **nuevo** |
| 096 | S-12.1d | Tests unitarios invariantes transaccionales | CORE | M | 022, 024, 025, 082a | reemplaza a S-12.1 |
| 097 | S-12.2b | Harness HIL transacciones (+INV-28) | FIELD/CORE | L | 096, 052d | reemplaza a S-12.2 |
| 100 | S-13.1 | Pipeline de aplicación asistida (+ matriz de autonomía) | CORE/UX | L | 099, 024 | **quita 053**; absorbe S-13.4 |
| 103 | — | (S-13.4 fusionada en 100) | | | | **eliminado** |
| 105 | S-14.1 | Escritura de EQ de salida con caps | MIXER/CORE | M | 026b, 100, 085 | era 079 |

Bloques resultantes: A (001–012, +010a/010b) · B (013–026d) · C (027–036) · D (037a, 037–043a) · E (044–052g, incluye G-C) · F (054–061) · G (062–069) ∥ **J (083–088)** · H (070–076) · K (089a–095a) · L (096–099) · M (100–108). Efecto neto: G-C se cierra ~25 ítems antes, Room-Correct corre en paralelo con Mix-Live, ninguna historia reproduce audio ni escribe en consola sin su rebanada de EP-12, y el mapeo RAW sale del camino crítico.
