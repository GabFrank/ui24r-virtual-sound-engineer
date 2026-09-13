# ADR-029 — Bajar el auxiliar y el general para cazar un acople

**Fecha:** 2026-09-13
**Estado:** **parcial y sin implementar.** La mitad del auxiliar queda decidida;
la del general queda **bloqueada esperando una decisión del usuario**, y se dice
cuál. **Ninguna de las dos cambió el código todavía**, y al final se explica qué
haría falta.
**Origen:** **Decisión del usuario**, eligiendo entre opciones el 2026-09-12.
Textual en
[`docs/backlog/decision-bajar-buses-para-cazar-acoples.md`](../backlog/decision-bajar-buses-para-cazar-acoples.md).

## Lo que el usuario decidió

Que la aplicación pueda bajar **el auxiliar y el general** para cazar un acople,
**con el mismo techo**: «*Los dos, con techo*».

Y describió el método que usa, que es de donde sale todo lo demás:

> *«Si el acople es muy fuerte entonces bajo el nivel del auxiliar o pa,
> dependiendo de donde se escucha, luego vuelvo a subir de a poco buscando el
> acople nuevamente.»*

De esa frase salen tres cosas que este ADR respeta: **bajar es de la aplicación,
subir es del usuario**, el techo es «hasta donde estaba antes de que yo lo
bajara», y qué se baja depende de **dónde se escucha** el acople — la cuña o la
sala—.

## Por qué este ADR no existía hasta hoy

`decision-bajar-buses-para-cazar-acoples.md` listaba tres requisitos previos. Dos
eran mediciones y las dos se hicieron el 2026-09-13:

| requisito | estado |
|---|---|
| la ley de `a.N.mix` | **medida**, ítem 106: `faderADb` con 0,010 dB sobre los primeros 42 dB |
| la ley de `m.mix` | **medida**, ítem 107: 0,007 dB sobre los primeros 26 dB |
| **decidir el techo del general** | **falta, y es del usuario** |

Las dos mediciones se hicieron contra un convertidor externo, no contra los
medidores de la propia consola. Y las dos encontraron el mismo residuo positivo
por debajo de los −25 dB —está en
[`hallazgo-los-tres-faderes-y-el-residuo-positivo.md`](../backlog/hallazgo-los-tres-faderes-y-el-residuo-positivo.md)—
que **no cambia nada acá**: la desviación es de 0,05 dB sobre 48, dos órdenes de
magnitud por debajo de los límites de este ADR.

## Las tres rutas no son la misma cosa, y por eso se deciden por separado

| ruta | qué mueve | quién lo sufre | estado |
|---|---|---|---|
| `i.N.aux.M.value` | un canal dentro de una cuña | un músico | **abierta**, ADR-028 |
| `a.N.mix` | **toda** una cuña | un músico, entero | este ADR **decide** abrirla; el código no la abre todavía |
| `m.mix` | **la sala** | el público | este ADR **no** la abre |

## Lo que este ADR acepta: `a.N.mix`

**Sólo bajar.** La aplicación nunca escribe hacia arriba: volver a subir es del
usuario, textual. Una propuesta con la magnitud por encima de donde está se
rechaza antes de llegar al motor.

**Techo de «hasta donde estaba».** El mismo mecanismo que ADR-028 ya tiene
probado: `registrarTecho` guarda dónde estaba la ruta la primera vez que la
aplicación la bajó, el primer descenso gana, y el techo se ancla **después** de
que la consola aceptó la escritura. Quien baja es el dueño de esa memoria.

**Y el techo se olvida si el usuario mueve el fader a mano.** El «donde estaba»
que la aplicación recuerda deja de ser cierto en cuanto él lo toca, y sostenerlo
le impediría subir a donde él ya lo puso.

**Límites, más apretados que los del envío a monitor.** Una cuña entera es más
gente que un canal en una cuña: **1,5 dB por transacción y 3 acumulados en la
sesión**, contra los 2 y 4 del envío. El número no está medido contra nada —es
una decisión de producto— y se dice que lo es.

**No durante el show.** Mismo criterio que ADR-028, y por el mismo motivo: lo que
separa `FULL_BAND` y `RINGOUT` de `SHOW` no es «en vivo» sino **quién está
mirando**.

## Lo que este ADR NO acepta: `m.mix`, y la pregunta que falta

**La ley está medida y eso no alcanza.** Falta decidir **cuál es el techo del
general**, y no lo puedo decidir yo: para una cuña, «hasta donde estaba» es una
respuesta completa —el músico la pidió y la escucha—. Para la sala, el usuario
tiene una referencia que la aplicación no tiene: **cuánta gente hay adentro**.
Un general que estaba bien con la sala vacía no está bien con la sala llena, así
que «hasta donde estaba» puede significar «hasta un nivel que ya no corresponde».

### La pregunta, en la forma más corta que encontré

**¿Hasta dónde puede volver a subir la aplicación el fader del general, después
de haberlo bajado para cazar un acople?**

1. **Hasta donde estaba**, igual que el auxiliar. Simple y consistente; asume que
   el nivel de antes sigue siendo el correcto.
2. **Hasta donde estaba, menos un margen** —1 o 2 dB—. Reconoce que después de un
   acople conviene quedarse un poco abajo.
3. **No sube sola: lo deja abajo y avisa.** La aplicación baja para cazar y el
   usuario decide cuándo y cuánto volver.
4. **No la toca en absoluto**: sólo el auxiliar, y el general se lo deja al
   usuario aunque el acople se escuche en la sala.

Mientras esto no se responda, `MASTER_FADER` sigue `USER_ONLY` y no escribible, y
este ADR queda en **parcial**. Registrar la mitad que sí está decidida es mejor
que no registrar nada: la decisión del usuario sobre el auxiliar es del 2026-09-12
y llevaba un día sin ADR.

## Lo que falta para implementarlo, y por qué no lo hice todavía

**Este ADR decide; el código no cambió.** Hoy `a.N.mix` sigue rechazada: el motor
la clasifica bajo `MONITOR_AUX_SEND` y su lista blanca sólo deja pasar
`i.N.aux.M.value`. Abrirla pide tres cosas, y **la primera no es mecánica**:

1. **Un `kind` propio en el dominio.** Este ADR pide límites más apretados que los
   del envío —1,5 y 3 contra 2 y 4— y `LIMITES` da un tope por `kind`, así que
   meterla en `MONITOR_AUX_SEND` le daría los límites del envío. Agregar un
   `ParameterKind` toca el dominio, el clasificador y los recorridos que cuentan
   rutas escribibles; es un cambio de modelo y va con el usuario mirando.
2. **La entrada en la tabla de conversión**, con el tramo medido por el ítem 106.
   No se agregó a propósito: `rutasProbadas()` está documentada como «las únicas
   escribibles por vía cruda», y agregarla mientras la ruta está cerrada haría que
   esa frase deje de ser cierta.
3. **Un llamador**, que tampoco existe para el envío a monitor: el servicio que
   ADR-028 habilitó está escrito y probado y **ninguna pantalla lo llama**.

Decirlo es la diferencia entre una función y la promesa de una función, y este
proyecto ya tiene documentado un commit que dijo que la aplicación «lee» algo que
no leía.
