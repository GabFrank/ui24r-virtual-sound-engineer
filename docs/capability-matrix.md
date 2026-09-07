# Matriz de capacidades del protocolo Ui24R

**Versión 0.** Estado inicial, derivado de la auditoría técnica contra el código de `soundcraft-ui-connection` v7.0.3. **Ninguna fila está probada en hardware todavía.**

**Regla:** ninguna función de producto se implementa sobre una fila que no esté en estado CONFIRMADO **y** con la columna *Probado* en sí. Ver ADR-006.

**Versión de la biblioteca:** 7.0.3
**Firmware de la consola:** _por registrar en SPK-P0.2a_ — un firmware distinto al aquí listado deshabilita toda escritura por ruta cruda (INV-033).

## Estados

- **CONFIRMADO**: verificado contra código o documentación oficial.
- **INFERIDO**: la clave existe en el modelo de estado, pero el escalado del valor es desconocido.
- **DESCONOCIDO**: no se encontró fuente; requiere spike con hardware.

## Entradas y canales

| Función | API tipada | Ruta cruda | Unidad | Estado | Probado | Spike |
|---|---|---|---|---|---|---|
| Fader de canal | `master.input(n).setFaderLevelDB` | `i.N.mix` | dB, curva no lineal | CONFIRMADO | ⬜ | P0.2a |
| Fader general | `master.setFaderLevelDB` | `m.mix` | dB | CONFIRMADO | ⬜ | P0.2a |
| Silencio, solo, panorama, nombre | sí | `i.N.mute/solo/pan/name` | — | CONFIRMADO | ⬜ | P0.2a |
| Ganancia de entrada | `hw(n).setGainDB` | `hw.N.gain` | dB, de −6 a 57 | CONFIRMADO | ⬜ | P0.2a |
| Alimentación fantasma | `hw(n).setPhantom` | `hw.N.phantom` | booleano | CONFIRMADO, solo lectura por INV-007 | ⬜ | P0.2a |
| Alta impedancia | — | `hw.N.hiz` | booleano | INFERIDO | ⬜ | P0.2a |
| Retardo de canal | `master.input(n).setDelay` | `i.N.delay` | ms, de 0 a 250 | CONFIRMADO | ⬜ | P0.2a |
| Filtro pasa altos | — | `i.N.eq.hpf.freq`, `.slope` | desconocida | INFERIDO | ⬜ | P0.2b |
| Ecualizador paramétrico | — | `i.N.eq.b1..b5.{gain,q,freq}` | desconocida | INFERIDO | ⬜ | P0.2b |
| Compresor | — | `i.N.dyn.{threshold,ratio,attack,release,gain}` | desconocida | INFERIDO | ⬜ | P0.2b |
| Puerta de ruido | — | `i.N.gate.{thresh,depth,attack,release}` | desconocida | INFERIDO | ⬜ | P0.2b |
| Deesser | — | `i.N.deesser.{freq,ratio,threshold}` | desconocida | INFERIDO | ⬜ | P0.2b |
| Polaridad de canal | — | `i.N.invert` | booleano | INFERIDO | ⬜ | P0.2c |
| Protección ante recuperación | — | `i.N.safe` | booleano | INFERIDO | ⬜ | P0.8 |
| Fuente de canal en soundcheck | — | `i.N.scsrc` | enumerado | INFERIDO | ⬜ | P0.7a |

## Buses y salidas

| Función | API tipada | Ruta cruda | Unidad | Estado | Probado | Spike |
|---|---|---|---|---|---|---|
| Envío auxiliar: nivel y silencio | `aux(b).input(n)` | `i.N.aux.B.value/mute` | dB | CONFIRMADO | ⬜ | P0.2a |
| Envío auxiliar: antes o después del fader | `pre()/post()` | `i.N.aux.B.post` | booleano | CONFIRMADO | ⬜ | P0.2a |
| Envío auxiliar: antes o después del proceso | `preProc()/postProc()` | `i.N.aux.B.postproc` | booleano | CONFIRMADO | ⬜ | P0.2a |
| Configuración global de punto de derivación | — | `settings.auxsendpoint`, `mtxsendpoint` | enumerado | DESCONOCIDO | ⬜ | P0.2a |
| Matriz, con el general como fuente | `mtx(b).master()` | `m.mtx.B.*` | dB | CONFIRMADO | ⬜ | P0.2a |
| Salida: fader, silencio, retardo | `master.aux(b)` | `a.B.mix/mute/delay` | dB, ms | CONFIRMADO | ⬜ | P0.2a |
| Retardo general por lado | `setDelayL/R` | `m.delayL`, `m.delayR` | ms, de 0 a 500 | CONFIRMADO | ⬜ | P0.2a |
| Ecualizador de salida | — | `a.B.eq.*`, `m.eq.*` | desconocida | INFERIDO | ⬜ | P0.2c |
| Ecualizador gráfico de 31 bandas | — | sin clave conocida | — | DESCONOCIDO | ⬜ | P0.2c |
| Polaridad de salida | — | `a.B.invert`, `m.l.invert` | booleano | INFERIDO | ⬜ | P0.2c |
| Silencio individual por bus | — | según topología | booleano | DESCONOCIDO | ⬜ | PA-BUS |
| Supresión de realimentación | — | `a.B.afs.*`, `m.afs.*` | — | INFERIDO en lectura, DESCONOCIDO en escritura | ⬜ | P0.2c |

## Reproductor y grabación

| Función | API tipada | Ruta cruda | Estado | Probado | Spike |
|---|---|---|---|---|---|
| Reproductor: cargar, reproducir, detener, listas | `player.*` | `MEDIA_*` | CONFIRMADO | ⬜ | P0.2a, P0.6' |
| Reproductor: silencio, fader, envíos | típicos de canal | `p.N.*` | CONFIRMADO | ⬜ | P0.2a, P0.6' |
| Grabación multipista: grabar, reproducir, detener | `recorderMultiTrack.*` | `MTK_*` | CONFIRMADO | ⬜ | P0.7a |
| Modo soundcheck | `activateSoundcheck()` | `var.mtk.soundcheck` | CONFIRMADO | ⬜ | P0.7a |
| Selección de canales a grabar | `multiTrackSelect()` | `i.N.mtkrec` | CONFIRMADO | ⬜ | P0.7a |
| Selección de sesión, posicionamiento, repetición | — | — | DESCONOCIDO | ⬜ | P0.7a |
| Patcheo de soundcheck | — | `mtk.scout.*`, `i.N.scsrc` | INFERIDO en lectura | ⬜ | P0.7a |

## Estado, instantáneas y sistema

| Función | API tipada | Ruta cruda | Estado | Probado | Spike |
|---|---|---|---|---|---|
| Instantáneas: guardar, recuperar, listar | `shows.*` | `SAVESNAPSHOT`, `LOADSNAPSHOT`, `SNAPSHOTLIST` | CONFIRMADO. Sobrescribe sin pedir confirmación | ⬜ | P0.8 |
| Alcance de la recuperación | — | — | DESCONOCIDO | ⬜ | P0.8 |
| Borrado o renombrado de instantánea | — | — | DESCONOCIDO | ⬜ | P0.8 |
| Medidores | `vuProcessor.*` | `VU2` | CONFIRMADO. Balística y tasa DESCONOCIDAS | ⬜ | P0.2a, P0.10b |
| Analizador de espectro de la consola por red | — | — | DESCONOCIDO | ⬜ | P0.2a |
| Información del dispositivo y firmware | `deviceInfo.*` | `model`, `firmware` | CONFIRMADO | ⬜ | P0.2a |
| Estado de conexión | `status$` | latido cada segundo | CONFIRMADO. Sin medida de ida y vuelta | ⬜ | P0.1 |
| Identidad del cliente en los mensajes | — | **no existe** | CONFIRMADO como ausente | ⬜ | P0.1 |
| Eco de las escrituras propias | — | — | DESCONOCIDO | ⬜ | P0.1 |
| Consola como interfaz USB de 32 canales hacia Android | — | — | DESCONOCIDO | ⬜ | P0.3b |
