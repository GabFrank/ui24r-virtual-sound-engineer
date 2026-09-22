# Hallazgo: `LIMITES` da una unidad por `kind`, y un `kind` cubre hojas de unidades distintas

**Encontrado el 2026-09-13**, al arreglar `entrada()` (ver
[`hallazgo-la-guarda-de-magnitud-no-podia-disparar.md`](hallazgo-la-guarda-de-magnitud-no-podia-disparar.md)).

## El dato

El motor rechaza un cambio cuya unidad no es la del tope de su `kind`, y el
mensaje dice bien por qué:

> *«CHANNEL_EQ tiene su tope en dB y el cambio declara Hz: comparar los dos
> números sería comparar especies distintas»*

**Tiene razón.** Un tope de 4 dB por transacción no acota un salto de frecuencia.

El problema es que `CHANNEL_EQ` cubre, en el inventario, 504 rutas que incluyen
`eq.bN.freq` (Hz), `eq.bN.gain` (dB) y `eq.bN.q` (Q). Y `HPF` cubre
`eq.hpf.freq` (Hz) y `eq.hpf.slope`, con el tope declarado en **octavas**.

O sea que **toda hoja cuya unidad física no sea la del `kind` es inescribible**,
y no por falta de medición.

## Por qué no se veía

El recorrido que cuenta las rutas escribibles usaba un arnés que declaraba
`unidad: 'dB'` para **toda** ruta, con el comentario —honesto— de que lo que se
medía era la puerta de permiso y no la conversión. Con `dB` para todo, las rutas
en Hz pasaban esa puerta y se contaban como escribibles.

Con la unidad de verdad, el motor las rechaza. **La cuenta baja de 930 a 834**:
−72 de `CHANNEL_EQ` (`eq.b1.freq`, `eq.b1.q`, `eq.lpf.freq`) y −24 de `HPF`
(`eq.hpf.freq`), o sea las cuatro rutas con ley medida por veinticuatro canales.

**No se cayeron: nunca habían sido escribibles.** El 930 las contaba porque el
arnés mentía la unidad, y eso lo destapó arreglar `entrada()`, que obligó al
arnés a declarar la unidad real.

## Lo que esto significa para el producto

**Las cuatro leyes del ecualizador que midió la 101 —contra el filtro real, con
0,24 % de error— no sirven para escribir nada**, y no por un problema de la
medición. Medir más leyes del ecualizador tampoco las hará escribibles mientras
un `kind` tenga una sola unidad.

Es el mismo patrón que este proyecto ya se conoce: una capa estaba bien y la
otra no conectaba. Acá son tres capas que no se contradicen entre sí pero no
componen — el clasificador agrupa por familia, el dominio acota por `kind`, y la
tabla de conversión mide por hoja.

**Y no bloquea el envío a monitor**, que es lo que la aplicación va a escribir
primero: `LIMITES.MONITOR_AUX_SEND` está en **dB** y la ley medida del envío
(ítem 104) está en **dB**. Coinciden.

## CERRADO el 2026-09-22: construido

El freno viaja con la hoja, la escala del movimiento existe, y la cuenta de
rutas que el motor permite volvió de 690 a **930 exacto**. Lo que sigue abierto
de ADR-039 es sólo la exención del salto libre, que espera su medición.

## DECIDIDO el 2026-09-21: [ADR-039](../adr/ADR-039-el-freno-viaja-con-la-hoja-y-se-cuenta-en-octavas.md)

**El usuario eligió la primera de las tres de abajo**, en tres preguntas, y con
una pieza que ninguna de las tres tenía.

- **El freno viaja con la hoja.** La unidad de la magnitud sigue siendo la de la
  hoja medida, porque es lo que la ata al crudo; lo que se agrega es la **escala
  del movimiento**, que en la frecuencia son octavas y en el Q son octavas de
  ancho de banda.
- **Y poner una banda no lleva tope al salto**, porque se hace con la campana en
  cero y eso no se oye: medido en el canal del usuario, el ecualizador entero con
  sus cuatro campanas neutras aporta menos de dos décimas de decibel. Lo que
  acota ese movimiento es el destino, que tiene que caer en el tramo medido.

**Lo que este documento predijo se cumplió** antes de que se decidiera: el
2026-09-21 se midieron seis hojas más y la cuenta bajó otra vez, de 834 a 690.
Lo que desbloquea mover una banda no era otra medición. *(La frase literal
«mientras eso siga así, medir más leyes del ecualizador no las hace escribibles»
está en el test `que-permite-el-motor.test.ts`, no acá; acá dice lo mismo con
otras palabras, dos párrafos más arriba. Una primera redacción de ADR-039 se la
atribuyó a este documento.)*

## Lo que había que decidir, y era del usuario

1. **Topes por hoja y no por `kind`.** Lo más fiel: cada parámetro tiene su
   unidad y su tope. Es el cambio más grande. **Es la que se eligió.**
2. **Partir los `kind`** en `CHANNEL_EQ_GAIN`, `CHANNEL_EQ_FREQ`, `CHANNEL_EQ_Q`.
   Más chico, pero multiplica las categorías y toca los ADR que razonan sobre
   `CHANNEL_EQ` como una cosa. **Descartada**: repite el problema con el
   compresor, que tiene cinco unidades.
3. **Dejarlo como está y decirlo**: el ecualizador se escribe en dB —o sea sólo
   `gain`— y frecuencia y Q son del usuario. Es una decisión de producto
   defendible y **era lo que el motor hacía**, sólo que sin que nadie lo hubiera
   elegido. **Se le ofreció y la descartó**: sin mover la frecuencia no se puede
   poner una banda encima de una resonancia, que es la fuente 2 de ADR-038.
