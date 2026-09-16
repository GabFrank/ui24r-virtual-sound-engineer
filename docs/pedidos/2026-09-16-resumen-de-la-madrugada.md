# Resumen de la madrugada del 2026-09-16

**El ítem 108 se midió: la ganancia del ecualizador de canal es `40·V − 20`, o sea
±20 dB.** Con eso se cierra la contradicción que ese ítem existía para resolver, y
el ecualizador de canal —432 de las 834 rutas escribibles— deja de estar bloqueado
por falta de ley.

Dieciocho commits. La consola quedó restaurada y verificada después de cada
corrida, y **el supresor no plantó un solo filtro en ninguna**.

## Lo que se midió, y lo que costó llegar

| | |
|---|---|
| **La ley** | `40·V − 20`. Pendiente 39,999, ordenada −19,999, residuo máximo **0,01 dB** contra un tope de 0,3. Todos los controles y todas las expectativas en verde |
| **De yapa** | el medidor del canal **es de pico**, no de potencia. Era un regalo condicional del contrato y salió porque el barrido llegó a los dos extremos vivos |
| **Corridas** | cuatro. Las tres primeras fallaron, **ninguna por culpa de la consola** |

Detalle en el [contrato](../compromisos/108-la-ley-de-la-ganancia-del-ecualizador.md)
y en [el relato del fallo](../backlog/el-108-corrio-y-fallo-por-dos-cuadros.md).

## Los tres bloqueos, y qué eran

1. **El canal del banco no estaba plano.** El show `Prueba` había dejado un
   ecualizador de bombo en el canal 10, con el pasa-bajos apoyado sobre el bin de
   1 kHz que la corrida mide. No habría fallado: habría **publicado una ley
   deformada**.
   [Detalle](../backlog/hallazgo-el-canal-del-banco-no-estaba-plano.md).
2. **El banco estaba roto, y era un cable equivocado.** El retorno llegaba 70 dB
   flojo. Diagnostiqué mal dos veces —la perilla de la Scarlett, y una filtración—
   y las dos hipótesis cayeron contra el aparato.
   [Detalle](../backlog/el-banco-estaba-roto-y-era-un-cable.md).
3. **Una guarda con la premisa dada vuelta.** El guion exigía 20 lecturas del
   medidor por punto sin saber que **la consola emite por cambio y no por reloj**:
   un tono sostenido es el estímulo que menos lecturas produce. Rechazaba datos
   buenos, y **más cuanto mejor se portaba el banco**.
   [Detalle](../backlog/hallazgo-el-medidor-se-emite-por-cambio.md).

## Lo que apareció sin buscarlo

- **El ecualizador de salida es otro aparato**: gráfico de 31 bandas, estéreo en
  el general, con otra ley y otra forma de clave. Son **372 rutas** sin mapear, y
  suponer que la ley del canal vale para ellas fallaría por la ley **y** por la
  clave. [Detalle](../backlog/hallazgo-el-ecualizador-de-salida-es-otra-cosa.md).
- **El modo del supresor son dos claves, no una.** El proyecto documentaba
  `m.afs.fmode` como el selector que «decide si una corrida planta filtros», y con
  `afs.logic = 0` la consola está en LOCK sea cual sea `fmode`.
  [Detalle](../backlog/hallazgo-el-modo-del-supresor-son-dos-claves.md).
- **La respuesta de los ±15 estaba archivada acá desde el 2026-09-08**, en dos
  lugares independientes, y en uno de ellos **en negrita y con un cartel que pedía
  mirarla**. [Detalle](../backlog/hallazgo-la-respuesta-estaba-archivada.md).
- **El plazo del volcado aguanta**: el hueco interno mayor es de 13 ms contra un
  plazo de 250. Cierra la fila 13 de la auditoría externa.
- **Las catorce leyes del cliente contra el manual**: trece coinciden exactamente.
  La que no es la relación del compresor, y ahora la pregunta está mejor planteada.
- **Una red de seguridad nueva**: un registro en disco de lo que se escribió y no
  se restauró, porque el 2026-09-16 una corrida cortada dejó la consola a medias y
  lo detectó una persona, no una guarda.
  [Detalle](../backlog/hallazgo-la-restauracion-no-siempre-llega.md).

## Lo que espera una decisión tuya

Ninguna se hizo, y ninguna es trámite.

| Qué | Por qué te espera | Cuánto cuesta |
|---|---|---|
| **Fila 14: ¿la consola recorta un valor fuera de rango?** | Escribe a propósito un valor inválido en tu consola. Es tocarla de una forma nueva | 5 min |
| **Medir la ley del ecualizador de salida** | Escribe en el ecualizador del **general**, que es más sensible que un canal | 20 min |
| **Qué modo del supresor es seguro** | La prueba consiste en **dejar que aprenda**, que es lo que todas las guardas existen para impedir. Si aprende, planta filtros y `clearall` se lleva también los tuyos | 15 min |
| **Medir la relación del compresor** | El cliente permite ∞ y el manual declara 50:1. Es comportamiento: se mide | 30 min |
| **Mapear las 372 rutas del ecualizador de salida** | Decisión de diseño: la plantilla de la tabla usa un índice y el general necesita dos | — |

Y las que necesitan tus manos: el **pendrive** para multipista y reproductor
(filas 7 a 9), y **apagar el router** (fila 12).

## Y una que es de proceso, no de producto

**Todo esto entró a tu PR #59**, que se llama «Los tres hallazgos diferidos, y lo
que la auditoría encontró al arreglarlos» y no tiene nada que ver con nada de lo
de arriba.

Quedó en **33 commits, 60 archivos, +5 388 líneas**, y dieciocho commits y 47
archivos son de esta madrugada. El traspaso decía «no lo mergees, es de Gabriel»,
y no se mergeó — pero sí se le apiló encima, porque trabajar en esa rama era la
instrucción.

**Es tuyo decidir qué hacer**, y las dos salidas son razonables: fusionarlo como
está asumiendo que es un PR grande y mezclado, o separar la madrugada a su propia
rama para que el #59 vuelva a su alcance. Lo segundo es más limpio de revisar y
cuesta reescribir historia, que no se hace sin que lo pidas.

Lo que sí conviene decir es por qué importa, y está en la disciplina del proyecto:
*«un commit gordo no sólo es difícil de revertir: es difícil de revisar, y en este
proyecto las cosas que se descubrieron tarde se descubrieron leyendo»*. Vale igual
para un PR.
