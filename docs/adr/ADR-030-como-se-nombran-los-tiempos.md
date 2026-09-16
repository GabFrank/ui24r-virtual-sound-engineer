# ADR-030 — Cómo la aplicación nombra los tiempos del compresor

**Fecha:** 2026-09-16
**Estado:** **decidida y sin implementar.** No hay ninguna pantalla que muestre
tiempos todavía; esto fija cómo se van a mostrar cuando la haya.
**Origen:** **Decisión del usuario**, eligiendo entre cuatro opciones el
2026-09-16, después de que el [ítem 115](../compromisos/115-como-suelta-el-compresor.md)
midiera el desacuerdo.

## El problema, que lo creó una medición

El [ítem 114](../compromisos/114-los-tiempos-del-compresor.md) midió los tiempos
del compresor contra el audio y encontró que **no coinciden con lo que la consola
muestra en su pantalla**:

| El control marca | Lo que el aparato hace (t63) |
|---|---|
| ataque a la mitad → 89 ms | **57 ms** |
| relajación a la mitad → 532 ms | **120 ms** |

El [115](../compromisos/115-como-suelta-el-compresor.md) descartó la explicación
más probable —que el tiempo dependiera de cuánta reducción hubiera que
recuperar— y dejó cerrada la forma del ataque: factor **0,641** con 2,1 % de
dispersión.

**De ahí sale un problema que ninguna medición resuelve.** Si la aplicación dice
«poné el ataque en 20 ms» refiriéndose a lo que el aparato hace, la consola del
usuario va a mostrar **31**. Dos números para el mismo control, y el usuario a un
metro de la tablet.

## Lo que el usuario decidió

**Mostrar los dos, con la diferencia a la vista.** Eligió esa opción sobre las
otras tres.

La forma concreta queda para el diseño, pero el contenido no: **la propuesta tiene
que decir dónde poner el control en los términos de la consola, y qué va a pasar
en los términos del audio.** Algo como *«poné el control donde la consola marca
31 ms; en la práctica son 20»*.

## Qué se descartó, y por qué importa que quede escrito

| Opción | Por qué no |
|---|---|
| **Hablar sólo en los números de la consola** | Nunca confunde, y le miente al usuario sobre lo que hace su equipo. Este repositorio mide justamente para no tener que hacer eso. |
| **Hablar sólo en milisegundos medidos** | Es lo honesto y es lo que rompe: el usuario ve 20 en la app y 31 en la tablet, sin explicación, y lo razonable es que desconfíe de la app. |
| **No dar números, sólo «un toque más lento»** | Es la más cómoda de leer con poca luz, y **le saca al usuario la posibilidad de aprender su propio equipo**. El producto es para alguien que opera su consola: esconderle los números lo deja dependiendo de la app. |

**La opción elegida es la más cara de leer de las cuatro**, y el usuario la eligió
sabiéndolo. Eso restringe el diseño: el número de la consola va primero —es el que
tiene que tocar— y la traducción va como aclaración, no al revés.

## Lo que esta decisión NO resuelve

- **La relajación sigue sin medirse con la calidad del ataque**: 26,5 % de
  dispersión. Mientras siga así, la aplicación **no puede dar un par de números**
  para la relajación, y lo honesto es no darlos — ni uno ni dos.
- **No hay ninguna ruta de tiempos en `RAW_MAP`**, así que nada de esto es
  alcanzable todavía. Entra cuando la medición esté cerrada.
- **La puerta no está medida**, y tiene los mismos tres controles de tiempo.

## Trabajo previo

**Buscado el 2026-09-16, con los cuatro repositorios clonados y grepeados**, y en
casa. El inventario está en
[`trabajo-previo-de-terceros.md`](../referencia/trabajo-previo-de-terceros.md).

- **`fmalcher/soundcraft-ui`** declara `attack`, `release` y `hold` y **no los
  convierte a milisegundos**, así que no enfrenta este problema: expone el crudo.
- **`Dennion/ioBroker.soundcraft`**, **`ndikanov/ui24`** y **`NaturalDevCR/MyUiPro`**:
  no los tocan.
- **El cliente del fabricante** muestra el número de su propia fórmula, sin
  decir qué convención usa ni contrastarlo con nada.
- **Propio**: [ADR-026](ADR-026-ganancia-de-entrada.md) enfrentó algo parecido con
  la ganancia de entrada, donde la medición del 2026-09-09 encontró que el audio
  real se aparta hasta 1,33 dB de lo que la consola muestra. **Ahí no se tomó esta
  decisión**: la aplicación habla en decibeles sin aclarar de cuáles. Queda como
  incoherencia anotada, no resuelta acá.

**Nadie publica una interfaz que reconcilie los dos números**, porque nadie mide
los tiempos. Que no haya precedente significa más cuidado, no menos.
