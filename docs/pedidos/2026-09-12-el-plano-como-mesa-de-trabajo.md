# El plano como mesa de trabajo, no como instrumento de medición

**Decisiones del usuario en la madrugada del 2026-09-12.** Las citas textuales
están en [`00-lo-que-dijo-el-usuario.md`](00-lo-que-dijo-el-usuario.md).

---

## 1. La regla de trabajo, que vale más allá del plano

> «*Si realmente va a servir (**no por suposición si no que porque tenes cerreza
> y prueba** de que sera asi) entonces habilita altira, rango etc, si no,
> entonces simplifica*»

El usuario condicionó una decisión de producto a que yo **midiera** si la
precisión servía, en vez de argumentarla. Es la misma disciplina que este
proyecto aplica al hardware, aplicada a una decisión de interfaz. Queda escrita
como regla: **una capacidad que se justifica por suposición se simplifica hasta
que alguien la mida.**

## 2. Lo que se midió, y cómo

La geometría no produce un número: produce **un escalón** de parejas
monitor-micrófono que el motor declara que no puede separar (`empatadaCon`).
Así que la pregunta medible no es «¿cambia la distancia?» sino «¿cambia lo que
el sistema informa?».

Escenario de prueba: cuatro cuñas y cinco micrófonos en posiciones plausibles de
la banda. 400 tiradas por nivel de ruido, perturbando cada posición.

| Perturbación | Cambia el orden interno | **Cambia el escalón informado** |
|---|---|---|
| ±5 cm | 99,8 % | **0,0 %** |
| ±10 cm | 99,8 % | **0,0 %** |
| ±20 cm | 100 % | 1,8 % |
| ±50 cm | 100 % | **40,5 %** |

**El usuario tenía razón: 1,00 contra 1,10 no cambia nada de lo que le llega.**
Lo que mueve la respuesta es el medio metro — que es exactamente lo que él llama
«rango de movimiento».

**Y acá hay una trampa que casi se reporta como hallazgo.** La primera columna
—«48 % de cambio con 10 cm»— mide el orden crudo, que **el usuario no ve nunca**.
Presentada sola habría justificado lo contrario de lo que los datos dicen. Se
salvó por preguntar *qué ve el usuario* antes de interpretar, y queda anotada
como caso: es la forma exacta del error recurrente de este proyecto.

## 3. Qué se simplifica

| | Antes | Ahora |
|---|---|---|
| `FIJO` | ±10 cm de duda | **cero** |
| Campo «precisión de la medida» | existía, casi invisible | **se va**: mide algo que no cambia nada |
| `EN_PIE` / `EN_MANO` | categorías con número escondido | atajos para llenar el rango de movimiento |
| Render sin rango | «unos 1,20 m» | **«1,20 m»** |

## 4. El malentendido, y lo que destapó

Yo venía razonando sobre **cuán fino se puede soltar una ficha con el dedo** —
medí que la yema vale entre 33 y 299 cm de sala según pantalla y tamaño del
local, y lo presenté como un problema.

> «*que tiene que ver la yema del dedo?😂 estamos hablado de drag and drop no?*»

**El razonamiento estaba mal de raíz.** Asumía colocación a ciegas: soltás y el
sistema deduce. El usuario describe colocación con realimentación: arrastrás
**hasta que el número dice lo que vos ya sabés**. Con la distancia a la vista, el
ancho del dedo no interviene.

Lo que el malentendido destapó es real: **hoy el plano no dibuja ni una sola
distancia.** Dibuja fichas, su eje y un círculo de duda. Los números aparecen
después, en otra tarjeta, y como ranking de exposición, no como «esto está a
1,80 de aquello». Nadie podía corregir una posición mirando el número, porque no
hay número.

## 5. Lo que hay que construir

| | Hoy | Pedido |
|---|---|---|
| Al seleccionar una ficha | se marca el borde | **líneas a las demás, cada una con su distancia** |
| Mientras se arrastra | nada | **los números se actualizan en vivo** |
| Rango de movimiento | círculo fijo, no editable | **rectángulo editable, que se estira arrastrando** |

**El rectángulo editable cierra la discusión de la sección 3 sin un campo de
formulario.** No se escribe «±50 cm»: se estira la zona por donde camina el
cantante. Nadie sabe si su vaivén son 40 o 60 cm; cualquiera sabe dibujar por
dónde se mueve.

## 6. Lo que queda pendiente y no se resuelve esta noche

**En sala grande el plano necesita zoom.** A 20 × 15 m en teléfono, la yema
cubre casi tres metros de sala. Con distancias en vivo eso deja de impedir
*medir*, pero sigue impidiendo *agarrar* la ficha que se quiere. Es pariente del
ítem 91 —el plano es inusable sin dedo con fichas superpuestas— y va con él.
