# El orden del recorrido guiado

**Qué decide este documento.** En qué orden el recorrido guiado lleva a la banda
de un instrumento al siguiente. La aplicación **propone** este orden; el usuario
lo reordena arrastrando y el orden que elija queda guardado en el perfil de la
banda.

Está escrito porque la propuesta **no puede salir de la intuición de quien
programa**. Es una convención de oficio, y o se la respalda o no se la propone.

## De dónde sale cada cosa, y qué no dice ninguna fuente

**Este documento se escribió para que el orden no saliera de la intuición de
quien programa, y en su primera versión inventó el acuerdo entre las fuentes.**
Una auditoría bajó las tres páginas y las leyó enteras. Lo que sigue es lo que
dicen, separado de lo que yo decidí.

### Lo que publica una sola fuente, y es la que sostiene la tabla

[The Pro Audio Files][pro] da la lista canal por canal, y la tabla de abajo la
reproduce al pie de la letra:

| # | Familia | Detalle | ¿La expresa el catálogo? |
|---|---------|---------|---|
| 1 | Bombo | | sí, `BOMBO` |
| 2 | Redoblante | | **no** |
| 3 | Toms | del más chico al más grande | **no** |
| 4 | Aéreos y platos | de derecha a izquierda del escenario | **no** |
| 5 | Bajo | | sí, `BAJO` |
| 6 | Guitarras | de derecha a izquierda del escenario | sí, `GUITARRA` |
| 7 | Teclados, vientos, cuerdas | | sí, `TECLADO` y `FLAUTA` |
| 8 | Voces | de derecha a izquierda del escenario | sí, `VOZ`, `PALABRA` |

**Y esa fuente no da ningún motivo.** Dice que la mayoría de los operadores
ordenan más o menos así, que se puede usar el orden que uno quiera, y que lo
importante es saber dónde está cada cosa. Nada más. La primera versión de este
documento le atribuía a las tres un argumento sobre armar primero el cimiento de
graves: **no está en ninguna de las tres con esa forma**.

La aclaración de la fuente que sí conviene trasladar: las direcciones del
escenario están dadas **desde el punto de vista de quien toca**, no del público.

### Lo que dicen las otras dos, incluida una contradicción

- **[Sweetwater][sw] es un artículo sólo de batería.** No habla de bajo,
  guitarras ni teclados. Su orden dentro del kit es **bombo → redoblante →
  aéreos → toms**, que **contradice a la tabla de arriba**, donde los toms van
  antes que los aéreos. Las dos no pueden tener razón, y este documento sigue a
  [pro] sin poder justificar por qué.
- **El motivo que sí da Sweetwater** es otro del que yo le atribuí: empieza por
  el bombo porque ocupa mucho ancho de banda —entre el golpe del parche y sus
  armónicos—, no porque sea el cimiente de graves. Y sí respalda la segunda
  mitad: con el redoblante entrando después se pueden quitar las frecuencias que
  chocan.
- **[Gearank][ge]** publica una lista de entradas casi igual a la de [pro], pero
  su secuencia de soundcheck mete guitarras y teclados **antes** que redoblante,
  toms y aéreos. Cuando dice «cimiento» es el del sonido de batería, y arranca
  bombo **junto con** el bajo.

**Queda dicho porque importa**: si el criterio fuera armar el cimiento de graves
primero, el bajo no iría en el puesto 5 detrás de los platos. La tabla que este
proyecto usa es la de [pro], y el motivo de esa tabla no lo publica nadie.

### Lo que pasa hoy con una batería acústica completa

**Sale mal ordenada, y hay que decirlo antes de que alguien lo descubra en una
sala.** Redoblante, toms y aéreos son las filas 2, 3 y 4 —el cimiento del kit— y
el catálogo no los tiene, así que caen en «no clasificado» y van al final,
detrás de las voces.

Arreglarlo no es mover un número: es **agregar esas familias al catálogo**, que
es decisión de producto, porque el catálogo se declara como el repertorio del
usuario —percusión afrolatina y canción— y no como un catálogo general. Queda
como tarea, no como supuesto.

## La percusión afrolatina: decidido acá, sin respaldo de las fuentes

Ninguna de las tres dice dónde va un djembe, una conga o un cajón. Lo que sigue
**lo decidí yo**, y la primera versión de este documento lo presentaba como si
saliera de la tabla de arriba, que es exactamente lo que vine a no hacer:

| Familia | Puesto | Por qué, y es un criterio propio |
|---|---|---|
| `BOMBO` | primero | Lo único que coincide con las fuentes: la tabla lo pone primero. |
| `CAJON` | después | Tiene golpe grave y golpe agudo: sostiene el pulso. |
| `DJEMBE` | después | Grave y medio, con más cuerpo que las manos altas. |
| `CONGA` | después | Vive en el medio: se ajusta contra lo que ya está. |
| `MARACA`, `SHAKER` | al final de la percusión | Sólo agudos. |
| `LINEA` | antes de las voces | Una entrada de línea no toma aire de nadie. |

Si el usuario los ordena distinto, **su orden manda**.

## El orden de las etapas dentro de un canal

[The Pro Audio Files][pro] publica también este orden, y el código lo sigue:
ganancia, puerta, ecualizador, compresor, envíos. La primera versión ponía el
compresor antes del ecualizador, al revés que la fuente, y lo justificaba con un
razonamiento propio.

**El fader no es una etapa acá** aunque la fuente lo liste entre la ganancia y la
puerta: el recorrido ajusta el canal, y el equilibrio entre canales es otra cosa.

**Y dónde deriva cada envío —antes o después del procesamiento— no está medido.**
`docs/capability-matrix.md` registra que existen tanto `post` como `postproc` en
las rutas, y el alcance lo tiene entre lo que falta saber. Poner los envíos al
final es lo que dice la fuente; **afirmar que es porque mandan lo que las etapas
anteriores dejaron sería construir sobre una ley sin medir**.

## Fuentes

[pro]: https://theproaudiofiles.com/soundcheck/
[sw]: https://www.sweetwater.com/insync/how-to-soundcheck-drums/
[ge]: https://gearank.com/sound-check/

- [Live Sound 101: How to Sound Check a Band for a Live Show][pro] — The Pro
  Audio Files. **Es la que sostiene la tabla**: da el orden canal por canal, el
  orden de etapas dentro del canal, y la convención de derecha a izquierda desde
  el punto de vista de quien toca. No da ningún motivo.
- [How to Soundcheck Drums][sw] — Sweetwater. Sólo batería. Su orden dentro del
  kit **contradice** el de [pro] en toms y aéreos. Empieza por el bombo por el
  ancho de banda que ocupa.
- [The Sound Check Process That Never Fails][ge] — Gearank. Lista de entradas
  casi igual a la de [pro]; su secuencia de soundcheck es distinta.

Consultadas el 2026-09-11. **Sweetwater devuelve 403 a un cliente que no sea
navegador**: lo que se verificó es la captura del 2019-07-09 en Wayback, la
única disponible, y no se sabe si el texto vivo cambió desde entonces.
