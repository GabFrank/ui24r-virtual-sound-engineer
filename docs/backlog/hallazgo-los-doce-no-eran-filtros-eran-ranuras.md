# Los doce del supresor no eran filtros: eran ranuras vacías

**2026-09-16.** Salió de leer el estado real de la consola antes de correr el
[ítem 111](../compromisos/111-que-modo-del-supresor-es-seguro.md). Evidencia:
[`lock-aprende-o-no-2026-09-16.txt`](../spikes/SPK-P0.10b-vu2/evidence/lock-aprende-o-no-2026-09-16.txt).

## Lo que el proyecto venía diciendo

Que el supresor del general tenía **doce filtros**, y que cada corrida con tono
los comparaba antes y después: *«doce filtros antes, doce después, todas las
veces»*. Está escrito así en tres documentos.

La cuenta salía de `m.afs.numtotal`, que vale 12, y de contar cuántas claves
`m.afs.eq.N` publica la consola, que son doce.

## Lo que dicen las doce claves

Las doce, textualmente iguales:

```
m.afs.eq.0 … m.afs.eq.11   =   1000.0000000000,116.0000000000,0.0000000000,0
```

Frecuencia 1000, Q 116, **atenuación 0,0 dB**, bandera 0. **Las doce.**

Una ranura vacía existe igual que una ocupada: la consola la publica con sus
valores de fábrica. **Un filtro plantado se reconoce porque atenúa** —el tercer
campo deja de ser cero—, y ninguna de las doce atenúa nada.

O sea: **hay doce ranuras y cero filtros plantados.**

## Por qué pasó, y por qué no rompe nada de lo medido

**El error es de vocabulario, no de método.** «Doce antes, doce después» era
cierto como cuenta de ranuras, y comparar la cuenta sí habría detectado un filtro
nuevo **si la consola hubiera creado una ranura al plantarlo**. Lo que no está
comprobado es que lo haga: puede plantar **dentro** de una ranura que ya existía,
y entonces la cuenta no se mueve y el aviso no llega.

**Así que la comparación por cuenta era más débil de lo que parecía**, y nadie lo
habría notado hasta que fallara.

> **COMPROBADO unas horas después, y falló.** El control positivo del 111 dejó
> que el supresor plantara tres filtros en LIVE, y `m.afs.numtotal` valió **12
> antes y 12 después**. La cuenta no se movió ni con tres notches de −15 dB
> puestos. Deja de ser una sospecha razonable: **comparar cuántas ranuras hay no
> habría detectado ninguno de los tres.** Evidencia:
> [`limpiar-supresor-2026-09-16.txt`](../spikes/SPK-P0.10b-vu2/evidence/limpiar-supresor-2026-09-16.txt).

**Ninguna medición anterior estuvo en riesgo por esto**, y conviene decirlo
separado: todas las corridas con tono sostenido apagaron `m.afs.enabled` antes de
sonar y lo comprobaron releyendo por HTTP. Un supresor apagado no planta nada.
La cuenta de ranuras era el cinturón; el tirante era la guarda, y el tirante
aguantaba solo.

**Corregido en el instrumento**, no sólo en la prosa: el guion del 111 ahora
compara **ranura por ranura y campo por campo**, e informa aparte cuántas tienen
filtro plantado. Una atenuación nueva en una ranura vieja ya no pasa
desapercibida.

## Por qué la pila está vacía, que también importa

No es que el usuario nunca haya plantado filtros: **los perdió**. El 2026-09-13,
buscando cómo borrar el filtro que había plantado la medición 104, se probó
`clearlive` —no borró—, `clearfixed` —no borró— y `clearall`, que **sí borró, y
se llevó la pila entera**. Ver
[`hallazgo-solo-clearall-borra-y-se-lleva-todo.md`](hallazgo-solo-clearall-borra-y-se-lleva-todo.md).

Desde entonces la pila está en cero. Lo que el repositorio venía llamando «los
doce filtros del usuario» **ya no existía cuando se empezó a escribir esa frase**.

## Lo que esto abre, y es decisión del usuario

El [ítem 111](../compromisos/111-que-modo-del-supresor-es-seguro.md) se negó a
probar los modos LIVE y FIXED por un motivo concreto: probarlos significa dejar
que planten filtros, y sacarlos exige `clearall`, **que se lleva los del
usuario**.

**Ese costo hoy es cero**, porque no hay ninguno que llevarse. Lo que hasta ayer
valía «arriesgar el trabajo de ring-out del usuario» hoy vale «apretar `clearall`
sobre una pila vacía».

Y lo que se ganaría no es menor. El 111 dejó declarado su punto más flojo: **el
control positivo es histórico, no concurrente.** Que en LOCK no aprendiera con
este estímulo no descarta que este estímulo no hiciera aprender a ningún modo.
Una exposición corta en LIVE, hoy, lo convertiría en un control concurrente y
cerraría la pregunta de verdad.

**No se hace sin que el usuario lo decida.** Él autorizó explícitamente *sólo*
LOCK, y con el argumento de que lo otro era caro. El argumento cambió; la
decisión sigue siendo suya. **Queda anotado, no hecho.**
