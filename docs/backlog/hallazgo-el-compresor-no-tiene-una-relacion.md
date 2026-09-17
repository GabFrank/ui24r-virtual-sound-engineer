# El compresor no tiene una relación: tiene una curva

**2026-09-16.** Medido por el [ítem 118](../compromisos/118-el-umbral-del-compresor.md).
Evidencia:
[`umbral-del-compresor-2026-09-16c.txt`](../spikes/SPK-P0.10b-vu2/evidence/umbral-del-compresor-2026-09-16c.txt).

## Lo que se vio

Con la relación fija y el umbral fijo, la pendiente de la curva **por encima del
codo no es constante**: sube con el nivel. Medida cada 3 dB, con la relación en su
crudo 0,10:

| umbral | pendientes locales, del codo hacia arriba |
|---|---|
| 0,29 | 0,13 · 0,15 · 0,25 · 0,23 · **0,38** · 0,41 · **0,55** |
| 0,32 | 0,05 · 0,21 · 0,18 · 0,31 · 0,34 · **0,44** |
| 0,35 | 0,12 · 0,20 · 0,17 · 0,32 · **0,33** |
| 0,38 | 0,20 · 0,10 · 0,25 · **0,27** |
| 0,41 | 0,12 · 0,16 · **0,25** |

**Pegado al codo comprime fortísimo** —pendientes de 0,05 a 0,20, o sea de 20:1 a
5:1— **y va aflojando a medida que la señal crece**, hasta 0,55, que son menos de
2:1.

**Pasa en los cinco umbrales**, con la misma forma. No es ruido: la repetibilidad
del instrumento en este banco está en el 1-6 %.

## Qué significa para quien opera

**Que el número de la etiqueta no describe lo que hace el aparato con una señal
real**, porque una señal real no se queda en un nivel.

Una voz que pasa de 3 dB por encima del umbral a 15 dB por encima **no recibe una
relación: recibe dos**. Al principio la aplasta y después la suelta. Eso se oye
como densidad al empezar la frase y apertura al final, y es una firma sonora —no
necesariamente mala, pero **no es lo que dice el manual**.

## Qué le hace a lo que se midió hoy

**Obliga a releer el [ítem 117](../compromisos/117-la-curva-del-compresor.md).**

Aquella corrida midió la pendiente **promedio** sobre los cuatro escalones que
tenía por encima del codo, y de ahí sacó `R = 1 + 0,548·(1/a − 1)`. Con la curva
doblada, ese número **no es «la relación»: es el promedio de una curva en una
ventana concreta** —12 dB de exceso, con el umbral en 0,35—.

**La ley sigue describiendo lo que midió**, y lo que midió es útil: cuánto
comprime en promedio en esa ventana. **Lo que no se puede hacer es llamarla la
relación del compresor**, ni extrapolarla a otra ventana. El propio 117 había
anotado una deriva sistemática del 3 % sin explicación; **esta es la explicación**.

## Y explica por qué el umbral no se podía medir con dos rectas

La primera forma de medir el umbral fue ajustar dos rectas y buscar su cruce. Con
la curva doblada, **dónde cae ese cruce depende de con cuántos puntos se ajuste
cada recta**, así que el número que sale no es el umbral.

El control C4 del 118 lo cazó **dos veces** —una con la escalera corta, otra ya
con geometría holgada— y por eso el método se cambió por el que sí funciona:
**alinear las curvas de reducción**, que resultaron ser la misma curva corrida.
Con eso la pendiente del umbral salió **96,4 dB por unidad contra los 96 del
cliente**, con residuos de cuatro centésimas de decibel.

## Lo que esto NO dice

- **No dice por qué.** Un detector con rango limitado, una rodilla que el
  parámetro `softknee = 0` no apaga del todo, o un diseño deliberado: no se midió
  nada que distinga entre esas.
- **No dice que el aparato esté mal.** Muchos compresores queridos hacen
  exactamente esto. Lo que está mal es **el número que lo describe**.
- **No mide la curva completa como ley.** Para que la aplicación la use haría
  falta publicar **la superficie** —exceso contra reducción, para cada relación—
  en vez de una relación. Eso es una medición aparte y queda anotada.
- **Un canal, una relación, una frecuencia, un día.**

## Lo que hay que decidir, y no lo decide una medición

Si la aplicación va a hablar de compresión, **tiene que elegir qué le dice al
usuario**: el número de la consola —que no describe el efecto—, una relación
efectiva —que depende del nivel— o directamente el efecto en decibeles a un nivel
dado. Es el mismo problema que la [ADR-030](../adr/ADR-030-como-se-nombran-los-tiempos.md)
resolvió para los tiempos, y **acá todavía no está resuelto**.

## Trabajo previo

Los cuatro repositorios estaban clonados y grepeados el mismo día; el inventario
está en [`trabajo-previo-de-terceros.md`](../referencia/trabajo-previo-de-terceros.md).

- **Ninguno de los cuatro convierte `ratio` a una relación**, así que menos
  todavía describe la forma de la curva.
- **El manual del fabricante** declara «Ratio 1:1 - 50:1» y **no dice nada de que
  la relación dependa del nivel**. El tope de 50:1 ya lo había refutado el
  [ítem 110](../compromisos/110-el-crudo-cero-de-la-relacion.md).
- **Propio, ítem 98**: midió que la reducción tiene un techo, `−20·log₁₀(a)`. Una
  curva que se aplana contra un techo **es compatible con lo que se ve acá**, y no
  se afirma que sea la causa: el techo para `a = 0,10` son 20 dB y estas curvas
  llegan a 15, todavía subiendo.

**Nadie publicó la forma de esta curva.**
