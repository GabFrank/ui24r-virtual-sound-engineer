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

## Ítem 91 — el zoom, y su contrato de expectativas

**Por qué existe el ítem.** El plano ya dice cuánto vale un dedo sobre él
(`precisionDelDedoM`), y en una sala de 12 × 8 m sobre un lienzo de 700 px ese
número es de decenas de centímetros. La pantalla no miente —lo declara y ofrece
escribir las coordenadas—, pero *declararlo no lo arregla*: con fichas
superpuestas no hay forma de tocar la de abajo, y arrastrar empeora el dato en
vez de mejorarlo. El zoom es lo que convierte la honestidad en capacidad.

**Dónde se acaba el zoom, y por qué ahí.** No en un número elegido por
comodidad. El modelo tiene una incertidumbre más fina que todas las que no son
cero: `INCERTIDUMBRE_POR_FIJEZA.EN_PIE.posicionM` = 0,05 m, decisión del usuario
del 2026-09-12. Un dedo más fino que eso no puede mejorar ningún dato, porque no
hay dato en el modelo con esa resolución: `FIJO` declara cero y su error es de
quien puso la marca, no del plano. Así que el tope de zoom se **deriva** de esa
constante, no se escribe:

    zoomUtilMaximo = (YEMA_PX / 0,05) / pxPorMetro del encuadre completo

**Piso.** Zoom 1 es el local entero y no se puede alejar más. Afuera del local no
hay nada que mirar, y dejar alejar produciría una pantalla donde el dato se ve
más chico sin ganar nada.

**Encuadre.** El centro de la vista se recorta al rectángulo del local. A zoom
alto eso deja ver más allá de la pared —tres cuartos de lienzo vacío en una
esquina—, y es a propósito: sin eso no se puede arrastrar algo *contra* la pared
sin que el dedo tape justo el lugar donde va.

### Expectativas registradas antes de implementar

Falsables, y cada una es un test:

1. **A zoom 1, la vista no existe.** `escalaConVista(dim, w, h, vistaInicial(dim))`
   devuelve exactamente lo mismo que `calcularEscala(dim, w, h)` —los cuatro
   campos, no "parecido"—. Si difiere, el zoom cambió el encuadre completo, que
   es el que ya está medido y dibujado en las capturas visuales.
2. **El dedo se afina monótonamente.** `precisionDelDedoM` estrictamente
   decreciente al subir el zoom. Si no baja, el zoom es decorativo.
3. **En el tope, el dedo llega a la resolución del modelo.**
   `precisionDelDedoM` en `zoomUtilMaximo` ≤ 0,05 m. Esta es la que justifica el
   ítem: si no se cumple, el zoom no alcanza para lo que se lo pidió y hay que
   decirlo en vez de publicarlo.
4. **Ida y vuelta.** `aMetros(aPantalla(p))` devuelve `p` al centímetro, con
   cualquier zoom y cualquier encuadre. Es la que atrapa un origen mal corrido:
   un plano que dibuja bien y suelta las fichas en otro lado.
5. **El recorte no deja el local afuera.** Con el centro pedido en cualquier
   punto —incluso fuera del local, incluso NaN— el local sigue intersecando el
   lienzo.
6. **El blanco táctil no se rompe.** `BLANCO_MINIMO_PX` es en píxeles CSS y no
   depende del zoom; el test que compara ese número con la ficha dibujada tiene
   que seguir valiendo con la vista aplicada.

**Lo que este ítem NO hace.** No toca `calcularEscala` ni su firma: el encuadre
completo sigue siendo el que está, porque es el que las capturas de
`tools/visual/flujo.mjs` fijaron. El zoom es una capa encima.

### Qué dijeron las expectativas al correrlas

Las seis pasaron. Dos cosas cambiaron después de escribirlas, y las dos van acá
y no reescritas arriba:

**1. El contrato no cubría un zoom no finito.** Al escribir el test supuse que
`Infinity` se recortaría al tope útil, y el código lo manda al encuadre
completo. Se fijó la regla del código: un zoom no finito es un defecto de quien
llama, y el encuadre completo es el único estado del que se sabe con certeza que
muestra la sala. Recortar un `Infinity` al tope sería tratar un error como un
pedido. Esto es un hueco del contrato, no un criterio movido después de ver los
datos: el contrato no decía nada de un zoom roto.

**2. Una expectativa que escribí de más era falsa, y la cuenta la corrigió.**
Había agregado "en una sala chica el tope de zoom es 1", suponiendo que en un
local de 1 × 1 m el dedo ya sería más fino que los 5 cm del modelo. **No lo es:
da 12,5 cm, y el tope queda en 2,5.** Para que el dedo llegue solo a 5 cm haría
falta una sala de 40 cm de lado, o un lienzo de 2000 px. El test quedó
reescrito para probar lo que sí hay que probar —que el piso del recorte
funciona— llegando de verdad a la condición, y el comentario dice que la premisa
original era falsa.

**La cifra que justifica el ítem, salida de correr `calcularEscala` y no de
estimarla:** una sala de 12 × 8 m en un lienzo de 400 px con 24 de margen deja
352 px útiles de ancho, que dividido 8 m da **44 px por metro**. La yema son 44
px. **Un dedo, un metro justo** — veinte veces la incertidumbre que el modelo
declara para algo apoyado en el piso, y de ahí que el tope de zoom en esa sala
sea exactamente 20. Está fijado en un test con `strictEqual`, los tres números.

**Lo que se cableó.** La escala del componente pasa por la vista, así que
dibujar, arrastrar, medir distancias y calcular el grosor del dedo se enteraron
del zoom sin tocarlos: todos pasaban ya por `EscalaDelPlano`. Los mandos van
arriba del lienzo y no flotando encima —un botón sobre el plano tapa justo el
pedazo que uno quiere mirar, y con el gesto de desplazar desactivado no hay
forma de correrlo—, con 48 px de lado, el mismo blanco mínimo que las fichas. Al
acercar se centra **sobre la ficha elegida** si hay una, para no desorientar.

Y el número del dedo se muestra siempre, en centímetros enteros, en ámbar cuando
pasa de los 5 cm del modelo. Enteros porque un decimal sobre una estimación del
grosor de una yema sería precisión inventada.

**Lo que este ítem sigue sin resolver.** Las fichas superpuestas se pueden
separar acercando, pero dos elementos en la misma posición siguen sin forma de
elegirse uno u otro; eso es otro ítem. Y el zoom se maneja con botones: el gesto
de pinza no está, porque el anfitrión desactiva `touch-action` para poder
arrastrar y habría que reconstruirlo a mano sobre dos punteros.

## El rectángulo de rango de movimiento

Decisión del usuario: «*si el equipo es móvil entonces se ve el rango (que al
registrar seteamos), puede ser un rectángulo editable*», y al elegir entre
opciones, «**rectángulo que se estira**».

### Por qué un rectángulo y no un número

Tiene sentido físico además de ser lo que pidió. Un cantante con inalámbrico se
mueve **por el frente del escenario**: tres metros en `x` y medio en `y`. Un
radio no puede decir eso; obliga a elegir entre exagerar la profundidad o
subestimar el ancho. Hay un test que lo fija con números: con el rectángulo, una
cuña al costado queda a 0,99 m de mínimo y una adelante a 1,74; **con un radio
del mismo alcance las dos dan 0,941, indistinguibles**.

### Dónde encaja, y la primera versión que estuvo mal

La primera versión le daba a `EN_MANO` un cuadrado de un metro por omisión y le
bajaba el radio a 0, leyendo los 0,50 m de la tabla de fijeza como medio lado.
**Un test la tiró abajo con un caso físico**: quien canta **se agacha hacia su
cuña**, o sea que un micrófono de mano se mueve también en altura, y un
rectángulo del plano no puede decirlo. Con el radio en 0, el modelo afirmaba que
el micrófono no podía acercarse a una cuña 40 cm más abajo — que es exactamente
el caso que ese test describe.

La división quedó al revés, y más simple: **la fijeza da la duda isótropa
—decisión del usuario, sin tocar— y el rectángulo es lo que se le suma.**
`EN_MANO` sigue siendo ±0,50 m en todas las direcciones hasta que alguien declare
que ese cantante camina tres metros; ahí el rectángulo crece en `x` y no en `y`.

Lo bueno de esta forma: **no hay nada que decidir por el usuario.** Su pregunta
—«si no es fijo, cuál es el rango de movimiento?»— la contesta la pantalla, y
mientras no la contesten vale la tabla que él ya fijó. La versión anterior me
obligaba a inventar un rectángulo inicial.

### La geometría, que cambió de forma

Las distancias eran `d ± (ua + ub)`, exacto entre dos esferas. Con un rectángulo
hay dos formas distintas y **no se pueden mezclar en una**: el rango es una
**caja** alineada con los ejes y el error de la marca es una **esfera**.

Mi primer intento sumó el radio a cada semieje, o sea convirtió la esfera en una
caja de lado `2r`. Una esfera está **inscripta** en esa caja, así que el
intervalo salía más ancho: dos marcas con 0,30 y 0,40 m de duda a cinco metros
daban un mínimo de 4,02 en vez de 4,30. **Lo encontró el test que fija que las
incertidumbres se suman y no se componen en cuadratura**, con el número exacto —
la clase de test que sirve justamente porque no tiene tolerancia.

Ahora son dos cuentas: las cajas eje por eje (exacto entre rectángulos
alineados) y después los radios a lo largo de la recta que las une (exacto entre
esferas). Sin rangos declarados da **exactamente** la forma vieja, y hay un test
que lo fija.

### En pantalla

- El rectángulo, **debajo de todo**, con trazo discontinuo: lleno se leería como
  una superficie del local —una tarima, una alfombra— y es una región de duda.
- **Dos tiradores, uno por eje**, a media altura de su lado y por fuera. Por
  fuera porque adentro competirían con el arrastre de la ficha; a media altura
  porque en una esquina los dos se pisarían y con 48 px de blanco cada uno no
  hay lugar. Hay un test que verifica que no se pisen.
- **Sólo en la ficha elegida.** Con todas a la vez el plano se llena de blancos
  que se pisan entre fichas, y es el mismo criterio que las distancias.
- **Crece simétrico**: el elemento se queda donde está. Si creciera hacia un
  lado, estirar movería la marca, que es otro dato y ya se edita arrastrando.
- Se recorta a las paredes, y al centímetro.
- Y el lector de pantalla lo nombra: «*3,00 m de ancho por 0,50 m de fondo*», con
  el mismo formateador que las distancias. Un cuadrado se dice una sola vez —«3 m
  en cuadrado»— porque hacer leer dos números iguales para darse cuenta de que
  son iguales es trabajo de más.

### Lo que valida el dominio

Lados no finitos o negativos —darían un mínimo mayor que el máximo—, un rango más
grande que el local, y **`FIJO` con rango**, que son dos afirmaciones que no
pueden ser ciertas a la vez: la fijeza dice cuánto se mueve.

### Lo que falta

El alta de instrumento todavía no pregunta el rango; hoy sólo se estira en el
plano. Y el rectángulo no rota: uno rotado sería más expresivo y mucho más
difícil de estirar con el dedo, y esta pantalla existe para marcar una sala en
treinta segundos.
