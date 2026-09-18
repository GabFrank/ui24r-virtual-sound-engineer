# Dónde quedamos — segundo cierre del 2026-09-17

**Para quien retome, en cualquier sesión.** Reemplaza a
[`2026-09-17-donde-quedamos.md`](2026-09-17-donde-quedamos.md) en lo que cambió, y
lo deja en pie en lo que sigue valiendo: el estado del banco, el hallazgo del
servicio de audio de la Mac, y lo que el usuario pidió sobre cómo trabajar.

## El estado del equipo del usuario

**Comprobado al cerrar, contra el volcado tomado al abrir esta sesión:**

| | |
|---|---|
| Claves del volcado | **6665 al abrir y 6665 al cerrar** |
| Diferencias | **cero**, clave por clave |
| Filtros plantados en el supresor | **0** — las doce ranuras con ganancia cero |
| Supresor | **encendido** (`m.afs.enabled = 1`), seis fijos declarados, doce en total |
| Grabador y reproductor | ninguna sesión abierta |
| Escrituras a la consola en toda la sesión | **ninguna**: sólo se le pidió el estado |
| Procesos sueltos | ninguno |

**El banco sigue como el 2026-09-16**: salida de la Scarlett → canal 10, master 1
→ entrada 1, aux 5 → entrada 2, perilla en 10 dB. Nadie lo tocó: esta sesión no
midió nada.

### Una corrección al documento anterior, chica y de la clase que importa

El cierre anterior afirmó **«6625 claves antes y 6625 ahora»**. Ese archivo de
comparación no quedó en el repositorio, así que la cifra no se podía auditar. Al
recuperar el retrato de aquella sesión y contarlo, **da 6665 por cualquiera de
los dos métodos que se probaron**, igual que hoy.

**Lo que la comparación sí dice, y es lo que importa, se sostiene**: la consola
está idéntica. Lo que no se sostiene es el número, y es exactamente el defecto que
`validate-cifras-medidas` existe para cazar —una cifra citada sin un archivo
detrás—, esta vez en un documento de cierre, que el validador no mira.

**Queda como tarea pendiente**, abajo.

## Lo que se hizo, en cinco commits empujados

La rama es `claude/soundcraft-ui24-assistant-kh8ezj` y está sincronizada. El árbol
está limpio. **No se abrió ningún PR**: nadie lo pidió.

### 1. `feat(safety)` — el motor separa poner el nivel de una cuña de retocarla

**Es la primera de las tres piezas que le faltaban a la pantalla de monitor**, y
la que la hoja de ruta ponía primero. Implementa el motor de
[ADR-034](../adr/ADR-034-poner-el-nivel-de-monitor-y-retocarlo.md).

El problema era al revés de lo que parecía: no faltaba código de asistente,
**sobraban topes**. Con 4 dB de presupuesto por sesión, levantar una cuña desde el
piso del tramo medido —más de veinte decibeles— era imposible, y el paso 3 del
soundcheck del usuario no se podía dar.

Lo que hace ahora:

- **Mientras la ruta no tiene nivel establecido**, el presupuesto acumulado se
  suspende y lo reemplaza un **techo absoluto en 0 dB, nominal**. Siguen rigiendo
  los 2 dB por paso y la exigencia de una medición entre un paso y el siguiente.
- **El techo rige también al retocar.** Es una **segunda decisión del usuario**
  del mismo día, elegida entre tres opciones, porque ADR-034 dejaba el retoque sin
  techo y una cuña establecida en −1 dB lo cruzaba sola.
- **Establecido el nivel**, vuelve el presupuesto de ADR-028 **medido desde el
  ancla**: establecerlo pone el acumulado de esa ruta en cero.
- **El ancla no la declara quien propone**: sale del diario, vía
  `EntradaDiario.nivelEstablecidoEn`, y la reconstruye `historialDeLaSesion`.
- **La suspensión sólo se concede a un tipo que declare techo.** Cambiar un freno
  por otro exige que el otro exista.

### 2. `fix(safety)` — un número que no es un número pasaba todos los topes

**Apareció al ir a construir el asistente y se tapó antes de seguir**, por
decisión del usuario entre tres opciones. Toda comparación con `NaN` da `false`,
así que un cambio que declarara `NaN` en su magnitud pasaba INV-004 entera —el
tope por transacción, el acumulado y el techo nuevo— **y además**
`verificarAtadura` devolvía `atada: true` **con cualquier crudo**, que es
justamente el escenario que esa función existe para cerrar.

No estaba expuesto: los dos servicios de producción calculan magnitudes finitas.
Se tapó **sólo `NaN`**; un delta infinito lo sigue rechazando el tope por
transacción, que es lo correcto hasta que alguien construya el salto desde el
silencio.

### 3. `docs(adr)` — fmalcher SÍ tiene una rampa

**Corrección de una afirmación propia, y es la cuarta vez con la misma forma.**
ADR-034 escribió que ninguno de los cuatro repositorios «tiene presupuesto, techo
ni rampa». `fmalcher/soundcraft-ui` **sí tiene una rampa, y sobre este mismo
parámetro**: `AuxChannel extends SendChannel extends Channel`, y `Channel` trae
`fadeTo` y `fadeToDB`.

No cambia la decisión —su rampa es una transición automática y suave, sin escuchar
en el medio, y **recorta** en vez de negarse— pero sí cambia qué se puede afirmar:
la mecánica ya está hecha por otro, y lo que este proyecto agrega es **cuándo
parar y con permiso de quién**.

Y apareció el precedente del pedazo que falta: cómo trata fmalcher el borde del
silencio, que va en dirección contraria a la nuestra. Está en
[`trabajo-previo-de-terceros.md`](../referencia/trabajo-previo-de-terceros.md),
con `fmalcher` vuelto a mirar en `2fc297f`.

### 4 y 5. Lo que salió de las auditorías

`fix(safety)` cierra el agujero del ancla y tres más; `docs(docs)` corrige once
afirmaciones de la jornada que no eran ciertas. Están contados abajo, en la
sección de las auditorías, porque **es lo más importante que pasó hoy**.

## Las dos auditorías, que son lo más importante de esta sesión

**El usuario las pidió antes de cerrar**, preguntando si se había lanzado alguna.
No se había. Se lanzaron dos sobre el trabajo del día: una adversarial contra el
motor y una de fidelidad contra lo escrito. **Encontraron doce cosas, y todas se
arreglaron antes de cerrar** (commits `4f92cfa` y `f81aeae`).

### Lo que hay que aprender de esto, que no es el agujero

**Las dos auditorías encontraron la misma cosa por dos caminos: se escribieron
garantías antes de que existieran.**

- `ContextoSeguridad` argumentaba que el ancla «no la declara quien propone»
  citando de precedente a `correspondeExencionDeSistema` —que **sí** cruza lo
  declarado contra lo que la transacción toca—. El cruce no estaba. La
  autodeclaración no se había eliminado: se había mudado de quien propone la
  transacción a quien escribe el diario.
- `journal.ts` razonaba largo sobre por qué desestablecer un nivel sería
  peligroso, y no impedía ni eso ni volver a establecerlo, que hacía lo mismo.
- El `CHANGELOG` le prometía al usuario una función que no existe.
- Y se le atribuyó a `fmalcher` una función, `linkTo`, **que no existe en su
  árbol** —en el documento escrito justamente para que eso no pase—.

Ninguna de las cuatro la hubiera encontrado la suite: todas estaban verdes.

### El costo medido del agujero grave

Con `nivelEstablecidoEn` sin cruzar, el auditor movió **30 dB de ganancia de
previo** en pasos de 3, con el motor viendo el presupuesto siempre en cero. El
ancla es de monitores y le sacaba el presupuesto a cualquier parámetro.

### Lo que sí salió bien

**Las pruebas resistieron la mutación.** El auditor mutó nueve guardas, una por
una, y **las nueve quedaron cazadas**. No hay ninguna prueba que pasaría igual sin
su corrección. Lo único que encontró fue un hueco de cobertura —ningún test le
proponía al motor una magnitud no numérica— y se cerró.

## Tres cosas que las auditorías encontraron: una arreglada, dos abiertas

Están acá porque son reales, medidas, y quedan como tareas.

1. ~~**El tope de 2 dB por paso es evadible mintiendo de dónde venía.**~~
   **Arreglado el 2026-09-17**, y fue lo primero de la sesión siguiente porque
   toca al asistente que sigue. El motor calcula el movimiento como «a dónde va
   menos de dónde venía», y **de dónde venía no estaba atado a nada**: un salto
   de 31 dB en la cuña de un músico, declarando que venía de un decibel más
   abajo, pasaba. Ahora el punto de partida se ata al crudo por la ley medida,
   igual que el destino, y rechaza con código propio. **La cadena queda entera**
   porque el crudo de partida ya estaba atado: el adaptador lo compara contra el
   estado confirmado antes de escribir y devuelve conflicto si no coincide, así
   que lo suelto era sólo el puente entre ese crudo y los decibeles.

   **Lo que este arreglo NO cubre, y es lo que hay que tener presente:** sólo
   ata las rutas con la ley medida contra el aparato. **La ganancia del previo no
   la tiene** —no figura en `rutasProbadas()`—, así que para el único parámetro
   que la aplicación mueve hoy de punta a punta el motor sigue juzgando los dos
   extremos que el llamador declara. Se cierra midiendo esa ley, no escribiendo
   más código, y **queda como tarea nueva**, abajo.

   **Y dejó un efecto secundario que quedó como tarea y no como arreglo:** el
   silencio de una cuña es el crudo 0, y por la ley medida son −∞ dB. Una cuña en
   el piso **no tiene punto de partida en decibeles que se pueda declarar**, así
   que el cambio se rechaza. Es el mismo veredicto que ya daba el tope por paso
   ante un movimiento infinito —dicho ahora donde se entiende— y es exactamente
   el borde que le toca resolver a la pieza que sigue de ADR-034.
2. **El techo de nominal es, en el cable, 0,42 dB.** La holgura con que se ata la
   magnitud al crudo es el 1 % del recorrido —42,14 dB—, así que un crudo que vale
   0,41 dB declarado como 0,0 pasa. Es más que el escalón del medidor. Inaudible,
   pero el techo se presenta como exacto y no lo es.
3. **El acumulado dejó de ser insensible al orden.** Antes era una suma con signo
   y daba igual el orden; el rebase del ancla lo volvió dependiente. Hoy no se
   dispara porque el diario en memoria ordena por fecha, y es un riesgo para el
   diario persistente que INV-020 todavía no tiene.

## Lo que falta de la pieza 1, en orden

**La pantalla de monitor sigue sin terminar.** Lo que queda:

1. **El asistente que sepa subir.** Hoy `puedeBajarEnvioAMonitor` rechaza de plano
   cualquier pedido de subir, y el nombre lo dice. Hay que decidir si se extiende o
   si convive con uno nuevo. **Incluye el primer paso desde el silencio**, que es
   el único pedazo de ADR-034 que el motor todavía no hace. El destino tiene que
   ser el mínimo escribible de la ley medida, leído de la ley y **no escrito a
   mano**.

   **Y desde el arreglo del origen, ese pedazo cuesta más que antes, así que hay
   que saberlo al empezar.** Antes lo frenaba el tope de 2 dB, porque un salto
   desde −∞ tiene delta infinito, y alcanzaba con hacerle una excepción a ese
   tope. Ahora lo frena **antes** la guarda del origen, y de una forma que no se
   puede satisfacer: desde el crudo 0 no hay ningún punto de partida en decibeles
   que la guarda acepte, ni un número finito ni −∞. O sea que salir del silencio
   necesita **un caso con nombre propio dentro de la atadura**, no sólo una
   excepción al delta. Falla cerrado, que es lo correcto mientras nadie sepa
   proponerlo, pero es un borde que hay que abrir a propósito.
2. **La pantalla, por músico** —decisión del usuario—: se elige a alguien y se ve
   su cuña con todo lo que le llega, su propio instrumento primero. **Y es la que
   trae el acto de marcar «así está bien»**, que es lo que hoy no existe.

### El hueco que esto deja abierto mientras tanto, dicho con todas las letras

**Nadie marca todavía un nivel como establecido**, porque eso lo hace la pantalla.
Hasta que exista, **toda cuña vive permanentemente en la primera operación**: sin
presupuesto acumulado, acotada por el techo de nominal, los 2 dB por paso y la
escucha obligatoria entre uno y otro.

No está expuesto —ninguna pantalla llama al servicio de monitor— y **la pantalla es
justamente lo que sigue**: llega con el acto de marcar el nivel, o llega abriendo
el hueco.

## Tareas nuevas que aparecieron y quedaron anotadas

- **Las dos de las auditorías que siguen abiertas**, arriba.
- **Medir la ley de la ganancia del previo contra el aparato.** Apareció al atar
  el punto de partida, el 2026-09-17: es la única ruta que la aplicación mueve
  hoy de punta a punta y la única de las dos escribibles **sin ley medida**, así
  que las dos guardas que atan lo que el motor juzga a lo que va al cable se
  apartan justo ahí. Con la ley medida se atan solas, sin tocar el motor.

### Y cuatro que dejó la auditoría adversarial del 2026-09-17b

Las cuatro son **anteriores a esa tarea** y ninguna la bloqueaba, así que fueron
tarea nueva y no se metieron en el commit. Las cuatro están medidas.

- ~~**La misma ruta repetida en una transacción multiplica el tope por paso.**~~
  **Arreglado el 2026-09-17b**, elegido por el usuario como lo más grave de los
  cuatro. El motor recorría los cambios contra un contexto que no se actualiza
  entre uno y otro, así que N cambios encadenados sobre la misma ruta cobraban
  cada uno el presupuesto entero y ninguno disparaba la exigencia de medición
  intermedia. **Medido: cuatro pasos honestos de 2 dB en una sola transacción
  movían la cuña 8 dB, con el tope en 2, sin mentir ningún número.** Ahora se
  rechaza con `RUTA_REPETIDA`. **Se rechaza en vez de acumular** porque dentro de
  una transacción no hay dónde escuchar, y la escucha entre paso y paso es lo que
  hace de la subida una rampa y no una corrida. **Y los pasos intermedios sí
  suenan**: el ejecutor escribe todos, separados por ~101 ms, así que el hallazgo
  no era un salto de 8 dB sino una rampa de 312 ms sin ninguna escucha — una
  primera redacción dijo lo contrario y lo corrigió la auditoría de la tarea.

  **Lo que dejó abierto, medido y anotado abajo**: el tope se cuenta por clave y
  el oído es por parlante, así que dos claves distintas que llegan al mismo
  parlante se le escapan, en tres formas; y partir la ráfaga en transacciones no
  garantiza que se haya escuchado entre una y otra.
- **`coincideConEsperado` se cae abierta con un valor que no es número**, que es
  la misma forma de `NaN` que INV-004 ya tapó tres veces: `Math.abs(e.valor −
  esperado) > tolerancia` con `NaN` da `false` y contesta que coincide. Es
  INV-011 y otro paquete. **Hoy no está expuesto sólo porque nada llega al
  adaptador sin pasar por el motor**, y el motor sí lo tapa desde el 2026-09-17b.
  Depender de eso es depender de un orden, no de una guarda.
- **El diario anota el movimiento declarado, no el atado.** El ejecutor copia las
  magnitudes tal cual y el historial suma esa resta; el motor calcula la magnitud
  real del crudo y la tira. Medido sobre una rampa de diez pasos: el movimiento
  real fue de 28,42 dB y el acumulado que anota el diario, 19,99 — **8,43 dB que
  el presupuesto de la sesión no ve nunca.**
- **El ancla del techo usa el origen declarado**, así que el «hasta donde estaba
  antes de que yo lo bajara, y ni un paso más» del usuario se cumple con **0,84
  dB de más**, medido. Es la misma familia que el ítem 2 de la lista de arriba
  —el techo de nominal y su holgura— y conviene resolverlos juntos.

### Y tres más que dejó la auditoría de la ruta repetida, el 2026-09-17b

Las tres tienen **la misma forma, y conviene leerlas juntas: el tope se cuenta
por clave y el oído es por parlante.** Ninguna la cierra la guarda de la ruta
repetida, y las tres están medidas.

- **Que se haya escuchado entre transacción y transacción no lo comprueba nadie**,
  y es la que le da sentido a la guarda recién puesta. `historialDeLaSesion` sólo
  mira que el identificador de la medición no sea nulo: sin fecha, sin cruzarlo
  contra una medición real y sin ningún espaciado de reloj. **Medido: anotando la
  medición, quince transacciones mueven 28,5 dB en 19 ms**, y lo que corta no es
  ningún freno de INV-004 sino el techo de nominal. Hoy no está expuesto porque en
  producción nadie llena ese campo; **el día que la pantalla de monitor lo llene,
  los 8 dB vuelven como 28,5**. Es la más urgente de las tres.
- **El alias con ceros multiplica el tope sobre la ganancia del previo.** El
  estado por ruta se indexa por la cadena cruda, así que `hw.0.gain`, `hw.00.gain`
  y `hw.000.gain` son tres presupuestos distintos para la misma perilla. **Medido:
  12 dB en una transacción con el tope en 3, y 36 dB en ráfaga con el acumulado
  por sesión en 6.** Para el envío a monitor esto ya lo cierra la forma canónica;
  para la ganancia no, y la ganancia es el único parámetro que la aplicación mueve
  hoy de punta a punta. **Lo que lo tapa hoy no es una guarda sino un accidente**:
  el alias no tiene valor confirmado y el ejecutor lo rechaza por INV-002.
- **Familias distintas sobre el mismo parlante se suman y nadie las suma.** El
  fader del canal, la ganancia de una banda del ecualizador y el envío a monitor
  son tres rutas distintas y pasan juntas: con el envío post-fader y post-proceso
  —lo que midió el ítem 95— eso es **hasta 9 dB en la cuña del músico en una
  transacción**. Y las cuatro bandas del ecualizador sobre el mismo centro suman
  **16 dB con el tope por banda en 4**.
- **Archivar un retrato de la consola en el repositorio.** Hoy la comparación se
  hizo contra un archivo temporal de otra sesión, que podría no estar la próxima
  vez. Es corto y no toca el equipo del usuario. Ver la corrección de arriba.
- **Los márgenes de ganancia por instrumento merecen una revisión contra
  fuentes** (viene del cierre anterior). `channel-profiles.ts` le da al cajón
  menos margen que a la voz, y eso va contra el sentido común de los transitorios.
- **El recorrido deja reordenar instrumentos pero no etapas** (viene del cierre
  anterior), y el usuario ecualiza antes de la puerta mientras el orden propuesto
  hace lo contrario.

## Cómo arrancar la próxima sesión

El prompt para pegar después de un `/clear` está en
[`2026-09-17b-prompt-para-retomar.md`](2026-09-17b-prompt-para-retomar.md).

## Lo que sigue valiendo del cierre anterior

- **El servicio de audio de la Mac se traba y el síntoma se lee como un permiso
  denegado.** Se cura con `sudo killall coreaudiod`, lanzable por SSH. Los tres
  pasos para distinguirlo están en
  [el hallazgo](../backlog/hallazgo-el-audio-de-la-mac-se-traba-y-parece-un-permiso.md).
- **El usuario opera la MacBook a distancia**, por SSH y AnyDesk. No se puede mover
  ningún cable del banco ni tocar la perilla de la Scarlett hasta que vuelva.
- **Antes de meter tonos sostenidos, mirar `m.afs.enabled`**, que hoy está en 1.
- **Nunca borrar los snapshots guardados.** Es la única prohibición absoluta.
- **Cómo el usuario pide que se trabaje**: preguntas siempre interactivas,
  explicaciones en lenguaje de producto, trabajo previo buscado y dicho
  explícitamente, una tarea un commit empujado, y aviso cuando la sesión se alarga.
