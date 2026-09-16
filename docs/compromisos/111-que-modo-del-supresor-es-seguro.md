# 111 — ¿Qué modo del supresor es seguro para meter un tono?

## CERRADO el 2026-09-16: el control positivo dejó de ser histórico

**Y cerró de la forma más contundente posible.** Evidencia:
[`live-planta-o-no-2026-09-16.txt`](../spikes/SPK-P0.10b-vu2/evidence/live-planta-o-no-2026-09-16.txt)
y [`limpiar-supresor-2026-09-16.txt`](../spikes/SPK-P0.10b-vu2/evidence/limpiar-supresor-2026-09-16.txt).

El usuario autorizó el control concurrente cuando se supo que la pila estaba
vacía: *«sí, probalo ahora»*. Se corrió el **mismo estímulo**, al **mismo
nivel**, el **mismo día**, con el supresor en **LIVE** —que es como su consola
trabaja— y sin escribir nada para llegar ahí.

| | LOCK | LIVE |
|---|---|---|
| Exposición | **4 minutos** | **menos de 5 segundos** |
| Filtros plantados | **0** | **3** |

Los tres, en las tres frecuencias del estímulo:

```
m.afs.eq.0   100.0076 Hz,  Q 7,  −15 dB
m.afs.eq.1  1000.0090 Hz,  Q 7,  −15 dB
m.afs.eq.2 10000.0742 Hz,  Q 7,  −15 dB
```

**Con eso, «en LOCK no aprendió» significa lo que se quería que significara.** El
estímulo hace aprender —y rápido— al modo que se sabe que aprende. Que en LOCK no
pasara nada en cuarenta y ocho veces más tiempo es del modo, no del estímulo.

### C1 falló, y su falla ERA el hallazgo

La corrida se detuvo en el control C1: el tono llegaba a **−36,3 dBFS** con 39,1 dB
de margen, cuando en la corrida de LOCK había llegado a −29,2 con 96. Siete
decibeles menos.

**La primera lectura fue «algo cambió en el banco», y era falsa.** Lo que había
cambiado era que **el supresor ya estaba atenuando el tono cuando C1 lo midió**.
Los tres notches se plantaron en los segundos que van entre arrancar el tono y
terminar la captura de C1.

O sea que el control que se agregó para que un negativo no se leyera como
silencio terminó **detectando el positivo**, y deteniendo la corrida antes de los
cuatro minutos. El daño quedó en tres filtros en vez de los que hubieran entrado
en una exposición completa.

### Y probó, sin buscarlo, que la cuenta de ranuras no sirve

`m.afs.numtotal` valía **12 antes y 12 después** de que se plantaran los tres
filtros. La cuenta **no se movió**.

Eso deja de ser un argumento y pasa a ser una medición: comparar cuántas ranuras
hay —que es lo que este proyecto hizo durante meses— **no habría detectado
ninguno de los tres**. Ver
[el hallazgo](../backlog/hallazgo-los-doce-no-eran-filtros-eran-ranuras.md).

### La profundidad del notch no es una constante

Estos tres midieron **−15 dB**. El que se plantó el 2026-09-13 midió **−18**. Las
dos son observaciones reales, así que **−18 no es «la» profundidad**: es una de
dos que se vieron. De qué depende —duración, nivel, cuántos ya hay— no se midió.

### La limpieza, y lo que apareció haciéndola

Los tres se borraron con `clearall` y la pila volvió a cero, comprobado releyendo
por HTTP. Haciéndolo apareció que **`m.afs.clearall` estaba trabado en 1**, lo que
deja el botón CLEAR ALL del usuario sin flanco que disparar — probablemente por
culpa de este proyecto. Ver
[el hallazgo](../backlog/hallazgo-el-boton-clear-all-estaba-trabado.md).

### Lo que sigue sin probarse

- **FIXED no se probó**, y sigue sin probarse a propósito.
- **Un nivel, un estímulo de tres tonos, un día.** Que LOCK no aprenda con esto no
  dice que no aprenda con algo más fuerte o más largo.
- **No se midió de qué depende la profundidad del notch.**

---

## MEDIDO el 2026-09-16: en LOCK no aprende

Evidencia:
[`lock-aprende-o-no-2026-09-16.txt`](../spikes/SPK-P0.10b-vu2/evidence/lock-aprende-o-no-2026-09-16.txt).

| | |
|---|---|
| Modo puesto | LOCK (`m.afs.logic` a 0), **comprobado releyendo por HTTP** |
| Supresor | **encendido**, exigido y no escrito |
| Estímulo | 1000, 100 y 10000 Hz a la vez, **4 minutos** |
| C1 — el tono llegó al general | **sí**: −29,2, −29,3 y −29,7 dBFS, unos **96 dB** sobre el piso |
| La pila, ranura por ranura y campo por campo | **idéntica** |
| Filtros plantados, antes y después | **0 y 0** |

**En LOCK el supresor no aprendió.** Con eso, LOCK es el modo para meter un tono
sostenido cuando no se quiera apagar el supresor.

**La guarda de `m.afs.enabled = 0` sigue siendo la primera opción**, y no cambia:
no depende de este resultado, y es la que protegió las once corridas anteriores.
Lo que esto agrega es una segunda salida, no un reemplazo.

### El control C1 era nuevo, y era necesario

Se agregó **antes** de correr —está en la enmienda de abajo— porque el contrato
original no distinguía «LOCK no aprende» de «no hubo tono». Midió 96 dB de margen:
el estímulo llegó al general con holgura, así que el negativo es un negativo y no
un silencio.

### Lo que este resultado NO dice, y es más de lo que parece

- **Nada de LIVE ni de FIXED.** No se probaron a propósito.
- ~~**El control positivo es histórico, no concurrente.**~~ **Cerrado el mismo
  día**, arriba: el mismo estímulo plantó tres filtros en LIVE en menos de cinco
  segundos. Se deja el renglón porque declarar ese punto flojo es lo que hizo que
  alguien fuera a cerrarlo.
- **Una exposición, de cuatro minutos, un día, un nivel.**

### Y apareció algo que cambia la cuenta del riesgo

**Los doce del supresor son ranuras vacías, no filtros plantados.** Las doce
publican `1000, 116, 0.0, 0`: atenuación cero. Ver
[el hallazgo](../backlog/hallazgo-los-doce-no-eran-filtros-eran-ranuras.md).

Eso vuelve barato lo que este contrato descartó por caro: probar LIVE con un
control **concurrente** costaría un `clearall` sobre una pila que no tiene nada
que perder, y cerraría de verdad la pregunta. **Es una decisión del usuario y
queda anotada, no hecha.**

**Contrato escrito el 2026-09-16.** Estuvo un rato sin correr, y el motivo es el
que más importa de este documento: **correrlo exige aflojar un trinquete de
seguridad que nunca se había aflojado**, y esa decisión es del usuario.

**La tomó.** Se le explicó exactamente eso y contestó *«hacela, aflojá la
guarda»*. Así que se corrió. Cómo se aflojó el trinquete —sin convertir «sólo
puede encoger» en «puede crecer cuando conviene»— está más abajo, en
«El trinquete cedió, y cómo».

## Enmienda del 2026-09-16, ANTES de correr: hay un control C1

**El contrato no tenía forma de distinguir «LOCK no aprende» de «no hubo tono».**
Que `afplay` no se muera dice que el iMac reproduce, no que la señal llegue al
bus donde vive el supresor: en el medio están la interfaz, el previo, el fader
del canal, **la puerta del canal —que hoy está encendida—** y el fader del
general. Si algo de eso corta, la pila no se mueve y la conclusión sería la
falsa.

Es la trampa que este repositorio tiene escrita desde hace meses —medir sobre
silencio y leerlo como una lectura— y acá costaría caro de una forma nueva: **un
falso negativo no se nota, se publica**, y lo que publicaría es «este modo es
seguro para meter tono».

**C1 — el tono llega al general.** Antes de empezar la exposición se graban 3 s
por donde vuelve el general al banco y se exige que **las tres frecuencias** estén
al menos **40 dB** sobre el piso. Si alguna no llega, la corrida se detiene sin
publicar nada.

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

## El trinquete cedió, y cómo

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

Se le dijo al usuario —no se sabía al preguntarle la primera vez— y decidió que
sí.

### La lista vieja no se tocó

**`SUENAN_SIN_APAGAR` sigue en 44 y sigue pudiendo sólo encoger.** Subirle el
número habría convertido «sólo puede encoger» en «puede crecer cuando conviene»,
y esa frase, una vez escrita, no se vuelve a cerrar.

En su lugar hay una lista nueva, `MIDEN_EL_SUPRESOR`, **de un elemento**, para la
única clase de guion a la que la regla no se le puede aplicar sin destruir lo que
mide. Y **la excepción trae su propia obligación**: un guion de esa lista tiene
que **exigir** `m.afs.enabled` en 1 y no escribirlo nunca. Entrar ahí no es quedar
libre; es cambiar una obligación por otra.

Los tres caminos de fallo se probaron rompiéndolos a propósito: si el guion deja
de exigir el supresor encendido, si lo apaga, o si la lista apunta a un archivo
que no existe, el test falla.

## Lo que hay que decidir, y las tres salidas

1. **No hacerlo.** La guarda de `m.afs.enabled = 0` ya protege todas las
   mediciones, **no depende de este resultado**, y funcionó en las cuatro corridas
   del ítem 108 y en las del 109 y el 110: doce ranuras antes, doce después, todas
   las veces. Saber si LOCK es seguro es *cómodo*, no *necesario*.
2. **Hacerlo, agregando el guion a la lista con su motivo escrito.** Se gana el
   modo seguro; se paga con la primera excepción de ese trinquete, y con el riesgo
   —acotado a un filtro— de que LOCK sí aprenda.
3. **Hacerlo en otra consola**, si alguna vez hay una que no sea la de trabajo de
   nadie. Es la única salida sin riesgo, y hoy no existe.

~~El guion escrito queda fuera del árbol a propósito: dejarlo adentro mantendría
la suite en rojo, y en este proyecto no se commitea en rojo.~~ **Ya está adentro**,
en `tools/spikes/p0-10b-vu/lock-aprende-o-no.ts`, con el trinquete aflojado como
se explica arriba.

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
