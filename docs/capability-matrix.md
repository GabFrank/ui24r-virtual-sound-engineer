# Matriz de capacidades del protocolo Ui24R

**Versión 1.** Derivada de la auditoría técnica contra `soundcraft-ui-connection` v7.0.3, y **con las filas marcadas en la columna *Probado* verificadas contra una consola real los días 2026-09-08 y 2026-09-09** (sesiones locales con hardware, SPK-P0.1, SPK-P0.2a y la parte de SPK-P0.10b que no necesita un bucle calibrado: escala, recorrido, balística, tasa, respuesta en frecuencia, techo y repetibilidad). Lo que sigue sin probar es la correspondencia con **dBFS absolutos**, más todo lo que nunca se tocó.

> **Una fila de esta tabla dijo 84,5 dB durante unas horas, y era falsa.** El recorrido del medidor se había cambiado a ese número por tres barridos de tono con una fuente externa, y volvió a 80 el 2026-09-09 con una medición hecha **desde adentro de la consola**. El detalle está en la fila de la escala y en SPK-P0.10b; la regla que dejó vale para toda esta tabla: **una fuente externa mide la cadena entera, no el parámetro. Para medir algo de la consola hay que mover algo que ya esté adentro de la consola.**

**Regla:** ninguna función de producto se implementa sobre una fila que no esté en estado CONFIRMADO **y** con la columna *Probado* en sí. Ver ADR-006.

**Versión de la biblioteca:** 7.0.3
**Firmware de la consola:** `3.4.8318-ui24` — modelo `ui24`, `type=8ch`, `schema=6`, `flavour=1`. Un firmware distinto al aquí listado deshabilita toda escritura por ruta cruda (INV-033).

> ⚠️ **INV-033 tiene un problema de orden que conviene mirar.** El firmware **no está expuesto por HTTP**: se probaron `version.txt`, `VERSION`, `js/version.js`, `firmware.txt`, `info.json`, `/api/version` y `sel/version.js`, y las siete devuelven `301 <html>Moved</html>`. La versión aparece como una clave más del volcado del socket, o sea **después de conectarse**. Si INV-033 tiene que decidir si habilita escrituras antes de abrir la conexión, no hay dato con el que decidir.

## Estados

- **CONFIRMADO**: verificado contra código o documentación oficial.
- **INFERIDO**: la clave existe en el modelo de estado, pero el escalado del valor es desconocido.
- **DESCONOCIDO**: no se encontró fuente; requiere spike con hardware.

> **El rango no es la curva, y ahora hay curva para dos filas.** El fader y la ganancia de entrada dejaron de ser suposiciones: sus conversiones se extrajeron del `mixer.html` que la propia consola sirve, y `VERIFICADO_CONTRA_CONSOLA` pasó a `true`. Dos cosas cambiaron de valor al medirlas: **el fader llega a +10 dB, no a 0** —dar por sentado que 1,0 es 0 dB erra diez decibeles en el extremo peligroso—, y **la ganancia de entrada es escalonada**, con 48 valores posibles (de 2 en 2 dB hasta +26, de 1 en 1 desde +27); la recta que se suponía antes erraba más de un decibel. El ecualizador, el compresor y la puerta siguen sin curva y siguen fuera de `conversiones.ts` por eso. Ojo con qué garantiza esto: que nuestra lectura coincide con la que ve el operador en la consola. La correspondencia con un nivel digital real la mide SPK-P0.10b y no está medida. El nivel y el pico no llevan esa marca: vienen de los medidores y son medidas. Y cuando la consola todavía no dijo un valor, la pantalla escribe «—» en vez de un número: antes se devolvía el extremo del rango como si fuera una lectura, que es el peor valor posible para equivocarse y llevaba la misma marca que una estimación real.

> **La ruta manda sobre la clase declarada.** `clasificarRuta` deriva de la ruta a qué categoría de propiedad pertenece, y el motor rechaza si no coincide con la que declaró quien propone (INV-008/INV-010). Dos correcciones que salieron de comparar el clasificador con esta tabla: la alimentación fantasma es `hw.N.phantom` y no `i.N.phantom`, y `var.mtk.*` —soundcheck y multipista— estaba clasificado como envío al bus de análisis, o sea como el **único routing escribible** que admite INV-008. El envío al bus de análisis solo se reconoce si se dice qué auxiliar es ese bus, que lo tiene que decir SPK-P0.5: sin ese dato, todos los `i.N.aux.M.value` son envíos de monitor y no se escribe ninguno.

> **El 2026-09-10 se barrieron 18 rutas escribiendo en cada una, y eso NO alcanza para poner la columna *Probado* en sí.** El barrido midió que la ruta existe, que acepta la escritura, que **la consola la difunde** —18 de 18, mediana 17 ms— y que el valor vuelve a su sitio al restaurarlo. Lo que **no** midió es qué significa el número: que `i.16.eq.b1.gain` pase de 0,5 a 0,53 no dice cuántos decibeles son, ni sobre qué frecuencia, ni con qué Q. La regla de ADR-006 pide *Probado* para implementar una función de producto, y una función de ecualizador construida sobre una ley de conversión sin medir sería exactamente el error que esta matriz existe para evitar. Así que el barrido cierra la **política de confirmación** —ver [ack-policy](ack-policy.md)— y deja esas filas donde estaban. Evidencia: `spikes/SPK-ACK-POLICY/evidence/barrido-testigo-2026-09-10.txt`.

> **Hay dos rutas con la escritura probada contra el aparato, y la columna *Probado* ya no significa lo mismo en todas las filas.** Hasta el 2026-09-08 esa columna decía «lo leímos y coincide». Ese día se escribió por primera vez en una consola real, desde un script de spike y no desde la aplicación —el nivel de autonomía sigue en OBSERVE—: `i.9.mute` y `i.9.mix`. Las dos se aplican. Lo que se aprendió vale para toda escritura y no solo para esas dos rutas: **la consola no devuelve eco a quien escribe**, pero **sí difunde el cambio a los demás clientes**, y desde el mismo cliente hay dos formas de verificar una escritura: pedir `INIT`, que trae el valor nuevo a los ~100 ms y con él el volcado entero —del orden de seis mil claves—, o **abrir una segunda conexión que haga de testigo**, que el 2026-09-09 quedó medida en **27 ms**. Qué se considera «aplicado» a partir de esto lo decide SPK-ACK-POLICY, que con ese dato **ya eligió el testigo**. Donde una fila diga escritura probada, es contra el aparato; donde no lo diga, la marca es de lectura.

> **Se escribió también en `i.N.dyn.bypass` y `i.N.gate.enabled`, y eso no las asciende.** Para medir el medidor del canal 10 sin un compresor en el medio se puentearon las dos, y la medición mejoró como se esperaba: el mismo barrido pasó de 1,59 dB de desvío a 0,79. O sea que las claves existen y aceptan escritura. Pero **su efecto se verificó de forma indirecta**, por lo que le pasó a la recta, y no se midió ninguna curva ni ningún rango: las filas del compresor y de la puerta siguen INFERIDAS y siguen fuera de `conversiones.ts`. Se anota acá para que la escritura quede registrada, no para habilitar nada.

> **La `N` de estas rutas es de base cero, y no leerlo así corre la tabla entera.** El canal 1 es `i.0.mix`, `hw.0.gain`, `i.0.name`. Está medido contra el aparato y escrito en [protocol-spec.md](protocol-spec.md) desde el 2026-09-08, y aun así el adaptador componía `i.1` para el canal 1: la trama `VU2` sí trae el canal 1 en su posición 0, así que el nivel caía en la fila correcta y **todo lo demás corrido uno** —nombre, ganancia, fader y silencio del canal siguiente al lado del medidor del anterior—. Un asistente que propusiera bajar esa ganancia habría nombrado el canal equivocado, y en nivel ASISTIDO habría escrito en el equivocado. Corregido en `eb3900a`. No lo agarró ningún test porque el simulador cargaba la misma suposición y los dos errores se cancelaban: un test que pasa contra el simulador no cierra nada.

> **La consola reporta veinticuatro entradas y hay que preguntárselo.** La cabecera de cada trama `VU2` trae la cantidad de entradas en su byte 0 y el volcado manda un `i.N.name` por cada una. La aplicación tenía doce fijos, y las dos entradas RCA —los canales 21 y 22, justo la fuente con la que se prueba con música— no se veían. La cantidad de canales sale de lo que informa la consola, nunca de una constante.

## Entradas y canales

| Función | API tipada | Ruta cruda | Unidad | Estado | Probado | Spike |
|---|---|---|---|---|---|---|
| Fader de canal | `master.input(n).setFaderLevelDB` | `i.N.mix` | dB, curva no lineal | CONFIRMADO. **Escritura verificada contra el aparato** el 2026-09-08 en `i.9.mix`: se aplica, sin eco a quien la hizo y con difusión a los demás clientes | ✅ lectura y escritura | P0.2a, P0.1 |
| Fader general | `master.setFaderLevelDB` | `m.mix` | dB | CONFIRMADO | ✅ | P0.2a |
| Silencio, panorama, nombre | sí | `i.N.mute`, `i.N.pan`, `i.N.name` | booleano, 0..1, texto | CONFIRMADO. **Escritura verificada contra el aparato** el 2026-09-08 en `i.9.mute`, con el mismo comportamiento: se aplica, sin eco y con difusión. `i.N.pan` e `i.N.name` siguen probados solo en lectura | ✅ lectura; escritura solo `i.N.mute` | P0.2a, P0.1 |
| Solo de canal | sí | `i.N.solo` | booleano | CONFIRMADO | ⬜ | P0.2a |
| Ganancia de entrada | `hw(n).setGainDB` | `hw.N.gain` | dB, de −6 a 57, **escalonada en 48 valores** | CONFIRMADO | ✅ | P0.2a |
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
| Envío auxiliar: nivel | `aux(b).input(n)` | `i.N.aux.B.value` | dB | CONFIRMADO | ✅ | P0.2a |
| Envío auxiliar: silencio | `aux(b).input(n)` | `i.N.aux.B.mute` | booleano | CONFIRMADO | ⬜ | P0.2a |
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
| Borrado de instantánea | — | `DELETESNAPSHOT^show^nombre` | **MEDIDO el 2026-09-10.** Se guarda una automática nuestra y se borra esa misma: la consola la saca de la lista y el show queda como estaba. `SPK-P0.8/evidence/borrado-instantanea-2026-09-10.txt`. **Se midió porque el repaso del acta G-A descubrió que la retención lo mandaba desde el día anterior sin que nadie lo hubiera ejecutado nunca contra el aparato** | ✅ | P0.8 |
| Retención de automáticas | — | `SNAPSHOTLIST` tras `DELETESNAPSHOT` | **MEDIDO el 2026-09-10 desde el adaptador**, con el show lleno a propósito: al guardar la 21 se borra la más vieja y quedan 20. Antes iba a ciegas y nunca había borrado nada fuera de un arnés | ✅ | P0.8 |
| Renombrado de instantánea | — | — | DESCONOCIDO. Sin clave conocida y sin probar | ⬜ | P0.8 |
| Medidores: reparto de bytes y escala | `vuProcessor.*` | `VU2` | CONFIRMADO y **medido contra el aparato** el 2026-09-09: la escala **es lineal en decibeles** y su recorrido es de **80 dB**, que es lo que dice `VU_RANGE` en el `mixer.html`. Queda `dB = 80 · posición − 80`, **0,333 dB por escalón del byte**. Lo fija la medición del **fader** —ganancia digital dentro de la consola, sin cadena analógica en el medio—, que cierra en **0,06 dB sobre 38**. La correspondencia con **dBFS absolutos sigue sin medir**: la ganancia analógica del camino era desconocida, así que valen las diferencias y no los valores absolutos | ✅ | P0.2a, P0.10b |
| Medidores: balística y tasa | — | `VU2` | CONFIRMADO el 2026-09-09. **La consola manda nivel instantáneo**: la subida no se resuelve —llega a la meseta dentro de una sola trama— y la caída de 20 dB da mediana de 37 ms, mínimo 33 y máximo 66, sobre una cadencia de ~44 ms con señal. **La balística la dibuja el cliente** (`GLOBAL_VU_FALL_SPEED = 0.01`, `PEAK_HOLD_TIME = 3` en el `mixer.html`), así que la retención de picos de nuestra aplicación es decisión de producto y no herencia del protocolo | ✅ | P0.10b |
| Medidores: ponderación por frecuencia | — | `VU2` | CONFIRMADO que **no hay**. Mismo nivel de fuente a 100 Hz, 1 kHz y 10 kHz dio bytes 160,3 / 160,7 / 160,0: **0,23 dB de dispersión**. La medición incluye la cadena analógica, que también es plana, así que lo afirmable es que no hay ponderación apreciable en el conjunto | ✅ | P0.10b |
| Medidores: repetibilidad | — | `VU2` | CONFIRMADO: **0,3 dB**. El mismo tono en tres corridas separadas dio bytes 69,9 / 69,1 / 70,0. Es el piso de ruido del montaje, y el número contra el que comparar cualquier diferencia que un asistente quiera declarar significativa | ✅ | P0.10b |
| Medidores: qué byte es cada cosa | — | `VU2`, bloque de 6 bytes por canal | CONFIRMADO. `+0` pre, `+1` entrada, `+2` salida después del fader. La consola dibuja la salida en la barra y la entrada como fantasma; la diferencia dio el fader del canal con una décima de error | ✅ | P0.10b |
| Medidores: saturación | — | — | CONFIRMADO, y ahora **comprobado contra el aparato** y no solo leído de `setVU`: con la ganancia al máximo —57 dB— y la fuente subiendo, el byte **se clava en 239** y la lectura deja de subir en −0,7 dB, que es el valor 1,0 donde la consola enciende su clip. No hay margen escondido por encima, y no hace falta un umbral propio | ✅ | P0.10b |
| Indicador de puerta de ruido en la trama | — | `VU2`, bit 7 del byte `+5` del canal | CONFIRMADO como `GATEind`. **No es saturación**: vale 1 en todos los canales quietos, y leerlo como clip da los veinticuatro canales saturando sin parar | ✅ | P0.10b |
| Canal reproduciendo una pista de soundcheck | — | `var.mtk.soundcheck`, `i.N.scsrc` | **MEDIDO el 2026-09-09.** Hacen falta las dos: el modo encendido —que es global— y que el canal tenga pista asignada. Con el modo apagado la pista sigue asignada y no se usa, así que mirar solo `scsrc` daría un falso positivo permanente: los 24 canales tienen una. Con pista sonando, **la ganancia del previo no cambia lo que se escucha** y la aplicación no deja aplicar | ✅ | P0.2a |
| Crear el punto de retorno antes de escribir | — | `CREATESHOW`, `SAVESNAPSHOT`, `SNAPSHOTLIST` | **MEDIDO y funcionando el 2026-09-09.** La aplicación guarda en su **propio show `VSE`** —nunca en los del usuario, y el show no es un parámetro del comando— con nombre `VSE_AUTO_<ms>`, y lo **verifica releyendo la lista** (INV-001). **Solo borra las suyas**: `comandoBorrar` devuelve `null` para cualquier nombre que no se pueda fechar, así que una instantánea que el usuario guardó a mano —incluso en el show `VSE`— no se puede borrar ni por error. Qué borrar lo decide la política de INV-003 en el dominio: máximo 20 automáticas. **Efecto secundario medido**: guardar cambia `var.currentSnapshot`, y la aplicación **lo devuelve sola** escribiendo solo la etiqueta —nunca `LOADSNAPSHOT`, que aplicaría la instantánea entera—. Comprobado: con tres instantáneas guardadas en el medio, el volcado queda idéntico al inicial | ✅ | P0.1 |
| Confirmar una escritura por el medidor, sin testigo | — | `VU2` | **MEDIDO el 2026-09-10.** Con el testigo caído: en silencio rechaza y no envía nada; con señal, la ganancia sube lo que la curva dice y sale `APPLIED`/`VU`. Estuvo escrito y **desconectado** un día entero, con la política afirmando que funcionaba | ✅ | ACK-POLICY |
| Escribir la ganancia del previo desde la aplicación | — | `hw.M.gain` | **ASSISTED desde el 2026-09-09** (ADR-026). Se lee antes de escribir (INV-011), se confirma por conexión testigo o —sin testigo y con señal— por el propio medidor, y se anota en el diario **antes** de enviar (ADR-013). Solo en configuración de canales y sin toma de soundcheck activa (INV-006) | ✅ | P0.1, ACK-POLICY |
| Indicadores de saturación del canal | — | `VU2` bytes `+0` y `+2` | **MEDIDO el 2026-09-09** en `parseVUdata`. Son **dos**: el del **previo** (`+0`), que la consola dibuja en su página de ganancia y que congela el deslizador de ganancia mientras dura, y el de la **tira** (`+2`), que depende del fader. El byte `+1` **no tiene indicador** | ✅ | P0.10b |
| Detección de realimentación sobre el espectro | — | `RTA^<base64>` | **Implementada y comprobada el 2026-09-09.** Regla «no cayó como debía» apoyada en la balística medida del analizador. Contra la consola: tono sostenido → una candidata en 1000 Hz; 12 s de música → ninguna. Umbrales (6 dB de exceso, 9 dB sobre las vecinas, 500 ms) **elegidos, no medidos**. **Sin validar contra una realimentación real**, que necesita parlantes | ✅ mecanismo, ⬜ en sala | P0.5 |
| Enlace estéreo de un par de canales | — | `i.N.stereoIndex` | **MEDIDO el 2026-09-09.** Existe en los 24 canales. **0** es el primero del par y su compañero es el canal siguiente, **1** es el segundo, **−1** sin enlazar: es la posición dentro del par, no un identificador de par. Las dos escrituras son independientes —la consola no mantiene la relación sola—, así que un estado a medias es posible. **Escribir es destructivo**: el cliente oficial copia todos los ajustes del izquierdo sobre el derecho antes de enlazar, así que la aplicación solo lee | ✅ lectura, ⛔ escritura | P0.2a |
| Cola de `VU2`: línea, subgrupos, efectos, auxiliares y general | — | — | **MEDIDO el 2026-09-09.** Trama de 306 bytes; la cola son 154 y las secciones **no comparten el paso**: línea de a 6, subgrupos y efectos de a 7, auxiliares de a 5. Reparto completo en `protocol-spec.md` §4.3. **Y la cabecera trae las cuentas** (`24 2 6 4 10`), así que la cola es autodescriptiva y no hay que fijar el reparto en el código. Cada byte identificado: subgrupo y efecto son tiras **estéreo** de 7 bytes (`+0/+1` previo, `+2/+3` posterior al fader, `+4/+5` dinámico, `+6` reducción e indicador), el auxiliar es mono de 5 (`+0` previo, `+1` posterior), y el reproductor usa el formato de 6 de las entradas | ✅ | P0.10b, P0.2c |
| Analizador de espectro de la consola por red | — | `RTA^<base64>` | El **flujo** es CONFIRMADO: llega a ~30 Hz sin condición, con señal y en silencio, y por eso es la señal de vida de la conexión. Su **contenido** está **MEDIDO el 2026-09-09**: espectro de **122 bandas** de un doceavo de octava, `banda = 67 + 12·log2(f/1000)`, de ~20,9 Hz a ~22,6 kHz, a **0,375 dB por byte** —escala distinta de la del medidor—. Sube al instante y cae 20 dB en 300 ms. La fuente la elige `var.rta`, que es **global**: elegirla le cambia la pantalla al operador | ✅ | P0.1, P0.2a, P0.5 |
| Información del dispositivo y firmware | `deviceInfo.*` | `model`, `firmware` | **LEÍDO de la consola:** modelo `ui24`, firmware `3.4.8318-ui24`, `type=8ch`, `schema=6`, `flavour=1`. Encabeza `docs/protocol-spec.md` | ✅ | P0.2a |
| Estado de conexión | `status$` | latido cada segundo | CONFIRMADO. Sin medida de ida y vuelta. La cadencia que decide si la conexión es inestable se mide sobre `RTA`: 33 ms de media y p95 de 40 ms **desde la tablet**, igual en silencio que con señal, o sea umbral de 99 ms. Nunca sobre `VU2`, que en silencio da 1 231 ms de media | ✅ | P0.1 |
| Identidad del cliente en los mensajes | — | **no existe** | CONFIRMADO como ausente | ⬜ | P0.1 |
| Eco de las escrituras propias | — | — | **CONFIRMADO como ausente.** La consola aplica la escritura y **no se la devuelve a quien la hizo**: seis segundos escuchando y ninguna línea para la ruta escrita, en `i.9.mute` y en `i.9.mix`. El `INIT` posterior trae el valor nuevo a los ~100 ms | ✅ | P0.1 |
| Difusión de una escritura a los demás clientes | — | — | **CONFIRMADO.** El cambio escrito por un cliente sí llega a los otros: la aplicación en la tablet lo registró como `cambio_externo` en el mismo instante. **Medido el 2026-09-09**: dos conexiones del mismo proceso son dos clientes distintos, y el testigo ve la escritura a los **11,5 ms de mediana** sobre ocho muestras (los 27 ms que figuraban antes eran una sola, y con el calentamiento adentro). Es lo que ADR-024 usó para decidir | ✅ | P0.1, ACK-POLICY |
| Envoltorio de una escritura | — | `3:::SETD^ruta^valor` | **CONFIRMADO.** Escribir usa el mismo envoltorio socket.io que el resto; sin él la consola ignora el mensaje. **No hace falta ningún `INIT` previo** para que la escritura sea aceptada: el `INIT` es la única forma de verificarla, no una condición para que se aplique | ✅ | P0.1 |
| Consola como interfaz USB de 32 canales hacia Android | — | — | DESCONOCIDO | ⬜ | P0.3b |

## Capacidades afirmadas por revisión de firmware, sin verificar

Vienen del [documento de hallazgos](hallazgos-firmware-y-contexto-musical.md) y **ninguna está comprobada contra una consola**: el manual base corresponde a un firmware anterior y no las documenta. Se anotan acá para que existan como preguntas y no como suposiciones; las mide [SPK-FW3](spikes/SPK-FW3-capacidades-firmware.md).

Mientras sigan en DESCONOCIDO no se implementa nada sobre ellas. Es la misma regla que rige el resto de esta matriz.

| Función | Ruta cruda | Estado | Probado | Spike |
|---|---|---|---|---|
| Sidechain de un subgrupo sobre otro | sin clave conocida | DESCONOCIDO | ⬜ | FW3 |
| RTA de la consola: congelar y compartir la medición | sin clave conocida | DESCONOCIDO | ⬜ | FW3, P0.2a |
| AFS2: modos fijo y directo, y estado de los filtros | `a.B.afs.*`, `m.afs.*` | INFERIDO en lectura, DESCONOCIDO en escritura | ⬜ | FW3, P0.2c |
| Pre-delay de la reverberación Lexicon | sin clave conocida | DESCONOCIDO | ⬜ | FW3 |
| Punto de derivación de los envíos de efectos, antes o después del fader | sin clave conocida | DESCONOCIDO | ⬜ | FW3 |
| Matriz de patcheo completa entre entradas, USB, DSP, subgrupos, auxiliares, matriz, efectos y salidas | sin clave conocida | DESCONOCIDO | ⬜ | FW3 |
| Canales DSP que no corresponden a una entrada física | sin clave conocida | DESCONOCIDO | ⬜ | FW3 |
| Cuántos buses auxiliares y de matriz existen, y cuáles tienen salida física | según topología | DESCONOCIDO | ⬜ | FW3, PA-BUS |
| Filtros pasa altos y pasa bajos en buses auxiliares | sin clave conocida | DESCONOCIDO | ⬜ | FW3 |
| CUE: qué parámetros incluye, y si toca envíos de AUX | sin clave conocida | DESCONOCIDO | ⬜ | FW3 |
| CUE: si los AUX se pueden excluir de la recuperación | sin clave conocida | DESCONOCIDO | ⬜ | FW3 |
| Frecuencia de escritura que la consola sostiene sin descartar | — | DESCONOCIDO | ⬜ | FW3, P0.9 |

La fila del CUE y los AUX es la que más decide: si la recuperación de un CUE mueve envíos de monitores, INV-010 la prohíbe desde la aplicación y la automatización por canción cambia de arquitectura. Está anotado como R-22.
