# Especificación del protocolo Ui24R

**Versión 1.** Resultado de la sesión con hardware del **2026-09-08** (ADR-016). Todo lo que sigue está medido contra una consola real salvo donde diga lo contrario, y donde no esté medido lo dice.

**Consola de referencia:** modelo `ui24`, firmware **`3.4.8318-ui24`**, `type=8ch`, `schema=6`, `flavour=1`.
**Topología que publica la consola** (`curSetup` en `js/initparams.js`): `input:24, aux:10, sub:6, fx:4, linein:2, phantom:20, bankSize:8, rec:true`.

Este documento describe **lo que la consola hace**. Lo que la aplicación tiene permitido hacer con eso está en [autonomy-matrix.md](autonomy-matrix.md) y [safety-invariants.md](safety-invariants.md). Nivel actual: OBSERVE, la aplicación no escribe.

---

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

## 3. Volcado de estado

Al abrir el socket la consola manda su estado completo, sin pedirlo. `INIT` lo vuelve a pedir.

| | |
|---|---|
| claves distintas | **6 665** |
| líneas `SETD` / `SETS` | 6 025 / 640 |
| reparto | ~220 mensajes de ~2 KB |
| tiempo hasta el volcado completo | **112–158 ms**, mediana 118 ms, 20 de 20 ciclos |

Prefijos de clave por cantidad: `i` 3252, `a` 1330, `s` 612, `f` 452, `l` 246, `p` 228, `m` 171, `hw` 80, `var` 51, `settings` 45, `mtk` 44, `v` 36, `usbdaw` 32, `casc` 32, `vg` 12, `hwoutaux` 10, `mg` 6, `iso` 6, `hwouthpdsp` 4, `hwouthp` 4, `automix` 3, `hwoutm` 2, más siete claves sueltas de identidad: `firmware`, `model`, `type`, `schema`, `flavour`, `mgmask`, `afs.enabled`.

> **El firmware solo se conoce después de conectarse.** No está expuesto por HTTP: `version.txt`, `VERSION`, `js/version.js`, `firmware.txt`, `info.json`, `/api/version` y `sel/version.js` devuelven todas `301`. Aparece como una clave más de este volcado. Es un problema de orden para INV-033, que deshabilita escrituras si el firmware no coincide con la matriz: cuando hace falta la decisión, todavía no hay dato.

**No se observó ninguna marca de fin de volcado.** El adaptador espera una línea `DUMP_END` que **esta consola no manda**. Hay que detectarlo por conteo o por quietud, no por centinela.

---

## 4. Medidores

### 4.1 `VU2` no es un flujo: la consola lo calla en silencio

| | consola en silencio, 30 s | música por las RCA, 90 s |
|---|---|---|
| `VU2` | **1 trama** | **1 932 tramas** |
| `VUA` | 1 | 1 (los auxiliares seguían en silencio) |
| `RTA` | 905, a 30,2 Hz | 2 569, a 30,0 Hz |

Con `INIT` a los 3 s llegó exactamente **una** `VU2` más. O sea: `VU2` viaja con el volcado de estado, y además fluye mientras haya algo que medir.

No hay comando de suscripción a medidores: ninguno de los dieciséis comandos del cliente oficial los pide. `settings.disableVUs` es una preferencia **del cliente**, que filtra en `parseVUdata()`.

**Cadencia de `VU2` con señal:** n=1932, media 44,3 ms, mediana 34 ms, percentil 95 68 ms, mínimo 0 ms, máximo 100 ms. Umbral de inestabilidad por la fórmula del charter, tres veces la media: **≈133 ms**.

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
| `+0` | nivel previo a la ganancia del previo |
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

**Sin decodificar:** la sección posterior a las entradas —media, auxiliares, efectos—. Los 145 bytes restantes no cierran en múltiplo de 6 con la lectura de arriba y el patrón resultante parece desalineado. Queda sin afirmar.

### 4.3 De posición a decibeles: el medidor es lineal, y no usa la ley del fader

Leído del `mixer.html` de la consola el 2026-09-08. Son dos piezas y juntas no dejan otra lectura posible:

```js
VU_RANGE = 80
vuPosMark(dB, h) = -dB * h / VU_RANGE     // donde va cada marca de la escala
paint()          { c = h * this.value }   // alto de la barra, proporcional a la posicion
```

Si la barra es proporcional a la posición y las marcas están espaciadas linealmente en decibeles, la correspondencia es una recta:

```
dB = VU_RANGE · posicion − VU_RANGE       // 0 dB en la punta, −80 en el fondo
```

Un escalón del byte son `80 × 0,004167` = **0,333 dB**.

**Comprobado contra el aparato en dos puntos independientes**, con la consola en `192.168.0.78`:

| Fuente | Byte | Según esta recta | Lo que mostraba la consola |
|---|---|---|---|
| Guitarra en el canal 1 | entrada 225 | −5,0 dB de entrada; con el fader en −6,9 dB, **−11,9 a la salida** | ≈ −12 dB |
| Música por las RCA (21 y 22) | salida 102 | **−46 dB** | barra en −45 aprox. |

Antes de esto el adaptador convertía con la ley del fader, sobre la hipótesis —escrita como tal— de que la consola dibuja sus medidores con la misma regla que sus faders. **Es falsa.** Con esa ley el byte 225 daba +4,6 dB, recortado a +10 en pantalla.

**Qué medidor dibuja cada widget**, de `parseVUdata` y `setVU`:

| Widget | Byte | Nota |
|---|---|---|
| Barra de la tira | `+2` salida | `setValueExt(a, b)` guarda `this.value = b` |
| Fantasma de la tira | `+1` entrada | el segundo valor de `setValueExt` |
| Página de ganancia | `+0` pre | `setVUPre(m)` |

**Saturación:** `setVU` hace `1 <= b ? this.clip.clip() : ...`, y `setVUPre` lo mismo con el pre. Satura cuando la barra llega a la punta, o sea a 0 dB. No hace falta —ni conviene— elegir un umbral propio.

**Comprobación cruzada del modelo entero.** Si la barra es la salida y el fantasma la entrada, la diferencia entre las dos tiene que ser exactamente el fader del canal. Medido el 2026-09-08 con música por las RCA:

| Canal | Entrada | Salida | Diferencia | `i.N.mix` |
|---|---|---|---|---|
| 21 | −22,7 dB | −34,3 dB | 11,7 dB | −11,6 dB |
| 22 | −21,7 dB | −33,3 dB | 11,7 dB | −11,5 dB |

Una décima de decibel. La recta de conversión, el reparto de bytes y la ley del fader quedan comprobados a la vez, y con una fuente que no hizo falta calibrar.

**La aplicación muestra la entrada**, no la salida: lo que le importa es el margen del previo, y ese no cambia porque alguien mueva un fader. El operador que compare con la barra de su consola va a ver un número más alto en la aplicación, por lo que baje el fader; la pantalla lo dice.

### 4.4 Lo que `VU2` sigue sin decir

La correspondencia entre lo que muestra el medidor y un **nivel digital real** no está medida. La recta de 4.3 da el número que ve el operador en su pantalla, que es lo que hace falta para hablar su mismo idioma; que ese número sean dBFS es otra afirmación, y la mide SPK-P0.10b con tonos de −20, −6 y −1 dBFS por un bucle físico.

---

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

Obtenidos ejecutando las funciones extraídas. **Ninguno probado contra el aparato**: salen del código de la consola.

| Parámetro | Rango | Función |
|---|---|---|
| Frecuencia de ecualizador | 20 Hz … 22 050 Hz | `20·1102,5^V` |
| Q | 0,05 … 15 | `0,05·300^V` |
| Umbral de compresor | −90 … +6 dB | lineal |
| Relación de compresor | — | `1/V` |

---

## 7. Concurrencia y reconexión

- **Tres clientes simultáneos** durante 120 s: las mismas 6 665 claves y la misma huella SHA-256 en los tres. **Vale poco**: el estado no cambió durante la ventana, así que demuestra que el volcado es determinista, no que no se pierda estado. La prueba que pide el criterio 5 de SPK-P0.1 necesita cambios ocurriendo, tres clientes distintos y diez minutos.
- **La consola acepta al menos tres sesiones a la vez** sin rechazar ninguna ni degradar el volcado.
- **Reconexión:** 20 de 20 ciclos de apretón de manos a volcado completo, entre 112 y 158 ms. Es el piso del protocolo desde una laptop por cable, **no** la reconexión de una tablet tras un corte de red, que es lo que pide el charter.

---

## 8. Lo que este documento no dice

Cada línea es un criterio bloqueante sin medir. Se listan para que la ausencia no se lea como verificación.

- **Si la consola devuelve eco de las escrituras propias** (SPK-P0.1, criterio 3). Exige escribir. Nivel OBSERVE: no se hizo.
- **La calibración y la balística de los medidores** (SPK-P0.10b entero). Necesita tonos y bucle físico.
- **La cadencia de medidores desde la tablet.**
- **La reconexión con cortes de red reales.**
- **La transición de señal a silencio en `VU2`.**
- **La sección de `VU2` posterior a las entradas.**
- **El mapeo `canal → entrada física` con el enrutamiento cambiado.** `i.N.src` existe en el espacio de claves; con el enrutamiento por defecto `i.N` y `hw.N` coinciden y por eso es fácil no notar la diferencia.
- **Todo lo de SPK-P0.2b y P0.2c:** ecualizador, compresor, puerta, deesser, salidas, retardos, matriz, instantáneas, reproductor, grabación.
