# El banco estaba roto, era un cable, y yo diagnostiqué mal dos veces

**2026-09-16.** Cierra el bloqueo que dejó al ítem 108 sin poder correr.
Instrumento nuevo: `tools/spikes/p0-10b-vu/banco-en-vivo.ts`. Evidencia del banco
ya reparado:
[`llega-el-tono-2026-09-16.txt`](../spikes/SPK-P0.10b-vu2/evidence/llega-el-tono-2026-09-16.txt).

## Antes y después

| | antes | después |
|---|---|---|
| el tono que vuelve por el lazo | −94,09 dBFS | **−19,74 dBFS** |
| margen sobre el ruido de su bin | 23,0 dB | **105,4 dB** |
| lo que el contrato del 108 espera | ~94 dB | cumplido con holgura |

**Era el cable equivocado.** El usuario desconectó todo y reconectó de a uno; al
llegar al retorno del general dijo, textual: «*me confundí, ahora sí conecté el
cable correcto*». Nada de la consola, nada de la interfaz, nada del software.

## Los dos diagnósticos míos que estaban mal, y qué los tiró

Se dejan escritos porque el modo en que fallaron es más instructivo que la
respuesta.

**1. «Es la perilla de ganancia de la Scarlett.»** El razonamiento era tentador:
faltaban ~70 dB y el rango de ganancia del aparato son ~69 dB. **Lo tiró un dato
que ya estaba medido**: el piso de ruido de la entrada 1 estaba en −62,5 dBFS y
el de la entrada 2 en −83,7. Una entrada con la ganancia al mínimo es la más
silenciosa, no la más ruidosa. La coincidencia numérica era eso, una
coincidencia, y estuvo a punto de mandar al usuario a girar la perilla
equivocada.

**2. «El cable está flojo y lo que mido es la fuga.»** También razonable: 23 dB
sobre el ruido tiene nivel de filtración, y este repositorio ya tiene esa fuga
documentada entrando por la entrada 1. **Lo tiró la línea de base**: con los
cables desconectados la entrada 1 dio −138 a −148 dBFS, o sea silencio de
verdad. Si lo que se medía antes fuera fuga por el aire, desconectar no habría
cambiado nada. Había señal por el cable; sólo que por el cable equivocado.

**Lo que las dos tienen en común.** Las dos explicaban el número sin haber
comprobado lo más simple —qué cable estaba enchufado dónde—, y las dos se
sostenían con un argumento bueno. Es la forma que `protocolo-de-verificacion.md`
describe: el autor produce la solución y también el criterio con el que la
declara correcta. Acá el criterio fue «el número cierra», y cerraba.

## El instrumento que faltaba

`banco-en-vivo.ts` pone un tono sostenido y, una vez por segundo y medio, dice
qué canal de la consola recibe señal, qué llega a la entrada 1 y qué llega a la
entrada 2. Sirve para **cablear con los ojos en el número**: enchufar, mirar, y
saber en el acto si ese cable funciona.

Sin esto el ciclo era enchufar, correr una medición de seis minutos, mirar, y
volver a empezar. Con esto los tres cables del banco se verificaron en cuatro
minutos.

**Usa el último valor conocido de cada canal en vez de contar cuadros**, que es
la aplicación directa de
[`hallazgo-el-medidor-se-emite-por-cambio.md`](hallazgo-el-medidor-se-emite-por-cambio.md):
con un flujo que se emite por cambio, «el último que llegó» **es** el valor
actual. Un medidor que promediara una ventana se quedaría sin datos justo cuando
la señal es más estable.

## Y la lección que puso el usuario, que es la mejor de las tres

Con los tres cables puestos, el retorno del auxiliar seguía callado. Se miró el
estado de la consola, apareció que `i.9.aux.4.value` y `a.4.mix` estaban en cero,
y **se declaró el cable «bien»**.

El usuario preguntó: «*¿pero estás enviando alguna señal al aux 5? Creo que no
estabas enviando nada*».

Tenía razón, y el error es exacto: **un envío cerrado y un cable cortado se ven
idénticos**. Lo único que se había comprobado es que no llegaba señal, lo cual
explica el silencio pero no absuelve al cable. Se llamó «verificado» a algo sin
probar.

Se abrió el envío —leído antes, comprobado por HTTP después de escribirlo, y
restaurado— y la entrada 2 saltó de −85,2 a **−6,4 dBFS**. El cable estaba bien
desde el principio, pero eso **no se sabía**, y la diferencia entre saberlo y
suponerlo es el proyecto entero.

Por eso `banco-en-vivo.ts` toma un auxiliar opcional a probar: para que la
próxima vez no haya forma de declarar bueno un cable sin mandarle señal. Es la
regla de `vse-disciplina` §3 —«comprobá que la fuente suena antes de concluir
sobre el instrumento»— aplicada al revés de como estaba escrita: no sólo la
fuente de la medición, también la de cada camino que se declara sano.

## Trabajo previo

**No hay coincidencias en otros proyectos.** Las cuatro implementaciones de
terceros que hablan este protocolo —`fmalcher/soundcraft-ui`,
`Dennion/ioBroker.soundcraft`, `ndikanov/ui24`, `NaturalDevCR/MyUiPro`— son
bibliotecas de control y monitoreo: ninguna incluye un asistente de cableado de
banco de medición, porque ninguna mide contra un instrumento externo. Que no
haya precedente significa que hay que tener más cuidado con esto, no menos.

## Lo que queda

- ~~**El 108 sigue sin poder correr**, ahora por un solo motivo y ya no físico: la
  guarda `CUADROS_MINIMOS` tiene la premisa dada vuelta para su propio estímulo.~~
  **Cerrado el 2026-09-16**: se arregló la guarda —piso de 3 cuadros y acuerdo
  entre lecturas en vez de cantidad—, después hubo que alargar la ventana porque
  la consola se calló una captura entera, y la cuarta corrida dio la ley:
  `40·V − 20`, o sea ±20 dB. El porqué de la guarda está en
  [`hallazgo-el-medidor-se-emite-por-cambio.md`](hallazgo-el-medidor-se-emite-por-cambio.md)
  y el resultado en el
  [contrato del 108](../compromisos/108-la-ley-de-la-ganancia-del-ecualizador.md).
- **El envío del canal 10 al auxiliar 5 quedó en cero**, como estaba. Cuando una
  medición lo necesite, lo abre ella y lo restaura.
