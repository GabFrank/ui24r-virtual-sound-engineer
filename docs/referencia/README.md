# El manual del fabricante, y qué vale

`manual-ui24r-v1.0.txt` es el texto del **User Guide v1.0 de la Soundcraft
Ui24R**, 121 páginas, del servidor oficial de Harman. Extraído con
`tools/docs/pdf-a-texto.mjs`.

Lo pidió el usuario el 2026-09-12: *«Haz leido algun manual completo de las
soundcraft? Existe online? Quien sabe haya informaciones valiosas desde el punto
de vista de un usuario»*. La respuesta era **no**: hasta ese día todo lo que este
proyecto sabía del aparato salía de dos fuentes, el `mixer.html` de la consola
—el JavaScript de su propio cliente— y las mediciones. Nunca se había mirado la
documentación del fabricante.

**Lo que el manual dijo, leído entero, está en
[`hallazgos-del-manual.md`](hallazgos-del-manual.md)** — incluido el enigma del
supresor, que queda explicado.

## La regla, antes que los datos

**El manual es una tercera fuente, no una superior.** Cuando choca con una
medición, gana la medición. No es una preferencia de estilo: en las dos primeras
horas de leerlo aparecieron **dos contradicciones con el aparato**, y en las dos
el manual estaba mal.

| Lo que dice el manual | Lo que dice el aparato |
|---|---|
| *«4 band parametriq EQ»* | El inventario de claves tiene **cinco**: `i.N.eq.b1` … `b5` |
| *«A snapshot remembers every setting of your mixer at one time»* | Un recall **no** devuelve el supresor de realimentación: es el único de 45 campos que no vuelve, medido el 2026-09-11 |

Así que lo de acá se usa como **hipótesis con origen**, no como hecho. Una cifra
del manual entra al código igual que cualquier otra: con su medición, o marcada
como no verificada.

## Lo que aporta, y que el proyecto no tenía

### Los rangos del manual contra las fórmulas del cliente, uno por uno

**2026-09-16.** Con el extracto del cliente
[verificado contra la consola](../backlog/hallazgo-la-respuesta-estaba-archivada.md)
el mismo día, se puede hacer algo que no se había hecho: **evaluar cada fórmula en
los extremos del crudo y compararla contra el rango que declara el manual**. Son
dos fuentes independientes —el papel del fabricante y el código de su propio
cliente— y este proyecto ya usó ese cruce para el Q.

| Parámetro | Manual | La fórmula, en V=0 y V=1 | |
|---|---|---|---|
| Compresor: ataque | 1 … 400 ms | `400^d(V)` → 1 … 400 | ✔ |
| Compresor: relajación | 10 … 2000 ms | `10·200^d(V)` → 10 … 2000 | ✔ |
| Compresor: umbral | −90 … +6 dB | `96·V − 90` → −90 … +6 | ✔ |
| Compresor: compensación | −24 … +48 dB | `72·V − 24` → −24 … +48 | ✔ |
| Puerta: umbral | −inf … +6 dB | `96·V − 90` → −90 … +6, y el cliente escribe `-inf` por debajo de −89 | ✔ |
| Puerta: profundidad | −inf … 0 dB | `60·V − 60` → −60 … 0, con piso de pantalla en −60 | ✔ |
| Puerta: ataque | — | `400^d(V)` → 1 … 400 | — |
| Puerta: relajación | — | `5·400^d(V)` → 5 … 2000 | — |
| Puerta: retención | — | `2000^d(V)` → 1 … 2000 | — |
| De-esser: frecuencia | 2 … 15 kHz | `2000·7,5^V` → 2000 … 15000 | ✔ |
| EQ de canal: ganancia | −20 … +20 dB | `40·V − 20` → −20 … +20 | ✔ **y medido** |
| EQ de canal: Q | 0,05 … 15 | `0,05·300^V` → 0,05 … 15 | ✔ |
| EQ de canal: frecuencia | 20 Hz … 22 kHz | `20·1102,5^V` → 20 … 22050 | ✔ |
| EQ de salida: ganancia | ±15 dB | `30·V − 15` → −15 … +15 | ✔ |
| **Compresor: relación** | **1:1 … 50:1** | `1/V`, y el control llega hasta el crudo **0**, o sea **∞:1** | **✘ no cuadra** |

Con `d(V) = 1 − (1 − V)²`.

**Trece de catorce coinciden exactamente.** Eso no convierte las fórmulas en leyes
medidas —siguen describiendo la **pantalla**, y la medición 97 refutó dos de ellas
contra el audio— pero sí las saca de «fuente única»: el rango que publican es el
que el fabricante declara en papel.

**La que no cuadra es la relación del compresor**, y vale la pena no taparla.

Una primera lectura supuso que sería un redondeo —el formateador muestra `inf` por
encima de 60, y de ahí salía un crudo de 0,0167 contra el 0,02 que daría 50—.
**No es un redondeo, y esto el proyecto ya lo sabía.** `raw-map.ts` dice, desde
antes: *«en 0 la razón sería infinita, así que no hay rango físico que declarar
sin inventarlo»*. Lo único que agrega esta lectura es la confirmación desde el
control: el deslizador declara sus marcas en
`[1, 1/1,2, 0,625, 0,5, 1/3, 0,2, 0,1, 0]` y **la última es cero**, o sea que el
control del fabricante efectivamente llega hasta ahí. Las marcas intermedias caen
en 1, 1,2, 1,6, 2, 3, 5 y 10.

Así que la pregunta queda más afilada, no resuelta: **el cliente permite escribir
∞ y el manual declara 50:1.** O el manual describe el rango útil y redondea, o el
procesador recorta en algún lado que la pantalla no muestra. Lo segundo es
comportamiento y no se lee: se mide.

Y no es un detalle de catálogo. Si el crudo 0 es de verdad un limitador, **hay una
ruta donde un valor extremo cambia la naturaleza del proceso**, no sólo su
intensidad. Es coherente con que ésta sea justamente la ley que la medición 97 ya
refutó contra el audio por otro motivo, y con que `i.N.dyn.ratio` esté fuera de la
tabla de conversión a propósito, con su motivo escrito al lado.

**Esta comparación no tiene guarda propia, y no hace falta**: si una fórmula del
cliente cambia, lo detecta `tools/spikes/p0-2a/cliente-sigue-igual.ts`, que
compara las 56 funciones contra el extracto archivado.

### La tabla de especificaciones

Rangos declarados por el fabricante. **Ninguno está medido contra el aparato**,
y varios contradicen lo que hay escrito hoy en `raw-map.ts`:

| Parámetro | Manual | En el código hoy |
|---|---|---|
| Compresor: umbral | −90 dB … +6 dB | igual (la fórmula refutada evaluada en 0 y 1) |
| **Compresor: relación** | **1:1 … 50:1** | **no está en la tabla, a propósito**, y el motivo que figuraba acá —«no se conoce el crudo mínimo»— **no es el que `raw-map.ts` da**. Los suyos son dos: en el crudo 0 la razón sería infinita, así que no hay rango físico que declarar sin inventarlo; y la medición 97 **refutó** `1/V` contra el audio. Corregido el 2026-09-16 |
| Compresor: ataque | 1 … 400 ms | sin medir |
| Compresor: relajación | 10 … 2000 ms | sin medir |
| Compresor: compensación | −24 … +48 dB | `i.N.dyn.outgain` con `72a − 24`, o sea −24 … +48 ✔ |
| Puerta: umbral | −inf … +6 dB | `96a − 90`, o sea −90 … +6 |
| Puerta: profundidad | −inf … 0 dB | `60a − 60`, o sea −60 … 0. **Resuelto el 2026-09-16: no es una discrepancia** — el cliente formatea esta perilla con un piso de −60 y muestra **−∞** en cuanto el valor lo alcanza, y la ley da exactamente −60 en el extremo. El manual describe la pantalla; la tabla, el crudo ✔ |
| De-esser: umbral | −90 … 6 dB | sin entrada |
| De-esser: relación | infinito … 1:1 | sin entrada |
| De-esser: frecuencia | 2 … 15 kHz | `2000 · 7,5^a`, o sea 2 … 15 kHz ✔ |
| EQ de canal: ganancia | −20 … +20 dB | **MEDIDO el 2026-09-16: `40·V − 20`, o sea −20 … +20 ✔** — el manual tenía razón y la tabla estaba mal. Ver el [ítem 108](../compromisos/108-la-ley-de-la-ganancia-del-ecualizador.md) |
| EQ de canal: Q | 0,05 … 15 | `0,05 · 300^V`, que en el rango completo del crudo da **exactamente 0,05 … 15,0000** ✔. **Resuelto el 2026-09-16: tampoco era una discrepancia** — lo que la tabla publica como rango físico es el **tramo que se midió** (crudo 0,35 … 0,70), no el recorrido del control |
| EQ de canal: frecuencia | 20 Hz … 22 kHz | 20 … 20 000 Hz |
| EQ de salida | 31 bandas, ±15 dB | igual ✔ |
| **Ganancia de entrada** | **−6 … +58 dB** | el recorrido medido da −6,0 … +55,9 |
| Latencia, todo el proceso | **3,2 ms** | no estaba |
| **Salida de mezcla** | **+20,5 dBu máx** | no estaba |
| Ruido residual | −96 dBu | no estaba |

**Las tres en negrita de `raw-map.ts` hay que mirarlas**: el Q del manual
(0,05 … 15) coincide con lo que `protocol-spec.md` §6.3 sacó del `mixer.html`
(`0,05 · 300^V`), así que ahí son **dos fuentes independientes contra el código**.

> **Una de las tres se cerró el 2026-09-16, y la lección es sobre este documento.**
> La ganancia del ecualizador de canal se midió contra el filtro real y dio
> `40·V − 20`: **el manual tenía razón**. La tabla decía ±15 porque alguien leyó
> `VtoEQGAIN15` en vez de `VtoEQGAIN20` en el extracto del cliente, dos líneas más
> abajo.
>
> Lo incómodo es que **esta fila ya lo decía, en negrita y con un cartel que pedía
> mirarla**. Sumada al extracto del cliente, la respuesta estaba en el repositorio
> **en dos lugares independientes** —el manual del fabricante y el código de su
> propio cliente— y la contradicción sobrevivió meses igual.
>
> Lo que la medición agregó, y que ninguna de las dos fuentes podía dar, es que el
> **audio** se mueve esos decibeles. Este repositorio ya sabe que una fórmula del
> cliente puede describir bien la pantalla y mal el audio: la 97 refutó dos del
> mismo archivo. Así que la corrida no sobró; lo que sobró fue el tiempo que la
> contradicción estuvo escrita sin que nadie la resolviera.
>
> **Las otras dos se cerraron el mismo día, leyendo, y ninguna era una
> contradicción.** El Q: `0,05 · 300^V` evaluado en el rango completo del crudo da
> exactamente 0,05 … 15,0000, que es el manual clavado; lo que la tabla publica es
> el **tramo medido** (crudo 0,35 … 0,70), no el recorrido del control, y comparar
> uno contra otro es comparar dos cosas distintas. La profundidad de la puerta: el
> cliente la formatea con un piso de −60 y muestra **−∞** en cuanto el valor lo
> alcanza, y la ley da justo −60 en el extremo; el manual describe la pantalla y
> la tabla el crudo.
>
> **De las tres en negrita, una era real y dos eran aparentes**, y conviene no
> quedarse con la parte cómoda de esa frase. La real —los ±15— costó meses y una
> medición. Las dos aparentes costaron media hora de lectura **que nadie había
> hecho en meses**, y mientras tanto estuvieron ahí marcadas, indistinguibles de
> la que sí importaba. Una lista de sospechas sin depurar le quita fuerza a la
> sospecha que vale.

### La relación del compresor llega hasta 50:1

`i.N.dyn.ratio` está fuera de `RAW_MAP` con este motivo escrito: *«su función se
conoce —`VtoRATIO(a) = 1/a`— pero el crudo mínimo no: en 0 la razón es infinita,
así que no hay rango físico que declarar sin inventarlo»*.

**El manual da el tope: 50:1.** Con `1/a` eso sería el crudo 0,02.

Con dos salvedades, y son grandes: la medición 97 **refutó** `1/a` como ley de la
reducción, y el manual no dice el crudo sino la razón. Así que esto no habilita
la entrada: da un número que una medición puede ir a buscar.

### El supresor: LIVE, FIXED y LOCK

Ésta es la que contesta una pregunta abierta del `protocol-spec`.

> *«Choose LIVE, FIXED, or LOCK»* · *«you can also reset the Live and Fixed
> filters independently, depending on need»*

El proyecto tenía tres mediciones que sólo cerraban juntas: `clearlive` borró
seis filtros una vez, y otra vez no borró nada mientras `clearall` sí. La
hipótesis anotada era que **el estado de `m.afs.enabled` al aprender decidía la
pila**. Con el manual a la vista, la explicación más simple es otra: **la decide
el modo**, y `m.afs.fmode` —que las corridas venían registrando sin saber qué
era— es probablemente ese selector.

Sigue sin medirse. Pero ahora hay qué provocar a propósito: fijar el modo en
`LIVE`, hacer aprender un filtro, y ver cuál de los tres disparadores lo borra.

### La salida de mezcla llega a +20,5 dBu

El proyecto nunca pudo atar la escala del medidor a un nivel absoluto: todas las
mediciones declaran *«estos dB son de la escala del medidor, no dBFS»*.

Con la salida del general entrando a la interfaz —el bucle que el usuario cableó
el 2026-09-12— y este número, hay por primera vez un camino para anclar la
escala a **dBu reales**. No está hecho, y el número del manual es «máximo», no
una referencia de calibración.

## Cómo se regenera

```
node tools/docs/pdf-a-texto.mjs <el-pdf> > docs/referencia/manual-ui24r-v1.0.txt
```

El PDF no va al repositorio —4 MB de Harman— y se baja de
`https://adn.harmanpro.com/product_documents/documents/5503_1492037684/ui24r_Manual_V1.0_Web_original.pdf`.

## El extractor mentía sobre sí mismo, y se arregló el 2026-09-13

La primera versión de este README decía que el extractor «sale al 79 % de
caracteres legibles». **Era falso, y el centinela no podía verlo:** medía qué
proporción de los *caracteres* caía en `[A-Za-zÀ-ÿ0-9]`, y ese rango **incluye los
caracteres corruptos**. Contaba la basura como legible. Un control que sólo podía
confirmar.

Lo que había de verdad, medido:

| Defecto | Tamaño |
|---|---|
| **Datos de imagen tomados por texto** | **el 51,6 % del archivo** — corridas de `ÿÿÿÖÔÛÛÛ`, que son valores de píxeles. El filtro aceptaba cualquier flujo que contuviera los bytes `TJ` o `Tj`, y esa secuencia aparece por azar en datos binarios |
| **El espacio salía como `=`** | 6 505 veces. El corrimiento de fuente suma 29 a cada código, y el espacio Unicode real (0x20) más 29 da 0x3D, que es `=` |
| **Ligaduras sueltas** | `Ü` por **fi** y `Ý` por **fl**: «Ürmware», «conÜguration», «Üxed». `grep firmware` daba **cero** sobre once apariciones |
| **Tramos con la fuente corrida** en un byte | `7KH` es `The`, `<RX` es `You`, `$8;` es `AUX`. Sólo se deshacía el corrimiento en los tramos UTF-16 |
| **Tokens que eran palabras de verdad** | **38 %** |

Después de arreglarlo: **122 030 caracteres y el 91 % de los tokens son
palabras**. Y el centinela ahora **cuenta palabras y no caracteres**, que es lo
que no se deja engañar: una corrida de `ÿÿÿ` no es una palabra y `conÜguration`
tampoco.

**Cada carácter de fuente se mapeó verificando su contexto**, no a ojo: `Ó` es un
apóstrofo porque aparece en «userÓs», «CanadaÓs» y «dÓIndustrie»; `Ñ` es una
comilla doble porque aparece en «1/4Ñ» como marca de pulgada. La tabla está en
`tools/docs/pdf-a-texto.mjs` con la evidencia de cada fila, y **es para este
documento**: otro manual con otras fuentes necesita la suya, y el centinela lo va
a delatar.

**Lo que sigue roto y no es reparable así:** el extractor devuelve el texto en el
orden en que el PDF lo dibuja, no en el orden visual. Por eso aparecen cosas como
«High-Pass Filte, Low-Pass Filerr» donde el manual dice «Filter» las dos veces.
Eso ya estaba antes de estas reparaciones y no lo introdujeron: arreglarlo pide
interpretar el posicionamiento de cada glifo, que es otro programa.

Hay además un **Service Manual** circulando que no se miró.
