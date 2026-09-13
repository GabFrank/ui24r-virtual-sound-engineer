# Lo que el manual dijo, leído el 2026-09-13

**La regla no cambia y está en [`README.md`](README.md): el manual es una tercera
fuente, no una superior. Cuando choca con una medición, gana la medición.**

Esta lectura sólo fue posible después de arreglar el extractor: hasta esa mañana
el 51,6 % del archivo eran datos de imagen y `grep firmware` daba cero sobre once
apariciones. **Y la tabla de especificaciones estaba escrita con una segunda
fuente corrida** —`NKNW` es `1.1:`, `MKR` es `0.5`, `YMKMMRB` es `<0.005%`— así
que no se podía leer entera.

## 1. El enigma del supresor queda explicado, y es de los buenos

El `protocol-spec` tenía tres mediciones que sólo cerraban juntas: `clearlive`
borró seis filtros una vez, otra vez no borró nada mientras `clearall` sí, y no se
sabía por qué. La hipótesis anotada era que **el estado de `m.afs.enabled` al
aprender decidía la pila**.

El manual dice otra cosa, y encaja con todo lo medido:

> *«Choose LIVE, FIXED, or LOCK»* — el parámetro se llama **FILTER MODE**.
>
> *«When ringing out the system in Fixed Mode, any sustained sound detected by
> AFS2 will trigger Fixed filters to be set.»*

**Lo decide el modo, no el estado del interruptor.** Y `m.afs.fmode` —que las
corridas venían registrando sin saber qué era— es ese selector. Medido en la
consola del usuario: **`m.afs.fmode = 1`**.

Si 1 es FIXED, se explica de una:

| Lo que se había medido | Por qué |
|---|---|
| Un filtro plantado resistió `clearlive` y cayó con `clearall` | Era un filtro **fijo**, y `clearlive` sólo limpia los flotantes |
| `m.afs.numfixed = 6`, `m.afs.numtotal = 12` | **Seis fijas y seis flotantes**, que es lo que el manual dice: *«parametric EQ's (6 fixed, … floating)»* |
| Un tono sostenido de 1 kHz plantó un notch de −18 dB en el general | **Es el comportamiento declarado del modo FIXED**, no una falla |

**Y eso último es una advertencia sobre el método de este proyecto, no una
curiosidad.** Las mediciones de esta semana reproducen tonos sostenidos de cientos
de segundos. Con el supresor encendido y en modo FIXED, **cada corrida planta
filtros permanentes en la consola del usuario**. Por eso las mediciones lo apagan
y lo restauran, y la 102 directamente **aborta** si lo encuentra encendido.

**Sigue sin medirse** cuál de los tres valores de `m.afs.fmode` es cuál. Ahora hay
qué provocar a propósito, y es barato.

## 2. La tabla de especificaciones, ahora legible entera

Lo que el README ya tenía **se confirma**: esas filas traían los dígitos literales
y estaban bien leídas. Lo que sigue es lo que **no se podía leer** y es nuevo.

| Parámetro | Manual | En el código hoy |
|---|---|---|
| **Pasa-altos de canal** | **20 Hz … 1 kHz**, con pendientes seleccionables | `lineal(20, 400)` — **contradice** |
| **Pasa-bajos de canal** | **22 kHz … 1 kHz**, con pendientes seleccionables | **no existe la entrada** |
| **Puerta: ataque** | 1 ms … 400 ms | sin entrada |
| **Puerta: relajación** | 5 ms … 2000 ms | sin entrada |
| **Puerta: retención** | 1 ms … 2000 ms | sin entrada |
| **Compresor de salidas** | umbral −90/+6 dB, relación 1:1…50:1, ataque 1…400 ms, relajación 10…2000 ms, compensación −24…+48 dB | sin entradas; **son los mismos rangos que el de canal** |
| Respuesta en frecuencia | 20 Hz–20 kHz **±0,5 dB** | no estaba |
| Distorsión | **<0,005 %** con ganancia mínima, **<0,008 %** con máxima | no estaba |
| Ruido equivalente de entrada | **−128 dB** | no estaba |
| Entradas de micrófono y línea | **+19,5 dBu** máximo | no estaba |
| Impedancias | mic 1–2: 4,2 k; mic 3–20: 6 k; línea 12 k; **Hi-Z >600 k**; salidas <150 Ω | no estaban |

**El pasa-altos es el hallazgo accionable.** `raw-map.ts` declara `lineal(20, 400)`
en estado `DESCONOCIDO` —un número puesto a ojo— y el manual dice **1 kHz**. Van
dos cosas mal en esa entrada: el tope y, casi seguro, la forma, porque las otras
dos frecuencias del ecualizador resultaron exponenciales cuando se midieron.

## 3. Cosas que el proyecto no sabía que existían

- **El supresor tiene gestor de presets**: cargar, guardar, renombrar y borrar a
  memoria USB, desde cualquier página de ecualizador de auxiliar o del general.
- **El procedimiento de «ring out»** que el fabricante recomienda está descrito
  paso a paso, e incluye una instrucción que toca a este proyecto: *«If noise
  gates are being used on active mics, bypass them before ringing out»*.
- **El manual declara 4 bandas de ecualizador de canal y el aparato tiene 5**
  (`i.N.eq.b1` … `b5`). Ya estaba anotado en el README como la primera
  contradicción; queda confirmado con el texto legible.

## Las tareas que salen de acá

| # | Qué | Por qué |
|---|---|---|
| **T1** | **Medir el pasa-altos y el pasa-bajos** con el multitono de la 101 | Dos fuentes contra el código en el pasa-altos, y el pasa-bajos no existe en la tabla. El instrumento ya está construido y validado |
| **T2** | **Medir cuál valor de `m.afs.fmode` es LIVE, FIXED y LOCK** | Cierra el enigma del supresor del todo, y **es lo que decide si una corrida planta filtros permanentes** |
| **T3** | Medir la ganancia del ecualizador de canal | La 101 vio la campana subir 20,0 dB exactos y el código declara ±15, pero se midió **un solo crudo** de ganancia: de la forma de la ley no se sabe nada |
| **T4** | Agregar las entradas de la puerta —ataque, relajación, retención— y medirlas | Tres rangos declarados por el fabricante, ninguno en la tabla |
| **T5** | Revisar si el compresor de **salidas** merece entradas propias | El manual le da los mismos rangos que al de canal, pero eso es una afirmación del fabricante, no una medición |

**Ninguna de estas cinco cambia el código sin medir.** Un rango del manual entra a
`RAW_MAP` igual que cualquier otro: con su medición, o marcado como no verificado.
