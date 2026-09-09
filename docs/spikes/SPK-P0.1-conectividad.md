# SPK-P0.1 — Conectividad, reconexión, eco y cadencia de medidores

**Estado:** Parcial — criterio 4 cerrado desde la tablet el 2026-09-08; **1, 3 y 5 siguen abiertos** · **Timebox:** 3 días · **Control:** G-A
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
| 1 | Reconexión automática, por cada modo de corte | bloqueante | 20 de 20 en menos de 10 s desde que la red vuelve | 20 de 20 ciclos de apretón a volcado, 112–158 ms, **desde una laptop por cable y sin cortar la red** | ⬜ |
| 2 | Volcado completo recibido tras cada reconexión | bloqueante | 20 de 20 | 20 de 20, 6 665 claves cada vez | ⬜ |
| 3 | La consola devuelve eco al emisor de su propia escritura | informativo | sí o no, con captura | sin medir: exige escribir, y el nivel es OBSERVE | ⬜ |
| 4 | Cadencia de medidores: intervalo medio, mediana, percentil 95 | bloqueante | los tres valores registrados; umbral de inestabilidad = 3 veces el intervalo medio | **Desde la tablet** —Motorola Edge 60 Pro contra la consola en `192.168.0.78`, firmware `3.4.8318-ui24`, Ajustes → Prueba de conexión—: **`RTA` media 33 ms, p95 40 ms, idéntico en silencio y con guitarra sonando → umbral 99 ms.** `VU2`: media 1 231 ms y p95 4 730 ms en silencio, media 44 ms y p95 69 ms con señal. Mediana de `RTA`, desde la laptop por cable: 33 ms | ✅ |
| 5 | Tres clientes simultáneos sin pérdida de estado | bloqueante | estado final idéntico entre clientes tras 10 min | 3 clientes, 120 s, misma huella SHA-256 y mismas 6 665 claves — **con el estado quieto, así que no prueba lo que el criterio pregunta** | ⬜ |

## Quién mide

**La propia aplicación**, en Ajustes → Prueba de conexión. Cronometra la cadencia de los medidores y cada vuelta tras un corte, y exporta el informe en Markdown o JSON.

Se mide desde la tablet y no desde una laptop a propósito: cuánto tarda en reconectar y con qué cadencia llegan las tramas son propiedades del aparato en esa red —su radio, su sistema, su gestión de energía—, no del protocolo. El número de una laptop no dice nada del que se va a usar en el show.

**La prueba medía el flujo equivocado y por eso no podía contestar el criterio 4.** Cronometraba `VU2` y presentaba esa cadencia como la de la conexión, cuando la consola calla `VU2` en silencio: en una sala callada el número que salía era el del silencio de la sala, no el de la red. Corregido en `b7db4e9`: el informe pasó a versión 2 y trae las dos cadencias, la de `RTA` —que es sobre la que se decide este criterio— y la de los medidores, cada una diciendo para qué sirve.

La prueba **no escribe nada**. Eso deja el criterio 3, el eco de las escrituras propias, sin contestar: exige escribir, y en esta fase la aplicación no escribe. Lo dice el propio informe en la sección de lo que no midió, para que nadie lo lea como comprobado.

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

`RTA` no hace esa supresión: 30,2 Hz en silencio y 30,0 Hz con señal, con percentil 95 de 37 ms.
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
el umbral de inestabilidad queda en **99 ms**.

Los 33 ms del teléfono coinciden con los 33,3 ms que la laptop había medido por cable, así que
**el teléfono sostiene la cadencia del protocolo**: el radio y la gestión de energía del
aparato no la degradan. La mediana de `RTA` sigue siendo la de la laptop, 33 ms; el informe de
la aplicación reporta media y percentil 95.

### Qué falta para cerrar el spike

Tres criterios, y ninguno se contesta con lo medido hasta ahora:

- **Criterio 1**: los veinte ciclos **por cada modo de corte** —router apagado, cambio de IP de
  la tablet, corte de la red inalámbrica—, con cortes de red reales y desde la tablet. Lo
  medido hasta ahora son veinte ciclos de apretón a volcado, sin cortar nada.
- **Criterio 3**: el eco de las escrituras propias. Exige escribir, y el nivel de autonomía es
  OBSERVE. No se contesta en esta fase.
- **Criterio 5**: los tres clientes simultáneos **con el estado moviéndose**. La comparación de
  huellas se hizo con el estado quieto, que no prueba lo que el criterio pregunta.

### Evidencia

`evidence/` — volcados crudos, inventario de claves, capturas de medidores con y sin señal,
ciclos de reconexión y huellas de los tres clientes.
