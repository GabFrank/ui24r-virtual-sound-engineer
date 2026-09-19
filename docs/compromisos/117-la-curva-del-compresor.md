# 117 — La curva de entrada y salida del compresor: ¿cuál es la relación real?

## MEDIDO el 2026-09-16: hay ley, y no es la del cliente

Evidencia:
[`curva-del-compresor-2026-09-16.txt`](../spikes/SPK-P0.10b-vu2/evidence/curva-del-compresor-2026-09-16.txt).
**Los cuatro controles en verde**, y el que más importa primero: con el compresor
puenteado la escalera dio pendiente **0,9969** sobre doce escalones. La cadena es
lineal, así que lo que se dobla después es del compresor.

### La curva, relación por relación

| crudo `a` | pendiente arriba | **relación medida** | el cliente dice `1/a` |
|---|---|---|---|
| 1,00 | 0,996 | **1,00:1** | 1,0:1 |
| 0,75 | 0,839 | **1,19:1** | 1,3:1 |
| 0,50 | 0,642 | **1,56:1** | 2,0:1 |
| 0,35 | 0,495 | **2,02:1** | 2,9:1 |
| 0,25 | 0,379 | **2,64:1** | 4,0:1 |
| 0,15 | 0,247 | **4,05:1** | 6,7:1 |
| 0,10 | 0,171 | **5,85:1** | 10,0:1 |
| 0,05 | 0,090 | **11,11:1** | 20,0:1 |

**Por debajo de la rodilla la pendiente dio entre 0,998 y 1,001 en las ocho
corridas**, o sea que el compresor no hace nada ahí. Eso es L1 y pasa.

**Y la rodilla apareció siempre en el mismo sitio** —−27 dBFS de entrada— en las
siete relaciones que comprimen, con el umbral fijo. Se buscó en los datos, no se
calculó del umbral escrito: es lo que el ítem 97 dejó prohibido hacer al revés.

### La ley

`1/a` está refutada desde la 97, y lo que queda en su lugar es esto:

> **R = 1 + 0,548 · (1/a − 1)**

O sea: **la relación real excede al 1:1 en un 55 % de lo que lo excede la
nominal.** Una posición que el cliente llama 4:1 comprime 2,6:1; una que llama
20:1 comprime 11:1.

| crudo | medida | la ley | diferencia |
|---|---|---|---|
| 0,75 | 1,19:1 | 1,18:1 | +0,8 % |
| 0,50 | 1,56:1 | 1,55:1 | +0,6 % |
| 0,35 | 2,02:1 | 2,02:1 | +0,1 % |
| 0,25 | 2,64:1 | 2,64:1 | −0,2 % |
| 0,15 | 4,05:1 | 4,11:1 | −1,4 % |
| 0,10 | 5,85:1 | 5,93:1 | −1,5 % |
| 0,05 | 11,11:1 | 11,42:1 | −2,7 % |

**Siete posiciones, de 1,2:1 a 11:1, dentro del 3 %.** Es la primera ley de la
relación que este proyecto tiene.

**Y tiene una deriva sistemática**, que hay que decir: el error es positivo en las
relaciones suaves y negativo en las fuertes. Con `softknee = 0` —leído, no
supuesto— la rodilla es dura, así que no se explica sola por el codo. **La
~~sospecha es el recorrido: por encima de la rodilla hay sólo cuatro escalones, o
sea 12 dB de exceso, y las relaciones fuertes aplastan tanto que los últimos
puntos se juntan.~~

**CONTESTADO el mismo día por el [ítem 118](118-el-umbral-del-compresor.md), y la
sospecha era tibia.** No es que los puntos «se junten»: **la curva está doblada**.
La pendiente por encima del codo sube con el nivel —de 0,05 pegada al codo hasta
0,55 veinte decibeles más arriba— en los cinco umbrales que el 118 barrió. La
deriva del 3 % es el promedio de una curva variable cambiando de ventana.

### Por qué el ítem 110 dio otra cosa, y no se contradicen

El [110](110-el-crudo-cero-de-la-relacion.md) reportó, en `a = 0,25`, una relación
implícita de **1,4:1**, y acá sale **2,64:1**. **No es un desacuerdo: son dos cosas
distintas**, y el 110 lo declaró.

Aquella corrida movió la fuente **4 dB en un punto**; ésta ajusta una pendiente
sobre cuatro escalones. Con la rodilla cerca, dos puntos pegados miden la rodilla
y no la relación — que es literalmente lo que el 110 escribió como su límite:
*«con esta precisión no se distingue una relación infinita de una muy alta»* y
*«las relaciones nominales no reproducen»*.

**Lo que el 110 sí midió y sigue en pie** es el extremo: en el crudo 0 la salida
**baja** al subir la fuente. Esta corrida no llega ahí —empieza en 0,05— y no lo
toca.

### Por qué todavía no entra en `RAW_MAP`

**Y esta vez el motivo es de forma, no de confianza.** La escala está **invertida**
—el crudo 1 es 1:1 y el crudo 0,05 es 11:1— y `medido()` deriva el rango físico de
los extremos del crudo, así que una entrada con `rawMin` menor que `rawMax` deja
el rango físico al revés y el trinquete la rechaza, con razón.

Eso pide una decisión sobre **cómo representa la tabla una escala invertida**, y
no es algo para resolver de apuro sobre la tabla de la que depende el motor de
seguridad. Queda anotado como tarea, con la ley ya medida y escrita acá.

### Lo que NO queda establecido

- **Un umbral.** La rodilla cayó siempre en −27 dBFS porque el umbral era uno.
  Nada dice que `k = 0,548` no dependa del umbral.
- **El crudo 0 y el 0,02**, que son del 110.
- **La ley del umbral**, que sigue refutada y sin reemplazo.
- **La rodilla blanda**, que se leyó en 0 y no se movió.
- **Con qué se junta la deriva del 3 %**: sospecha declarada, no medida.

---


**Contrato escrito el 2026-09-16, ANTES de tocar la consola.** Consola
192.168.0.78. Canal 10 (`i.9`) → general → entrada 1 de la Scarlett.

## Qué decide

**Cuánto sube la salida cuando sube la entrada, por encima del umbral.** Eso *es*
la relación: si entran 10 dB de más y salen 2, la relación es 5:1.

Hoy no hay ninguna ley. La del cliente —`VtoRATIO(a) = 1/a`— quedó **refutada**
por el [ítem 97](97-leyes-del-compresor.md), y el tope de 50:1 del manual quedó
refutado por el [110](110-el-crudo-cero-de-la-relacion.md). **Sin esto la
aplicación no puede decir «comprimí 3 a 1» con ningún número real**, y el
compresor es justo lo que más cuesta ajustar de oído.

## El método no lo elijo yo: lo dejó prescripto el ítem 98

Textual de su cierre:

> *«No se publica ninguna pendiente del umbral. Con seis umbrales ordenados y la
> rampa a la vista, sale una recta impecable — y la 97 ya sacó tres por
> sustitución que quedaron retiradas. **Si de acá sale una pendiente, sale de una
> corrida diseñada para medirla, con la fuente movida y `pre` de testigo.**»*

Y el [97](97-leyes-del-compresor.md) dejó el otro requisito:

> *«Con un solo exceso no se observa una razón. "La reducción es proporcional a
> (1−a)" y "la relación es 1/a" son **indistinguibles**. Se barre a dos excesos
> bien separados.»*

**Esta corrida cumple las dos cosas**: mueve **la fuente**, no el umbral, y barre
**doce** excesos, no dos.

## Cómo se mide

**Con una escalera.** Un solo tono cuyo nivel sube de tres en tres decibeles, de
−48 a −15 dBFS, doce escalones de 1,2 segundos. Se graba entero y se lee el nivel
**asentado** de cada escalón —los últimos 350 ms, con el ataque y la relajación
puestos en su valor más rápido para que llegue de sobra—.

Eso da **la curva de entrada contra salida completa en una sola captura**: por
debajo del umbral sube uno a uno, y por encima sube menos. **La pendiente de esa
segunda parte es la relación**, y se lee directamente.

Se repite la escalera para varios crudos de `i.9.dyn.ratio`.

## El testigo no es `pre`, y es mejor

El 98 pedía el medidor `pre` de testigo, para tener una referencia no comprimida.
**Acá el testigo es la misma escalera con el compresor PUENTEADO**, medida por el
bucle externo: tiene que dar pendiente **1,000**.

Es más fuerte que `pre` por dos motivos: no depende de ningún medidor de la
consola, y comprueba la linealidad de **toda** la cadena —el archivo, el
reproductor, la interfaz, la consola, el conversor y el análisis— y no sólo la del
compresor.

## Los controles

**C1 — todos los escalones llegan.** El más bajo, al menos **40 dB** sobre el piso.
Si el más bajo se hunde, la parte de abajo de la curva no existe.

**C2 — con el compresor puenteado la pendiente es 1,000**, dentro de **0,02**, en
los doce escalones. Si la cadena no es lineal, cualquier pendiente que salga
después es suya y no del compresor. **Es el control que hace honesta a la
corrida.**

**C3 — el compresor comprime.** Al menos un crudo tiene que dar pendiente por
debajo de **0,9**. Sin eso no hay nada que medir.

**C4 — la rodilla está DENTRO de la escalera.** Tiene que haber al menos tres
escalones por debajo del umbral y tres por encima. Si el umbral queda fuera del
recorrido, lo que se ajuste será una recta sin rodilla y su pendiente no es la
relación. Se comprueba mirando dónde se parte la curva, **no suponiéndolo del
umbral escrito** — que es exactamente el error circular que el 97 documentó.

## Las expectativas, declaradas antes de mirar

- **L1 — por debajo del umbral, pendiente 1.** Si no, el compresor hace algo por
  debajo del umbral y eso es otro hallazgo.
- **L2 — por encima, pendiente menor a 1**, y **monótona en el crudo**: más crudo
  —relación más suave según el cliente— tiene que dar pendiente más cerca de 1.
- **L3 — contra `1/a`**: se informa la relación medida y la que predice el
  cliente. **Sin tope**: la 97 ya la refutó y el número es información, no criterio.
- **L4 — contra el ítem 110**, que midió dos puntos sueltos: en `a = 0,25` reportó
  una relación implícita de **1,4:1**. Si esta corrida da otra cosa **en el mismo
  crudo**, hay que explicar la diferencia, y lo más probable es que aquellos dos
  puntos estuvieran en la rodilla —que es justo lo que el 110 declaró como su
  límite—.

## Lo que esta corrida NO va a decir

- **Nada de la ley del umbral.** Se fija uno y se comprueba que la rodilla caiga
  dentro; no se barre.
- **Nada de la rodilla blanda.** `softknee` se lee y se informa. Con rodilla
  blanda la pendiente cerca del codo no es la relación, y por eso el ajuste se
  hace **lejos del codo**.
- **Nada de los tiempos**, que están en los ítems 114 y 115.
- **Nada con señal real.**
- Una frecuencia, un umbral, un canal, un día.

## Qué se escribe, y qué vuelve

`m.afs.enabled`, `m.dyn.bypass`, `i.9.dyn.ratio`, `i.9.dyn.threshold`,
`i.9.dyn.attack`, `i.9.dyn.release`, `i.9.dyn.bypass`, `i.9.dyn.outgain`
—**neutralizada**, que el 110 se comió una corrida entera por no hacerlo—,
`i.9.gate.enabled`, `i.9.deesser.enabled`, `i.9.mix`.

Todas leídas antes, restauradas dentro de `conRestauracion`, verificadas
releyendo por HTTP y anotadas en el papelito. **El fader del general no se toca.**

## Trabajo previo

**Buscado el 2026-09-16 con los cuatro repositorios clonados y grepeados**, y en
casa, que es donde estaba lo que importa.

- **`fmalcher/soundcraft-ui`** lleva `ratio` como número crudo en su modelo de
  estado y **no lo convierte a ninguna relación**. Los otros tres no lo tocan. Ver
  [`trabajo-previo-de-terceros.md`](../referencia/trabajo-previo-de-terceros.md).
- **El cliente del fabricante**: `VtoRATIO(a) = 1/a`, con el crudo **1 = 1:1**, o
  sea escala invertida. **Refutada por el ítem 97.**
- **El manual**: «Ratio 1:1 - 50:1». **El tope refutado por el ítem 110.**
- **Propio, ítem 97**: refutó `1/a` y dejó escrito que hacen falta **dos excesos**.
- **Propio, ítem 98**: midió la superficie y encontró que `−20·log₁₀(a)` es **el
  techo de la reducción, no la ley**, y prohibió expresamente publicar una
  pendiente que no venga de mover la fuente.
- **Propio, ítem 110**: midió el extremo —el crudo 0 sobre-limita— y reportó
  relaciones implícitas de dos puntos, **declarando que no son la ley**.

**Nadie publicó la curva de este compresor.** Sin segunda implementación, un
resultado raro no tiene con qué contrastarse.
