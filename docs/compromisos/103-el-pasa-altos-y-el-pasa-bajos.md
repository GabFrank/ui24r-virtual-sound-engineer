# 103 — El pasa-altos y el pasa-bajos del canal, medidos contra el filtro

**Fecha: 2026-09-13.** Consola 192.168.0.78, canal 10 (`i.9`), con el bucle a la
interfaz. Contrato escrito **antes** de tocar nada.

## Qué decide

`raw-map.ts` declara, en estado `DESCONOCIDO`:

```ts
lineal('i.N.eq.hpf.freq', 'Hz', 20, 400, 'DESCONOCIDO', 'SPK-P0.2b'),
```

Un número puesto a ojo, y **el manual del fabricante dice otra cosa**: leído el
2026-09-13, la tabla de especificaciones da el pasa-altos de **20 Hz a 1 kHz** y el
pasa-bajos de **22 kHz a 1 kHz**, los dos «with selectable slopes». Del pasa-bajos
`raw-map.ts` no tiene entrada.

Y hay una razón para dudar también de la **forma**: las otras dos frecuencias del
ecualizador estaban declaradas como rectas y la medición 101 las midió
**exponenciales**, con la recta errando hasta un factor de 43.

### La pregunta que se contesta de una

En el crudo 1,0 las hipótesis se separan sin ambigüedad:

| Crudo | Recta 20…400 (el código) | Exponencial a 400 | Exponencial a 1000 (el manual) |
|---|---|---|---|
| 0,25 | 115 Hz | 42 Hz | 53 Hz |
| 0,55 | 229 Hz | 104 Hz | 172 Hz |
| 0,85 | 343 Hz | 255 Hz | 556 Hz |
| **1,00** | **400 Hz** | **400 Hz** | **1000 Hz** |

**¿El pasa-altos en su extremo corta en 400 Hz o en 1000?** Es un factor de 2,5,
muy por encima de cualquier incertidumbre de este instrumento.

## El método

El mismo de la 101, con el instrumento ya construido y validado contra un filtro
conocido: multitono de 104 tonos, respuesta calculada como **capturado ÷
transmitido** tono por tono, y la línea base restada para que el banco no tenga que
ser plano.

**Lo que cambia es qué se busca en la curva.** La 101 buscaba un **máximo** —una
campana— y ésta busca un **cruce**: la frecuencia donde la respuesta cae 3 dB
respecto de la banda de paso.

1. **La línea base**: con el pasa-altos en su crudo mínimo (0) y el pasa-bajos en
   el máximo (1), que es donde el aparato los tiene hoy. En esa posición los dos
   están fuera del camino, y **eso se comprueba** —no se supone— viendo que la
   línea base sea plana.
2. **La banda de paso se mide, no se supone.** Para el pasa-altos es la media de
   la respuesta **una octava y media por encima** del cruce esperado; para el
   pasa-bajos, lo mismo por debajo. Tomar «0 dB» como referencia sería suponer que
   el filtro no tiene ganancia de paso.
3. **El cruce se interpola** entre los dos tonos que lo rodean, en escala
   logarítmica de frecuencia. Sin interpolar, la resolución sería la separación
   entre tonos: un doceavo de octava, casi 6 %.

**La pendiente se registra y no se toca.** `i.9.eq.hpf.slope = 0` y
`i.9.eq.lpf.slope = 0`. El manual dice que son seleccionables; **esta corrida mide
una sola**, y el punto de −3 dB de un filtro depende de su pendiente sólo en cuán
rápido cae después, no en dónde está el codo. Queda declarado.

## Las precondiciones

Las mismas que la 101, y por el mismo motivo: **una ganancia estática se cancela en
la resta contra la línea base; una no lineal no.**

| Qué | Cómo queda |
|---|---|
| Compresor, puerta y de-esser del canal | **se puentean** |
| Compresor del general | **se puentea** |
| Supresor del general | **se apaga** — un tono sostenido le planta filtros, y el manual explica por qué: en modo FIXED eso es su comportamiento declarado |
| Las cinco bandas del ecualizador | se leen y **se exige que estén en su crudo neutro**; su contribución se mide igual comparando las dos líneas base |
| `eq.easy` y `eq.prmod` | se leen y se registran |

**Y el control positivo, sin el cual la corrida miente en la dirección más
fuerte.** Si la escritura no llega al filtro, lo que se mide es ruido — y sobre
ruido el buscador de cruces devuelve un número igual. Antes de barrer se comprueba
que el pasa-altos en su extremo **atenúe al menos 10 dB** en el tono más grave del
estímulo, y si no, la corrida aborta nombrando `eq.easy` y `eq.prmod`.

## Las expectativas

**El umbral no es el de la 101, y trasplantarlo habría vaciado la corrida.** Allá
los 45 dB se aplicaban al pico de una campana **realzada 20 dB**: el punto de
interés venía con veinte decibeles de regalo. Acá el codo está **3 dB por debajo**
de la banda de paso, y la ventana abarca siete tonos en vez de tres. Con 45, los
doce puntos se anulaban y la corrida duraba cuatro minutos sin medir nada — la 101
midió en este mismo banco 8,2 dB de margen peor en su línea base.

**Un punto vale con 20 dB, y el número se deriva.** Con 3 dB de caída y una
pendiente local de unos 6 dB por octava, un margen de `M` dB mueve el cruce unas
`(2/M)/6` octavas; para que quede por debajo del 2 % hace falta `M ≈ 20`.

**Y el estímulo sube a −15 dBFS**, doce decibeles más que la 101. Aquélla tuvo que
bajar porque su campana **sube** el pico; éste **sólo atenúa**, así que no hay
realce que reservar y cada tono gana 12 dB de margen.

**La resolución del cruce** es del orden del **2 %** sobre una curva limpia
—verificado contra filtros Butterworth de 6, 12 y 24 dB/octava con codos de 80 a
1013 Hz: el error es de 0,1 a 0,3 %—.

| # | Predicción | Qué la falsaría |
|---|---|---|
| **H1** | **La línea base es plana** dentro de 1,0 dB entre 40 Hz y 15343 Hz, con los dos filtros en su extremo inerte | Que no: los extremos no son «fuera del camino» y toda la medición se corre |
| **H2** | **El pasa-altos atenúa**: en su crudo máximo, el tono de 40 Hz cae al menos 10 dB respecto de la banda de paso | Que no: la escritura no llegó al filtro, y lo que se mediría sería ruido |
| **H3** | **El cruce en el crudo 1,0 está dentro de un factor 1,25 de una de las dos fuentes y a 1,9 o más de la otra** | Que caiga en el medio, o **lejos de las dos**: ninguno de los dos casos decide |
| **H4** | **Alguna de las tres leyes describe el cruce** dentro del **10 %** en al menos **5 crudos distintos** —la repetición de cierre no cuenta: es el dato de H6— | Que ninguna: la ley no es ninguna de las tres. **Y con menos de 5 crudos útiles, H4 no decide nada**: decir «ninguna la describe» sin datos sería la conclusión más fuerte sacada de cero mediciones |
| **H5** | **El pasa-bajos es el espejo**: su cruce baja cuando su crudo baja, y en el crudo 0 está más cerca de 1 kHz que de 10 | Que no: el sentido del parámetro es el contrario del que el manual declara |
| **H6** | **Ida y vuelta.** Repetir el primer crudo al final da el mismo cruce dentro del **2 %** y la misma línea base dentro de 0,5 dB | Que no: algo del banco se movió |

**H3, H4, H5 y H6 son subordinadas a H1 y a H2, y se declara acá:** sin una línea
base plana no hay referencia contra la cual medir, y sin el control positivo lo que
se mide es ruido. Las dos **abortan la corrida**, no se informan al final — que es
lo que la primera versión de este guión hacía, imprimiendo H1 después de que H3 y
H4 ya habían publicado veredicto. Es distinto de la E1 de la 101, que
explícitamente **no** invalidaba el resto: allá lo que se cancelaba era una
irregularidad estática del banco.

**H4 no es subordinada a H3 y se declara acá**: H3 sólo separa dos extremos, y H4
pide que una ley describa el recorrido entero. Se puede tener lo primero sin lo
segundo — de hecho es el desenlace más probable si la ley es exponencial con otra
base.

## Lo que esta corrida NO va a poder decir

- **Nada de las pendientes**, que el manual declara seleccionables. Se mide una.
- **Nada de los cruces que caigan fuera de la ventana del estímulo**: por debajo de
  ~55 Hz y por encima de ~12 kHz el tono más cercano está demasiado lejos del
  codo, y lo que se mediría sería el borde.
- **Nada del pasa-altos ni del pasa-bajos de los buses**, que son otras claves.
- **Y un acuerdo dentro del umbral es una cota, no una identidad.** Si una ley
  describe los cruces al 10 %, hay una familia de leyes que también lo hace, y esta
  corrida va a publicar cuál.

## Restauración

Se escriben `i.9.eq.hpf.freq`, `i.9.eq.lpf.freq`, y los puenteos del canal y del
general. **Todos se leen del aparato con `exigirClave` antes de empezar**, la
restauración va por `restaurarClaves` —que reconecta si el transporte se cae— y se
comprueba **releyendo por HTTP**.

**No hay nada conectado a ninguna salida física** salvo los dos cables del bucle.

---

# Resultado

**Corrida del 2026-09-13**, archivada en
[`pasa-altos-y-pasa-bajos-2026-09-13b.txt`](../spikes/SPK-P0.2b/evidence/pasa-altos-y-pasa-bajos-2026-09-13b.txt).
Hubo una corrida anterior que **se descarta y también se archiva**: la contaminé
escribiendo en la consola mientras corría, y está contada en
[`hallazgo-la-senal-de-que-una-corrida-termino.md`](../backlog/hallazgo-la-senal-de-que-una-corrida-termino.md).

| # | Umbral | Resultado | |
|---|---|---|---|
| **H1** | línea base plana, 1,0 dB | **0,83 dB** | **PASA** |
| **H2** | el pasa-altos atenúa, 10 dB | **53,8 dB** | **PASA** |
| **H3** | el codo en el crudo 1,0, factor 1,25 / 1,9 | **1004 Hz** — factor **1,00** del manual, 2,51 del código | **PASA** |
| **H4** | alguna de las tres leyes, 10 % | **ninguna**: 312 %, 809 % y 449 % de error | **FALLA** |
| **H5** | el pasa-bajos es el espejo | codo en **1011 Hz** con el crudo en 0 | **PASA** |
| **H6** | la vuelta, 2 % y 0,5 dB | **0,02 %** y 0,006 dB rms | **PASA** |

## El código estaba mal en el rango Y en la forma

`raw-map.ts` declaraba `lineal('i.N.eq.hpf.freq', 'Hz', 20, 400)`. **El codo en el
crudo 1,0 está en 1004 Hz**, a factor 1,00 de los 1000 que el manual declara y a
2,51 de los 400 del código. El manual tenía razón.

## Y la ley es la cuarta, la que no se me ocurrió probar

H4 falló porque **ninguna de las tres candidatas era la ley**. Eso es exactamente
lo que su modo de falla estaba puesto para sacar a la luz, y la respuesta estaba a
la vista: es **la misma exponencial que la medición 101 midió para las bandas del
ecualizador**, recortada en 1 kHz.

| Crudo | Codo medido | `20·1102,5^V` | Recortado en 1000 | Error |
|---|---|---|---|---|
| 0,25 | **115 Hz** | 115 | 115 | −0,2 % |
| 0,40 | **330 Hz** | 330 | 330 | +0,1 % |
| 0,55 | **945 Hz** | 943 | 943 | +0,3 % |
| 0,70 | **1005 Hz** | 2696 | **1000** | +0,5 % |
| 0,85 | **1005 Hz** | 7710 | **1000** | +0,5 % |
| 1,00 | **1004 Hz** | 22050 | **1000** | +0,4 % |

Y el pasa-bajos es la misma ley recortada **por abajo**:

| Crudo | Codo medido | `20·1102,5^V` | Recortado en 1000 | Error |
|---|---|---|---|---|
| 0,00 | **1011 Hz** | 20 | **1000** | +1,1 % |
| 0,15 | **1011 Hz** | 57 | **1000** | +1,1 % |
| 0,30 | **1011 Hz** | 164 | **1000** | +1,1 % |
| 0,45 | **1010 Hz** | 468 | **1000** | +1,0 % |
| 0,60 | **1339 Hz** | 1338 | 1338 | +0,1 % |

**Once puntos, todos dentro del 1,1 %, la mayoría dentro del 0,5 %.**

Así que:

- **`i.N.eq.hpf.freq` = `min(20·1102,5^V, 1000)`**
- **`i.N.eq.lpf.freq` = `max(20·1102,5^V, 1000)`**

Los dos coinciden con lo que el manual declara —«20 Hz a 1 kHz» y «22 kHz a
1 kHz»— y **son la tercera y la cuarta confirmación independiente de la
exponencial `20·1102,5^V`**, que la 101 había medido sobre las bandas del
ecualizador y que este proyecto tenía como recta hasta ayer.

## Lo que no queda medido

- **El extremo superior del pasa-bajos.** El manual dice 22 kHz; el barrido llegó
  al crudo 0,60 (1339 Hz) y por encima de ~12 kHz el estímulo no alcanza.
- **El extremo inferior del pasa-altos.** El crudo 0 **es la línea base**, así que
  su codo es irrecuperable con este método. Que sean 20 Hz sale de la ley y del
  manual, no de una medición.
- **Las pendientes**, que el manual declara seleccionables: se midió una,
  `slope = 0`.
- **Y el recorte en 1 kHz es lo que se mide, no una interpretación**: seis crudos
  distintos dan el mismo codo dentro del 0,1 %.
