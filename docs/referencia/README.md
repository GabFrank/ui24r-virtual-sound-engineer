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

### La tabla de especificaciones

Rangos declarados por el fabricante. **Ninguno está medido contra el aparato**,
y varios contradicen lo que hay escrito hoy en `raw-map.ts`:

| Parámetro | Manual | En el código hoy |
|---|---|---|
| Compresor: umbral | −90 dB … +6 dB | igual (la fórmula refutada evaluada en 0 y 1) |
| **Compresor: relación** | **1:1 … 50:1** | **no está**, por «no se conoce el crudo mínimo» |
| Compresor: ataque | 1 … 400 ms | sin medir |
| Compresor: relajación | 10 … 2000 ms | sin medir |
| Compresor: compensación | −24 … +48 dB | `i.N.dyn.outgain` con `72a − 24`, o sea −24 … +48 ✔ |
| Puerta: umbral | −inf … +6 dB | `96a − 90`, o sea −90 … +6 |
| **Puerta: profundidad** | **−inf … 0 dB** | `60a − 60`, o sea **−60 … 0** |
| De-esser: umbral | −90 … 6 dB | sin entrada |
| De-esser: relación | infinito … 1:1 | sin entrada |
| De-esser: frecuencia | 2 … 15 kHz | `2000 · 7,5^a`, o sea 2 … 15 kHz ✔ |
| **EQ de canal: ganancia** | **−20 … +20 dB** | **−15 … +15** |
| **EQ de canal: Q** | **0,05 … 15** | **0,3 … 10** |
| EQ de canal: frecuencia | 20 Hz … 22 kHz | 20 … 20 000 Hz |
| EQ de salida | 31 bandas, ±15 dB | igual ✔ |
| **Ganancia de entrada** | **−6 … +58 dB** | el recorrido medido da −6,0 … +55,9 |
| Latencia, todo el proceso | **3,2 ms** | no estaba |
| **Salida de mezcla** | **+20,5 dBu máx** | no estaba |
| Ruido residual | −96 dBu | no estaba |

**Las tres en negrita de `raw-map.ts` hay que mirarlas**: el Q del manual
(0,05 … 15) coincide con lo que `protocol-spec.md` §6.3 sacó del `mixer.html`
(`0,05 · 300^V`), así que ahí son **dos fuentes independientes contra el código**.

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
