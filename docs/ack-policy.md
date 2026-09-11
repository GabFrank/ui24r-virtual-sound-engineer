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
| ¿En cuánto ve el testigo una escritura hecha por la principal? | **11,5 ms de mediana** sobre ocho muestras. **Decía 27 ms** — una sola muestra, con el calentamiento adentro, retirada por ADR-024 el 2026-09-09 y todavía circulando acá el 2026-09-10 |
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
de 500 ms, y restaurar. **18 de 18 difundidas en las tres corridas**, con
medianas de 17, 18 y 17 ms; mínimo 12 y máximo 29 entre las tres. Las 18
quedaron restauradas según la relectura del arnés, y **once de ellas** además
comprobadas desde fuera con un volcado HTTP nuevo.
`spikes/SPK-ACK-POLICY/evidence/barrido-testigo-2026-09-10.txt` y
`spikes/SPK-ACK-POLICY/evidence/barrido-testigo-2026-09-10b.txt`; la primera de
las tres está transcrita al pie de la primera, porque antes solo vivía en la
terminal de quien la corrió.

**Remedido con `medir.mjs` el 2026-09-11**, porque aquella primera era una
transcripción: `spikes/SPK-ACK-POLICY/evidence/barrido-testigo-2026-09-11.txt`.
**18 de 18** otra vez.

**Aquí se afirmó algo sin archivo, y hubo que arreglarlo.** Se dijo que las
dieciocho habían quedado comprobadas desde fuera «con cero claves más movidas en
toda la consola», y esa comparación vivía en la terminal de quien la corrió —
exactamente lo que este documento llama transcripción, en el párrafo de al lado.
Lo marcó una auditoría. Ahora **la comprobación la hace la propia medición y
queda en su archivo**: `evidence/barrido-testigo-2026-09-11b.txt` lee las **6732
claves** por HTTP antes y después, y dice *«rutas tocadas que NO volvieron a su
valor: ninguna; otras claves que cambiaron: ninguna»*. En ese mismo archivo queda
la enumeración del canal antes de escribir: silenciado, fader en 0,0000, sin
nombre, **cero envíos abiertos a auxiliares y cero a efectos**.

**Y la latencia no reprodujo.** Aquellas tres corridas dieron medianas de 17, 18
y 17 ms; las dos del 2026-09-11 dieron **mediana 0, con máximo 1**. La conclusión
que sostiene el criterio —el testigo ve todo lo que la consola difunde— aguanta.
El número no, y **la explicación que se publicó tampoco**: se dijo que era «la
red de esa noche», y una auditoría señaló que el guion no cambió, el canal es el
mismo y las rutas son las mismas, y que una mediana de cero milisegundos para
escribir por la red y que otro socket vea la difusión no describe una red rápida.
**Por qué cambió no está medido**, y dejarlo dicho así es más honesto que la
explicación cómoda.

Aquella primera corrida, la transcrita:
`spikes/SPK-ACK-POLICY/evidence/barrido-testigo-2026-09-10.txt`.

El barrido usó el canal 17 —sin nombre, silenciado, fader abajo— con un punto de
retorno guardado antes de escribir nada, como manda INV-001.

| Familia | Rutas | Método | Respaldo | Estado |
|---|---|---|---|---|
| Fader de canal | `i.N.mix` | **TESTIGO** | **VU** sobre el medidor de **salida**, con señal ≥ −50 dB | Medido **con señal**; la mitad «sin señal» se midió sobre la ganancia |
| Fader general | `m.mix` | **TESTIGO** | — (el general no está cableado al respaldo) | Inferido |
| Silencio de canal | `i.N.mute` | **TESTIGO** | — (ver abajo: el silencio no tiene «cuánto» esperado) | Medido |
| Panorama | `i.N.pan` | **TESTIGO** | — | Medido |
| Nombre | `i.N.name` | **Ninguno hoy**: es `SETS` y el testigo solo correlaciona `SETD` | — | — |
| Inversión de fase | `i.N.invert` | **TESTIGO** | — | Medido |
| Retardo de canal | `i.N.delay` | **TESTIGO** | — | Medido |
| Ganancia del previo | `hw.N.gain` | **TESTIGO** | **VU** sobre el medidor de **entrada**, con señal ≥ −50 dB | Medido |
| Alta impedancia | `hw.N.hiz` | **TESTIGO** | — | Medido |
| Envío auxiliar: nivel | `i.N.aux.B.value` | **TESTIGO** | — | Medido |
| Envío auxiliar: silencio | `i.N.aux.B.mute` | **TESTIGO** | — | Medido |
| Envío auxiliar: punto de derivación | `i.N.aux.B.post`, `.postproc` | **TESTIGO** | — | Medido (`post`) |
| Ecualizador de canal | `i.N.eq.*` | **TESTIGO** | — | Medido (2 de sus rutas) |
| Dinámica, puerta, deesser | `i.N.dyn.*`, `i.N.gate.*`, `i.N.deesser.*` | **TESTIGO** | — | Medido (1 de cada) |
| Protegido y grabación | `i.N.safe`, `i.N.mtkrec` | **TESTIGO** | — | Medido |
| Salidas y matriz | `a.B.*`, `m.mtx.B.*`, `m.delayL/R`, `m.eq.*` | **TESTIGO** | — | Inferido |
| Guardar instantánea | `CREATESHOW`, `SAVESNAPSHOT` | **Relectura de `SNAPSHOTLIST`** | — | Medido |
| Borrar instantánea | `DELETESNAPSHOT` | **Relectura de `SNAPSHOTLIST`**, y avisa lo que sobrevivió | — | Medido en el adaptador |
| Alimentación fantasma | `hw.N.phantom` | **No aplica**: INV-007 la deja en solo lectura | — | — |
| Solo | `i.N.solo` | — (sin medir) | — | No se midió a propósito: suena en los auriculares de alguien |
| Fuente del analizador | `var.rta` | **Ninguno hoy**: es `SETS` | — | — |

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
testigo no tiene qué correlacionar. La confirmación es **releer la lista**:
`SNAPSHOTLIST` y comparar.

**Las dos releen, y las dos se comprueban.** `guardarInstantanea()` verifica que
el nombre esté en la lista releída, y si no está devuelve `null` y INV-001
aborta. La retención hace lo mismo con lo que borró: si alguna automática
sobrevive, avisa por `alNoPoderBorrar`. No aborta la transacción —el punto de
retorno ya se guardó, y la retención es orden y no seguridad— pero **no puede
ser silenciosa**, porque el modo de fallo es que el show crezca sin límite sin
que nadie se entere.

**El borrado iba a ciegas hasta el 2026-09-10**, y encima **nunca había borrado
nada desde el adaptador**: todas las corridas tenían menos de veinte
automáticas, o sea por debajo del máximo. Se llenó el show a propósito para
comprobarlo.

**Cuánto tarda la relectura: 6 ms de mediana** sobre **84 pedidos en tres
corridas**, mínimo 5 y máximo 13 —salvo **un único caso de 277 ms**, que no se
repitió en sesenta intentos seguidos—. Acá decía «del orden de un segundo», que
era una cifra inventada: `SNAPSHOTLIST` contesta **más rápido que el testigo**.

Con un solo 277 en 84, los 500 ms que `pedirLista()` tomaba prestados del plazo
de escritura **habrían alcanzado**, con menos del doble de margen sobre el peor
caso. El plazo propio de 1 500 ms se sostiene igual —cinco veces el peor caso, y
no cuesta nada porque pasa una vez por transacción y no una por escritura— pero
por esa razón y no por la otra. **Contar ese 277 como si fuera lo habitual era
apoyarse en una corrida que no estaba archivada**, que es el mismo error que ya
apareció dos veces en esta sesión.

**Y al vencer ya no miente.** Devolvía `[]`, o sea lo mismo que un show sin
instantáneas: quien llamaba no podía distinguir «no hay ninguna» de «no sé». Con
esa confusión, un vencimiento hacía que `guardarInstantanea()` devolviera `null`
y que INV-001 abortara con un motivo que no mencionaba el vencimiento por ningún
lado. Ahora devuelve `null` cuando no hubo respuesta, y **sin lista no se manda
ningún borrado**.

## INV-011, texto normativo

**Antes de escribir.** Toda escritura va precedida de una comparación entre el
valor que la transacción cree actual y el que el almacén tiene, y el almacén
tiene que estar en estado válido. Si está inválido —por ejemplo tras una
avalancha, INV-021— o si los valores difieren, la transacción pasa a CONFLICTO y
**no se escribe**.

**Después de escribir.** Se espera confirmación **≤ 500 ms**. El plazo sale de la
medición con holgura: la mediana está entre 11,5 y 18 ms según la corrida, y el
**máximo observado es 34 ms** —la primera muestra de ADR-024, con el
calentamiento adentro—. Quinientos milisegundos son unas **quince veces** el peor
caso medido; si se agota, lo que pasó no es que el testigo llegara tarde.

> Acá decía «el máximo observado es 27» y «más de dieciocho veces». Los 27 ms son
> justo el número que **ADR-024 retiró** por ser una sola muestra. Es el mismo
> error que ya se cometió con el recorrido del medidor: un número viejo que
> sigue circulando porque suena familiar.

**Quién confirma, en este orden:**

1. **`WITNESS`** — la segunda conexión testigo vio a la consola difundir esa ruta
   con ese valor. Es el mecanismo normal y cubre el árbol de estado **numérico**:
   el testigo correlaciona `SETD` y **descarta los `SETS`** —`if (m.tipo !==
   'SETD') return;`—, que solo le sirven para detectar el fin del volcado. Un
   nombre de canal o la fuente del analizador **no se pueden confirmar así hoy**.
2. **`VU`** — **entra cuando el testigo no pudo abrir**, que es la wifi saturada
   en pleno show: el testigo es una conexión más y es lo primero que falla. Vale
   solo para **fader y ganancia**, y **solo con señal ≥ −50 dB**
   (`NIVEL_MINIMO_PARA_CONFIRMAR_DB`). Exige que el nivel se mueva en la
   dirección correcta y al menos la mitad de lo pedido: parecerse al cambio
   esperado no alcanza, porque con 1 dB pedido y 1,5 de tolerancia, quedarse
   quieto entraría.

   **Y el canal se saca del enrutamiento real, no del número del previo.**
   `i.N.src` puede apuntar a cualquier `hw.M`, así que el previo 10 no siempre
   alimenta al canal 10. **Si no se sabe qué canal alimenta, no se escribe**: es
   la misma decisión que toma la lectura de ganancia cuando le falta el `src`, y
   suponer el de fábrica sería mirar el medidor de otro. Comprobado contra la
   consola que el camino de fábrica sigue funcionando —`APPLIED`/`VU` con el
   `src` presente—: `spikes/SPK-ACK-POLICY/evidence/respaldo-enrutamiento-2026-09-10.txt`.
   El enrutamiento cruzado no se pudo probar en el aparato porque **`i.N.src` no
   es escribible por protocolo**; lo cubren los tests.

   **Cada parámetro se juzga en su propio medidor y no son intercambiables**: la
   ganancia en el de **entrada** y el fader en el de **salida**. El medidor de
   entrada está después del previo y antes del fader —medido el 2026-09-08—, así
   que juzgar un fader ahí daría «no se movió» siempre y una escritura buena
   saldría rechazada.

   **El silencio queda afuera a propósito.** No tiene un «cuánto tenía que
   moverse»: va al piso. Confirmar «llegó al piso» necesita otra regla —cuánto
   es el piso, cuánto tarda, qué pasa si ya estaba en silencio— y meterlo con un
   valor esperado inventado sería peor que no tenerlo, porque parecería
   cubierto.

   **Sin señal no se escribe nada.** Es la decisión de ADR-026: escribir a
   ciegas y marcarlo «no verificable» dejaría al operador sin forma de
   distinguir eso de un cambio que sí funcionó.

   **Todo medido contra la consola el 2026-09-10.** Con el testigo caído y el
   canal en silencio: `REJECTED` y la ganancia quedó idéntica. Con señal, las
   dos vías: la **ganancia** subió 3,00 dB sobre el medidor de entrada y el
   **fader** otros 3,00 dB sobre el de salida, y las dos salieron **`APPLIED` /
   `VU`**.

   **El paso de 3 dB es el doble de la tolerancia, y eso importa.** La primera
   medición del fader usó 1,50 dB, que es **exactamente** la tolerancia: con ese
   paso, un fader que no se hubiera movido queda a 1,5 dB de lo esperado y
   **pasa** la primera condición —`|cambio − esperado| ≤ tolerancia`—, así que lo
   único que se ejercitaba era la segunda guarda. Con 3 dB, un fader quieto queda
   a 3 dB y la primera lo rechaza sola. La afirmación anterior era cierta y medía
   menos de lo que parecía; lo marcó una auditoría.
   `spikes/SPK-ACK-POLICY/evidence/respaldo-fader-3db-2026-09-10.txt`. `spikes/SPK-ACK-POLICY/evidence/respaldo-medidor-2026-09-10.txt`
   --**transcripción sin archivar**, no pasó por `medir.mjs`-- y
   `spikes/SPK-ACK-POLICY/evidence/respaldo-medidor-fader-2026-09-10.txt`.

   **Un límite que se deduce de la regla, y que NO está medido.** Si bajar un
   fader deja el nivel por debajo de −50 dB, el medidor no puede confirmar y la
   escritura tiene que salir sin verificar aunque se haya aplicado. Se observó
   una vez en una corrida **que no se archivó**, así que acá se anota como lo que
   es: una consecuencia de la regla, no una medición. **Ningún archivo de
   evidencia contiene un `UNVERIFIED`.** Cerrarlo cuesta una corrida: poner el
   canal justo encima del piso y bajarle el fader, con `medir.mjs`.
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

- Las filas marcadas **Inferido**: el general, las salidas y la matriz.
- *(Nada de `SNAPSHOTLIST`: se midió el 2026-09-10 y está más arriba. Este ítem
  quedó de una versión anterior de la lista.)*
- Nada del respaldo por VU: las dos mitades quedaron medidas el 2026-09-10.
**Ya no está acá lo de «dos escrituras muy seguidas»: se midió el 2026-09-10 y
tiene su propia sección arriba.**

## La consola difunde en un tic, y eso le pone un piso al mecanismo

**Medido el 2026-09-10.** La consola no difunde cada escritura: junta los
cambios de una ventana de **~34 ms** y manda **el último valor** de cada ruta.
Escribiendo 40 veces cada 15 ms llegan 20; cada 5 ms llegan 5; cada 40 ms o más
llegan las 40, y ahí los intervalos quedan cuantizados en múltiplos del tic —67
para escrituras cada 60 ms, 100 para cada 100—. Es el mismo ~33 ms de la
cadencia de `RTA`: hay un solo reloj de difusión.
`spikes/SPK-P0.9/evidence/cadencia-difusion-2026-09-10.txt`.

**La consecuencia sobre INV-011, medida y no deducida.** Dos escrituras a la
misma ruta dentro de un tic producen **una sola línea, con el segundo valor**:
la primera se aplica y su confirmación no llega nunca. Con las dos pegadas, 0 de
5 confirmaciones para la primera; entre 5 y 25 ms sale a suertes según dónde
caiga el borde del tic —2, 1 y 3 de 5—; **a partir de un tic completo, 5 de 5
siempre**. `spikes/SPK-P0.9/evidence/testigo-en-el-tic-2026-09-10.txt` — **transcripción sin archivar**, no pasó por `medir.mjs`.

**Qué protege hoy a la aplicación.** INV-005 pauta las escrituras secuenciales
cada **≥ 100 ms**, casi tres tics. Las escrituras normales quedan fuera del
agujero con margen.

**Dónde sí queda expuesto, y por qué no es un defecto abierto.** La misma
INV-005 exime a las **transacciones de sistema** del límite de cuatro parámetros
y les pone un pacing de **≥ 20 ms**, que está por debajo del tic. Ahí la
confirmación por testigo no es fiable. No es un agujero abierto porque esas
transacciones se verifican por **lectura del conjunto completo** dentro de un
segundo del último write, que es otro mecanismo y no depende del testigo. Queda
escrito para que nadie las «mejore» pasándolas a confirmación por testigo
creyendo que sube el rigor: las estaría dejando peor.

## Cómo se llegó hasta acá, incluida la regla que se rompió

Este documento tenía una **regla provisional**: «hasta que la tabla y el texto
de INV-011 existan, ninguna historia con capacidad de escritura se implementa».

**Se rompió.** El 2026-09-09 la aplicación escribió la ganancia de un previo
contra la consola real, cerrando el lazo de medir → proponer → aplicar →
verificar, con la política todavía incompleta. La regla ya no está arriba
porque dejó de aplicar —la tabla y el texto existen desde el 2026-09-10— y sin
esta nota desaparecería sin dejar rastro de que se la salteó.

Se anota porque **una regla que se borra el día que se incumple no era una
regla.**

Y hay que corregir lo que se escribió acá el mismo día. Decía: «al cerrar la
política hubo que ir a mirar si lo ya implementado la cumplía, y **la cumple**
—la ganancia se confirma por testigo, con respaldo de VU y señal presente—».
**La segunda mitad era falsa y nunca se comprobó**: el respaldo por VU no estaba
conectado a ningún camino de escritura, así que lo que de verdad pasaba era que
sin testigo no se escribía nada.

Que la frase apareciera justo en el párrafo sobre no borrar los incumplimientos
dice algo incómodo, y vale dejarlo escrito: **el momento de mayor riesgo de
afirmar de más es cuando uno se está felicitando por el rigor.**

> **Todo lo anterior está en pasado a propósito, y también hubo que corregirlo.**
> El respaldo por VU se cableó y se midió el mismo 2026-09-10, unas horas después
> de escribir esa corrección. La frase «sin testigo no se escribe» era cierta
> cuando se escribió y dejó de serlo enseguida, y quedó ahí describiendo el
> presente. Es el mismo error de forma que la corrección venía a señalar —una
> afirmación que envejece sin que nadie la vuelva a mirar— y apareció al repasar
> esta misma sección buscando otra cosa. Lo que hoy pasa está arriba, en la
> tabla y en el texto de INV-011.
