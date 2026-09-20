# Hallazgo: los preajustes de ecualización del usuario ya están en su consola, con sus nombres

**Leído del aparato el 2026-09-20**, del volcado completo de `192.168.0.78`
(6.926 líneas, 320 envíos a auxiliar). **Sin escribir nada.** Apareció al empezar
la pieza 2 de la hoja de ruta —el ecualizador de canal— mirando primero lo propio
antes de salir a buscar afuera, y **cambia el diseño de esa pieza**.

## El dato

La consola guarda, por canal y por proceso —ecualizador, puerta y compresor—, el
**nombre del preajuste** cargado (`*.prname`) y una marca (`*.prmod`). Son 151
claves de cada una en este aparato.

**Veintiuna tienen nombre, y varias las puso el usuario:**

| Canal | Nombre en la consola | Preajuste del ecualizador |
|---|---|---|
| 8 | `VOZ MARCOS` | **Voz bruno** |
| 9 | `VOZ JOSE` | **Voz bruno** |
| 11 | `VOZ GAB` | **Voz gab** |
| 12 | `VOZ CAMILA` | **Voz camila** |
| 13 | `VOZ BRUNO` | **Voz gab** |
| 19 | `DJEMBE MARCOS` | **Djembe marcos** |
| 3 | `GRT BRUNO` | `Acoustic 1` (de fábrica) |

Y de fábrica en otros procesos: `Male Vocal`, `Kick Drum`, `Vtg Main Limit`,
`Cathedral`, `Basic Delay`.

## Por qué cambia el diseño de la pieza 2

**El usuario pidió el 2026-09-20 que los valores no sean fijos sino
configurables, que pueda haber más de una configuración por tipo de instrumento,
y que él pueda auxiliar tocando el mixer y después avisar que ése es el
ecualizador preferido.** Y dijo, textual, que *«Soundcraft permite crear presets
personalizados, podemos aprovechar esa función»*.

**Ya la está usando, y el censo lo demuestra.** Lo que el aparato muestra no es
sólo que el mecanismo exista: muestra **cómo trabaja él**.

**Reúsa el mismo ecualizador de voz en varios cantantes.** `Voz bruno` está
cargado en Marcos y en José; `Voz gab` está en Gabriel y en Bruno. O sea que su
práctica real es **unas pocas curvas nombradas, reutilizadas entre personas**, y
no una por cantante. Eso es exactamente «más de una configuración por tipo de
instrumento», observado en vez de supuesto.

**Y los nombres siguen a la persona, no al canal.** El canal 8 se llama `VOZ
MARCOS` y lleva `Voz bruno`: el nombre del preajuste es el de quien lo originó,
no el de quien lo usa hoy. Un asistente que asuma que coinciden se va a
equivocar.

## `prmod`: la sospecha, que NO es una medición

`prmod` vale 0 o 1, y está en 1 en veintiún claves. La lectura natural es
**«esto se tocó después de cargar el preajuste»**, y encaja con lo que se ve:
`i.2.eq.prmod = 1` con `prname = "Acoustic 1"` —un preajuste de fábrica retocado—
y `i.11.eq.prmod = 1` con `prname = "Voz camila"` —uno propio retocado después de
guardarlo—.

**Es `INFERIDO` y hay que decirlo así.** Sale de leer el volcado, no de medir: no
se comprobó cargando un preajuste y viendo la marca caer a cero, ni tocando una
banda y viéndola subir a uno. Si resulta ser eso, **es literalmente el «avisá que
éste es el preferido» que el usuario pidió, ya construido en su aparato**.

## Lo que falta averiguar, y es lo primero de la pieza 2

1. **Qué significa `prmod` de verdad.** Se comprueba sin riesgo: cargar un
   preajuste en un canal en silencio, mirar la marca, tocar una banda, mirarla
   otra vez.
2. **Si el protocolo permite guardar y cargar preajustes**, o sólo leer el nombre
   del que está puesto. Es la diferencia entre que la aplicación pueda ofrecer
   «guardá esto como el ecualizador de Camila» o sólo reconocerlo.
3. **Si hay forma de listar los preajustes disponibles.**

## Lo que esto NO dice

- **No dice que la aplicación pueda usarlos.** Hoy no lee `prname` ni `prmod` en
  ninguna parte: las dos únicas menciones del repositorio están en la lista de
  claves que `que-entra-al-general.ts` censa y **no lee**, y en un test que
  comprueba que un recall de preset del general **no** se considera ecualización
  permitida.
- **No dice qué hay adentro de cada preajuste.** El nombre es una etiqueta; los
  valores que están puestos **ahora** sí se leen banda por banda, pero eso es el
  estado del canal, no el contenido guardado del preajuste.
- **No dice que estos nombres sean estables.** Son de una lectura de un día.
