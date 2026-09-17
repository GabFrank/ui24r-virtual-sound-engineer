# ADR-034 — Poner el nivel de un monitor y retocarlo son dos operaciones

**Fecha:** 2026-09-17
**Estado:** **decidida y sin implementar.** El asistente de monitor sólo sabe
bajar, el motor no distingue las dos operaciones y no hay pantalla.
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

Una vez puesto el nivel, vuelven los topes de ADR-028 sin cambios: **2 dB por vez
y 4 dB acumulados**, más el techo por ruta de «hasta donde estaba» cuando la
aplicación bajó. Es el caso que el tope de 4 dB fue escrito para proteger.

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
  presupuesto, techo ni rampa: son bibliotecas de protocolo, no asistentes. Sobre
  separar «poner el nivel» de «retocar» **no hay coincidencias en otros
  proyectos**, y eso significa que esto no tiene precedente y hay que tener más
  cuidado, no menos.
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
