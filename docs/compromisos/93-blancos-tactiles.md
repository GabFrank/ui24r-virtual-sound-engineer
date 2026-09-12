# Compromisos: medir los blancos táctiles, en cada paso y en los dos anchos

**Escrito antes de implementar**, según `docs/protocolo-de-verificacion.md`.

## Por qué

El sistema de diseño promete, en dos lugares, **objetivos táctiles de 48 píxeles
como mínimo** (`docs/design-system.md`, decisión 2 y sección de accesibilidad).
Hoy **nada lo comprueba**: `tools/visual/flujo.mjs` mide un único rectángulo —el
del paro en diálogo— y el resto de la promesa vive en la palabra de quien
escribió cada pantalla.

Ya falló una vez y en silencio. En el editor del escenario, un blanco declarado
de 48 medía **26,7 píxeles** en una tablet angosta, porque el dibujo se estiraba
y una unidad de dibujo no era un píxel de pantalla. Lo encontró una auditoría
mirando ese componente; una comprobación automática lo habría encontrado el día
que se escribió, y en las otras pantallas también.

## Los compromisos

| # | Compromiso observable | Qué lo haría fallar | Procedencia |
|---|---|---|---|
| D1 | Cada paso del recorrido visual comprueba **todos** los elementos interactivos visibles contra los 48 píxeles | Que un blanco chico pase sin que nada se queje | **Regla externa**: `design-system.md`, decisión 2 y accesibilidad |
| D2 | Se mide en **píxeles CSS del rectángulo dibujado**, después de las transformaciones | Que un elemento dentro de un contenedor escalado pase por su tamaño nominal | **Derivación del defecto ya medido**: 48 declarados, 26,7 reales |
| D3 | Corre en **los dos anchos**, porque el que falla suele ser el angosto | Que sólo se mida en tablet | **Derivación**: el recorrido ya corre en dos anchos por el mismo motivo |
| D4 | El aviso dice **qué elemento**, **cuánto mide** y **en qué paso**, no sólo que algo falló | Un mensaje que obligue a buscar a mano | **Decisión propia** |
| D5 | Las excepciones son **explícitas y contadas**, no una lista que crece | Que la comprobación se vuelva inútil a fuerza de excepciones | **Decisión propia** |
| D6 | La pantalla del recorrido entra en el camino verificado | Que `flujo.mjs` siga sin visitarla | **Obligación pendiente**: C10 del contrato de #86 |

## Qué cuenta como blanco táctil, y qué no

**Cuenta**: `button`, `a[href]`, `input`, `select`, `textarea`, y cualquier
elemento con `role="button"` o `tabindex` no negativo, **que esté visible y
ocupe espacio**.

**No cuenta, y cada exclusión tiene su motivo**:

1. **Lo invisible o de tamaño cero.** No se puede tocar lo que no está.
2. **Los textos sólo para lectores de pantalla**, que miden un píxel y esconden
   su contenido a propósito. El propio `flujo.mjs` ya los exceptúa por lo mismo
   en la comprobación de desborde.
3. **Los enlaces dentro de un párrafo.** Un enlace en medio de una oración tiene
   el alto de la línea y no es un objetivo táctil en el sentido de la regla:
   agrandarlo rompería el párrafo. El sistema de diseño no los nombra, así que
   **esto es una decisión y queda declarada como tal.**
4. **`input[type=hidden]`**, que no se ve ni se toca.

**No se exceptúa** un control deshabilitado: se sigue tocando, y un blanco chico
deshabilitado hoy es un blanco chico habilitado mañana.

## Lo que este contrato NO promete

- **No mide el dedo, mide el rectángulo.** Que dos blancos de 48 separados por
  4 píxeles sean indistinguibles para un dedo es cierto y **esta comprobación no
  lo ve**. La separación entre blancos queda fuera.
- **No mide la zona de soltado de un arrastre.** Si soltar entre dos filas exige
  acertarle a un hueco de 6 píxeles, el blanco que importa es 6 y acá no
  aparece.
- **No corre en un dispositivo real.** Corre en un navegador sin cabeza con dos
  anchos declarados. Que el gesto llegue con el dedo sigue sin comprobarse.
- **No comprueba los 56 píxeles** de «lo que se toca sin mirar»: el sistema de
  diseño no dice cuáles son, y adivinarlos sería inventar la regla.

## Lo que pasó al correrlo por primera vez

**Cinco avisos, y ninguno era un blanco chico.** Los cinco eran el mismo error de
la comprobación: **medía la caja del elemento y no el área que recibe el toque**.
Hay dos mecanismos legítimos que las separan, y los dos aparecieron de una:

1. **El enlace estirado.** Un `<a>` con un `::after` absoluto pegado a los cuatro
   bordes cubre toda su fila — es el patrón con que una fila de tabla entera se
   vuelve un enlace. El enlace mide el ancho de su texto y **se toca la fila**.
   Así estaba el historial: 71×18 el enlace, la fila entera el blanco.
2. **La casilla dentro de una etiqueta.** Tocar el `<label>` alterna la casilla:
   ése es el blanco, no los 22 píxeles del cuadradito.

**Tratarlos como excepciones habría vaciado la comprobación.** No son elementos
que incumplen y se perdonan: son elementos cuyo blanco real es otro. La
comprobación mide ahora el área efectiva, y los dos mecanismos están detectados
por lo que son —un pseudoelemento pegado a los bordes, una etiqueta que envuelve
un control—, no por una lista de nombres.

**Control positivo, porque una comprobación que no falla nunca no comprueba
nada.** Se achicó a propósito la etiqueta que envuelve una casilla: el área
efectiva cayó a 44 píxeles y la comprobación la acusó en los dos anchos. Y el
camino directo ya se probó solo en la primera corrida, que encontró los 22×22.

Resultado: **27 pasos, dos anchos, cero incumplimientos** — y la regla del
sistema de diseño pasó de ser una promesa escrita a algo que se mide en cada
corrida.
