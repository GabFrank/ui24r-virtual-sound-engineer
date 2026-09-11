# SPK-ACK-POLICY — Política de confirmación de escrituras

**Estado:** **Cerrado el 2026-09-10.** Mecanismo elegido el 2026-09-09 —la segunda conexión testigo—, tabla medida ruta por ruta y texto de INV-011 escrito · **Timebox:** 1 día · **Control:** G-A
**Depende de:** SPK-P0.1 · **Bloquea a:** S-02.9a, S-13.1
**Montaje:** resultados de SPK-P0.1. No requiere hardware adicional.

## Pregunta que responde

Si la consola no confirma las escrituras, ¿qué se considera "aplicado" para cada parámetro?

El protocolo no tiene confirmación explícita, y **el eco tampoco existe: está medido**. Con eso, solo el fader, el silencio y la ganancia tienen verificación indirecta por los medidores. Sin una política escrita, los envíos, la ecualización y la dinámica quedarían siempre sin verificar y **toda transacción se detendría en su primera escritura**. Eso ya no es una hipótesis: es lo que hace hoy `escribir()`.

## Pasos

1. ~~Tomar el resultado de eco de SPK-P0.1.~~ Hecho el 2026-09-08: **no hay eco**. Ver más abajo.
2. Para cada parámetro de la matriz de capacidades, decidir su método de confirmación: eco, medidores, volcado tras reconexión, o ninguno.
3. Redactar el texto normativo de la invariante INV-011 ajustado al resultado.

## Criterios

| # | Criterio | Tipo | Umbral | Medido | Resultado |
|---|---|---|---|---|---|
| 1 | Tabla parámetro a método de confirmación, completa | bloqueante | 100 % de las filas de la matriz | **Escrita, y medida en vez de redactada.** El 2026-09-10 se barrieron 18 rutas contra la consola —leer, escribir una delta, preguntarle al testigo, restaurar—: **18 de 18 difundidas**, mediana 17 ms, todas restauradas y comprobado con un volcado nuevo. Las familias que no se barrieron quedan marcadas **Inferido** en la tabla, con qué significa eso. `evidence/barrido-testigo-2026-09-10.txt` | ✅ |
| 2 | Texto normativo de INV-011 redactado y aprobado | bloqueante | sí | **Escrito** en `docs/ack-policy.md`: qué se comprueba antes, el plazo de 500 ms y de dónde sale, los cuatro confirmadores en orden, por qué `ECHO` no es alcanzable, **qué es lo que una confirmación no dice**, y qué pasa si el testigo se cae en medio de una transacción | ✅ |

## Regla por defecto si no hay eco

- Los medidores valen como confirmación para fader, silencio y ganancia **solo con señal presente**, es decir, medidor por encima de −60 dB.
- El resto de parámetros continúa en modo asistido con confirmación por tiempo de espera y el aviso "no verificable" visible por cada cambio.
- En modo automático controlado, **todo parámetro sin eco ni verificación por medidores es inelegible**.

## Lo medido — 2026-09-08

**La consola no devuelve eco al emisor de su propia escritura.** Es el criterio 3 de SPK-P0.1 y
el paso 1 de este spike, que hasta hoy no tenía respuesta. Medido en `i.9.mute` y en `i.9.mix`
contra la consola en `192.168.0.78`, firmware `3.4.8318-ui24`. El detalle y la evidencia están
en [SPK-P0.1](SPK-P0.1-conectividad.md); acá va lo que cambia una decisión.

Tres hechos, y los tres importan por separado:

| Hecho | Medido | Por qué importa acá |
|---|---|---|
| No hay eco | seis segundos escuchando, **cero líneas** para la ruta escrita | la confirmación por eco no existe |
| La escritura **sí se aplica** | `INIT` posterior trae el valor nuevo a los **~100 ms** | el silencio no es un rechazo: hay algo que confirmar |
| La consola **difunde a los demás clientes** | la aplicación en la tablet lo registró como `cambio_externo` en el mismo instante | el mensaje existe, y lo ve todo el mundo menos quien escribió |

Dos consecuencias inmediatas sobre código que ya está escrito:

- **`Ui24rMixerAdapter.escribir()` devolvería `UNVERIFIED` siempre.** Su
  `esperarConfirmacion()` exige que el almacén registre la ruta con origen `SELF`, y sin eco eso
  no pasa nunca. La rama `APPLIED` con `confirmedBy: 'ECHO'` es inalcanzable contra esta
  consola.
- **La correlación propio/externo del `ConfirmedStateStore` nunca marcaría `SELF`.** Es el cabo
  suelto que ADR-005 dejó anotado para este spike: la ventana de 300 ms espera un mensaje
  entrante que no llega.

## Las opciones

| Opción | Qué confirma | Costo | Qué no cubre |
|---|---|---|---|
| **A — Medidores** | fader, silencio y ganancia, y solo con señal presente | ninguno: las tramas ya llegan | todo lo que no se ve en un medidor: ecualizador, dinámica, envíos, retardos. Y cualquier parámetro en silencio |
| **B — Relectura por `INIT`** | cualquier parámetro, con certeza | el volcado entero por cada escritura confirmada, a ~100 ms: del orden de **seis mil claves** | no escala a una transacción de varias escrituras ni a nada parecido a una rampa. Ver R-23 |
| **C — Segunda conexión testigo** ✅ | cualquier parámetro que la consola difunda, que hasta donde se midió son todos | una sesión más: abrirla, mantenerla viva con `ALIVE`, reconectarla, y una instancia más que INV-032 tiene que poder distinguir. Y el testigo **recibe el volcado completo al conectar y después los flujos de medidores**, o sea que paga tráfico y batería de forma continua | los parámetros que la consola no difunda, si aparece alguno. Y no cubre el caso de la consola que aplica la escritura y no la difunde, que no se observó pero tampoco se descartó |
| **D — Ninguna** | nada: `confirmedBy = TIMEOUT` y aviso «no verificable» por cada cambio | ninguno | deja todo parámetro sin verificación inelegible en automático controlado, que es la regla por defecto de más abajo |

Las opciones no son excluyentes: lo más probable es que la tabla final del criterio 1 mezcle
varias, una por familia de parámetro. Eso es exactamente lo que este spike tiene que escribir.

## La decisión — 2026-09-09: la segunda conexión testigo

**Elegida la opción C.** Lo que le faltaba era una medición propia, y llegó: la opción C se
apoyaba en que la consola difunde a los otros clientes, pero eso estaba probado contra un cliente
**ajeno** —la aplicación en la tablet—, no contra una segunda conexión del mismo proceso. Nada
garantizaba que la consola no las tratara como una sola sesión.

**Medido:** dos conexiones abiertas desde el mismo proceso son **dos clientes distintos** para la
consola, y **el testigo ve la escritura a los 11,5 ms de mediana** sobre ocho muestras. (Decía 27 ms: era una sola muestra con el calentamiento adentro, retirada por ADR-024.) Con tres clientes a la vez se ve la misma
regla desde el otro lado: el que escribe registra **0 líneas** de su propia escritura y los otros
dos **1 cada uno**, o sea que la difusión llega una sola vez y no se le pierde a nadie.

**Por qué esta y no las otras**, en el orden en que pesaron:

1. **Confirma lo que las otras no.** La opción A solo alcanza a fader, silencio y ganancia, y
   solo con señal: deja el ecualizador, la dinámica y los envíos sin verificar para siempre, que
   es justamente el problema que este spike existe para resolver.
2. **Cuesta lo que B no puede costar.** Confirmar por `INIT` significa pedir el volcado entero
   por cada escritura. Una transacción de varias escrituras secuenciales —que es lo que INV-005
   obliga a hacer— pediría el volcado tantas veces como escrituras tenga. Es el R-23 en su peor
   forma. El testigo, en cambio, ya está escuchando: la confirmación no cuesta un pedido, cuesta
   esperar unos 11,5 ms de mediana.
3. **Es la única compatible con el nivel de autonomía al que el producto va.** ADR-023 dice que
   la aplicación va a automatizar. Un mecanismo que no escala más allá de una escritura suelta
   cierra esa puerta antes de llegar.

**Lo que cuesta, escrito sin adornos.** El testigo es una conexión de verdad y la consola la
trata como tal: **le manda el volcado completo al conectar y después le manda los flujos de
medidores**, `VU2` y `RTA`, exactamente igual que a la conexión principal. Eso es tráfico y
batería duplicados en un aparato que va a estar sobre una tablet, en una red inalámbrica, durante
un show entero. No hay forma de pedirle a la consola que mande menos: el protocolo no tiene
suscripción selectiva. Lo que sí se puede es **descartar temprano en el cliente** y no procesar
del testigo más que las líneas `SETD`/`SETS` que interesan, que es una decisión de
implementación, no del protocolo.

**La ambigüedad que el testigo no puede quitar, y hay que escribirla.** Los mensajes de la consola **no identifican al emisor**: eso ya estaba medido. Entonces lo que el testigo confirma es que **la consola difundió esa ruta con ese valor**, no que la línea sea nuestra. Si un operador movió el mismo control al mismo valor en la misma ventana de tiempo, se ve igual. Es exactamente la ambigüedad que ADR-005 ya asume para la correlación temporal, heredada tal cual: el testigo la reduce a milisegundos, no la elimina. Cualquier texto de INV-011 tiene que decir eso en vez de prometer certeza.

**Y suma una instancia más que INV-032 tiene que poder distinguir.** La detección de otra
instancia de esta aplicación conectada no puede confundir nuestro propio testigo con un segundo
operador. Eso lo tiene que resolver el mecanismo de presencia que elige SPK-P0.9, y es una
condición para que esta decisión sea implementable, no un detalle posterior.

**La ADR está en redacción por separado.** Cuando exista, es ella la que manda sobre este
párrafo; acá queda registrado qué se eligió, con qué medición y a qué costo.

### Lo que la decisión todavía no resuelve

Elegir el mecanismo no es escribir la política. Faltan los dos criterios:

- **La tabla parámetro a método** —criterio 1—. El testigo cubre todo lo que la consola difunda,
  pero eso hay que comprobarlo familia por familia contra la matriz de capacidades, y hoy solo
  hay cinco rutas escritas contra el aparato: `i.9.mute`, `i.9.mix`, `i.9.pan`
  —esta última en la sonda de tres clientes—, `i.9.dyn.bypass` y `i.9.gate.enabled`. Para las demás, que el testigo funcione es una expectativa razonable, no un
  hecho medido.
- **El texto de INV-011** —criterio 2—, que tiene que decir qué pasa cuando el testigo se cae en
  medio de una transacción. Es un modo de fallo nuevo que las otras opciones no tenían.

## Evidencia a entregar

- `docs/ack-policy.md` completo.
