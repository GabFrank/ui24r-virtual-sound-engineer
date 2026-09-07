# Auditoría D — Calidad del backlog: criterios de aceptación, números, invariantes, riesgo y estimaciones

**Objeto:** `out/01-auditoria-integrada.md`, `out/02-backlog.md`, `out/04-invariantes-seguridad.md` (y `out/03-orden-implementacion.md` solo como contexto).
**Fecha:** 2026-09-07.
**Lente:** verificabilidad de los AC, corrección técnica de los números (DSP, acústica, protocolo Ui24R), testeabilidad de S-01…S-28, riesgo por historia, estimaciones, pruebas de campo, DoD y gates. El grafo de dependencias, el orden y la completitud respecto al plan los cubre otra auditoría; aquí solo se mencionan cuando un AC o una invariante dependen de ellos.
**Convención de severidad:** CRÍTICO = puede producir audio no deseado en el PA, una escritura destructiva o un AC imposible de cumplir; ALTO = AC no verificable o número incorrecto en el camino crítico; MEDIO = ambigüedad que un agente resolverá arbitrariamente; BAJO = redacción.

---

## Resumen ejecutivo

1. El backlog es, en general, de buena calidad: ~80 % de las historias tienen AC numéricos y las invariantes están escritas como predicados. Los problemas están concentrados en **la frontera entre el generador (Player) y el PA**, en **tres números físicamente incompatibles** y en **AC de campo sin criterio de éxito**.
2. **CRÍTICO:** tres historias reproducen audio por el PA (S-06.2 tono, S-07.3 prompts de voz, S-07.4 pink) sin que ninguna historia anterior implemente S-12'…S-16'; los AC no citan las precondiciones. El generador seguro (S-10.1) y su HIL (SPK-SAFE-GEN) llegan dos MVP después.
3. **CRÍTICO:** S-12' obliga a mutear el Player y poner sus sends a −∞ *al conectar*: destruye la música de entrada, backing tracks o click en monitores de la banda. La invariante de seguridad es, en sí, una escritura destructiva no consentida.
4. **CRÍTICO:** sweep de 10 s con rampa de 6 dB/s desde −40 dBFS: la rampa dura 4,7 s y atenúa la mitad del sweep (20–500 Hz); la deconvolución y la SNR en graves quedan inválidas. El tope −12 dBFS del archivo tampoco acota el SPL: falta el nivel operativo del fader del Player y la política sin SPL calibrado.
5. **ALTO:** cuatro invariantes no son testeables tal como están: S-11 ("lectura ≤ 2 s de antigüedad" es imposible en un protocolo push-only), S-17 ("10 % de pérdida de paquetes" no es observable sobre TCP/WebSocket), S-05 vs S-06.3 (24 writes × 100 ms ≠ ≤ 1 s), S-10 vs S-12' (los sends del Player a monitores *son* writes a un AUX de monitor).
6. **ALTO:** S-14.1 escribe EQ de salida mientras S-08/S-09 declaran master read-only; S-10.2 asume que LEFT/RIGHT ONLY se logra muteando salidas, pero el master estéreo de la Ui24R no tiene mute por lado.
7. Faltan cinco invariantes para escenarios que el propio backlog introduce: Soundcheck ON con canales vivos (y `MTK_REC_TOGGLE` es un *toggle*), generador local por Scarlett OUT, tablet bloqueada en closed loop, dos instancias de la app, firmware distinto al certificado.
8. La "tolerancia" de S-23/S-14.2/S-10.4 no tiene número ni método; sin un spike de repetibilidad, el closed loop puede oscilar sobre ruido de medición.
9. Las ocho "Pruebas de campo" solo miden tiempo; ninguna define qué es fracaso. Se incluye plantilla.
10. Estimaciones: 12 historias están subestimadas (plugin nativo, adapter, mapeo RAW, harness HIL, dominio, motor de reglas, pruebas de campo). Total realista ≈ **305–315 días-persona** (+20 %); calendario 10–12 meses a MVP4b, porque el carril FIELD (≈ 80 días con hardware) es humano y no paralelizable con agentes.

---

## 1. Hallazgos

### 1.1 Seguridad acústica y escrituras (generador, Player, salidas)

**D-01 — CRÍTICO — Audio por el PA antes de que exista el generador seguro; AC sin precondiciones.**
Ubicación: S-06.2 (tono −20 dBFS por Player), S-07.3 (prompts de voz por Player), S-07.4 (pink por Player); invariantes S-12'…S-16' ("aplica desde MVP1.5"); S-10.1 y SPK-SAFE-GEN (EP-10/EP-09).
Descripción: las tres historias reproducen audio por el PA; la primera historia que implementa precondiciones, abort y tope es S-10.1 (MVP3) y su HIL es SPK-SAFE-GEN (G-C). Los AC de S-06.2/S-07.3/S-07.4 no mencionan ninguna precondición, ni abort, ni E-Stop. Un agente codificador que cumpla el AC literal hará `MEDIA_PLAY` con el estado del Player que encuentre. (El reordenamiento lo decide la otra auditoría; aquí lo que falla es el AC.)
Corrección propuesta:
- Nueva historia **S-05.10 "PlayerService seguro (mínimo)"** (M, AUDIO/MIXER, depende de SPK-P0.6', S-02.10, S-02.11; bloquea a S-06.2, S-07.3, S-07.4) con AC = S-12' (versión corregida en D-02), S-13' ítems 1–3 y 6, S-14', S-15' ítems de tope/duración/abort por Input 1; SPK-SAFE-GEN pasa a depender de S-05.10 y a ser prerequisito de S-07.4.
- Añadir a S-06.2, S-07.3 y S-07.4 el AC negativo: *"Given cualquier precondición de S-13' falsa (checksum, sends a monitores ≠ −∞, fader del Player fuera del rango operativo, E-Stop armado), When se solicita reproducir, Then no se envía `MEDIA_PLAY`, se muestra la precondición fallida y se registra el rechazo (test unitario por precondición)."*

**D-02 — CRÍTICO — S-12' es una escritura destructiva sobre una función del usuario.**
Ubicación: S-12'; S-02.11 (E-Stop "mute Player L/R"); SPK-P0.6'.
Descripción: bandas con Ui24R usan el Player para música de entrada, pistas o click a monitores. "Al conectar… se fuerzan mute = ON, fader −∞ y sends a monitores −∞" silencia esas funciones sin consentimiento y viola el espíritu de ADR-10 (Player owner "System" solo mientras está *reservado* para VSE). Un desarrollador cumple la letra y deja a la banda sin pistas en el ensayo.
Corrección (texto para S-12'):
> **S-12'** — El Player L/R solo es controlado por la app tras el paso explícito "Reservar Player para VSE" del Setup Wizard, que (a) lee y guarda el estado completo del Player (mute, fader, pan, sends a todos los buses, pista cargada) como transacción System `PLAYER_RESERVE`, (b) muestra al usuario qué se va a cambiar y exige confirmación, (c) fuerza mute ON, fader −∞ y sends a AUX de monitores −∞. Si el Player está reproduciendo (`player.state$ = PLAYING`) al conectar, la reserva se rechaza y el generador queda NO DISPONIBLE. Al cerrar la sesión o al liberar el Player, se restaura `PLAYER_RESERVE` y se verifica por lectura. Watchdog: mientras está reservado, si mute/fader/sends cambian fuera de una ventana de generación → restaurar ≤ 300 ms + alerta. Test HIL: reservar con Player configurado con sends a AUX 1 y 2 → al liberar, hash del estado del Player idéntico al previo; desmutear desde la web durante la reserva → restauración medida.

**D-03 — CRÍTICO — Sweep de 10 s con rampa de 6 dB/s: la rampa consume media señal.**
Ubicación: S-10.1 ("sweep log 20 Hz–20 kHz (10 s)… rampa 6 dB/s"), S-15' ("arranque −40 dBFS y rampa ≤ 6 dB/s"), SPK-P0.6'.
Descripción: de −40 a −12 dBFS hay 28 dB → 4,7 s de rampa. En un sweep logarítmico de 10 s (1 s/octava), los primeros 4,7 s cubren 20–~520 Hz. Esa región queda 10–28 dB por debajo del nivel nominal: la SNR en graves (donde la sala más lo necesita) se destruye y la deconvolución asume amplitud constante. Físicamente incorrecto tal como está.
Corrección (S-10.1 y S-15'):
> Toda señal de la biblioteca se compone de: **pre-roll** de pink a −40 dBFS con rampa de 6 dB/s hasta el nivel nominal (4,7 s), **1 s de nivel nominal estable**, y luego la señal útil a nivel constante (sweep 10 s, pink 16 s, sine 5 s, burst 3 s). Duración total por archivo ≤ 30 s. El abort por Input 1 > −3 dBFS y por SPL se evalúa desde el primer sample. Test: análisis del WAV muestra envolvente RMS (100 ms) monótona no decreciente durante el pre-roll y constante ± 0,5 dB durante la señal útil.

**D-04 — CRÍTICO — El tope −12 dBFS no acota el SPL; falta el nivel operativo del fader del Player y la política sin SPL calibrado.**
Ubicación: S-13', S-15', S-12' ("fader del Player a −∞"), S-07.2, S-10.1.
Descripción: −12 dBFS en el archivo con fader del Player a 0 dB y master a 0 dB puede superar 110 dB SPL en un PA de bar. S-12' deja el fader en −∞ (estado seguro) pero ninguna invariante dice a qué nivel se sube ni quién lo decide. "Nivel de PA confirmado por el usuario" no es medible. El abort "Input 1 > −3 dBFS" protege la medición, no los oídos: depende del gain del preamp de la Scarlett, que es desconocido (A-19). Sin SPL calibrado (S-07.2 es *opcional*) no existe techo acústico.
Corrección (añadir a S-15'):
> Nivel operativo: el fader del Player (owner System) parte de **−30 dB** en el primer uso en un `VenueProfile`; la app lo sube en pasos de +6 dB solo con acción explícita del usuario ("Subir" con hold 1 s) mientras reproduce pink de pre-roll; el nivel aceptado se guarda en `PAProfile.generatorFaderDb` y nunca se supera automáticamente. Con SPL calibrado, límite 95 dB SPL Z Leq(1 s) y abort ≥ 98. Sin SPL calibrado, tope absoluto del fader del Player = −10 dB y aviso "sin techo acústico" permanente. Test HIL: con `PAProfile.generatorFaderDb = −18`, ninguna transacción de generación envía `p.N.mix` > valor equivalente a −18 dB (assert sobre comandos).

**D-05 — ALTO — S-10 y S-12' se contradicen: los sends del Player a monitores son writes a un AUX de monitor.**
Ubicación: S-10, S-12', S-02.8.
Descripción: S-10 dice "ningún AUX marcado como monitor recibe writes". `p.0.aux.B.value` (send del canal Player al AUX B) es un write al AUX de monitor. El test estático de S-02.8 rechazaría S-12' o, peor, un desarrollador lo relaja globalmente.
Corrección (S-10): *"Ningún AUX marcado como monitor recibe writes, con una única excepción: sends de los canales Player L/R hacia AUX de monitor, únicamente hacia −∞ y solo dentro de `PLAYER_RESERVE`/restauración (D-02). Test estático: el conjunto de paths escribibles ∩ paths de AUX monitor = {`p.0.aux.*.value`, `p.1.aux.*.value`} y el motor rechaza cualquier valor > −∞ salvo en la transacción de restauración."*

**D-06 — ALTO — S-14.1 escribe EQ de salida; S-08/S-09 declaran master read-only.**
Ubicación: S-14.1, S-08, S-09, S-02.8.
Descripción: Room-Correct escribe PEQ/GEQ del bus que alimenta el PA (típicamente master). S-08 lista "master" como read-only sin distinguir fader de procesamiento. O S-14.1 viola la invariante o el desarrollador la reinterpreta.
Corrección (S-08, frase adicional): *"Desde MVP4b y solo en ASSISTED, son escribibles los filtros PEQ/GEQ (gain, freq, Q) y HPF de los buses declarados en `PAProfile.outputBuses[]` (master o AUX/MTX que alimentan el PA); fader, mute, delay, polaridad y limiter de esos buses siguen read-only hasta EP-15. Test estático: paths escribibles de salida ⊆ {`m.eq.*`, `a.B.eq.*` para B ∈ PAProfile}."* S-09 se mantiene (fader master).

**D-07 — ALTO — S-10.2 asume mute por componente; el master estéreo no tiene mute por lado.**
Ubicación: S-10.2 (LEFT/RIGHT/SUB…), S-28, PAProfile en S-02.4.
Descripción: en la Ui24R el master es un bus estéreo con un solo mute; "LEFT ONLY" solo es posible si L y R salen por buses distintos (AUX/MTX) o si el sub va por un AUX. La historia no exige a `PAProfile` declarar la topología ni tiene spike que confirme qué es muteable.
Corrección: (1) `PAProfile` incluye `components[] {name, bus: master|aux N|mtx N, muteable: bool}`; (2) AC nuevo en S-10.2: *"Solo se ofrecen componentes cuyo bus tenga mute individual por protocolo; si L/R comparten el master, la secuencia se reduce a SUB ONLY / FULL (con sub por AUX) o a FULL únicamente, y la UI lo explica."*; (3) **SPK-PA-BUS** (S, EP-09): con la consola real, documentar para master/AUX/MTX qué se puede mutear y el efecto audible (clic) de `mute` en salidas; medir tiempo mute→silencio en Input 2.

**D-08 — ALTO — S-04 se cumple en la letra encadenando transacciones.**
Ubicación: S-04 ("Deltas mayores = transacciones separadas con verificación entre medio"), S-02.9.
Descripción: cinco transacciones ASSISTED de +3 dB en 30 s suman +15 dB y cada una cumple S-04. "Verificación entre medio" no dice verificación de qué.
Corrección (añadir a S-04): *"Tope acumulado por parámetro y sesión respecto al valor al inicio de la sesión: fader ±6 dB, gain ±6 dB, EQ ±6 dB por banda, HPF ≤ 2 octavas, delay ≤ 10 ms. Una nueva transacción sobre el mismo parámetro solo es elegible si existe una `Measurement` posterior a la anterior (no basta la lectura del valor). Test unitario: 3 transacciones consecutivas de +3 dB sin Measurement intermedia → la tercera rechazada con `CUMULATIVE_CAP`."*

**D-09 — ALTO — Falta invariante para Soundcheck ON con canales vivos; `MTK_REC_TOGGLE` es un toggle.**
Ubicación: S-11.1, S-11.2, SPK-P0.7, S-06.
Descripción: Soundcheck sustituye *todas* las entradas patcheadas (A-15): si el cantante-operador tiene su mic vivo y activa Soundcheck, su canal reproduce la pista y su mic muere en pleno ensayo. Además `MTK_REC_TOGGLE` invierte el estado: enviarlo estando en REC detiene la grabación. Ningún AC lo contempla.
Corrección:
> **S-29 (nueva)** — Activar Soundcheck requiere: (a) `recording$ = false` verificado; (b) para cada canal marcado `LIVE` en `ChannelAssignment`, `i.N.scsrc` leído = fuente hardware; si la escritura de `scsrc` no está confirmada en la matriz, la app muestra la lista de canales LIVE con su `scsrc` y exige confirmación; (c) al desactivar, se re-lee el patch y se verifica idéntico al previo. Test HIL: canal 1 LIVE con `scsrc` = pista → activación rechazada 10/10.
> AC negativo en S-11.1: *"Antes de enviar `MTK_REC_TOGGLE` se lee `recording$`; si ya está en el estado objetivo no se envía; tras enviar, se espera `recording$` en el estado objetivo ≤ 1 s o se alerta 'estado de grabación desconocido' y se bloquea cualquier nuevo toggle hasta lectura."*

**D-10 — ALTO — Falta invariante para el generador local por Scarlett OUT (loopback) y el swap de cables.**
Ubicación: SPK-LOOP, S-26' (frase final), S-05.6.
Descripción: el wizard LOOP conecta Scarlett OUT → Input 2, lo que implica desconectar el cable del AUX ANALYSIS de Input 2. Al terminar, nadie verifica que el AUX volvió. Android sigue enrutando notificaciones a Scarlett OUT durante el wizard.
Corrección:
> **S-30 (nueva)** — El generador local (Android → Scarlett OUT) solo existe dentro del wizard LOOP: (a) antes de abrirlo, la app reproduce un tono por el Player y verifica que **no** aparece en Input 2 (el AUX ya está desconectado); (b) tope −20 dBFS, duración ≤ 20 s, cierre ≤ 100 ms al salir del wizard, perder foco o E-Stop; (c) energía no correlacionada con el estímulo en Input 2 > −60 dBFS durante la captura (notificación, otra app) → calibración descartada y repetición; (d) al salir, la app reproduce el tono por el Player y exige que aparezca en Input 2 a −20 ± 1 dBFS ("cable del AUX restaurado") antes de habilitar cualquier medición. Test HIL: salir del wizard sin reconectar el AUX → START SESSION bloqueado.

**D-11 — MEDIO — Falta invariante para tablet bloqueada / app en background durante closed loop.**
Ubicación: S-14.2, S-02.14, SPK-LIFE.
Corrección:
> **S-31 (nueva)** — Ninguna iteración de CONTROLLED AUTO envía un write si la app no está en foreground con pantalla desbloqueada. Si la pantalla se bloquea o la app pasa a background durante Apply/Verify, la transacción en curso completa su verificación (o revierte por timeout S-11) y el loop se detiene sin iniciar una nueva iteración; el estado se muestra al desbloquear. Test: bloquear pantalla en la iteración 2 → 0 writes posteriores, loop en estado STOPPED_BY_LOCK.

**D-12 — MEDIO — Falta invariante para dos instancias de la app contra la misma consola.**
Ubicación: SPK-P0.9, S-02.5, S-02.12.
Corrección:
> **S-32 (nueva)** — Al conectar, la app publica un marcador de presencia (candidato a validar en P0.9: `BMSG^SYNC` con id VSE, o snapshot `VSE_LOCK_<deviceId>` en el show VSE con timestamp renovado cada 60 s) y busca marcadores ajenos; si existe uno con antigüedad < 120 s, arranca en modo READ-ONLY (sin writes, sin generador) y lo muestra. Test HIL: dos tablets → exactamente una con writes; apagar la primera → la segunda obtiene writes tras ≤ 180 s con rearme explícito.

**D-13 — MEDIO — Falta invariante para firmware distinto al certificado.**
Ubicación: S-03.1 ("avisa si difiere"), ADR-06, S-02.6.
Corrección:
> **S-33 (nueva)** — Si `deviceInfo.firmware$` ≠ firmware listado en la Capability Matrix, todo write RAW queda deshabilitado (solo API tipada, y solo en ASSISTED) hasta que el usuario acepte explícitamente "firmware no certificado" y se registre en la sesión. Test unitario + HIL con matriz editada.

**D-14 — ALTO — S-16' quedó obsoleta bajo ADR-02 y falta el test que sí importa.**
Ubicación: S-16', S-06.1 AC2 ("test de loop electroacústico"), SPK-P0.5.
Descripción: con el Player como generador, Scarlett OUT no está conectada a la consola: Direct Monitor no puede crear un loop hacia el PA. Un tono a −60 dBFS por el Player es inaudible en el PA y no detecta nada acústico. El riesgo real que sí existe es que el AUX ANALYSIS esté patcheado físicamente a un amplificador o a monitores (la app ve sends, no jacks).
Corrección (reescribir S-16'):
> **S-16'** — Test de aislamiento del bus: antes de la primera medición de la sesión y tras cada cambio de Setup, la app reproduce pink a nivel de pre-roll (−40 → −30 dBFS) enviado **solo** al Analysis Bus (Player → master = −∞, Player → monitores = −∞) durante 3 s; si la correlación cruzada normalizada entre Input 2 (referencia) e Input 1 (mic) supera 0,3, el bus ANALYSIS está llegando al PA o a monitores → abort y bloqueo de Setup. El test de Direct Monitor se mantiene solo dentro del wizard LOOP (S-30). Test HIL: patchear el AUX ANALYSIS a un monitor a propósito → detección 10/10; con patch correcto → 0 falsos positivos en 10/10.

**D-15 — MEDIO — S-14' no aborta cuando la referencia no llega.**
Ubicación: S-14', S-10.1.
Descripción: si tras `MEDIA_PLAY` Input 2 no muestra señal, la ruta está rota y el audio puede estar yendo a un destino desconocido (otro AUX, monitores). Hoy solo se aborta por exceso, no por ausencia.
Corrección (añadir a S-14'): *"Si ≤ 1,5 s después de `MEDIA_PLAY` Input 2 no muestra energía correlacionada con la señal (> −50 dBFS en la banda del estímulo), se envía `MEDIA_STOP` y se marca 'ruta de referencia rota'. Test HIL: send Player → Analysis Bus a −∞ a propósito → stop en ≤ 2 s 10/10."*

**D-16 — MEDIO — S-28/S-10.2: falta timeout del mute y verificación de que el bus muteado no es monitor.**
Corrección (añadir a S-28): *"Un mute de componente nunca permanece > 120 s sin re-confirmación del usuario (auto-restauración con verificación). Solo se mutean buses ∈ `PAProfile.outputBuses`; cualquier bus con sends de monitor activos es rechazado (test estático). La UI muestra en todo momento la lista exacta de buses muteados por la app."*

**D-17 — MEDIO — S-06.7 escribe procesamiento en hardware sin AC de camino negativo.**
Ubicación: S-06.7 ("escritura probada en hardware en un canal de prueba").
Corrección: *"Given canal de prueba sin señal, con su fader a −∞, mute ON y fuera de todo AUX (verificado por lectura) y master muteado manualmente por el usuario (confirmación), When se escribe cada parámetro en 10 %, 50 % y 90 % del rango físico, Then la lectura coincide ± 1 % y ningún otro path del estado cambió (diff del `ConfirmedStateStore` = solo el path escrito). Nunca en `SessionState = SHOW`."*

**D-18 — MEDIO — Stereo link replica sends (A-06): S-06.3 y SPK-P0.5 no lo contemplan.**
Corrección: AC en SPK-P0.5: *"Con canal X linkeado a X+1, poner X a 0 dB en el bus: documentar si X+1 también cambia; medir aislamiento resultante."* AC en S-06.3: *"Si el link replica, el par se trata como unidad de análisis y la UI lo indica; si no, se verifica por lectura que X+1 sigue a −∞."*

### 1.2 Invariantes no testeables o incoherentes

**D-19 — ALTO — S-11 "lectura ≤ 2 s de antigüedad" es imposible en un protocolo push-only.**
Ubicación: S-11, S-02.5 AC3.
Descripción: el `ConfirmedStateStore` solo cambia cuando llega un mensaje. Un parámetro que nadie tocó en 10 min tiene "antigüedad" de 10 min; no existe comando de lectura. Con la letra actual, ningún write pasaría.
Corrección: *"Toda escritura va precedida de `currentValue == expectedValue` leído del `ConfirmedStateStore` en estado VALID (= conexión CONNECTED ininterrumpida desde el último volcado completo y sin `BulkExternalChange` posterior); si el store está INVALID o difiere → CONFLICT…"* El test HIL queda igual.

**D-20 — ALTO — S-05/S-11 dependen de un ACK que P0.1 puede demostrar inexistente; no hay política sin echo.**
Ubicación: S-05 ("ack del anterior"), S-11 ("eco/VU esperado ≤ 500 ms; sin confirmación → transacción detenida"), S-02.5 AC6, SPK-P0.1 PASS 2.
Descripción: si la mesa no hace echo al emisor (A-02: DESCONOCIDO), solo fader/mute/gain tienen verificación indirecta (VU2); sends, EQ y dinámica quedarían siempre UNVERIFIED y toda transacción se detendría en el primer write. El backlog lo delega en "política alternativa" sin definirla.
Corrección: (1) **SPK-ACK-POLICY** (S, tras P0.1, bloquea S-02.9): documento de 1 página con la tabla parámetro → método de confirmación {ECHO, VU, RECONNECT-DUMP, NONE}; (2) texto para S-11: *"Si P0.1 concluye sin echo: `confirmedBy = VU` es válido para fader/mute/gain con señal presente (VU2 ≥ −60 dB); para el resto, la transacción continúa en ASSISTED con `confirmedBy = TIMEOUT` y el usuario ve 'no verificable' por change; en CONTROLLED AUTO, todo parámetro sin ECHO ni VU es inelegible."*

**D-21 — ALTO — S-17/S-02.7 "> 10 % de pérdida en 30 s" no es observable en WebSocket.**
Descripción: TCP no pierde paquetes desde la app; se manifiesta como latencia y gaps. Nadie puede escribir el test.
Corrección: *"UNSTABLE = gap entre frames VU2 > T_gap (P0.1; propuesta inicial 3× el intervalo medio) **o** p95 del intervalo VU2 en 30 s > 2× la mediana medida en P0.1. Test HIL: `tc netem loss 10 %` y `delay 200 ms` en el router → UNSTABLE en ≤ 5 s en 10/10."*

**D-22 — ALTO — S-06.3 "conmutación ≤ 1 s" es incompatible con S-05 "≥ 100 ms entre writes con ack".**
Descripción: seleccionar un canal en el bus = ~24 sends a −∞ + 1 a 0 dB + taps ≈ 26 writes × 100 ms = 2,6 s sin contar acks.
Corrección (S-05): *"Transacciones System (Analysis Bus, PLAYER_RESERVE, mutes de componente) están exentas del límite de 4 parámetros; pacing ≥ 20 ms entre writes; verificación por lectura del conjunto completo al final (≤ 1 s tras el último write). ASSISTED/AUTO conservan ≥ 100 ms y ack por write."* SPK-P0.5 mide el tiempo real y S-06.3 adopta ese número.

**D-23 — MEDIO — Falta la tolerancia numérica y el método en S-23, S-14.2 y S-10.4; falta spike de repetibilidad.**
Descripción: "score(after) < score(before) − tolerancia" sin tolerancia permite que el closed loop haga KEEP sobre ruido de medición y luego REVERT en la siguiente iteración (oscilación).
Corrección: **SPK-REPEAT** (M, FIELD, en EP-09): medir QUICK 5 veces sin tocar nada en dos salas → σ de `roomScore` y σ por banda de la desviación al target. Texto para S-23: *"tolerancia = max(2·σ_roomScore medida en SPK-REPEAT para ese `VenueProfile`, 2 puntos); KEEP requiere además que la desviación RMS al target baje ≥ 0,5 dB. Sin SPK-REPEAT para la sala, el closed loop no está disponible."*

**D-24 — MEDIO — S-24/S-02.4: `confidence = HIGH` solo está definida para multi-posición.**
Descripción: "consistencia ≥ 80 % de posiciones y desviación ≥ 2× ruido de medición" no aplica a Channel (una posición, `consistency = N/A`) ni a Mix; "ruido de medición" no está definido.
Corrección (S-02.4 AC4): tabla por dominio: Room — consistencia ≥ 0,8 y |desviación| ≥ 2·σ_banda (SPK-REPEAT); Channel — dos capturas consecutivas con el mismo Finding (misma banda ± 1/6 oct, mismo signo) y SNR ≥ 20 dB en la banda; Mix — Finding presente en ≥ 2 de 3 ventanas de 10 s de la captura. MEDIUM/LOW con umbrales a la mitad; INSUFFICIENT_DATA si duración < mínimo o `calibrationState = INVALID`.

**D-25 — BAJO — Referencias desactualizadas S-01…S-27.**
Ubicación: S-00.6, S-12.1, ADR-11. Corrección: "S-01…S-28 (+ S-29…S-33 de esta auditoría)".

### 1.3 Corrección técnica de números y definiciones

**D-26 — ALTO — Delay finder "error ≤ 2 muestras vs retardo conocido": el retardo absoluto no es conocido; y no vale para SUB.**
Ubicación: S-05.5, S-11.3, SPK-P0.7.
Descripción: el delay de salida de la mesa se suma a latencias fijas desconocidas (AUX vs master, conversión). Solo el *incremento* es conocido. Además, con señal limitada a 30–100 Hz (SUB ONLY en S-10.2) el pico de correlación de pink tiene varios ms de ancho: ±2 muestras es inalcanzable.
Corrección: *"Test diferencial: medir τ₀ con delay 0 ms y τ_k con 10/50/150 ms; |(τ_k − τ₀) − k| ≤ 2 muestras. Para señales con ancho de banda < 500 Hz, la precisión exigida es ≤ 1/8 del período de la frecuencia superior y se usa correlación sobre envolvente o fase desenvuelta."*

**D-27 — MEDIO — Definiciones de clip inconsistentes y VU2 sin referencia a 0 dBFS.**
Ubicación: S-03.3 (peak > −1 dBFS en `vuPre`), S-03.7 (≥ 3 clips en 10 s), S-05.2 (≥ 3 muestras ≥ 0 dBFS), P0.10a, SPK-P0.2a PASS 2.
Descripción: A-31 dice que es DESCONOCIDO si 0 dB del VU = 0 dBFS; `vuPre` es un valor balístico a 10–20 fps, no muestras. Tres definiciones distintas de "clip".
Corrección: *"Clip por telemetría = frame de `vuPre` ≥ V_clip, donde V_clip es el valor de `vuPre` leído en P0.2a con tono a −1 dBFS; frames consecutivos = un evento. Clip por audio (Input 1/2) = ≥ 3 muestras consecutivas con |x| ≥ −0,1 dBFS o true-peak > 0 dBTP."* En P0.2a: calibrar `vuPre` con tono por **loop físico AUX ANALYSIS → input libre en modo línea** (no por el canal Player), o documentar el supuesto de balística idéntica.

**D-28 — MEDIO — S-07.6: "≈ 0", σ > 4 dB sin dependencia de frecuencia, "multi-posición" indefinido, 3 posiciones ⇒ 3/3.**
Corrección (tabla para S-07.6):
| Finding | Regla |
|---|---|
| Exceso/defecto global | desviación del mismo signo ≥ 2 dB en ≥ 80 % de posiciones (QUICK: 3/3; STANDARD: 5/6) |
| Null localizado | 1 posición ≤ −8 dB y todas las demás dentro de ± 3 dB del target |
| Inconsistencia espacial | σ entre posiciones > 6 dB (< 100 Hz), > 4 dB (100–500 Hz), > 3 dB (> 500 Hz), con suavizado 1/3 oct |
| Problema multi-posición | mismo signo ≥ 2 dB en ≥ 50 % y < 80 % de posiciones |
Y añadir: *"validado con espectros sintéticos (uno por Finding) y con los datos de campo de S-07.8"*.

**D-29 — MEDIO — S-08.3 "masking proxy" requiere espectros por fuente que ADR-15 niega.**
Descripción: "bandas donde dos fuentes con roles distintos aportan > 70 %" exige el espectro de cada fuente; en vivo solo hay espectro del master + VU2. Además "dos fuentes aportan > 70 %" es dimensionalmente confuso.
Corrección: *"Proxy de solapamiento = bandas 1/3 oct donde el espectro del master en el estado N supera al del estado N−1 en < 1 dB pese a que el VU post-fader de la fuente añadida está ≥ −20 dB (la fuente 'no aparece'), o donde la energía sube > 6 dB (acumulación). Se informa como Observation con `confidence ≤ MEDIUM` y nota 'espectro por fuente no disponible en vivo'. Análisis por fuente exacto solo en Mix-A/B (EP-11)."*

**D-30 — MEDIO — S-08.4: la métrica de "LEAD +2 a +4 dB sobre SUPPORT" no está definida.**
Corrección: *"relación = diferencia entre promedios energéticos de `vuPostFader` (dB → potencia → media 3 s → dB) sobre la ventana de captura; se declara como proxy de nivel, no de loudness; configurable por rol e instrumento."*

**D-31 — MEDIO — S-06.5/S-06.6 sin números para sibilancia, exceso de graves ni compresor, y sin golden set.**
Corrección: sibilancia = energía 5–9 kHz ≥ energía 1–4 kHz − 6 dB durante ≥ 10 % de las ventanas de 100 ms con voz activa; exceso de graves = energía < 150 Hz ≥ energía 150–1 000 Hz + 3 dB en voz/guitarra acústica; compresor: threshold = percentil 90 del RMS fast − 3 dB, ratio por perfil (2:1 voz, 3:1 bajo…). AC nuevo en S-06.6: *"golden set de ≥ 10 capturas reales etiquetadas por el usuario (esperado: HPF ± 1/3 oct, bandas PEQ ± 1/3 oct y ± 1,5 dB); ≥ 8/10 coinciden; 0 recomendaciones fuera de S-04."*

**D-32 — MEDIO — S-03.7: "sostenido" y "nivel de referencia de sesión" indefinidos.**
Corrección: *"master > V(−3 dBFS) durante ≥ 5 s continuos; nivel de referencia del lead vocal = promedio de `vuPostFader` durante el Full Band Test o fijado a mano ('marcar ahora'); alerta si ≥ 4 dB por debajo durante ≥ 10 s con la voz activa (`vuPre` ≥ −40 dB)."*

**D-33 — MEDIO — S-07.3: prompts de voz fuera de la biblioteca; auto-inicio por estabilidad frágil.**
Descripción: S-10.1 solo lista sweep/pink/sine/burst; los prompts de voz de S-07.3 no tienen checksum ni tope. Cambiar de pista (voz → pink) añade latencias variables del Player. "Estable ± 1 dB durante 2 s" con RMS fast sobre pink fluctúa por sí solo.
Corrección: *"Un archivo compuesto por posición (voz 'posición N, listo en 5…' + 1 s silencio + pre-roll + pink 16 s + beep) en la biblioteca con checksum y tope −12 dBFS; el inicio de la ventana de análisis se detecta por onset del pink en Input 2 (referencia eléctrica), no por estabilidad del mic; repetición si sample-peak en Input 1 > RMS slow + 15 dB (ruido impulsivo) o γ² media < 0,5."*

**D-34 — MEDIO — SPK-P0.1: "reconexión < 10 s" con router apagado.**
Corrección: *"< 10 s desde que la red vuelve a estar disponible (ping a la mesa OK), en 20/20."* Y separar los tres modos de corte con su tiempo.

**D-35 — MEDIO — SPK-P0.7: ± 0,5 dB por banda en Input 1 en toda la banda es optimista en graves.**
Corrección: *"Input 2 ± 0,3 dB; Input 1 ± 0,5 dB > 200 Hz y ± 1 dB ≤ 200 Hz, con integración sobre los 5 min completos."*

**D-36 — MEDIO — SPK-CAL/S-06.2: ± 0,5 dB con potenciómetro manual repetido 10 veces.**
Descripción: exigir al usuario girar un knob hasta ± 0,5 dB es frágil (S-27 lo detecta, pero cada sesión lo repite).
Corrección: *"Input 2 en modo línea con gain al **mínimo físico** (posición repetible); el ajuste fino a −20 ± 0,2 dBFS se hace con el fader master del AUX ANALYSIS (owner System, dentro de la transacción de calibración). PASS: 10 sesiones → σ ≤ 0,2 dB sin tocar la Scarlett; +1 dB en el knob detectado (S-27)."* Verificado físicamente: −20 dBFS del Player con sends a 0 → ≈ 0 dBu en el AUX; la línea de la 2i2 al mínimo (+22 dBu máx.) lo lee a ≈ −22 dBFS, por lo que el trim de +2 dB en el bus cae dentro de rango.

**D-37 — BAJO — Coherencia: falta número mínimo de promedios.**
Descripción: γ² con pocos promedios está sesgada hacia 1 (sesgo ≈ 1/N).
Corrección (S-05.4/S-07.4): *"la máscara de coherencia solo se aplica con ≥ 16 promedios; con menos, todos los bins se marcan 'insuficiente'."*

**D-38 — BAJO — True-peak ± 0,1 dB vs referencia depende del filtro.**
Corrección (P0.10a): *"true-peak según ITU-R BS.1770-4 (×4, mismo filtro que la referencia); tolerancia ± 0,2 dB; sample-peak ± 0,05 dB."*

**D-39 — BAJO — Aislamiento "< −80 dBFS" en SPK-P0.5: definir el observable.**
Corrección: *"medido en el bin del tono (FFT 32k, Hann) con tono a −6 dBFS en el canal no seleccionado; broadband RMS informativo."*

**D-40 — BAJO — Promediado lineal "≥ 8 s para pink" es corto en graves.**
Descripción: a 31,5 Hz con 32k/50 % hay ≈ 23 promedios en 8 s → σ ≈ 0,5 dB por banda; justo en el umbral de ± 0,5 dB.
Corrección: *"≥ 16 s para bandas < 100 Hz (resolución 32k), 8 s para el resto (multi-resolución)."* Coherente con D-33 (pink 16 s).

**D-41 — BAJO — S-05.6: "nunca por USB si el Player está activo" es confuso.**
Corrección: *"reproducción por la salida de auriculares de la Scarlett solo si el Setup verificó que Scarlett OUT no está cableada a la consola y nunca durante una ventana de captura."*

**D-42 — BAJO — SPK-P0.6' "latencia MEDIA_PLAY→audio ≤ 500 ms" puede ser inalcanzable (lectura del pendrive) y no es la que importa.**
Corrección: *"PLAY→audio: informativa (documentar p50/p95); STOP→silencio en Input 2 ≤ 500 ms p95: bloqueante."*

### 1.4 AC vagos o sin camino negativo (resto)

**D-43 — MEDIO — S-10.3a: 12 casos sintéticos sin resultado esperado.**
Corrección: *"cada caso define filtros esperados (freq ± 1/6 oct, gain ± 1 dB, Q ± 30 %) o 'ningún filtro' (null, inconsistencia); PASS = 12/12; además 0 boosts > 2 dB y 0 filtros en Findings con consistency < 0,8 (asserts)."*

**D-44 — MEDIO — S-13.5/S-14.4: "0 incidentes de seguridad" sin definición.**
Corrección: *"incidente = cualquiera de: write fuera del pipeline (lint/log), change UNVERIFIED sin aviso visible, invariante S-nn violada en el log, audio no solicitado en el PA reportado por el usuario, transacción en APPLYING > 10 s, E-Stop usado por necesidad. Se cuentan desde el log exportado."*

**D-45 — MEDIO — S-14.4 "converge o se detiene con explicación".**
Corrección: *"converge = dos iteraciones consecutivas sin mejora ≥ tolerancia (D-23) → STOP_CONVERGED; se detiene = 5 iteraciones, E-Stop, S-31 o REVERT ×2 → STOP_<motivo>; en ambas salas el informe muestra la serie de `roomScore` por iteración."*

**D-46 — MEDIO — S-07.5: house curves sin números; "visualización clara".**
Corrección: *"cada preset definido en `docs/house-curves.md` como tabla 1/3 oct (20 Hz–20 kHz) con fuente; test que carga cada preset y verifica 31 valores; 'target superpuesto con desviación por banda coloreada por |Δ| (≤ 2 / 2–4 / > 4 dB)'."*

**D-47 — BAJO — S-03.8 "contraste alto"; S-03.3 "legible a 1 m"; S-05.7 "sin bloquear la UI"; S-03.4 AC5 "revisados por el usuario".**
Corrección: contraste ≥ 7:1 (WCAG AAA) en Modo Show; texto ≥ 16 px (≥ 24 px en Show); "sin bloquear" = ningún frame > 50 ms en 60 s con el profiler; "revisados" = checklist de perfiles con fecha y firma del usuario en `docs/channel-profiles.md`.

**D-48 — BAJO — S-03.6 y S-10.5: "export" y "informe" sin formato.**
Corrección: `.zip` con `session.json` + `events.jsonl` + `report.md` (plantilla de §6 de este informe).

### 1.5 Pruebas de campo, DoD y gates

**D-49 — MEDIO — Las ocho "Prueba de campo" no definen éxito/fracaso.**
Ubicación: S-03.10, S-06.9, S-07.8, S-08.7, S-10.6, S-13.5, S-14.4 (y G-D §113).
Descripción: solo hay objetivos de tiempo; "recomendaciones aceptadas/descartadas", "resultado percibido", "Findings revisados contra escucha" no tienen umbral. Ver plantilla y criterios en §6.

**D-50 — MEDIO — El DoD común no aplica a spikes; no exige evidencia por AC; la revisión "por segundo agente" no basta para seguridad.**
Corrección (S-00.5):
> **DoD historia:** todos los AC marcados con evidencia enlazada (id de test, log, captura); tests unitarios en verde; log estructurado; matriz/ADR actualizados si aplica; CHANGELOG; revisión por **persona** si la historia toca `write()`, Safety Engine, generador o invariantes (agente solo como pre-revisión); parte correspondiente de EP-12 en verde.
> **DoD spike:** charter cerrado con PASS/FAIL por criterio y evidencia archivada en `docs/spikes/<id>/`; matrices y registro de riesgos actualizados; ADR si cambia una decisión; código en `tools/spikes/` sin obligación de tests ni CHANGELOG; timebox respetado o extensión aprobada por escrito.

**D-51 — MEDIO — Los gates no distinguen criterios bloqueantes de informativos ni definen qué pasa en FAIL.**
Ubicación: G-A…G-E.
Corrección (añadir a cada acta): tabla *criterio → bloqueante/informativo → resultado → acción en FAIL*. Ejemplos: G-A: P0.1 echo SÍ/NO = informativo (activa SPK-ACK-POLICY); P0.9 sobrescrituras = bloqueante. G-B: P0.3b = informativo; P0.3 xruns > 1/h = bloqueante (acción: segundo tablet/hub, timebox 5 días, luego ADR-19). G-C: SPK-SAFE-GEN cualquier 9/10 = bloqueante (no se abre EP-10). G-E: cualquier invariante sin HIL = bloqueante. Regla general: **un solo re-run** por criterio bloqueante antes de escalar a decisión de alcance (ADR); owner del gate = desarrollador principal; el acta se firma con fecha.

---

## 2. Tabla de números revisados

| # | Ubicación | Valor actual | Veredicto | Valor propuesto | Justificación |
|---|---|---|---|---|---|
| 1 | P0.10a, S-05.9 | RMS ± 0,1 dB, peak ± 0,1 dB | OK (sample-peak) / ajustar (true-peak) | RMS ± 0,1; sample-peak ± 0,05; true-peak ± 0,2 | Misma señal y misma ventana → error solo numérico; true-peak depende del filtro ×4 (BS.1770-4) |
| 2 | P0.10a | FFT ± 0,5 dB por banda 1/3 oct | OK para validación | mantener; + "≥ 16 s < 100 Hz" | Con 8 s a 32k/50 % hay ≈ 23 promedios → σ ≈ 0,5 dB a 31,5 Hz (D-40) |
| 3 | P0.10a, S-05.3 | FFT ≥ 32k @ 48 kHz para 31 Hz | Correcto | mantener | Banda 31,5 Hz = 28,1–35,5 Hz (7,3 Hz); bin 1,46 Hz → 5 bins; 16k daría 2–3 |
| 4 | P0.10a | Hann, solape 50 % | OK | mantener (75 % opcional para TF) | Estándar Smaart/REW |
| 5 | S-05.4, S-07.4 | γ² umbral 0,7 | Razonable | 0,7 máscara; ≥ 0,8 para Findings de EQ; ≥ 16 promedios | Sesgo ≈ 1/N con pocos promedios (D-37) |
| 6 | S-05.4 | loopback: mag ± 0,5 dB, γ² > 0,95 | OK | "20 Hz–20 kHz" explícito | Fuera de 20 Hz–20 kHz la Scarlett y el anti-alias bajan γ² |
| 7 | S-05.5 | delay 0–200 ms, error ≤ 2 muestras | Rango OK; test incorrecto | test diferencial; ≤ 2 muestras solo banda ancha; sub: ≤ 1/8 período | D-26; 10 m ≈ 29 ms + DSP PA ≈ 10 ms + mesa |
| 8 | S-05.2 | true-peak ×4 | Correcto @ 48 kHz | mantener | BS.1770-4 |
| 9 | S-05.2 | clip ≥ 3 muestras ≥ 0 dBFS | Ajustar | ≥ −0,1 dBFS o > 0 dBTP | Algunos HAL entregan 0,9999 como full-scale (D-27) |
| 10 | S-03.3 | clip = `vuPre` > −1 dBFS | No verificable aún | V_clip calibrado en P0.2a | 0 dB del VU ≠ 0 dBFS es DESCONOCIDO (A-31) |
| 11 | S-15', S-10.1 | tope −12 dBFS | OK como tope digital | mantener + fader operativo −30 dB inicial, −10 dB máx. sin SPL | No acota SPL por sí solo (D-04) |
| 12 | S-15', S-10.1 | rampa 6 dB/s desde −40 | Incompatible con sweep 10 s | pre-roll 4,7 s + 1 s estable, señal útil a nivel constante | 28 dB / 6 dB/s = 4,7 s = 20–520 Hz del sweep (D-03) |
| 13 | S-15' | 95 dB SPL | Razonable | 95 dB SPL Z Leq(1 s), abort ≥ 98 | NIOSH: 47 min a 95 dBA; señal ≤ 30 s; definir ponderación y constante |
| 14 | S-15' | abort Input 1 > −3 dBFS | Solo protege la medición | mantener + techo por fader (D-04) | Depende del gain del preamp, no observable (A-19) |
| 15 | S-15', S-10.1 | duración ≤ 30 s | OK | mantener (pre-roll incluido) | |
| 16 | S-16' | tono −60 dBFS / 500 ms | Obsoleto bajo ADR-02 | pink −40→−30 dBFS 3 s solo al bus; corr. > 0,3 = fallo | Direct Monitor ya no llega al PA (D-14) |
| 17 | S-13' | cuenta regresiva 3 s | OK | mantener | |
| 18 | S-14', S-11 | ack ≤ 500 ms; reintentos ×3 → alerta 2 s | Coherentes | mantener; punto de medida = Input 2 | 3 × 500 ms + margen = 2 s |
| 19 | S-12' | watchdog ≤ 300 ms | Alcanzable | mantener | Inbound + write en LAN < 100 ms |
| 20 | ADR-05, P0.9 | ventana SELF/EXTERNAL 300 ms | OK | 300 ms; 1 000 ms durante ráfaga | Echo tardío en recall → falso EXTERNAL (dirección segura) |
| 21 | ADR-05, S-21 | ráfaga > 10 params en < 1 s | OK | "> 10 paths distintos" | Un mute group de 10 canales dispara invalidación: aceptable |
| 22 | S-02.7, S-17 | gap VU2 / > 10 % pérdida en 30 s | Pérdida no observable | gap > 3× intervalo medio o p95 > 2× mediana | TCP (D-21) |
| 23 | S-05 | ≥ 100 ms entre writes | OK ASSISTED; incompatible con S-06.3 | 20 ms pacing para System | 26 writes × 100 ms = 2,6 s > 1 s (D-22) |
| 24 | S-06.3 | conmutación ≤ 1 s | Alcanzable solo con D-22 | número de SPK-P0.5 | |
| 25 | S-04 | fader/gain ± 3, EQ ± 3/± 4, HPF 1 oct, delay 5 ms, master ± 1 | Razonables | + topes acumulados por sesión (D-08) | Encadenable |
| 26 | S-05 | ≤ 4 params ASSISTED, ≤ 1 AUTO | OK | + exención System (D-22) | |
| 27 | S-07.6, S-10.3a | consistencia ≥ 0,8 | OK | explicitar 3/3 en QUICK, 5/6 en STANDARD | 0,8 × 3 = 2,4 |
| 28 | S-07.6 | desviación ≥ 2 dB | OK | mantener | ≈ 2σ de repetibilidad a LF con 16 s |
| 29 | S-07.6 | null ≤ −8 dB, resto ≈ 0 | "≈ 0" indefinido | resto dentro de ± 3 dB del target | D-28 |
| 30 | S-07.6 | σ > 4 dB | Sin dependencia de frecuencia | 6 / 4 / 3 dB por tramo | Varianza posicional natural < 100 Hz en salas pequeñas |
| 31 | S-10.3a | boosts ≤ 2 dB, Q ≥ 0,7, ≥ 50 % reducción RMS | OK | mantener | |
| 32 | S-07.3 | auto-inicio ± 1 dB / 2 s | Frágil | onset por Input 2 (D-33) | RMS fast de pink fluctúa ± 1 dB solo |
| 33 | S-07.3, U-06 | QUICK ≤ 15 min | Alcanzable | mantener; STANDARD por componente ≤ 35 min o 1 posición/componente | 6 pos × 6 comp × 50 s ≈ 30 min |
| 34 | SPK-P0.5 | aislamiento < −80 dBFS | Alcanzable en bin | medir en bin del tono | Ruido de línea de la 2i2 ≈ −100 dBFS broadband |
| 35 | SPK-CAL, S-06.2 | ± 0,5 dBFS con knob; 10 repeticiones | Frágil | knob al mínimo + trim por fader del bus ± 0,2 | D-36 |
| 36 | S-27 | > 1 dB → INVALID | OK | mantener; añadir Input 1 (loop test/SPL) | |
| 37 | SPK-P0.7 | ± 0,3 In2 / ± 0,5 In1; alineación ≤ 2 muestras | LF optimista | ± 1 dB ≤ 200 Hz en In1 | D-35 |
| 38 | SPK-P0.4' | H(f) ± 0,3 dB en 60 min; deriva 0 muestras | Correcto | mantener | Mismo ADC → deriva 0 es esperable; ≠ 0 = bug |
| 39 | SPK-LOOP | In1/In2 ± 0,2 dB 20 Hz–20 kHz | Alcanzable | mantener; nivel del Y ≤ −20 dBFS en In1 | Spec 2i2 ± 0,06 dB; no saturar el mic-in |
| 40 | SPK-P0.1 | reconexión < 10 s | Mal referenciado | < 10 s desde red disponible | Reboot de router 30–60 s (D-34) |
| 41 | SPK-P0.6' | PLAY→audio ≤ 500 ms | Posible inalcanzable | informativo; STOP ≤ 500 ms bloqueante | Lectura de pendrive (D-42) |
| 42 | S-05.3, S-05.7 | ≤ 15 % CPU; ≤ 240 bins; 20 ev/s; 20 fps | Coherentes | mantener; fijar config de medición | 1/12 oct × 10 oct = 120 bandas |
| 43 | S-02.1 | arranque < 3 s | OK | mantener | |
| 44 | S-06.5 | resonancia > 6 dB sobre 1/3 oct en 1/12 | OK | mantener | |
| 45 | S-02.11, S-19 | E-Stop local ≤ 200 ms, botón ≥ 64 px | OK | mantener | |

---

## 3. Top-10 historias de riesgo

| # | Historia | Riesgo | ¿AC refleja el riesgo? | ¿Tamaño refleja el riesgo? | Spike previo |
|---|---|---|---|---|---|
| 1 | **S-07.4 / S-07.3 / S-06.2** — pink, prompts y tono por el PA | Audio en PA sin generador seguro (D-01) | No: sin precondiciones ni abort | M/L sin contar seguridad | Falta: S-05.10 + SPK-SAFE-GEN antes |
| 2 | **S-10.2** — mutes de salida por componente | Dejar el PA mudo/parcial en vivo; topología de buses desconocida (D-07) | Parcial (S-28), falta timeout y topología | L correcto | Falta: SPK-PA-BUS |
| 3 | **S-06.7** — escritura RAW de procesamiento en hardware | Valor mal escalado = cambio extremo en un canal | No: sin camino negativo (D-17) | L → XL | P0.2a solo lectura; el spike de escritura es la propia historia |
| 4 | **S-05.1** — plugin nativo de captura | Estabilidad USB/xruns; UNPROCESSED; lifecycle | Sí | L → XL | SPK-P0.3 ✓ |
| 5 | **S-02.5** — Adapter + ConfirmedStateStore | Base de toda verificación; política sin echo (D-20) | Sí, salvo no-echo | L → XL | P0.1/P0.9 ✓; falta SPK-ACK-POLICY |
| 6 | **S-14.2** — closed loop | Writes desatendidos; oscilación sobre ruido (D-23, D-11) | Falta tolerancia y S-31 | L correcto | Falta: SPK-REPEAT |
| 7 | **S-11.2** — Soundcheck ON / patch | Mic vivo muerto en ensayo; toggle (D-09) | No | M correcto con S-29 | P0.7 no prueba `scsrc` con canal vivo → añadir |
| 8 | **S-06.3** — gestor del Analysis Bus | 26 writes por conmutación en consola viva; stereo link (D-18, D-22) | Parcial | M → L | P0.5 ✓ (ampliar) |
| 9 | **S-13.1** — primer Assisted Apply | Primer write real de usuario | Sí (G-E) | L correcto | ✓ |
| 10 | **S-12.2** — harness HIL | Si el harness es débil, todo G-E es papel | Sí, pero 9 escenarios con hardware manual (potenciómetro, kill) | L → XL | — |
| — | Mención: S-02.11 (E-Stop, M → L por test de UI en todas las rutas + HIL cronometrado); S-12' (invariante destructiva, D-02) | | | | |

---

## 4. Re-estimaciones

Referencia: S = 1, M = 2,5, L = 4,5, XL = 7–8 días-persona (media usada por el backlog para llegar a ≈ 255).

| ID | Actual | Propuesto | Δ días | Justificación |
|---|---|---|---|---|
| S-05.1 Plugin captura | L | XL (dividir 5.1a captura/enumeración, 5.1b servicio/xruns/timestamps/test instrumentado) | +3 | Kotlin + USB + UNPROCESSED + Foreground Service + tests instrumentados en tablet |
| S-02.5 Adapter + Store | L | XL | +3 | 15 áreas de cobertura + mock con/sin echo + correlación + ráfagas |
| S-02.4 Dominio v1 | L | XL | +3 | ≥ 20 entidades con validación, round-trip SQLite 100 %, diagrama generado, fórmulas con ejemplos |
| S-06.7 Matriz procesamiento + RAW | L | XL | +2 | ≥ 7 puntos × ~25 parámetros extraídos del JS o capturados + escritura en hardware |
| SPK-P0.2a | L | XL | +2 | 20 funciones + VU2 (balística) + 5 procesadores × 5 puntos + settings |
| S-06.6 Sugerencias HPF/EQ/dinámica | L | XL | +3 | 5 perfiles × 5 procesadores + explicaciones + golden set (D-31) |
| S-10.3a Motor de reglas EQ | L | XL | +2 | Simulación de resultado + 12 casos con esperado (D-43) |
| S-12.2 Harness HIL | L | XL | +3 | 9 escenarios; netem, kill, potenciómetro; informe automático |
| S-02.11 E-Stop | M | L | +2 | Test de UI que recorre rutas + HIL cronometrado + rearme |
| S-06.3 Analysis Bus | M | L | +2 | Transacción System de 26 writes, stereo link, restauración en E-Stop/desconexión |
| S-02.13 Snapshot manager | S | M | +1,5 | Colisión, retención, hash de no-VSE en HIL |
| Pruebas de campo ×8 (S-03.10, 06.9, 07.8, 08.7, 10.6, 13.5, 14.4, G-D) | S | M | +12 | Preparación + ensayo (noche) + informe con plantilla; además latencia de calendario ≈ 1 semana cada una (disponibilidad de banda/sala) |
| **Subtotal subestimaciones** | | | **≈ +39** | |
| S-05.10 PlayerService seguro (nueva) | — | M | +2,5 | D-01 |
| PLAYER_RESERVE + restauración (en S-05.10/S-06.1) | — | +1 | +1 | D-02 |
| SPK-ACK-POLICY (nueva) | — | S | +1 | D-20 |
| SPK-PA-BUS (nueva) | — | S | +1 | D-07 |
| SPK-REPEAT (nueva) | — | M | +2,5 | D-23 |
| S-29…S-33 tests unit + HIL (en S-12.1/S-12.2) | — | M | +2,5 | §1.1–1.2 |
| Archivos compuestos por posición + house curves numéricas | — | S | +1 | D-33, D-46 |
| **Subtotal ítems faltantes** | | | **≈ +12** | |
| **Total** | ≈ 255 | **≈ 305–315** | **+50–60 (+20–23 %)** | |

**Impacto en calendario.** El 7–9 meses supone dos carriles efectivos de ~20 días/mes. Pero el carril FIELD (spikes con hardware, HIL, pruebas de campo, gates) suma ≈ 80 días y es **trabajo humano con hardware**, no delegable a agentes ni paralelizable con otro FIELD. Con el desarrollador principal absorbiendo FIELD + revisión humana obligatoria de seguridad (D-50), el calendario realista es: **MVP0 en 9–11 semanas**, **MVP1 en 5–6 meses**, **MVP4b en 10–12 meses**. Un segundo humano con acceso al hardware (aunque sea a tiempo parcial para spikes y campo) recorta 2–3 meses; los agentes no.

---

## 5. Invariantes nuevas (resumen para pegar en `04-invariantes-seguridad.md`)

| ID | Invariante | Test | Aplica desde |
|---|---|---|---|
| S-12' (reescrita) | Ver D-02: reserva explícita, guardado y restauración del estado del Player; sin reserva no hay generador. | HIL: hash del Player antes/después; unmute desde web → restauración ≤ 300 ms. | MVP1 |
| S-15' (ampliada) | Ver D-03/D-04: pre-roll; fader operativo −30 dB inicial, +6 dB por acción, −10 dB máx. sin SPL; 95 dB SPL Z Leq(1 s). | Unit: análisis del WAV; HIL: assert sobre `p.N.mix`. | MVP1 |
| S-16' (reescrita) | Ver D-14: test de aislamiento del bus ANALYSIS por correlación In1/In2 < 0,3. | HIL: patch a monitor a propósito → 10/10. | MVP1 |
| S-29 | Soundcheck ON solo con `recording$ = false` y canales LIVE con `scsrc` hardware verificado; restauración del patch verificada. | HIL: canal LIVE con scsrc pista → rechazo 10/10. | MVP2b |
| S-30 | Generador local solo dentro del wizard LOOP, con verificación de cables antes y después. | HIL: salir sin reconectar AUX → START SESSION bloqueado. | G-C |
| S-31 | CONTROLLED AUTO no envía writes sin foreground + pantalla desbloqueada; el loop se detiene, no se reanuda solo. | Instrumentado: bloquear en iteración 2. | MVP4b |
| S-32 | Presencia de otra instancia → READ-ONLY. | HIL: dos tablets. | MVP0 |
| S-33 | Firmware ≠ certificado → sin writes RAW. | Unit + HIL con matriz editada. | MVP1 |
| S-04 (+) | Topes acumulados por sesión; nueva transacción solo tras `Measurement` posterior. | Unit. | MVP4a |
| S-05 (+) | Exención System con pacing 20 ms y verificación de conjunto. | Unit + P0.5. | MVP1 |
| S-10 (+) | Única excepción: sends Player→monitor hacia −∞ dentro de PLAYER_RESERVE. | Estático. | MVP1 |
| S-11 (reescrita) | Store VALID en vez de "≤ 2 s"; política sin echo por parámetro. | HIL. | MVP4a |
| S-14' (+) | Abort por ausencia de referencia en Input 2 ≤ 1,5 s. | HIL. | MVP1 |
| S-17 (reescrita) | UNSTABLE por cadencia VU2 (gap / p95), no por "pérdida de paquetes". | HIL con netem. | MVP0 |
| S-23 (+) | Tolerancia = max(2·σ SPK-REPEAT, 2 puntos) y Δ RMS ≥ 0,5 dB. | Unit con σ sintética. | MVP4b |
| S-28 (+) | Timeout 120 s; solo buses de `PAProfile`; lista visible. | HIL. | MVP3 |

---

## 6. Plantilla mínima de informe de prueba de campo

Archivo: `docs/field/<MVP>-<YYYY-MM-DD>-<sala>.md`. Todos los campos obligatorios; sin ellos la historia no cierra.

```markdown
# Prueba de campo <MVP> — <sala> — <fecha>

## 1. Contexto
- Build / commit: … · Firmware Ui24R: … · Tablet / Android: … · Interfaz / hub / pendrive: …
- Sala (VenueProfile), PA (PAProfile), banda (BandProfile), nº de canales usados: …
- Participantes y roles (quién operó, quién tocó): …
- Estado de calibración: Scarlett (CalibrationState id) · SPL (sí/no) · mic profile (sí/no)

## 2. Objetivos medibles (copiados de la historia) y resultado
| Métrica | Objetivo | Medido | PASS/FAIL |
|---|---|---|---|
| Tiempo por wizard / canal / posición | … | … | … |
| Recomendaciones generadas / aceptadas / descartadas / "no entendidas" | ≥ N aceptadas o valoradas ≥ 4/5 | … | … |
| Incidentes de seguridad (definición D-44) | 0 | … | … |
| Desconexiones y recuperación (n / tiempo / diff correcto) | 100 % recuperadas | … | … |
| Crashes / ANR | 0 | … | … |
| Métrica de dominio (ver §6.1) | … | … | … |

## 3. Cronología (hh:mm) de eventos relevantes (inicio, cada wizard, alertas, E-Stop, desconexiones)

## 4. Valoración del usuario (escala 1–5, con comentario) por recomendación/Finding

## 5. Fallos y sorpresas (qué pasó, qué esperaba la app, evidencia: log id / captura)

## 6. Decisiones derivadas (ajustes de perfiles, umbrales, historias nuevas con ID)

## 7. Adjuntos: export de sesión (.zip), log (.jsonl), fotos del montaje, mediciones de referencia externas
```

### 6.1 Criterio de éxito por prueba (propuesta para pegar en cada AC)

| Historia | Se mide | Éxito | Fracaso (obliga a re-ejecutar) |
|---|---|---|---|
| S-03.10 MVP0 | Tiempo por canal; recomendaciones de gain; alertas del Show Monitor | ≥ 80 % de canales ≤ 5 min; ≥ 50 % de recomendaciones aceptadas o valoradas ≥ 4/5; 0 falsos positivos de clipping confirmados por el usuario; 0 writes en el log | Cualquier write; > 1 crash; alerta de red falsa > 2 |
| S-06.9 MVP1 | Tiempo por canal; HPF/EQ/dyn sugeridos; calibración | ≥ 70 % de recomendaciones valoradas ≥ 4/5 tras aplicar a mano; calibración válida toda la sesión (S-27 sin INVALID no provocado) | ≥ 2 recomendaciones fuera de S-04; INVALID no explicado |
| S-07.8 Room-Observe | Findings vs medición de referencia (REW/Smaart en las mismas posiciones, mismo mic) | Top-3 Findings coinciden en banda (± 1/3 oct) y signo con la referencia en 2/2 salas; QUICK ≤ 15 min | Finding de exceso global que la referencia no muestra; γ² media < 0,7 en > 30 % de bandas |
| S-08.7 Mix-Live | Build Your Mix; recomendaciones de fader | ≤ 15 min; ≥ 60 % de recomendaciones de fader valoradas ≥ 4/5; 0 recomendaciones de EQ/gain desde Mix | > 1 recomendación fuera de S-04 |
| S-10.6 Room-Correct | Antes/después aplicado a mano | Δ RMS al target ≥ 1 dB y `roomScore` +≥ tolerancia en ≥ 1/2 salas; 0 boosts > 2 dB; 0 filtros sobre nulls | Score empeora en ambas salas |
| G-D / S-11 Mix-A/B | Repetibilidad §113 | 3 pasadas: Input 2 ± 0,3 dB, Input 1 ± 0,5/± 1 dB (D-35); alineación ≤ 2 muestras; A vs B distinguible con confidence ≥ MEDIUM | Alineación fallida en > 1 pasada |
| S-13.5 MVP4a | ≥ 10 applies asistidos | 10/10 APPLIED o CONFLICT explicado; 0 UNVERIFIED silenciosos; rollback probado ≥ 2 veces con verificación | Cualquier incidente (D-44) |
| S-14.4 MVP4b | Closed loop en 2 salas | Converge (D-45) o se detiene con motivo en 2/2; 0 incidentes; S-31 verificado a propósito | Oscilación KEEP/REVERT ≥ 2 veces |

---

## 7. Lista de acciones por prioridad

1. **Antes de arrancar Fase 0:** aplicar D-02, D-03, D-04, D-14, D-19, D-20, D-21, D-22 en `04-invariantes-seguridad.md` (son cambios de texto, sin costo) y añadir S-29…S-33.
2. **Antes de G-B:** crear S-05.10, SPK-ACK-POLICY, SPK-PA-BUS, SPK-REPEAT; ampliar P0.2a (Player L/R mute/fader/sends, VU2 por loop físico), P0.5 (stereo link), P0.7 (`scsrc` con canal LIVE).
3. **Antes de EP-06:** AC negativos de D-01, D-17, D-18; definiciones de clip (D-27); calibración por knob al mínimo + trim (D-36).
4. **Antes de EP-07:** tabla de Findings (D-28), house curves numéricas (D-46), archivos compuestos (D-33), confidence por dominio (D-24).
5. **Antes de EP-12:** DoD-spike y protocolo de FAIL de gates (D-50, D-51); definición de incidente (D-44); plantilla de campo (§6) aplicada retroactivamente a S-03.10 y S-06.9.
6. **Re-estimar** con la tabla de §4 y comunicar 10–12 meses o asignar un segundo humano al carril FIELD.
