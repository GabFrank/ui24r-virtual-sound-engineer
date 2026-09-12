# Especificación del protocolo Ui24R

**Versión 1.** Resultado de la sesión con hardware del **2026-09-08** (ADR-016). Todo lo que sigue está medido contra una consola real salvo donde diga lo contrario, y donde no esté medido lo dice.

**Consola de referencia:** modelo `ui24`, firmware **`3.4.8318-ui24`**, `type=8ch`, `schema=6`, `flavour=1`.
**Topología que publica la consola** (`curSetup` en `js/initparams.js`): `input:24, aux:10, sub:6, fx:4, linein:2, phantom:20, bankSize:8, rec:true`.

Este documento describe **lo que la consola hace**. Lo que la aplicación tiene permitido hacer con eso está en [autonomy-matrix.md](autonomy-matrix.md) y [safety-invariants.md](safety-invariants.md). Nivel actual: OBSERVE, la aplicación no escribe.

---

## `var.afsdata`: el supresor publica sus filtros

**Descubierto el 2026-09-10.** La clave `var.afsdata` trae la pila de filtros del
supresor de realimentación del general, como texto: `fstack;;` seguido de
registros `v1,<hz>,<dB>,<Q?>,...` separados por `:`, y **varias pilas** separadas
por `fstack/fstack`. Las que importan son dos: la de filtros **automáticos** —los
que la consola coloca sola— y la de **fijos**.

De cada registro se leyeron con confianza los dos primeros campos: **frecuencia
en Hz** y **profundidad en dB**. El resto no se decodificó.

**Por qué importa más de lo que parece.** Un tono sostenido es, para un supresor,
indistinguible de una realimentación: reproducir tonos de prueba por el general
hace que la consola les ponga un notch de −18 dB a cada uno, y las mediciones
siguientes salen por esos notches. Cualquier medición acústica por este general
necesita `m.afs.enabled = 0` mientras dura.

**Los tonos sostenidos de medición hacen que el supresor aprenda, y lo que
aprende se borra.** Comprobado el 2026-09-12: seis corridas con tonos continuos
de 100 Hz, 1 kHz y 10 kHz dejaron **seis filtros de −18 dB con Q=7** en el
general, en esas mismas frecuencias, y desplazaron a los tres que el operador
tenía de sus fechas. **`clearlive` los borró los seis de una**, comprobado
releyendo por HTTP, sin tocar `m.afs.enabled`. Evidencia:
`spikes/SPK-P0.5/evidence/limpiar-supresor-general-2026-09-12.txt`.

Dos consecuencias prácticas: **medir con el supresor encendido le modifica el
sonido al operador**, y por eso desde esa fecha se apaga antes de medir y se
deja como estaba; y **un filtro de −18 dB con Q=7 en la frecuencia de un tono de
prueba es firma de medición, no de una fecha real** — una nota anterior atribuía
uno de esos a «fechas viejas» y probablemente era de otra corrida.

**El segundo campo de un filtro es el Q y el tercero la ganancia.** El orden es
`freq, Q, gain, tipo`. Lo dice el volcado crudo, que es el árbitro:
`docs/spikes/SPK-P0.1/evidence/prueba-A-pasivo.txt` tiene
`m.afs.eq.1^376.4693603516,7.0,-6.0,2` —un notch de −6 dB con Q 7, porque un Q
de −6 no existe— y una ranura vacía dice `1000, 116, 0, 0`: mil hercios,
**Q 116**, ganancia cero, o sea un filtro tan estrecho que no hace nada.

**Este párrafo decía lo contrario, y se refutaba a sí mismo en el mismo
renglón**: afirmaba que el orden era `freq, gain, Q` y a continuación que el 116
de una ranura vacía era el Q, que es el segundo campo. Las dos cosas no pueden
ser ciertas a la vez. Nadie lo notó porque estaba escrito con seguridad, y el
guion que imprimía la evidencia obedeció a la frase equivocada: imprimió
«7,0 dB Q=−18,0» para filtros que son de −18 dB con Q 7. Lo encontró una
auditoría de instrumentos el 2026-09-12 mirando el volcado crudo.

**La única defensa fue que el 116 es un número con significado**: no hay
ganancia de 116 dB. Un campo que no puede ser lo que se dice que es, es la clase
de pista que este proyecto ya aprendió a mirar —fue la misma que delató el byte
247 leído como nivel cuando era el centinela de «sin reducción»—.

Consecuencia sobre evidencia ya archivada:
`docs/spikes/SPK-P0.5/evidence/limpiar-supresor-general-2026-09-12.txt` tiene las
etiquetas invertidas. **Los filtros que muestra son los correctos y las dos
columnas están cambiadas de nombre**: donde dice `7.0 dB  Q=-18` hay que leer
−18 dB con Q 7. El archivo no se reescribe —es evidencia archivada— y queda
anotado acá, que es donde alguien lo va a buscar.

**Los tres disparadores funcionan, y cuál sirve depende de en qué pila cayó el
filtro.** Medido en tres ocasiones, con resultados distintos que sólo cierran
juntos:

| Fecha | Situación | `clearlive` | `clearfixed` | `clearall` |
|---|---|---|---|---|
| 2026-09-10 | 3 filtros del usuario, supresor encendido y apagado | no movió la cuenta | no movió | no movió |
| 2026-09-12 | 6 filtros que aprendió durante una medición | **borró los 6** | — | — |
| 2026-09-12 | 1 filtro aprendido con el supresor **encendido** y un tono sonando | no borró | no borró | **borró el 1** |

**Este párrafo decía «los fijos no se pudieron borrar por protocolo», y es
falso.** Lo decía porque la primera medición probó los tres sobre filtros que el
usuario había colocado y ninguno los movió, y de ahí se concluyó que el
protocolo no podía. La conclusión correcta de esa corrida era más chica: *esos*
filtros no se borraron con *esos* disparadores.

Lo que las tres juntas dicen:

- **`clearlive` borra lo que el supresor aprendió con el supresor apagado** —o
  al menos lo que aprendió en la corrida del 12 de setiembre, seis notches de
  −18 dB en las frecuencias de los tonos de medición—.
- **`clearall` borra lo que `clearlive` no**, y eso está medido: el único filtro
  del tercer caso resistió `clearlive` y `clearfixed` y cayó con `clearall`.
- **Los tres fallan sobre los filtros que colocó el usuario.** Sigue siendo lo
  más plausible que ésos se borren desde la pantalla de la consola, con una
  confirmación de por medio, que es razonable: un fijo lo colocó alguien
  afinando la sala.

Queda sin medir **por qué** un filtro va a una pila o a la otra. La hipótesis que
los tres casos admiten es que el estado de `m.afs.enabled` en el momento de
aprender decide la pila: el tercer filtro se aprendió con el supresor
**encendido** y fue el que necesitó `clearall`. No está probado, y hace falta
provocarlo a propósito en las dos condiciones.

Los tres disparadores quedan en 1 después de usarse y hay que devolverlos a 0 a
mano.
Evidencia: `spikes/SPK-P0.5/evidence/limpiar-afs-2026-09-10.txt` (primer caso), `spikes/SPK-P0.5/evidence/limpiar-supresor-general-2026-09-12.txt` (segundo). El tercero salió de una limpieza no archivada, y queda como lo que es: una observación con fecha, hasta que se provoque a propósito.

## La consola difunde en un tic de ~34 ms

**Medido el 2026-09-10** sobre `i.16.mix`, escribiendo desde un cliente y
mirando desde otro. La consola **no difunde cada escritura**: junta los cambios
de una ventana y manda **el último valor** de cada ruta.

| Se escribe cada | De 40, llegan | Intervalo entre llegadas |
|---|---|---|
| 5 ms | 5 (13 %) | mediana 34 ms |
| 10 ms | 13–14 (33 %) | mediana 34 ms |
| 15 ms | 20 (50 %) | mediana 34 ms |
| 25 ms | 31 (78 %) | mediana 34 ms |
| 40 ms | 40 (100 %) | mediana 34 ms |
| 60 ms | 40 (100 %) | mediana 67 ms = dos tics |
| 100 ms | 40 (100 %) | mediana 100 ms = tres tics |

Las dos últimas filas son la prueba más fuerte de que el tic existe: **las
llegadas quedan cuantizadas en múltiplos de él** aunque se escriba a otro ritmo.

Es el mismo ~33 ms de la cadencia de `RTA`, así que lo más económico es suponer
**un solo reloj de difusión** para todo lo que la consola emite.

**Qué se rompe si no se sabe.** Dos escrituras a la misma ruta dentro de un tic
producen una sola línea con el segundo valor: la primera se aplica y **nadie la
ve difundir**. Cualquier mecanismo que confirme una escritura mirando lo que la
consola difunde —el nuestro, ver [ack-policy](ack-policy.md)— la da por no
confirmada aunque haya funcionado. Evidencia:
`spikes/SPK-P0.9/evidence/cadencia-difusion-2026-09-10.txt` —remedido en `spikes/SPK-P0.9/evidence/cadencia-difusion-2026-09-11.txt`, donde el tic reproduce exacto— y
`spikes/SPK-P0.9/evidence/testigo-en-el-tic-2026-09-10.txt` —transcripción— **remedido el 2026-09-11** con la herramienta y un guion nuevo: `spikes/SPK-P0.9/evidence/testigo-en-el-tic-2026-09-11.txt`, y **con control positivo y la cuenta de líneas difundidas** en `spikes/SPK-P0.9/evidence/testigo-en-el-tic-2026-09-11d.txt`. Pegadas, el testigo vio la segunda **10 de 10** y la primera **0 de 10**, y la consola difundió **una sola línea las diez veces, con el valor de la segunda**; separadas por más que el tic, vio **las dos 10 de 10**. O sea **colapso, no descarte**.

**Lo que esto NO mide, y conviene que esté escrito acá:** si la consola *aplicó* la primera antes de sobrescribirla. Una sola línea difundida es compatible con las dos historias. Se afirmó que «la consola aplica las dos» y esa parte **no está medida**: para separarlas haría falta leer el estado entre las dos escrituras, y eso mete una espera que rompe el mismo tic que se quiere medir.

## 1. Transporte

### 1.1 No es un WebSocket pelado

La consola habla **socket.io 0.9**. Abrir un WebSocket contra una dirección fija no funciona: hay que pedir antes un identificador de sesión por HTTP.

```
$ curl -sS "http://192.168.0.49/socket.io/1/"
10454688205293084044:5:5:websocket
```

El formato es `<sesión>:<latido>:<cierre>:<transportes>`. La dirección del socket queda:

```
ws://<máquina>/socket.io/1/websocket/<sesión>
```

Tres cosas medidas que importan:

- **El identificador es de un solo uso.** Hay que pedir uno nuevo en cada conexión, y por lo tanto en cada reconexión. **Por eso el campo «Dirección» de Ajustes no puede guardar una URL**: tiene que guardar la máquina y derivar la ruta. Lo implementa `resolverDireccionUi24r()`.
- **El único transporte es `websocket`.** No hay reserva por sondeo.
- **La ruta del apretón de manos no se valida.** `/socket.io/?EIO=3&transport=polling` y `?EIO=4` devuelven el mismo formato 0.9. No confundir eso con soporte de socket.io moderno.

### 1.2 Envoltorio de las tramas

Cada trama del WebSocket es `<tipo>:<id>:<endpoint>:<datos>`.

| Trama | Significado |
|---|---|
| `1::` | conexión aceptada |
| `2::` | latido del servidor |
| `3:::<carga>` | mensaje de datos |
| `0::` | desconexión |

Verificado en crudo: los bytes de un mensaje de datos son `33 3a 3a 3a` (`3:::`) seguidos de la carga.

**Una trama de datos puede traer varias líneas de protocolo separadas por `\n`.** No es un caso raro: el volcado inicial llega así, en unos doscientos veinte mensajes de unos 2 KB. Un lector que asuma una línea por trama pierde casi todo.

### 1.3 El latido no se contesta, y su valor declarado es falso

El apretón de manos declara `heartbeat=5`, o sea 5 segundos. **Medido: la consola manda `2::` cada ~66 ms** — 179 latidos en 12 s, 445 en 30 s, unos 14,7 Hz.

Se probaron las dos variantes, respondiendo `2::` y sin responderlo, veinte segundos cada una: **el flujo entrante es idéntico**. La consola no espera respuesta; contestar solo agrega tráfico.

**No usar el valor declarado para el detector de caída.** Un umbral de 5 segundos sobre un canal que late cada 66 ms deja pasar unos setenta latidos perdidos antes de reaccionar.

### 1.4 `ALIVE` es obligatorio

El cliente oficial hace `setInterval(function(){sendMessage("ALIVE",!0)},1E3)`: manda el texto plano `ALIVE` cada segundo, que en el cable viaja como `3:::ALIVE`.

**Sin él la consola deja de emitir.** El síntoma no es una desconexión: el socket queda abierto y no llega nada.

| | sin `ALIVE`, 20 s | con `ALIVE` cada 1 s, 30 s |
|---|---|---|
| tramas `RTA` recibidas | 148 | 905 |

---

## 2. Mensajes

### 2.1 Verbos

De `parseCommand()` en el `mixer.html` que sirve la consola. Todos observados salvo donde se indica:

| Verbo | Forma | Observado |
|---|---|---|
| `SETD` | `SETD^<ruta>^<número>` | sí, 6 025 en el volcado inicial |
| `SETS` | `SETS^<ruta>^<texto>` | sí, 640 en el volcado inicial |
| `VU2` | `VU2^<base64>` | sí, ver §4 |
| `VUA` | `VUA^<base64>` | sí, pero solo con los auxiliares en silencio |
| `RTA` | `RTA^<base64>` | sí, flujo continuo |
| `INIT` | `INIT^<json>` | no llegó espontáneamente |
| `MSG` | `MSG^<texto>` | no |
| `BMSG` | `BMSG^…` | no |
| `UPDATE_PLAYLIST` | sin argumentos | sí, una vez al conectar |

### 2.2 Comandos que el cliente oficial envía

`ALIVE`, `INIT`, `NETCONFIG`, `SERIAL`, `SETTIME^`, `USERTIME^`, `UDP^`, `RENAME^`, `SWAPUSB`, `IOSYS^`, `DYN^`, `DLGRESULT^`, `AFSUPDATEVAR`, `AFSLOADCHAN^`, `BMSG^SYNC^`, `BMSG^SYNC_VG^`, además de `SETD` y `SETS`.

De estos, la sesión de medición solo usó `ALIVE` e `INIT`, que son de consulta. **`NETCONFIG` devuelve, entre otras cosas, el hash de la contraseña de administrador**: si alguna vez se captura, hay que decidir antes qué se guarda y qué se redacta.

---

## 2.3 Lo que la consola sirve por HTTP

Medido el 2026-09-09, solo con peticiones de lectura.

**`GET /raw` devuelve el estado entero en formato de protocolo**, sin socket.io, sin apretón de manos y sin WebSocket, más tramas `VU2` y `RTA`. Comprobado capturando los dos transportes **en el mismo momento**: 6728 claves cada uno, diferencia cero. Una comparación contra un volcado archivado de otro día daba 63 claves de diferencia y parecía que HTTP traía más — era el estado que había cambiado, no el protocolo.

**No es una instantánea, es un flujo en vivo**: la conexión no cierra, así que `fetch` se cuelga esperando el fin del cuerpo y `curl` termina con código 28. Los datos llegan igual; hay que leer con límite de tiempo y tolerar ese código.

Sirve para diagnóstico de una línea —`curl -s --max-time 10 http://<consola>/raw`—, para armar fixtures con estado real sin hardware, y para comprobar «lo dejé como lo encontré» comparando dos volcados.

| Ruta | Qué es |
|---|---|
| `/raw` | el estado entero, en vivo |
| `/mixer.html` | el cliente de tableta, 1,2 MB. La fuente más autoritativa del protocolo |
| `/phone.html` | un **segundo cliente**, 862 KB. Sin explotar: sirve para contrastar conversiones |
| `/js/initparams.js` | `curSetup` y **el estado actual** de cada clave. Decía «los valores por defecto» y es falso: trae el nombre que el usuario tipeó y las ganancias de ahora, idénticas a `/raw`. **No sirve como segunda fuente**: es la misma lectura por otra cañería |
| `/config.html` | pide autenticación |

`curSetup` declara la topología: `input:24, fx:4, aux:10, sub:6, linein:2, bankSize:8, phantom:20`. Coincide con la cabecera de `VU2` y agrega que **solo 20 de las 24 entradas tienen alimentación fantasma** — coherente con que `i.N.src` valga `none` en los cuatro últimos.

**Familias de claves que este documento no listaba**: `i.N.hiz` (alta impedancia), `hwoutaux.N.src` / `hwoutm.N.src` / `hwouthp.N.src` (qué sale por cada conector físico), `usbdaw.N.src` (32 canales hacia la computadora), `casc.N.src`, `mtk.out.N` y `mtk.scout.N` (multipista), `mg.N.name` y `vg.N.name` (grupos de silencio y de vista), `iso.*`, `firmware`, `model`.

## 3. Volcado de estado

Al abrir el socket la consola manda su estado completo, sin pedirlo. `INIT` lo vuelve a pedir.

| | |
|---|---|
| claves distintas | **6 665** en la sesión del 2026-09-08; **6 087** en la del 2026-09-09 |
| líneas `SETD` / `SETS` | 6 025 / 640 |
| reparto | ~220 mensajes de ~2 KB |
| tiempo hasta el volcado completo | **112–158 ms**, mediana 118 ms, 20 de 20 ciclos |

Prefijos de clave por cantidad: `i` 3252, `a` 1330, `s` 612, `f` 452, `l` 246, `p` 228, `m` 171, `hw` 80, `var` 51, `settings` 45, `mtk` 44, `v` 36, `usbdaw` 32, `casc` 32, `vg` 12, `hwoutaux` 10, `mg` 6, `iso` 6, `hwouthpdsp` 4, `hwouthp` 4, `automix` 3, `hwoutm` 2, más siete claves sueltas de identidad: `firmware`, `model`, `type`, `schema`, `flavour`, `mgmask`, `afs.enabled`.

> **El firmware solo se conoce después de conectarse.** No está expuesto por HTTP: `version.txt`, `VERSION`, `js/version.js`, `firmware.txt`, `info.json`, `/api/version` y `sel/version.js` devuelven todas `301`. Aparece como una clave más de este volcado. Es un problema de orden para INV-033, que deshabilita escrituras si el firmware no coincide con la matriz: cuando hace falta la decisión, todavía no hay dato.

**No se observó ninguna marca de fin de volcado.** El adaptador espera una línea `DUMP_END` que **esta consola no manda**. Hay que detectarlo por conteo o por quietud, no por centinela.

> **El tamaño del volcado no es una constante, y este documento lo escribió como si lo fuera.** El 2026-09-08 dio 6 665 claves, en tres clientes a la vez y en veinte reconexiones seguidas; el 2026-09-09, con la consola en el mismo firmware, dio **6 087**, otra vez idénticas entre los tres clientes de esa sesión. O sea que es estable **dentro** de una sesión y no **entre** sesiones: depende de lo que la consola tenga configurado —efectos, subgrupos, lo que sea que haya cambiado en el medio—, y nadie lo acotó todavía. Consecuencia práctica: **nada puede detectar el fin del volcado comparando contra un número escrito a mano.** El desglose por prefijo de más arriba es el de la sesión del 2026-09-08 y vale como retrato, no como especificación.

---

## 4. Medidores

### 4.1 `VU2` no es un flujo: la consola lo calla en silencio

| | consola en silencio, 30 s | música por las RCA, 90 s |
|---|---|---|
| `VU2` | **1 trama** | **1 932 tramas** |
| `VUA` | 1 | 1 (nadie tenía abierta la página de Automix) |
| `RTA` | 905, a 30,2 Hz | 2 569, a 30,0 Hz |

Con `INIT` a los 3 s llegó exactamente **una** `VU2` más. O sea: `VU2` viaja con el volcado de estado, y además fluye mientras haya algo que medir.

No hay comando de suscripción a medidores: ninguno de los dieciséis comandos del cliente oficial los pide. `settings.disableVUs` es una preferencia **del cliente**, que filtra en `parseVUdata()`.

**Cadencia de `VU2` con señal:** n=1932, media 44,3 ms, mediana 34 ms, percentil 95 68 ms, mínimo 0 ms, máximo 100 ms. Umbral de inestabilidad por la fórmula del charter, tres veces la media: **≈133 ms**. **Ese umbral está derogado**: sale de la media de `VU2`, y `VU2` se calla en silencio, así que la conexión se declararía inestable entre tema y tema (R-25). El de la fórmula son **99 ms sobre `RTA`**, que es el flujo que no se apaga — y el que el código vigila son **300 ms**, un margen elegido a propósito sobre ese resultado: con 99 bastarían tres tramas perdidas para declarar inestable.

Tres advertencias sobre ese número:

1. **La media está inflada** por los tramos sin cambio. Contra la mediana la cadencia es ~29 Hz.
2. **El mínimo de 0 ms es real:** la consola a veces mete **dos tramas `VU2` en un mismo mensaje**. Un contador que asuma una por mensaje subcuenta.
3. **Es el número de una laptop por cable.** El de la tablet lo mide la propia aplicación, y es otro.

> **Consecuencia de diseño.** Un detector de conexión caída basado en `VU2` da falso positivo en cada silencio: entre tema y tema, en la prueba de sonido, en cada pausa. `RTA` no hace esa supresión —30,0 Hz con señal, 30,2 Hz en silencio, percentil 95 de 37 ms— y es lo que el adaptador vigila ahora. El `2::` cada 66 ms también serviría de latido y es más barato, pero es del transporte: sigue latiendo aunque el motor de audio se haya colgado. `RTA` viene del DSP.

**Lo que falta medir:** no se capturó la transición inversa, música que se corta y `VU2` que se apaga. «Suprime durante el silencio» es la explicación que encaja con dos mediciones, no un mecanismo observado. Tampoco se sabe si el umbral es el cero exacto o un piso de ruido.

### 4.2 Formato de `VU2`

Base64. **Cabecera de 8 bytes**, después **6 bytes por canal**.

Cabecera observada: `[24, 2, 6, 4, 10, 2, 2, 0]`, que coincide con `curSetup` (`input:24`, `linein:2`, `sub:6`, `fx:4`, `aux:10`). El byte 0 es la cantidad de entradas.

Bloque del canal `g`, en el desplazamiento `8 + 6·g`:

| Desplazamiento | Contenido |
|---|---|
| `+0` | nivel **después** del previo y **antes** del procesamiento del canal — compresor, ecualizador y puerta comprobados; el de-esser no se midió. Ver §4.3 |
| `+1` | nivel de entrada |
| `+2` | nivel de salida, después del fader |
| `+3` | entrada del dinámico (solo lo llena el canal seleccionado) |
| `+4` | salida del dinámico |
| `+5` | bits 0-6 reducción de ganancia del compresor, bit 7 **indicador de puerta** |

Escala, literal del código de la consola:

```js
deconvertVU(b)      = 0.004167508166392142 * b            // ~ b/239,95 -> 0..1
deconvertVU_comp(b) = (1 - 0.004167508166392142*b) * COMP_ZOOM
```

**Lo que devuelve `deconvertVU` es una posición normalizada de 0 a 1, no decibeles.** No es la escala del fader: ver 4.3.

**Verificación contra una fuente conocida.** Con música entrando solo por las entradas RCA, la trama dio nivel en los canales 21 y 22 y cero en los otros veintidós; las RCA de esta consola son exactamente esos dos canales. El canal 21 dio `pre=120, entrada=120, salida=86`, con la salida por debajo de la entrada, coherente con el fader por debajo de 0 dB. Máximos en 90 s: `pre=entrada=142` (0,592 normalizado), `salida=108`.

**Sobre el byte `+5`:** se observaron solo dos valores, `247` y `119`, y `247` en casi todo. Como `247 = 119 | 128`, los siete bits bajos fueron siempre 119.

El bit 7 es el **indicador de puerta de ruido**, no el de saturación. En `parseVUdata` sale con `p = 0 != (byte & 128)` y termina en `this.gi.setValue(p)`, donde `gi` es un `GATEind`. Conviene tenerlo escrito porque induce al error: vale 1 en todos los canales quietos, y leerlo como saturación da los veinticuatro canales saturando sin parar. Se probó el 2026-09-08 y así fue.

**La cola, decodificada el 2026-09-09.** La trama son **306 bytes**: 8 de cabecera, 144 de entradas (24 × 6) y **154 de cola**. Antes este documento decía «145 bytes» —que no cierra ni con su propia aritmética— y que el patrón «parece desalineado». No está desalineado: **las secciones no comparten el paso**, y leerlas todas con el 6 de las entradas es lo que las desalineaba.

Reparto, en posiciones relativas al fin de las entradas (byte 152 absoluto):

| Relativo | Contenido | Paso |
|---|---|---|
| `0 .. 11` | 2 del **reproductor de medios** | 6 |
| `12 .. 53` | 6 subgrupos | 7 |
| `54 .. 81` | 4 efectos | 7 |
| `82 .. 131` | 10 auxiliares | 5 |
| `132 .. 141` | **general**, dos bloques de 5: izquierdo y derecho | 5 |
| `142 .. 153` | **2 entradas de línea**, con el formato de 6 de las entradas | 6 |

**Dos rótulos estuvieron invertidos hasta el 2026-09-09.** Esta tabla decía «2 entradas de línea» para la primera sección —que es el reproductor— y «general» para los 22 finales, que son 10 del general más 12 de las entradas de línea. Coinciden en número —reproductor y línea son los dos *dos bloques de seis*— y por eso el censo del vocabulario, presentado como comprobación independiente, no podía distinguirlos. Lo destapó una trama archivada con música por las RCA: los bytes con señal están en 294–305, no en 152–163.

El tamaño del general lo declara el **byte 6** de la cabecera (`l = e += 5·charCodeAt(6)` justo antes de leer las líneas). El byte 5 vale 2 y sigue sin saberse qué es. La cantidad de entradas de línea **no** está en la cabecera.

Cada límite se fijó provocando señal en una sola sección y viendo qué bytes se movían: envío a un efecto, asignación a un subgrupo, envío a un auxiliar. Las cuentas cierran sin holgura —2×6 + 6×7 + 4×7 = 82— y el censo del vocabulario (`l.0..1`, `s.0..5`, `f.0..3`, `a.0..9`) llega a los mismos tamaños por otro camino. La sección de línea es la única que no se provocó con señal: sale por resta y por el censo.

**Y la cabecera dice cuántos hay de cada cosa, así que la cola no tiene un reparto fijo.** El cliente avanza con `e += 6·charCodeAt(0)` para las entradas, `6·charCodeAt(1)` el reproductor, `7·charCodeAt(2)` los subgrupos, `7·charCodeAt(3)` los efectos, y `charCodeAt(4)` auxiliares de a 5. Comprobado: la cabecera trae `24 2 6 4 10` —el mismo mapa levantado a mano— y `8 + 6·24 + 6·2 + 7·6 + 7·4 + 5·10 = 284` contra 306, o sea 22 bytes de general. **Escribir esas cuentas en el código sería la misma trampa que el enrutamiento identidad**: coincide hasta que alguien cambia la configuración de la consola. Los bytes 5, 6 y 7 de la cabecera valen `2 2 0` y no se sabe qué son.

#### El formato de cada bloque

**Subgrupo y efecto — 7 bytes, tira estéreo de dos medidores.** `setVU(n=+0, h=+2, q=+1, m=+3, …)` sobre la firma `setVU(a,b,c,d,…)`, que arma `vu=(a,b)` y `vu2=(c,d)`:

| Byte | Qué es |
|---|---|
| `+0` / `+1` | previo, izquierdo y derecho |
| `+2` / `+3` | posterior al fader, izquierdo y derecho |
| `+4` / `+5` | entrada y salida del bloque dinámico, solo para la tira seleccionada |
| `+6` | reducción en los 7 bits bajos, indicador de puerta en el alto |

Comprobado moviendo el fader del subgrupo 1 con el canal 10 asignado: `+2` y `+3` bajaron 94 → 50 → 0 y `+0` y `+1` no se movieron.

**Auxiliar — 5 bytes, tira mono.** `+0` previo, `+1` posterior al fader, `+4` reducción e indicador. Comprobado moviendo `a.0.mix`: el `+1` bajó 104 → 77 → 37.

**Reproductor — 6 bytes, el mismo formato que una entrada** y no el de los buses: `+0` previo, `+1` entrada, `+2` salida. Comparte posición en la cola pero no formato.

**Una conclusión que hubo que retirar.** La primera lectura del bloque de subgrupo dijo «el medidor es anterior al fader», porque mover `s.0.mix` no movía nada y el testigo confirmaba que la escritura sí se aplicaba. Era falsa: `s.0.mute` valía 1, los bytes posteriores estaban en cero y se estaba mirando los previos. Dos bytes en cero con señal presente eran la pista que faltó seguir.

### 4.3 De posición a decibeles: el medidor es lineal, y no usa la ley del fader

Leído del `mixer.html` de la consola el 2026-09-08. Son dos piezas y juntas no dejan otra lectura posible:

```js
VU_RANGE = 80
vuPosMark(dB, h) = -dB * h / VU_RANGE     // donde va cada marca de la escala
paint()          { c = h * this.value }   // alto de la barra, proporcional a la posicion
```

Si la barra es proporcional a la posición y las marcas están espaciadas linealmente en decibeles, la correspondencia es una recta:

```
dB = 80 · posicion − 80        // 0 dB en la punta, −80 en el fondo
```

Un escalón del byte son `80 × 0,004167` = **0,333 dB**. Ese 80 es `MEDIDOR_RANGO_DB` en el adaptador; el escalón sale de multiplicarlo por la escala, no es la constante misma.

**El recorrido está medido, y da 80.** No es solo lectura de código. Medido el 2026-09-09 contra la consola en `192.168.0.78`, moviendo **el fader del canal**, que es una ganancia digital *dentro* de la consola: entre la fuente y el medidor no hay nada analógico que pueda mentir. Fuente fija, y el medidor de entrada como testigo —se mantuvo clavado en **−20,76 dB en las quince posiciones**—:

| | |
|---|---|
| crudo 0,7647 | byte de salida **181,0** |
| crudo 0,2000 | byte de salida **66,3** |
| recorrido del medidor | **114,7 escalones** |
| atenuación según la ley de fader de la consola | **38,19 dB** |
| lo que dan 114,7 escalones con `VU_RANGE = 80` | **38,24 dB** |

**Coincide en 0,05 dB sobre 38.** `VU_RANGE` y `VtoLIN` son dos hechos independientes del código de la consola, y concuerdan entre sí y con esta medición.

> **El recorrido estuvo escrito como 84,5 dB en este documento durante unas horas, y era falso.** Venía de tres barridos de tono con una fuente externa conocida, cada uno una recta impecable —pendientes de 0,9438, 0,9379 y 0,9507 contra el recorrido de 80, desvíos de 0,79, 0,21 y 0,39 dB—. Lo que faltaba mirar es que **no coincidían entre sí**: en dB por escalón del byte daban 0,3516, 0,3582 y 0,3644 según la zona del medidor en la que se midiera, y un cuarto barrido a niveles altos confirmó el 0,3644. Una escala tiene un solo factor; tres factores según el nivel son la cadena analógica —conversor, cable, previo, ruido— metiéndose en el medio.
>
> **Una fuente externa mide la cadena entera, no el medidor. Para medir el medidor hay que mover algo que ya esté adentro.** Los datos crudos quedan en `docs/spikes/SPK-P0.10b/evidence/barridos-2026-09-08.txt` con el motivo por el que no fijan la escala. Cae con ellos la «causa probable» que se les había buscado —los nueve píxeles de diferencia entre `drawVUMarks` y `paint()`—: era una explicación razonable para un número que no existía.

**Lo que esta medición no contesta:** la correspondencia con dBFS absolutos. El camino de la fuente llevaba una ganancia analógica desconocida —perilla de la interfaz más previo del canal— que se mantuvo fija, así que valen las diferencias y no los valores absolutos. Eso exige un bucle calibrado y lo sigue debiendo SPK-P0.10b.

**Control de sensatez contra el aparato en dos puntos**, con la consola en `192.168.0.78`. Son lecturas a ojo de una barra en movimiento, así que valen con esa tolerancia:

| Fuente | Byte | Según la recta de 80 dB | Lo que mostraba la consola |
|---|---|---|---|
| Guitarra en el canal 1 | entrada 225 | −5,0 dB de entrada; con el fader en −6,9 dB, **−11,9 a la salida** | −12 |
| Música por las RCA (21 y 22) | salida 102 | **−46 dB** | coincide con la barra |

**Respuesta en frecuencia: plana.** Mismo nivel de fuente a tres frecuencias dio bytes **160,3** a 100 Hz, **160,7** a 1 kHz y **160,0** a 10 kHz: **0,23 dB de dispersión**, o sea que no hay ponderación por frecuencia. La medición incluye la cadena analógica, que también es plana, así que lo afirmable es que **no hay ponderación apreciable en el conjunto**.

**Repetibilidad: 0,3 dB.** El mismo tono en tres corridas separadas en el tiempo dio bytes 69,9, 69,1 y 70,0. Es el piso de ruido del montaje entero, y el número contra el que hay que comparar cualquier diferencia que se quiera declarar significativa.

**Balística: la consola manda nivel instantáneo.** Cinco ráfagas de 1 200 ms a −15 dBFS: subida de **0 ms** —no se resuelve, la lectura llega a la meseta dentro de una sola trama— y caída de 20 dB con **mediana de 37 ms**, mínimo 33 y máximo 66. La cadencia con señal es de ~44 ms, así que nada por debajo de eso se puede afirmar. La balística la dibuja el **cliente**: en el `mixer.html` son `GLOBAL_VU_FALL_SPEED = 0.01` y `PEAK_HOLD_TIME = 3`. Para nuestra aplicación eso significa que **la retención de picos es una decisión de producto, no algo heredado del protocolo**.

Antes de esto el adaptador convertía con la ley del fader, sobre la hipótesis —escrita como tal— de que la consola dibuja sus medidores con la misma regla que sus faders. **Es falsa.** Con esa ley el byte 225 daba +4,6 dB, recortado a +10 en pantalla.

**Qué medidor dibuja cada widget**, de `parseVUdata` y `setVU`:

| Widget | Byte | Nota |
|---|---|---|
| Barra de la tira | `+2` salida | `setValueExt(a, b)` guarda `this.value = b` |
| Fantasma de la tira | `+1` entrada | el segundo valor de `setValueExt` |
| Página de ganancia | `+0` pre | `setVUPre(m)` |

**Dónde está tomado cada medidor, medido el 2026-09-09.** La tabla de arriba decía «nivel previo a la ganancia del previo» para el byte `+0`, y eso es falso: está **después** del previo. Lo que sí es, y es más útil, es que está **antes del procesamiento dinámico**.

Las dos mitades se midieron por separado, con una fuente conocida entrando por el canal 10:

| Qué se movió | `pre` (`+0`) | `entrada` (`+1`) |
|---|---|---|
| Ganancia del previo, de 10 a 22 dB | sube 6,00 y 6,01 dB | sube igual |
| Compresor apretando 5 dB | **no se mueve** | baja 4,7 dB |

Consecuencia para cualquiera que mida niveles: **`entrada` viene procesado**. Si el canal tiene compresor o puerta actuando, ese byte no dice cuánta señal entra sino cuánta queda después del procesamiento. Para ajustar la ganancia del previo —que es lo que hace el asistente— el byte que corresponde es `+0`.

**El ecualizador tampoco lo toca.** Medido el 2026-09-09 con la misma fuente: realzando y cortando una banda al máximo, `entrada` y `salida` se movieron ±2,33 dB y `pre` se quedó en −48,66 en los tres estados, sin variar un decimal.

Con eso, `pre` queda como el punto más limpio que la consola ofrece: **después del previo y antes de todo el procesamiento del canal**. Es exactamente lo que necesita un asistente de ganancia, que tiene que medir el margen del previo sin que lo coloreen decisiones de timbre ni de dinámica.

**La puerta tampoco.** Medido el 2026-09-09 subiendo su umbral por encima de la señal: `entrada` cayó a −∞ —la puerta cierra con su atenuación máxima— y `pre` se quedó en −48,66 sin moverse. Con esto son tres los bloques comprobados —compresor, ecualizador y puerta— y ninguno toca el punto `+0`. **El cuarto, el de-esser, sigue sin medir**: no informa cuánto atenúa y no se probó con sibilancia, así que «el bloque dinámico está comprobado» sería decir de más.

Dos trampas de escala que costaron una corrida cada una, y que conviene tener escritas: la ruta del umbral es `gate.thresh`, no `gate.threshold`; y `VtoGATE_DEPTH(a) = 60a − 60`, o sea que **profundidad 0 es atenuación máxima y 1 es ninguna**. Es la tercera escala invertida de esta consola, después de `VtoRATIO(a) = 1/a`.

**La reducción de ganancia del compresor viaja en vivo** en el byte `+5`, y se decodifica con `deconvertVU_comp((byte & 127) << 1)`, con `COMP_ZOOM = 2`. La fracción resultante se convierte a decibeles con factor `VU_RANGE / COMP_ZOOM` = 40. Comprobado contra la caída real del nivel: 10,8 % dio 4,66 dB medidos contra 4,32 calculados; 22,5 % dio 9,00 contra 9,00; 27,5 % dio 10,80 contra 11,00.

**Conversiones del dinámico**, leídas del `mixer.html`: `VtoRATIO(a) = 1/a` —el crudo **1 es 1:1, o sea sin compresión**, no el máximo— y `VtoTHRESH(a) = −90 + 96·a`. La primera induce al error con facilidad: una corrida entera se hizo con el compresor puesto en «no comprimir» y concluyó que la reducción no se veía.

> **REFUTADAS contra el aparato el 2026-09-12.** No son «leídas y sin verificar»: se verificaron y no describen este compresor. Con `VtoTHRESH(a) = −90 + 96a`, `VtoRATIO(a) = 1/a` y una rodilla dura, el exceso despejado va de **10,0 a 25,6 dB en la misma corrida, con fuente y umbral quietos** — tiene que ser constante y no lo es. Las pendientes por sustitución dependen de la relación (22,2 / 32,1 / 47,3 dB por unidad) y los cocientes dan 1,58 a 2,42 donde el modelo pide 3,00. **Y no es culpa del instrumento**: el medidor de reducción se calibró contra la caída real de nivel y sigue hasta 24,34 dB con 0,35 dB de desvío, igual en el tramo que ya estaba verificado y en el que no.
>
> Lo que sí sigue valiendo de este párrafo es el **sentido** de `VtoRATIO`: el crudo 1 no comprime. Eso está medido aparte —con `a = 1` y el umbral en 0,14 la reducción informada es 0,00 y `entrada = pre`— así que la advertencia se sostiene por una medición y no por la fórmula.
>
> Aparece otra relación que encaja en un corte, `−20·log₁₀(a)`, dentro de 0,48 dB hasta a = 0,15. **No se declara ley**: con otro umbral predice 6,02 donde se midieron 2,98. Lo que falta es el barrido de **umbral × relación**, que da la superficie en vez de dos cortes. Detalle en `docs/compromisos/97-leyes-del-compresor.md`.

**Saturación:** `setVU` hace `1 <= b ? this.clip.clip() : ...`, y `setVUPre` lo mismo con el pre. Satura cuando la barra llega a la punta, o sea a 0 dB. No hace falta —ni conviene— elegir un umbral propio.

**El techo es el byte 255, y lo que estuvo escrito acá era el techo de otra cosa.**

Decía: «con la ganancia del canal al máximo y la fuente subiendo, el byte se clava en 239 y la lectura deja de subir; el medidor no informa nada por encima». **Ese 239 es donde satura la interfaz de audio, no el medidor.**

Medido el 2026-09-09, por dos personas y con el mismo método: dejar el nivel **previo al fader** en 232 —sin saturar— y subir el **fader**, que es ganancia digital interna y no tiene nada analógico en el medio. La salida siguió creciendo lineal: 232 → 242 → 248 → 255. Con la ley del fader, la posición 0,95 predice exactamente 255 y en 1,0 se planta. El tope real del número que manda la consola es **255**.

Es el mismo error que costó el episodio de los 84,5 dB —medir la cadena entera creyendo medir el medidor— aplicado al techo en vez de a la escala. La lección estaba escrita en este documento y se había aplicado solo a la mitad.

**Consecuencias.** Los bytes 240 a 255 son posiciones **mayores que 1**: de +0,02 a +5,0 dB. `MEDIDOR_SATURACION = 1` es el byte 240 y **sí es alcanzable** —una duda razonable que surgió de auditar con el techo viejo—. Y cualquier normalización que trate 240 como tope entrega posiciones fuera de rango con señal caliente.

**Comprobación cruzada del modelo entero.** Si la barra es la salida y el fantasma la entrada, la diferencia entre las dos tiene que ser exactamente el fader del canal. Medido el 2026-09-08 con música por las RCA:

| Canal | Entrada (byte) | Salida (byte) | Diferencia con recorrido 80 | `i.N.mix` |
|---|---|---|---|---|
| 21 | 171,9 | 137,1 | **11,6 dB** | −11,6 dB |
| 22 | 174,9 | 140,1 | **11,6 dB** | −11,5 dB |

Cierra en una décima de decibel. El reparto de bytes, la relación entre la barra, el fantasma y el fader, y el recorrido de 80 dB quedan comprobados a la vez.

> **Esta comprobación estuvo marcada como «pregunta abierta» y ya no lo está.** Daba un recorrido implícito de 79 a 80 dB mientras los barridos de tono daban 84 a 85, y se anotó como una discrepancia del 6 % sin resolver, adoptando el número de los tonos por ser la medición «más fuerte». No había dos respuestas: había una medición limpia y otra contaminada por la cadena analógica, y la contaminada era la de los tonos. La hipótesis que se había escrito para salvarla —que `faderADb` arrastrara un error de escala del mismo orden, invisible porque afecta a sus dos términos por igual— **queda descartada**: la medición del fader de 4.3 la habría amplificado, y cerró en 0,06 dB.

**La aplicación muestra la entrada**, no la salida: lo que le importa es el margen del previo, y ese no cambia porque alguien mueva un fader. El operador que compare con la barra de su consola va a ver un número más alto en la aplicación, por lo que baje el fader; la pantalla lo dice.

### 4.4 Lo que `VU2` sigue sin decir

La correspondencia entre lo que muestra el medidor y un **nivel digital real** no está medida, y a esta altura es lo **único** que falta. La recta de 4.3 da el número que ve el operador en su pantalla, que es lo que hace falta para hablar su mismo idioma; que ese número sean dBFS es otra afirmación, y la mide SPK-P0.10b con tonos de −20, −6 y −1 dBFS por un bucle físico calibrado.

Todo lo demás de 4.3 son **diferencias** —forma, recorrido, balística, respuesta en frecuencia, repetibilidad, techo— y las diferencias no dependen de la ganancia analógica del camino. Por eso quedaron contestadas sin el bucle y el nivel absoluto no.

De la cola de `VU2` está ubicada cada sección (§4.2) y el papel de cada byte **ya está medido en los dos bloques**: el subgrupo el 2026-09-09 y el efecto el 2026-09-12 por la medición 96a (`+0/+1` no siguen al fader del bus, `+2/+3` sí, y el medidor toma después del procesador). **Lo que sigue abierto es la otra mitad**: a cuántos dB equivale un escalón de esos bytes. La 96b los convierte con la escala del medidor de **canal**, que no está medida sobre este bloque, así que todas sus cifras en dB heredan esa suposición.

---

### 4.4.1 Los dos indicadores de saturación, y cuál mira cada uno

Medido leyendo `parseVUdata` en el `mixer.html`, el 2026-09-09:

```js
m = deconvertVU(a.charCodeAt(l+0));   // pre
n = deconvertVU(a.charCodeAt(l+1));   // entrada
q = deconvertVU(a.charCodeAt(l+2));   // salida
inStrips[g].setVU(n, q, 0, 0, r, 0, p, 0);   // clip sobre q  → la SALIDA
gainStrips[g].setVUPre(m);                    // clip propio sobre m → el PREVIO
```

| Indicador | Byte | Dónde lo dibuja la consola | Cómo se arregla |
|---|---|---|---|
| Clip del previo | `+0` | página de ganancia; **congela el deslizador de ganancia** mientras está encendido | bajando la ganancia del previo |
| Clip de la tira | `+2` | tira del canal | bajando el fader |

**El byte `+1` no tiene indicador de clip.** Es el que la aplicación estuvo contando: ni el que la consola vigila para el previo ni el que vigila para la tira. Son dos problemas distintos que se arreglan de manera distinta, así que contarlos juntos —o contarlos sobre un byte que la consola no mira— le da al asistente una señal que no corresponde a ninguna acción.

### 4.5 `RTA`: el analizador de espectro

**Medido el 2026-09-09.** Durante meses este flujo se usó solo como señal de vida y se tiraba la carga. No es un latido: es **el analizador de espectro de la consola**, y es la única fuente de información frecuencial que el proyecto tiene sin motor de audio ni micrófono propio.

Por qué se tardó en verlo: `parseVUAdata` y `parseRTAdata` hacen las dos un `slice(4)` sobre la carga, y `"VUA^"` y `"RTA^"` miden los dos cuatro caracteres. Leer el código de una y atribuírsela a la otra es un error de una línea que cuesta un hallazgo entero.

| Qué | Cuánto |
|---|---|
| Bandas | **122**, un doceavo de octava |
| Ley de bandas | `banda = 67 + 12·log2(f/1000)` |
| Alcance | ~20,9 Hz a ~22,6 kHz |
| Escala | **0,375 dB por byte** — no es la del medidor |

**Y la ley es la misma en las 122 bandas**, comprobado el 2026-09-10 con tonos
de 63 a 8000 Hz entrando al mismo nivel eléctrico y el analizador apuntado al
canal —o sea sin acústica en el medio—: el desvío contra 1 kHz no pasa de 0,3 dB
salvo a 63 Hz, donde son unos 2. `spikes/SPK-P0.5/evidence/ley-rta-por-frecuencia-2026-09-10.txt`.
| Cadencia | ~30 tramas por segundo |
| Balística | sube dentro de una trama —≤ 33 ms, no se resuelve más fino— y **cae con su propia rampa lineal**, ~5,2 bytes por trama, unos 59 dB/s. De 90 % a 10 % tarda ~536 ms |

**La caída del `RTA` viene en los datos, y la del medidor no.** Es una diferencia que importa y que el marco general de este documento no cubría: de `VU2` está medido que la consola manda el **nivel instantáneo** y que la balística la dibuja el cliente. Con el analizador es al revés — el suavizado ya viene hecho del otro lado del cable. En las mismas tramas, con el mismo corte de señal:

```
t=5296  rta=92  vu=112
t=5329  rta=86  vu=0      <- el VU cae de golpe
t=5362  rta=79  vu=0
...
t=5900  rta=0   vu=0      <- el RTA tarda ~600 ms
```

Quien suavice el espectro del lado de la aplicación estaría **apilando dos balísticas**. La detección de realimentación no lo hace: su regla —«no cayó como debía»— usa justamente esta caída como referencia.

**La fuente la elige `var.rta`, y es global.** No hay una por cliente: es una sola variable de la consola. **Llega en el volcado inicial** —`SETS^var.rta^`, medido el 2026-09-09—, así que el valor anterior se puede leer antes de tocarlo. Una nota anterior de este repositorio decía que la clave no existía en el volcado y estaba equivocada; sobre ella se apoyaba la costumbre de «restaurar» a cadena vacía, que es reconstruir y no devolver. Aceptan `i.N` y `m` —el general— y `a.0` no respondió.

**El general devuelve las mismas 122 bandas y con la misma ley**, medido el 2026-09-09: 125 Hz → banda 31, 500 → 55, 1000 → 67, 8000 → 103, idéntico a una entrada. Una nota anterior decía «el general devuelve 78 bandas y no 122»; era una lectura equivocada de la evidencia, que dice **«78 bandas con valor»** —o sea distintas de cero, porque el general no tenía energía en el resto—. Importa porque si fueran 78 bandas la ley tendría que ser otra, y no lo es: el mismo `frecuenciaDeBanda` sirve para las dos fuentes. Mientras esté vacía no llega espectro, solo la trama de vida.

Que sea global tiene una consecuencia de producto que no es del protocolo: **elegir la fuente del analizador le cambia la pantalla al operador**, en vivo y sin avisar. Está anotado como R-28 en el registro de riesgos. **Acá decía «no se escribe `var.rta` desde la aplicación en ningún nivel de autonomía», y era falso desde hacía días**: ADR-025 —la decisión del usuario, del 2026-09-09— autoriza tomarlo prestado con permiso una vez por sesión, y `analizador.service.ts` lo hace. Dos reglas contradictorias sobre la misma clave, y la que estaba muerta era ésta. Lo marcó una auditoría. Lo que rige: **se escribe sólo con permiso explícito, y se devuelve la fuente al valor leído del volcado**, nunca a una cadena vacía.

### 4.5.1 `i.N.stereoIndex`: qué canales van enlazados

Medido el 2026-09-09. Está en los 24 canales y dice la **posición dentro del par**, no un identificador de par:

| Valor | Significa |
|---|---|
| `0` | primer miembro; el compañero es el canal **siguiente** |
| `1` | segundo miembro; el compañero es el **anterior** |
| `-1` | sin enlazar |

Se corrobora solo: las entradas de línea, que son un par de verdad, valen `l.0 = 0` y `l.1 = 1`, igual que el reproductor. Del `mixer.html`: `setValue(this.name + "stereoIndex", 0)` y `setValue(this.linkTarget.name + "stereoIndex", 1)`, con `linkTarget = allStrips[this.id + 1]`.

**La consola no mantiene la relación.** Medido con la conexión testigo: escribir `i.4.stereoIndex = 0` no movió `i.5`. Las dos escrituras son independientes, así que un par a medias es un estado alcanzable y hay que leerlo como «no hay par».

**Enlazar es destructivo.** Antes de escribir las dos claves, el cliente oficial hace `copySettings()` sobre el izquierdo y `pasteSettings()` sobre el derecho: **el enlace pisa todos los ajustes del canal derecho**. La copia la hace el cliente y no la consola, así que escribir solo las dos claves no copia nada — pero dejaría un par que la consola dibuja enlazado con dos canales que suenan distinto. Por eso el adaptador solo lee.

### 4.6 Las constantes medidas, en un solo lugar

Cada una de estas salió de una medición contra el aparato o de leer el código de la consola, y cada una **está comprobada contra el código en cada integración** por `tools/docs/validate-numeros.mjs`. Si alguien cambia el valor en un lado y no en el otro, falla la integración en vez de sobrevivir hasta que alguien relea.

No es un detalle de proceso: el recorrido del medidor estuvo escrito como 84,5 dB en cuatro documentos durante horas, y lo que lo encontró fue una relectura, no una comprobación.

| Constante | Valor | Qué es |
|---|---|---|
| `MEDIDOR_RANGO_DB` | 80 | Recorrido del medidor, de 0 dB en la punta a −80 en el fondo |
| `MEDIDOR_SATURACION` | 1 | Posición normalizada donde la lectura deja de subir |
| `VU_CABECERA_BYTES` | 8 | Cabecera de la trama `VU2` |
| `VU_BYTES_POR_CANAL` | 6 | Paso de la sección de entradas —y **solo** de esa sección |
| `CORRECCION_PREVIO_DB` | −1.15 | Lo que el previo no entrega respecto de lo que su tabla promete |
| `CORRECCION_DESDE_DB` | 26 | Desde qué ganancia aparece ese déficit |
| `RETENCION_PICO_MS` | 3000 | Cuánto sostiene el pico antes de caer. `CLIP_HOLD_TIME = PEAK_HOLD_TIME = 3E3` en el `mixer.html`: **tres segundos**. Estuvo escrito como 3 —error de factor mil— con un comentario que lo explicaba y lo hacía sonar razonable |

## 5. Rutas confirmadas contra el aparato

Siete controles movidos a mano desde la interfaz web de la consola, uno por vez, con una instantánea guardada antes. La sesión no escribió nada: solo registró qué clave cambiaba.

| Control | Ruta | Verbo | Valores observados |
|---|---|---|---|
| Fader de canal 1 | `i.0.mix` | `SETD` | 0,4131477793 → 0,5916673729 |
| Silencio de canal 1 | `i.0.mute` | `SETD` | `1`, después `0` |
| Ganancia de canal 1 | `hw.0.gain` | `SETD` | 0,4887160521 → 0,6396594483 |
| Panorama de canal 1 | `i.0.pan` | `SETD` | 0,05952380952 → 0,9047619048 |
| Nombre de canal 1 | `i.0.name` | `SETS` | `GTR GAB` → `PRUEBA` |
| Envío al auxiliar 1 | `i.0.aux.0.value` | `SETD` | 0,3182915842 → 0,4703894863 |
| Fader general | `m.mix` | `SETD` | 0,4896067302 → 0,6347446112 |

La ganancia de entrada cuelga del espacio de hardware, `hw.N.gain`, no del canal. Ya estaba así en la matriz y en `clasificar-ruta.ts`; lo que agrega esta medición es la comprobación contra el aparato.

**Granularidad:** mover un fader produjo 118 mensajes en unos nueve segundos. La consola emite el valor de forma continua mientras se arrastra el control, sin agrupar: unas trece actualizaciones por segundo por control movido.

### 5.1 Cómo se comporta una escritura, medido el 2026-09-08

Una sesión posterior sí escribió, desde un script de spike y no desde la aplicación —el nivel de autonomía sigue en OBSERVE—, en `i.9.mute` y en `i.9.mix`. Es el criterio 3 de SPK-P0.1.

**Forma.** Escribir usa **el mismo envoltorio socket.io que todo lo demás**: `3:::SETD^ruta^valor`. Sin él la consola ignora el mensaje. Se probaron cinco variantes —con y sin envoltorio, con decimal, con `@` delante, con `INIT` previo— y la que funciona es la de siempre. **No hace falta ningún `INIT` previo** para que la escritura sea aceptada.

**Qué hace la consola con ella**, y son tres hechos distintos:

| | |
|---|---|
| ¿La aplica? | **Sí.** Un `INIT` posterior trae el valor nuevo a los ~100 ms |
| ¿Se la devuelve a quien escribió? | **No.** Seis segundos escuchando, cero líneas para esa ruta |
| ¿Se la manda a los demás clientes? | **Sí.** La aplicación conectada en la tablet lo registró en el mismo instante |

La consola aplica la escritura y no se la devuelve a quien la hizo, pero sí la difunde al resto. Con eso, **un cliente solo puede verificar su propia escritura de dos maneras**: pidiendo `INIT`, que trae el valor nuevo y con él el volcado entero —del orden de seis mil claves—, o **abriendo una segunda conexión que haga de testigo**. Lo segundo estaba anotado como pregunta y el 2026-09-09 quedó medido: dos conexiones del mismo proceso son dos clientes distintos para la consola, y el testigo ve la escritura a los **27 ms**. Qué se considera «aplicado» a partir de esto lo decide SPK-ACK-POLICY, que con este dato ya eligió.

Se escribió además en `i.9.dyn.bypass` y `i.9.gate.enabled` para puentear el procesamiento del canal antes de medir su medidor. Las dos claves existen y aceptan escritura; su efecto se verificó de forma indirecta, por lo que le pasó a la recta del §4.3, y no se midió ninguna curva ni ningún rango.

### 5.2 Las seis que faltaban, medidas el 2026-09-10

Nueve escrituras desde un guion, cada una con su valor anterior leído por
`GET /raw` antes, confirmada por una **segunda conexión testigo**, restaurada en
el acto y comprobada de nuevo por HTTP. Nueve de nueve difundidas, nueve de
nueve restauradas. Mediana de difusión 13 ms, mínimo 4, máximo 29 ms.
Evidencia: `spikes/SPK-P0.2a/evidence/capacidades-que-faltan-2026-09-10b.txt`.

| Qué | Ruta | Verbo | Qué se midió |
|---|---|---|---|
| Silencio de envío auxiliar | `i.N.aux.B.mute` | `SETD` | booleano, escrito y difundido |
| Derivación antes o después del fader | `i.N.aux.B.post` | `SETD` | booleano, escrito y difundido |
| Derivación antes o después del proceso | `i.N.aux.B.postproc` | `SETD` | booleano, escrito y difundido |
| Punto de derivación global | `settings.auxsendpoint`, `settings.mtxsendpoint` | `SETD` | booleano, escrito y difundido |
| Matriz con el general como fuente | `m.mtx.B.value`, `m.mtx.B.mute` | `SETD` | escritos y difundidos |
| Retardo general por lado | `m.delayL`, `m.delayR` | `SETD` | aceptan 0,25 y lo difunden. **Unidad sin medir** |
| Retardo de salida auxiliar | `a.B.delay` | `SETD` | igual: ruta sí, unidad no |
| Alimentación fantasma | `hw.N.phantom` | — | **solo lectura**, por INV-007 |

**`i.N.phantom` existe y no es lo mismo que `hw.N.phantom`.** Con el condensador
del puerto 9 alimentado, `hw.8.phantom` valía 1 y `i.8.phantom` valía 0 en el
mismo instante. **Ojo con citar `js/initparams.js` como corroboración**: no son
valores de fábrica sino el estado actual, así que confirma tanto como volver a
leer `/raw`. La alimentación fantasma vive en el previo y **hay
que resolver antes qué previo alimenta al canal**: `i.N.src` no es la identidad.
Leer la ruta del canal devuelve «sin fantasma» sobre un micrófono alimentado.

**La matriz no es `hwoutaux.N.src`.** Esa familia dice qué bus sale por cada
conector físico —el patchbay de salida—. La matriz es `<fuente>.mtx.<destino>.*`
y la alcanzan **19 fuentes**: los diez auxiliares, los seis subgrupos, el
general y **solo dos de los veinticuatro canales, `i.9` e `i.19`**. Esas dos son
además las únicas fuentes cuyo envío a la matriz **no tiene `postproc` propio**.

**El ajuste global de derivación no reescribe los de cada envío.** Al cambiar
`settings.auxsendpoint`, la consola difundió **cero** rutas más: los dos niveles
conviven en el estado. Cuál manda en el audio no se puede deducir de esto y
queda para SPK-P0.2b, que sí puede escuchar la diferencia.

---

## 6. Curvas de conversión

Extraídas del `mixer.html` que sirve la consola: **54 funciones**, con sus inversas donde existen y con las tablas de las que dependen. Es el paso 2 de SPK-P0.2b.

**Qué garantizan y qué no.** Son las conversiones que la consola usa para *dibujar* su interfaz, así que nuestra lectura coincide con la que ve el operador. Que ese número corresponda a un nivel físico lo mide SPK-P0.10b.

### 6.1 Fader

```js
VtoLIN(v) = 2.676529517952372e-4
          * exp(v*(23.90844819639692 + v*(-26.23877598214595
                 + (12.195249692570245 - 0.4878099877028098*v)*v)))
          * (v < 0.055 ? sin(28.559933214452666*v) : 1)
dB = 20*log10(VtoLIN(v))
zeroDbPos = 0.7647058823529421
```

**El rango es de −inf a +10 dB, no a 0.** Los puntos caen en múltiplos de 1/17: 0 dB en 13/17, −10 dB en 9/17, −60 dB en 1/17.

| dB | posición | dB | posición |
|---|---|---|---|
| −60 | 0,058824 | −3 | 0,685589 |
| −40 | 0,186230 | **0** | **0,764706** |
| −30 | 0,269355 | +3 | 0,843756 |
| −20 | 0,376506 | +6 | 0,916539 |
| −10 | 0,529412 | +10 | 1,000000 |
| −6 | 0,612728 | | |

No tiene inversa cerrada; se invierte por bisección. La ida y vuelta cierra dentro de 1e-9 dB.

### 6.2 Ganancia de entrada

La consola **no aplica una fórmula: indexa una tabla** de 64 entradas (`ui24pgains`). Por eso la ganancia es **escalonada**, con 48 valores distintos:

```
-6 -4 -2 0 2 4 6 8 10 12 14 16 18 20 22 24 26     (de 2 en 2 dB)
27 28 29 ... 57                                    (de 1 en 1 dB)
```

Ida y vuelta sobre los escalones: **exacta**, error 0 dB sobre un rango de 63 dB. El criterio 6 de SPK-P0.2b pide 1 % o menos.

> **Encadenar las dos conversiones de la consola no da el escalón más cercano.** `GAIN24toV` reparte el recorrido en 63 partes y `VtoGAIN24` trunca sobre 64 índices; el desajuste desplaza el resultado hasta **1,97 dB por debajo** y hasta **0,98 dB por encima**. Pedir +11,5 dB aterriza en +10. El sesgo es mayormente hacia abajo pero no siempre: 9,75 dB sube a 10. Para elegir bien está `rawParaGananciaMasCercana()`.

**Consecuencia para el asistente de ganancia:** una recomendación de «subí 1,5 dB» en la mitad baja del recorrido **no se puede ejecutar**, porque ahí no hay medio escalón. Hay que redondear al escalón alcanzable y decirlo en la pantalla.

### 6.3 Otros rangos

Obtenidos ejecutando las funciones extraídas del código de la consola.

**«No probado» y «refutado» no son lo mismo, y este encabezado los confundía.**
Decía «ninguno probado contra el aparato», que después del 2026-09-12 es falso
para dos filas: las dos del compresor se probaron **y no pasaron**. Un lector
que ve «no probado» supone que la fórmula es lo mejor que hay; con «refutado»
sabe que usarla es peor que no tener nada. Lo encontró una auditoría de
coherencia.

| Parámetro | Rango | Función | Estado |
|---|---|---|---|
| Frecuencia de ecualizador | 20 Hz … 22 050 Hz | `20·1102,5^V` | sin probar |
| Q | 0,05 … 15 | `0,05·300^V` | sin probar |
| Umbral de compresor | −90 … +6 dB | lineal | **REFUTADA** por la medición 97 (2026-09-12). El rango de esta fila *es* la fórmula refutada evaluada en 0 y en 1, así que tampoco es un rango medido |
| Relación de compresor | — | `1/V` | **REFUTADA** en su forma. El **sentido** sí está medido: el crudo 1 no comprime |

---

## 7. Concurrencia y reconexión

- **La consola acepta al menos tres sesiones a la vez** sin rechazar ninguna ni degradar el volcado. Probado dos veces, en sesiones distintas.
- **Tres clientes simultáneos, con el estado quieto** (2026-09-08, 120 s): mismas claves y misma huella SHA-256 en los tres. Demuestra que el volcado es determinista, no que no se pierda estado.
- **Tres clientes simultáneos, con uno escribiendo** (2026-09-09): los tres recibieron **6 087 claves** y la **misma huella exacta**. Y con los tres conectados, **el que escribe ve 0 líneas de su propia escritura mientras los otros dos ven 1 cada uno.** Es la regla del §5.1 confirmada con tres testigos a la vez: la difusión llega a todo el mundo menos al origen, y llega **una sola vez**, sin repeticiones ni pérdidas. La prueba duró minutos y no los diez que pide el criterio 5 de SPK-P0.1, así que el criterio sigue abierto.
- **Dos conexiones del mismo proceso son dos clientes distintos para la consola.** Medido el 2026-09-09: se escribe por una y la otra recibe el cambio a los **27 ms**. Es lo que faltaba para que la opción de la segunda conexión testigo dejara de ser una pregunta; ver SPK-ACK-POLICY.
- **Reconexión, piso del protocolo:** 20 de 20 ciclos de apretón de manos a volcado completo, entre 112 y 158 ms, desde una laptop por cable y sin cortar nada.
- **Reconexión real tras cortar la red inalámbrica**, desde la tablet: 20 de 20 ciclos, **mediana 3,7 s**, mínimo 3,7 y máximo 5,0, todos por debajo del umbral de 10 s del criterio 1 de SPK-P0.1. Faltan los otros dos modos de corte.

---

## 8. Lo que este documento no dice

Cada línea es un criterio bloqueante sin medir. Se listan para que la ausencia no se lea como verificación.

- **La calibración absoluta de los medidores** (SPK-P0.10b, criterios 1 y 2). La forma de la escala, su recorrido, su balística, su respuesta en frecuencia y su techo ya están medidos; la correspondencia con dBFS necesita un bucle calibrado, sin ganancia analógica desconocida en el medio.
- **La reconexión con cortes de red reales en los otros dos modos**: apagar el router y cambiar la IP de la tablet. El corte de red inalámbrica sí está medido, 20 de 20 ciclos.
- **La transición de señal a silencio en `VU2`.**
- **A cuántos dB equivale un escalón de los bytes de un bloque de subgrupo o de efecto.** Qué byte es el nivel y si hay previo y posterior **ya está medido** —el subgrupo el 2026-09-09, el efecto el 2026-09-12 por la 96a—, y este punto pedía las dos cosas. Falta la escala: la 96b convierte esos bytes con la del medidor de canal, que no está medida sobre este bloque.
- **El mapeo `canal → entrada física` con el enrutamiento cambiado.** Medido el 2026-09-09: `src` vale `hw.0`…`hw.19` en los canales 1 a 20 y **`none` en el 21 al 24**, o sea que la segunda mitad de la frase vieja —«`i.N` y `hw.N` coinciden»— es falsa para esos cuatro. Con el enrutamiento por defecto coinciden en los veinte primeros y por eso es fácil no notar la diferencia; el código sigue armando `hw.${canal-1}` (R-24).
- **Todo lo de SPK-P0.2b y P0.2c:** ecualizador, compresor, puerta, deesser, salidas, retardos, matriz, instantáneas, reproductor, grabación.
