# Sistema de diseño

La referencia viva está **dentro de la aplicación**, en la pestaña «Diseño» de
la compilación de desarrollo (`npm run build:dev -w mobile`). Este documento
explica las decisiones; la galería muestra el resultado.

```
apps/mobile/src/styles/    fichas, base y utilidades
apps/mobile/src/app/ui/    primitivas de componente
apps/mobile/src/app/galeria/  la galería
```

## Para quién está diseñado

Un músico que canta, toca, dirige y opera la consola al mismo tiempo. Está de
pie, a un metro de la tablet, con poca luz, a veces con un instrumento en una
mano, y siempre con menos tiempo del que quisiera.

De ahí salen las tres decisiones que atraviesan todo:

1. **Oscuro siempre.** No hay modo claro y no lo va a haber. Un fondo claro en
   un escenario a oscuras deslumbra y arruina la visión durante segundos.
2. **Objetivos táctiles grandes.** 48 píxeles es el mínimo; 56 para lo que se
   toca sin mirar.
3. **Números en ancho fijo.** Los valores se comparan en columna. Con una
   tipografía proporcional, «−12.0» y «−8.5» no alinean y el ojo tiene que
   releer.

## Fichas

Todo valor visual sale de `_tokens.scss`. Si un componente escribe un color, un
espacio o un tamaño literal, es un error, salvo el cero y el uno.

| Grupo | Qué contiene | Regla |
|---|---|---|
| Superficies | `--bg`, `--surface`, `--surface-2`, `--surface-3` | Cuatro niveles y no más. Con más, nadie recuerda cuál usar. |
| Texto | `--ink`, `--ink-2`, `--muted` | `--muted` es el mínimo con contraste 4.5:1. Por debajo se quita el texto, no se aclara menos. |
| Estado | `--ok`, `--warn`, `--danger`, `--signal` | Ninguno es decorativo. `--signal` marca lo que la aplicación propone o está haciendo. |
| Espaciado | `--sp-1` a `--sp-8` | Base 4, pocos saltos. Elegir entre doce valores es elegir mal. |
| Tipografía | `--txt-xs` a `--txt-3xl` | Fuentes del sistema: la aplicación arranca sin red. |
| Forma | `--radio-sm` a `--radio-full` | Radios chicos: uno grande en una tabla de números rompe el alineamiento visual de las columnas. |
| Tacto | `--tap-min`, `--tap-comodo` | 48 y 56 píxeles. |
| Movimiento | `--mov-rapido`, `--mov-medio` | Corto y funcional; se anula con `prefers-reduced-motion`. |

**El color nunca es el único portador de información.** Cada estado lleva
además texto, y donde hace falta, una forma distinta. Esta aplicación muestra
estados de los que depende que algo suene o no suene en una sala llena.

## Puntos de corte

No hay tamaños de dispositivo: hay anchos donde el contenido se rompe.

| Nombre | Ancho | Qué cambia |
|---|---|---|
| `$bp-telefono` | 600 px | Una sola columna. Acciones al ancho completo. Diálogos anclados abajo. Asistentes reducidos a «paso 3 de 5». |
| `$bp-tablet` | 900 px | Dos columnas. Tablas completas. |
| `$bp-ancho` | 1240 px | Se limita el ancho, no se estira. |

Además, `@include bajo` cubre el teléfono en horizontal, donde el alto es el
recurso escaso.

Las rejillas usan `auto-fill` con un mínimo, así que el número de columnas
depende del ancho disponible y no del dispositivo. Es lo que hace que la
aplicación funcione igual en una tablet dividida en dos que a pantalla completa.

## Primitivas

| Componente | Para qué | Lo que no es evidente |
|---|---|---|
| `ui-button` | Acciones | Cuatro variantes. **Un solo `primario` por pantalla**: si todo destaca, nada destaca. `peligro` es una categoría, no un color más fuerte. |
| `ui-field` | Campos de formulario | Genera el identificador y enlaza el rótulo. Sin eso, tocar el rótulo no enfoca el campo y el lector de pantalla lee un control sin nombre. |
| `ui-card` | Bloques con identidad | En teléfono reemplaza a las filas de una tabla. Ocho columnas en 360 píxeles no se leen. |
| `ui-badge` | Estado | Siempre con texto. |
| `ui-stat` | Un número con su unidad | La unidad nunca falta: «−12» sin unidad no significa nada. |
| `ui-empty` | Estado vacío | Exige un título que explique **por qué** está vacío, y admite la acción que lo resuelve. |
| `ui-dialog` | Modales | Usa el elemento `dialog` nativo: el navegador se encarga del atrapado del foco, la capa superior y la tecla de escape. En teléfono se ancla abajo. |
| `ui-stepper` | Asistentes | Los asistentes son obligatorios (ADR-017). Si no se ve cuántos pasos faltan, se abandonan a la mitad. |
| `ui-page-header` | Encabezado de pantalla | La descripción no es decorativa: cada pantalla dice qué hace y qué no hace. |
| `ui-icon` | Iconografía | Trazados en el código, no tipografía de iconos. Una tipografía que no carga deja cuadrados vacíos donde debería estar el paro de emergencia. |
| `ui-toasts` | Avisos efímeros | **Nunca para nada de lo que dependa la seguridad.** Un rechazo del motor de seguridad se muestra en la pantalla, con su invariante, no en un mensaje que se desvanece. |

## Accesibilidad

- Foco visible siempre. La tablet admite teclado externo, y sin anillo de foco
  no se puede operar.
- Contraste mínimo 4.5:1 para texto; el color nunca es el único portador.
- Objetivos táctiles de 48 píxeles como mínimo.
- `prefers-reduced-motion` anula las animaciones; el indicador de carga cambia
  de giro a parpadeo, porque tiene que seguir viéndose que algo está en curso.
- Los avisos usan `role="status"` con `aria-live="polite"`: no interrumpen lo
  que el lector de pantalla esté diciendo.

## El paro de emergencia

Tres cosas, y las tres se aprendieron por defectos reales.

**Flota fijo en la esquina inferior derecha, en todas las pantallas** (INV-019).
Por eso `.pagina` reserva `--zona-inferior`: sin ella, en teléfono el paro se
monta encima del último botón. Lo encontró una captura del sistema de diseño,
donde tapaba justo el «Siguiente» de un asistente.

**Y va además dentro de cada diálogo.** No es redundancia. Un `dialog` abierto
con `showModal()` se pinta en la *capa superior* del navegador, por encima de
cualquier `z-index`, y su velo intercepta los eventos de puntero: con un
diálogo abierto, el botón flotante deja de existir para el usuario. Se
comprobó midiendo, y `tools/visual/flujo.mjs` lo verifica en cada corrida —
abre un diálogo y comprueba que `elementFromPoint` sobre el paro devuelve el
paro—. Por eso `ui-dialog` monta `app-paro-boton` en su cabecera: un
componente del sistema de diseño que puede esconder el paro de emergencia no
es una primitiva neutral.

**La banda de rearme empuja, no tapa.** Antes flotaba fija sobre la barra
superior y la ocultaba entera: mientras el paro estaba activo desaparecía el
estado de la conexión, que es justo el dato que hace falta para decidir si
rearmar.

## Cómo se revisa

```bash
npm run build:dev -w mobile
node tools/visual/capture.mjs
```

Genera `ds-telefono.png`, `ds-tablet-vertical.png` y `ds-tablet.png` en
`docs/visual/`: la galería completa en los tres anchos donde el diseño cambia
de forma.
