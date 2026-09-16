# 111 — ¿Qué modo del supresor es seguro para meter un tono?

**Contrato escrito el 2026-09-16. NO se corrió**, y el motivo es el que más
importa de este documento: **correrlo exige aflojar un trinquete de seguridad que
nunca se aflojó**, y esa decisión es del usuario.

## La pregunta

La fila 6 de [§5 de la auditoría externa](../backlog/auditorias/2026-09-15-auditoria-externa.md)
quedó contestada a medias el 2026-09-16: se sabe **qué claves** dan cada modo
—`logic` y `fmode`, ver
[el hallazgo](../backlog/hallazgo-el-modo-del-supresor-son-dos-claves.md)— y sigue
sin saberse **cuál de los tres es seguro** para meter un tono sostenido.

La consola del usuario está en **LIVE y encendida**, que es la combinación que
aprende.

## Lo que se probaría, y lo que NO

**Sólo LOCK.** No se prueban LIVE ni FIXED, y es deliberado: probarlos significa
**dejar que planten filtros** en la consola del usuario. Ya se sabe que LIVE
aprende —le pasó dos veces, en septiembre— así que confirmarlo cuesta daño y no
agrega nada.

Si LOCK no aprende, **eso es la respuesta accionable**: es el modo para medir
cuando no se quiera apagar el supresor.

## El problema de método, y cómo se resolvía

**Un tono corto que no planta nada no prueba nada.** Podría ser corto para
cualquier modo, y entonces «no aprendió» sería la misma conclusión falsa que sacar
una medición del silencio.

Así que la exposición tiene que ser **comparable a la que sí plantó filtros**:
cuatro minutos, con **las mismas tres frecuencias** que quedaron plantadas en
septiembre —1 kHz, 100 Hz y 10 kHz—.

Y el riesgo se acota por el otro lado: **la pila se vigila por el socket y el tono
se corta en el instante**. La consola difunde `SETS^m.afs.eq.N` en cuanto planta,
así que la detección es inmediata y no depende de con cuánta frecuencia se
pregunte. El peor caso deja de ser «una tanda de filtros» y pasa a ser **uno,
detectado al aparecer**.

**El control positivo es histórico, no concurrente**, y hay que decirlo: se apoya
en que aquellas frecuencias, con el supresor encendido, plantaron filtros. No se
demuestra que **este** estímulo lo haría en otro modo.

## Qué escribiría

**Una sola clave: `m.afs.logic` a 0**, que es lo que el cliente hace para poner
LOCK. `m.afs.fmode` **no se toca** —el propio cliente lo deja como está al pasar a
LOCK— y **`m.afs.enabled` se exige en 1 y no se escribe**: es la única forma de
que la prueba signifique algo, porque un supresor apagado no aprende en ningún
modo y apagarlo garantizaría de antemano el resultado que se busca.

## Por qué no se corrió: el trinquete

El guion está escrito y pasa el chequeo de tipos. Lo frena
`packages/mixer-adapter/test/supresor-con-sonido.test.ts`, que dice:

> **«Un guion que hace sonar algo y deja el supresor del general encendido le
> planta filtros permanentes al usuario.»** […] «El precio de olvidarse es que el
> usuario pierde su trabajo de ring-out. **Ya pasó dos veces.**»

La guarda es estructural: si un archivo hace sonar algo, **tiene que** escribir
`m.afs.enabled` en 0. Este guion, por diseño, no lo hace — es justamente lo que
mide. Y su lista de excepciones **«sólo puede encoger»**.

**O sea que correr esta medición exige hacer crecer, por primera vez, el trinquete
que existe porque esta consola perdió filtros dos veces.** No es un trámite de
configuración: es exactamente la decisión que la lista existe para que alguien
tome a conciencia.

**Por eso no se corrió, aunque el usuario había autorizado la medición.** Autorizó
medir; no se le dijo —porque no se sabía al preguntarle— que hacerlo implicaba
aflojar esa guarda.

## Lo que hay que decidir, y las tres salidas

1. **No hacerlo.** La guarda de `m.afs.enabled = 0` ya protege todas las
   mediciones, **no depende de este resultado**, y funcionó en las cuatro corridas
   del ítem 108 y en las del 109 y el 110: doce filtros antes, doce después, todas
   las veces. Saber si LOCK es seguro es *cómodo*, no *necesario*.
2. **Hacerlo, agregando el guion a la lista con su motivo escrito.** Se gana el
   modo seguro; se paga con la primera excepción de ese trinquete, y con el riesgo
   —acotado a un filtro— de que LOCK sí aprenda.
3. **Hacerlo en otra consola**, si alguna vez hay una que no sea la de trabajo de
   nadie. Es la única salida sin riesgo, y hoy no existe.

El guion escrito queda fuera del árbol a propósito: dejarlo adentro mantendría la
suite en rojo, y en este proyecto no se commitea en rojo.

## Trabajo previo

- **`fmalcher/soundcraft-ui`** enumera las doce claves del supresor en su modelo
  de estado, `logic` y `fmode` incluidas, **sin semántica**.
- **`Dennion/ioBroker.soundcraft`** sólo lo toca en su `package-lock.json`.
- **`ndikanov/ui24`** y **`NaturalDevCR/MyUiPro`** no tocan parámetros de mezcla.

> **CORREGIDO el 2026-09-16 por una auditoría, y la corrección es más grande que
> este documento.** La frase «`ndikanov/ui24` y `NaturalDevCR/MyUiPro` no tocan
> parámetros de mezcla» es **falsa para MyUiPro**: escribe `SETD^i.N.gain` y
> `SETD^i.N.hiz` desde su `mixer-store.ts`, y publica una ley de la ganancia de
> entrada. Y «`Dennion/ioBroker.soundcraft`: sólo estado» también es falsa:
> escribe fader, panorama, silencio y la ganancia del previo.
>
> **Lo que este documento concluía sigue en pie** —ninguno de los cuatro toca el
> ecualizador, el compresor, la puerta ni el supresor, y eso es lo que acá se
> medía—. Lo que estaba mal es el alcance de la frase: un `grep` del parámetro
> del día, ampliado en silencio a una afirmación sobre todo el proyecto ajeno.
>
> El inventario comprobado, con el commit de cada repositorio, está en
> [`trabajo-previo-de-terceros.md`](../referencia/trabajo-previo-de-terceros.md).

- **Propio**: [`hallazgo-solo-clearall-borra-y-se-lleva-todo.md`](../backlog/hallazgo-solo-clearall-borra-y-se-lleva-todo.md)
  midió que `clearlive` y `clearfixed` no borran nada y que **sólo `clearall`**
  lo hace, llevándose la pila entera.

**Nadie documenta qué hace cada modo.** Y nadie documenta cómo deshacer un filtro
plantado, que es lo que vuelve cara a esta medición.
