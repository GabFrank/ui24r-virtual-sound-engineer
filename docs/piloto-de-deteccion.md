# Piloto de detección: cinco defectos sembrados

**Qué mide y por qué.** `docs/protocolo-de-verificacion.md` cierra pidiendo una
medición concreta, porque una caída en los hallazgos no prueba nada —también
puede significar que los auditores dejaron de encontrar cosas—. La medida que
distingue «mejoró» de «cambió de disfraz» es **cuántos defectos sembrados se
detectan, por familia**.

Corrido el 2026-09-11, sobre una **copia aislada** de tres archivos. El
repositorio no se tocó.

## Lo sembrado y lo detectado

Un defecto por cada familia que el protocolo nombra. El auditor **no sabía que
había nada sembrado**: se le pidió revisar tres archivos y decir qué estaba mal.

| Familia | Qué se sembró | ¿Detectado? |
|---|---|---|
| Una fuente que no respalda la atribución | El documento decía que la fuente principal explica el motivo del orden | **Sí**, bajó la página y citó lo que dice de verdad |
| Una conversión de unidades incorrecta | El divisor del salto de fila a la mitad | **Sí**, con tabla de valores y notando que el dibujo y el dato se contradicen |
| Un test y una implementación que comparten la constante errónea | El umbral de arrastre a 24 en vez de 8 | **Sí**, y además vio que 24 es exactamente el radio del blanco, rompiendo la relación que el número dice respetar |
| Una rama omitida | Media guarda de clasificación borrada | **Sí**, con la cadena entera: `undefined` → comparador no transitivo → tres resultados distintos en 24 permutaciones |
| Una afirmación universal apoyada en ejemplos | «Está comprobado que ningún orden de entrada puede cambiar el resultado» | **Sí**, y notó que además era falsa por culpa de la rama omitida |

**Cinco de cinco, una por familia.**

## Lo que no se sembró y encontró igual

Nueve defectos **reales** del código y la documentación de verdad. Los más caros
son tres atribuciones falsas que yo había escrito creyendo estar siendo
cuidadoso:

1. **«El orden en que se tocan».** La fuente introduce su lista diciendo que es
   *en orden de importancia*, no de ejecución. Convertir un ranking en una
   secuencia temporal es decisión de este proyecto, y yo la presentaba como
   hecho de la fuente.
2. **«Los envíos van al final porque lo dice la fuente».** La fuente nombra un
   solo ítem —envíos a efecto— y sobre los monitores dice **lo contrario de un
   momento fijo**: que unos los ajustan mientras el músico toca y otros hacen
   primero la revisión de líneas.
3. **«La única captura disponible» en Wayback.** Hay al menos dos. Una
   afirmación universal escrita sin comprobarla, **en la nota metodológica que
   existe para respaldar el rigor del resto**.

Y seis más: el tipo de las etapas declaraba el orden viejo porque una corrección
anterior llegó al arreglo y no al tipo; una cifra de pruebas que envejece sola en
cada commit; una medida en centímetros citada en un archivo que sólo habla de
píxeles; una fila de la tabla marcada «sí» cuando el catálogo la cubre a medias;
una guarda que convertía una coordenada rota en un reordenamiento real; y una
función que devuelve lo mismo por dos motivos distintos con un docblock que
nombraba uno.

**Un test mío fijaba el defecto, no el arreglo**: afirmaba que una coordenada en
`NaN` mandaba la fila al puesto 0, o sea que yo había atado con una prueba que la
basura se convirtiera en un movimiento real.

## Qué se puede concluir, y qué no

**Se puede**: la capacidad de detección está, y cubre las cinco familias. Un
auditor con una tarea acotada y sin el encuadre del autor encuentra lo sembrado y
lo no sembrado.

**No se puede concluir que el protocolo funcione.** Esta corrida mide la
capacidad de un auditor, no la del flujo: el auditor tuvo tres archivos, un
pedido enfocado y ninguna conclusión previa que lo orientara. Los auditores
embebidos en el flujo trabajan con más superficie y menos foco.

**Y falta la medida que importa**: los escapes materiales después del cierre. Eso
se sabe recién cuando algo que se dio por bueno falla en una sala.

**Tampoco hubo control de falsas alarmas.** El auditor no revisó ningún archivo
correcto a ciegas, así que no se sabe cuántas cosas buenas habría rechazado. Un
auditor que desconfía de todo detectaría las cinco familias y sería inútil.
