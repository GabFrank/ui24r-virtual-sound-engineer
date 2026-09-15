# Inventario de claves observadas — Soundcraft Ui24R `3.4.8318-ui24`

**Captura del 2026-09-11.** Consola real encendida, en la red local del usuario.
No es un análisis estático ni una simulación.

## 1. Qué se midió, y qué no se afirma

Este documento enumera **todas las claves observadas en las capturas
realizadas**. No dice «el 100 % de las claves de la consola»: sólo una captura
que ejerciera todos los modos podría acercarse a eso, y ésta no los ejerció.

| | |
|---|---|
| Firmware reportado por la unidad | `3.4.8318-ui24` |
| Modelo / tipo / sabor / esquema | `ui24` / `8ch` / `1` / `6` |
| Claves únicas observadas | **6732** |
| Familias | **29** |
| Patrones normalizados | **599** |
| Tipos de mensaje | **6** |
| Claves sólo locales del cliente | **0** (no se leyó `dataValue` del navegador) |
| Claves sólo enviadas | **0** (no se envió ninguna) |

### Capacidades declaradas por la unidad

`curSetup`, extraído del AST sin ejecutar nada:

```
input 24 · aux 10 · sub 6 · fx 4 · linein 2 · bankSize 8 · phantom 20 · rec true · maxx false
```

**Son cantidades lógicas, no conectores.** Que declare `phantom: 20` con
`input: 24` ya dice que no hay correspondencia uno a uno. El campo `uniqueid`
existe y **se omite a propósito**: identifica la unidad física.

## 2. Método

| Fuente | Qué aportó | Cómo |
|---|---|---|
| `GET /js/initparams.js` | 6732 claves con su tipo | Parseado con **AST (acorn), sin evaluar**. Ejecutarlo en una sesión operativa sustituiría el estado del cliente |
| `GET /raw` | 6732 claves | Flujo de estado que la consola sirve por HTTP. No cierra: `curl` sale con 28 y los datos ya llegaron |
| Canal de control, 90 s | 6732 claves | Escucha pasiva de una conexión socket.io 0.9 |

### Las tres fuentes coinciden exactamente

| | |
|---|---|
| Sólo en `initparams.js` | **0** |
| Sólo en `/raw` | **0** |
| Sólo en el canal de control | **0** |
| Intersección de las tres | **6732** |

Eso es un resultado fuerte y conviene no sobreinterpretarlo: dice que **las tres
puertas entregan el mismo diccionario**, no que ese diccionario sea todo lo que
el firmware conoce.

### Lo que el recolector emitió

Apretón de manos de socket.io y **89 `ALIVE`**, uno por segundo, que es el latido
que el protocolo exige. **Cero escrituras de parámetro. Cero `INIT` enviados.**
No se tocó ningún fader, silencio, ganancia, fantasma, ruteo, efecto, grupo,
reloj ni red; no se cargó ni guardó ninguna instantánea.

### Lo que no se capturó

**No llegó ningún `INIT`.** Esta unidad entrega su estado al conectarse como 6732
mensajes `SETD`/`SETS` individuales. No se forzó una reconexión para provocarlo:
el volcado HTTP cubre lo mismo y el encargo lo desaconseja.

**No se leyó el diccionario `dataValue` del navegador.** No hay una sesión web
oficial abierta en esta máquina —la consola se opera desde una tablet y desde su
pantalla— así que el conjunto «sólo local» está vacío **por ausencia de fuente**,
no por haberlo comprobado vacío.

## 3. Familias

| `i` | 3315 |
| `a` | 1330 |
| `s` | 612 |
| `f` | 452 |
| `l` | 246 |
| `p` | 228 |
| `m` | 171 |
| `hw` | 84 |
| `var` | 51 |
| `settings` | 45 |
| `mtk` | 44 |
| `v` | 36 |
| `casc` | 32 |
| `usbdaw` | 32 |
| `vg` | 12 |
| `hwoutaux` | 10 |
| `iso` | 6 |
| `mg` | 6 |
| `hwouthp` | 4 |
| `hwouthpdsp` | 4 |
| `automix` | 3 |
| `hwoutm` | 2 |
| `afs` | 1 |
| `firmware` | 1 |
| `flavour` | 1 |
| `mgmask` | 1 |
| `model` | 1 |
| `schema` | 1 |
| `type` | 1 |
Las familias de una sola clave —`firmware`, `model`, `type`, `flavour`,
`schema`, `mgmask`, `afs`— son claves planas sin punto o con un solo nivel.
`afs.enabled` es la única del supresor que vive fuera de `m.afs.*` y `a.N.afs.*`.

## 4. Patrones más frecuentes

Los patrones normalizan los índices a `{n}`. **La lista completa de nombres
concretos está en `keys-observed.txt`**: un patrón no autoriza a construir claves
que no se observaron.

| `a.{n}.eq.peak.{n}` | 310 |
| `i.{n}.aux.{n}.mute` | 240 |
| `i.{n}.aux.{n}.pan` | 240 |
| `i.{n}.aux.{n}.post` | 240 |
| `i.{n}.aux.{n}.postproc` | 240 |
| `i.{n}.aux.{n}.value` | 240 |
| `a.{n}.afs.eq.{n}` | 120 |
| `a.{n}.mtx.{n}.mute` | 100 |
| `a.{n}.mtx.{n}.pan` | 100 |
| `a.{n}.mtx.{n}.postproc` | 100 |
| `a.{n}.mtx.{n}.value` | 100 |
| `i.{n}.fx.{n}.mute` | 96 |
| `i.{n}.fx.{n}.post` | 96 |
| `i.{n}.fx.{n}.value` | 96 |
| `s.{n}.mtx.{n}.mute` | 60 |
| `s.{n}.mtx.{n}.pan` | 60 |
| `s.{n}.mtx.{n}.postproc` | 60 |
| `s.{n}.mtx.{n}.value` | 60 |
| `f.{n}.aux.{n}.mute` | 40 |
| `f.{n}.aux.{n}.pan` | 40 |
| `f.{n}.aux.{n}.post` | 40 |
| `f.{n}.aux.{n}.postproc` | 40 |
| `f.{n}.aux.{n}.value` | 40 |
| `casc.{n}.src` | 32 |
| `usbdaw.{n}.src` | 32 |
| `m.eq.peak.l.{n}` | 31 |
| `m.eq.peak.r.{n}` | 31 |
| `hw.{n}.gain` | 24 |
| `i.{n}.amix` | 24 |
| `i.{n}.amixgroup` | 24 |
| `i.{n}.color` | 24 |
| `i.{n}.deesser.enabled` | 24 |
| `i.{n}.deesser.freq` | 24 |
| `i.{n}.deesser.ratio` | 24 |
| `i.{n}.deesser.threshold` | 24 |
| `i.{n}.delay` | 24 |
| `i.{n}.disablegain` | 24 |
| `i.{n}.dyn.attack` | 24 |
| `i.{n}.dyn.bypass` | 24 |
| `i.{n}.dyn.gain` | 24 |
## 5. Lo que este inventario NO autoriza a decir

- **Que una clave se pueda escribir.** Todas están marcadas
  `writability: not_tested`. No se probó ninguna escritura, y una lectura no
  implica permiso.
- **Que los índices sean continuos.** Se registraron los observados. Que existan
  `i.0` e `i.23` no autoriza a suponer que existan todos los del medio con las
  mismas propiedades — aunque en esta captura así sea.
- **Que un valor mínimo o máximo sea el rango oficial.** No se calcularon rangos.
- **Que lo no observado no exista.** La captura no ejerció cascada, multipista,
  soundcheck, efectos en uso ni diálogos. Las claves de esos modos están en el
  diccionario y no se las vio moverse.

## 6. Valores sensibles

`js/initparams.js` trae `netConfig` y el identificador único de la unidad. **El
original se guarda fuera del repositorio**, en una carpeta local privada, con su
SHA-256 en la metadata. En esta entrega hay **nombres, tipos y procedencia;
ningún valor**. Las claves cuyo nombre menciona contraseñas se inventarían por su
nombre y su valor se omite — quedan marcadas con `valueRedacted: true` en el
JSON.

## 7. Entregables

| Archivo | Qué tiene |
|---|---|
| `keys-observed.json` | El inventario procesable, una entrada por clave |
| `keys-observed.txt` | Una clave por línea, sin duplicados |
| `capture-metadata.json` | Sesión, transporte, fuentes HTTP con SHA-256, conteos |
| `capture-events-redacted.jsonl` | Eventos con dirección y tipo, sin valores |
| `MESSAGE-TYPES.md` | Los 6 tipos y cuáles no llevan claves |
| `COMPARACION-ESTATICA-3.5.md` | Contra el inventario estático de 3.5.8328 |
| `README.md` | Cómo se ejecuta y cómo se retira el observador |
