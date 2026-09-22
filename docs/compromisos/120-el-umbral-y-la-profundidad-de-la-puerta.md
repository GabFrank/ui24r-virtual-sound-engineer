# 120 — El umbral y la profundidad de la puerta, y si tiene histéresis

## Estado al 2026-09-17: la PROFUNDIDAD cierra. El umbral y la histéresis, no.

**Tercera corrida, con la escalera fina de 1,5 dB y el banco sano.** Evidencia:
[`umbral-de-la-puerta-2026-09-17.txt`](../spikes/SPK-P0.10b-vu2/evidence/umbral-de-la-puerta-2026-09-17.txt).
**Los cuatro controles pasan**: la escalera llega a −65,6 dBFS, la cadena puenteada
da pendiente **0,9961**, la puerta cierra **19,9 dB** y la transición se completa en
**0,8 escalones**.

### 1. La profundidad: la ley del cliente acierta, y lo de anoche era el banco

| crudo | atenuación medida | `60a − 60` | con el piso del banco en la cuenta |
|---|---|---|---|
| 1,00 | 0,0 dB | 0,0 | 0,0 |
| 0,85 | **9,0 dB** | 9,0 | 9,0 |
| 0,70 | **18,0 dB** | 18,0 | 18,0 |
| 0,55 | **27,0 dB** | 27,0 | 26,8 |
| 0,40 | 35,0 dB | 36,0 | 34,5 |
| 0,25 | 39,9 dB | 45,0 | 38,7 |

**Cuatro puntos al décimo de dB**, y los dos de abajo explicados por un piso fijo
en unos **−105,5 dBFS** que no es de la puerta.

**Lo que lo dirime es la prueba que el contrato dejó declarada de antemano:**

| | 2026-09-16 | 2026-09-17 |
|---|---|---|
| La fuente en el escalón de medida | −77,5 dBFS | **−65,6 dBFS** |
| Atenuación máxima observable | 29,1 dB | **39,9 dB** |
| **Nivel absoluto del techo** | **−106,6 dBFS** | **−105,5 dBFS** |

**La fuente subió 12 dB y el techo no se movió.** Un límite de la puerta habría
subido con ella. Es del banco.

> ### Retractada: «la profundidad no llega adonde dicen ni el cliente ni el manual»
>
> Eso se escribió acá el 2026-09-16 sobre la primera corrida, y **es falso**. Aquella
> corrida midió el piso de su propio banco y lo anotó como techo del aparato —que es,
> palabra por palabra, la trampa que `vse-disciplina` §3 tiene escrita desde que pasó
> dos veces con el recorrido y el techo del medidor—. La corrida **sí dejó dicho cómo
> distinguirlo** y esa parte se sostiene: fue el método correcto escrito junto a la
> conclusión equivocada.

**Publicada** en `RAW_MAP` como `MEDIDO`, con el rango acotado al crudo **0,55 … 1,00**
—hasta donde se comprobó— y no más abajo.

**Lo que sigue sin resolverse:** el extremo. El manual dice «Depth -inf to 0dB» y el
cliente acota en −60. Donde los dos discrepan está por debajo de lo que este banco ve.

### 2. El umbral: la cota se aprieta y sigue sin alcanzar

**El guion informó 87,1 dB por unidad. NO se publica**, y el motivo es el mismo que
el 2026-09-16 aunque el número sea más simpático que aquel 74,4.

**La puerta es un interruptor** —la transición se completa en 0,8 escalones—, así que
**el escalón de la escalera ES la resolución** y la apertura sólo puede caer en su
rejilla. Cuatro de los cinco intervalos se movieron 3,00 dB y uno 1,50.

Calculando qué pendientes son compatibles con los seis puntos medidos dada esa
rejilla, el resultado **no es un número sino un rango**:

| | cota | ¿incluye los 96 del cliente? |
|---|---|---|
| 2026-09-16, escalones de 3 dB | 60 … 100 | sí |
| **2026-09-17, escalones de 1,5 dB** | **80 … 100** | **sí** |

El 87,1 es un punto dentro de veinte. Por los extremos da 90,0. **Los 96 no se
confirman ni se refutan.**

### 3. La histéresis: existe, y es más chica que la regla con que se la mide

| umbral | abre | cierra | histéresis leída |
|---|---|---|---|
| 0,33 | −26,25 dBFS | −27,75 dBFS | **1,50 dB** |
| 0,39 | −21,75 dBFS | −21,75 dBFS | 0,00 dB |
| 0,45 | −15,75 dBFS | −15,75 dBFS | 0,00 dB |

**Que exista no es ambiguo**: con el umbral en 0,33 y la señal en −27 dBFS, la puerta
está **cerrada** si se viene subiendo y **abierta** si se viene bajando. Eso es
histéresis y no admite otra lectura.

**Cuánto vale, sí es ambiguo.** Con escalones de 1,5 dB, una histéresis real menor a
un escalón se lee como 0 o como 1,5 según dónde caiga la rejilla, y salieron las dos.
Lo único que se puede afirmar es que está **entre 0 y 1,5 dB**, sin llegar a ninguno
de los dos extremos: no es cero porque un umbral la mostró, y no llega a 1,5 porque
dos dieron cero.

**En producto:** la puerta no va a castañetear por falta de histéresis, pero todavía
no se puede decir cuánta tiene. Y con el sostenido en su mínimo, ésta es la histéresis
del **detector**, no la que se percibe con el sostenido puesto.

### Las dos corridas anteriores, y por qué se guardan

**No se borran: son el registro de cómo se llegó acá, y una de las dos contiene
una conclusión equivocada que es la parte instructiva.**

- **Primera corrida, escalones de 3 dB.** Evidencia:
  [`umbral-de-la-puerta-2026-09-16.txt`](../spikes/SPK-P0.10b-vu2/evidence/umbral-de-la-puerta-2026-09-16.txt).
  Los cuatro controles pasaron y **aun así no se publicó ninguna pendiente**: dos
  umbrales vecinos cayeron en el mismo escalón, el intervalo dio 0 dB donde los
  otros cuatro daban 3,0, y el ajuste se arrastró a 74,4 dB/unidad. La decisión de
  no publicarlo fue correcta y se sostiene. **Lo que no se sostiene es lo que dijo
  de la profundidad** —el techo de 29 dB— y está retractado arriba. La fuente en su
  escalón de medida estaba en **−77,5 dBFS**, y ese dato es el que hoy permite la
  comparación que lo dirime.

- **Segunda corrida, ya con la escalera fina, muerta en C2.** Evidencia truncada:
  [`umbral-de-la-puerta-2026-09-16b.txt`](../spikes/SPK-P0.10b-vu2/evidence/umbral-de-la-puerta-2026-09-16b.txt).
  Murió de golpe y sin mensaje. Dejó el papelito abierto —que hizo su trabajo— y al
  repararlo **se plantó un filtro en la consola del usuario**, porque el reparador
  encendió el supresor con un reproductor huérfano todavía sonando. Detectado,
  borrado, y arreglado en la herramienta: ver
  [el hallazgo](../backlog/hallazgo-el-reparador-planto-un-filtro.md).

  **La corrida de hoy es la primera que ese arreglo acompañó de punta a punta**, y
  terminó sin papelito abierto, sin huérfanos y con la consola idéntica al retrato
  previo, clave por clave.

### Qué falta para cerrar este ítem

1. ~~Volver a correr con la escalera fina.~~ **Hecho.**
2. ~~Separar el techo de la profundidad de una fuga del banco.~~ **Hecho: era el banco,
   y la ley quedó publicada.**
3. **El cero del umbral y su pendiente exacta.** Hace falta una escalera **más fina que
   la histéresis** —del orden de 0,25 dB— alrededor del punto de transición. Más puntos
   de umbral no sirven: el límite es la rejilla, no la cantidad de datos.
4. **El valor de la histéresis**, que se resuelve con la misma escalera fina del punto 3.
5. **Ver más hondo que 27 dB de profundidad**, que pide subir la fuente hasta justo por
   debajo del punto de apertura en vez de medir desde el escalón más bajo.

---


**Contrato escrito el 2026-09-16, ANTES de tocar la consola.** Consola
192.168.0.78. Canal 10 (`i.9`) → general → entrada 1 de la Scarlett.

## Qué decide

Tres cosas, y las tres salen del mismo instrumento:

1. **A qué nivel abre la puerta**, y cuántos decibeles mueve eso por unidad del
   control. El cliente dice `VtoGATE_THRESH(a) = 96a − 90`.
2. **Cuánto atenúa cerrada.** El cliente dice `VtoGATE_DEPTH(a) = 60a − 60`. El
   [ítem 116](116-los-tiempos-de-la-puerta.md) tiene **un solo punto** —−21,8 dB
   medidos contra −20 predichos— y un punto no es una ley.
3. **Si abre y cierra en el mismo nivel**, o si cierra más abajo.

## La tercera es la que nadie documenta, y es la que se oye

**Una puerta que abre y cierra exactamente en el mismo nivel castañetea.** Con la
señal justo en el umbral, se abre y se cierra sola a cada oscilación, y eso suena
como un chisporroteo. La solución de manual es que **cierre más abajo de lo que
abre**: la diferencia se llama histéresis.

**El manual del fabricante no la nombra. El cliente de la consola tampoco** —cero
coincidencias de `hyster` en los dos—. Y ninguno de los cuatro proyectos de
terceros toca la puerta.

Así que **no se sabe si esta puerta la tiene**, y el manual ofrece otra respuesta
para el mismo problema: *«Hold… milliseconds to prevent chatter»*. Puede que
resuelva el castañeteo sólo con el sostenido, que el 116 midió exacto. **Medirlo
decide entre esas dos.**

## Cómo se mide

**Con la misma escalera de los ítems 117 a 119**, y por primera vez **también al
revés**.

- **Subiendo**, la salida arranca atenuada —la puerta cerrada— y en algún escalón
  se abre. **Ese es el nivel de apertura.**
- **Bajando**, arranca abierta y en algún escalón se cierra. **Ese es el de
  cierre.**
- **La diferencia entre los dos es la histéresis**, y si es cero, no tiene.

El nivel de transición se toma donde la atenuación cruza **la mitad de la
profundidad**. Es simétrico y no depende de cuánto atenúe.

Para el umbral se barre `gate.thresh` y se mira cuánto se corre la transición.
Para la profundidad se barre `gate.depth` y se mide la atenuación con la puerta
cerrada.

## Los tiempos se ponen al mínimo, y hay que decir por qué

`attack`, `hold` y `release` van a su valor más rápido para que cada escalón
llegue asentado. **Eso tiene una consecuencia sobre la histéresis**: con el
sostenido en su mínimo —1 ms— la puerta cierra en cuanto la señal baja, así que lo
que se mida es la histéresis **del detector**, no la que el usuario percibe con su
sostenido puesto. Se dice así.

## Los controles

**C1 — la escalera llega entera**: el escalón más bajo con la puerta **abierta**,
al menos 40 dB sobre el piso.

**C2 — con la puerta PUENTEADA la pendiente es 1,000 ± 0,02** en los catorce
escalones, subiendo **y bajando**. La escalera al revés es nueva y hay que
comprobar que no traiga nada suyo.

**C3 — la puerta cierra**: con el nivel más bajo, al menos **10 dB** de atenuación
contra la misma escalera puenteada.

**C4 — la transición es nítida**: tiene que completarse en **dos escalones o
menos**. Si tarda más, no hay «un nivel de apertura» y la histéresis no se puede
leer como una diferencia entre dos.

## Las expectativas, declaradas antes de mirar

- **L1 — el umbral es lineal en el crudo**, residuo máximo 1,5 dB, y se informa la
  pendiente contra los **96** del cliente.
- **L2 — la profundidad es lineal en el crudo**, y se informa contra `60a − 60`.
  **Se declara antes**: los extremos del cliente y del manual **no coinciden** —el
  cliente acota en −60 dB y el manual escribe «-inf»— y esta corrida no puede
  medir un infinito. Lo que puede es decir si la recta encaja donde sí llega.
- **L3 — la histéresis**: se informa el número, sin expectativa. **No hay base para
  predecir ni que exista ni que no**, y decirlo antes evita que cualquier
  resultado parezca confirmado.

**Si falla C1, C2, C3 o C4, no se publica nada.**

## Lo que esta corrida NO va a decir

- **Nada del cero de la escala**, igual que el compresor: se mide la pendiente.
- **Nada de la relajación de la puerta**, cuya forma el 116 refutó y que sigue sin
  ley. Eso necesita un modelo nuevo, no otra corrida de ésta.
- **Nada con el sostenido puesto**, explicado arriba.
- **Nada con señal real.**
- Un canal, una frecuencia, un día.

## Qué se escribe, y qué vuelve

Las claves del [116](116-los-tiempos-de-la-puerta.md) —`gate.{enabled,bypass,
thresh,depth,attack,hold,release}`— más el proceso del canal, con su `PREVIO`, su
`conRestauracion`, su papelito y su relectura por HTTP. **El fader del general no
se toca.**

## Trabajo previo

**Buscado el 2026-09-16 con los cuatro repositorios clonados y grepeados.**

- **Los cuatro: cero coincidencias** de `gate.thresh`, `gate.depth` y `hyster`.
  Ninguno toca la puerta. Ver
  [`trabajo-previo-de-terceros.md`](../referencia/trabajo-previo-de-terceros.md).
- **El manual**: «Gate Threshold **-inf to +6dB**», «Depth **-inf to 0dB**», y
  `Hold… to prevent chatter`. **No nombra la histéresis.**
- **El cliente**: `96a − 90` y `60a − 60`. **Tampoco la nombra** —cero
  coincidencias de `hyster` en el `mixer.html`—.
- **Los extremos del manual y del cliente se contradicen** en las dos: «-inf»
  contra −90 y contra −60. Queda anotado y **no se resuelve acá**.
- **Propio, ítem 116**: midió el sostenido exacto, la forma del ataque, refutó la
  de la relajación, y dejó la profundidad en **un punto**.
- **Propio, ítem 118**: el método de alinear curvas, que es el que se usa acá para
  el umbral.

**Nadie mide esto.** Sin segunda implementación, un resultado raro no tiene con
qué contrastarse.
