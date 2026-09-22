# ADR-039 — El freno viaja con la hoja: la frecuencia y el ancho se acotan en octavas, y poner una banda se hace con la campana en cero

**Estado:** Decidida e implementada el 2026-09-22, **menos la exención del salto
libre**, que espera su medición (ver el recuadro de abajo)
**Fecha:** 2026-09-21
**Origen:** decisión del usuario, entre tres opciones en tres preguntas, sobre la tarea **1b** del plan de la pieza 2. La destapó medir el ítem 121: las doce hojas del ecualizador de canal quedaron medidas y **ninguna de las seis de frecuencia y Q se volvió escribible**.

> **Construida el 2026-09-22.** El freno vive en `packages/domain/src/rules/hojas.ts`,
> la forma de «poner la banda» en `poner-la-banda.ts`, y el acumulado suma en la
> escala del movimiento en `historialDeLaSesion`. El censo de rutas que el motor
> permite volvió **de 690 a 930 exacto**, con el reparto por familia fijado en
> `que-permite-el-motor.test.ts`. **Lo que NO se construyó es la exención del
> salto libre de la decisión 3**: la forma se exige --una transacción etiquetada
> «poner la banda» que no la tenga se rechaza-- y los tres cambios siguen pasando
> por sus topes, así que un salto de dos octavas se rechaza aunque la forma sea
> correcta. Se enciende el día que la medición que falta exista, y no antes.
>
> **Esta ADR pasó por una auditoría adversarial de fidelidad el mismo día**, antes de commitearse, y la auditoría encontró diecinueve cosas. Dos cambiaron la decisión y no sólo la prosa: **el orden de escritura de la operación «poner la banda»** y que **la premisa sobre la que se apoya su exención no estaba medida**. Las dos están abajo, con su nombre. Las demás eran números y atribuciones, corregidos en su lugar.

## Contexto

### El defecto, que no es de medición sino de modelo

El motor tiene **dos guardas que miran la unidad, y cada una la compara contra una tabla distinta**:

- `verificarLimite` (INV-004) compara la unidad que declara quien propone contra la del tope de su **familia**: `LIMITES.CHANNEL_EQ` está en `dB`, `LIMITES.HPF` en `octavas`.
- `atar` (`magnitud-atada.ts`) la compara contra la de la **hoja medida** en `RAW_MAP`: `i.N.eq.bN.freq` está en `Hz`, `i.N.eq.bN.q` en `Q`, `i.N.eq.bN.gain` en `dB`.

Quien propone declara **una sola** unidad. Para una hoja de frecuencia las dos guardas piden cosas distintas, y **ninguna declaración pasa las dos** — comprobado corriendo el motor sobre `i.9.eq.b2.freq`: con `Hz` rechaza INV-004 con `UNIDAD_NO_DECLARADA`, con `dB` rechaza `atar` con `MAGNITUD_NO_ATADA`, y con `Q` o con `octavas` rechazan las dos. Cada guarda tiene razón por separado.

El mensaje del motor lo dice bien: *«CHANNEL_EQ tiene su tope en dB y el cambio declara Hz: comparar los dos números sería comparar especies distintas»*. Un tope de 4 dB no acota un salto de frecuencia.

### Lo que costó verlo, y lo que la medición sí compró

La cuenta de rutas que el motor permite bajó **de 930 a 834 el 2026-09-13** y **de 834 a 690 el 2026-09-21**. Las dos bajadas son la misma: el arnés de pruebas declaraba `dB` para toda ruta, así que las hojas en hercios pasaban una puerta que con la unidad honesta rechazan.

**Y hay que decirlo con la fecha, porque en absoluto es falso.** La comparación de unidad entró al motor el **2026-09-12**; antes de ese día una declaración honesta en hercios pasaba las dos puertas. Lo cierto es que **nunca habían sido escribibles con un tope que significara algo**, que es lo que importa y es más débil que «nunca».

El detalle está en [`hallazgo-un-kind-una-unidad-y-las-hojas-no-coinciden.md`](../backlog/hallazgo-un-kind-una-unidad-y-las-hojas-no-coinciden.md), escrito desde el 2026-09-13, que lo predijo: *«Medir más leyes del ecualizador tampoco las hará escribibles mientras un `kind` tenga una sola unidad»*. Se midieron seis, y no las hizo. *(La frase «mientras eso siga así, medir más leyes del ecualizador no las hace escribibles», que una primera redacción de esta ADR le atribuyó a ese documento, está en el test `que-permite-el-motor.test.ts`. Dicen lo mismo y no es el mismo texto.)*

Lo que el ítem 121 sí compró es **el derecho a escribirlas**, que es otra cosa y hacía falta igual: sin ley medida la regla 1 del repositorio lo prohíbe de entrada.

### Por qué un tope en hercios no es un tope

Un tercio de octava son **26 Hz** sobre una campana parada en 100 Hz y **1300 Hz** sobre una parada en 5 kHz. Al oído son el mismo movimiento. Un número fijo de hercios es enorme abajo y despreciable arriba, así que como freno no acota nada: es la razón por la que se ecualiza y se mide en fracciones de octava, y por la que el analizador de esta consola reparte sus 122 bandas en doceavos de octava y no en hercios.

**Y esto el repositorio ya lo había decidido una vez sin poder ejecutarlo.** El anexo B de la auditoría de producto, del **2026-09-07** —el primer commit del repositorio—, pide *«HPF ≤ 1 octava»* por transacción; el acumulado de 2 octavas por sesión lo agrega `safety-invariants.md` sin citarlo. `LIMITES.HPF` lo declara en `octavas` y `RAW_MAP` declara esa hoja en `Hz`, así que **desde que la comparación de unidad existe, ese tope no pudo correr nunca**. Es el mismo defecto, catorce días antes y en otra familia.

### Lo que está medido, y define el terreno

El tramo que la aplicación puede escribir sale de lo que se barrió, no del recorrido del control: en frecuencia va de **115,2 Hz a 10 943,9 Hz** —6,57 octavas— y en Q de **0,368 a 2,710**.

**Y sobre el Q hay una limitación que hay que escribir con todas las letras, porque esta ADR lo elige como moneda.** El Q se midió **sólo a 1 kHz**. La propia corrida documenta que arriba de unos 3 kHz el ancho medido se despega del Q nominal: **a 10,9 kHz un Q de 1,00 se mide como 1,55**. O sea que la ley crudo → Q está medida, y la conversión de ese Q a un ancho de banda en octavas —`BW = (2/ln2)·asinh(1/2Q)`, que da de 3,21 a 0,53 octavas sobre el tramo de arriba— **describe el ancho nominal, no el ancho real arriba de 3 kHz**. El tope acota el ancho declarado. Medir el ancho real arriba de 3 kHz queda como tarea, y hasta que exista, el freno del ancho vale lo que vale el Q nominal.

### El dato que ordena la decisión, y hasta dónde llega

En las tres corridas buenas del ítem 121 —las cuatro campanas del canal 10 en su ganancia neutra, paradas donde el preajuste las dejó—, meter el ecualizador entero contra puentearlo cambió la **forma** de la respuesta **0,15 dB**, **0,19 dB** y **0,11 dB**, con una dispersión punto a punto de **0,033**, **0,027** y **0,030 dB**. La cuarta corrida archivada de ese día, con el instrumento todavía sin compensar, dio **1,00 dB** en el mismo control y está declarada inválida en su propia cabecera. Ver [`curvas-banda-2-2026-09-21b.txt`](../spikes/SPK-P0.2b/evidence/curvas-banda-2-2026-09-21b.txt), [`curvas-banda-3-2026-09-21.txt`](../spikes/SPK-P0.2b/evidence/curvas-banda-3-2026-09-21.txt), [`curvas-banda-4-2026-09-21.txt`](../spikes/SPK-P0.2b/evidence/curvas-banda-4-2026-09-21.txt) y [`curvas-banda-2-2026-09-21.txt`](../spikes/SPK-P0.2b/evidence/curvas-banda-2-2026-09-21.txt).

**Tres salvedades, y la tercera es la que importa.**

1. Ese control **resta a cada captura su propia media** antes de comparar, así que mide que la forma no cambia; **una diferencia uniforme de nivel es invisible ahí**. El propio archivo lo advierte.
2. La diferencia no es sólo de las campanas: la evidencia se la atribuye a las bandas **más el pasa-altos y el pasa-bajos**, que también están adentro.
3. **Lo medido es una configuración quieta, no una campana moviéndose.** Nadie corrió una campana neutra de lugar y midió. De esta evidencia sale una cota —dos configuraciones que distan menos de 0,19 dB del puenteo pueden distar hasta 0,38 dB entre sí—, y **el corolario «correr una campana que está en cero no se oye» no está medido**. Lo dice la teoría del filtro —una campana en ganancia unidad es transparente cualquiera sea su centro— y lo sugiere esta cota, y eso no es lo mismo.

## Decisión

### 1. La aplicación mueve las tres hojas de una banda

Dónde trabaja la campana, qué tan angosta es y cuánto sube o baja. **Elección del usuario entre tres**, contra «sólo cuánto sube o baja» —lo vigente por accidente— y «dónde y cuánto, el ancho no».

Es lo que la fuente 2 de [ADR-038](ADR-038-el-criterio-del-ecualizador-de-canal.md) necesita: poner una banda encima de la resonancia que la medición encontró, y afinarla hasta que deje de sobresalir.

### 2. El freno viaja con la hoja, no con la familia

`LIMITES` deja de dar **una** unidad por categoría. Cada hoja declara la suya, con la familia como valor por omisión para todo lo que no la declare.

Y se separan dos cosas que hasta hoy eran una sola:

- **La unidad de la magnitud** sigue siendo la de la hoja medida —`Hz`, `Q`, `dB`— y no cambia, porque es lo que ata el número que el motor juzga al crudo que va al cable. Tocarla sería desarmar `atar`.
- **La escala del movimiento** es nueva y es la que se acota. En la ganancia es la diferencia en decibeles, como siempre. **En la frecuencia son octavas**: el movimiento de una campana de `f1` a `f2` es `log2(f2/f1)`. **En el ancho son octavas de ancho de banda** —con la limitación del Q nominal dicha arriba—: misma moneda que la frecuencia, que es la tercera elección del usuario.

El tope por transacción y el acumulado por sesión se cuentan **en la escala del movimiento**, no en la unidad de la magnitud.

### 3. Poner una banda es una operación propia, se hace con la campana en cero, y la ganancia va primero

**Elección del usuario entre tres**, contra un tope en octavas que rigiera siempre, en dos tamaños.

Poner una banda es **una transacción de tres cambios sobre la misma banda del mismo canal, en este orden**: la ganancia a 0 dB, después la frecuencia, después el ancho. El salto de frecuencia y de ancho **no lleva tope por transacción**: lo que lo acota es el destino, que tiene que caer dentro del tramo medido, igual que ADR-034 decidió para la salida del silencio —*«lo que lo acota no es el delta sino el destino»*—.

**El orden es parte de la decisión y no un detalle de implementación.** El ejecutor escribe los cambios de una transacción **uno por uno, en el orden de la lista**, con su espera en el medio: los intermedios suenan. Con el orden al revés, el salto de frecuencia sale al cable con la campana todavía en su ganancia vieja —que por el propio tope de 4 dB que esta ADR conserva puede ser de hasta cuatro decibeles—, y cuatro decibeles de campana barriendo el espectro se oyen. Una primera redacción de esta ADR no decía nada del orden y afirmaba igual que el salto era mudo; lo encontró la auditoría.

El permiso sale de que **la campana queda muda**: una campana en ganancia unidad es transparente, esté donde esté su centro.

**El cambio de ganancia NO está exento**: sigue con su tope de siempre. La consecuencia honesta es que una banda que viene con más de 4 dB puestos no se puede poner en cero de una sola vez, y eso es lo correcto: bajar doce decibeles de golpe sí se oye.

**Y la exención queda condicionada a una medición que falta.** Lo que sostiene que el salto es mudo es la teoría del filtro y una cota, no una medición de este aparato (ver la tercera salvedad de arriba). Antes de encender la exención hay que **correr una campana neutra a lo largo del tramo medido y comprobar que la respuesta no se mueve**, con el mismo banco del ítem 121. Es barato y es la regla 1 del repositorio: no se construye sobre lo que nadie comprobó. Mientras esa medición no exista, lo demás de esta ADR se puede implementar y la exención no se enciende.

### 4. Con ganancia puesta, el retoque se acota en octavas

Una vez que la banda tiene ganancia, correrla o ensancharla **sí** lleva tope, en la escala del movimiento y con escucha entre paso y paso, como todo lo demás.

### Lo que la implementación agregó, y el usuario no decidió

Dos números que ADR-039 no fijó y que hubo que elegir para construir. Quedan
marcados acá y no escondidos en el código:

- **El pasa-bajos, `eq.lpf.freq`, toma los números del retoque** —un tercio de
  octava por paso, una octava por sesión— y no los del pasa-altos. Esta ADR lo
  recupera entre las 240 rutas y no le pone número; es una frecuencia y no es
  una banda, así que ninguna de las dos decisiones anteriores lo cubre. Se toma
  el más apretado de los dos porque correr el corte de agudos un tercio de
  octava ya es un cambio de timbre que se oye.
- **`eq.hpf.slope` no cambia de conducta.** El arreglo del pasa-altos va en la
  hoja `eq.hpf.freq` y no en su familia justamente por eso: bajo `HPF` cae
  también la pendiente del filtro, que no tiene ley medida y no es una
  frecuencia. Ponerle hercios a la familia la habría sacado del censo sin que
  nadie lo decidiera. Qué significa mover una pendiente es una pregunta que esta
  tarea no abre.

### Lo que es operacionalización del agente, y no decisión del usuario

Se separa a propósito, porque esa autoría ya se invirtió una vez en este repositorio y `safety-invariants.md` pide no fusionarlas. **El usuario eligió las tres cosas de arriba.** Lo de abajo lo propone el agente y queda sujeto a revisión:

- **Los números del retoque: un tercio de octava por paso y una octava acumulada por sesión**, para la frecuencia y para el ancho. El tercio de octava es el paso más fino con que se ecualiza y son cuatro bandas del analizador de esta consola, así que un paso se puede **comprobar midiendo**; con un doceavo, el movimiento cae dentro de una sola banda y la comprobación no distingue. La octava acumulada son tres pasos, y el presupuesto es chico a propósito porque poner la banda ya no lo gasta: lo que queda es afinar.
- **El orden de los tres cambios**, y que el motor lo exija en vez de confiar en quien propone.
- **La forma de la operación «poner la banda», y que se compruebe sobre el contenido de la transacción.** El motor exige que los tres cambios sean de la misma banda del mismo canal, en ese orden, y que la ganancia quede exactamente en cero. Es la misma forma de `correspondeExencionDeSistema`, que **pide la etiqueta y además comprueba que el contenido la respalde**: la etiqueta es necesaria y no suficiente, que es lo que impide *«pedir la exención diciendo que se la merece»*. *(Una primera redacción decía «del contenido y no de una etiqueta», y esa función mira las dos cosas.)*
- **Que la familia siga siendo el valor por omisión** en vez de obligar a toda hoja a declarar su tope. Lo contrario dejaría sin tope a cualquier hoja que alguien agregue y se olvide, que es fallar abierto.

## Consecuencias

**Qué se gana.**

- **Las doce hojas del ecualizador de canal quedan escribibles**, que es lo que desbloquea la pieza 2 entera. La cuenta recupera **240 rutas**, y conviene decir cuáles son porque no son las doce hojas: son **las ocho de frecuencia y Q de las cuatro bandas, más `eq.lpf.freq` y `eq.hpf.freq`, por veinticuatro canales**. Las cuatro ganancias nunca se cayeron. Comprobado corriendo el motor: hoy permite 690, no hay ninguna otra ruta del inventario rechazada sólo por unidad, y devolverlas da **exactamente 930** y ni una más — el mismo número que dejó ADR-028. Si sube más que eso, entró algo que nadie decidió, y el test por familia es el que lo dice.
- **El pasa-altos gana un tope que hasta hoy no podía correr.** El de 1 octava empieza a funcionar el día que la escala del movimiento exista.
- **El compresor queda cubierto en lo que es el mismo defecto.** Sus cinco hojas se reparten en tres monedas —el umbral y la ganancia de salida en decibeles, los tiempos en milisegundos, la relación **sin unidad**—, así que la forma de la tabla le sirve igual. **Lo que no le sirve es la escala del movimiento de la relación**, que no tiene unidad, tiene su ley refutada y tiene la escala invertida: en qué moneda se acota ese movimiento es una decisión propia y sigue pendiente.
- **Poner una banda entra en una sola transacción de nivel ASSISTED**: tres cambios contra el máximo de cuatro de INV-005. **En AUTO el máximo es uno**, así que ahí no entra, y eso es coherente con que poner una banda es un movimiento grande.

**Qué se pierde y qué cuesta.**

- **`LIMITES` deja de ser una tabla plana por familia.** La consultan **siete** sitios: `verificarLimite`, el techo absoluto del motor, dos lecturas del historial de la sesión y **tres en `packages/assistants`**, que no son el motor. Y hay un costo que una primera redacción se saltó: **`ContextoCambio` no tiene la ruta**, así que leer el tope por hoja cambia la interfaz pública de `@vse/domain`, no sólo el cuerpo de una función.
- **El acumulado por sesión cambia de moneda** para las hojas de frecuencia y de ancho, así que lo que el historial suma deja de ser una resta de magnitudes.
- **Una banda con mucha ganancia tarda en poder moverse**: hay que bajarla a cero en pasos de 4 dB con escucha entre uno y otro antes de poder correrla libre.

**Qué queda abierto y pide su propia decisión.**

- **Medir que una campana neutra se puede correr sin que se oiga**, que es la condición de la exención de la decisión 3.
- **Una banda con más de 6 dB puestos no puede llegar a cero en una sesión, y esta ADR dice lo contrario.** Arriba está escrito que «bajar doce decibeles de golpe sí se oye» y que se baja «en pasos de 4 dB con escucha entre uno y otro», y eso describe una operación que el presupuesto acumulado de `CHANNEL_EQ` —6 dB por sesión— no permite: 12 → 8 pasa, y 8 → 4 ya acumula 8. **Encontrado el 2026-09-22 al construir la 1b**, por el auditor que fijó las expectativas antes de ver la implementación. No se tocó nada: subir ese presupuesto es una decisión con consecuencia audible y es del usuario. Mientras tanto la consecuencia honesta es más fuerte que la que esta ADR escribió: una banda muy realzada no se puede neutralizar entera en una sesión, así que tampoco se puede mudar.
- **«Poner la banda ya no gasta el presupuesto» tampoco tiene mecanismo.** Se dice arriba, al justificar por qué el acumulado del retoque puede ser chico, y `historialDeLaSesion` suma **todo** cambio verificado: el único rebase que existe es el ancla de ADR-034, restringida a los tipos que declaran `techoAbsoluto`, y `CHANNEL_EQ` no declara ninguno. Hoy no se observa porque la exención está apagada y no hay salto grande que escribir; **el día que se encienda hay que resolverlo**, o el primer retoque nacerá con el presupuesto ya gastado por la mudanza. Mismo origen y misma fecha.
- **Medir el ancho real arriba de 3 kHz**, donde el Q nominal y el ancho medido se separan.
- **Cargar una curva con nombre son doce cambios** —cuatro bandas por tres hojas— contra el máximo de cuatro por transacción. Esta ADR no lo resuelve: es la tarea 7 del plan y la fuente 1 de ADR-038, y tiene además el problema de que un preajuste del usuario es de canal entero y trae dinámica y puerta adentro.
- **Cuándo dos bandas del mismo canal son el mismo destino audible** lo decidió [ADR-035](ADR-035-el-tope-es-por-parlante-no-por-clave.md) y sigue sin implementar; ahí vive el criterio de cuántas octavas de solapamiento cuentan como el mismo punto. Con las tres hojas abiertas, esa pregunta deja de ser teórica.
- **Qué cuenta como «sobresale» y qué cuenta como «mejoró»** sobre el espectro de 122 bandas. Es el corazón del asistente, es la tarea 4 del plan, y se decide con su propia medición.

**Lo que esta decisión NO garantiza, dicho con todas las letras.** El motor no lee la consola: compara números que declara el mismo llamador. Que la banda quede en cero es una propiedad de **lo que la transacción declara**; quien ata cada ruta al estado real del aparato es `coincideConEsperado` (INV-011), después del veredicto y antes de enviar, devolviendo `CONFLICT` — y lo hace **ruta por ruta**, así que no ata por sí solo la ganancia al instante en que sale la frecuencia. Eso lo tiene que dar el orden, que por eso es parte de la decisión y no un detalle. La garantía que se sostiene, enunciada sobre el cable: **la frecuencia no sale antes que la ganancia, y si la ganancia no coincide con lo declarado, la transacción aborta antes de escribirla.** Lo que ya está escrito de una transacción abortada **queda escrito**: el ejecutor no revierte solo.

## Alternativas descartadas

**A. Partir `CHANNEL_EQ` en tres categorías** —ganancia, frecuencia y Q—. Es el cambio más chico **hoy**: la tabla sigue siendo plana por familia. Se descarta porque **repite el problema en la familia siguiente**: el compresor necesitaría tres cortes, la puerta los suyos, y cada corte toca `OWNERSHIP`, el clasificador de rutas y el razonamiento de ADR-035, que habla de `CHANNEL_EQ` como una cosa. Multiplica las categorías para no tocar la forma de la tabla, y la forma de la tabla es el defecto.

**B. Dejarlo como está y decirlo**: el ecualizador se escribe en decibeles, o sea sólo la ganancia, y la frecuencia y el ancho son del usuario. **Es lo que el motor hace hoy, sin que nadie lo hubiera elegido**, y es una posición de producto defendible. Se ofreció y el usuario la descartó: con las cuatro campanas donde las dejó el preajuste, la aplicación no puede poner una banda encima de una resonancia, que es exactamente la fuente 2 de ADR-038.

**C. Acotar el movimiento en hercios**, que es la unidad de la hoja. No se ofreció, y se anota para que nadie la proponga de nuevo: un tercio de octava son 26 Hz a 100 Hz y 1300 Hz a 5 kHz. Un número fijo de hercios no acota un movimiento, lo acota en un punto del espectro y en ningún otro.

**D. Acotar el movimiento en crudo**, que es la única moneda que todas las hojas comparten: todas van de 0 a 1. Tentador y **es exactamente el defecto que INV-004 ya pagó**. Hasta el 2026-09-11 el motor restaba crudos y los comparaba contra topes en decibeles, y el mayor salto que dejaba pasar era de 61,9 dB, el recorrido entero del previo. Un tope en crudo esconde cuán grande es el movimiento, que es lo único que un tope tiene que saber.

**E. Un tope en octavas que rija siempre, sin la operación «poner la banda».** Se le ofreció al usuario en dos tamaños y no eligió ninguno. Con un tercio de octava por paso, correr una campana de punta a punta son veinte pasos, y con los diez segundos de escucha que esta categoría exige eso es **más de tres minutos** — en un soundcheck no pasa. *(Una primera redacción dijo «más de cuatro minutos», que es el número inflado y justo en la dirección que hace peor a la alternativa descartada.)* Con una octava por paso son siete, pero si la banda ya tiene ganancia puesta cada paso es un cambio de timbre grande: se gana velocidad donde no hace falta y se pierde suavidad donde sí.

**F. Condicionar el tope a la ganancia que la banda tenga en la consola.** Es lo mismo que se decidió, dicho de una forma que el motor **no puede comprobar**: el motor no lee el aparato. Construirlo así habría sido una guarda que depende de un dato que no tiene, o peor, de un dato que le pasa el que pide el permiso. Por eso la condición se construye sobre el contenido de la transacción, que es lo único que el motor sí ve entero.

## Trabajo previo

**Los cuatro repositorios del protocolo, clonados y grepeados de nuevo el 2026-09-21** —no recordados—, con sus commits en la fila nueva de [`trabajo-previo-de-terceros.md`](../referencia/trabajo-previo-de-terceros.md). Dos cosas, y la primera corrige a esta misma ADR:

- **`fmalcher` SÍ tiene un tope por parámetro, en la unidad de ese parámetro y con un valor distinto por hoja**, que es justo la forma que esta ADR adopta: `sanitizeDelayValue` recorta el retardo a **250 ms en un canal de entrada y 500 ms en un auxiliar**. Una primera redacción de esta sección escribió que ninguno de los cuatro tenía topes por parámetro «ni por familia ni por hoja», y era falso — la quinta vez que este repositorio escribe la versión cómoda de un «no encontré», y la encontró la auditoría del mismo día. El grep había buscado `maxDelta`, `maxStep`, `rateLimit` y `clamp`, y esto se llama `sanitize`.
- **Lo que sí sobrevive, y es la pregunta de esta ADR: ninguno de los cuatro acota cuánto se mueve un parámetro entre una escucha y la siguiente.** Todos sus topes son sobre **dónde queda** —la especie de `techoAbsoluto`—, y ninguno toca la frecuencia ni el Q de una banda del ecualizador de canal, comprobado con palabras distintas de las de la fila. Para el freno que esta ADR decide **no hay precedente en los cuatro**, y eso significa más cuidado, no menos.

**Que la moneda de la frecuencia sea la octava no es una elección nuestra.** Se ecualiza y se analiza en fracciones de octava porque el oído es logarítmico, y un ancho fijo en hercios es enorme abajo y despreciable arriba ([Prosoundtraining, *Why do we equalize in 1/3-octave bands?*](https://www.prosoundtraining.com/2019/07/26/why-equalize-in-1-3-octave-bands/); [Rational Acoustics, *Linear and Logarithmic Frequency Scales*](https://support.rationalacoustics.com/support/solutions/articles/150000214526-linear-and-logarithmic-frequency-scales)). El relevamiento está en [`trabajo-previo-ecualizacion-automatica.md`](../referencia/trabajo-previo-ecualizacion-automatica.md), sección nueva del 2026-09-21.

**Que la unidad y el recorrido se declaren por parámetro, y no por módulo, es la forma que usan los formatos de plugin.** CLAP declara para **cada** parámetro su nombre, su mínimo, su máximo y su unidad ([`clap/ext/params.h`](https://github.com/free-audio/clap/blob/main/include/clap/ext/params.h)); VST3 y AU hacen lo mismo. Vale como forma probada por otros, no como verdad: ninguno de esos formatos acota por seguridad cuánto se mueve un parámetro, porque no escriben en el aparato de nadie.

**Y adentro de la propia consola, un precedente y medio.** El entero: su analizador reparte 122 bandas en **doceavos de octava**, o sea que el aparato con el que la aplicación va a verificar ya mide en la moneda que esta ADR elige. El medio: su supresor dbx describe cada filtro que planta con un ancho, pero **lo expresa en Q y no en octavas**, que es justamente la magnitud que esta ADR decide convertir — y su escritura está `DESCONOCIDO`. Una primera redacción lo presentó como precedente de la octava y no lo es.

**Lo que NO se encontró, dicho explícito.** **No hay coincidencias en otros proyectos** sobre acotar por seguridad cuánto puede moverse una banda entre una escucha y la siguiente. `Gullfoss` limita **el rango del espectro en el que se le permite actuar**, no el tamaño de cada movimiento; `soothe2` y `Curves AQ` son procesadores que mueven filtros propios adentro de su complemento, sin escribir en el aparato de otra persona, así que la pregunta del freno no se les presenta. Que no haya precedente es una de las razones por las que los números del retoque quedan marcados como operacionalización del agente.
