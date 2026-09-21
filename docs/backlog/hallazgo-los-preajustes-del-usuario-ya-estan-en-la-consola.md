# Hallazgo: los preajustes del usuario ya están en su consola, con sus nombres

**Leído del aparato el 2026-09-20**, primero del volcado completo de
`192.168.0.78` (6.926 líneas) y después **preguntándoselo al protocolo**, que es
lo que convirtió la mitad de este documento de sospecha en medición. **Sin
escribir nada.** Apareció al empezar la pieza 2 de la hoja de ruta —el
ecualizador de canal— mirando primero lo propio antes de salir a buscar afuera, y
**cambia el diseño de esa pieza**.

> **Este documento se corrigió a sí mismo el mismo día.** La primera versión
> llamó a lo que encontró «preajustes de ecualización», y **no lo son**: son
> preajustes de **canal entero**, que traen ecualizador, compresor y puerta
> juntos. La confusión es del aparato tanto como de quien leyó —el nombre se
> publica en `eq.prname`— pero la consecuencia para el diseño es grande y está
> más abajo. La corrección salió de leer los preajustes, no de releer el volcado.

## El dato

La consola guarda, por canal y por proceso —ecualizador, dinámica y puerta—, el
**nombre del preajuste** cargado (`*.prname`) y una marca (`*.prmod`). Son 151
claves de cada una en este aparato, repartidas 49 y 49 y 49 entre los tres
procesos más cuatro de los efectos.

**Veintiuna tienen nombre**, y el reparto dice más que la cuenta:

| Canal | Nombre en la consola | Etiqueta en el ecualizador | Etiqueta en la puerta |
|---|---|---|---|
| 3 | `GRT BRUNO` | `Acoustic 1` (de fábrica) | — |
| 8 | `VOZ MARCOS` | **Voz bruno** | **Voz bruno** |
| 9 | `VOZ JOSE` | **Voz bruno** | **Voz bruno** |
| 11 | `VOZ GAB` | **Voz gab** | **Voz gab** |
| 12 | `VOZ CAMILA` | **Voz camila** | **Voz camila** |
| 13 | `VOZ BRUNO` | **Voz gab** | **Voz gab** |
| 19 | `DJEMBE MARCOS` | **Djembe marcos** | **Djembe marcos** |

Y de fábrica en la dinámica de otros canales y del general: `Male Vocal`,
`Kick Drum`, `Vtg Main Limit`; en dos efectos, `Cathedral` y `Basic Delay`.

**Que la etiqueta esté repetida en el ecualizador y en la puerta es la pista que
destapó lo demás**: un preajuste de ecualizador no toca la puerta.

## Su biblioteca es más grande de lo que el volcado deja ver

Preguntándole al protocolo por la lista —`PRESETLIST^ch`— aparecen **diez
preajustes suyos**, y sólo cuatro nombres distintos estaban cargados en algún
canal:

> Bajo · Djembe marcos · Djembe marcos al · Gtr beltran · Voz bruno ·
> Voz camila · Voz gab · djembe jorgito · djembe jorgito al · grt gab

**Seis de los diez no están puestos en ningún canal hoy.** O sea que censar los
nombres cargados —que es lo que hizo la primera versión de este documento—
subestima lo que él tiene guardado. Los otros bancos de usuario están vacíos:
cero en el del ecualizador, cero en el de dinámica, cero en el de puerta; el
único además del de canal es un retardo, `Basic Delay`, en el banco de efectos.

**Y las parejas `X` y `X al` son «más de una configuración para el mismo
instrumento», observada.** Dos djembes tienen su variante: `Djembe marcos` y
`Djembe marcos al`, `djembe jorgito` y `djembe jorgito al`. Es exactamente lo que
el usuario pidió el 2026-09-20 que el diseño admita, y ya lo está haciendo a
mano.

## Lo que guarda un preajuste de canal, medido

Leídos uno por uno con `READPRESET`, los diez traen **32 claves** cada uno, y son
siempre las mismas tres familias:

- **el ecualizador**: pasa-altos y pasa-bajos con su pendiente, las cuatro
  bandas con frecuencia, Q y ganancia, la quinta banda —que en esta consola no
  suena— y el conmutador de modo fácil;
- **la dinámica**: umbral, relación, rodilla, ataque, relajación y ganancia de
  salida;
- **la puerta**: umbral, ataque, retención, relajación y profundidad.

**No trae** ganancia de previo, fader, silencio, panorama, envíos ni nombre de
canal. Es el bloque de proceso, no la tira.

La evidencia, con los diez decodificados a hercios, decibeles y Q con las leyes
medidas de este repositorio, está en
[`preajustes-2026-09-20.txt`](../spikes/SPK-P0.2b/evidence/preajustes-2026-09-20.txt).

**Dos advertencias sobre esa decodificación, que valen antes de usar un número
de ahí para decidir nada.** La ley de frecuencia y la de Q están medidas **en la
banda 1 solamente**; a las bandas 2, 3 y 4 se les aplicó la misma, que es una
hipótesis buena y no una medición. Y varios de sus preajustes usan crudos
**fuera del tramo barrido** —la frecuencia se midió entre 0,25 y 0,90 y el Q
entre 0,35 y 0,70—, así que ahí la conversión extrapola.

## Por qué cambia el diseño de la pieza 2

**El usuario pidió el 2026-09-20 que los valores no sean fijos sino
configurables, que pueda haber más de una configuración por tipo de instrumento,
y que él pueda auxiliar tocando el mixer y después avisar que ése es el
ecualizador preferido.** Y dijo, textual, que *«Soundcraft permite crear presets
personalizados, podemos aprovechar esa función»*.

**Ya la está usando, y ahora se sabe cómo.**

**Reúsa la misma curva de voz en varios cantantes.** `Voz bruno` está cargado en
Marcos y en José; `Voz gab` está en Gabriel y en Bruno. Su práctica real es
**unas pocas curvas nombradas, reutilizadas entre personas**, y no una por
cantante.

**Y los nombres siguen a la persona que la originó, no a quien la usa hoy.** El
canal 8 se llama `VOZ MARCOS` y lleva `Voz bruno`. Un asistente que asuma que
coinciden se va a equivocar.

**Lo nuevo, y es lo que más pesa: la unidad que él guarda es el canal entero.**
Si la aplicación ofrece «guardá esto como el preajuste de Camila», lo que se
guarda —y lo que después se aplica— son **32 claves de tres familias**, no las
cuatro bandas. Eso choca de frente con dos cosas ya decididas: el máximo de
cuatro parámetros por transacción de INV-005, y el conteo por destino audible de
[ADR-035](../adr/ADR-035-el-tope-es-por-parlante-no-por-clave.md), que además
declara que cuatro bandas sobre la misma cuña son el mismo destino si se pisan.
**No está resuelto y no se resuelve acá**: queda anotado como lo primero que la
decisión de la pieza 2 tiene que mirar.

## Las tres preguntas que este documento dejó abiertas

Eran «lo primero de la pieza 2» y ya no lo son. Dos están contestadas contra el
aparato y la tercera avanzó de sospecha a lectura del cliente oficial.

### 1. Si el protocolo deja listar los preajustes: **SÍ, medido**

`PRESETLIST^<categoría>` y la consola contesta
`PRESETLIST^<categoría>^<item>^<item>…`, con los nombres prefijados: `f:` los de
fábrica y `u:` los del usuario. Se preguntaron las quince categorías que nombra
el cliente de la consola y **las quince contestaron**.

### 2. Si el protocolo deja leer y guardar: **leer, SÍ, medido; guardar existe y no se ejerció**

`READPRESET^<categoría>^<nombre>` devuelve
`READPRESET^<categoría>^<nombre>^<JSON>` con el contenido. Así se leyeron los
diez suyos.

Guardar, renombrar y borrar están en el mismo vocabulario —`WRITEPRESET`,
`RENAMEPRESET`, `DELETEPRESET`, más importar y exportar— y **este trabajo no los
usó**: escribir en el aparato de alguien es otra decisión y va por su camino.

**Y hay un detalle que cambia quién hace el trabajo.** Cargar un preajuste **no
es un comando**: la consola devuelve el contenido y **es el cliente el que
escribe clave por clave**. O sea que «aplicar el preajuste de Camila» no se le
delega a la consola: lo escribe la aplicación, treinta y dos veces, y por lo
tanto pasa entero por el motor de seguridad.

### 3. Qué significa `prmod`: **sigue INFERIDO, pero ya no es una corazonada**

El cliente que la propia consola sirve lo contesta sin ambigüedad: **cada control
que se toca escribe un 1** en la marca de su familia —las cuatro bandas, el
pasa-altos, el pasa-bajos, cada control de la puerta y de la dinámica— y
**cargar, guardar o reiniciar la escriben en 0**. Es «esto se retocó después de
cargar el preajuste».

Encaja con lo que se ve: los siete canales que tienen un preajuste cargado en el
ecualizador —seis suyos y uno de fábrica— **tienen la marca en 1**, o sea que él
lo retoca siempre después de cargarlo. Y
hay cinco canales con la marca en 1 **sin ningún preajuste cargado**, que es la
prueba de que la marca no depende de que haya preajuste.

**Sigue siendo `INFERIDO` y hay que decirlo así**: sale de leer el cliente, no de
medir. Lo que falta para volverlo `MEDIDO` es una corrida corta sobre un canal
sin previo: mirar la marca, tocar una banda, mirarla otra vez. **Toca la consola
del usuario**, así que es decisión suya.

**Y de paso apareció una trampa para el futuro, y ésta sí está comprobada contra
el aparato.** El cliente, al cargar un preajuste de canal, etiqueta el
ecualizador y la puerta pero manda la etiqueta de la dinámica a una clave que en
esta consola **no existe** —`comp.prname`; acá la familia se llama `dyn.`, y de
`comp.` no hay ni una clave en el volcado—. Así que los valores de dinámica se
sobrescriben y **el nombre que se muestra queda viejo**.

No es deducción: en el canal 12 los siete valores de dinámica **coinciden dígito
por dígito** con los que trae su preajuste `Voz camila` —umbral, relación,
rodilla, ataque, relajación y las dos ganancias—, mientras la etiqueta de la
dinámica sigue diciendo `Male Vocal`, que es un preajuste de fábrica. El
ecualizador y la puerta de ese mismo canal sí dicen `Voz camila`.

**Un asistente que lea esa etiqueta para saber qué compresión está puesta va a
leer una mentira**, y la forma correcta es comparar los valores, que es lo que se
hizo acá.

## Lo que esto NO dice

- **No dice que la aplicación pueda usarlos.** Hoy no lee `prname` ni `prmod` en
  ninguna parte: las dos únicas menciones del repositorio están en la lista de
  claves que `que-entra-al-general.ts` censa y **no lee**, y en un test que
  comprueba que un recall de preset del general **no** se considera ecualización
  permitida.
- **No dice que estos nombres ni estos contenidos sean estables.** Son de una
  lectura de un día.
- **No dice nada sobre escribir preajustes.** Ni `WRITEPRESET` ni ningún `SETD`
  se enviaron.
