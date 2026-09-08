# Referencia rápida

Detalle que no entra en la skill principal. Consultar cuando haga falta el número exacto.

## Estados de la sesión

`CREATED → SETUP → CALIBRATING → ROOM_OBSERVE → CHANNEL_SETUP → SOUNDCHECK_REC → MIX → SOUNDCHECK_PLAY → ROOM_CORRECT → FULL_BAND → RINGOUT → SHOW → CLOSED`

El orden importa: **la sala se mide antes de configurar canales** (ADR-009), porque ecualizar un canal sobre una sala sin corregir lleva a corregir en el canal lo que es problema del recinto.

La tabla de transiciones legales está en `packages/domain/src/entities/session.ts`. No es un grafo lineal: hay retrocesos permitidos. El retroceso a `CHANNEL_SETUP` se bloquea si hay una toma de soundcheck activa (INV-006).

`CLOSED` es alcanzable desde casi cualquier estado, pero **la interfaz no lo ofrece entre los destinos de avance**: cerrar es irreversible y tiene su propia acción con confirmación.

## Invariantes que más aparecen

| ID | Qué prohíbe |
|---|---|
| INV-004 | Delta máximo por transacción y **tope acumulado por sesión**. Una nueva transacción sobre el mismo parámetro exige una medición intermedia. |
| INV-006 | Ganancia de preamplificador solo en `CHANNEL_SETUP`. |
| INV-008 | Únicos buses de salida escribibles: los de `PAProfile.outputBuses`. |
| INV-009 | Fader general nunca por encima de 0 dB. |
| INV-010 | Ningún auxiliar de monitor recibe escrituras. |
| INV-011 | Toda escritura precedida de lectura del estado confirmado. |
| INV-015 | El fader del reproductor nunca sube solo. Arranca en −30 dB. |
| INV-019 | Paro de emergencia visible en el 100 % de las pantallas. |
| INV-023 | Sin sigma medido no hay lazo cerrado. |
| INV-028 | Medición por componente solo si el componente tiene silencio propio. |
| INV-034 | No se actualiza la aplicación durante una sesión, con transacción en curso, ni con la consola conectada. |

La lista completa, con su test y desde qué versión aplica, está en `docs/safety-invariants.md`.

## Propiedad de parámetros

`packages/domain/src/rules/ownership.ts` clasifica cada ruta del protocolo. La categoría **`USER_ONLY` nunca se escribe**: monitores, general, silencios, alimentación fantasma, limitador, efectos, VCA y AFS2.

Hay un test que enumera las rutas escribibles y verifica que ninguna sea `USER_ONLY`. Si agregás una ruta, ese test es el que te va a avisar.

## Perfiles de canal

Trece perfiles en `packages/domain/src/data/channel-profiles.ts`, con un test que verifica que coincidan con `docs/channel-profiles.md`.

Un perfil **no es un preset**. Un preset diría «filtro pasa altos en 80 Hz»; un perfil dice «para esta fuente el filtro suele estar entre 70 y 110 Hz». La recomendación concreta sale de la medición; el perfil solo acota qué es razonable.

## Protocolo de la Ui24R

Texto sobre WebSocket. `SETD^ruta^valor`, `SETS^ruta^texto`, `VU2^base64`, `MTK_*`, `MEDIA_*`, `LOADSNAPSHOT`. Sin identidad de cliente en los mensajes y **sin confirmación de escritura**. `ALIVE` cada segundo.

Consecuencias que ya están resueltas en el código:

- Como no hay identidad de cliente, el origen de un cambio se reduce a `SELF | EXTERNAL | UNKNOWN` por correlación temporal de 300 ms (ADR-005).
- Como no hay confirmación, la política de verificación depende del spike SPK-ACK-POLICY y por ahora INV-011 está pendiente de hardware.
- El estado confirmado se alimenta **solo** de los mensajes entrantes. La biblioteca `soundcraft-ui-connection` mezcla lo saliente con el estado, y por eso no se usa para esto.

## DSP

- Función de transferencia H(f) = S12/S11; coherencia γ² = |S12|²/(S11·S22), que **necesita 16 promedios como mínimo** para significar algo.
- Búsqueda de retardo por correlación cruzada, con prueba diferencial.
- Multirresolución: FFT de 32768 o más por debajo de 100 Hz.
- Ventana Hann con 50 % de solapamiento.
- Pico verdadero con sobremuestreo ×4, según BS.1770-4.
- **Los promedios son energéticos, nunca aritméticos sobre decibeles.** La media de −20 y −10 dB es −12,6 dB, no −15.

Todo esto está validado contra una implementación de referencia en `tools/spikes/p0-10a-dsp/`, con 48 tests. El motor real todavía no existe.

## Sistema de diseño

Puntos de corte: **600 px** (una columna, acciones al ancho completo, diálogos anclados abajo), **900 px** (dos columnas, tablas completas), **1240 px** (se limita el ancho).

Fichas obligatorias, en `apps/mobile/src/styles/_tokens.scss`. Las que más se olvidan:

- `--zona-inferior` y `--zona-inferior-telefono`: la franja que ocupan el paro de emergencia y la barra de navegación. Cualquier página que termine en un botón la necesita.
- `--tap-min` (48 px) y `--tap-comodo` (56 px).
- `--seguro-arriba` y `--seguro-abajo`: muescas e indicador de gestos.

## Publicación

Fusionar en `main` (ADR-021). El número sale de los commits: `fix:` parche, `feat:` menor, `feat!:` mayor; `docs:`, `chore:`, `ci:`, `refactor:` y `test:` no publican nada. **Empujar una etiqueta a mano ya no publica**.

El flujo compila, firma con el almacén de claves guardado como secreto, comprueba que la huella del APK sea la del almacén, y adjunta `vse-<version>.apk` y `vse-<version>.apk.sha256`. **Sin los dos adjuntos la aplicación descarta la publicación**: sin suma no hay nada que verificar.

Para compilar y firmar sin publicar: `tools/release/construir-apk.sh 0.2.0`.

La etiqueta manda sobre la casilla de pre-lanzamiento de GitHub: `v0.3.0-rc.1` se descarta aunque nadie la haya marcado.

## Simulador

`node tools/mixer-sim/src/server.mjs --port 8765`

Doce canales y los escenarios `external-change`, `snapshot-recall`, `fader-drag`, `vu-gap`, `clipping`, `drop`. Se provocan enviando `!scenario <nombre>` por el propio WebSocket.

**Advertencia que se repite en tres sitios y conviene repetir acá:** el simulador reproduce *nuestras hipótesis* del protocolo. Si son equivocadas, está equivocado igual y las pruebas pasan igual. Ninguna invariante se cierra contra el simulador.
