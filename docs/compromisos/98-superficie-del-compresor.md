# 98 — La superficie del compresor: umbral × relación

**Fecha: 2026-09-12.** Consola 192.168.0.78, fw 3.4.8318-ui24. Canal 10 (`i.9`),
la línea de la Scarlett. Contrato escrito **antes** de tocar la consola.

> **Este contrato es la segunda versión.** La primera pasó por un auditor de
> expectativas en contexto fresco, y el informe la desarmó con razón: tenía una
> expectativa infalsable, dos que pasaban o fallaban según cómo se leyeran, una
> con la tolerancia **a la mitad** de lo que le corresponde —que habría hecho
> descartar una corrida buena—, una afirmación falsa sobre su propia rejilla, y
> unos veintitrés puntos de cuarenta y ocho gastados en zonas ciegas o ya
> conocidas. Lo que cada cosa era y en qué quedó está dicho donde corresponde,
> porque el informe también encontró **un resultado**, y eso no se esconde en un
> apéndice.

## Por qué este barrido y no otro

La medición 97 refutó el modelo que estaba escrito —`VtoTHRESH(a) = −90 + 96a`
con `VtoRATIO(a) = 1/a` y rodilla dura— y dejó dos cortes de la superficie que
**no se pueden reconciliar entre sí**: la relación `−20·log₁₀(a)` encaja dentro
de 0,48 dB con el umbral en 0,14 y predice 6,02 dB donde se midieron 2,98 con el
umbral en 0,4672.

Con dos cortes no se puede decidir si esa discrepancia es la ley o la
saturación. Lo que hace falta es la **superficie**.

### Y el auditor ya resolvió la mitad, antes de medir

Truncando `−20·log₁₀(a)` a la escalera del medidor de reducción —piso 0,9840 dB,
paso 0,666801— los tres casos que la 97 midió **coinciden exactamente**:

| `a` | `−20·log₁₀(a)` | peldaño truncado | meseta medida en la 97 |
|---|---|---|---|
| 0,5 | 6,02 | **5,65** | 5,65 en cinco umbrales seguidos (0,30 … 0,14) |
| 0,25 | 12,04 | **11,65** | 11,65 en 0,18 y en 0,14 |
| 0,10 | 20,00 | **19,65** | 18,99 y subiendo — no llegó |

O sea que **`−20·log₁₀(a)` no es «la ley en un umbral»: es el techo de la
reducción**, y las mesetas de la 97 son ese techo. Eso es más de lo que la 97 se
animó a decir, y convierte la pregunta en algo que se puede falsar punto por
punto. Es lo que mide S7, que en la primera versión de este contrato era una
expectativa decorativa.

## El método

**La reducción se mide como caída de nivel, no se despeja de una rodilla.**

La 97 ubicó una «rodilla» —el primer crudo de umbral con reducción informada
mayor que cero— y de ahí despejó el exceso. El medidor de reducción tiene un
piso de **0,9840 dB**, así que para que salga de cero hace falta `0,984/(1−a)` dB
de exceso real: con `a = 0,1`, **1,09 dB**. En la rodilla la señal ya estaba
1,09 dB sobre el umbral, y todo exceso despejado de ahí arrastra ese sesgo —el
«exceso de 6 dB» de la 97 era de 7,09—.

Acá no se despeja nada. Se usa el método que la 97 terminó validando con su
propia corrida de calibración:

1. **La fuente se queda quieta.** Tono de 1 kHz por la Scarlett, un solo nivel,
   la ganancia del previo sin tocar.
2. **Para cada umbral, una referencia con `ratio = 1`**, que es «el compresor
   puesto y sin comprimir». Deliberadamente **no** `dyn.bypass`: puentear saca
   el bloque entero con su ganancia de compensación, y la diferencia mezclaría
   reducción con compensación. Es el error que ya costó dos corridas.
3. **La reducción real** es la caída de `entrada` (byte `+1`) respecto de la
   referencia **de su propio umbral**.
4. **`pre` (byte `+0`) es el testigo.** Está medido que ni el compresor, ni el
   ecualizador, ni la puerta lo tocan.
5. El medidor de reducción (`+5`) se lee como **segundo instrumento**, no como
   fuente de verdad.
6. **Y se registran `+3` y `+4`**, los medidores del bloque dinámico. Llegan en
   el mismo cuadro y no cuestan nada. Sirven para tres cosas: son un tercer
   instrumento; `+3` anulándose delataría la puerta; y 56 puntos con las dos
   variables barridas son la mejor ocasión que va a haber para **resolver la
   tensión documentada sobre qué son esos dos bytes** —el cliente los rotula
   entrada y salida del bloque, y una auditoría midió que `+3` se anula con
   `gate.enabled = 0` y `+4` con `dyn.bypass = 1`—. **No** son fuente de verdad
   acá: se archivan, y si contradicen a `+1` eso abre un ítem.

### La fortaleza del método, que la primera versión no se atribuía

Al ser una **diferencia de dos lecturas**, todo lo que esté entre el bloque
dinámico y `+1` y sea **estático** se cancela: el ecualizador, el pasa-altos,
cualquier filtro. Eso inmuniza la medición contra casi toda la cadena.

Contra lo que **no** inmuniza es contra lo que sea **dependiente del nivel**, y
ahí hay dos caminos reales por los que el umbral podría mover `entrada` sin que
haya compresión:

- **La puerta de ruido, y es el peligroso.** `i.9.gate.enabled` está en 1 en la
  línea de base de este canal, y está medido (2026-09-09) que **la puerta mueve
  `entrada`** mientras `pre` queda clavado. En el rincón profundo `entrada` baja
  a −62 dB o menos: si `gate.thresh` cae ahí, la puerta atenúa y esta definición
  de reducción **lo llamaría compresión**. Ni el testigo ni el medidor de
  reducción lo delatan.
  **La guarda es gratis y la primera versión la tiraba a la basura**: el bit 7
  del byte `+5` es el indicador de puerta, con polaridad ya resuelta —**1 =
  abierta**—, y llega en el mismo cuadro. Leer `+5` sólo a través de
  `dbDeReduccion` lo enmascara y lo pierde.
- **El de-esser.** Es el cuarto bloque dinámico, **el único que nunca se
  midió**, es dependiente del nivel y está entre el detector y `+1`. Un tono de
  1 kHz probablemente cae fuera de su banda, y «probablemente» es una
  suposición: se lee y se registra.

Una compensación que siguiera a la **relación** queda en buena medida
descartada: `i.9.dyn.autogain` no existe en este firmware, y la corrida de
calibración de la 97 barrió la relación completa en `u = 0,14` con la caída
coincidiendo con la reducción informada dentro de 0,35 dB hasta 24 dB. La que
podría seguir al **umbral** es exactamente lo que mide S1.

## Las precondiciones, verificadas antes del primer punto

**Si alguna no se cumple, no se corre.** La rejidad entera depende de ellas: que
`u = 0,55` esté sobre el cruce y que `u = 0,14` dé 38 dB de exceso son
consecuencias del nivel de la fuente.

| Precondición | Valor | Por qué |
|---|---|---|
| `pre` | **−37,66 dB ± 0,334** (un escalón) | Es el valor de las tres corridas de la 97 con el tono a −1 dBFS. Sin esto el montaje es otro y ninguna comparación con la 97 vale |
| Piso de ruido del canal | se mide **con el tono apagado**, y se archiva | Sin él, un piso de instrumento es indistinguible de una saturación del compresor, que es lo que la corrida vino a decidir |
| `hw.9.gain` | se **registra**, leído del aparato | **Ninguna corrida del proyecto lo registró nunca.** Un cambio de ganancia del previo mueve el cruce y desplaza los siete umbrales a la vez, y hoy no hay con qué detectarlo |
| `gate.enabled`, `gate.thresh`, `gate.depth` | se registran | Si la puerta está habilitada con umbral por encima de −80 dB, se declara |
| `dyn.softknee`, `dyn.gain`, `dyn.outgain`, `dyn.hold`, `deesser.*` | se registran | «Se deja como está» no es verificable ni reproducible si no se dice en qué estado estaba |

## La rejilla

**Umbrales, siete:** `0,14 · 0,26 · 0,35 · 0,42 · 0,4672 · 0,50 · 0,55`.

La densidad está **entre el cruce y 0,42**, que es donde las dos hipótesis se
separan. El exceso de cada umbral, con la pendiente 95,6 y el cruce medido en
**0,5414** (la rodilla 0,53 más el sesgo de 1,09 dB de su propia definición):

| umbral | 0,55 | 0,50 | 0,4672 | 0,42 | 0,35 | 0,26 | 0,14 |
|---|---|---|---|---|---|---|---|
| exceso (dB) | **−0,8** | 4,0 | 7,1 | 11,6 | 18,3 | 26,9 | 38,4 |

**Por qué así y no como estaba.** La primera versión tenía seis umbrales con
`0,10` y `0,18`, y el auditor mostró que **~23 de sus 48 puntos eran ciegos o ya
estaban predichos por la 97**: para `a = 0,5` la meseta arranca en `u = 0,30`, o
sea que 0,26, 0,18 y 0,10 dan los tres el mismo número. Las dos hipótesis se
separan **en la rampa**, con reducción chica, donde la saturación todavía no
puede estar actuando — y ahí había un solo umbral.

Se sacan `0,10` y `0,18` y se agregan `0,42` y `0,50`, en la rampa. Y se agrega
**`0,14`**, que la primera versión creía cubierto: decía que «el 0,14 de la 97
queda entre el 0,10 y el 0,18, así que los dos cortes anteriores caen dentro de
esta rejilla». **Es falso**: caer *entre* dos puntos no es estar *en* la
rejilla, y 0,14 es el corte **reproducible** — mismo método, mismo instrumento,
ocho de nueve relaciones en común.

**Relaciones, ocho más la referencia:** `1,0` (referencia) · `0,9` · `0,7` ·
`0,5` · `0,35` · `0,25` · `0,15` · `0,10` · `0,05`.

Con la advertencia registrada de que **la columna `a = 0,9` no puede decidir**:
su techo es 0,92 dB, que **trunca a 0,00 en el medidor de reducción** y son 2,7
escalones del de nivel. Con la tolerancia de dos escalones, «techo en 0,92» y
«no pasó nada» son el mismo resultado. Se informa como observación.

Son **56 puntos medidos más 7 referencias**, 63 lecturas. A seis segundos por
punto, y con la vuelta de cada bloque, unos catorce minutos de tono.

*(La primera versión decía 54 y 48 en distintos párrafos, con seis umbrales.
Con siete son 56 medidos. Cuando un documento lleva la misma cuenta escrita en
cuatro lugares, tres envejecen.)*

**La columna `u = 0,55` es una columna de control.** Está 0,8 dB **por encima**
del cruce, así que con rodilla dura no hay compresión para ninguna relación: se
esperan **0,00 exactos en sus ocho puntos**, y eso confirma que la relación por
sí sola no hace nada por debajo del umbral. Queda **excluida de S3, S4 y S7**.
Si da algo distinto de cero, la primera sospecha es `dyn.softknee`, que no se
barre, y el punto no se usa para nada más.

## El criterio, que no es uno solo

**Las predicciones se declaran también en bytes**, porque el instrumento es
**determinista y no ruidoso**: con esta fuente el byte no dita en cuarenta
cuadros —todas las lecturas de la evidencia de la 97 son múltiplos exactos del
peldaño— y promediar no compra resolución. Una tolerancia en dB sobre un
instrumento entero inventa un continuo que no existe.

**Y «dos escalones» vale sólo cuando las dos cantidades salen del mismo
medidor.** Los pasos son distintos: el de nivel 0,333401 dB y el de reducción
0,666801.

| Comparación | Lecturas | Umbral |
|---|---|---|
| nivel contra nivel (S1, S2) | 2 del de nivel | **0,667** |
| caída contra caída (S3, S4, S5a) | 4 del de nivel | **0,667** — cuatro lecturas arrastran 4 × 0,1667, que da el mismo número que dos; conviene decirlo porque el lector va a sumar mal |
| caída contra **lectura de reducción** (S5b, S6) | 2 de nivel + 1 de reducción | **1,334** |

La primera versión declaraba 0,667 para las dos últimas, o sea **la mitad**. En
S5 eso no era un detalle: ver ahí.

## Expectativas registradas

### S1 — Las seis referencias de `ratio = 1` coinciden

Dentro de **0,667 dB**. Con la relación en 1 no hay compresión, así que el
umbral no debería cambiar nada.

**La falsaría** que difieran. Significaría que el umbral hace algo por sí solo
—compensación que sigue al umbral, o que `ratio = 1` no es exactamente 1:1— y es
justo el agujero que la 97 dejó abierto: su corrida de calibración barrió la
relación con **un solo umbral**.

**Si falla, la corrida no se retira**: se publica como medición del **cambio de
ganancia del bloque dinámico**, no de reducción, se abre un ítem por la
compensación que sigue al umbral, y no se ajusta ni se declara nada sobre la
ley.

### S2 — El testigo `pre` no se mueve

Más de **0,667 dB** en las 63 lecturas. **Ya casi falló una vez**: en
`umbral-por-sustitucion` la fila 4:1 / `u = 0,140` tiene `pre = −37,48` contra
−37,66 en las otras veintinueve, o sea 0,54 escalones.

**Si falla**, se anula el punto **y su bloque de umbral entero**, porque la
referencia comparte la deriva. La rejilla responde la pregunta si sobreviven al
menos cinco umbrales con cinco relaciones cada uno; por debajo de eso se repite.

### S3 — La reducción no decrece al bajar `a`, y se dice dónde deja de crecer

Un retroceso de más de **0,667 dB** la falsaría. **Y además se informa la
meseta**: para cada umbral, el primer `a` desde el cual dos puntos consecutivos
difieren menos de 0,667. **Ese punto es el dato que se busca, no un fallo.**

Declarado antes: se espera meseta en `0,14` y `0,26`, y no en `0,4672`, `0,50` ni
`0,55`.

*La primera versión decía «crece monótonamente» y el auditor mostró que no podía
detectar lo que decía detectar: la firma de una saturación **es** una meseta, y
una meseta es monótona no estricta, así que pasaba. Con monotonía estricta
fallaba por cuantización sola. Pasaba o fallaba según cómo se leyera la palabra.*

### S4 — La reducción no decrece al bajar el umbral

Mismo umbral y mismo tratamiento de la meseta, con la columna `0,55` excluida.

*Mismo defecto que S3 en la primera versión, y además ya estaba predicha falsa
por los datos de la 97.*

### S5a — El corte de `0,14` se reproduce, mismo método y mismo instrumento

En `u = 0,14`, las ocho relaciones comunes con
`calibrar-medidor-reduccion-2026-09-12.txt` reproducen sus caídas dentro de
**0,667 dB**:

| `a` | 0,9 | 0,7 | 0,5 | 0,25 | 0,15 | 0,10 | 0,05 |
|---|---|---|---|---|---|---|---|
| caída medida en la 97 (dB) | 1,00 | 3,00 | 6,00 | 11,67 | 16,00 | 19,00 | 24,34 |

**La falsaría** que dos o más puntos se salgan. **Ésta sí pone en duda la corrida
entera**: mismo método, mismo instrumento, mismo canal, mismo nivel de fuente, y
ocho puntos no se desvían todos por casualidad.

### S5b — El corte de `0,4672` se reproduce, con la conversión de instrumento a la vista

El 2,98 dB de la 97 es un **peldaño de la escalera de reducción** (0,984 ·
1,651 · 2,318 · **2,984** · 3,651 …), truncado **hacia abajo**, y la 97
estableció que ese medidor informa siempre algo **menos** que la caída real. Así
que la reducción verdadera de ese punto está en `[2,98 ; 3,65)`, y la caída que
mida el 98 carga ±0,667 encima: la banda honesta es **`[2,31 ; 4,31]`**, con
valor esperado **≈ 3,31**.

**Acá estaba la trampa de la primera versión, y es aritmética, no hipotética.**
Declaraba `2,98 ± 0,67` = `[2,31 ; 3,65]`: **el borde superior quedaba 0,67 dB
corto, exactamente del lado donde cae el valor esperado.** Una corrida perfecta
que leyera 3,8 o 4,0 «falsaba» S5 y, por el texto que tenía, dejaba **la corrida
entera en duda**. Y culpaba al banco —«algo del banco cambió»— cuando el nivel
de fuente no tenía número y `hw.9.gain` no se registraba en ninguna parte, así
que no podía localizar ninguna causa.

**La falsaría** salirse de `[2,31 ; 4,31]`. **Y si S5b falla mientras S5a pasa,
lo que cambió no es el banco: es la correspondencia entre los dos medidores en
ese umbral** — se informa así, no como duda sobre la corrida.

*A favor de S5, para no exagerar: `umbral-por-sustitucion` midió el mismo 2,98 en
`u = 0,460`, o sea que el dato se repitió en otra corrida y es robusto a ±0,007
de crudo. La cuantización del crudo escrito no es un riesgo.*

### S6 — El medidor de reducción informa igual o menos que la caída, nunca más

El residuo `informada − caída` cae en **`(−1,334 ; +0,334]` dB** en todo punto
donde informe más que su piso.

**La falsaría** un residuo positivo mayor que 0,334 —contradiría el truncado que
la 97 estableció, con sus doce residuos no nulos todos negativos— o uno más
negativo que −1,334, que contradiría la calibración **o delataría una ganancia
de compensación que sigue a la relación**.

Se informa **el signo de los 56 residuos**, no sólo el máximo. *La primera
versión usaba un umbral simétrico de ±0,667, que aceptaba un residuo positivo
que la 97 ya había excluido.*

### S7 — `−20·log₁₀(a)` es el techo de la reducción, no la ley

Para cada relación, la reducción crece al bajar el umbral y **se detiene en
`−20·log₁₀(a)`**. Punto por punto:

| `a` | 0,9 | 0,7 | 0,5 | 0,35 | 0,25 | 0,15 | 0,10 | 0,05 |
|---|---|---|---|---|---|---|---|---|
| techo (dB) | 0,92 | 3,10 | 6,02 | 9,12 | 12,04 | 16,48 | 20,00 | 26,02 |
| peldaño del medidor de reducción | **0,00** | 2,98 | 5,65 | 8,99 | 11,65 | 16,32 | 19,65 | 25,66 |

**La falsaría** que alguna curva **supere** su techo por más de 0,667 dB, o que
se detenga por debajo de él en un umbral donde otra relación ya llegó al suyo.

Queda registrado que la 97 ya midió tres techos compatibles —5,65 y 11,65 dos
veces— y uno no alcanzado (`a = 0,10`, llegó a 18,99 y seguía subiendo), así que
esta predicción **se apoya en datos previos y no es nueva**.

*La primera versión decía «`−20·log₁₀(a)` NO describe la superficie» y su
falsación era aritméticamente imposible con esa rejilla, antes de medir nada.
Estaba garantizada como verdadera y desperdiciaba la hipótesis buena.*

### Guarda de rango, decidida antes

Un punto **se anula** si:

- el byte de `entrada` baja de **16** (≈ −74,67 dB, tres escalones sobre el piso
  de −80);
- la reducción informada llega a **40,00 dB**, que es el techo de
  `REDUCCION_RANGO_DB` y no un dato;
- queda a menos de **6 dB del piso de ruido** medido con el tono apagado;
- el **bit 7 de `+5`** cae a 0, o sea la puerta se cerró: ahí `entrada` trae
  atenuación de la puerta y esta corrida la contaría como reducción.

**Por qué hace falta.** En `u = 0,14` el exceso es 38 dB. Con `a = 0,05`: si el
techo es `−20·log₁₀(a)` = 26,0 dB, `entrada` cae a −63,7 dB (byte 49, cómodo).
Pero si la reducción fuera `E·(1−a)` ≈ 36 dB, cae a **−73,7 dB (byte 19)**,
contra un piso de −80. O sea que **la hipótesis que predice más reducción es
justo la que el instrumento no puede medir**, y una caída subestimada por piso
de medidor se lee exactamente igual que una saturación del compresor.

### Asentamiento comprobado, no asumido, y en los dos sentidos

Los tiempos de ataque y relajación **no se midieron nunca** (C5 de la 97,
declarado no implementado), así que los seis segundos no tienen respaldo.

- En un punto profundo se muestrea a **2, 4, 6 y 10 s** y se publica la tabla.
  Si la lectura sigue cambiando entre 6 y 10 s, la ventana se alarga **antes** de
  correr la rejilla.
- **Cada bloque de umbral se barre en los dos sentidos**, `a` bajando y
  subiendo. Si difieren más de 0,667 dB en algún punto, lo que se midió es el
  transitorio y ese punto no vale.
- **La referencia `ratio = 1` se repite al final de cada bloque.** Si no coincide
  con la de entrada dentro de un escalón, el bloque entero se descarta.

**Por qué importa tanto.** Si el barrido va sólo de `a = 1` hacia `0,05`, la
reducción sólo crece, el ataque gobierna el asentamiento, y un punto no asentado
**subestima** la reducción — progresivamente, y con la misma forma que una curva
que satura. O sea: **el diseño podía fabricar el resultado que busca.** La 97
tenía ida y vuelta como elemento explícito del diseño y la primera versión de
esto lo perdió en silencio.

## Lo que esta corrida NO va a poder decir

- **Nada sobre la pendiente del umbral.** No se publica ningún «dB por unidad de
  crudo», ni despejado de la rampa, ni de dónde cada curva sale de cero, ni por
  sustitución. La 97 ya sacó tres pendientes por sustitución (22,2 / 32,1 /
  47,3) y quedaron retiradas por estar trazadas a través de una meseta. Esta
  corrida tiene más puntos y la misma meseta. **Es la afirmación más tentadora
  del documento** —es lo que el producto necesita, `raw-map.ts` conserva
  `dyn.threshold` en `INFERIDO` con la ley refutada— y la primera versión no
  decía una palabra sobre no publicarla. Si de acá sale una pendiente, sale de
  una corrida diseñada para medirla, con la fuente movida y `pre` de testigo.
- **No se declara la saturación probada.** Si el techo aparece en las ocho
  relaciones, eso es una **forma** consistente con la lectura que la 97 marcó
  como hipótesis. Para probarla hay que mostrar que el techo **no** es del
  instrumento: la misma rejilla con la fuente 10 dB más baja, donde los techos
  en dB tienen que quedar iguales y las lecturas absolutas no.
- **Esto no es calibración: es autoconsistencia.** Se contrasta un medidor de la
  consola contra otro de la misma consola, los dos decodificados con constantes
  del mismo `mixer.html`. `VERIFICADO_CONTRA_CONSOLA` sigue excluyendo al
  compresor y esta corrida no lo cambia. **Ninguna entrada de `raw-map.ts` sale
  de `INFERIDO` por esta medición.**
- **Y todos los dB son de la escala del medidor, no dBFS.** La correspondencia
  con dBFS reales sigue sin medirse, así que «reducción de 3,31 dB» significa
  3,31 dB de la escala de la consola.
- **Nada del umbral de la puerta ni del de-esser.** `gate.thresh` usa la misma
  fórmula en el código y esta medición no la prueba; heredar la confianza sería
  el error que este proyecto ya tiene documentado. El de-esser sigue siendo el
  único bloque dinámico nunca medido.
- **Nada sobre los tiempos.** Cada punto se lee asentado. Sigue pendiente (C5).
- **Nada sobre la rodilla blanda.** `dyn.softknee` se registra y no se barre. Si
  está encendido, lo que se mide es la superficie **con** esa rodilla.
- **Un canal, una frecuencia, un nivel de fuente.** Igual que la 97.
- **Y no se ajusta una curva y se publica.** Ni con 56 puntos. Lo que se busca
  es la **forma** de la superficie y si los cortes de la 97 caen en ella; una
  fórmula sale de acá sólo si se sostiene en los siete umbrales a la vez. Los
  tres barridos de 84,5 dB que este proyecto tuvo que retirar eran rectas
  impecables, y lo que los delató fue que no coincidían entre sí.

## Restauración

Lo que se escribe: `i.9.dyn.threshold`, `i.9.dyn.ratio`, y `m.afs.enabled` en 0
mientras el tono suena —el supresor aprende notches de −18 dB con un tono
sostenido, y ya le plantó seis al general una vez—.

Los valores previos **se leen del aparato** con `exigirClave`, que falla si la
lectura no llegó en vez de suponer. La restauración va por `conRestauracion`,
que corre también si llega una señal —a mí me mató un `SIGPIPE` y dejó un envío
abierto—. Y se comprueba **releyendo por HTTP**, un camino distinto del
WebSocket que escribió.

## Nota de numeración

La 97 llama «ítem 98» al umbral de la puerta, y este documento es el 98 sobre
otra cosa. Queda dicho para que nadie busque lo que no está acá.
