# Invariantes de seguridad

**Versión 1.2.** Estas 34 invariantes son la suite de aceptación de seguridad del proyecto (ADR-011). Cada una tiene enunciado verificable, test unitario, test contra hardware real y la versión desde la que aplica.

**Ninguna historia que escriba en la consola o reproduzca audio se cierra sin su rebanada de la suite en verde.** Cada test lleva el identificador de su invariante en el nombre.

El generador de señal es el reproductor de la consola (ADR-002); las invariantes originales del retorno de análisis quedan reservadas para la épica opcional posterior.

**Definiciones comunes**
- *Store VALID:* `ConfirmedStateStore` alimentado por `inbound$`, con conexión CONNECTED ininterrumpida desde el último volcado completo y sin `BulkExternalChange` posterior.
- *Ventana de generación:* intervalo entre el `MEDIA_PLAY` de una transacción de generación y su `MEDIA_STOP` confirmado.
- *PLAYER_RESERVE:* transacción System que guarda y luego restaura el estado completo del Player (mute, fader, pan, sends a todos los buses, pista cargada).
- *Incidente de seguridad (para pruebas de campo):* write fuera del pipeline, change UNVERIFIED sin aviso visible, invariante violada en el log, audio no solicitado en el PA reportado por el usuario, transacción en APPLYING > 10 s, o E-Stop usado por necesidad.

## Estado de implementación

Cubiertas por test unitario, en `packages/safety`, `packages/domain` y
`packages/updater`:
INV-001, INV-002, INV-003, INV-004, INV-005, INV-006, INV-007, INV-008,
INV-009, INV-010, INV-017, INV-019 (parte de bloqueo), INV-020, INV-021,
INV-024, INV-025, INV-034.

Pendientes de hardware, se cierran con su spike: INV-011 (política de
confirmación, depende de SPK-P0.1), INV-012 a INV-016 y INV-026 (generador,
dependen de SPK-P0.6' y SPK-SAFE-GEN), INV-018, INV-022, INV-023, INV-027 a
INV-033.

Ninguna invariante se marca como cerrada por pasar contra el simulador: el
simulador reproduce nuestras hipótesis del protocolo, no la consola.

**Cláusulas que estaban declaradas y no las aplicaba nadie.** Se corrigieron
todas en la misma tanda, después de una auditoría que encontró cinco casos del
mismo patrón —la invariante escrita, probada y muerta— que ya se había visto
con INV-034:

- **INV-001** comprobaba que la referencia a la instantánea no fuera nula, no
  que la instantánea existiera. El campo `existenciaVerificada` estaba
  declarado y no lo escribía ni lo leía nadie. Ahora el ejecutor relee la lista
  de la consola antes de aplicar, y el segundo escenario del enunciado —borrar
  la instantánea entre guardarla y aplicar— por fin se detecta.
- **INV-008 e INV-010** están enunciadas sobre rutas, pero el motor decidía con
  la clase que declaraba quien proponía el cambio. Un envío a un auxiliar de
  monitor etiquetado como fader de canal pasaba. Ahora `clasificarRuta` deriva
  la clase de la ruta y el motor rechaza cuando no coinciden, o cuando la ruta
  no se reconoce.
- **INV-004**, cláusulas de Q mínimo en salidas y realce máximo de sala: las
  constantes existían en el dominio y ninguna regla las consultaba.
- **INV-004**, tope acumulado: sumaba magnitudes en vez de desplazamiento neto,
  así que bloqueaba justamente el movimiento que devuelve el parámetro hacia su
  valor inicial.
- **INV-019**, lista blanca: estaba escrita y el motor rechazaba todo con el
  paro activo, incluido un retroceso. Funcionaba porque el retroceso no pasaba
  por el motor, que no es lo mismo que estar permitido.
- **INV-034**, cláusula de transacción en curso: la señal existía en la
  aplicación y **nadie la ponía en `true`**, así que la parte de la invariante
  que impide actualizar en medio de una escritura no se disparaba nunca. Ahora
  lo avisa el ejecutor de transacciones, que es quien sabe cuándo hay una, y el
  aviso se apaga en un `finally` — un aviso pegado dejaría la aplicación sin
  poder actualizarse nunca y nadie sabría que está pegado. `SafetyService`
  arma el ejecutor ya conectado, para que no se pueda armar uno que se olvide.
- **INV-003**, retención: `MAX_SNAPSHOTS_AUTOMATICAS = 20` estaba escrita y no
  la consultaba nadie, así que la retención existía como número en un archivo.
  Ahora `snapshotsABorrar` decide qué borrar y, sobre todo, qué no: nunca una
  instantánea ajena, nunca una `VSE_` que no sea automática, y nunca una cuyo
  nombre no se pueda fechar —sin poder ordenarla no se sabe si es la más vieja,
  y conservar de más es el error barato.

**INV-019, parte de interfaz.** El bloqueo de escrituras y la lista blanca
tienen test unitario. La *presencia* del botón la comprueba
`tools/visual/flujo.mjs`, que abre un diálogo modal y verifica que el paro siga
siendo alcanzable — la comprobación se agregó porque no lo era: un `dialog`
abierto con `showModal()` tapaba el botón flotante. El tamaño y la presencia en
las once pantallas todavía no se verifican automáticamente.

| ID | Invariante | Test | Desde |
|---|---|---|---|
| INV-001 | Ninguna transacción pasa a APPLYING sin `snapshotRef` verificado en la lista de snapshots re-leída. Nombre `VSE_AUTO_<ts>` en show `VSE`. | Unit + HIL: aplicar sin snapshot → rechazado; borrar snapshot entre save y apply → abortada. | MVP4a |
| INV-002 | Cada `Change` guarda `previousValue` leído de consola. Rollback restaura ese valor exacto y lo verifica por lectura. | HIL: 100 writes aleatorios + rollback → 100/100. | MVP4a |
| INV-003 | La app solo crea/borra nombres con prefijo `VSE_`. Retención máx. 20 automáticos. Snapshots no-VSE nunca se modifican. | Unit: `packages/domain/test/snapshots.test.ts` -- la política de retención decide qué borrar y nunca devuelve una instantánea ajena, una `VSE_` no automática, ni una que no se pueda fechar. HIL pendiente: hash de snapshots no-VSE idéntico tras 200 operaciones, cuando SPK-P0.8 permita listarlas. | MVP0 |
| INV-004 | Delta máximo por transacción: fader ±3 dB; gain ±3 dB; EQ ±3 dB (salida) / ±4 dB (entrada), Q ≥ 0,7 en salidas; HPF ≤ 1 octava; delay ≤ 5 ms; master ±1 dB y nunca por encima del máximo previo de la sesión. **Tope acumulado por parámetro y sesión** respecto al valor inicial: fader ±6, gain ±6, EQ ±6 por banda, HPF ≤ 2 octavas, delay ≤ 10 ms. Una nueva transacción sobre el mismo parámetro solo es elegible si existe una `Measurement` posterior a la anterior. | Unit: 3 transacciones consecutivas de +3 dB sin Measurement intermedia → la tercera rechazada con `CUMULATIVE_CAP`; HIL: asserts sobre comandos. | MVP0 (recomendaciones), MVP4a (writes) |
| INV-005 | ASSISTED ≤ 4 parámetros por transacción; CONTROLLED AUTO ≤ 1; writes secuenciales ≥ 100 ms con confirmación del anterior. **Transacciones System** (Analysis Bus, PLAYER_RESERVE, mutes de componente, calibración) están exentas del límite de 4, con pacing ≥ 20 ms y verificación por lectura del conjunto completo ≤ 1 s tras el último write. | Unit + log; SPK-P0.5 mide el tiempo real. | MVP1 |
| INV-006 | Preamp gain solo escribible en `SessionState = CHANNEL_SETUP`; bloqueado en FULL_BAND, SHOW, ROOM_*, MIX, SOUNDCHECK_* y mientras exista un `VirtualSoundcheckTake` activo. | Unit: matriz estado × parámetro. | MVP4a |
| INV-007 | La app nunca escribe phantom (read-only en MixerDomainAPI). El Setup Wizard exige confirmación "Input 2 por TRS". | Estático + UX test. | MVP1 |
| INV-008 | Únicos routings escribibles: sends hacia el Analysis Bus; mute/fader/sends de Player L/R dentro de PLAYER_RESERVE; mute de buses ∈ `PAProfile.outputBuses` durante medición por componente (transacción System con restauración). **Desde MVP4b y solo en ASSISTED:** filtros PEQ/GEQ (gain, freq, Q) y HPF de los buses de `PAProfile.outputBuses`. Fader, mute fuera de medición, delay, polaridad y limiter de esos buses, y todo AUX de monitor, matrix y mute de inputs: read-only. | Estático: paths escribibles de salida ⊆ {`m.eq.*`, `a.B.eq.*` para B ∈ PAProfile} + unit. | MVP1 |
| INV-009 | Fader master nunca > 0 dB y nunca escrito en MVP0–MVP3. | Unit. | MVP0 |
| INV-010 | Ningún AUX marcado como monitor recibe writes, con una única excepción: sends de Player L/R hacia AUX de monitor, únicamente hacia −∞ y solo dentro de PLAYER_RESERVE/restauración. | Estático: paths escribibles ∩ paths de AUX monitor = {`p.0.aux.*.value`, `p.1.aux.*.value`}; motor rechaza valor > −∞ salvo en restauración. | MVP1 |
| INV-011 | Toda escritura va precedida de `currentValue == expectedValue` leído del store en estado VALID; si el store está INVALID o difiere → CONFLICT, transacción en estado CONFLICT, sin write. Tras write: confirmación esperada ≤ 500 ms según la política de SPK-ACK-POLICY (`confirmedBy ∈ {ECHO, VU, TIMEOUT, NONE}`). Sin echo: VU válido para fader/mute/gain con señal presente (VU2 ≥ −60 dB); el resto continúa en ASSISTED con `confirmedBy = TIMEOUT` y aviso "no verificable" por change; en CONTROLLED AUTO todo parámetro sin ECHO ni VU es inelegible. | HIL: cambiar desde web durante apply → 100 % CONFLICT. | MVP4a |
| INV-012 | El Player L/R solo es controlado por la app tras el paso explícito "Reservar Player para VSE" del Setup Wizard: (a) se lee y guarda el estado completo del Player como PLAYER_RESERVE; (b) se muestra al usuario qué cambiará y se exige confirmación; (c) se fuerza mute ON, fader −∞ y sends a AUX de monitores −∞. Si el Player está reproduciendo al conectar, la reserva se rechaza y el generador queda NO DISPONIBLE. Al cerrar sesión o liberar, se restaura y verifica por lectura. Watchdog: mientras está reservado, si mute/fader/sends cambian fuera de ventana de generación → restaurar ≤ 300 ms + alerta. | HIL: reservar con sends a AUX 1 y 2 → al liberar, hash idéntico; desmutear desde web → restauración medida. | MVP1 |
| INV-013 | Precondiciones para reproducir cualquier señal: PLAYER_RESERVE activo; archivo con checksum válido y tope −12 dBFS; sends Player→monitores = −∞ verificados; sends Player→Analysis Bus y →master según modo; fader del Player dentro del rango operativo (INV-015); E-Stop no armado; test de aislamiento del bus (INV-016) vigente; cuenta regresiva 3 s visible y audible. | Unit: matriz de precondiciones, cada una falsa → no se envía `MEDIA_PLAY`, se muestra la precondición y se registra; HIL. | MVP1 |
| INV-014 | Al terminar, cancelar, perder foco, perder USB o perder red: `MEDIA_STOP` con confirmación ≤ 500 ms y mute de Player L/R; sin confirmación → 3 reintentos + alerta sonora/visual persistente. **Abort por ausencia de referencia:** si ≤ 1,5 s tras `MEDIA_PLAY` Input 2 no muestra energía correlacionada con la señal (> −50 dBFS en la banda del estímulo) → `MEDIA_STOP` y "ruta de referencia rota". | HIL: desconectar USB y Wi-Fi en medio de sweep; send Player→Analysis a −∞ a propósito → stop ≤ 2 s 10/10. | MVP1 |
| INV-015 | Señales: pre-roll de pink desde −40 dBFS con rampa 6 dB/s hasta el nivel nominal (4,7 s) + 1 s estable + señal útil a nivel constante (tope −12 dBFS); duración total ≤ 30 s. **Nivel operativo:** fader del Player (owner System) parte de −30 dB en el primer uso por `VenueProfile`; sube en pasos de +6 dB solo con acción explícita (hold 1 s) durante pre-roll; el nivel aceptado se guarda en `PAProfile.generatorFaderDb` y nunca se supera automáticamente. Con SPL calibrado: límite 95 dB SPL Z Leq(1 s), abort ≥ 98. Sin SPL calibrado: tope del fader del Player = −10 dB y aviso "sin techo acústico" permanente. Abort si Input 1 > −3 dBFS desde el primer sample. | Unit: envolvente RMS del WAV monótona en pre-roll y constante ± 0,5 dB en señal útil; HIL: con `generatorFaderDb = −18` ninguna transacción envía `p.N.mix` > −18 dB. | MVP1 |
| INV-016 | Test de aislamiento del bus ANALYSIS: antes de la primera medición de la sesión y tras cada cambio de Setup, pink a nivel de pre-roll (−40 → −30 dBFS) enviado solo al Analysis Bus (Player→master −∞, Player→monitores −∞) durante 3 s; si la correlación cruzada normalizada Input 2 ↔ Input 1 > 0,3, el bus está llegando al PA o a monitores → abort y bloqueo de Setup. | HIL: patchear el AUX ANALYSIS a un monitor a propósito → detección 10/10; patch correcto → 0 falsos positivos en 10/10. | MVP1 |
| INV-017 | En UNSTABLE/RECONNECTING/DISCONNECTED: cola de writes vaciada, transacciones APPLYING → SUSPENDED, generador detenido (INV-014). UNSTABLE = gap entre frames VU2 > 3× el intervalo medio medido en P0.1, **o** p95 del intervalo VU2 en 30 s > 2× la mediana. | HIL: `tc netem loss 10%` y `delay 200ms` en el router → UNSTABLE ≤ 5 s en 10/10. | MVP0 |
| INV-018 | Al reconectar: cola vacía (assert), estado completo re-leído, diff mostrado, transacciones SUSPENDED requieren decisión humana. | HIL: 20 ciclos. | MVP0 |
| INV-019 | Emergency Stop: local ≤ 200 ms sin red (detener generador local, cancelar automatización, bloquear writes salvo lista blanca {MEDIA_STOP, MTK_STOP, mute Player L/R, ROLLBACK, restauración PLAYER_RESERVE/mutes de componente}); remoto con confirmación/reintento (MEDIA_STOP, MTK_STOP, mute Player); rearme explícito con re-lectura total; botón ≥ 64 px visible en el 100 % de pantallas y modales; no mutea master ni canales. | UI test automatizado que recorre todas las rutas + HIL cronometrado. | MVP0 |
| INV-020 | Journal write-ahead persistido antes de cada write. Al reiniciar: transacciones APPLYING/VERIFYING detectadas, estado real leído, diff mostrado, opciones rollback/aceptar. Nunca reaplicar. | Kill de proceso durante apply ×20. | MVP4a |
| INV-021 | Cambio masivo (> 10 paths distintos en < 1 s) o cambio de `currentSnapshot` → invalidación global: abortar transacciones, invalidar Measurements "before" no cerradas, store INVALID hasta re-lectura, avisar. Rollback por change deshabilitado si la base cambió; solo por snapshot con confirmación. | HIL: recall desde web durante transacción. | MVP0 (detección), MVP4a (abortar) |
| INV-022 | Cada write registra ts, transacción, parámetro, expected, previous, sent, ack, verified. Log en SQLite, rotación ≥ 30 sesiones, export desde la UI. | Unit + inspección. | MVP0 |
| INV-023 | Ninguna transacción CONTROLLED AUTO se cierra como KEEP sin `measurementAfterId`. Tolerancia = max(2·σ_roomScore medida en SPK-REPEAT para ese `VenueProfile`, 2 puntos); KEEP requiere además que la desviación RMS al target baje ≥ 0,5 dB; si no, REVERT automático y verificado. Sin SPK-REPEAT para la sala, el closed loop no está disponible. | Unit con σ sintética. | MVP4b |
| INV-024 | Solo `confidence == HIGH` (definición por dominio en S-02.4) es `autoEligible`. LOW/INSUFFICIENT → solo Observation. | Unit. | MVP4b |
| INV-025 | Todo apply en ASSISTED requiere acción explícita (hold 1 s o doble confirmación); sin auto-aceptación por timeout. | UI test. | MVP4a |
| INV-026 | Ninguna salida de audio de Android participa en la cadena hacia el PA. Verificación: notificación sonora disparada durante reproducción del Player → Input 2 sin contenido correlacionado (< −90 dBFS). Scarlett OUT solo dentro del wizard LOOP (INV-030). | HIL en P0.6' y en cada release. | MVP1 |
| INV-027 | Si el tono de referencia en Input 2 difiere > 1 dB del calibrado (o el nivel del loop test en Input 1 difiere > 1 dB del calibrado, si hay SPL), toda medición nueva se marca `calibrationState = INVALID` y la UI lo muestra. | HIL: mover potenciómetro. | MVP1 |
| INV-028 | Durante medición por componente de PA: solo se mutean buses ∈ `PAProfile.outputBuses` con `muteable = true`; cualquier bus con sends de monitor activos es rechazado; un mute nunca permanece > 120 s sin re-confirmación del usuario (auto-restauración verificada); la UI muestra en todo momento la lista exacta de buses muteados por la app; ante pérdida de red o E-Stop, todos restaurados (con confirmación) o el usuario ve exactamente qué buses siguen muteados. Nunca un estado parcial silencioso. | HIL: cortar red con LEFT muteado; esperar 120 s. | MVP3 |
| INV-029 | Activar Soundcheck requiere: `recording$ = false` verificado; para cada canal marcado LIVE en `ChannelAssignment`, `i.N.scsrc` leído = fuente hardware (o lista con confirmación si la escritura no está en la matriz); al desactivar, patch re-leído e idéntico al previo. `MTK_REC_TOGGLE` solo se envía tras leer `recording$` y si difiere del objetivo; tras enviar, se espera el estado objetivo ≤ 1 s o se bloquea cualquier nuevo toggle. | HIL: canal LIVE con scsrc = pista → activación rechazada 10/10. | MVP2b |
| INV-030 | El generador local (Android → Scarlett OUT) solo existe dentro del wizard LOOP: (a) antes de abrirlo, tono por el Player y verificación de que **no** aparece en Input 2 (AUX desconectado); (b) tope −20 dBFS, ≤ 20 s, cierre ≤ 100 ms al salir, perder foco o E-Stop; (c) energía no correlacionada en Input 2 > −60 dBFS durante la captura → calibración descartada; (d) al salir, tono por el Player debe aparecer en Input 2 a −20 ± 1 dBFS ("cable del AUX restaurado") antes de habilitar mediciones. | HIL: salir sin reconectar el AUX → START SESSION bloqueado. | G-C |
| INV-031 | CONTROLLED AUTO no envía writes sin app en foreground y pantalla desbloqueada. Si la pantalla se bloquea o la app pasa a background durante Apply/Verify, la transacción completa su verificación (o revierte por timeout) y el loop se detiene en STOPPED_BY_LOCK sin iniciar otra iteración. | Instrumentado: bloquear en la iteración 2 → 0 writes posteriores. | MVP4b |
| INV-032 | Al conectar, la app publica un marcador de presencia (mecanismo validado en P0.9: `BMSG^SYNC` con id VSE o snapshot `VSE_LOCK_<deviceId>` renovado cada 60 s) y busca marcadores ajenos; si existe uno con antigüedad < 120 s, arranca en READ-ONLY (sin writes ni generador) y lo muestra. | HIL: dos tablets → exactamente una con writes; apagar la primera → la segunda obtiene writes tras ≤ 180 s con rearme explícito. | MVP0 |
| INV-033 | Si `deviceInfo.firmware$` ≠ firmware listado en la Capability Matrix, todo write RAW queda deshabilitado (solo API tipada y solo en ASSISTED) hasta que el usuario acepte explícitamente "firmware no certificado" y quede registrado en la sesión. | Unit + HIL con matriz editada. | MVP1 |
| INV-034 | La aplicación no se actualiza a sí misma mientras haya una sesión de sonido abierta (estado ≠ `CLOSED`), ni con una transacción en curso, ni mientras esté conectada a la consola. La conexión es el suplente de la sesión hasta que el modelo de sesión esté cableado a la interfaz: sin él, en MVP0 la invariante no se dispararía nunca. El contexto se vuelve a evaluar inmediatamente antes de empezar la descarga, no sólo al consultar el catálogo. Sólo se instalan publicaciones estables, descargadas por HTTPS desde servidores de GitHub, con SHA-256 verificado antes de abrir la sesión de instalación (ADR-020). | Unit: `packages/updater/test/decision.test.ts` y `manifest.test.ts`; el aviso de transacción en curso, en `packages/safety/test/runner.test.ts` -- incluido que se apague cuando la escritura lanza, porque un aviso pegado dejaría la aplicación sin poder actualizarse nunca. | MVP0 |
