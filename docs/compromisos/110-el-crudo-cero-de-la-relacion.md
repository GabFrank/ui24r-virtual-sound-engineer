# 110 — ¿El crudo 0 de la relación es un limitador?

**Contrato escrito el 2026-09-16, ANTES de tocar la consola.** Consola
192.168.0.78. Canal 10 (`i.9`) → general → entrada 1 de la Scarlett.

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
