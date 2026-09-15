# Expectativas independientes: la pantalla del recorrido

**Registradas antes de que exista implementación**, por un auditor que **no vio
ninguna solución propuesta** — ni el contrato de compromisos, que declaró no
haber leído a propósito. Es la pieza central de
`docs/protocolo-de-verificacion.md`: el criterio de corrección nace antes que la
solución, para que el autor no pueda acomodarlo.

Lo que sigue son **observaciones a hacer**, no veredictos. Sirven de criterio de
aceptación y de guion para el contraste posterior.

## Lo que separa una solución correcta de una plausible pero equivocada

Cada fila nombra una forma de resolverlo que **parecería funcionar** y la
observación que la delata.

| Alternativa plausible | Qué observación la separa |
|---|---|
| Arrastre con la API HTML5 (`draggable`, `dragstart`) | Funciona con ratón y **no dispara con el dedo** en el WebView de Android. Hay que arrastrar con un dedo de verdad, o con eventos de puntero sintéticos. Un test con `mouse.down/move/up` **no distingue**. |
| Eventos de puntero **sin** `setPointerCapture` | Arrastrar una fila **más allá del borde de la lista** y soltar ahí. ¿Aterriza, o queda colgada en «arrastrando»? |
| Sin `touch-action: none` en el asidero | Con más filas de las que entran, arrastrar hacia abajo: ¿se desplaza la página bajo el dedo? Y al revés: con `touch-action: none` en toda la lista, ¿se puede **llegar** a la fila 20? |
| Calcular la posición contra las coordenadas tomadas al empezar | Arrastrar **tres puestos en un solo gesto continuo**, sin levantar el dedo. Soltar después de un puesto no distingue. |
| Persistir números de canal en vez de `ChannelAssignmentId` | Guardar un orden, **repatchear** el cantante de la entrada 1 a la 9, y ver si el orden sigue **al cantante** o **al zócalo**. |
| Persistir posiciones de la lista propuesta | Guardar, agregar un canal, y comprobar que el orden guardado sigue valiendo. |
| Persistir la lista ya materializada | Agregar un canal después de guardar y contar: tiene que seguir estando y quedar último. |
| **Escribir sobre un `BandProfile` rancio** | Guardar un orden y, **sin reiniciar**, ir a canales, cambiar algo y volver. ¿Sigue el orden? |
| Guardar al soltar vs. con botón | Arrastrar y salir con el gesto de atrás de Android. Si autoguarda, ¿quedó? Si es manual, ¿preguntó? Ni guardar ni preguntar pierde el trabajo en silencio. |
| Agregar una migración que no hace falta | Leer una banda guardada **antes** del cambio, sin la clave, y ver si funciona. |
| Guardar el orden en la sesión | Cerrar la sesión y abrir otra con la misma banda. Si el orden no está, contradice dos documentos. |
| **La pantalla reordena por su cuenta** en vez de llamar al dominio | Los empates. Cargar una **maraca en el canal 9 y un shaker en el 2**, con la maraca primera en la lista: el dominio dice shaker primero; una reimplementación estable dice maraca. Hay que forzarlo, porque `band.service.ts:125` ya ordena por canal en cada guardado y eso lo esconde. |
| Un «por qué está acá» que cite fuentes para las trece familias | Leer el texto de un **djembe** y de un **cajón**. Si dice «las fuentes», «la convención» o «lo recomendado», está atribuyendo: **siete de trece** salen de la tabla y **la fuente no da motivo**. |
| Seis etapas presentadas como seis pasos iguales | Contar cuántas dicen «sin medir»: tienen que ser cinco. Y poner `LEY_MEDIDA.PUERTA = true` en una compilación de prueba: si la pantalla no cambia sola, tiene la cadena escrita. |
| «Restaurar el orden propuesto» que borra vs. que congela | Restaurar, después corregir la clasificación de un canal, y ver si el orden se mueve. |
| Soltar fuera de la lista tratado como cancelación | Son dos eventos: soltar fuera del borde, y un `pointercancel` del sistema. **Un `pointercancel` no confirma: descarta.** |

## Fronteras

| Caso | Qué se espera |
|---|---|
| Lista vacía | Título que explique **por qué** y camino a la pantalla de canales |
| Un solo elemento | El gesto sigue ofrecido; ninguna instrucción que no se pueda obedecer |
| Dos filas etiquetadas igual | Después de arrastrar una, ¿cuál se movió? `track` por `asignacionId`, no por índice |
| Arrastre durante una recarga | O sobrevive, o se cancela **visiblemente**. Nunca aterrizar en una lista que ya no existe |
| Orden guardado con canales que ya no existen | El dominio los ignora; el riesgo es que la pantalla acumule identificadores rancios. **Quitar y reasignar la misma entrada acuña un identificador nuevo** |
| 24 canales asignados | ¿Se lleva la fila 1 al puesto 24 en un gesto? El autodesplazamiento en los bordes es lo que más se olvida |
| Desconocido arrastrado al puesto 1, y después clasificado | El orden guardado gana; la pantalla no puede reordenar «porque ahora sí sabe» |

## Casos reservados

Registrados antes de ejecutar la implementación, para el contraste posterior.
Una vez revelados para corregir un defecto, pasan a regresiones conocidas.

**R1** orden guardado + reclasificación posterior · **R2** arrastre con la app a
segundo plano · **R3** guardar con la consola desconectada y reiniciar · **R4**
arrastre de desplazamiento neto cero: no puede dejar la pantalla en «sin
guardar» · **R5** toque rápido: ¿selecciona o reordena? · **R6** dos dedos —
`plano-escenario.component.ts` ya tiene la lección, a ver si viajó · **R7**
`prefers-reduced-motion` · **R8** rotar la tablet a mitad del arrastre · **R9**
con el paro activo, ¿se llega a la última fila? · **R10** canal de un integrante
quitado de la banda.

## Datos de contexto que el auditor trajo, y valen

- **El repositorio no depende de `@angular/cdk`**: no hay `cdkDropList`. El único
  precedente de arrastre táctil es `plano-escenario.component.ts`, hecho a mano
  con eventos de puntero.
- **`tools/visual/flujo.mjs` nunca visita `sesion/canales`** porque corre sin
  consola. Una pantalla colgada de ahí no se captura en ningún ancho salvo que se
  extienda el recorrido.
- **No hay auditoría automática de blancos táctiles** en el repositorio.
  `flujo.mjs` mide un único rectángulo, el del paro.
- **`getBoundingClientRect` devuelve píxeles CSS**, así que el factor de escala
  del dispositivo no es la trampa. La trampa es cualquier `transform: scale`,
  cualquier `viewBox`, o un contenedor cuyo tamaño CSS difiera de su sistema de
  coordenadas.
- **El blanco de la zona de soltado no es el del asidero**: si soltar entre dos
  filas exige acertarle a un hueco de 6 px, el blanco que importa es 6.

## Límites declarados por el auditor

No vio implementación, no corrió la aplicación ni midió un rectángulo, no
verificó las tres fuentes de oficio, y no corrió los tests. **No se puede decidir
desde el código fuente si un arrastre táctil funciona**: eso se resuelve con un
dedo en la tablet o con eventos de puntero sintéticos en un WebView de verdad.
