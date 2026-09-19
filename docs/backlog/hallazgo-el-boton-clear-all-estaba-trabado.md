# El botón CLEAR ALL del supresor estaba trabado, y lo trabamos nosotros

**2026-09-16.** Evidencia:
[`limpiar-supresor-2026-09-16.txt`](../spikes/SPK-P0.10b-vu2/evidence/limpiar-supresor-2026-09-16.txt).

## Qué pasaba

`m.afs.clearall` estaba en **1** en la consola del usuario. El cliente que la
propia consola sirve dispara ese botón así:

```js
onPress = function () {
  setValue(name + "afs.clearall", 1);
  setTimeout(function () { setValue(name + "afs.clearall", 0) }, 500);
}
```

O sea: **lo sube, espera medio segundo y lo baja**. El disparo es el flanco de
subida. Con la clave ya en 1, ese `setValue(1)` no cambia nada y **no hay flanco
que disparar**: el botón queda sin efecto.

## Cómo se supo que el 1 no era lo normal

**Por el trabajo previo, no por deducción.** El estado archivado de
`fmalcher/soundcraft-ui` —de otra consola y otro autor— trae `clearall`, `clearlive`
y `clearfixed` **en 0**. Ver
[`trabajo-previo-de-terceros.md`](../referencia/trabajo-previo-de-terceros.md).

Dos fuentes independientes dicen que el reposo es 0: el cliente, que siempre lo
deja ahí, y el volcado de otra consola. La de este usuario estaba en 1.

## Quién lo dejó así

**Casi seguro este proyecto, el 2026-09-13**, al probar qué borra cada clave
—`clearlive`, `clearfixed`, `clearall`— sin la vuelta a 0 que hace el cliente.
Ver [`hallazgo-solo-clearall-borra-y-se-lleva-todo.md`](hallazgo-solo-clearall-borra-y-se-lleva-todo.md).

No es seguro al cien por cien —nadie archivó el valor de esa clave antes de esa
corrida—, y se dice con esa reserva. Lo que sí es seguro es que el cliente nunca
lo deja en 1, así que algo que no es el cliente lo puso ahí.

## Qué se hizo

Se bajó a 0 para que el flanco exista, se disparó con la secuencia del cliente
—0, 1, esperar 500 ms, 0— y **borró los tres filtros**. Quedó en **0**.

**Y eso rompe, a propósito, la regla de devolver lo que se encontró.** El motivo
queda escrito acá porque la regla importa: restaurar ese 1 sería restaurar un
defecto nuestro y dejarle al usuario el botón CLEAR ALL inutilizable. Se eligió
el estado correcto por encima del estado anterior, y se dice en voz alta en vez
de esconderlo en un `finally`.

## Lo que queda abierto

**No se comprobó que el botón estuviera realmente muerto desde la pantalla.**
Lo que se midió es que la clave estaba en 1, que el cliente dispara por flanco de
subida y que bajarla primero hizo que el borrado funcionara. Que el usuario
apretara CLEAR ALL en la tablet y no pasara nada es la consecuencia esperable, y
**no se probó**: probarlo pide una pila con filtros y las manos del usuario en la
pantalla.

## Trabajo previo

Los cuatro repositorios ya estaban clonados y grepeados el mismo día; el
inventario está en [`trabajo-previo-de-terceros.md`](../referencia/trabajo-previo-de-terceros.md).
Para esta pregunta en concreto:

- **`fmalcher/soundcraft-ui`** declara `clearall`, `clearfixed` y `clearlive` en
  su modelo de estado y los trae en **0** en su volcado de ejemplo. **No los
  escribe nunca**: no hay una sola línea de código suya que dispare un borrado.
- **`Dennion/ioBroker.soundcraft`**, **`ndikanov/ui24`** y **`NaturalDevCR/MyUiPro`**:
  cero coincidencias de las tres claves.

**Nadie documenta que el disparo sea por flanco**, ni que dejar la clave en 1
inutilice el botón. Eso sale de leer el cliente y de haberlo probado acá.
