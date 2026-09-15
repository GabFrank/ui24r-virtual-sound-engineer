# Guía de pruebas manuales

Qué hay que probar a mano contra hardware real, qué se probó ya, y qué falta. Los tests
automáticos cubren la lógica; esta guía cubre lo que solo se ve con una consola y un teléfono
delante.

**Última pasada:** 2026-09-09 de madrugada, sesión local con hardware.
**Montaje de esa pasada:** Ui24R en `192.168.0.78` con firmware `3.4.8318-ui24`, Motorola Edge
60 Pro con Android 16, y una fuente de nivel conocido desde la iMac por una Focusrite Scarlett
al canal 10 —rutas `i.9`—.
**Pasada anterior:** 2026-09-08, con la consola en `192.168.0.49`, compilación local
`0.2.0-local.6` y música por las entradas RCA.

## Cómo leer los estados

- ✅ **Probado** contra hardware, con evidencia archivada.
- 🟡 **Probado a medias**: se midió algo, pero no lo que el criterio pide de verdad.
- ⬜ **Sin probar.**
- 🚫 **No se puede probar todavía** con el nivel de autonomía actual.

> **La regla que ordena esta guía:** la aplicación está en nivel OBSERVE y **no escribe ningún
> parámetro**. Todo lo marcado 🚫 lo está por eso, no por falta de tiempo. Subir de nivel es una
> decisión con su propia ceremonia, no un paso de esta guía.

---

## 1. Conexión con la consola

| # | Qué probar | Estado | Cómo, y qué se vio |
|---|---|---|---|
| 1.1 | La app conecta con una Ui24R real | ✅ | Ajustes → Dirección `192.168.0.49` → Conectar. La tarjeta pasa a «Conectada» y la cabecera a CONECTADO |
| 1.2 | Llega el volcado completo | ✅ | La insignia pasa a **ESTADO CONFIRMADO** unos 500 ms después de conectar. **El tamaño no es constante entre sesiones**: 6 665 claves el 2026-09-08 y 6 087 el 2026-09-09, con la misma consola y el mismo firmware. Dentro de una sesión sí es estable, hasta la huella. Nada puede detectar el fin del volcado contra un número escrito a mano |
| 1.3 | Los nombres de canal son los de la consola | ✅ | Se leyeron `BAJO OKU`, `GRT BRUNO`, `GTR BELTRAN`, `VOZ MARCOS`, `VOZ JOSE` |
| 1.4 | Las ganancias caen en escalones válidos | ✅ | 14, 12, 28, −6, 24 dB: todos son escalones de la tabla de la consola |
| 1.5 | La conexión no parpadea a inestable estando quieta | ✅ | 25 s sin un solo cambio de estado. Antes, con el vigilante sobre `VU2`, se habría marcado inestable en el primer silencio |
| 1.6 | El campo Dirección rechaza una URL con ruta | ✅ | Pegar `192.168.0.49/socket.io/...` da error de validación |
| 1.7 | Una preferencia vieja `ws://10.10.1.1` se migra sola | ✅ | El campo mostró `192.168.0.49` partiendo de `ws://192.168.0.49` guardado |
| 1.8 | **Reconexión tras cortar la red**, 20 ciclos por modo | 🟡 | Criterio 1 de SPK-P0.1, y va **un modo de tres**. **Wifi cortada: 20 de 20** el 2026-09-09, cortes de 6 s, cronometrando desde que vuelve la wifi hasta que la app dice CONECTADO: mediana 3,7 s, mínimo 3,7, máximo 5,0, todos por debajo del umbral de 10 s. Faltan **apagar el router** y **cambiar la IP del teléfono**, que rompen cosas distintas: el router se lleva además la concesión de DHCP, y el cambio de IP deja el socket vivo apuntando a una ruta muerta, que es donde un cliente se puede quedar esperando para siempre |
| 1.9 | Cadencia **medida desde el teléfono** | ✅ | 2026-09-08, con la consola en `192.168.0.78`: `RTA` a 33 ms de media y p95 40 ms, igual en silencio que con guitarra. `VU2` pasó de 1 231 ms a 44 ms. Antes la prueba medía sólo `VU2` y por eso no contestaba el criterio 4 |
| 1.10 | Tres clientes a la vez **con cambios ocurriendo** | 🟡 | Dos corridas. Con el estado quieto, 120 s: coincidieron. Con uno escribiendo, el 2026-09-09: los tres recibieron 6 087 claves y la **misma huella exacta**, y **el que escribe vio 0 líneas de su propia escritura mientras los otros dos vieron 1 cada uno**. Falta la corrida de **10 minutos con cambios ocurriendo todo el tiempo**, y con app + navegador + teléfono en vez de tres conexiones de la misma sonda |
| 1.11 | Una segunda conexión del mismo aparato hace de testigo | ✅ | 2026-09-09: la consola las trata como **dos clientes distintos** y el testigo ve la escritura a los **27 ms**. Es el mecanismo que SPK-ACK-POLICY eligió para confirmar escrituras. Falta probarlo **sostenido**: qué le hace a la batería y a la cadencia tener dos sesiones abiertas durante horas (R-26) |
| 1.12 | Conectar con la consola apagada da un error que se entiende | ⬜ | |
| 1.13 | Conectar a una IP que no es una consola | ⬜ | |

## 2. Medidores

| # | Qué probar | Estado | Cómo, y qué se vio |
|---|---|---|---|
| 2.1 | Los medidores se mueven con señal real | ✅ | 2026-09-08: guitarra en el CH 1 y música por las RCA. Los decibeles coinciden con los de la consola desde que la conversión se tomó de su propio `mixer.html` |
| 2.2 | La señal aparece en el canal correcto | ✅ | Música solo por RCA → nivel solo en los canales 21 y 22. Antes la app leía doce canales y esos dos ni se mostraban |
| 2.3 | **Qué pasa en la pantalla cuando se hace silencio** | ⬜ | Importante: la consola **deja de mandar `VU2`**. Hay que ver que la app no diga que se cayó la conexión ni congele un pico viejo sin decirlo |
| 2.4 | Reiniciar picos | ⬜ | **La retención de picos es decisión nuestra**, no algo heredado: está medido que la consola manda nivel instantáneo y que la balística la dibuja su cliente. Lo que haya que probar acá sale de la constante que elijamos, no de la de la consola |
| 2.5 | **Recorrido de la escala del medidor** | ✅ | 2026-09-09: **80 dB**, medidos moviendo el fader —ganancia digital, sin cadena analógica en el medio—, con el medidor de entrada clavado en −20,76 dB de testigo. 114,7 escalones de byte contra 38,19 dB de la ley de fader: cierra en 0,06 dB. **Estuvo escrito 84,5 durante unas horas y era falso** |
| 2.6 | Calibración contra nivel real, en dBFS | ⬜ | Lo único que le queda a SPK-P0.10b. Necesita tonos de −20, −6 y −1 dBFS por un **bucle físico calibrado**, sin perilla desconocida en el medio. Con una fuente externa no se puede: mide la cadena, no el medidor |
| 2.7 | Balística: tiempos de subida y caída | ✅ | 2026-09-09, cinco ráfagas de 1 200 ms a −15 dBFS: subida **0 ms** —no se resuelve, llega a la meseta dentro de una sola trama— y caída de 20 dB con mediana **37 ms**, mínimo 33, máximo 66. Nada por debajo de la cadencia de ~44 ms se puede afirmar |
| 2.8 | Ponderación por frecuencia | ✅ | 2026-09-09: mismo nivel a 100 Hz, 1 kHz y 10 kHz dio bytes 160,3 / 160,7 / 160,0, o sea **0,23 dB de dispersión**. No hay ponderación apreciable. La medición incluye la cadena analógica, que también es plana |
| 2.9 | Techo del medidor | ✅ | 2026-09-09. **La primera medición dio 239 y estaba mal**: el byte 239 era donde saturaba la **interfaz de audio**, no el medidor: se había medido con fuente externa y ganancia al máximo, o sea la cadena entera. El tope del número que manda la consola es **255**; el byte 240 es la posición 1 (0 dB) y **los bytes 240 a 255 informan de +0,02 a +5,0 dB**. Sí hay margen arriba. Medido dos veces por separado subiendo el **fader** —ganancia digital, sin nada analógico en el medio— en `docs/spikes/SPK-P0.10b/evidence/techo-medidor-2026-09-09.txt`. Lo que sí vale es que la posición 1 —byte 240— es donde la consola enciende su clip |
| 2.10 | Repetibilidad de una lectura | ✅ | 2026-09-09, el mismo tono en tres corridas separadas: bytes 69,9 / 69,1 / 70,0, **0,3 dB de dispersión**. Es el piso contra el que hay que comparar cualquier diferencia que se quiera llamar significativa |

## 3. Lectura del estado

| # | Qué probar | Estado | Cómo, y qué se vio |
|---|---|---|---|
| 3.1 | Un cambio hecho en la consola aparece en la app | ⬜ | Mover un fader desde `mixer.html` y ver que la app lo refleja como cambio externo |
| 3.2 | Silenciar un canal en la consola se ve en la app | ⬜ | |
| 3.3 | Cambiar un nombre de canal se ve en la app | 🟡 | El nombre correcto ya se lee: con `PRUEBA` en el CH 1 de la consola, la app muestra `1 PRUEBA`. Falta ver que un renombre **en caliente** se refleje sin reconectar |
| 3.4 | Releer el estado, ahora por `INIT` | ⬜ | Antes reconectaba, y **eso ya no funcionaba** con un identificador de sesión de un solo uso |
| 3.5 | Una avalancha de cambios invalida el estado (INV-021) | ⬜ | Cargar una instantánea distinta desde la consola |
| 3.6 | La ganancia y el fader se muestran **sin** el «≈» | ✅ | Se vio «Ganancia 14», no «≈14». La marca vuelve sola si alguien pone `VERIFICADO_CONTRA_CONSOLA` en falso |

## 4. Escritura

| # | Qué probar | Estado | Por qué |
|---|---|---|---|
| 4.1 | Eco de las escrituras propias | 🚫 | Criterio 3 de SPK-P0.1, y **ya está contestado: no hay eco**. Pero se contestó con un script de spike, no con la aplicación, así que como prueba *de la app* sigue sin poder hacerse. Lo que la app tendrá que probar el día que escriba es el mecanismo elegido: la **segunda conexión testigo**, 27 ms |
| 4.2 | Ida y vuelta de un parámetro escrito | 🚫 | SPK-P0.2b, paso 5 |
| 4.3 | Que ninguna otra ruta cambie al escribir | 🚫 | SPK-P0.2b, criterio 8 |
| 4.4 | Del envío a monitor, que sólo se escriba el nivel del canal y sólo fuera del show (INV-010, reescrita por ADR-028) | 🚫 | Se prueba cuando haya escritura que probar. **Esta fila decía «que ningún envío de monitor se toque nunca»**, que dejó de ser cierto el 2026-09-12 |

## 5. Aplicación en el teléfono

| # | Qué probar | Estado | Cómo, y qué se vio |
|---|---|---|---|
| 5.1 | Una compilación local reemplaza a la instalada sin desinstalar | ✅ | Con la clave de publicación, `adb install -r`. La huella tiene que dar `8db45d3f…5325` |
| 5.2 | El WebView se puede inspeccionar | ✅ | `chrome://inspect`, o CDP por `adb forward tcp:9222 localabstract:webview_devtools_remote_<pid>` |
| 5.3 | **La base de datos local abre** | ✅ | Corregido el 2026-09-08: la migración abría un `BEGIN;` dentro de la transacción del complemento y ninguna se aplicaba. Ahora el registro muestra tres `migracion_aplicada` y `base_abierta` |
| 5.4 | Ajustes → Diagnóstico exporta su informe | ⬜ | |
| 5.5 | Buscar actualizaciones | ⬜ | |
| 5.6 | Paro de emergencia | ⬜ | |
| 5.7 | La app se comporta con la pantalla apagada o en segundo plano | ⬜ | Importa: el WebView estrangula temporizadores, y el vigilante de conexión usa 300 ms |

## 6. Trampas que ya costaron una sesión

Cosas que no se ven en el navegador de escritorio y que hicieron perder tiempo. Si algo «no
conecta» en otra máquina, mirar acá primero.

1. **`https://localhost` no puede abrir un `ws://`.** Capacitor sirve la app por https por
   defecto y el navegador prohíbe el socket en claro:
   `SecurityError: Failed to construct 'WebSocket'`. Se resolvió con
   `server.androidScheme: 'http'`. Ojo: `androidScheme` va bajo `server`, **no** bajo `android`,
   y puesto en el lugar equivocado no falla, simplemente no hace nada.
2. **`allowMixedContent: true` no alcanza.** Destraba la construcción del socket, pero `fetch()`
   es contenido mixto activo y Blink lo bloquea igual.
3. **Android prohíbe el tráfico en claro desde la versión 9.** Sin
   `network_security_config.xml` cualquier pedido a la consola muere con
   `net::ERR_CLEARTEXT_NOT_PERMITTED`.
4. **Cambiar el esquema cambia el origen, y eso vacía el almacenamiento web.** Las preferencias
   de `localStorage` se pierden una vez. La base SQLite no: es nativa.
5. **Una compilación local es `0.0.0` a propósito**, así que instalar sobre una versión
   publicada es un downgrade y Android lo rechaza. Se compila con
   `-PvseVersionCode=<mayor> -PvseVersionName=<algo>`. El `-d` de `adb install` **no** alcanza
   si lo instalado es un build de publicación.
