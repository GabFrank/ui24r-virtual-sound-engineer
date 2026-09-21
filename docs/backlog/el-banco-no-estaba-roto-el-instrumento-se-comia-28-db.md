# El banco no estaba roto: el instrumento se comía 28 dB de la ganancia del usuario

**2026-09-21.** Cierra tres corridas fallidas de la banda 2 del ecualizador de
canal y **dos diagnósticos míos que estaban mal**. Lo cortó el usuario con dos
datos y una pregunta.

Evidencia, en el orden en que fue apareciendo:
[`llega-el-tono-2026-09-20.txt`](../spikes/SPK-P0.10b-vu2/evidence/llega-el-tono-2026-09-20.txt),
que descartó el lazo con un tono suelto —−18 dBFS puestos, −21,03 devueltos—;
[`donde-se-pierden-los-db-2026-09-21.txt`](../spikes/SPK-P0.2b/evidence/donde-se-pierden-los-db-2026-09-21.txt),
que lo descartó **también con el multitono** y de paso mostró que el retorno
interno de la interfaz trae la señal intacta, o sea que la reproducción no era el
problema; y
[`donde-se-pierden-los-db-2026-09-21b.txt`](../spikes/SPK-P0.2b/evidence/donde-se-pierden-los-db-2026-09-21b.txt),
el mismo guion con un paso más, que aísla la causa cambiando una sola clave.

**La primera corrida se archiva aunque la segunda la contenga**, porque es la que
cerró la pregunta «¿sale poco o vuelve poco?» antes de que existiera el
aislamiento, y porque una evidencia que se borra por haber quedado corta deja el
razonamiento sin su primer escalón.

## El síntoma

Tres corridas de la banda 2 capturaron a **−58,8 dBFS** donde la corrida buena de
la banda 1, del 2026-09-13, capturó a **−29,6**. Con eso la dispersión entre las
dos líneas base subió de 0,024 a 0,3 dB y **E6 —el control que compara la
referencia del principio contra la del final— falló las tres veces**.

La ley salió bien igual —el error de `f0` dio entre 0,61 % y 1,70 % contra un
criterio del 5 %— porque la curva se mide como capturado **menos** transmitido y
una pérdida de nivel se cancela en la resta. Lo que no se cancela es la relación
señal a ruido.

## La causa, medida

**El instrumento puentea el compresor del canal** para que no aplaste la punta de
la campana. El canal 10 del usuario tiene cargado el preajuste `Kick Drum`, que
trae **ganancia de salida**, y al puentearlo esa ganancia se va con él.

Aislado en una sola corrida, cambiando **una sola clave** y sin tocar nada más:

| `i.9.dyn.bypass` | retorno interno de la interfaz | entrada 1, el retorno del general |
|---|---|---|
| 0 — como lo tiene el usuario | −27,00 dBFS | **−30,74 dBFS** |
| 1 — como lo deja el instrumento | −27,00 dBFS | **−58,74 dBFS** |

**28,00 dB exactos.** El retorno interno no se mueve, así que la reproducción es
idéntica y la pérdida es entera de la consola.

**Y cuadra con la ley del cliente.** `i.9.dyn.outgain` vale `0,7186045126`, que
por `VtoDYNOUTGAIN(a) = 72a − 24` son **+27,74 dB**. Medido: 28,00. **Coinciden
dentro de 0,26 dB**, que es un punto de apoyo para una ley que estaba `INFERIDO`
—y un solo punto, que no la vuelve medida.

## Por qué en septiembre no pasaba

Porque el canal no era un bombo. El propio repositorio lo tiene escrito en
[`hallazgo-el-canal-del-banco-no-estaba-plano.md`](hallazgo-el-canal-del-banco-no-estaba-plano.md):
entre el 2026-09-13 y el 2026-09-15 el usuario cargó el show `Prueba` y ensayó
sobre el canal 10, que quedó con nombre `BOMBO` y **preajuste `Kick Drum` en
compresor y puerta**. La corrida buena de la banda 1 es del 13; todo lo que vino
después arrastra esa ganancia.

Aquel hallazgo corrigió el ecualizador del canal y **no miró el compresor**,
porque el contrato del 108 sólo exigía las bandas planas. La ganancia de salida
del compresor no estaba en ninguna precondición.

## Los dos diagnósticos míos que estaban mal

Se dejan escritos porque la forma en que fallaron enseña más que la respuesta, y
porque es la segunda vez que este banco produce exactamente esta historia — ver
[`el-banco-estaba-roto-y-era-un-cable.md`](el-banco-estaba-roto-y-era-un-cable.md),
donde también hubo dos diagnósticos malos antes del bueno.

**1. «Son los micrófonos abiertos del usuario.»** Había diez canales sin
silenciar entrando al general, que es por donde el banco escucha. Encajaba con el
síntoma —una referencia que se mueve entre dos capturas— y el usuario autorizó
callarlos. **Se callaron 31 rutas y no cambió nada**: la dispersión pasó de 0,234
a 0,244.

**2. «Se movió una perilla de la interfaz.»** Ya sin los micrófonos, la única
explicación que quedaba era física. **Lo tiró el usuario**, con dos datos que yo
no tenía y una pregunta que era la correcta:

> *«no hay nada mas conectado a la consola, solo canal 10 […] nadie ha tocado ni
> la soundcraft ni la Scarlett, podria ser que la señal que estas generando sea
> diferente al de las mediciones? […] primero averigua que esta diferente»*

Las dos partes hicieron falta. «No hay nada conectado» explica por qué callar no
cambió nada —no había nada que callar— y mata el diagnóstico 1 de raíz. «Nadie
tocó nada» mata el 2. Y «averiguá qué está diferente» es la instrucción que
convirtió esto en una comparación en vez de otra conjetura.

**Lo que las dos tienen en común, otra vez:** explicaban el número sin haber
comparado lo comparable. La comparación que faltaba estaba disponible todo el
tiempo —el estado de la consola en las dos corridas, que el propio instrumento
imprime— y la diferencia aparece en dos líneas.

## Lo que se hizo para dirimirlo, y sirve para la próxima

`tools/spikes/p0-2b-eq/donde-se-pierden-los-db.ts` mira **las cuatro entradas de
la interfaz en la misma captura**: las dos físicas y **las dos que devuelven lo
que la computadora transmitió**, que no pasan por ningún cable.

Eso parte el problema en dos de una sola pasada: si el retorno interno trae la
señal a su nivel y la entrada física no, la pérdida es de la consola o del cable;
si el retorno interno también viene bajo, la pérdida es de la reproducción. **Sin
ese canal de referencia no hay forma de distinguir «sale poco» de «vuelve
poco»**, y las dos conjeturas anteriores nacieron justo de esa ambigüedad.

## Qué hay que arreglar

**El instrumento neutraliza lo que depende del nivel y no compensa lo que eso se
lleva puesto.** El docblock afirma que una ganancia estática «está en las dos
capturas y se cancela en la resta», y es cierto para la **curva**; no lo es para
el **margen**, porque la línea base también se captura con el puenteo aplicado.

Dicho de otro modo: **puentear el compresor no sesga el resultado, lo deja sin
señal**. Y el guion ya calcula el dato que lo delata —«recorrido antes del
recorte: 43,3 dB»—: con 43 dB de aire arriba y la dispersión por el piso, lo que
falta es subir el estímulo o compensar en el previo.

Queda como tarea, con dos caminos y ninguno elegido todavía: subir el estímulo
hasta usar el recorrido que la propia corrida mide, o compensar en la ganancia
del previo los decibeles que el puenteo se llevó. La segunda tiene la ventaja de
dejar el estímulo donde está —a −27 dBFS, elegido para no recortar con la campana
encima— y la desventaja de tocar una clave más.

## Lo que esto NO dice

- **No dice que la ley de las bandas 2, 3 y 4 esté medida.** Las tres corridas
  fallaron su control y ninguna se publica. Lo que sí dice es que el banco está
  sano y por qué las tres fallaron.
- **No mide `VtoDYNOUTGAIN`.** Un punto que coincide dentro de 0,26 dB es un
  punto, no una curva.
- **No dice nada del compresor del general**, que el instrumento también puentea.
  Su ganancia de salida está en el crudo `0,3333`, que por la misma ley es 0 dB,
  así que no aporta a esta cuenta — pero eso es aritmética sobre una ley
  inferida, no una medición.
