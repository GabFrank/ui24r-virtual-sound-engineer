# 110 — ¿El crudo 0 de la relación es un limitador?

**Contrato escrito el 2026-09-16, ANTES de tocar la consola.** Consola
192.168.0.78. Canal 10 (`i.9`) → general → entrada 1 de la Scarlett.

## MEDIDO el 2026-09-16: el crudo 0 sobre-limita, y el 50:1 del manual no es

Evidencia:
[`crudo-cero-de-la-relacion-2026-09-16d.txt`](../spikes/SPK-P0.10b-vu2/evidence/crudo-cero-de-la-relacion-2026-09-16d.txt).
Los dos controles en verde.

| crudo | lo que dice la fuente | +4 dB de fuente movieron la salida | relación implícita |
|---|---|---|---|
| 0,25 | el cliente: 4:1 | +2,784 dB | **1,4:1** |
| 0,02 | el manual: 50:1 | +0,510 dB | **7,8:1** |
| **0** | el cliente: ∞ | **−0,068 dB** | **más que infinita** |

**El crudo 0 sobre-limita.** Al subir la fuente, la salida **baja**: −0,068 dB con
el escalón chico y −0,046 con el grande. Eso es más que una relación infinita —es
pendiente negativa— y **descarta el tope 50:1 del manual**, que predice que la
salida sube 0,080 dB con ese escalón, diez veces más y en el otro sentido.

**Y el crudo 0,02, que el manual llama 50:1, mide 7,8:1.** No es el tope del
manual ni por asomo.

**Lo que esta tabla NO dice, y conviene leerlo antes de citarla:** las relaciones
**nominales no reproducen** —4:1 mide 1,4:1—, que es exactamente lo que la
medición 97 ya había refutado. No es un hallazgo de esta corrida ni un defecto
suyo: es el estado conocido de esa ley.

**Sigue en pie el límite declarado antes de medir:** con esta precisión no se
distingue una relación infinita de una muy alta. Lo que sí se puede es descartar
el 50:1.

> **Nota sobre la evidencia archivada.** En las filas de crudo 0 el informe
> imprime «el compresor tocó su techo en el medio». Es **espurio**: ese aviso
> compara el escalón grande contra el chico y con pendiente negativa el cociente
> se da vuelta, así que sale en la única fila donde no hay techo posible. Se
> corrigió en el guion después de esta corrida; los números no cambian.

## Las dos corridas intermedias, y qué enseñó cada una

Hicieron falta cuatro. Las tres primeras fallaron **en un control**, que es
exactamente para lo que están.

**La segunda** —
[`crudo-cero-de-la-relacion-2026-09-16b.txt`](../spikes/SPK-P0.10b-vu2/evidence/crudo-cero-de-la-relacion-2026-09-16b.txt)—
ya con la compensación neutralizada, calibró bien pero falló C3: el compresor
reducía sólo 2,19 dB. Con la señal apenas por encima del umbral, el control de 2:1
midió **1,6:1**, que es la rodilla y no la ley. Enseñó que el punto de trabajo
tenía que ser más profundo.

**La tercera** —
[`crudo-cero-de-la-relacion-2026-09-16c.txt`](../spikes/SPK-P0.10b-vu2/evidence/crudo-cero-de-la-relacion-2026-09-16c.txt)—
bajó el umbral y pasó C3 con 9,36 dB de reducción, pero falló C2, y **ahí se vio
que el control estaba mal planteado**. También fue la primera en mostrar la
pendiente negativa del crudo 0, que la cuarta confirmó.

Que cada una fallara en un control distinto es lo que permitió corregir de a una
cosa por vez.

## El control positivo estaba mal planteado, y no se corrigió por haber fallado

La versión anterior usaba como control que **una relación nominal del cliente
diera su valor**: 2:1 tenía que medir 2:1. Eso es poner de control **justamente lo
que este proyecto ya refutó**. Un control que da por cierta una hipótesis
refutada no valida el instrumento: falla siempre, y su fallo no dice nada.

**El error es identificable sin mirar los datos**, y se corrigió por eso. Cambiar
un criterio porque el resultado no gustó es acomodar la regla al resultado, y este
repositorio tiene esa regla escrita — así que la distinción importa y queda
asentada acá.

El control nuevo comprueba **la cadena**: con el compresor puenteado, 10 dB de
fuente tienen que mover la salida 10 dB. Dio **9,98**. No supone ninguna ley del
compresor.

## La pregunta, acotada a propósito

**Sólo una cosa: qué hace el compresor con `i.N.dyn.ratio = 0`.**

No es «la ley de la relación». Esa está **refutada** desde la medición 97 —
`1/a` no describe este aparato — y su sucesora, la 98, midió la superficie y dejó
escrito lo que falta: la misma rejilla con la fuente 10 dB más baja, umbrales más
profundos, y los tiempos. Nada de eso se hace acá.

## Por qué este hueco y no otro

Tres fuentes dicen tres cosas distintas sobre el extremo, y **ninguna lo probó**:

| Fuente | Qué dice del extremo |
|---|---|
| El manual del fabricante | tope **50:1** |
| El cliente de la consola | el deslizador llega al crudo **0**, que con `1/V` es **∞:1**, y muestra `inf` por encima de 60 |
| La medición **98**, propia | el techo de reducción sigue `−20·log₁₀(a)`, que evaluado en 0 **también da infinito** |

Las dos últimas coinciden y el manual es el raro. Pero la 98 **no probó el crudo
0**: su rejilla llegó hasta `a = 0,05`, y de las ocho relaciones barridas **sólo
tres llegaron a aplanarse**. O sea que el infinito de `−20·log₁₀(a)` en el
extremo es **una extrapolación de una ley medida en otro lado**, no un punto
medido.

**Y no es un detalle de catálogo.** Si el crudo 0 es un limitador, hay una ruta
donde un valor extremo **cambia la naturaleza del proceso** y no sólo su
intensidad: el compresor deja de comprimir y pasa a topear. Para una aplicación
que va a proponer valores, esa diferencia es la que separa «apretó un poco de
más» de «aplastó la dinámica».

## Cómo se mide, y por qué esta forma se valida sola

Con el umbral fijo y la señal bien por encima, se sube la **fuente** 10 dB y se
mira cuánto sube la **salida**. Con relación `R`, la salida sube `10/R`:

| relación | la salida debería subir |
|---|---|
| 2:1 | 5,0 dB |
| 50:1 | 0,2 dB |
| ∞:1 | **0,0 dB** |

Se miden **tres** crudos, en este orden, y el orden importa:

1. **`ratio = 0,5`**, que el cliente llama 2:1. Si la salida no sube ~5 dB, **el
   método está mal y la corrida se detiene**. Es el control positivo, y va primero
   para no interpretar el caso interesante con un instrumento sin validar.
2. **`ratio = 0,02`**, el 50:1 del manual.
3. **`ratio = 0`**, el caso en cuestión.

**La fuente se mueve cambiando el archivo del tono, no la ganancia de entrada.**
`hw.N.gain` es analógica y no se toca; además, moverla cambiaría también lo que
el detector del compresor ve respecto del umbral de una forma que habría que
modelar. Dos tonos de distinta amplitud no tienen ese problema.

## Qué se escribe, y qué vuelve

`m.afs.enabled`, `i.9.dyn.ratio`, `i.9.dyn.threshold`, `i.9.dyn.bypass`,
`i.9.gate.enabled`, `i.9.deesser.enabled`, `m.dyn.bypass`. Todas leídas antes,
restauradas por `restaurarClaves()` dentro de `conRestauracion`, verificadas
releyendo por HTTP, y anotadas en el papelito antes de la primera escritura.

**El compresor del canal queda ACTIVO a propósito** —es lo que se mide— y el del
general puenteado, para que no se sume al de arriba.

## Los controles

**C1 — la fuente llega.** El tono alto, al menos 45 dB sobre el piso.

**C2 — el método funciona**: con `ratio = 0,5` la salida sube entre **4,0 y
6,0 dB**. Si no, se detiene sin publicar nada.

**C3 — el compresor está actuando.** Con el tono alto y el umbral puesto, la
salida tiene que estar **al menos 3 dB por debajo** de la que da el mismo tono con
el compresor puenteado. Sin esto, «la salida no se movió» se explicaría igual de
bien porque el compresor ni se enteró.

## Lo que esta corrida NO va a decir

- **Nada de la ley de la relación.** Un punto no es una ley, y la que había está
  refutada.
- **Nada de los tiempos**, que siguen sin medirse desde la 97.
- **Nada de la rodilla.** `softknee` se lee y se deja como esté, y se informa:
  con rodilla blanda la relación efectiva cerca del umbral no es la nominal.
- **Un umbral, una frecuencia, un canal, un día.**
- Y si la salida sube **0,1 dB**, esta corrida **no puede distinguir ∞ de 200:1**.
  Lo que puede hacer es descartar el 50:1 del manual, que predice 0,2.

## El primer intento falló en la calibración, y el defecto era del contrato

**2026-09-16.** Evidencia:
[`crudo-cero-de-la-relacion-2026-09-16.txt`](../spikes/SPK-P0.10b-vu2/evidence/crudo-cero-de-la-relacion-2026-09-16.txt).

La calibración del umbral no encontró ningún punto de trabajo, y el número decía
por qué: la «reducción» salió de **−27,74 dB**. Negativa — con el compresor activo
la salida estaba casi 28 dB **más arriba** que con él puenteado.

**Era la ganancia de compensación.** El canal traía `dyn.outgain = 0,7186045126`
del preajuste de bombo, y `72·a − 24` da **+27,74 dB**: exactamente el número
observado. La lista de claves a neutralizar de este contrato **no la incluía**, y
sin neutralizarla lo que se midió fue compensación pura.

**De paso, y sin buscarlo, eso confirma una fórmula `INFERIDO` contra el audio.**
`VtoDYNOUTGAIN(a) = 72·a − 24` estaba leída del cliente y nunca comprobada; acá
predice 27,74 dB y se midieron 27,74. Es una coincidencia a la centésima, en un
punto, y vale como corroboración —no como ley medida: un punto no es una ley, y
el paso siguiente sería barrerla.

**Y hay un segundo dato de esa corrida fallida**, que es el que reorienta la
siguiente: entre los umbrales 0,35 y 0,60 la reducción **no se movió ni una
centésima**, y recién en 0,30 aparecieron 2,2 dB. O sea que arriba de 0,30 el
compresor no se entera de esta señal. La rejilla de umbrales pasa a barrer de
0,30 hacia abajo, y probar arriba es gastar capturas.

La corrida dejó la consola restaurada —las siete claves comprobadas releyendo por
HTTP— pero **el papelito de `pendiente.ts` quedó abierto**, porque la excepción se
llevó el guion por delante antes de la verificación que lo cierra. Se cerró a
mano después de releer. Es el comportamiento correcto del papelito: ante la duda,
queda.

## Trabajo previo

**Buscado antes de escribir esto, y la mitad estaba en casa.**

- **Propio, ítem 97**: refutó `1/a` contra el comportamiento real.
- **Propio, ítem 98**: midió el techo de reducción como `−20·log₁₀(a)` y **no
  probó el crudo 0**; su rejilla llegó a 0,05 y cinco de ocho relaciones no
  alcanzaron su techo.
- **`fmalcher/soundcraft-ui`**: lleva `ratio` como número crudo en
  `mixer-state.models.ts`. **No lo convierte a una relación ni documenta su ley.**
- **`Dennion/ioBroker.soundcraft`**: igual, sólo estado.
- **`ndikanov/ui24`** y **`NaturalDevCR/MyUiPro`**: no tocan parámetros de mezcla.

**Nadie convierte ese crudo a una relación real.** No hay una segunda
implementación contra la cual contrastar, así que un resultado raro acá no tiene
con qué compararse.
