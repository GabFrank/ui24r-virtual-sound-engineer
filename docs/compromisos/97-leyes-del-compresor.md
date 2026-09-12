# 97 — Las leyes del compresor

**Escrito antes de tocar la consola.** Citas del usuario:
[`00-lo-que-dijo-el-usuario.md`](../pedidos/00-lo-que-dijo-el-usuario.md).

## Qué se mide y qué ya se sabe

El compresor es el paso 9 del camino del MVP, y entra porque el usuario lo pidió:
*«también tiene que entrar al mpv, GATE, COMPRESOR, EQ, EFFECTOS (porque el mix
de una banda depende de estos y no solo de eq)»*.

| Qué | Estado |
|---|---|
| El medidor de reducción, byte `+5` | **Medido** contra la caída real de nivel (2026-09-09): 10,8 % dio 4,66 dB contra 4,32 calculados, 22,5 % dio 9,00 contra 9,00 |
| `VtoTHRESH(a) = −90 + 96a` | **Leída del `mixer.html`. Nunca contrastada con el aparato** |
| `VtoRATIO(a) = 1/a` | Ídem. Y es una escala invertida: el crudo **1 es 1:1**, o sea *sin* comprimir |
| Ataque y relajación en ms | **No se sabe nada** |

## El instrumento

El medidor de reducción es la herramienta, y es directo: dice cuántos dB está
atenuando el compresor, en vivo, sin tener que deducirlo de la diferencia entre
dos niveles. Es lo que hace esta medición más limpia que las de esta semana.

**Testigo:** el byte `pre` del canal, que está medido como anterior a todo el
procesamiento. Si se mueve, la fuente se movió.

## Lo que el auditor cambió, antes de medir

Corrió en contexto fresco antes de la corrida y devolvió doce trampas. **Mató el
diseño original y aportó dos números que lo rehacen.**

### Mató el anclaje

El plan era mover la fuente con el fader del canal y buscar la rodilla otra vez.
**El fader está aguas abajo del detector**, y está medido: el 2026-09-09, moviendo
el fader con fuente fija, el medidor de entrada se mantuvo *«clavado en −20,76 dB
en las quince posiciones»*. Mover el fader habría movido la rodilla **cero**, y yo
habría concluido que la pendiente no es 96.

**La salida: mover la fuente en el origen** —cambiando la amplitud del tono que
genero— y **medir cuánto se movió con el testigo `pre`**, en vez de asumirlo.
Sólo cantidades medidas.

### Y dio la resolución real del instrumento

| | Lo que creía | Lo real |
|---|---|---|
| Escalón del medidor de reducción | 0,3334 dB, como el de nivel | **0,667 dB**: la máscara alcanza un código de cada dos |
| Primer valor no nulo | ~0 | **0,984 dB** |

**Una rodilla no se puede localizar mejor que ~1 dB.** Y de ahí sale lo que
cambia el diseño de raíz: con dos rodillas separadas **6 dB**, la pendiente sale
**96 ± 22** — no distingue 96 de 80 ni de 118. *«Reportar 96,3 confirmado es
reportar el ruido.»*

**Por eso las dos fuentes van separadas 30 dB**, no 6.

### Tres correcciones más que entraron al diseño

1. **El sesgo de la rodilla se cancela sólo si las dos determinaciones usan la
   misma razón y el mismo criterio.** Hace falta un exceso de `0,984/(1−a)` dB
   para que el instrumento salga de cero: con razón 2:1 son 2 dB de sesgo, con
   10:1 son 1,1. Se usa **razón alta y fija** para las dos rodillas.
2. **El paso de la razón era circular.** Calculaba el exceso con `VtoTHRESH`, así
   que un error del 20 % en la pendiente daba una recta igual de recta con el
   cero en el mismo lugar. Ahora el exceso se toma **contra la rodilla medida**.
3. **Y con un solo exceso no se observa una razón.** «La reducción es
   proporcional a (1−a)» y «la relación es 1/a» son indistinguibles. Se barre a
   **dos excesos bien separados**.

### Y una consecuencia que ya se pagó

El auditor avisó que el supresor del general aprende notches con un tono
sostenido. **Ya había pasado**: las corridas de esta noche le plantaron seis
filtros de −18 dB en el general, en 100 Hz, 1 kHz y 10 kHz. Se borraron con
`clearlive` y el usuario decidió que **el supresor se apaga antes de medir y se
deja como estaba**. Esta corrida lo hace.

## El diseño

**El instrumento** es el medidor de reducción, byte `+5`: dice cuántos dB atenúa
el compresor, en vivo. **El testigo** es `pre`, medido como anterior a todo el
procesamiento.

**La rodilla.** Con razón alta y fija, se baja el umbral hasta que la reducción
sale de cero. En ese crudo el umbral iguala al nivel que ve el detector.

**La pendiente.** Se repite con la fuente 30 dB más baja, y se compara el
corrimiento de la rodilla contra el corrimiento **medido** de `pre`. Si la
pendiente es 96 dB por unidad, mover X dB mueve la rodilla X/96 de crudo.

**La razón.** Con la rodilla ya ubicada, se barre el crudo de la razón a dos
excesos separados. Si la reducción es `E·(1−a)`, tiene que ser lineal en `a`,
con cero en `a = 1`, **y escalar con E**.

**Ida y vuelta.** El umbral se barre bajando y subiendo. Si las rodillas no
coinciden, lo que se midió fue el transitorio del ataque o la relajación.

## Lo que predigo

| # | Predicción | Cómo se falsa |
|---|---|---|
| **C1** | Mover la fuente X dB mueve la rodilla X/96 de crudo, con X ≈ 30 | Que la mueva otra cantidad fuera de la incertidumbre de ±1 dB por rodilla |
| **C2** | La reducción es lineal en el crudo de la razón, con cero en `a = 1` | Que no sea lineal, o que el cero caiga en otro lado |
| **C3** | La reducción **escala con el exceso**: al doble de exceso, el doble de reducción | Que no escale: entonces no es una relación, es otra cosa |
| **C4** | El testigo `pre` no se mueve al comprimir | Que se mueva |
| **C5** | La **relajación** se puede medir como cociente entre condiciones; el **ataque** no | Que el ataque se vea |

## Criterio, fijado antes

**El escalón del medidor de reducción es 0,667 dB, no 0,3334.** Y para las
diferencias —dos rodillas, dos curvas— el umbral es de **dos escalones**:
[`hallazgo-umbral-de-una-diferencia.md`](../backlog/hallazgo-umbral-de-una-diferencia.md).

**La «rodilla» es un evento definido por nuestro código, no por la consola.**
`REDUCCION_ZONA_MUERTA = 0,008` es una constante que elegimos para matar el
ruido de reposo: quien repita esto con otro umbral encuentra la rodilla en otro
crudo. Va dicho para que la discrepancia no se le atribuya al aparato.

## Qué se escribe y qué se restaura

| Ruta | Valor previo |
|---|---|
| `i.9.dyn.threshold` | 0,875 |
| `i.9.dyn.ratio` | 1 (o sea 1:1, inerte) |
| `i.9.dyn.attack` | 0,34375 |
| `i.9.dyn.release` | 0,4887695312 |
| `i.9.mix` | 0,7647058824 (no se toca: está aguas abajo del detector) |
| `m.afs.enabled` | **1** — se apaga para medir y se devuelve |

Comprobado releyendo por HTTP. No se toca ninguna instantánea, ni la fantasma del
canal 9, ni el supresor.

## Lo que NO va a probar

- **Ningún nivel absoluto.** Todo es pendiente y diferencias.
- **Un canal de veinticuatro.**
- **Nada del `softknee`**, que queda en su valor y no se barre.
- **Nada de cómo suena.** Que la ley sea correcta no dice si un ajuste es bueno.
- **Nada del de-esser**, que es el cuarto bloque dinámico y el único que nunca se
  midió (ítem 100).
- **Nada del umbral de la puerta.** `gate.thresh` usa la misma fórmula en el
  código y **eso no lo prueba esta medición**. Es el ítem 98, y heredar la
  confianza sería el error que este proyecto ya tiene documentado.
- **Y esto no es calibración: es autoconsistencia.** Se contrasta un medidor de
  la consola contra otro medidor de la misma consola, los dos decodificados con
  constantes del mismo `mixer.html`. `VERIFICADO_CONTRA_CONSOLA` en
  `conversiones.ts` ya excluye al compresor de esa bandera, y esta corrida no lo
  cambia. La correspondencia con dBFS reales sigue pendiente.

---

# Resultado: las leyes del código no describen este compresor

**Medido el 2026-09-12.** Tres corridas:
`evidence/leyes-del-compresor-2026-09-12.txt` (la rodilla del umbral),
`evidence/ley-de-la-razon-2026-09-12.txt` (la razón a dos excesos) y
`evidence/umbral-por-sustitucion-2026-09-12.txt` (el desempate).

## Cuatro observaciones que no cierran entre sí

| # | Qué se midió | Resultado |
|---|---|---|
| 1 | Pendiente del umbral **por la rodilla**, fuentes separadas 29,65 dB medidos | **95,6 ± 6,3** dB por unidad |
| 2 | Ley de la razón a **6 dB nominales** de exceso (7,09 reales, ver abajo) | Con el exceso nominal daba 0,25 dB = 0,38 escalones; **con el real, 0,73 dB = 1,10 escalones** |
| 3 | La misma a **18 dB nominales** (19,09 reales) | **No encaja**: 4,48 dB con el nominal, **5,14 dB = 7,70 escalones** con el real |
| 4 | Pendiente del umbral **por sustitución**, tres relaciones | **22,2 / 32,1 / 47,3** dB por unidad |

**El exceso «de 6 dB» era de 7,09, y la fila 2 cambia de veredicto.** Una
auditoría de aritmética lo despejó: la rodilla se definió como «el primer crudo
con reducción > 0», y este mismo documento calcula que hace falta
`0,984/(1−a)` = **1,09 dB de exceso** para que el medidor salga de cero con
a = 0,1. O sea que en la rodilla la señal ya estaba 1,09 dB sobre el umbral, y
bajar 6 dB más da 7,09 de exceso real, no 6.

Con los excesos reales el desvío de la fila 2 pasa de 0,38 a **1,10 escalones**,
por encima del umbral de un escalón que corresponde a una lectura sola. Y el
cociente esperado de C3 pasa de 3,00 a 19,09/7,09 = **2,69**, contra los 1,58 a
2,42 medidos: sigue sin encajar.

**La conclusión no cambia: se refuerza.** El ajuste que parecía bueno a 6 dB era
todavía peor de lo publicado. Lo que hay que retirar es la idea de que el modelo
funcionaba en un extremo y fallaba en el otro; falla en los dos.

**Ninguna de las dos pendientes se puede publicar**, y la de sustitución por una
razón más que la que estaba escrita. 95,6 y 22,2 difieren por un factor de
cuatro, y la de sustitución **depende de la relación**, cosa que una ley del
umbral no puede hacer. Y además **está trazada a través de una saturación**: el
guion toma el primer y el último punto útil, y la curva 2:1 está clavada en
5,65 dB desde u = 0,30 hacia abajo —cinco filas idénticas—, así que las tres
pendientes (22,2 / 32,1 / 47,3) son rectas por una meseta y **no son
utilizables**. Lo que esa corrida sí sostiene, y es lo concluyente, es que las
tres curvas **no coinciden**.

## Lo que sí queda establecido, y es un negativo

**`VtoTHRESH(a) = −90 + 96a` junto con `VtoRATIO(a) = 1/a` y una rodilla dura no
describen este compresor.** La prueba es interna y no depende de ninguna
calibración: **si el modelo fuera correcto, las tres curvas de sustitución
tendrían que coincidir**, porque las tres despejan el mismo exceso con el factor
que el propio modelo dicta. No coinciden.

| Umbral crudo | 2:1 | 4:1 | 10:1 |
|---|---|---|---|
| 0,50 | 3,30 | 3,98 | 4,06 |
| 0,34 | 9,97 | 12,87 | 15,17 |
| 0,14 | 11,30 | 15,54 | 21,10 |

Y **cada curva se aplana**, a un crudo distinto según la relación: la de 2:1
desde 0,30, la de 4:1 cerca de 0,18, la de 10:1 no llega a aplanarse.

## La hipótesis que mejor sostiene los datos, marcada como hipótesis

**El sospechoso es el medidor de reducción, no `VtoRATIO`.**

Las tres curvas **coinciden donde la reducción es chica** —1,65 / 2,98 / 3,65 dB
en el umbral 0,50, con excesos casi iguales— y **divergen a medida que la
reducción crece**. O sea que la divergencia correlaciona con **la magnitud de la
reducción**, no con el umbral.

Y hay un dato que encaja: el medidor de reducción está contrastado contra caídas
reales en **tres puntos —4,66, 9,00 y 10,80 dB—, todos por debajo de 11**. La
curva de 2:1 se aplana con 5,65 dB de reducción, dentro de lo verificado; la de
10:1 llega a 19 dB, **muy por fuera**.

**Esto no está probado.** Es la explicación más económica de los cuatro datos, y
lo que haría falta para decidirla es medir la reducción contra una caída de nivel
**por encima de 11 dB**, que es lo que nadie hizo. Queda como el siguiente paso.

## Lo que el auditor aportó, y sin lo cual esto no se habría visto

Corrió antes de medir y devolvió doce trampas. Tres cambiaron el resultado:

1. **«El fader está aguas abajo del detector.»** Mi diseño original movía la
   fuente con el fader del canal. Está medido que eso no mueve lo que el detector
   ve —el medidor de entrada quedó «clavado en −20,76 dB en las quince
   posiciones»—, así que la rodilla se habría movido cero y yo habría concluido
   que la pendiente no es 96. **La corrida entera habría sido basura con forma de
   resultado.**
2. **«Con dos rodillas separadas 6 dB la pendiente sale 96 ± 22.»** Dio el número
   y con él el diseño: 30 dB de separación en vez de 6.
3. **«Con un solo exceso, "proporcional a (1−a)" y "la relación es 1/a" son
   indistinguibles.»** De ahí salieron los dos excesos, y **el segundo es el que
   rompió el modelo**. Con uno solo, la 97 se habría cerrado en falso: a 6 dB
   encaja con 0,38 escalones de desvío, que es una tabla perfectamente
   publicable.

## Lo que NO se midió, y el contrato lo predecía

El contrato tenía cinco predicciones. **C5 —los tiempos de ataque y relajación—
no se midió.** No es que saliera mal: no se implementó. Decirlo importa porque la
tentación es redefinir el alcance en silencio y presentar la 97 como cerrada.

**Y no tiene sentido medir los tiempos ahora.** Un tiempo de relajación se mide
viendo cómo cae la reducción, y la escala de la reducción es justo lo que quedó
bajo sospecha. Primero se resuelve eso.

## Consecuencia para el producto

**El paso 9 del camino del MVP sigue sin ley medida, y ahora se sabe que la que
estaba escrita no sirve.** Eso es mejor que antes: antes había una ley del
`mixer.html` que nadie había contrastado y que cualquiera podía tomar por buena.
`VERIFICADO_CONTRA_CONSOLA` en `conversiones.ts` ya excluía al compresor de su
bandera; ahora hay motivo medido.

## Restauración

Comprobada releyendo por HTTP en las tres corridas: `dyn.threshold = 0,875`,
`dyn.ratio = 1`, `dyn.attack` y `dyn.release` en su valor, `m.afs.enabled = 1`.
**Y cero filtros nuevos en el supresor del general**: apagarlo antes de medir
—decisión del usuario del 2026-09-12— funcionó.

---

# La hipótesis del medidor quedó refutada

**Medido el 2026-09-12**, después del resultado de arriba. Evidencia:
`evidence/calibrar-medidor-reduccion-2026-09-12.txt`.

## El método

La reducción **real** se lee con **otro instrumento**: el medidor de nivel del
canal, cuyo recorrido de 80 dB sí está medido contra el aparato. Con fuente y
umbral fijos se barre la relación, y la caída de `entrada` respecto del punto
`ratio = 1` —donde no hay compresión— **es** la reducción.

**La referencia es `ratio = 1` y no `dyn.bypass`, a propósito.** Puentear saca el
bloque entero, incluida su ganancia de compensación, así que la diferencia
mezclaría la reducción con la compensación y daría un número limpio y
equivocado. Es el mismo error que ya costó dos corridas: medir la cadena entera
creyendo medir un bloque.

## El resultado: el medidor está bien

| Tramo | Puntos | Desvío máximo |
|---|---|---|
| Hasta 11 dB, donde ya estaba verificado | 7 | 0,35 dB = **0,52 escalones** |
| **Arriba de 11 dB, donde no lo estaba** | 5 | 0,35 dB = **0,52 escalones** |

Sigue la caída real hasta **24,34 dB de reducción** con un desvío máximo de
0,35 dB —**0,52 escalones**, no «medio escalón», que es lo que decía acá dos
líneas debajo de la tabla que dice 0,52— y la precisión **no se degrada** en el
tramo sin verificar. El testigo `pre` no se movió más que la resolución del
instrumento en los trece puntos: 0,00 dB leídos, que con un paso de 0,3334 es
una cota y no un cero.

**Y el desvío es sistemático en un sentido, que es distinto de ser ruido.** Los
doce residuos no nulos de la evidencia son **todos negativos** (−0,02 y −0,35,
ninguno positivo): el medidor de reducción informa siempre **algo menos** que la
caída real, que es lo que se espera de un truncado a su propia rejilla de
0,6668 dB.

Esto no cambia la conclusión —el error del ítem 97 no está en el medidor— y hay
que decirlo igual, porque un sesgo de un signo no es dispersión. Es el mismo
patrón que la medición 94 se obligó a reportar de sus propios residuos, y acá se
reportaba sólo el máximo. Lo encontró una auditoría de sobre-afirmación.

**Mi hipótesis era falsa.** Iba a explicar cuatro observaciones con un
instrumento defectuoso, y el instrumento está bien. **El error está en la ley**,
y ahora los datos la constriñen de verdad porque el medidor tiene respaldo.

## Lo que los datos buenos dicen del modelo

| Modelo | Veredicto |
|---|---|
| `reducción = E·(1 − a)` con `R = 1/a` | **Refutado.** El exceso despejado va de 10,0 a 25,6 en la misma corrida. No es constante, y tiene que serlo: la fuente y el umbral no se movieron |
| `reducción = −20·log₁₀(a)` | Encaja **dentro de 0,48 dB hasta a = 0,15**, y se despega después: −1,00 en 0,10 y −1,68 en 0,05 |

**El segundo NO se declara ley, y el motivo es concreto:** en la corrida anterior,
con el umbral en 0,4672 y `a = 0,5`, la reducción fue 2,98 — y `−20·log₁₀(0,5)`
es 6,02. **La relación no se sostiene en otro umbral.**

**Lectura mía de las dos corridas juntas, discutible:** a umbral 0,14 la
reducción ya está saturada —la corrida anterior mostró que cada curva se aplana— y
el valor de saturación es el que sigue esa curva. Eso explicaría por qué
`−20·log₁₀(a)` aparece acá y no allá. **Es una lectura, no un resultado.**

## El siguiente paso, y por qué ahora se puede

Un **barrido en dos dimensiones**, umbral × relación, para tener la superficie en
vez de dos cortes. No se podía hacer antes con confianza porque el instrumento
estaba bajo sospecha; ahora tiene respaldo hasta 24 dB.

Lo que **no** hay que hacer es ajustar una curva a los doce puntos de un solo
umbral y publicarla. Este proyecto tiene documentado lo que pasa: los tres
barridos de 84,5 dB eran rectas impecables, y lo que los delató fue que no
coincidían entre sí.
