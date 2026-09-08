# SPK-P0.1 — Conectividad, reconexión, eco y cadencia de medidores

**Estado:** Pendiente · **Timebox:** 3 días · **Control:** G-A
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
| 1 | Reconexión automática, por cada modo de corte | bloqueante | 20 de 20 en menos de 10 s desde que la red vuelve | | ⬜ |
| 2 | Volcado completo recibido tras cada reconexión | bloqueante | 20 de 20 | | ⬜ |
| 3 | La consola devuelve eco al emisor de su propia escritura | informativo | sí o no, con captura | | ⬜ |
| 4 | Cadencia de medidores: intervalo medio, mediana, percentil 95 | bloqueante | los tres valores registrados; umbral de inestabilidad = 3 veces el intervalo medio | | ⬜ |
| 5 | Tres clientes simultáneos sin pérdida de estado | bloqueante | estado final idéntico entre clientes tras 10 min | | ⬜ |

## Quién mide

**La propia aplicación**, en Ajustes → Prueba de conexión. Cronometra la cadencia de los medidores y cada vuelta tras un corte, y exporta el informe en Markdown o JSON.

Se mide desde la tablet y no desde una laptop a propósito: cuánto tarda en reconectar y con qué cadencia llegan las tramas son propiedades del aparato en esa red —su radio, su sistema, su gestión de energía—, no del protocolo. El número de una laptop no dice nada del que se va a usar en el show.

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
