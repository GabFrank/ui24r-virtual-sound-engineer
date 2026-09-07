# Auditoría A — Feasibilidad técnica y arquitectura
## Plan Maestro v1.1 — Ui24R Virtual Sound Engineer

**Fecha:** 2026-09-07
**Alcance:** protocolo Ui24R, Virtual Soundcheck, Android + Scarlett + Capacitor, arquitectura de control (adapter / safety / transacciones / concurrencia), DSP.
**Fuera de alcance (auditor B):** producto, proceso, seguridad organizacional, plan/estimaciones.

**Convención de evidencia:**
- **[CONFIRMADO]** verificado contra código fuente o documentación oficial (URL o archivo indicado).
- **[INFERIDO]** deducido de evidencia parcial (p. ej. una clave existe en el modelo de estado pero no se probó escribirla).
- **[DESCONOCIDO]** no se encontró fuente; requiere spike con hardware.

Fuente primaria verificada: clon de `fmalcher/soundcraft-ui` (`soundcraft-ui-connection` **v7.0.3**, 2026-09-01), archivos `docs/docs/**/*.md` y `packages/mixer-connection/src/lib/**/*.ts`. Referencias a archivos de la librería son relativas a `packages/mixer-connection/src/lib/`.

---

## 0. Resumen ejecutivo

1. El protocolo Ui24R es un WebSocket de texto (`SETD^path^valor`, `SETS^path^texto`, `VU2^base64`, comandos `MTK_*`, `LOADSNAPSHOT`, etc.) sin autenticación, sin ACK explícito y **sin identificación del cliente emisor**. Esto último invalida tal cual está la sección 60 (`source: Ui24RWeb / ExternalTablet`).
2. `soundcraft-ui-connection` cubre con API tipada: fader, mute, pan, gain/phantom, AUX sends con tap PRE/POST y PRE-PROC/POST-PROC, matrix (con master como fuente), delay de salidas, snapshots/shows/cues, VU meters, player y grabador multipista con Soundcheck. **No cubre con API tipada**: HPF, PEQ, compresor, gate, de-esser, EQ/GEQ de salida, AFS2, polaridad. Esas claves existen en el modelo de estado (`state/mixer-state.models.ts`) y son alcanzables por RAW, pero el **escalado de valores es desconocido**.
3. Los tap points de la sección 8 (RAW_INPUT / POST_PROCESSING / POST_FADER / MASTER_REFERENCE) **ya están confirmados por protocolo**; no hace falta "comprobarlos experimentalmente", solo validar niveles.
4. Virtual Soundcheck es controlable por red (record/play/stop/soundcheck on-off, selección de canales). Faltan: selección de sesión, seek/locate y loop; la grabación es post-preamp, por lo que **el Gain Assistant no es validable en Virtual Soundcheck**.
5. La propuesta "Basic Engine en WebAudio" es **inviable para medición dual-canal en Android/WebView**: no hay selección de dispositivo USB desde `getUserMedia` en Android, el pipeline WebRTC mezcla a mono y aplica procesamiento. Hay que ir **nativo desde el principio** (plugin Capacitor propio con AudioRecord/Oboe, `AudioSource.UNPROCESSED`, `setPreferredDevice`).
6. La arquitectura sobredimensiona la necesidad de "full duplex sincronizado": con la referencia eléctrica en Input 2, la transferencia (magnitud + fase + coherencia) se calcula por **dual-channel FFT** sin sincronía con el generador. Eso permite usar el **Media Player de la Ui24R como generador** y eliminar el Analysis Return del MVP, que es hoy el mayor riesgo de seguridad acústica (audio de Android al PA).
7. Control de concurrencia "read-compare-write" es realizable, pero solo con un shadow state construido **exclusivamente desde `inbound$`** (la librería mezcla outbound en `state$`) y con una prueba P0 de si la mesa hace echo al emisor.
8. El DSP del Basic Engine carece de: delay finder In1↔In2, promediado/suavizado fraccional, coherencia, y una estrategia para dos ganancias analógicas no observables (preamp Scarlett, y el send AUX). Para gain staging conviene usar el VU pre-proceso de la Ui24R (`vuPre` + `hw.gainDB$`) en vez de la cadena Scarlett.
9. Hay una restricción estructural no mencionada: **un solo canal de análisis a la vez** (Input 2). El "Full Band Test" con análisis por canal individual solo es posible secuencialmente (vía Virtual Soundcheck) o por VU2 (solo nivel).
10. Existe una alternativa arquitectónica que el plan no considera y merece spike: **Ui24R USB-B (32×32, class-compliant) directo al tablet**, que daría todos los canales + master de forma sample-sincrónica y eliminaría la Scarlett. Estado: [DESCONOCIDO] en Android.

---

## 1. Protocolo Ui24R y librería `soundcraft-ui-connection`

### A-01 — El protocolo no identifica al cliente emisor de un cambio
**Severidad: CRÍTICO (para secciones 59–60)**
**Evidencia [CONFIRMADO]:** formato de mensajes `SETD^i.0.mute^1` (docs `more/howitworks.md`); parser en `state/mixer-store.ts` extrae solo `type`, `path`, `value`. La mesa reenvía el mismo mensaje a los demás clientes sin metadatos de origen. Único mensaje con identidad es `BMSG^SYNC^<syncId>^<index>` (channel sync, `facade/channel-sync.ts`), que solo transporta selección de canal.
**Impacto:** `source: Ui24RWeb | ExternalTablet` de la sección 60 no es derivable. Solo se puede distinguir `self` vs `other` por correlación temporal con el propio outbound.
**Recomendación:** reducir el enum a `SELF | EXTERNAL | UNKNOWN`. Implementar correlación: cada write propio se registra (path, valor, t0); un inbound con mismo path y valor dentro de una ventana (≈300 ms) se etiqueta `SELF`; cualquier otro inbound en ese path es `EXTERNAL`. Documentar que dos clientes VSE simultáneos no son distinguibles entre sí.

### A-02 — No hay ACK de escritura; la librería mezcla outbound en su estado
**Severidad: ALTO**
**Evidencia [CONFIRMADO]:** `state$` en `state/mixer-store.ts` se construye sobre `conn.allMessages$ = merge(outbound$, inbound$)`. Cualquier `setd()` actualiza el estado local **antes** de que la mesa lo aplique. No existe mensaje de confirmación en el protocolo; el comentario "Keep for later: echo" en `mixer-connection.ts` sugiere que el autor no depende de echo.
**Impacto:** "verificar estado antes de escribir" (sección 58) y `currentValue == X ?` (sección 59) leídos desde `state$` comparan contra un valor que puede ser el propio write no confirmado. Un rollback que lee `state$` puede revertir a un valor nunca aplicado.
**Recomendación:** construir un `ConfirmedStateStore` propio alimentado solo por `conn.inbound$` (misma lógica de parseo). Incluir en P0.1 el test explícito: "¿la mesa hace echo al emisor de su propio SETD?". Si no hay echo, la única confirmación posible es indirecta (VU2 o re-lectura vía reconexión), y la política de writes debe ser "fire-and-forget con verificación por medición".

### A-03 — Cobertura real de la API tipada vs. necesidades del plan
**Severidad: ALTO**
**Evidencia [CONFIRMADO]:** docs `buses/*.md`, `features/*.md`, `recording-playback/*.md`; `facade/*.ts`. Con API tipada: fader (lineal y dB, transfer function real del fader en `utils/value-converters/value-converters.ts`), mute, solo, pan, name, delay de canal/aux/master, gain y phantom (`HwChannel`, -6..57 dB en Ui24R), AUX send level/mute/pre-post/preproc-postproc, matrix (switch AUX→MTX, fuentes aux/sub/master), mute groups, automix, VU, player, dual-track rec, multitrack rec + soundcheck, shows/snapshots/cues, device info, channel sync.
**Sin API tipada** (grep `eq|gate|dyn|hpf|afs|geq|deesser` en `facade/`: cero resultados): HPF, PEQ, compresor, gate, de-esser, EQ/GEQ de salida, AFS2, invert/polaridad, color, recall-safe.
**Impacto:** todo el Channel Assistant (secciones 25–31) y el Room Assistant sobre GEQ/PEQ de salida dependen de RAW.
**Recomendación:** tratar RAW como camino de primera clase en `Ui24rMixerAdapter`, no como fallback. Ver Capability Matrix (sección 9 de este informe).

### A-04 — Las claves RAW de procesamiento existen en el modelo de estado, pero el escalado de valores es desconocido
**Severidad: ALTO**
**Evidencia [CONFIRMADO parcial]:** `state/mixer-state.models.ts` (generado desde un dump JSON real del estado de la mesa) define para inputs `I`: `eq.{b1..b5}.{gain,q,freq}`, `eq.hpf.{freq,slope}`, `eq.lpf`, `eq.bypass`, `eq.easy`; `dyn.{threshold,ratio,attack,release,hold,gain,outgain,softknee,autogain,bypass}`; `gate.{thresh,attack,release,hold,depth,bypass,enabled}`; `deesser.{freq,ratio,threshold,enabled}`; `invert`, `delay`, `safe`, `mtkrec`, `src`, `scsrc`. Para AUX `A`: `eq.{peak{},hpf,lpf,bypass,linked}`, `afs.{enabled,fmode,cmode,sensitivity,numfixed,numtotal,clearall,clearfixed,clearlive,livelift,logic}`, `dyn`, `gate`, `delay`, `invert`, `matrix`. Master `M`: `eq.peak.{l,r}{}`, `eq.hpf.{l,r}`, `dyn.{l,r}`, `afs`, `delayL/R`, `l.invert/r.invert`.
**[DESCONOCIDO]:** unidades/escala de cada valor (todo lo que la librería convierte usa 0..1 lineal con funciones de mapeo no triviales, p. ej. fader con polinomio+exp, automix time con `pow(v, 3.0517)`); si `a.B.eq.peak` es la PEQ de 4 bandas o la GEQ de 31 bandas (no existe clave `geq`); semántica de escritura de `afs.*`.
**Recomendación:** Spike P0.2 debe (1) capturar `store.messages$` mientras se mueve cada control en la web app oficial, (2) extraer del JS de la web app que la propia mesa sirve por HTTP las tablas de conversión (la librería replicó así la curva del fader), (3) fijar por parámetro: path, rango raw, unidad física, función de mapeo, y test de round-trip. Contribuir upstream los resultados (la librería acepta PRs) reduce mantenimiento.

### A-05 — Los tap points de AnalysisReferenceMode ya están confirmados por protocolo
**Severidad: BAJO (es una buena noticia que el plan no captura)**
**Evidencia [CONFIRMADO]:** `AuxChannel` expone `pre()/post()` (pre/post fader) y `preProc()/postProc()` (antes/después de EQ-dyn-gate) — docs `buses/aux-sends.md`; `MtxChannel` expone `preProc()/postProc()` y fuente `master()` — docs `buses/matrix.md`. VU expone `vuPre` (antes de proceso), `vuPost`, `vuPostFader` (`vu/vu.utils.ts`).
**Mapeo:** RAW_INPUT = AUX send PRE + PRE PROC; POST_PROCESSING = PRE + POST PROC; POST_FADER = POST; MASTER_REFERENCE = MTX con fuente `master()` (pre o post proc del master).
**Atención [DESCONOCIDO]:** existe `settings.auxsendpoint` y `settings.mtxsendpoint` globales en el modelo de estado; hay que verificar si condicionan el significado de PRE/POST por canal.
**Recomendación:** reescribir la sección 8 con este mapeo y mover la verificación a "validar nivel e isolación", no "disponibilidad".

### A-06 — Aislar el Analysis Bus implica gestionar 24+ sends, no un routing
**Severidad: MEDIO**
**Evidencia [CONFIRMADO]:** cada canal tiene su propio send (`i.N.aux.B.value/mute/post/postproc`); un AUX/MTX no tiene un "selector de fuente única". Stereo-link replica acciones al canal vecino (docs `more/stereolink.md`).
**Impacto:** "seleccionar canal" para análisis = poner a −∞ (o mute) los otros 23 sends del bus, y a 0 dB el elegido; cambiar de canal es una transacción de N writes. Los sends de FX/player/line también alimentan el AUX.
**Recomendación:** modelar `AnalysisBusState` como snapshot de todos los sends del bus, con transacción "solo channel X" y restauración. Excluir el bus de mute groups y de snapshot recall (`a.B.safe`, [INFERIDO]).

### A-07 — Snapshots: guardado sin confirmación, sobrescribe, alcance desconocido
**Severidad: MEDIO**
**Evidencia [CONFIRMADO]:** `saveSnapshot(show, name)` envía `SAVESNAPSHOT^show^name` y "will overwrite an existing snapshot", "no confirmation is required" (docs `features/shows.md`, `facade/show-controller.ts`). Listado disponible via `shows$` (`SHOWLIST`/`SNAPSHOTLIST^show`, por cliente y a pedido).
**[DESCONOCIDO]:** si el snapshot incluye gain de preamp, phantom, AFS2, patching de soundcheck, delays; si existe borrado/renombrado de snapshot por protocolo; creación de show nuevo. Existe `settings.cascade.snapsync` y `*.safe` por canal (recall safe) en el modelo.
**Recomendación:** naming `VSE_AUTO_*` es viable porque `shows$` permite comprobar colisión antes de guardar. Añadir a P0.8: diff completo del estado antes/después de `LOADSNAPSHOT` para documentar alcance; definir show dedicado `VSE`.

### A-08 — Estado de conexión: el protocolo no tiene ping/RTT; `UNSTABLE` no es observable con la librería
**Severidad: MEDIO**
**Evidencia [CONFIRMADO]:** keepalive `ALIVE` cada 1 s unidireccional; `status$` solo emite OPENING/OPEN/CLOSING/CLOSE/ERROR/RECONNECTING (`mixer-connection.ts`). Reconexión automática cada 2 s. Al reconectar, la mesa reenvía el estado completo.
**Recomendación:** derivar `UNSTABLE` de la cadencia de frames `VU2` (la mesa los emite continuamente; un gap > N ms = inestable). En reconexión, invalidar el `ConfirmedStateStore` hasta recibir el volcado completo (la librería tiene `waitForInitParams` con debounce, `utils.ts`). Descartar cola de writes pendientes (sección 58 ya lo pide).

### A-09 — Snapshot recall y operaciones de la web app generan ráfagas de SETD
**Severidad: BAJO**
**Evidencia [CONFIRMADO]:** al conectar y al cargar snapshot la mesa envía el estado como mensajes individuales (docs `more/howitworks.md`); el store usa acumulador mutable por rendimiento (`CLAUDE.md` del repo).
**Impacto:** un detector de conflictos por parámetro vería cientos de "cambios externos" en un recall; un fader arrastrado en la web app genera decenas de SETD/s.
**Recomendación:** el Versioned Parameter State debe agrupar por ventana temporal y tratar `var.currentSnapshot` cambiante como evento de "bulk external change" que suspende automatización.

### A-10 — RTA de la mesa: no expuesta por la librería; existencia por red desconocida
**Severidad: BAJO**
**Evidencia:** la Ui24R tiene RTA en entradas y salidas (marketing oficial). grep `RTA` en el repo: sin resultados. [DESCONOCIDO] si viaja por WebSocket.
**Recomendación:** en P0.2 capturar tráfico con la web app en la vista RTA; si existe, sería un tap espectral por canal sin ocupar el Analysis Bus (mitiga A-22).

---

## 2. Virtual Soundcheck en Ui24R

### A-11 — Control por red del multitrack y del modo Soundcheck: confirmado, con huecos
**Severidad: MEDIO**
**Evidencia [CONFIRMADO]:** `MultiTrackRecorder` (`facade/multi-track-recorder.ts`): `MTK_PLAY/PAUSE/STOP/REC_TOGGLE`, `var.mtk.soundcheck` (SETD 0/1), `state$`, `session$`, `length$`, `elapsedTime$`, `recording$`, `busy$`; selección por canal `multiTrackSelect()` (raw `i.N.mtkrec`). Modelo de estado incluye `mtk.scout.*`, `mtk.out.*`, `i.N.scsrc` (patch de soundcheck) y `settings.mtk.format`.
**[DESCONOCIDO]:** comando para seleccionar/cargar una sesión; seek/locate a un tiempo; loop de segmento; si `elapsedTime$` tiene resolución sub-segundo; si el patch de soundcheck (`mtk.scout`) es escribible por `SETS`.
**Recomendación:** Spike P0.7 debe capturar los mensajes al elegir sesión y al arrastrar la barra de tiempo en la web app. Si no hay seek, "repeatable segment" (Fase 4) = siempre desde 0 (STOP→PLAY) y recortar por software.

### A-12 — La grabación multipista es post-preamp: el Gain Assistant no es validable en Virtual Soundcheck
**Severidad: ALTO (conceptual, afecta secciones 27–28, 39, 43)**
**Evidencia [CONFIRMADO]:** grabación "unprocessed" a 48 kHz fijo, 16/24 bit WAV/FLAC (soundtech.co.uk, HARMAN help). Por construcción el ADC está después del preamp analógico; el modelo de estado tiene `hw.N.disablegain` [INFERIDO: en soundcheck la ganancia analógica se desactiva].
**Impacto:** en Soundcheck, `hw.gain` no afecta la señal; cualquier "recomendación de gain" evaluada con playback es inválida. Además, si se cambia el gain de preamp después de grabar, la grabación deja de representar el show.
**Recomendación:** fijar el orden Gain → Record → (todo lo demás). Marcar `Preamp Gain` como parámetro **congelado** mientras `soundcheck$ == true`. Documentar que el Channel Assistant en Soundcheck solo puede evaluar HPF/EQ/dyn.

### A-13 — Limitaciones de medio físico
**Severidad: MEDIO**
**Evidencia [CONFIRMADO]:** pendrive FAT32 únicamente, ≤ 32 GB, ≥ 25 MB/s escritura (help.harmanpro.com/ui24r-usb-direct-recording-requirements); máx. 22 pistas; hasta 2 minutos de análisis antes de reproducir una sesión larga (help.harmanpro.com/creating-playable-multitrack-session…); mesa fija a 48 kHz.
**Impacto:** 22 × 48 kHz × 24 bit ≈ 30 MB/s de tasa bruta en WAV — está por encima del mínimo declarado; muchos pendrives fallan. El plan no incluye el pendrive en la Certified Hardware Matrix.
**Recomendación:** añadir "USB stick certificado (modelo, formato, velocidad medida)" a la matriz de hardware; preferir FLAC 24 bit si la escritura es marginal; registrar `busy$` como señal de fallo.

### A-14 — Repetibilidad temporal entre pasadas A/B no está garantizada por la mesa
**Severidad: MEDIO**
**Evidencia:** `elapsedTime$` en segundos ([CONFIRMADO] en `state-selectors` vía `selectMtkElapsedTime`), sin timestamps de muestra ni sincronía con la captura del tablet; latencia de arranque de reproducción variable [INFERIDO].
**Recomendación:** alinear las mediciones A y B por **correlación del Input 2** (referencia eléctrica del master/canal) y no por reloj de la mesa. Esto es trivial si el Basic Engine incluye un delay finder (ver A-30).

### A-15 — Soundcheck reemplaza *todas* las entradas patcheadas
**Severidad: BAJO**
**Evidencia [CONFIRMADO]:** "Soundcheck is just another set of mixer channel patches" (help.harmanpro.com/exploring-the-patching-section-of-the-ui24r).
**Impacto:** cualquier entrada viva usada durante Soundcheck (p. ej. Analysis Return, o el mic de medición si se adopta la alternativa A-27) debe estar en el patch de soundcheck como "hardware", no como pista.
**Recomendación:** que el wizard verifique `i.N.scsrc` del Analysis Return / canales vivos antes de activar soundcheck.

---

## 3. Android + Scarlett 2i2 + Capacitor

### A-16 — WebAudio/getUserMedia en WebView Android no sirve para captura dual de medición
**Severidad: CRÍTICO (invalida "Basic Engine en WebAudio")**
**Evidencia:**
- Chrome/WebView en Android no permite elegir un dispositivo de entrada USB específico por `deviceId`; la enumeración típica es solo "Default" [INFERIDO de reportes; developer.chrome.com/blog/media-devices no documenta selección en Android].
- Pipeline WebRTC en Android mezcla a mono aunque se pida `channelCount: 2` (dev.to "Android WebRTC stream always downmixes stereo audio to mono"; blog.addpipe.com "Recording True Stereo Audio Using getUserMedia": con AEC activo, estéreo → mono duplicado). [CONFIRMADO como reporte comunitario, no como especificación]
- Constraints `echoCancellation/autoGainControl/noiseSuppression:false` no garantizan bypass del procesamiento del HAL (fuente de audio VOICE_COMMUNICATION vs UNPROCESSED es decisión del navegador, no del sitio).
- Sin timestamps de muestra ni control de sample rate del dispositivo; AudioWorklet corre al rate del `AudioContext`, con resampleo opaco.
**Impacto:** con WebAudio no se puede garantizar Input 1 ≠ Input 2, ni ausencia de AGC. Todas las métricas de nivel/ruido/clipping quedarían contaminadas.
**Recomendación:** plugin Capacitor nativo desde Fase 1 (ver A-17). Dejar WebAudio solo para visualización y para la PWA secundaria.

### A-17 — Diseño del plugin nativo: viable, sin plugin de terceros que sirva tal cual
**Severidad: ALTO**
**Evidencia:** los plugins existentes (`@capgo/capacitor-audio-recorder`, `@cantoo/capacitor-audio-capture`, Capawesome audio-recorder) capturan mono, con resampleo por interpolación lineal y sin selección de dispositivo USB [CONFIRMADO por sus descripciones en npm/GitHub]. Android soporta captura USB estéreo PCM 16/24/32 bit a 48 kHz (source.android.com/docs/core/audio/usb). `AudioRecord.setPreferredDevice(AudioDeviceInfo)` y `AudioManager.getDevices(GET_DEVICES_INPUTS)` permiten fijar el dispositivo USB; `AudioSource.UNPROCESSED` (API 24) evita procesamiento cuando `PROPERTY_SUPPORT_AUDIO_SOURCE_UNPROCESSED` es true; Oboe/AAudio respeta `setDeviceId` solo con AAudio (API ≥ 28) (docs/FullGuide.md de Oboe). Un cambio de ruteo desconecta el stream AAudio (misma fuente).
**Recomendación:**
1. Plugin Kotlin (+ C++ opcional) con: enumeración de dispositivos USB de entrada/salida, apertura de captura estéreo 48 kHz float/24 bit sobre el dispositivo elegido, `UNPROCESSED` con fallback declarado, contador de xruns, timestamps (`AudioTimestamp`), Foreground Service.
2. **DSP en el lado nativo** (RMS/peak/FFT/transfer function/coherencia) y enviar al WebView métricas y espectros decimados, no PCM crudo: el bridge Capacitor es JSON/base64 y 48 kHz × 2 ch × float32 ≈ 384 kB/s sostenidos.
3. Grabación de ventanas a archivo (WAV) en el lado nativo; el WebView recibe rutas.
4. Verificar `PROPERTY_SUPPORT_AUDIO_SOURCE_UNPROCESSED` en el wizard de certificación del tablet.

### A-18 — UAC1 vs UAC2 y el documento oficial de Android
**Severidad: MEDIO**
**Evidencia [CONFIRMADO]:** AOSP declara soporte de "un subconjunto de UAC1", canales 1 o 2, PCM (source.android.com/docs/core/audio/usb). En la práctica el HAL usa tinyalsa/snd-usb-audio y muchos dispositivos UAC2 funcionan, pero no está garantizado por plataforma. Focusrite: 4th Gen es class-compliant y soportado oficialmente en iPad USB-C; en Android solo hay evidencia comunitaria (video de conexión a tablet Android 13) [INFERIDO]. Focusrite Control 2 en Android **no controla la Scarlett por USB** (support.focusrite.com, artículo Focusrite Control 2) — solo Wi-Fi hacia una computadora.
**Recomendación:** la Certified Hardware Matrix (sección 16) es correcta como enfoque; añadir columna "UNPROCESSED soportado", "xruns/h en 2 h de captura" y "carga simultánea vía hub PD". Considerar un segundo candidato de interfaz explícitamente UAC1/UAC2 dual (p. ej. serie MOTU M o Audient EVO), para no depender de un solo proveedor.

### A-19 — Estado de la Scarlett no observable desde Android
**Severidad: ALTO (afecta secciones 19, 20, 24, 27)**
**Evidencia [CONFIRMADO]:** sin control por USB desde móvil (A-18). Ganancia de preamp, Air, Auto Gain, Clip Safe, 48 V y Direct Monitor de la 4th Gen son estados físicos/firmware no legibles por la app.
**Impacto:** (a) la calibración dBFS↔dBu/SPL depende de un knob que el usuario puede tocar; (b) "Direct Monitor deberá permanecer deshabilitado… el wizard deberá verificarlo" (sección 24) no es verificable por API; (c) Auto Gain / Clip Safe podrían alterar la ganancia durante una medición.
**Recomendación:** (1) fijar procedimiento: gain de Input 2 a un tope físico conocido (mínimo, modo línea) y calibrar con tono de nivel conocido reproducido desde el Player de la Ui24R; (2) para Input 1, calibrador acústico de 94 dB SPL @ 1 kHz como paso obligatorio para SPL absoluto (sección 20 ya lo insinúa); (3) verificar Direct Monitor por detección electroacústica (test de loop: emitir tono breve y buscar realimentación en Input 2) en lugar de por confirmación del usuario; (4) exigir Auto Gain/Clip Safe apagados y detectar cambios de ganancia por saltos en el nivel de referencia.

### A-20 — Audio de Android hacia el PA: el riesgo es estructural, no mitigable solo con DND
**Severidad: CRÍTICO**
**Evidencia [CONFIRMADO]:** al conectar un dispositivo USB de audio, Android lo convierte en salida por defecto para media/notificaciones (comportamiento de plataforma, source.android.com/docs/core/audio/usb). La app no puede impedir que otras apps escriban a esa salida. El Analysis Return se abre con un write por red (`mute 0`); si la red cae con el canal abierto, "bloqueo ante pérdida de conexión" (sección 58) no puede cerrarlo.
**Recomendación (fuerte):** eliminar la ruta Android → Scarlett OUT → Analysis Return → PA del MVP. Usar como generador el **Media Player de la Ui24R** (`conn.player.loadTrack/play/stop`, [CONFIRMADO]) con archivos de sweep/pink/sine preparados en el pendrive, en canales Player L/R; la referencia eléctrica sigue llegando a Input 2 por el Analysis Bus. Ventajas: ninguna salida de Android toca el PA; el Emergency Stop es `MEDIA_STOP` + mute de Player L/R; sin loops posibles. Coste: sin sincronía generador↔captura, que **no es necesaria** (ver A-29). Mantener Scarlett OUT solo para loopback de autocalibración y auriculares.

### A-21 — Full-duplex y "sincronizado" — el requisito está sobredimensionado
**Severidad: MEDIO**
**Evidencia:** Oboe `FullDuplexStream` sincroniza callbacks pero no elimina deriva/offset entre in/out (docs Oboe FullGuide, wiki FullDuplexStream); AAudio MMAP/low-latency no aplica a USB en la mayoría de dispositivos [INFERIDO de guías de desarrollo Android; no encontrado en documento oficial].
**Recomendación:** definir dos requisitos separados: (a) *captura dual sample-sincrónica* (Input 1 y 2 en el mismo ADC: garantizado por hardware) — es lo que necesitan magnitud, fase relativa, coherencia, delay finder; (b) *play+capture simultáneos no sincronizados* — solo para loopback y para el generador local opcional. Retirar "full duplex sincronizado" como prerequisito del Precision Engine; sustituirlo por "dual-channel FFT + delay finder".

### A-22 — Un solo canal de análisis simultáneo
**Severidad: ALTO (afecta secciones 41, 77, 93)**
**Evidencia [CONFIRMADO]:** Scarlett 2i2 = 2 entradas; Input 1 es el micrófono. Un AUX estéreo linkeado ocuparía ambas entradas.
**Impacto:** "Full Band Test → canales individuales" no es medible en paralelo; Show Monitor por canal solo con VU2 (nivel, sin espectro).
**Recomendación:** documentar explícitamente. Para análisis multicanal usar VU2 (24 canales pre/post/postfader a la vez, [CONFIRMADO]) y reservar el espectro para el canal seleccionado o el master. Evaluar A-27.

### A-23 — Loopback wizard: realizable, alcance a redefinir
**Severidad: BAJO**
**Evidencia:** Scarlett OUT (TRS línea) → Input 2 (modo línea) es cableado estándar; Android puede reproducir y capturar a la vez sobre el mismo dispositivo USB [CONFIRMADO por AOSP: entrada y salida soportadas]. Latencia ida/vuelta medible por correlación.
**Recomendación:** si se adopta A-20, el loopback deja de calibrar "latencia de generador" y pasa a: (1) igualación Input 1 vs Input 2 (misma señal en Y a ambas entradas: respuesta relativa y offset inter-canal), (2) nivel absoluto de Input 2 en dBFS para un tono de nivel conocido de la mesa. Ambos son requisitos reales del Room Assistant; la latencia OUT→IN es opcional.

### A-24 — Alimentación y ciclo de vida USB
**Severidad: MEDIO**
**Evidencia:** 2i2 4th Gen es bus-powered; Focusrite exige hub alimentado para iPad (support.focusrite.com "Connecting your USB-C iPad with your Audio Interface") [CONFIRMADO para iPad; extrapolado a Android]. Cargar el tablet en modo host requiere hub con USB-PD passthrough **y** tablet que lo soporte [INFERIDO]. Un cambio de ruteo desconecta el stream AAudio (Oboe FullGuide).
**Recomendación:** test de certificación de 3 h con pantalla apagada, Foreground Service + wake lock, contando desconexiones USB y xruns. Añadir "hub certificado" como fila de la matriz.

---

## 4. Arquitectura de control

### A-25 — MixerDomainAPI/Adapter: bien orientado; faltan tres contratos
**Severidad: MEDIO**
**Hallazgos:**
1. **Sin transacción atómica en el protocolo**: cada SETD es independiente; un `ChangeTransaction` con N writes puede quedar parcialmente aplicado si la red cae. El adapter debe exponer `applyChanges(changes[]): Promise<AppliedReport>` con verificación por inbound (A-02) y rollback parcial.
2. **Sin lectura síncrona confirmada**: `MixerDomainAPI.read(param)` debe devolver `{value, confirmedAt, source}` desde el `ConfirmedStateStore`, nunca desde `state$` de la librería.
3. **Conversión de unidades en el adapter**: la librería expone dB para fader/gain/VU (con la nota de que el gain en dB "no es exacto" respecto a la UI, docs `buses/hwchannel.md`). Los asistentes deben trabajar en unidades físicas; la tabla de mapeo RAW (A-04) vive en el adapter con tests de round-trip.
Además: `deviceInfo.capabilities$` [CONFIRMADO] permite construir la Capability Matrix por modelo en runtime.

### A-26 — Safety Engine: reglas que requieren writes durante bloqueo
**Severidad: MEDIO**
**Evidencia:** sección 63 pide "bloquear writes" y "cerrar Analysis Return" (un write) y sección 58 "bloqueo ante pérdida de conexión" (no puede escribir).
**Recomendación:** definir una **whitelist de writes de seguridad** (mute Analysis Return, MEDIA_STOP, MTK_STOP) que pasan aunque el Safety Engine esté en modo bloqueo, y establecer estados mixer-side "seguros por defecto" que no requieran escritura (Return muteado, Player muteado, sends del Analysis Bus a −∞) al terminar cada operación — con timeout local: si no llega confirmación inbound en T, alarma visible.

### A-27 — Alternativa arquitectónica no considerada: Ui24R USB-B (32×32) directo al tablet
**Severidad: MEDIO (oportunidad)**
**Evidencia [CONFIRMADO]:** la Ui24R es interfaz USB-B class-compliant 32×32 (soundcraft.com; los primeros 10 envíos son master + AUX 1-8, los 22 restantes son las entradas). Android soporta captura multicanal por índice (`setChannelIndexMask`) en dispositivos que lo permitan (groups.google.com/g/android-ndk "Multichannel USB audio in Android M"). [DESCONOCIDO] si la implementación UAC de la Ui24R y un tablet concreto negocian 32 canales.
**Beneficios si funciona:** todos los canales + master sample-sincrónicos sin Analysis Bus; el mic de medición entra por un canal de la Ui24R (phantom, muteado en master, capturado pre-DSP); desaparece la Scarlett y con ella A-19/A-20/A-22; el tablet queda junto al rack y el mic va por XLR a FOH.
**Recomendación:** añadir Spike P0.3b (2 días): conectar tablet candidato a USB-B de la Ui24R y enumerar formato/canales. Si falla, se descarta con evidencia.

### A-28 — Contradicciones internas detectadas
**Severidad: BAJO–MEDIO**
1. Sección 13: "full duplex sincronizado" es Precision, pero la sección 21 (generador por Scarlett OUT) y P0.4 exigen play+capture en el MVP. Resolver con A-21/A-20.
2. Sección 8: "disponibilidad de tap points a comprobar experimentalmente" vs. protocolo que ya los expone (A-05).
3. Sección 60 `source` con identidades de cliente vs. protocolo sin identidad (A-01).
4. Sección 63: bloquear writes + escribir mute (A-26).
5. Sección 128 exige "Virtual Soundcheck PASS" antes de cualquier MVP, pero MVP1 (Channel Assistant) no depende de VSC; sobre-gating.
6. Sección 56: AFS2 ring-out al final altera la respuesta de PA medida por el Room Assistant; falta un "re-measure post-AFS2".
7. Sección 31: Output GEQ/PEQ/Delay → Room Assistant, pero la Capability Matrix de la sección 9 no incluye "Output PEQ" ni "Polaridad", ambos necesarios para PA alignment (Fase 10).

---

## 5. DSP

### A-29 — Transfer function dual-canal debe estar en el Basic Engine, no en Precision
**Severidad: ALTO**
**Razonamiento:** con Input 2 como referencia eléctrica y Input 1 como micrófono en el mismo ADC, H(f) = S_12 / S_11 (cross-spectrum sobre auto-spectrum de la referencia) da magnitud **y** fase relativa; la coherencia γ² = |S_12|² / (S_11·S_22) es un subproducto del mismo cálculo y es la métrica que permite descartar bins dominados por ruido/reverberación. Ninguno requiere sincronía con el generador ni deconvolución de sweep. Es exactamente lo que hacen Smaart/OpenSound Meter en modo dual-FFT.
**Impacto en el plan:** el "Room MVP sin fase/IR" (sección 54) es útil solo si usa transfer function con coherencia; una RTA de magnitud sobre pink noise sin coherencia confunde reverberación y ruido con respuesta del PA y produce recomendaciones de EQ erróneas en salas reverberantes.
**Recomendación:** Basic Engine = RMS/peak/crest/FFT + **dual-FFT (H, γ²) + delay finder**. Precision Engine = IR por deconvolución, ETC, RT60, group delay refinado, sub alignment con sweep, que sí se benefician de un estímulo conocido.

### A-30 — Falta el delay finder (alineación temporal Input 1 ↔ Input 2)
**Severidad: ALTO**
**Razonamiento:** entre la referencia eléctrica y el mic hay: latencia de la mesa (AUX/MTX vs master), delays configurados en salidas (legibles: `delay$` [CONFIRMADO]), latencia del PA/DSP externo y propagación acústica (≈2,9 ms/m; 10 m ≈ 29 ms). Sin compensación, la fase se envuelve y la coherencia colapsa; incluso la magnitud promediada se degrada con señales no estacionarias (música).
**Recomendación:** cross-correlación (o IR corta por dual-FFT) para estimar τ antes de cada medición; verificar que el delay del Analysis Bus sea 0 ms y registrarlo en `Measurement.calibrationState`.

### A-31 — Gain staging: usar telemetría de la mesa, no la cadena Scarlett, para valores absolutos
**Severidad: ALTO**
**Evidencia [CONFIRMADO]:** VU2 entrega `vuPre` (antes de proceso), `vuPost`, `vuPostFader` por canal, 0..1 → −80..0 dB (`vu/vu.utils.ts`, `vuValueToDB`); `hw.gainDB$` da la ganancia actual. La cadena Scarlett suma dos ganancias no observables (send AUX y preamp Scarlett, A-19).
**[DESCONOCIDO]:** balística del VU (peak/RMS, tiempos), tasa de frames VU2, si 0 dB del meter = 0 dBFS interno.
**Recomendación:** Gain Assistant calcula peak/headroom/clip-probability desde `vuPre` + `gainDB$`; el espectro y el ruido (SNR) desde Input 2. Spike P0.10 debe incluir la calibración del VU2 con tono de nivel conocido y su balística.

### A-32 — Parámetros de análisis sin especificar
**Severidad: MEDIO**
**Faltan en secciones 13, 28, 54:** tamaño de FFT y solapamiento (para GEQ de 31 bandas se necesita resolución ≥ 1/3 de octava desde 31 Hz → FFT ≥ 32k a 48 kHz o multi-resolución); ventana; promediado (exponencial vs. lineal, número de promedios; para pink noise ≥ 8–16 s); suavizado fraccional (1/3, 1/6, 1/12); integración de RMS (300 ms "fast" para dinámica; ~3 s para nivel); true-peak vs sample-peak; definición de "ruido" (percentil bajo del espectro durante silencio dirigido); "clip probability" (p. ej. fracción de ventanas con peak > −1 dBFS en `vuPre`).
**Recomendación:** convertirlos en tabla normativa del DSP Specification (documento F) con valores por asistente; P0.10 valida contra REW/Smaart con estas mismas configuraciones.

### A-33 — Perfil del micrófono ECM8000
**Severidad: BAJO**
El ECM8000 no es plano por encima de ~5 kHz ni por debajo de ~50 Hz y tiene dispersión entre unidades; sin archivo de calibración, la Room Assistant sesgará el target. Sección 18 ya prevé `calibrationFile`; hacerlo obligatorio para recomendaciones de EQ > 4 kHz y marcar `confidence = LOW` sin él.

### A-34 — Room MVP sin fase/IR: utilidad condicionada
**Severidad: MEDIO**
Útil para: exceso global consistente, nulls localizados (multi-posición), desviación de target, GEQ sugerida en 1/3 de octava — **si** hay coherencia y delay finder (A-29/A-30). No útil para: crossover/sub, alineación L/R, polaridad (Fase 10, correctamente diferida). El workflow LEFT/RIGHT/SUB (sección 49) es realizable en MVP con mutes de salida y transfer function; no requiere IR.

---

## 6. Capability Matrix tentativa (sección 9 del plan)

Base: `soundcraft-ui-connection` v7.0.3. "Typed" = método público documentado. "RAW" = clave presente en `state/mixer-state.models.ts` o comando visto en código/tests. "Probado" siempre NO hasta P0.2 con hardware.

| Función | API tipada | RAW (path / comando) | Estado | Notas |
|---|---|---|---|---|
| Fader canal (master bus) | `conn.master.input(n).setFaderLevelDB / faderLevelDB$` | `i.N.mix` (0..1, curva no lineal) | CONFIRMADO | Curva de fader modelada en `value-converters.ts` |
| Fader master | `conn.master.setFaderLevelDB` | `m.mix` | CONFIRMADO | |
| Mute / Solo / Pan / Name | típicos en `MasterChannel` | `i.N.mute/solo/pan/name` | CONFIRMADO | SETS para name (≤ 20 chars, mayúsculas) |
| Gain preamp | `conn.hw(n).setGainDB / gainDB$` (−6..57 dB) | `hw.N.gain` (0..1) | CONFIRMADO | dB "no exacto" vs UI; existe `hw.N.disablegain` (INFERIDO: soundcheck) |
| Phantom / Hi-Z | `conn.hw(n).setPhantom` | `hw.N.phantom`, `hw.N.hiz` | CONFIRMADO / INFERIDO | Hi-Z sin typed |
| HPF canal | — | `i.N.eq.hpf.freq`, `.slope` | INFERIDO | escala desconocida |
| PEQ canal | — | `i.N.eq.b1..b5.{gain,q,freq}`, `eq.bypass`, `eq.easy`, `eq.lpf` | INFERIDO | escala desconocida; b5 a verificar |
| Compresor canal | — | `i.N.dyn.{threshold,ratio,attack,release,hold,gain,outgain,softknee,autogain,bypass}` | INFERIDO | escala desconocida |
| Gate canal | — | `i.N.gate.{thresh,attack,release,hold,depth,bypass,enabled}` | INFERIDO | |
| De-esser | — | `i.N.deesser.{freq,ratio,threshold,enabled}` | INFERIDO | |
| Polaridad canal / salida | — | `i.N.invert`, `a.B.invert`, `m.l.invert`, `m.r.invert` | INFERIDO | necesario en Fase 10 |
| Delay canal de entrada | `conn.master.input(n).setDelay(ms)` (0..250) | `i.N.delay` (s) | CONFIRMADO | |
| AUX send level / mute | `conn.aux(b).input(n).setFaderLevelDB / mute` | `i.N.aux.B.value/mute` | CONFIRMADO | |
| AUX send PRE/POST fader | `pre()/post()/post$` | `i.N.aux.B.post` | CONFIRMADO | ver `settings.auxsendpoint` (DESCONOCIDO) |
| AUX send PRE/POST PROC | `preProc()/postProc()/postProc$` | `i.N.aux.B.postproc` | CONFIRMADO | tap RAW_INPUT vs POST_PROCESSING |
| Matrix (Ui24R) | `conn.aux(b).switchToMatrix()`, `conn.mtx(b).master()/aux(k)/sub(k)` + preProc/postProc | `a.B.matrix`, `m.mtx.B.*`, `a.K.mtx.B.*`, `s.K.mtx.B.*` | CONFIRMADO | tap MASTER_REFERENCE |
| Salida AUX/MTX: fader, mute, delay | `conn.master.aux(b)` / `.mtx(b)`; `setDelay(ms)` (0..500) | `a.B.mix/mute/delay` | CONFIRMADO | |
| Delay master L/R | `conn.master.setDelayL/R` (0..500 ms) | `m.delayL`, `m.delayR` | CONFIRMADO | |
| PEQ/HPF/LPF de salida | — | `a.B.eq.{peak{},hpf,lpf,bypass,linked}`, `m.eq.peak.{l,r}{}`, `m.eq.hpf/lpf.{l,r}` | INFERIDO | si `peak{}` es PEQ o GEQ: DESCONOCIDO |
| GEQ 31 bandas de salida | — | sin clave `geq` en el modelo | DESCONOCIDO | hardware la tiene (manual); capturar en P0.2 |
| Comp/Gate de salida | — | `a.B.dyn/gate`, `m.dyn.{l,r}`, `m.gate` | INFERIDO | |
| AFS2 | — | `afs.enabled`, `a.B.afs.*`, `m.afs.*` (enabled, fmode, cmode, sensitivity, numfixed/numtotal, clearall/fixed/live, livelift, logic, eq{}) | INFERIDO (lectura) / DESCONOCIDO (escritura) | sección 56 solo requiere lectura de estado |
| Snapshot save / load / list | `conn.shows.saveSnapshot/loadSnapshot/shows$/currentSnapshot$` | `SAVESNAPSHOT^show^name`, `LOADSNAPSHOT^show^name`, `SNAPSHOTLIST^show` | CONFIRMADO | sobrescribe sin confirmación; alcance del snapshot DESCONOCIDO; delete/rename DESCONOCIDO |
| Show load / list | `loadShow`, `shows$` | `LOADSHOW`, `SHOWLIST` | CONFIRMADO | crear show: DESCONOCIDO |
| Cue load / save / list | `loadCue/saveCue/currentCue$` | `LOADCUE/SAVECUE/CUELIST` | CONFIRMADO | |
| Recall safe por canal | — | `i.N.safe`, `a.B.safe`, `m.safe` | INFERIDO | útil para proteger Analysis Bus/Return |
| VU meters | `conn.vuProcessor.input(n)…` (`vuPre/vuPost/vuPostFader`), `vuValueToDB` | `VU2^<base64>` | CONFIRMADO | balística y tasa DESCONOCIDAS |
| RTA de la mesa por red | — | — | DESCONOCIDO | |
| Multitrack rec/play/stop/pause | `conn.recorderMultiTrack.*` | `MTK_REC_TOGGLE/PLAY/PAUSE/STOP`, `var.mtk.*` | CONFIRMADO | Ui24R only |
| Soundcheck on/off | `activateSoundcheck()/soundcheck$` | `var.mtk.soundcheck` | CONFIRMADO | |
| Selección de canales a grabar | `conn.master.input(n).multiTrackSelect()` | `i.N.mtkrec` | CONFIRMADO | stereo-link no se propaga |
| Selección de sesión / seek / loop | — | — | DESCONOCIDO | crítico para A/B; capturar en P0.7 |
| Patch de soundcheck | — | `mtk.scout.*`, `mtk.out.*`, `i.N.scsrc`, `i.N.src` (SETS) | INFERIDO (lectura) | escritura DESCONOCIDA |
| Media Player | `conn.player.loadTrack/play/stop/playlists$` | `MEDIA_SWITCH_TRACK^plist^file`, `MEDIA_PLAY/STOP`, `MEDIA_GET_PLISTS` | CONFIRMADO | candidato a generador (A-20) |
| Mute groups / Automix / Dim | típicos | `mgmask`, `automix.*`, `m.dim` | CONFIRMADO | no requeridos por el plan |
| Device info / capacidades | `deviceInfo.model$/firmware$/capabilities$` | `model`, `firmware` | CONFIRMADO | |
| Estado de conexión | `status$` (6 estados) | keepalive `ALIVE` 1 s | CONFIRMADO | sin RTT; ver A-08 |
| Identidad del cliente en mensajes | — | no existe | CONFIRMADO (ausente) | ver A-01 |
| ACK / echo de writes propios | — | — | DESCONOCIDO | ver A-02; test en P0.1 |
| Ui24R USB-B 32×32 hacia Android | n/a | n/a | DESCONOCIDO | ver A-27 |

---

## 7. Riesgos técnicos top-10

| # | Riesgo | Sev. | Mitigación concreta |
|---|---|---|---|
| R1 | Audio de Android (notificaciones, otras apps) entra al PA por Scarlett OUT → Analysis Return; canal queda abierto si cae la red | CRÍTICO | Quitar Analysis Return del MVP; generador = Media Player de la Ui24R (A-20). Si se conserva: Return con `safe`, fader −∞ por defecto, whitelist de writes de seguridad, timeout local con alarma |
| R2 | WebView/getUserMedia no entrega dos canales independientes sin procesamiento | CRÍTICO | Plugin nativo desde Fase 1 (A-16/A-17); WebAudio solo visualización |
| R3 | Escalado de parámetros RAW (EQ/dyn/gate/GEQ/AFS) desconocido; escribir valores mal mapeados puede producir cambios extremos en vivo | ALTO | P0.2 con captura de tráfico + extracción de tablas del JS de la web app; tests round-trip; Safety Engine con límites por parámetro en unidades físicas |
| R4 | Conflictos con otros clientes indetectables por identidad; estado local optimista | ALTO | `ConfirmedStateStore` desde `inbound$`; correlación SELF/EXTERNAL; suspender automatización ante ráfagas (A-01/A-02/A-09) |
| R5 | Tablet/Scarlett: xruns, desconexión USB por cambio de ruteo, imposibilidad de cargar mientras opera | ALTO | Matriz de certificación con prueba de 3 h, hub PD certificado, Foreground Service, contador de xruns como métrica de calidad de medición |
| R6 | Ganancias analógicas no observables (preamp Scarlett, Auto Gain/Clip Safe, Direct Monitor) | ALTO | Procedimiento de calibración con tono de nivel conocido desde la mesa, calibrador SPL, detección de loop y de saltos de referencia (A-19) |
| R7 | Room EQ errónea por medir magnitud sin coherencia ni alineación temporal | ALTO | Dual-FFT + γ² + delay finder en Basic Engine (A-29/A-30) |
| R8 | Virtual Soundcheck no reproducible: sin seek, arranque variable, pendrive lento | MEDIO | Alinear por correlación de Input 2; pendrive certificado; FLAC si es necesario (A-13/A-14) |
| R9 | Snapshot recall con alcance desconocido (¿incluye gain, AFS, patch?) → rollback incompleto | MEDIO | P0.8 diff completo; rollback transaccional como mecanismo primario, snapshot como respaldo (sección 127.7 ya lo pide) |
| R10 | Dependencia de una librería comunitaria de un mantenedor (bugs reconocidos, "does not cover all aspects") y de un protocolo no documentado que un firmware puede cambiar | MEDIO | Fijar versión (7.0.3) y firmware de la Ui24R en la matriz; suite de tests de protocolo propia ejecutable contra la mesa; contribuir upstream las claves RAW mapeadas |

---

## 8. Decisiones abiertas que bloquean el backlog

1. **Generador de estímulo**: Media Player de la Ui24R (recomendado) vs. Android → Scarlett OUT → Analysis Return. Define P0.4, P0.6, sección 21–24 y el Safety Engine.
2. **Motor de audio**: nativo desde Fase 1 (recomendado) vs. WebAudio en MVP. Define Fase 1–2 y el plugin Capacitor.
3. **Dónde vive el DSP**: nativo (recomendado) vs. JS en WebView. Define el contrato del bridge (métricas vs PCM).
4. **Contenido del Basic Engine**: ¿incluye dual-FFT + coherencia + delay finder? (recomendado sí). Define el Room MVP.
5. **Fuente de verdad para gain staging**: VU2 de la mesa (recomendado) vs. Input 2.
6. **Interfaz de medición**: Scarlett 2i2 vs. alternativa Ui24R USB-B (spike) vs. segunda interfaz UAC1/2 certificable.
7. **Analysis Bus**: AUX mono vs. MTX; qué número de bus; qué salida física; si se sacrifica un monitor.
8. **Política sin ACK**: qué considera "aplicado" un write (echo, VU2, tiempo) — depende del resultado de P0.1.
9. **Modelo de `source`**: `SELF/EXTERNAL/UNKNOWN` y ventana de correlación.
10. **Show/snapshot dedicado**: nombre del show `VSE`, política de retención, si se permite `updateCurrentSnapshot()` (sobrescribe).
11. **Sesión de Virtual Soundcheck**: cómo se selecciona/reproduce un segmento si no hay seek (resultado de P0.7).
12. **Parámetros normativos de DSP** (FFT, ventana, promediado, suavizado, integración, definición de ruido/clip).
13. **Tablet objetivo y versión Android mínima** (afecta `UNPROCESSED`, AAudio `setDeviceId` ≥ API 28, multicanal por índice).
14. **Congelación de Preamp Gain durante Soundcheck** (regla de ownership + Safety).
15. **Perfil de micrófono obligatorio u opcional** para recomendaciones de EQ > 4 kHz.

---

## 9. Recomendaciones de cambio al plan (numeradas)

1. **Sección 8**: sustituir "deberá comprobarse experimentalmente" por el mapeo confirmado (A-05) y añadir `settings.auxsendpoint/mtxsendpoint` como verificación.
2. **Sección 9**: adoptar la Capability Matrix de este informe como v0 y añadir filas: Output PEQ, Polaridad, Recall safe, Selección de sesión MTK/seek, Patch de soundcheck, ACK/echo, RTA, Ui24R USB-B.
3. **Secciones 13–14**: reemplazar la división "Basic=WebAudio / Precision=nativo" por "Basic y Precision nativos; WebAudio solo visualización/PWA". Mover dual-FFT (H, γ²) y delay finder al Basic Engine; redefinir Precision como IR/ETC/RT60/sweep-deconvolution/sub alignment.
4. **Secciones 21–24 y 63**: cambiar el generador por el Media Player de la Ui24R; degradar Analysis Return a "opcional post-MVP"; añadir whitelist de writes de seguridad y estados seguros por defecto sin escritura.
5. **Sección 27–28**: Gain Assistant basado en `vuPre` + `hw.gainDB$` para peak/headroom/clip; Input 2 solo para espectro/ruido. Añadir calibración de VU2 a P0.10.
6. **Sección 38–40**: declarar la grabación post-preamp; congelar Preamp Gain en Soundcheck; alinear A/B por correlación de Input 2; añadir pendrive a la matriz de hardware.
7. **Secciones 59–60**: reemplazar `source` por `SELF/EXTERNAL/UNKNOWN`; especificar `ConfirmedStateStore` desde `inbound$`; agrupar ráfagas (snapshot recall, arrastre de fader) como evento bulk que suspende automatización.
8. **Sección 62**: `ChangeTransaction` debe registrar por cambio `confirmedBy: ECHO | VU | TIMEOUT | NONE` y soportar rollback parcial.
9. **Sección 64**: derivar `UNSTABLE` de la cadencia de `VU2`; invalidar estado en reconexión hasta el volcado completo.
10. **Sección 41/77/93**: explicitar "un canal espectral a la vez"; el análisis por canal en Full Band es secuencial o solo nivel (VU2).
11. **Sección 16**: añadir columnas "UNPROCESSED", "xruns/3 h", "carga+host", "hub", "pendrive".
12. **Sección 19**: redefinir el loopback como igualación In1/In2 + calibración de nivel de Input 2 con tono de la mesa; latencia OUT→IN opcional.
13. **Sección 24**: sustituir "verificar Direct Monitor" por test de loop electroacústico automático.
14. **Sección 56**: añadir "re-measure después de AFS2 ring-out" y guardar el estado AFS2 (`numfixed/numtotal`) en la SoundSession.
15. **Sección 78–88**: añadir P0.1 test de echo; P0.2 captura de tráfico y extracción de tablas del JS de la mesa; P0.3b Ui24R USB-B; P0.7 captura de selección de sesión/seek; P0.10 calibración de VU2. Gatear por MVP (sección 128): MVP1 no requiere Virtual Soundcheck PASS.
16. **Sección 126-F (DSP Spec)**: incluir la tabla normativa de parámetros de análisis (A-32) y la definición de coherencia mínima para aceptar un bin en recomendaciones de EQ.
17. **Sección 127**: agregar directiva "todo write RAW pasa por una tabla de mapeo con rango físico y test de round-trip; ningún valor fuera de tabla se envía".
18. **Sección 10**: declarar el camino RAW como parte del contrato del `Ui24rMixerAdapter` (no fallback), y fijar versión de librería y firmware de la mesa como parte de la Capability Matrix.

---

## Anexo — Fuentes consultadas

- Código y docs: `github.com/fmalcher/soundcraft-ui` (clon local, `packages/mixer-connection` v7.0.3; `docs/docs/buses/*.md`, `features/*.md`, `recording-playback/*.md`, `more/raw.md`, `more/howitworks.md`, `usage/status.md`).
- Protocolo manual: https://blechtrottel.net/en/jswebsockets.html
- Ui24R grabación/soundcheck: https://help.harmanpro.com/ui24r-usb-direct-recording-requirements ; https://help.harmanpro.com/exploring-the-patching-section-of-the-ui24r ; https://help.harmanpro.com/creating-playable-multitrack-session-from-imported-audio-files-on-ui24r-with-usb-stick ; https://www.soundtech.co.uk/soundcraft/news/recording-with-the-ui24r ; https://help.harmanpro.com/ui24r-master-and-aux-delay
- Ui24R procesamiento de salidas / AFS2 / USB 32×32: https://www.soundcraft.com/en-US/products/ui24r ; manual Ui24R (ManualsLib p. 76 AFS, p. 92 Delay)
- Android USB audio: https://source.android.com/docs/core/audio/usb ; https://groups.google.com/g/android-ndk/c/AKE59rHv86c
- Oboe: https://github.com/google/oboe/blob/main/docs/FullGuide.md ; https://github.com/google/oboe/wiki/Using-FullDuplexStream-for-Synchronized-IO ; https://github.com/google/oboe/issues/721
- WebRTC/getUserMedia en Android: https://blog.addpipe.com/recording-true-stereo-audio-using-getusermedia/ ; https://dev.to/ko3ak81/android-webrtc-stream-always-downmixes-stereo-audio-to-mono-4gmd ; https://issues.chromium.org/issues/40403559 ; https://developer.chrome.com/blog/media-devices
- Focusrite: https://support.focusrite.com/hc/en-gb/articles/360012532199-Connecting-your-USB-C-iPad-with-your-Audio-Interface ; https://focusrite.com/software/focusrite-control-2 ; https://support.focusrite.com/hc/en-gb/articles/360007885360-Scarlett-3rd-and-4th-Gen-USB-C-to-USB-C-connectivity
- Plugins Capacitor: https://github.com/Cap-go/capacitor-audio-recorder ; https://www.npmjs.com/package/@cantoo/capacitor-audio-capture ; https://capawesome.io/docs/sdks/capacitor/audio-recorder/
