# El modo del supresor son dos claves, no una

**2026-09-16.** Leído del cliente de la consola ya verificado y del estado real
del aparato. **No se escribió nada.** Contesta la fila 6 de
[§5 de la auditoría externa](auditorias/2026-09-15-auditoria-externa.md), que
proponía «leer el código del cliente propio».

## Lo que el proyecto venía diciendo

Que `m.afs.fmode` es **el** selector de modo, con tres valores para LIVE, FIXED y
LOCK. Textual del resumen del 2026-09-13: *«`m.afs.fmode` es ese selector»*, y en
la lista de pendientes: *«cuál valor es LIVE, FIXED y LOCK. **Decide si una
corrida planta filtros permanentes**»*.

## Lo que hace el cliente

```js
FMODE.setItems([lang.FIXED, lang.LIVE, lang.LOCK]);   // 0=FIXED, 1=LIVE, 2=LOCK

getState:  this.state = 0 == (getValue(a+"afs.logic")|0) ? 2
                      : 0 == (getValue(a+"afs.fmode")|0) ? 0 : 1;

valueFunc: setValue(a+"afs.logic", 2 == this.state ? 0 : 1);
           2 > this.state && setValue(a+"afs.fmode", this.state);
```

O sea, el modo sale de **dos** claves:

| `afs.logic` | `afs.fmode` | lo que muestra la consola |
|---|---|---|
| 0 | *da igual* | **LOCK** |
| 1 | 0 | **FIXED** |
| 1 | 1 | **LIVE** |

**`fmode` por sí solo no dice el modo.** Con `logic = 0` la consola está en LOCK
aunque `fmode` valga 1, y al escribir el modo el cliente toca `logic` **siempre** y
`fmode` **sólo si no es LOCK** — así que `fmode` conserva el valor viejo mientras
se está en LOCK. Leerlo suelto da la respuesta equivocada en las dos direcciones.

## En la consola del usuario, hoy

```
m.afs.logic        1
m.afs.fmode        1     ->  LIVE
m.afs.enabled      1
m.afs.numfixed     6
m.afs.numtotal    12
```

**Está en LIVE y encendido**, que es la combinación que aprende filtros de un tono
sostenido. Lo que el proyecto viene tratando con cuidado no era hipotético para
esta consola: es su configuración normal.

## Lo que esto NO rompe, y conviene decirlo primero

**La guarda que usan los guiones sigue siendo correcta.** Comprueban
`m.afs.enabled = 0` antes de cualquier tono sostenido, y un supresor apagado no
aprende nada sea cual sea el modo. Nada de lo medido esta madrugada estuvo en
riesgo por esto, y la pila de filtros se comparó antes y después en las cuatro
corridas del ítem 108: doce antes, doce después.

Lo que este hallazgo evita es un error **futuro**: cualquier lógica que decida
«acá se puede meter tono porque el modo es LOCK» mirando sólo `fmode` se va a
equivocar.

## Lo que queda establecido, y lo que NO

**Establecido:** el mapeo **clave → etiqueta**. Qué combinación de `logic` y
`fmode` hace que la consola muestre LIVE, FIXED o LOCK. Sale del código que la
propia consola sirve, verificado el mismo día contra el extracto archivado.

**NO establecido: el mapeo etiqueta → comportamiento.** Que la pantalla diga LOCK
no prueba que en LOCK el supresor deje de aprender; eso es semántica del aparato y
el cliente sólo dibuja etiquetas. El manual del fabricante describe los tres modos
y **no se leyó acá**; y entre lo que un manual dice y lo que un aparato hace, este
proyecto ya sabe cuál gana.

Así que el dato entra como `INFERIDO`, y **la pregunta de la fila 6 queda
contestada a medias**: se sabe qué claves mirar y qué etiqueta sale de cada
combinación, y sigue sin saberse cuál de las tres es segura para meter un tono.

## Cómo se cerraría

Con un tono corto en cada modo, comparando la pila de filtros antes y después —lo
que la propia fila 6 proponía—. Son tres tonos cortos y tres comparaciones de
pila, con el supresor restaurado al final.

**Necesita permiso del usuario**, y por un motivo que no es trámite: la prueba
consiste en dejar que el supresor **aprenda**, que es exactamente lo que todas las
demás guardas del proyecto existen para impedir. Si en algún modo aprende, planta
filtros en su consola, y `clearall` —lo único que está medido que los borre— se
lleva también los suyos. Está anotada, no hecha.

## Trabajo previo

**No hay coincidencias en otros proyectos.** Ninguno de los cuatro que hablan este
protocolo expone el supresor de realimentación: ni `fmalcher/soundcraft-ui`, ni
`ioBroker.soundcraft`, ni `ndikanov/ui24`, ni `MyUiPro` nombran `afs.*`. Es
coherente con que sean bibliotecas de control de mezcla y no de proceso del
general, y significa que acá no hay contra qué contrastar.
