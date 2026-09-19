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

## La curva medida, entera

**Se publica el dato, no sólo la conclusión.** Salido de
[la evidencia](../spikes/SPK-P0.10b-vu2/evidence/umbral-del-compresor-2026-09-16c.txt)
con la relación fija en su crudo **0,10** —que el cliente llama 10:1— y el
ecualizador, la puerta y el de-esser fuera del camino.

**Nivel de salida, en dBFS del banco:**

| entrada (dBFS) | sin compresor | umbral 0.29 | umbral 0.32 | umbral 0.35 | umbral 0.38 | umbral 0.41 | umbral 0.44 |
|---|---|---|---|---|---|---|---|
| -48 | -77.51 | -77.5 | -77.6 | -77.6 | -77.6 | -77.6 | -77.6 |
| -45 | -74.50 | -74.5 | -74.6 | -74.6 | -74.6 | -74.6 | -74.6 |
| -42 | -71.51 | -71.5 | -71.6 | -71.6 | -71.6 | -71.6 | -71.6 |
| -39 | -68.51 | -68.5 | -68.6 | -68.6 | -68.6 | -68.6 | -68.6 |
| -36 | -65.50 | -65.5 | -65.6 | -65.6 | -65.6 | -65.6 | -65.6 |
| -33 | -62.52 | -62.5 | -62.6 | -62.6 | -62.6 | -62.6 | -62.6 |
| -30 | -59.54 | -59.9 | -59.6 | -59.6 | -59.6 | -59.6 | -59.6 |
| -27 | -56.55 | -59.5 | -56.9 | -56.6 | -56.6 | -56.6 | -56.6 |
| -24 | -53.55 | -59.1 | -56.7 | -54.1 | -53.6 | -53.6 | -53.6 |
| -21 | -50.56 | -58.3 | -56.1 | -53.8 | -51.3 | -50.6 | -50.6 |
| -18 | -47.57 | -57.6 | -55.5 | -53.2 | -50.7 | -48.3 | -47.6 |
| -15 | -44.59 | -56.5 | -54.6 | -52.6 | -50.4 | -48.0 | -45.3 |
| -12 | -41.61 | -55.2 | -53.6 | -51.7 | -49.6 | -47.5 | -45.1 |
| -9 | -38.61 | -53.6 | -52.3 | -50.7 | -48.8 | -46.7 | -44.5 |

La columna «sin compresor» es el control C2 de esa corrida: pendiente **0,9970**
sobre los catorce escalones, o sea que la cadena es lineal y lo que se dobla
después es del compresor.

**Y la misma tabla como REDUCCIÓN**, que es la forma en que se vuelve útil:

| entrada (dBFS) | u = 0.29 | u = 0.32 | u = 0.35 | u = 0.38 | u = 0.41 | u = 0.44 |
|---|---|---|---|---|---|---|
| -48 | 0.0 | 0.1 | 0.1 | 0.1 | 0.1 | 0.1 |
| -45 | 0.0 | 0.1 | 0.1 | 0.1 | 0.1 | 0.1 |
| -42 | 0.0 | 0.1 | 0.1 | 0.1 | 0.1 | 0.1 |
| -39 | 0.0 | 0.1 | 0.1 | 0.1 | 0.1 | 0.1 |
| -36 | 0.0 | 0.1 | 0.1 | 0.1 | 0.1 | 0.1 |
| -33 | 0.0 | 0.1 | 0.1 | 0.1 | 0.1 | 0.1 |
| -30 | 0.4 | 0.1 | 0.1 | 0.1 | 0.1 | 0.1 |
| -27 | 3.0 | 0.4 | 0.1 | 0.1 | 0.1 | 0.1 |
| -24 | 5.6 | 3.2 | 0.6 | 0.1 | 0.1 | 0.1 |
| -21 | 7.7 | 5.5 | 3.2 | 0.7 | 0.0 | 0.0 |
| -18 | 10.0 | 7.9 | 5.6 | 3.1 | 0.7 | 0.0 |
| -15 | 11.9 | 10.0 | 8.0 | 5.8 | 3.4 | 0.7 |
| -12 | 13.6 | 12.0 | 10.1 | 8.0 | 5.9 | 3.5 |
| -9 | 15.0 | 13.7 | 12.1 | 10.2 | 8.1 | 5.9 |

### Lo que salta a la vista en esa segunda tabla

**Es la misma columna, corrida.** Cada 0,03 de umbral la mueve exactamente un
escalón —3 dB—, y por eso el ítem 118 pudo medir la pendiente del umbral
alineándolas, con residuos de **cuatro centésimas de decibel**.

**Eso es un resultado en sí mismo: la reducción depende SÓLO del exceso sobre el
umbral**, no del nivel absoluto ni de dónde esté puesto el umbral. Es lo que
permite escribir la curva una vez y usarla en cualquier umbral.

### La curva, en la forma que sirve

Con la relación en 0,10, reducción como función del exceso:

| exceso sobre el umbral (dB) | reducción (dB) | relación local |
|---|---|---|
| ~3 | 0.4 |  |
| ~6 | 3.0 | 7.3:1 |
| ~9 | 5.6 | 7.5:1 |
| ~12 | 7.7 | 3.7:1 |
| ~15 | 10.0 | 4.2:1 |
| ~18 | 11.9 | 2.7:1 |
| ~21 | 13.6 | 2.3:1 |
| ~24 | 15.0 | 1.9:1 |

**La relación local no es un número: recorre de 20:1 pegada al codo hasta menos de
2:1 veinte decibeles más arriba.** La última columna es lo que un operador
escucharía como «la relación» a cada nivel.

**Esto es una columna de una superficie**, y conviene decirlo: falta el resto de
las relaciones. Con las otras siete medidas, la aplicación podría interpolar en
vez de usar una fórmula — y ésa, hoy, es la única forma honesta de que proponga
compresión con números.

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
