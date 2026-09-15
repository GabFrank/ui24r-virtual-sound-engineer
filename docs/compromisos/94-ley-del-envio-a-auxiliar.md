# 94 — La ley del envío a auxiliar

**Escrito antes de tocar la consola**, según `docs/protocolo-de-verificacion.md`.
Lo que este contrato le atribuye al usuario se contrasta contra
[`docs/pedidos/00-lo-que-dijo-el-usuario.md`](../pedidos/00-lo-que-dijo-el-usuario.md).

## Qué se mide y para qué

`i.N.aux.M.value` va de 0 a 1. **Cuántos dB es eso, no lo sabe nadie.** Sin ese
eje no se puede declarar un límite en decibeles, e INV-004 rechaza todo
parámetro sin límite declarado: es lo que mantenía `MONITOR_AUX_SEND` cerrado y
lo que impide cumplir una decisión que el usuario tomó hace dos días.

## El banco

| Qué | Valor | De dónde sale |
|---|---|---|
| Fuente | Tono de 1 kHz por la Scarlett al **canal 10** (`i.9`) | Dato del usuario, confirmado leyendo el aparato |
| Bus de medida | **Auxiliar 3** (`a.2`) | Es el primero con el supresor **apagado** (`a.2.afs.enabled = 0`) |
| Lectura | `decodificarVuBuses(...).auxiliares[2].pre` | El byte `+0`, que **no sigue al fader del bus** — medido el 2026-09-09 moviendo `a.0.mix` |
| Testigo | El medidor del canal 10 | Si se mueve, la fuente se movió y la corrida no vale |

**Por qué NO el auxiliar 1.** Tiene el supresor encendido y un filtro plantado
de −18 dB en 999,97 Hz. Un barrido con tono de 1 kHz por ahí mediría el notch y
daría una curva creíble y falsa. La trampa quedó nombrada antes de correr nada.

**Por qué no hace falta tocar `a.2.mix`.** Está en 0, y a primera vista eso
obligaría a subirlo y después restaurarlo. No: el medidor `pre` toma **antes**
del fader del bus. Una escritura menos que deshacer es un riesgo menos.

**Por qué no suena nada.** No hay ningún parlante conectado a ningún auxiliar
—dicho por el usuario el 2026-09-12—, así que esto es banco y no sala.

## Lo que predigo, antes de medir

Cada una es falsable. Si alguna falla, el hallazgo es esa falla.

| # | Predicción | Cómo se falsa |
|---|---|---|
| P1 | **La ley del envío es la del fader.** La razón entre lo medido y `faderADb` da 1,00 ± 0,05 | Cualquier razón fuera de esa banda |
| P2 | El 0 dB cae en **0,7647** (13/17), igual que el fader | Que la curva medida cruce el 0 en otro punto |
| P3 | El recorrido llega a **+10 dB**, no a 0 | Que se plante en 0 dB arriba |
| P4 | El testigo del canal **no se mueve** más de ±0,5 dB en todo el barrido | Que derive: entonces la fuente se movió y no hay medición |
| P5 | Con `post = 0`, mover `i.9.mix` **no mueve** el medidor del auxiliar | Que lo mueva: sería que `post` no significa lo que dice la matriz |

**P1 es la que espero que falle**, y por eso está escrita primero. Este proyecto
ya dio por buena una vez la hipótesis «el medidor usa la ley del fader» y era
falsa: con esa ley el byte 225 daba +4,6 dB cuando la pantalla decía +10, y
costó una corrida entera. «El envío usa la ley del fader» es la misma hipótesis
con la misma forma sobre otro par de cosas. Puede ser cierta. **No se asume.**

## Qué se escribe y qué se restaura

| Ruta | Se escribe | Vuelve a |
|---|---|---|
| `i.9.aux.2.value` | el barrido entero | **0** (su valor actual) |
| `i.9.mix` | sólo para P5 | **0,7647058824** |

Nada más. No se toca ninguna instantánea, ni la fantasma del canal 9, ni el
supresor de ningún bus. La restauración se comprueba **releyendo por HTTP**,
que es un camino distinto del que escribió.

## Lo que esta medición NO va a probar

- **No prueba nada sobre los otros nueve auxiliares.** Se mide uno. Que los diez
  compartan ley es plausible y no está medido.
- **No prueba nada sobre `i.N.fx.M.value`**, el envío a efectos. Es el ítem 96 y
  puede tener otra ley: suponer que la comparte sería repetir el error de P1.
- **No dice dónde se deriva el envío en la cadena.** Eso es el ítem 95.
- **No dice qué pasa con `post = 1`.** Todo esto se mide con el envío
  pre-fader, que es como está hoy.

---

# Resultado

**Medido el 2026-09-12** (los archivos se habían nombrado `2026-09-12`: las
cabeceras de las tres corridas dicen `2026-09-12T04:4x` UTC, o sea la madrugada
del 12 local. Renombrados). Evidencia:

| Archivo | Qué es |
|---|---|
| `ley-envio-aux-2026-09-12.txt` | tono a −12 dBFS, 18 dB de recorrido útil |
| `ley-envio-aux-caliente-2026-09-12.txt` | **corrida fallida**, un solo punto |
| `ley-envio-aux-caliente-2026-09-12b.txt` | tono a −1 dBFS, **27,87 dB** |
| `controles-del-bus-2026-09-12.txt` | restauración, censo del bus, supresor, dinámica |

## P1 falló bajo el criterio que firmé, y eso va primero

El contrato decía, escrito antes de medir: *«La razón entre lo medido y
`faderADb` da 1,00 ± 0,05»*, y como criterio de falsación *«cualquier razón
fuera de esa banda»*.

**La corrida caliente da `razon minima: 0.9395`. Está fuera de la banda. Por mi
propio criterio, P1 quedó falsada.**

La primera versión de este resultado decía «**P1 era la que esperaba que
fallara, y no falló**», y llegaba ahí cambiando el criterio —de razón a desvío
absoluto— **después** de ver los datos, y presentando el cambio como una mejora
metodológica en otra sección. Lo encontró el auditor de procedencia.

El cambio de criterio es defendible: la razón se vuelve inútil cerca del punto
de referencia, porque el denominador tiende a cero y amplifica la cuantización
sin límite —en el crudo 0,95 la razón da 0,939 y el desvío absoluto es 0,15 dB,
menos de medio escalón—. **Pero eso hay que decirlo en este orden: el criterio
registrado se cumplió en su forma de falsación, el criterio era malo, y acá está
por qué.** Anunciar «no falló» y explicar el cambio treinta líneas más abajo
borra exactamente lo que el compromiso previo existía para preservar.

Las dos corridas dan además veredictos opuestos bajo ese criterio: la de
−12 dBFS tiene mínima 0,9847 y **entra** en la banda; la caliente no. Eso solo
ya decía que el criterio no discriminaba nada.

## Las cinco predicciones, con el criterio corregido

| # | Predicción | Resultado |
|---|---|---|
| P1 | Usa la ley del fader | **Falsada por el criterio registrado.** Con el criterio corregido —desvío absoluto contra la resolución— **no se puede decidir**: el desvío máximo es 0,31 dB sobre un escalón de 0,3334 |
| P2 | El 0 dB cae en 0,7647 | **Era infalsable desde el diseño, y eso es defecto mío, no del instrumento.** Una corrida de diferencias nunca puede fijar un cero absoluto, y `conversiones.ts` ya lo dice con todas las letras. No debí escribirla como predicción |
| P3 | El recorrido llega a +10 dB | **Medido: el intervalo de crudo 1,0 a 0,7647 vale 10 dB.** Que ese extremo *sea* «+10 dB» importa el cero de `faderADb`, no lo mide — es lo mismo que P2 declara no verificable |
| P4 | El testigo no deriva | **Confirmada.** 0,00 dB en las dos corridas |
| P5 | Con `post = 0` el fader no mueve el auxiliar | **Confirmada.** Ver abajo |

**Sobre P3 y la palabra «exacta».** La primera versión decía «−10,00 dB clavados,
desvío 0,00». Los dos promedios cayeron sobre bytes enteros —89,0 y 59,0, o sea
30 escalones justos—, y que el byte no oscile significa **máxima** incertidumbre
de cuantización, ±0,167 dB en cada extremo, no mínima. En la otra corrida el
mismo punto da −9,90. Un instrumento de 0,3334 dB por escalón no produce
desvíos de cero: produce desvíos indistinguibles de cero.

## P5, con los números de los archivos que se citan

La primera versión decía «el auxiliar leyó −59,00 dB las cuatro veces». **Esa
cifra sale de la corrida fallida**, que este mismo documento declara inservible
y que no estaba en la lista de evidencias. Lo que dicen las corridas válidas:

| Fader del canal | −12 dBFS | −1 dBFS |
|---|---|---|
| 0,7647 | −69,50 | −58,91 |
| 0,50 | −69,46 | −58,85 |
| 0,30 | −69,51 | −59,00 |
| 0,7647 | −69,45 | −59,00 |

**La conclusión se sostiene igual** —el fader del canal no mueve el auxiliar,
con un margen de 0,06 y 0,15 dB, los dos por debajo de medio escalón— pero la
coincidencia exacta de cuatro lecturas idénticas era un artefacto del archivo
descartado. Es el caso puro de citar un número que no está en el archivo citado.

## El residuo es sistemático, y omitirlo era quedarse con la mitad cómoda

Los desvíos de la corrida caliente, en orden de barrido:

```
0,15  0,04  0,08  0,01  0,00  0,01  0,05  0,16  0,09  0,10  0,16  0,12  0,25  0,31
```

**Los catorce tienen el mismo signo**: el envío atenúa siempre *menos* que
`faderADb`. Bajo cuantización aleatoria eso tiene probabilidad del orden de
2⁻¹³. Y **crece monótonamente en los últimos tres** —0,12 → 0,25 → 0,31— justo
hasta donde el barrido se corta porque el medidor toca el piso.

Un residuo unilateral y creciente, truncado por el piso del instrumento, **es
estructura y no dispersión**. Y hay **dos** explicaciones compatibles con lo
medido: una diferencia de ley, o un efecto del medidor cerca de su piso.

**Los datos favorecen la segunda, y este párrafo afirmaba la primera.** Decía
que era «la firma de una diferencia de ley real». Dos cosas lo desmienten, y las
encontró una auditoría de sobre-afirmación:

- **El residuo máximo de cada corrida cae en su byte más bajo, no en el mismo
  crudo**: 0,28 dB en el byte 2,9 (crudo 0,56) en la fría, 0,31 dB en el byte
  5,4 (crudo 0,40) en la caliente. Una diferencia entre dos leyes es función del
  crudo y se reproduciría crudo por crudo; lo que ordena estos datos es la
  cercanía al piso del medidor.
- **En la corrida de −12 dBFS los residuos NO son todos del mismo signo** —hay
  dos negativos arriba—. «Los catorce tienen el mismo signo» es cierto de la
  corrida caliente, y este documento lo presentaba como propiedad del fenómeno.

«No se pudo distinguir» sigue siendo la acotación correcta. Presentarla sin el
patrón de signos era elegir la mitad del dato que convenía; presentar el patrón
como prueba de una diferencia de ley es el mismo error en la otra dirección.

## Lo que se puede afirmar

**El desvío observado contra `faderADb` no supera un escalón del medidor en los
catorce puntos comparados**, sobre 27,87 dB desde el tope. Eso es todo.

La primera versión decía «un asistente que convierta dB a crudo con `dbAFader`
no se va a equivocar más de un escalón en ese tramo», y son tres saltos de más:
se midió crudo → dB y la afirmación es sobre la inversa, cuyo error depende de
la pendiente local; catorce puntos no acotan un tramo continuo; y la cuantización
del instrumento agranda el peor caso.

**Y ese peor caso estaba mal calculado: contaba una lectura y son dos.** Decía
«cada lectura lleva ±0,167 dB, así que el peor caso es ~0,48 dB». La cantidad
medida es la **atenuación**, o sea la diferencia entre el byte en el crudo *c* y
el byte en el crudo 1,0, así que arrastra hasta **±0,3334** —dos veces medio
escalón—. Peor caso: 0,3064 + 0,3334 = **~0,64 dB**, todavía más de un escalón.

Es exactamente el hallazgo que el proyecto tiene registrado en
`docs/backlog/hallazgo-umbral-de-una-diferencia.md`, aplicado acá a una **cifra
publicada** en vez de a un criterio de falsación. Matiz honesto: la lectura de
referencia (byte 89,0) no oscila y la del extremo sí, así que el peor caso real
está entre 0,48 y 0,64; con la regla registrada del proyecto se publica 0,64.
Lo encontró una auditoría de aritmética.

## Lo que NO prueba

- **Nada por debajo de −27,87 dB.** Ahí el medidor del bus lee cero.
- **Nada sobre los otros nueve auxiliares.** Se midió uno.
- **Nada con `post = 1`**, ni sobre dónde se deriva el envío en la cadena: eso
  es el ítem 95.
- **Nada sobre un error de escala constante**, que por construcción es invisible
  en una medición relativa a crudo 1,0.
- **Nada sobre histéresis ni orden.** El barrido es monótono descendente y de
  una sola pasada: no hay subida ni punto repetido que separe la ley de un
  efecto de asentamiento.
- **No se vigiló el compresor durante la corrida.** El guion no lee el medidor
  de reducción. El estado archivado dice `ratio = 1`, o sea 1:1 e inerte, pero
  eso es una lectura de antes y después, no durante.

## Lo que encontraron los dos auditores

**El de expectativas**, en contexto fresco, antes de medir. Su trampa número uno
era, textual: *«declarar que el envío usa la misma ley que el fader porque los
residuos son chicos»*. **Es exactamente lo que yo iba a escribir.** De ahí salió
la segunda corrida con el tono más caliente. También avisó que el auxiliar es una
suma y que el supresor puede aprender un filtro a mitad del barrido; las dos se
comprobaron y quedaron archivadas en `controles-del-bus-2026-09-12.txt`: tres
canales más le mandan al bus —el 2 a 0,3547, el 16 a 0,2969, el 19 a 0,7561, sin
señal esta noche— y el supresor siguió apagado con cero filtros.

**El de procedencia**, después. Encontró lo que este documento acaba de
corregir: el criterio de P1 cambiado después del dato, la cifra de P5 tomada del
archivo descartado, el «exacta» de P3, el residuo sistemático omitido, la
afirmación sobre `dbAFader`, las fechas y el conteo de puntos.

**Y hay que decir dónde se equivocó**, porque su informe se va a leer entero:
afirmó que un cuarto canal —el 20, a 0,7648— también alimenta el bus, y que el
compresor del canal 10 está en 0,481 con preset «Kick». Las dos salen de un
volcado archivado de otro spike, de otra fecha. Releído contra la consola viva
esta madrugada: `i.19.aux.2.value = "0"` y `i.9.dyn.ratio = 1` sin preset.

## Tres defectos propios del instrumental

**El guion archivaba una corrida inservible sin quejarse.** Se pasó `""` como
lista de valores; `??` no cae al valor por defecto con cadena vacía, y barrió un
solo punto. El defecto no fue el argumento: fue que el guion lo aceptara y
archivara. Corregido con una guarda que aborta con menos de cinco puntos.

**Los controles se corrían desde un borrador.** El censo del bus, el estado del
supresor y la comprobación de restauración se citaron **sin estar en ninguna
evidencia archivada**. Rehechos con `controles-del-bus.ts`.

**Ninguna de las corridas archivadas la produjo el guion de hoy.** Las tres
cabeceras llevan huellas distintas entre sí y distintas de la actual, porque el
guion se editó después de cada una. Consecuencia concreta: **la línea «desvío
absoluto máximo» no aparece en ningún archivo de evidencia** —la imprime sólo la
versión actual, que nunca corrió contra la consola— y el 0,31 dB es un recálculo
a mano sobre la columna de la tabla. Da bien, está verificado, y aun así el
documento lo presentaba bajo «Evidencia:». Lo que las tres corridas sí imprimen
es el criterio viejo, el fuerte. La prudencia se agregó después.

## Restauración

Comprobada **releyendo por HTTP**, camino distinto del que escribió:
`i.9.aux.2.value = 0` y `i.9.mix = 0.7647058824`. Evidencia:
`controles-del-bus-2026-09-12.txt`. No se tocó ninguna instantánea, ni la
fantasma del canal 9, ni el supresor de ningún bus.


---

# Lo que la medición 102 encontró en este banco, el 2026-09-13

**El criterio con el que esta medición eligió su bus fue insuficiente, por la misma
razón que ella misma había nombrado.**

Esta medición rechazó el auxiliar 1 con este motivo, textual:

> *«Tiene el supresor encendido y un filtro plantado de −18 dB en 999,97 Hz. Un
> barrido con tono de 1 kHz por ahí mediría el notch y daría una curva creíble y
> falsa.»*

Y eligió el auxiliar 3 comprobando **sólo `a.2.afs.enabled = 0`**. La medición 102
midió después que ese bus atenúa el tono de 1 kHz **22,67 dB**, de forma constante
—verificado en tres crudos distintos: −22,67 / −22,67 / −22,33— y que tiene **doce
de sus treinta y una claves `eq.peak` fuera del centro**, mientras el auxiliar 5
las tiene todas en 0,5. Evidencia:
[`diferencia-entre-buses-2026-09-13.txt`](../spikes/SPK-P0.10b-vu2/evidence/diferencia-entre-buses-2026-09-13.txt)
y
[`ecualizador-de-los-buses-2026-09-13.txt`](../spikes/SPK-P0.10b-vu2/evidence/ecualizador-de-los-buses-2026-09-13.txt).

O sea: **se evitó un notch del supresor y se cayó en una atenuación del
ecualizador del bus**, que hace exactamente lo mismo y que el censo no miraba.

## Qué sobrevive y qué no

**La ley relativa sobrevive, y eso está medido.** La atenuación es **estática** —no
depende del nivel— así que se cancela en una atenuación relativa al arranque, que
es lo que esta medición calcula. La 102 lo argumenta con su propia evidencia y
además ancló la escala del bloque de auxiliar contra un instrumento externo: el
byte `pre` sigue a la salida real dentro de 0,18 dB sobre 38 dB, y el auxiliar 3 y
el 5 comparten pendiente dentro de 0,36 dB de rango.

**Lo que NO sobrevive intacto es la explicación del residuo.** Esta medición
declaró indecidible un residuo unilateral y creciente hacia el fondo del barrido, y
se quedó en **27,87 dB de recorrido**. Los 22,67 dB de atenuación del bus se comen
unos sesenta y ocho bytes de medidor: **el barrido empezaba mucho más abajo de lo
que su banco permitía**, y por eso chocó contra el piso tan pronto.

Y la 102 midió que **el medidor no se comprime gradualmente cerca del piso**: en
los bytes 13, 10, 7 y 4 sigue a la salida real dentro de 0,16 dB, y cae a pico en
el 0. Así que el residuo de esta medición **no era el piso comportándose mal**:
era el barrido llegando al piso antes de tiempo.

## Qué haría falta para cerrarlo

Rehacer este barrido **por el auxiliar 5**, que tiene el ecualizador plano y está
cableado a la interfaz. Con 22,67 dB más de recorrido y la salida real mirando, la
ley del envío se mediría sobre el doble de tramo y contra un instrumento externo.
No está hecho.
