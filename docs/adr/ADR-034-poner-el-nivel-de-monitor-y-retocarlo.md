# ADR-034 — Poner el nivel de un monitor y retocarlo son dos operaciones

**Fecha:** 2026-09-17
**Estado:** **decidida, y el motor implementado el 2026-09-17.** El motor ya
distingue las dos operaciones, suspende el presupuesto mientras la cuña no tiene
nivel y frena en nominal. **Falta SÓLO el encadenado, y esta línea ya se corrigió
dos veces el mismo día.** Decía que «el asistente de monitor sólo sabe bajar», y
eso dejó de ser cierto el 2026-09-19 —`puedeSubirEnvioAMonitor` sube de a 2 dB
con techo en nominal y resuelve el primer paso desde el silencio—. **Lo peor del
caso es dónde estaba la evidencia**: la tabla «Lo que el motor hace hoy», en este
mismo archivo, ya registraba «Salir del silencio: sí, desde el 2026-09-19», en la
fila justo anterior a la consecuencia. Después se corrigió a «falta SÓLO la
pantalla» y **esa misma noche la pantalla se construyó**, así que la corrección
quedó falsa en horas, contra el cuerpo de este mismo archivo. Lo que falta hoy es
el **encadenado**. Y esa consecuencia --«nadie marca todavía un nivel como
establecido»-- **dejó de ser cierta el 2026-09-20**, que es cuando la pantalla
por músico aprendió a marcarlo: **esta decisión está implementada de punta a
punta**, las dos operaciones y el paso de una a la otra. Es la cuarta redacción
de este encabezado en un día y las tres anteriores describieron el estado de
hace unas horas.
**Origen:** **Decisión del usuario**, eligiendo entre opciones el 2026-09-17, al
empezar la primera pieza de la hoja de ruta de
[`pedidos/2026-09-17-recapitulacion-y-hoja-de-ruta.md`](../pedidos/2026-09-17-recapitulacion-y-hoja-de-ruta.md).

## El problema, que lo destapó el soundcheck del usuario

[ADR-028](ADR-028-abrir-el-envio-a-monitor.md) abrió `i.N.aux.M.value` «también
para el ajuste normal de monitores», que es lo que el usuario autorizó. Pero lo
que se construyó fue `puedeBajarEnvioAMonitor`, que **sólo baja** — nació para
cazar acoples, donde se baja y el usuario vuelve a subir.

**El soundcheck del usuario hace lo contrario.** Su paso 3 es *«levanto el nivel
del master a un volumen razonable y también el volumen el aux para que el músico
tenga referencia»*, y el penúltimo es *«ajusto los niveles de monitor para cada
músico»*. Las cuñas arrancan abajo.

Y al ir a construirlo apareció que **no es sólo que falte código: los topes lo
prohíben.**

| | Valor | Qué protege |
|---|---|---|
| Por transacción | **2 dB** | que el músico no se lleve un susto: *«el monitor lo escucha el músico, que está tocando y no puede avisar»* |
| Acumulado por sesión | **4 dB** | que la aplicación no vaya corriendo la cuña de a poco a lo largo del show |

**Con 4 dB para toda la sesión, la aplicación puede mover una cuña cuatro
decibeles en todo el soundcheck.** Levantar un retorno desde el piso del tramo
medido —−32,14 dB— hasta un nivel de trabajo son más de veinte. El paso del
usuario era imposible, y nadie lo había notado porque ninguna pantalla llamaba al
servicio.

## Lo que el usuario decidió

**Son dos operaciones distintas, con presupuestos distintos.**

### 1. Poner el nivel — la rampa

Sube desde donde esté hacia un nivel de trabajo, **con el músico presente,
escuchando y esperando el cambio**. No tiene presupuesto acumulado: lo que la
acota es un **techo absoluto**.

> **El techo lo fijó el usuario, eligiendo entre cuatro opciones: hasta 0 dB, la
> posición nominal.** El control llega hasta +10 dB; pasar de nominal queda como
> decisión suya, no de la aplicación.

**Sigue subiendo de a 2 dB**, y eso no es una concesión: el motor ya exige una
medición entre un cambio y el siguiente —*«no hay una medición posterior al
último cambio de este parámetro»*—, así que poner el nivel **es necesariamente
una rampa**: un paso, escuchar, otro paso. Es lo que hace un ingeniero a mano, y
con el detector de realimentación corriendo entre pasos lo hace mejor: **la rampa
se detiene si aparece un lazo**, en vez de descubrirlo cuando ya suena.

### 2. Retocar — lo de siempre

Una vez puesto el nivel, vuelven los topes de ADR-028: **2 dB por vez y 4 dB
acumulados**, más el techo por ruta de «hasta donde estaba» cuando la aplicación
bajó. Es el caso que el tope de 4 dB fue escrito para proteger.

> **Corrección del mismo día, y es una segunda decisión del usuario.** Esta
> sección decía «los topes de ADR-028 **sin cambios**», y con eso el techo de
> nominal quedaba fuera del retoque. Al ir a implementarlo apareció la
> consecuencia: una cuña establecida en −1 dB podía cruzar nominal con un retoque
> normal de 2 dB, **sin que el usuario decidiera nada** — exactamente lo que el
> techo existe para impedir. Preguntado entre tres opciones, eligió que **el techo
> rija siempre**: es un tope del parámetro y no de la operación. Lo que distingue
> a las dos operaciones es el presupuesto acumulado, no el techo.
>
> Descartadas: **que el techo rija sólo al poner el nivel** —al pie de la letra de
> lo que decía esta ADR; más margen para el asistente, pero deja que la aplicación
> pase de nominal sola— y **que además le avise cuando el techo lo frena** —«este
> músico necesita más y estoy en nominal»—, que es mejor y **queda pendiente**
> porque arrastra la pantalla, que es la tercera pieza de esta misma hoja de ruta.
>
> El efecto práctico: un nivel establecido cerca de nominal tiene menos margen
> para arriba y los 4 dB completos para abajo.

## Cómo se separan sin debilitar nada: el ancla

**No se puede desviar de un nivel que nunca se fijó.** El presupuesto acumulado
mide cuánto se corrió el parámetro **de su valor inicial**; ese valor inicial sólo
significa algo si alguien lo puso ahí a propósito. Con las cuñas en cero al empezar
el soundcheck, el «valor inicial» es el piso, y proteger 4 dB alrededor del piso
no protege a nadie.

Entonces: **poner el nivel fija el ancla, y retocar se mide desde ahí.** Una ruta
cuyo nivel todavía no se estableció en esta sesión está en la primera operación;
una que sí, en la segunda.

**Esto es una distinción del agente, no del usuario**, y hay que decirlo: él eligió
«separar poner el nivel de retocar» entre tres opciones; **cómo se separan es
decisión mía.** Las otras dos que rechazó están abajo.

## El primer paso desde el silencio

**La ley del envío está medida entre el crudo 0,25 y el 1,0, o sea entre −32,14 dB
y +10 dB** ([ítem 104](../compromisos/104-la-ley-del-envio-a-monitor.md)). Por
debajo de eso no hay ley, y la regla 1 del repositorio dice que no se escribe donde
nadie midió.

**Con la cuña en cero, la aplicación no puede dar un paso de 2 dB**: desde el
silencio cualquier nivel finito es un salto infinito, y el tope de magnitud no
tiene con qué compararse.

> **Decisión del usuario, entre tres opciones: arrancar en −32,14 dB**, el punto
> más bajo que se sabe escribir. Es apenas audible, es el salto más chico
> posible hacia arriba desde nada, y **nunca escribe fuera de lo medido.**

Ese primer movimiento es un caso aparte y hay que tratarlo como tal en el código:
no es una rampa de 2 dB, es **salir del silencio**. Lo que lo acota no es el
delta sino el destino, que es el mínimo escribible.

> **CONSTRUIDO el 2026-09-19.** Hasta entonces era lo único de esta ADR que el
> motor no hacía. Lo que se agregó son dos piezas, y ninguna concede sola: la
> atadura del origen **nombra** el borde —`ORIGEN_EN_SILENCIO`, y le pasa al
> motor el mínimo escribible leído de la ley— y el motor **decide**, exigiendo
> que la clase sea el envío a monitor y que el destino sea exactamente ese
> mínimo. Cualquier otro destino cae con `SALIDA_DEL_SILENCIO_NO_PERMITIDA`.
>
> **Se cierra sola:** después del primer paso la consola ya no está en el crudo
> del silencio, así que la siguiente propuesta vuelve al camino normal, con sus
> 2 dB por paso y su escucha entre uno y otro. Y **declarar un origen falso
> estando en silencio sigue cayendo donde caía**: el caso con nombre propio pide
> que el llamador diga la verdad, no lo deduce del crudo.
>
> Es el único sitio del motor donde el tope por paso no se aplica, y el motivo
> está escrito acá arriba: el delta es infinito y lo que acota es el destino.
> `packages/safety/test/salir-del-silencio.test.ts` lo ataca por nueve lados.
>
> **Cómo se llegó hasta acá, que explica la forma de la solución.** Esta ADR
> decía que lo rechazaba el tope de 2 dB por transacción, por el delta infinito.
> El 2026-09-17b apareció una segunda guarda delante —`verificarAtaduraDelOrigen`,
> que ata el punto de partida al crudo de partida— y **desde el crudo 0 no
> aceptaba ningún valor declarado**: un número finito no coincide con −∞ y −∞ no
> es un número. O sea que el destino que esta ADR eligió ya no se podía ni
> expresar. Por eso lo construido el 2026-09-19 **no es una excepción al delta**
> sino un caso con nombre propio dentro de la atadura, más la decisión en el
> motor. `historialDeLaSesion` ya lo contempla por el otro lado: un
> delta infinito no entra al acumulado, porque envenenaría la cuenta de esa ruta
> para toda la sesión.

## Lo que el motor hace hoy

**Implementado el 2026-09-17**, y conviene leerlo junto con lo que falta, porque
lo que falta afloja:

| | |
|---|---|
| Las dos operaciones se distinguen | sí, por `rutasConNivelEstablecido`, que sale del diario y **no de lo que declare quien propone** |
| Poner el nivel no gasta presupuesto acumulado | sí, y la suspensión **sólo se concede a un tipo que declare techo** |
| Techo en nominal, 0 dB | sí, y **también al retocar** |
| Retocar mide desde el ancla | sí: establecer el nivel pone el acumulado de esa ruta en cero |
| 2 dB por paso, y escuchar entre pasos | sí, sin cambios: es lo que hace de esto una rampa |
| Salir del silencio | **sí, desde el 2026-09-19**: la atadura lo nombra y el motor lo concede sólo hacia el mínimo escribible y sólo para el envío a monitor |
| **Quién marca el nivel como establecido** | **la pantalla por músico, desde el 2026-09-20**, de dos formas que el usuario eligió: en la fila del envío, y un botón que cierra la cuña entera. Sólo alcanza a lo que la aplicación movió y verificó en esta sesión |

**Esa última fila era la que había que tener presente, y se cerró el
2026-09-20.** Marcar el nivel es un acto del usuario —la aplicación no puede
saber cuándo el músico está conforme— y lo anota la pantalla por músico. Mientras
una ruta no se marca sigue en la primera operación: sin presupuesto acumulado,
acotada por el techo de nominal, los 2 dB por paso y la escucha obligatoria entre
uno y otro. Al marcarla vuelven los 4 dB por sesión, contados desde ese nivel.

**Y volver a moverla le saca la marca**, que no estaba dicho en ninguna parte y
es la única forma de que el ancla no quede apuntando a un nivel que ya no está
puesto.

**Que eso no esté expuesto hoy es cierto y no es una defensa.** El servicio de
monitor no lo llama ninguna pantalla, así que nada de esto corre todavía en la
tablet. Pero la pantalla es justamente lo que sigue, y llega con el acto de
marcar el nivel o llega abriendo un hueco.

**Al 2026-09-20 el hueco se cerró, y este párrafo se reescribe entero porque
había acumulado tres correcciones del mismo día y terminó contradiciéndose.**
`monitor/monitores.component.ts` muestra la cuña de un músico --quién le manda,
en qué nivel, su instrumento primero, los 32 caminos-- **la sube** encadenando
subir, escuchar y anotar, un envío por vez, con la cuenta regresiva a la vista y
un botón de cancelar, y **marca el nivel como establecido**, de dos formas que el
usuario eligió: en la fila del envío y un botón que cierra la cuña entera.

El último paso pide lo que falta en vez de 2 dB, así que la rampa llega a nominal
exacto --con pasos fijos se quedaba a 0,138 dB y ahí se trababa--: diecisiete
pasos desde el mínimo escribible, con su test.

**Lo que sigue acotado, y no es un hueco sino la decisión misma:** sólo se puede
marcar lo que la aplicación movió y verificó en esta sesión. Un envío que el
usuario movió a mano en la consola no se puede marcar, porque el motor no tiene
con qué probar dónde quedó — y la autodeclaración es justo lo que una auditoría
del 2026-09-17 midió moviendo 30 dB de ganancia con el acumulado siempre en cero.
La pantalla lo dice con todas las letras.

*(Las redacciones anteriores de este párrafo dijeron, en orden: que la pantalla
no llamaba a ningún servicio --llama a cuatro, todos de lectura--, que no subía,
y que no marcaba. Las tres fueron ciertas y las tres duraron horas.)*

## Qué se descartó, y por qué importa que quede escrito

### Sobre el presupuesto

| Opción | Por qué no |
|---|---|
| **Subir el tope acumulado y listo** —un número más grande, por ejemplo 30 dB por sesión— | Más simple de construir. Descartada porque deja a la aplicación pudiendo mover 30 dB una cuña **en cualquier momento**, incluida la etapa en que el músico ya tiene su nivel puesto y está tocando. El tope de 4 dB fue escrito con un motivo bueno; ensancharlo para todos los casos lo tira por el caso que sí protegía. |
| **El nivel inicial lo pone el usuario** y la aplicación sólo retoca de a 2 dB | Nada que decidir en el motor. Descartada porque deja al usuario haciendo a mano el paso que quería automatizar, y el criterio de terminado del MVP es una sesión completa **sin tocar la consola a mano en ningún momento**. |

### Sobre el techo de la rampa

| Opción | Por qué no |
|---|---|
| **Hasta −10 dB**, más conservador | Más seguro con monitores potentes o salas chicas. Descartada por el usuario: lo haría terminar a mano casi siempre, que es el mismo defecto de la opción anterior en versión suave. |
| **Hasta +10 dB**, todo el recorrido | Máximo alcance, sin freno propio de la aplicación. Descartada: deja que la única defensa sean los 2 dB por paso y el detector, y el usuario eligió que pasar de nominal sea decisión suya. |
| **Que lo diga el rango útil del perfil de amplificación** | Más fino, y ata la pantalla a que el perfil esté bien cargado. Descartada por ahora; **se puede volver a preguntar** cuando el perfil de amplificación esté en uso real, porque es estrictamente mejor que un número fijo el día que el dato sea confiable. |

### Sobre el silencio

| Opción | Por qué no |
|---|---|
| **Medir el tramo que falta**, entre el silencio y −32,14 dB | Se puede hacer sin manos en el banco. Descartada por ahora: retrasa la pantalla y el tramo que falta es el inaudible. Queda anotado como medición disponible si alguna vez hace falta llegar más abajo. |
| **El primer empujón lo da el usuario** | Descartada por el mismo motivo que su gemela del presupuesto. |

## Lo que esta decisión NO resuelve

- **El ancla del techo sigue siendo la de la aplicación, no la del usuario.**
  ADR-028 ya lo declaró: él dijo «antes de que **yo** lo bajara» y lo implementado
  se ancla en lo que bajó la aplicación. Esta decisión no lo arregla, y seguiría
  necesitando seguir los cambios externos de la consola.
- **Cuál es el nivel de trabajo al que apunta la rampa.** El techo dice hasta
  dónde puede llegar; **qué objetivo se propone** para cada músico no está
  decidido. El escenario da una primera pista —quien ya escucha algo por el aire
  necesita menos en su cuña— y no es una ley.
- **Qué canales entran en la cuña de cada músico y en qué orden.** Las fuentes
  dicen «su propio instrumento o voz primero, después las referencias que
  necesita»; traducir eso a una propuesta es trabajo aparte.
- **Dónde deriva el envío**, antes o después del fader. Con la mezcla de conjunto
  dentro del MVP ([ADR-031](ADR-031-la-mezcla-de-conjunto-entra.md)), si deriva
  después, mover faders cambia los monitores ya puestos.
- **El general sigue siendo sólo del usuario** (INV-009). El paso 3 del soundcheck
  sube las dos cosas; la aplicación sube la cuña y **le pide** que suba el general.

## Trabajo previo

**Buscado el 2026-09-17.** El inventario comprobado de los cuatro repositorios,
con el commit que se miró de cada uno, está en
[`trabajo-previo-de-terceros.md`](../referencia/trabajo-previo-de-terceros.md).

- **`fmalcher/soundcraft-ui`** escribe envíos —la tabla lo registra entre lo que
  escribe— y **expone el crudo**: de las conversiones que publica, ninguna es la
  del envío. **Ninguno de los cuatro decide cuánto mandar a una cuña**, ni tiene
  presupuesto ni techo: son bibliotecas de protocolo, no asistentes. Sobre separar
  «poner el nivel» de «retocar» **no hay coincidencias en otros proyectos**, y eso
  significa que esto no tiene precedente y hay que tener más cuidado, no menos.

  > **Y acá esta sección dijo una cosa falsa, corregida el 2026-09-17 al ir a
  > construir la pieza siguiente.** Decía «ni presupuesto, techo **ni rampa**», y
  > `fmalcher` **sí tiene una rampa, y sobre este mismo parámetro**:
  > `AuxChannel extends SendChannel extends Channel`, y `Channel` trae
  > `fadeTo(destino, tiempoMs, curva, fps)` y `fadeToDB`, con cuatro curvas y 25
  > cuadros por segundo. Los otros tres no tienen nada parecido. Es la cuarta vez
  > que este repositorio escribe la versión cómoda de un «no encontré» —la que
  > deja el hallazgo propio sin precedente— y por eso queda acá y no sólo en el
  > inventario.
  >
  > **Lo que no cambia es la decisión.** Su rampa es una transición automática y
  > suave hacia un destino, para automatizar un show: no escucha entre paso y
  > paso, no tiene tope por paso, y **recorta** en vez de negarse cuando el pedido
  > se va de rango. La de acá para a escuchar, y esa pausa es el punto. Lo que sí
  > cambia es qué se puede afirmar: la mecánica de subir un envío progresivamente
  > **ya está hecha y probada por otro**, y lo que este proyecto agrega es cuándo
  > parar y con permiso de quién.

- **El borde del silencio, que es el único pedazo que sigue sin construir, tiene
  precedente y va en la dirección contraria.** `fmalcher` resuelve el silencio con
  una convención: `DBToFaderValue` devuelve crudo 0 para cualquier pedido de −200
  dB o menos —y 1 para +10 o más—, `faderValueToDB` lee −∞ por debajo de una
  amplitud de 1e−10, y **`changeFaderLevelDB(offsetDB)` pone piso en −100 dB al
  nivel actual antes de sumarle el ajuste**. Esa última es el precedente más
  directo de todos —«subir un envío una cantidad de dB desde donde está, con
  piso»— y **la primera versión de esta sección la llamó `linkTo`, que no existe
  en ese repositorio**; lo marcó una auditoría de fidelidad el 2026-09-17, y el
  nombre equivocado tapaba justamente el hallazgo. Es `INFERIDO` —leído de su
  código, no medido— y vale como hipótesis. **Ellos recortan; acá no se puede**,
  porque la regla 1 dice que no se escribe donde nadie midió y la ley del envío
  está medida entre el crudo 0,25 y el 1,0. Por eso la decisión de arrancar en
  −32,14 dB en vez de elegir un piso convencional. Detalle y citas en
  [`trabajo-previo-de-terceros.md`](../referencia/trabajo-previo-de-terceros.md).
- **Fuentes de oficio**: construir las cuñas **desde silencio**, subiendo mientras
  el músico toca y empezando por su propio instrumento o voz, es lo que describen;
  citadas en
  [`pedidos/2026-09-17-recapitulacion-y-hoja-de-ruta.md`](../pedidos/2026-09-17-recapitulacion-y-hoja-de-ruta.md).
  Ninguna da un número de techo.
- **Propio**: [ADR-026](ADR-026-cerrar-el-lazo.md) es el molde de «aplicar, medir,
  conservar o revertir»; [ADR-028](ADR-028-abrir-el-envio-a-monitor.md) abrió esta
  ruta y ya corrigió una vez un techo que salía más ancho que el permiso —fue el
  usuario quien lo encontró, con la misma pregunta sobre los auxiliares abajo—; y
  [ADR-032](ADR-032-puerta-y-compresor-por-lazo-cerrado.md) decidió el mismo día
  que la puerta y el compresor se ajusten cerrando el lazo, que es el mismo
  principio que la rampa de acá.
