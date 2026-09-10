# SPK-P0.1 — Conectividad, reconexión, eco y cadencia de medidores

**Estado:** Parcial — criterios 4 y 3 contestados el 2026-09-08 (el 3 con un **no**); el **1 quedó contestado el 2026-09-09 para uno de sus tres modos de corte** y el **5 sigue abierto**. Los dos son bloqueantes, así que el spike no se cierra · **Timebox:** 3 días · **Control:** G-A
**Depende de:** S-00.3 · **Bloquea a:** SPK-ACK-POLICY, SPK-P0.2a, SPK-P0.9, S-02.5b, S-02.7
**Montaje:** Ui24R, router dedicado, laptop con Node. No hace falta interfaz de audio.

## Pregunta que responde

¿La conexión se recupera sola y de forma segura, la consola devuelve eco de las escrituras propias, y con qué cadencia llegan los medidores?

La respuesta al eco determina cómo se confirma cada escritura, y la cadencia de medidores determina el umbral con el que se declara una conexión inestable. Sin estos dos números, ni el Safety Engine ni la máquina de estados de conexión se pueden escribir.

## Pasos

1. Conectar y registrar el volcado inicial completo de estado.
2. Para cada modo de corte, veinte ciclos: apagar el router, cambiar la dirección IP de la tablet, cortar la red inalámbrica. Medir el tiempo desde que la red vuelve a estar disponible, comprobado con un ping a la consola, hasta que se recibe el volcado completo.
3. Enviar una escritura propia y observar si el mismo mensaje vuelve por el canal entrante.
4. Registrar diez minutos de tramas de medidores y calcular intervalo medio, mediana, percentil 95 y fluctuación.
5. Conectar tres clientes a la vez, la aplicación, el navegador oficial y un teléfono, y comparar el estado final tras diez minutos.

## Criterios

| # | Criterio | Tipo | Umbral | Medido | Resultado |
|---|---|---|---|---|---|
| 1 | Reconexión automática, por cada modo de corte | bloqueante | 20 de 20 en menos de 10 s desde que la red vuelve | **Modo «wifi cortada»: 20 de 20**, medido el 2026-09-09 desde la tablet. Mediana **3,7 s**, mínimo 3,7, máximo 5,0 — todos por debajo del umbral de diez segundos. `evidence/ciclos-wifi-cortada.txt`. **Faltan los otros dos modos**: apagar el router y cambiar la IP de la tablet. Un tercio del criterio, y el criterio pide los tres | ⬜ |
| 2 | Volcado completo recibido tras cada reconexión | bloqueante | 20 de 20 | 20 de 20, con el volcado entero cada vez. El tamaño **no es constante entre sesiones**: 6 665 claves el 2026-09-08 y 6 087 el 2026-09-09 | ⬜ |
| 3 | La consola devuelve eco al emisor de su propia escritura | informativo | sí o no, con captura | **NO.** Medido el 2026-09-08 en `i.9.mute` y en `i.9.mix`: se escribe, se escucha seis segundos y **no llega ninguna línea para esa ruta**; un `INIT` posterior trae el valor nuevo a los ~100 ms, o sea que la escritura **sí se aplicó**. A los demás clientes **sí se la difunde**: la aplicación en la tablet lo registró como `cambio_externo` en el mismo instante | ✅ |
| 4 | Cadencia de medidores: intervalo medio, mediana, percentil 95 | bloqueante | los tres valores registrados; umbral de inestabilidad = 3 veces el intervalo medio | **Desde la tablet** —Motorola Edge 60 Pro contra la consola en `192.168.0.78`, firmware `3.4.8318-ui24`, Ajustes → Prueba de conexión—: **`RTA` media 33 ms, p95 40 ms, idéntico en silencio y con guitarra sonando → umbral 99 ms.** `VU2`: media 1 231 ms y p95 4 730 ms en silencio, media 44 ms y p95 69 ms con señal. Mediana de `RTA`, desde la laptop por cable: 33 ms | ✅ |
| 5 | Tres clientes simultáneos sin pérdida de estado | bloqueante | estado final idéntico entre clientes tras 10 min | Dos corridas. **2026-09-08, estado quieto:** 3 clientes, 120 s, misma huella SHA-256 y mismas 6 665 claves; no prueba lo que el criterio pregunta. **2026-09-09, con uno escribiendo:** los tres recibieron **6 087 claves** y la **misma huella exacta**, y el que escribe vio **0 líneas** de su propia escritura mientras los otros dos vieron **1 cada uno**. Ahora sí hay estado moviéndose, pero la prueba duró **minutos y no diez**, con una escritura y no con cambios ocurriendo todo el tiempo | ⬜ |

## Quién mide

**La propia aplicación**, en Ajustes → Prueba de conexión. Cronometra la cadencia de los medidores y cada vuelta tras un corte, y exporta el informe en Markdown o JSON.

Se mide desde la tablet y no desde una laptop a propósito: cuánto tarda en reconectar y con qué cadencia llegan las tramas son propiedades del aparato en esa red —su radio, su sistema, su gestión de energía—, no del protocolo. El número de una laptop no dice nada del que se va a usar en el show.

**La prueba medía el flujo equivocado y por eso no podía contestar el criterio 4.** Cronometraba `VU2` y presentaba esa cadencia como la de la conexión, cuando la consola calla `VU2` en silencio: en una sala callada el número que salía era el del silencio de la sala, no el de la red. Corregido en `b7db4e9`: el informe pasó a versión 2 y trae las dos cadencias, la de `RTA` —que es sobre la que se decide este criterio— y la de los medidores, cada una diciendo para qué sirve.

La prueba **no escribe nada**, y por eso no puede contestar el criterio 3: en esta fase la aplicación no escribe. Lo dice el propio informe en la sección de lo que no midió, para que nadie lo lea como comprobado.

El criterio 3 se contestó por fuera de la aplicación, con un script de spike —`tools/spikes/p0-10b-vu/eco.ts`— que tiene la misma autoridad que una persona tocando un control en el `mixer.html` de la consola. No es la aplicación escribiendo: el nivel de autonomía sigue en OBSERVE y el camino `Assistant → Recommendation → Transaction → SafetyEngine → write()` sigue siendo el único por el que la aplicación puede escribir.

El criterio 5 se contesta a medias: la aplicación da la huella de su estado confirmado, y comparar tres clientes es generar las otras dos huellas y ver si coinciden.

## Evidencia a entregar

- `evidence/reconnect-log.jsonl` con los sesenta ciclos y sus tiempos.
- `evidence/echo-capture.txt` con la captura del mensaje enviado y lo recibido.
- `evidence/vu-cadence.json` con la estadística de intervalos.
- `evidence/three-clients-diff.txt`.

## Acción ante fallo

Si la reconexión falla, revisar la configuración del router antes de culpar al protocolo, y repetir una vez. Si sigue fallando, es un hallazgo de infraestructura de red y entra en el registro de riesgos: la topología recomendada cambia.

Si no hay eco, no es un fallo: dispara SPK-ACK-POLICY, que define cómo se confirma cada parámetro sin él.

---

## Resultado parcial — 2026-09-08

**El criterio 4 quedó cerrado; los criterios 1, 3 y 5 siguen abiertos.** La primera tanda se
midió entera desde una laptop por cable, y el charter pide expresamente los números **de la
tablet**, «porque cuánto tarda en reconectar y con qué cadencia llegan las tramas son
propiedades del aparato en esa red». Más tarde el mismo día la cadencia se volvió a medir desde
el teléfono y ahí sí cuenta. Lo que sigue es el piso del protocolo, útil para diseñar y para
saber qué esperar.

### Lo que sí quedó resuelto, y no estaba en la lista de criterios

**La dirección del WebSocket, que bloqueaba todo lo demás.** La consola habla socket.io 0.9:

```
$ curl -sS "http://192.168.0.49/socket.io/1/"
10454688205293084044:5:5:websocket

ws://<máquina>/socket.io/1/websocket/<sesión>
```

**El identificador de sesión es de un solo uso.** Eso obliga a que la aplicación guarde la
máquina y no una URL, y a rehacer el apretón de manos en cada reconexión.

**`ALIVE` es obligatorio.** El cliente oficial lo manda cada segundo; sin él la consola deja de
emitir sin cerrar el socket. Medido: 148 tramas de analizador en 20 s sin `ALIVE`, 905 en 30 s
con él.

**El latido declarado es falso.** El apretón dice 5 s y la consola manda `2::` cada ~66 ms. No
sirve para el detector de caída. Tampoco hay que contestarlo: probado con eco y sin eco, el
flujo entrante es idéntico.

### El hallazgo que cambia el criterio 4

**La consola deja de emitir `VU2` cuando no hay señal.** Una trama en 30 s de silencio; 1 932
en 90 s con música. Un detector de conexión caída basado en medidores da falso positivo en cada
silencio, o sea entre tema y tema y en toda la prueba de sonido.

`RTA` no hace esa supresión: 30,2 Hz en silencio y 30,0 Hz con señal, con percentil 95 de 37 ms. Ese percentil es **el de la laptop**; el que fija el umbral de 99 ms es el de la **tablet**, 40 ms, que es el aparato donde corre la aplicación.
**El adaptador pasó a vigilar `RTA`.** El umbral de inestabilidad del criterio 4 se calcula
sobre `RTA`, no sobre `VU2`; sobre `VU2` no hay cadencia que medir cuando no hay audio, que es
la mitad del tiempo.

### El criterio 4, ahora sí desde la tablet

Medido con **Ajustes → Prueba de conexión** desde un **Motorola Edge 60 Pro** contra la consola
en `192.168.0.78`, firmware `3.4.8318-ui24`:

| Flujo | En silencio | Con guitarra sonando |
|---|---|---|
| `RTA` (analizador) | media 33 ms, p95 40 ms | media 33 ms, p95 40 ms |
| `VU2` (medidores) | media 1 231 ms, p95 4 730 ms | media 44 ms, p95 69 ms |

`RTA` llega igual haya o no señal, y `VU2` se desploma a una trama cada segundo y pico en
silencio, con picos de casi cinco segundos. Es la misma supresión de arriba, vista ahora desde
el aparato que se va a usar en el show: **una conexión perfecta se leería como moribunda si se
juzgara por los medidores.** Con la fórmula del charter, tres veces el intervalo medio de `RTA`,
el umbral de inestabilidad queda en **99 ms**. **Ojo: 99 ms es lo que da la fórmula, no lo que el código usa.** El adaptador vigila con **300 ms** —ocho tramas perdidas del analizador— por decisión explícita: sobre `RTA`, que no se apaga en silencio, 99 ms serían tres tramas y quedaría sensible a cualquier hipo de la wifi. Los dos números son correctos y describen cosas distintas: 99 es el resultado del criterio del charter, 300 el margen que se eligió sobre él.

Los 33 ms del teléfono coinciden con los 33,3 ms que la laptop había medido por cable, así que
**el teléfono sostiene la cadencia del protocolo**: el radio y la gestión de energía del
aparato no la degradan. La mediana de `RTA` sigue siendo la de la laptop, 33 ms; el informe de
la aplicación reporta media y percentil 95.

### El criterio 3, contestado: la consola no devuelve eco

**La respuesta es no.** Medido el 2026-09-08 contra la consola en `192.168.0.78`, firmware
`3.4.8318-ui24`, con `tools/spikes/p0-10b-vu/eco.ts`. El procedimiento es de tres pasos y no
admite interpretación: se escribe, se escucha, y después se pregunta.

En **dos parámetros distintos**, `i.9.mute` y `i.9.mix` —uno booleano y uno continuo, para que
la respuesta no dependa del tipo—:

1. Se envía la escritura y se escuchan **seis segundos**. **No llega ninguna línea para esa
   ruta.** Ni el mismo mensaje, ni una versión distinta, ni nada.
2. Se pide `INIT`. El valor nuevo aparece a los **~100 ms**.

Las dos cosas juntas dicen algo más preciso que «no hay eco»: **la consola aplica la escritura y
no se la devuelve a quien la hizo.** El silencio no era un rechazo.

**Y sí la difunde a los demás clientes.** Mientras corría la prueba, la aplicación estaba
conectada en la tablet y registró el cambio como `cambio_externo` en el mismo instante. O sea
que el mensaje existe y sale: lo que la consola hace es no mandárselo al socket que lo originó.

Eso, sumado a que los mensajes **no identifican al cliente** —ya estaba medido—, cierra un cabo
suelto de ADR-005: la correlación temporal propio/externo del `ConfirmedStateStore` **nunca
marcaría `SELF`**, porque el mensaje con el que se correlacionaría no llega jamás.

#### Qué decisiones toca esto

- **`Ui24rMixerAdapter.escribir()` hoy devolvería `UNVERIFIED` siempre.** Espera confirmación
  con `esperarConfirmacion()`, que exige una entrada en el almacén con origen `SELF`; sin eco no
  hay una nunca, así que agota su tiempo de espera en todas las escrituras y ninguna transacción
  pasaría de su primera escritura. La rama que devuelve `APPLIED` con `confirmedBy: 'ECHO'` es
  código muerto contra esta consola.
- **La política de confirmación no puede basarse en el eco.** Es la entrada que le faltaba a
  SPK-ACK-POLICY, y ahí están escritas las opciones. Este spike no elige ninguna.
- **Confirmar por relectura significa `INIT`**, que es el volcado entero: del orden de seis mil
  claves. Funciona —los ~100 ms lo demuestran— pero es caro para confirmar una sola escritura.
- **Hay una tercera vía que la medición sugiere**: una **segunda conexión como testigo**, ya que
  la consola sí difunde a los otros clientes. El 2026-09-08 se registró como opción a evaluar y
  no como decisión tomada, porque faltaba comprobar que la consola tratara dos conexiones del
  mismo proceso como dos clientes. **El 2026-09-09 quedó comprobado**: las trata como clientes
  distintos y el testigo ve la escritura a los **27 ms**. Con eso SPK-ACK-POLICY eligió.

#### Un hallazgo de protocolo que salió de la misma prueba

Escribir requiere **el mismo envoltorio socket.io que el resto**: `3:::SETD^ruta^valor`. Enviado
sin él, la consola lo ignora. Se probaron cinco variantes con
`tools/spikes/p0-10b-vu/probar-escritura.ts` y la que funciona es la de siempre, sin ningún
prefijo especial ni ninguna forma reservada para las escrituras.

Y **no hace falta ningún `INIT` previo** para que una escritura sea aceptada. El `INIT` es la
única forma de *verificarla*, no una condición para que se aplique.

---

## Resultado parcial — 2026-09-09

### El criterio 1, contestado para un modo de corte de tres

**Modo «wifi cortada»: 20 de 20 ciclos, todos por debajo del umbral.** Medido desde la tablet
contra la consola en `192.168.0.78`, con cortes de seis segundos y cronometrando desde que se
reactiva la wifi hasta que la aplicación dice CONECTADO:

| | |
|---|---|
| ciclos dentro del umbral de 10 s | **20 de 20** |
| mediana | **3,7 s** |
| mínimo | 3,7 s |
| máximo | **5,0 s** |

Evidencia en `evidence/ciclos-wifi-cortada.txt`. Esto reemplaza a los «unos pocos ciclos, 3,8 a
4,9 s» de la tanda anterior: ahora son los veinte que el criterio pide, con la dispersión
apretada —dieciocho de los veinte entre 3,7 y 3,8 s— y un solo valor suelto en 5,0.

**Pero el criterio pide tres modos y hay uno.** Faltan **apagar el router** y **cambiar la IP de
la tablet**, y no faltan por falta de tiempo: los dos necesitan a alguien físicamente delante del
router o del aparato, y no se pueden guionar desde una máquina. **Por eso el spike no se cierra.**

Vale anotar por qué el criterio pide los tres y no se conforma con el más fácil: los tres cortes
rompen cosas distintas. Cortar la wifi tira el socket y deja la IP intacta; apagar el router tira
además la concesión de DHCP y puede devolver otra dirección; cambiar la IP de la tablet deja el
socket vivo apuntando a una ruta que ya no existe, que es el caso donde un cliente se puede
quedar esperando para siempre sin enterarse. Veinte ciclos del modo benigno no dicen nada de los
otros dos.

### El criterio 5, con estado moviéndose pero corto

**Tres clientes simultáneos, uno de ellos escribiendo.** Los tres recibieron **6 087 claves** y
la **misma huella exacta**. Y con los tres conectados a la vez:

> **el que escribe ve 0 líneas de su propia escritura, mientras los otros dos ven 1 cada uno.**

Es la respuesta del criterio 3 confirmada con tres testigos simultáneos, y agrega algo que la
prueba de dos clientes no podía dar: la difusión llega **una sola vez** a cada uno de los demás,
sin repeticiones y sin que a ninguno se le pierda.

**Salvedad, y es la que impide cerrar el criterio:** la prueba duró **minutos y no los diez** que
pide el charter, y hubo una escritura, no cambios ocurriendo todo el tiempo. Sigue ⬜.

### El tamaño del volcado no es constante entre sesiones

Un dato que sale de comparar las dos corridas de tres clientes y que este documento —y
`protocol-spec.md`, y la matriz— venían escribiendo como si fuera fijo: el 2026-09-08 el volcado
traía **6 665** claves, y el 2026-09-09, con la misma consola y el mismo firmware, **6 087**.

Dentro de una sesión es estable: los tres clientes de cada corrida coincidieron hasta la huella.
Entre sesiones, no. Depende de lo que la consola tenga configurado en el momento, y nadie acotó
todavía de qué. **Consecuencia práctica: nada puede detectar el fin del volcado comparando contra
un número escrito a mano**, que es justamente lo que el adaptador no hace —espera un `DUMP_END`
que esta consola tampoco manda— y lo que alguien podría sentirse tentado de hacer al leer las
tablas viejas.

### La segunda conexión testigo, medida

Dos conexiones abiertas **desde el mismo proceso** son **dos clientes distintos** para la
consola: se escribe por una y la otra recibe el cambio a los **27 ms**. Era la única pregunta que
quedaba para que la opción C de SPK-ACK-POLICY dejara de ser una hipótesis, y con esto ese spike
eligió. Lo que cuesta —el testigo recibe el volcado completo y los flujos de medidores— está
escrito allá.

### Qué falta para cerrar el spike

Dos criterios, los dos bloqueantes:

- **Criterio 1**: los dos modos de corte que faltan, **router apagado** y **cambio de IP de la
  tablet**, veinte ciclos cada uno. Necesitan a alguien físicamente ahí.
- **Criterio 5**: los tres clientes **diez minutos y con cambios ocurriendo todo el tiempo**, no
  con una escritura en una ventana de minutos.

El criterio 3 ya no está en esta lista: quedó contestado. Era informativo, así que no bloqueaba
el cierre, pero sí bloqueaba a SPK-ACK-POLICY, que ahora tiene su entrada **y su decisión**.

### Evidencia

`evidence/` — volcados crudos, inventario de claves, capturas de medidores con y sin señal,
ciclos de reconexión y huellas de los tres clientes.

- `evidence/ciclos-wifi-cortada.txt` — **entregada**: los veinte ciclos del criterio 1 en su
  único modo medido.
- **Falta archivar `evidence/echo-capture.txt`**, la salida de `eco.ts` para las dos rutas con
  sus tiempos. Sin ella el criterio 3 está contestado en este documento pero no cumple el segundo
  punto de la definición de terminado de un spike, que pide la evidencia archivada.
- **Falta archivar la corrida de tres clientes del 2026-09-09** —las 6 087 claves, la huella
  compartida y el reparto 0/1/1 de líneas vistas—. `evidence/tres-clientes-diff.txt` es la
  corrida vieja, la del estado quieto.
- **Falta archivar la medición de la segunda conexión testigo**, con sus 27 ms.

## Evidencia archivada

Todo lo que esta carpeta guarda, con qué es cada cosa. Un archivo que nadie
cita es una medición que nadie va a encontrar cuando la necesite.

- `evidence/handshake.txt` — el apretón de manos de socket.io, capturado
- `evidence/prueba-A-pasivo.txt` — captura archivada
- `evidence/prueba-B-alive.txt` — captura con `ALIVE`, para comparar contra la pasiva
- `evidence/reconexion-desde-imac.jsonl` — ciclos de reconexión desde la laptop
- `evidence/recorrido-tablet-2026-09-09.txt` — recorrido de la aplicación en la tablet, con los tres defectos que solo se ven con el aparato en la mano
- `evidence/volcado-inicial.txt` — el volcado inicial completo, con sus tiempos por mensaje
- `evidence/vu-con-senal.txt` — tramas `VU2` con música entrando por las RCA — la que destapó los dos rótulos invertidos de la cola
- `evidence/lazo-contra-consola-2026-09-09.txt` — el primer intento del lazo completo: rechazado por INV-001, que exige un punto de retorno que todavía no se sabe crear
