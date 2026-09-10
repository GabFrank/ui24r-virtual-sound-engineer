# Política de confirmación de escrituras

Resultado de SPK-ACK-POLICY. El mecanismo está elegido y medido, la tabla
parámetro a método está **medida y no supuesta**, y el texto normativo de
INV-011 está abajo.

## Lo que ya está decidido

El protocolo no tiene confirmación explícita de escritura, y **la consola tampoco devuelve eco**:
está medido, no supuesto. Escribe, aplica, y le manda el cambio a todos los clientes **menos al
que lo originó**.

**El mecanismo de confirmación es una segunda conexión testigo**, elegida el 2026-09-09 y medida
contra la consola:

| | |
|---|---|
| Dos conexiones del mismo proceso, ¿son dos clientes para la consola? | **Sí** |
| ¿En cuánto ve el testigo una escritura hecha por la principal? | **27 ms** |
| Con tres clientes, ¿cuántas veces llega la difusión? | **una a cada uno menos al origen**: 0 líneas el que escribe, 1 cada uno de los otros dos |

Se eligió sobre las alternativas porque los medidores solo confirman fader, silencio y ganancia
—y solo con señal presente—, y porque confirmar por `INIT` cuesta el volcado entero por cada
escritura, lo que no sobrevive a una transacción de varias escrituras secuenciales.

**Lo que cuesta:** el testigo es una conexión de verdad, así que **recibe el volcado completo al
conectar y después los flujos de medidores**, igual que la conexión principal. El protocolo no
tiene suscripción selectiva; lo que se puede es descartar temprano en el cliente. Y suma una
instancia más que la detección de presencia de INV-032 tiene que poder distinguir de un segundo
operador real.

**Lo que el testigo no puede quitar:** los mensajes de la consola no identifican al emisor, así
que el testigo confirma que **la consola difundió esa ruta con ese valor**, no que la línea sea
nuestra. Es la ambigüedad que ADR-005 ya asume, reducida a milisegundos pero no eliminada. El
texto de INV-011 tiene que decirlo en vez de prometer certeza.

El razonamiento completo, con las cuatro opciones y por qué cayeron tres, está en
[SPK-ACK-POLICY](spikes/SPK-ACK-POLICY.md). La ADR que lo fija está en redacción por separado y,
cuando exista, manda sobre este documento.

## La tabla: qué confirma cada escritura

**Está medida.** El 2026-09-10 se barrieron 18 rutas contra la consola, una por
una: leer el valor, escribir una delta, preguntarle al testigo si la vio dentro
de 500 ms, y restaurar. **18 de 18 difundidas**, mediana de 17 ms en la primera
corrida y 18 en la segunda, extremos de 12 a 26. Todas restauradas, comprobado
después con un volcado HTTP nuevo.
`spikes/SPK-ACK-POLICY/evidence/barrido-testigo-2026-09-10.txt`.

El barrido usó el canal 17 —sin nombre, silenciado, fader abajo— con un punto de
retorno guardado antes de escribir nada, como manda INV-001.

| Familia | Rutas | Método | Respaldo | Estado |
|---|---|---|---|---|
| Fader de canal | `i.N.mix` | **TESTIGO** | **VU** con señal presente | Medido |
| Fader general | `m.mix` | **TESTIGO** | **VU** con señal presente | Inferido |
| Silencio de canal | `i.N.mute` | **TESTIGO** | **VU** con señal presente | Medido |
| Panorama | `i.N.pan` | **TESTIGO** | — | Medido |
| Nombre | `i.N.name` | **TESTIGO** (`SETS`) | — | Inferido |
| Inversión de fase | `i.N.invert` | **TESTIGO** | — | Medido |
| Retardo de canal | `i.N.delay` | **TESTIGO** | — | Medido |
| Ganancia del previo | `hw.N.gain` | **TESTIGO** | **VU** con señal presente | Medido |
| Alta impedancia | `hw.N.hiz` | **TESTIGO** | — | Medido |
| Envío auxiliar: nivel | `i.N.aux.B.value` | **TESTIGO** | — | Medido |
| Envío auxiliar: silencio | `i.N.aux.B.mute` | **TESTIGO** | — | Medido |
| Envío auxiliar: punto de derivación | `i.N.aux.B.post`, `.postproc` | **TESTIGO** | — | Medido (`post`) |
| Ecualizador de canal | `i.N.eq.*` | **TESTIGO** | — | Medido (2 de sus rutas) |
| Dinámica, puerta, deesser | `i.N.dyn.*`, `i.N.gate.*`, `i.N.deesser.*` | **TESTIGO** | — | Medido (1 de cada) |
| Protegido y grabación | `i.N.safe`, `i.N.mtkrec` | **TESTIGO** | — | Medido |
| Salidas y matriz | `a.B.*`, `m.mtx.B.*`, `m.delayL/R`, `m.eq.*` | **TESTIGO** | — | Inferido |
| Instantáneas y shows | `CREATESHOW`, `SAVESNAPSHOT`, `DELETESNAPSHOT` | **Relectura de `SNAPSHOTLIST`** | — | Medido |
| Alimentación fantasma | `hw.N.phantom` | **No aplica**: INV-007 la deja en solo lectura | — | — |
| Solo | `i.N.solo` | **TESTIGO** | — | No medido a propósito: suena en los auriculares de alguien |
| Fuente del analizador | `var.rta` | **TESTIGO** | — | Inferido |

### Qué quiere decir «inferido»

Que **no se midió esa ruta**, y que se le aplica el resultado de las que sí:
todas las rutas del árbol de estado viajan en el mismo mensaje `SETD`/`SETS` y
la consola no distingue entre ellas para difundir. Es la generalización más
económica que hay, **y sigue siendo una generalización**: el día que una escritura
inferida no se confirme, la primera sospecha no es la red, es esta fila.

Las que dicen «Medido (N de sus rutas)» son familias donde se barrió una o dos
rutas representativas y no las decenas que tiene la familia entera.

### Los comandos no son parámetros

`SAVESNAPSHOT` y `DELETESNAPSHOT` no escriben una ruta del árbol, así que el
testigo no tiene qué correlacionar. Se confirman **releyendo la lista**:
`SNAPSHOTLIST` y comparar. Está medido en las dos direcciones —guardar el
2026-09-09, borrar el 2026-09-10— y es más lento que el testigo, del orden de
un segundo, porque la consola contesta la lista cuando terminó y no cuando
recibió.

## INV-011, texto normativo

**Antes de escribir.** Toda escritura va precedida de una comparación entre el
valor que la transacción cree actual y el que el almacén tiene, y el almacén
tiene que estar en estado válido. Si está inválido —por ejemplo tras una
avalancha, INV-021— o si los valores difieren, la transacción pasa a CONFLICTO y
**no se escribe**.

**Después de escribir.** Se espera confirmación **≤ 500 ms**. El plazo sale de la
medición con holgura: la mediana está entre 11,5 y 18 ms según la corrida, y el
máximo observado es 27. Quinientos milisegundos son más de dieciocho veces el
peor caso medido; si se agota, lo que pasó no es que el testigo llegara tarde.

**Quién confirma, en este orden:**

1. **`WITNESS`** — la segunda conexión testigo vio a la consola difundir esa ruta
   con ese valor. Es el mecanismo normal y cubre todo el árbol de estado.
2. **`VU`** — solo para fader, silencio y ganancia, **y solo con señal presente**
   (`VU2` ≥ −60 dB). Exige además que el nivel se mueva en la dirección correcta
   y al menos la mitad de lo pedido: parecerse al cambio esperado no alcanza,
   porque con 1 dB pedido y 1,5 de tolerancia, quedarse quieto entraría.
3. **`TIMEOUT`** — se venció el plazo. En modo asistido la escritura queda con
   aviso «no verificable» y el operador decide. **En modo automático controlado,
   un parámetro que no se pueda confirmar por testigo ni por VU es inelegible**:
   no se escribe, no se ofrece.
4. **`NONE`** — no hubo forma de confirmar y tampoco de esperar.

**`ECHO` no es alcanzable.** Está medido que la consola no le devuelve nada a
quien escribe, y el tipo del código ya lo prohíbe.

**Lo que una confirmación NO dice.** Que la consola difundió esa ruta con ese
valor dentro de la ventana. **No** que la línea sea nuestra: el protocolo no
identifica al emisor, así que si otro cliente escribe lo mismo en el mismo
instante, el testigo no puede distinguirlo (ADR-005). Y **no** que ese siga
siendo el valor actual: una escritura ajena posterior dentro de la misma ventana
llega después de que este mecanismo ya resolvió. La ambigüedad queda reducida a
milisegundos, no eliminada, y ningún texto de la aplicación debe prometer
certeza donde hay esto.

**Si el testigo se cae en medio de una transacción.** Todo lo que estuviera
pendiente se resuelve como no confirmado **en el acto**, sin esperar a que venza
el plazo: quien llamó tiene que enterarse ahora de que esa escritura quedó sin
verificar y no dentro de medio segundo. La transacción no continúa con las
escrituras que le queden; se detiene y se informa. Es un modo de fallo que las
otras tres opciones de confirmación no tenían, y es el precio del mecanismo.

## Lo que sigue sin estar medido

- Las filas marcadas **Inferido**, que son las del general, las salidas, la
  matriz y el nombre.
- Que dos escrituras muy seguidas sobre la misma ruta no confundan al testigo:
  el barrido fue de una por vez, con su restauración en el medio.

## Cómo se llegó hasta acá, incluida la regla que se rompió

Este documento tenía una **regla provisional**: «hasta que la tabla y el texto
de INV-011 existan, ninguna historia con capacidad de escritura se implementa».

**Se rompió.** El 2026-09-09 la aplicación escribió la ganancia de un previo
contra la consola real, cerrando el lazo de medir → proponer → aplicar →
verificar, con la política todavía incompleta. La regla ya no está arriba
porque dejó de aplicar —la tabla y el texto existen desde el 2026-09-10— y sin
esta nota desaparecería sin dejar rastro de que se la salteó.

Se anota por dos razones. La primera es que **una regla que se borra el día que
se incumple no era una regla.** La segunda es más útil: al cerrar la política
hubo que ir a mirar si lo que ya estaba escrito la cumplía, y **la cumple** —la
ganancia se confirma por testigo, con respaldo de VU y señal presente, que es
justo la fila que la tabla le asigna—. El orden fue el equivocado y el
resultado coincide, y las dos cosas son ciertas a la vez.
