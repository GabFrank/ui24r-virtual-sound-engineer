# ADR-029 — Bajar el auxiliar y el general para cazar un acople

**Fecha:** 2026-09-13
**Estado:** **completa y sin implementar.** Las dos mitades están decididas: la
del auxiliar el 2026-09-12 y la del general el **2026-09-15**. **Ninguna de las
dos cambió el código todavía**, y al final se explica qué haría falta.
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

### La respuesta: **1 — hasta donde estaba, igual que el auxiliar**

Decisión del usuario, 2026-09-15. El general recibe el mismo trato que el
auxiliar: la aplicación **sólo baja**, y el techo para volver a subir es **dónde
estaba antes de que ella lo bajara**. Subir sigue siendo del usuario, «de a poco
buscando el acople nuevamente».

**Y hay que corregir el argumento con el que este ADR dudaba**, porque tenía la
acústica al revés. Decía que «un general que estaba bien con la sala vacía no está
bien con la sala llena», dando por sentado que la sala llena pide **menos** nivel.
Una sala llena absorbe más, así que su tiempo de reverberación **baja**, y con él
baja la energía que vuelve al micrófono: el público **aumenta** la ganancia
disponible antes del acople, no la reduce. Lo que sí sube con la sala llena es el
**ruido del público**, que pide más nivel, no menos.

O sea que el motivo real para que el usuario decida no era «el nivel de antes
quedó alto»: es que **cuánto nivel hace falta depende de la sala y del show, y eso
la aplicación no lo sabe**. La decisión no cambia; el razonamiento sí, y queda
escrito porque un ADR que decide bien por el motivo equivocado vuelve a
equivocarse la próxima vez.

## Trabajo previo

Antes de proponerle estas cuatro opciones al usuario **no se miró qué hace nadie
más**, y él lo señaló: *«¿no habíamos quedado en que nada iba a ser implementado
antes que se investigue en proyectos existentes?»*. De ahí salió la regla de
`vse-disciplina` §7 y su guarda. Lo que apareció al mirar:

- **El supresor de la propia consola ya contesta esta pregunta.** La Ui24R trae
  dbx AFS, y sus filtros en modo **LIVE** se levantan solos: el
  [*Live Filter Lift*](https://help.harmanpro.com/afs-how-it-works) «quita las
  asignaciones de filtro que ya no hacen falta», y los LIVE se reinician solos al
  terminar la función. O sea que la herramienta de acoples que ya está adentro del
  aparato **vuelve sola al estado sin intervención**, que es la opción 1.
  *(Diferencia que importa: el AFS actúa por banda estrecha y vuelve **cuando la
  condición desapareció**, no por reloj. Acá el que comprueba que el acople se fue
  es el usuario subiendo de a poco, que es su método.)*
- **Los *duckers* de cualquier consola** restauran el nivel original completo
  cuando el disparador se va
  ([Rane, nota 155](https://www.ranecommercial.com/legacy/note155.html)). Un
  atenuador automático que **no** vuelve es la excepción, no la regla.
- **Los automixers tipo Dugan** son continuos: reparten ganancia y la devuelven
  sola. No dejan nada abajo.
- **AutoMix** (`automix.live`), el competidor más cercano, tiene un botón «Auto»
  que **baja las bandas que acoplan** —ecualización, no fader— y su propia
  documentación advierte que no se use como destructor de acoples con música
  sonando. No resuelve esta pregunta: la esquiva bajando otra cosa.
- **Mixing Station** tiene [*Re-Gain*](https://mixingstation.app/ms-docs/re-gain/),
  que no es esto: compensa un cambio de ganancia moviendo envíos y faderes en
  sentido contrario para que los monitores no se muevan. Se cita porque el nombre
  invita a confundirlo.
- **Lo que nadie hace** es dejar un fader abajo y no decir hasta dónde puede
  volver. Eso refuerza la opción 4 como la peor: no tocar nada es coherente, pero
  tocar y no declarar el techo no tiene precedente.

Y la literatura respalda que el techo sea **un número guardado y no una
estimación**: la ganancia antes del acople depende de la ganancia **total** del
sistema y del lazo acústico
([*Gain before feedback*](https://en.wikipedia.org/wiki/Gain_before_feedback)),
así que la aplicación no puede calcular «hasta dónde es seguro». Lo único que sabe
con certeza es dónde estaba, y por eso ése es el techo.

## Lo que falta para implementarlo, y por qué no lo hice todavía

**Este ADR decide; el código no cambió.** Hoy `a.N.mix` sigue rechazada: el motor
la clasifica bajo `MONITOR_AUX_SEND` y su lista blanca sólo deja pasar
`i.N.aux.M.value`. Abrirla pide tres cosas, y **la primera no es mecánica**:

1. **Un `kind` propio en el dominio.** Este ADR pide límites más apretados que los
   del envío —1,5 y 3 contra 2 y 4— y `LIMITES` da un tope por `kind`, así que
   meterla en `MONITOR_AUX_SEND` le daría los límites del envío. Agregar un
   `ParameterKind` toca el dominio, el clasificador y los recorridos que cuentan
   rutas escribibles; es un cambio de modelo y va con el usuario mirando.

   **Y ahora son cuatro cosas, no tres**, porque la mitad del general ya está
   decidida: `MASTER_FADER` deja de ser `USER_ONLY` para volverse «sólo baja, con
   techo en dónde estaba», que es el mismo contrato que el envío a monitor. El
   estado por ruta que hace cumplir ese techo ya existe en el motor --es el que
   indexa por cadena cruda, y por eso la forma canónica importa--.
2. **La entrada en la tabla de conversión**, con el tramo medido por el ítem 106.
   No se agregó a propósito: `rutasProbadas()` está documentada como «las únicas
   escribibles por vía cruda», y agregarla mientras la ruta está cerrada haría que
   esa frase deje de ser cierta.
3. **Un llamador**, que tampoco existe para el envío a monitor: el servicio que
   ADR-028 habilitó está escrito y probado y **ninguna pantalla lo llama**.

Decirlo es la diferencia entre una función y la promesa de una función, y este
proyecto ya tiene documentado un commit que dijo que la aplicación «lee» algo que
no leía.
