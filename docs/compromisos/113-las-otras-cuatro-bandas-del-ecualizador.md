# 113 — ¿Las otras bandas del ecualizador de canal comparten la ley? ¿Y son cinco?

## MEDIDO el 2026-09-16: son cuatro bandas, y las cuatro comparten la ley

| Banda | Ley medida | Residuo máx. | Recorrido | Evidencia |
|---|---|---|---|---|
| 1 | `40,005·V − 20,004` | 0,00 dB | 40,01 dB | [`banda-1`](../spikes/SPK-P0.10b-vu2/evidence/ley-ganancia-banda-1-2026-09-16.txt) |
| 2 | `39,999·V − 19,999` | 0,01 dB | 39,99 dB | ítem 108 |
| 3 | `40,010·V − 20,006` | — | 40,02 dB | [`banda-3`](../spikes/SPK-P0.10b-vu2/evidence/ley-ganancia-banda-3-2026-09-16.txt) |
| 4 | `39,998·V − 19,998` | — | 39,99 dB | [`banda-4b`](../spikes/SPK-P0.10b-vu2/evidence/ley-ganancia-banda-4-2026-09-16b.txt) |
| **5** | **no mueve el audio** | — | **0,00 dB** | [`banda-5b`](../spikes/SPK-P0.10b-vu2/evidence/ley-ganancia-banda-5-2026-09-16b.txt) |

**Las cuatro dan la misma recta**, dentro de las milésimas. La expectativa
declarada antes de medir —0,3 dB en pendiente y ordenada— se cumple con dos
órdenes de magnitud de sobra. Entran las cuatro en `RAW_MAP` como `40·V − 20`.

**Y la quinta no existe como banda.** Con el tono presente y **80,5 dB sobre el
piso**, barrer su crudo de punta a punta movió **0,00 dB** sobre 39 puntos. No es
un negativo sobre silencio: C1 pasó, L1 pasó —el punto plano con el ecualizador
activo coincidió con el puenteado a la centésima— y C2 pasó. Ver
[el hallazgo](../backlog/hallazgo-el-ecualizador-de-canal-tiene-cuatro-bandas.md).

**Eso estaba declarado antes de medir**, arriba: *«Si el recorrido queda por
debajo del piso de L4, la corrida no publica ley, y eso es el resultado, no un
fracaso»*. Y es lo que pasó.

### Dos corridas fallaron en C1, y no se tocó el umbral

[`banda-4`](../spikes/SPK-P0.10b-vu2/evidence/ley-ganancia-banda-4-2026-09-16.txt)
falló con **74,4 dB** sobre un mínimo de 75, y
[`banda-5`](../spikes/SPK-P0.10b-vu2/evidence/ley-ganancia-banda-5-2026-09-16.txt)
con **71,5**. En las dos el tono valía lo mismo que en las que pasaron —−58,3
dBFS—: lo que se movió fue **el piso del banco**, que entre capturas varía unos
seis decibeles.

**Había dos salidas y sólo una es honesta.** La otra era bajar el mínimo de C1,
que hoy vale 75 porque asume una excursión de 30 dB —conservadora a propósito
cuando no se sabía si eran ±15 o ±20— y ya está medido cuatro veces que son ±20.
Puede que ese 75 sobre; **pero tocarlo justo después de que falle es acomodar la
regla al resultado**, y este repositorio tiene esa regla escrita.

Así que se arregló el banco: **el fader del canal subió de 0,5 a 0,65**, que está
*después* del ecualizador y por lo tanto no cambia el nivel al que el filtro
trabaja. La banda 5 pasó C1 con 80,5 dB. **Ningún control se aflojó.**

### Y hubo un defecto propio, que se vio en el aparato

**El guion escribía la frecuencia de la banda y no la restauraba.** Al hacer que
la *coloque* en 1000 Hz se agregó la escritura y **no** se agregó la clave a
`PREVIO`. Las bandas 1, 3 y 4 del canal 10 quedaron las tres en 1000 Hz en vez de
sus 200, 4000 y 10000 de fábrica.

Se arregló el guion y se devolvió la consola:
[`devolver-las-frecuencias-2026-09-16.txt`](../spikes/SPK-P0.10b-vu2/evidence/devolver-las-frecuencias-2026-09-16.txt),
con los valores del volcado del 2026-09-15 a las 21:50 —no inventados— y las
cinco comprobadas releyendo por HTTP.

**Ninguna guarda lo cazó, y eso era lo que había que arreglar.**
`escribir-sin-leer` exige que la clave se **lea**, y se leía.
`restauracion-garantizada` exige que el guion use `conRestauracion`, y la usaba.
Las dos miran la estructura; ninguna comprobaba que la lista de restauración
estuviera **completa** respecto de lo que el guion escribe.

**Hecho el mismo día**, a pedido del usuario:
`packages/mixer-adapter/test/restaurar-lo-que-se-escribe.test.ts`. Toma el cuerpo
de la vuelta atrás y exige que nombre toda clave que el guion escriba.

**Y encontró un agujero más grande que el que venía a tapar.** La primera versión
**no cazaba este mismo caso**: la escritura era `codificarSetd(RUTA_FREQ, …)` con
`const RUTA_FREQ = RUTA_FRECUENCIA`, y el detector sólo resolvía nombres que
apuntaran directo a un literal. Un salto de nombre alcanzaba para volverla ciega
—y `escribir-sin-leer` tiene el mismo punto ciego, porque exige un literal
después de `codificarSetd(`—. Ahora resuelve cadenas de nombres, y lo que **no**
puede resolver **lo cuenta en vez de callarlo**.

---


**Contrato escrito el 2026-09-16, ANTES de tocar la consola.** Consola
192.168.0.78. Canal 10 (`i.9`) → general → entrada 1 de la Scarlett.

## Qué decide, y por qué no es un trámite

El [ítem 108](108-la-ley-de-la-ganancia-del-ecualizador.md) midió que la ganancia
del ecualizador de canal es `40·V − 20` —±20 dB— con residuo máximo de 0,01 dB.
**Lo midió en UNA banda**, y su propio comentario en la tabla de conversión lo
dice: *«una banda de cinco, un canal de veinticuatro, una frecuencia, un Q, un
nivel de fuente y un día»*.

Que las otras cuatro compartan la ley es **razonable y no está medido**. Es
exactamente la deuda que el [ítem 112](112-la-ley-del-ecualizador-del-general.md)
acaba de pagar para el ecualizador de salida: ahí la suposición resultó cierta, y
resultó cierta **porque alguien fue a medirla**.

## Y hay un motivo más urgente: la tabla declara la banda equivocada

**Encontrado el 2026-09-16 preparando esta medición.**

| | |
|---|---|
| Qué midió el ítem 108 | `i.9.eq.b2.gain` — **la banda 2** |
| Qué declara `RAW_MAP` como medido | `i.N.eq.b1.gain` — **la banda 1** |

Se comprueba en dos líneas: el encabezado de
[la evidencia](../spikes/SPK-P0.10b-vu2/evidence/ley-ganancia-del-eq-2026-09-16b.txt)
dice `ley-ganancia-del-eq.ts 10 2`, donde ese `2` es la banda; y la entrada de la
tabla dice `i.N.eq.b1.gain`.

**La consecuencia está al revés de lo que hace falta:** hoy el motor de seguridad
deja escribir la banda 1, **cuya ley nadie midió**, y rechaza la banda 2, que es
**la única medida**. `canonizarRuta` no las unifica —`i.9.eq.b2.gain` se canoniza
como `i.N.eq.b2.gain` y no está en la tabla—, así que no es una abreviatura: es
una ruta distinta.

**Por qué esta medición es el arreglo correcto y no renombrar la entrada.**
Cambiar `b1` por `b2` dejaría el mismo agujero con otra forma: una banda medida y
cuatro escribiéndose sin ley o sin poder escribirse. Medir las cinco lo cierra.

**Y hay una guarda que esto NO tenía y va a tener.** `validate-rutas-medidas`
—escrita el mismo día— compara la tabla contra la matriz de capacidades, y este
defecto vive un nivel más abajo: entre la tabla y **la evidencia**. Que la tabla
cite un archivo no comprueba que ese archivo haya medido esa ruta. Queda anotado
como tarea.

## Y hay una segunda pregunta, que apareció leyendo el cliente

**El ecualizador de canal puede no tener cinco bandas.** El cliente de la consola
dibuja su gráfico recorriendo esta lista, textual de su código:

```js
var c = "hpf b1 b2 b3 b4 lpf".split(" ");
this.bands = IS_UI_24 && esEntrada ? 6 : 5;
for (b = 0; b < this.bands; b++) { ... }
```

**`b5` no está en esa lista.** Las campanas que el cliente dibuja son `b1` a
`b4`; los índices 0 y 5 son el pasa-altos y el pasa-bajos, que empuja con ganancia
0 porque no son campanas. Y hay un botón `b5` en la interfaz que el mismo código
**esconde** según la configuración.

Sin embargo **la consola publica `i.N.eq.b5.{freq,gain,q}`** y este repositorio
viene diciendo «cinco bandas paramétricas» en al menos cinco documentos.

**Es la misma forma del error que se corrigió esta mañana con el supresor**: doce
claves publicadas que resultaron ser doce ranuras vacías. Una clave que existe no
es una función que funciona.

**Así que `b5` se mide igual que las otras**, y con una pregunta distinta: no
«¿qué ley tiene?» sino **«¿hace algo?»**. Si con su banda en 1 kHz y el crudo
barriendo de 0 a 1 el audio no se mueve, `b5` es una clave inerte para canales de
entrada — y una aplicación que ofrezca cinco bandas le estaría mostrando al
usuario un control que no suena.

## Qué se mide

**Las cuatro que faltan: 1, 3, 4 y 5.** La 2 ya está medida y no se repite; se
usa como referencia contra la cual comparar.

Para cada una, lo mismo que midió el 108: **cuántos decibeles cambia el nivel en
la frecuencia central de la banda como función del crudo**, barriendo el crudo y
midiendo el audio que sale.

## El instrumento es el del 108, con un solo cambio

No se escribe un guion nuevo: se usa `ley-ganancia-del-eq.ts`, que pasó dos
auditorías y ya recibe la banda como argumento. **El único cambio es que ahora
coloca la banda en 1000 Hz en vez de exigir que ya esté.**

Hasta hoy la exigía, y tenía sentido: la banda 2 viene de fábrica en 1 kHz. Las
otras cuatro no, así que con la precondición la corrida se negaba a arrancar —que
es, muy probablemente, por qué el 108 midió la 2 y no la 1—.

**Se coloca con la ley del ítem 101, y después se comprueba releyendo** con el
mismo margen de 1 Hz de siempre. Calcular el crudo no es lo mismo que que la
consola lo acepte. Y **si la banda ya está donde tiene que estar, no se escribe
nada**: la banda 2 se mediría hoy exactamente igual que el 2026-09-16.

## Qué se escribe, y qué vuelve

Las mismas claves que el 108 —están todas en su `PREVIO`, leídas antes y
restauradas por `restaurarClaves()` dentro de `conRestauracion`, verificadas
releyendo por HTTP y anotadas en el papelito— **más una que antes no se tocaba**:
`i.9.eq.bK.freq` de la banda que se barre. Ya estaba en `PREVIO`, así que la
restauración la cubre sin cambios.

**El Q no se toca en ninguna banda**, y se registra: alimenta el tope de C2.

## Los controles y las expectativas

**Son los del 108, sin aflojar ninguno**: C1 el tono llega con 45 dB de margen,
C2 el testigo de 37 Hz no se mueve más que la falda calculada más 0,15 dB, L1 el
crudo 0,5 es el punto plano, L3 residuo máximo 0,3 dB, L3b curvatura, L4
recorrido mínimo de 24 dB, L5 simetría, L6 ida y vuelta, L8 el medidor del canal
contra el realce medido.

**Y una expectativa nueva, declarada antes de mirar:** que las cuatro den la
misma recta que la banda 2 —`40·V − 20`— dentro de **0,3 dB** en pendiente y
ordenada.

**Si alguna NO la da, el hallazgo es más grande que esta medición**, porque
significaría que hablar de «la ley del ecualizador de canal» es hablar de varias
leyes, y que cualquier función que proponga decibeles tiene que saber en qué
banda está.

**Y para `b5` la expectativa es distinta y se declara aparte:** puede que no se
mueva nada. Si el recorrido medido queda por debajo del piso de L4 —24 dB— la
corrida **no publica ley, y eso es el resultado**, no un fracaso: querría decir
que la clave no llega al audio. Se informará el recorrido medido sea cual sea.

## Lo que esta corrida NO va a decir

- **Nada de las otras 23 entradas.** Un canal.
- **Nada de la forma de la campana.** Se mide la altura en el centro, no el ancho.
- **Nada de cómo interactúan las bandas entre sí**: las otras cuatro se exigen
  planas mientras una barre.
- **Nada con cada banda en su frecuencia de fábrica.** Las cuatro se miden **en
  1000 Hz**, que es donde está el tono. Si la ley dependiera de la frecuencia del
  filtro —no hay motivo para pensarlo— esto no lo vería.
- Un nivel de fuente, un Q, un día.

## Trabajo previo

**Ya estaba hecho y archivado el mismo día**, así que no se repite de memoria: el
inventario de los cuatro repositorios, con el commit que se miró de cada uno, está
en [`trabajo-previo-de-terceros.md`](../referencia/trabajo-previo-de-terceros.md).

Para esta pregunta en concreto, lo que dice ese inventario:

- **Ninguno de los cuatro publica una conversión del ecualizador.** Las únicas de
  `fmalcher/soundcraft-ui` son las del fader, el medidor, el retardo, el peso de
  automix y la ganancia del previo. `MyUiPro` sólo convierte la ganancia de
  entrada. `ioBroker` y `ndikanov/ui24` no convierten nada.
- **Ninguno distingue banda por banda**: ni siquiera existe el tema, porque
  ninguno expone el ecualizador.
- Y el cliente del fabricante usa **una sola función**, `VtoEQGAIN20`, para las
  cinco bandas — que es una hipótesis a favor de que compartan la ley, y es
  justamente la clase de hipótesis que este repositorio ya vio fallar: la 97
  refutó dos funciones de ese mismo archivo.

### Y para la pregunta de cuántas bandas son, la respuesta estaba en casa

**Tres fuentes dicen CUATRO y una dice cinco, y la que dice cinco es la nuestra.**

| Fuente | Qué dice |
|---|---|
| **El manual del fabricante**, archivado en `docs/referencia/` | *«**4-band Parametric EQ**, High-Pass Filter, Low-Pass Filter, Compressor, De-esser and Noise Gate on input channels»* |
| **El cliente de la consola**, su gráfico | recorre `"hpf b1 b2 b3 b4 lpf"`: **cuatro campanas** |
| **`fmalcher/soundcraft-ui`** | declara `b1`…`b5` en su tipo y los trae los cinco en su volcado, **sin decir qué son**. Sus valores de fábrica son **idénticos** a los de esta consola, así que el `b5` existe en otra Ui24 también |
| **Este repositorio** | *«5 bandas paramétricas»*, en cinco documentos |

**El nuestro salió de contar claves**, que es exactamente el error que se corrigió
esta misma mañana con el supresor: doce claves que resultaron ser doce ranuras
vacías. Y la línea del manual estaba archivada en este repositorio desde el
principio.

**Lo que sigue sin resolver, y por eso se mide:** que el cliente no dibuje `b5` y
que el manual diga cuatro **no prueba que escribir `i.N.eq.b5.gain` no haga
nada**. Una fuente escrita describe la pantalla; ya pasó dos veces que el aparato
hiciera otra cosa. Eso se contesta con el audio, no leyendo.

**Nadie midió esto.** No hay una segunda implementación contra la cual contrastar
un resultado raro.
