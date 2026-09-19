# ADR-036 — La escucha de una cuña se comprueba sobre dos medidores

**Fecha:** 2026-09-19
**Estado:** **decidida, a medio implementar.** El medidor de la cuña ya llega a
la aplicación en marcha —`Ui24rMixerAdapter.auxiliares()` y la señal del mismo
nombre en `MixerService`—; lo que todavía no existe es la captura que los use y
escriba la medición. Ver «Qué falta».
**Origen:** **Decisión del usuario**, eligiendo entre tres opciones el
2026-09-19, al empezar la pieza que le da escucha al envío a monitor.

## El problema, en una frase

**Para la ganancia, escuchar el medidor del canal alcanza; para la cuña de un
músico, no**, y copiar el molde de la ganancia sin ver la diferencia habría
dejado la garantía escrita y falsa.

## Por qué no alcanza, que es una cuestión de por dónde pasa la señal

El motor exige una escucha entre un paso y el siguiente sobre el mismo mando
(INV-004, `escuchaComprobada`). Desde el 2026-09-19 la pantalla de ganancia la
cumple: aplica, vuelve a medir dieciocho segundos, guarda la ventana y anota su
identificador en la transacción.

Esa escucha se comprueba sobre el medidor del canal, y para la ganancia es el
medidor correcto **porque la ganancia está aguas arriba de él**: moverla lo
mueve. Medido el 2026-09-09 — subiendo `hw.N.gain` de 10 a 22 dB, el nivel
anterior al proceso subió lo mismo.

**El envío a una cuña no tiene esa propiedad.** Deriva del canal hacia el bus
auxiliar, y en esta consola los 320 envíos a auxiliar están **antes del fader**
(`post = 0`, leído del aparato). O sea que subir el envío **no mueve el medidor
del canal ni un escalón**: el número que la escucha miraría es un número que el
cambio no puede tocar.

Con el molde de la ganancia copiado tal cual, la aplicación habría podido afirmar
«acá se escuchó» sobre una cuña muda, paso tras paso, hasta el techo de nominal.
Es la misma familia de defecto que la auditoría del 2026-09-19 midió sobre el
medidor congelado: evidencia con forma de escucha que no prueba lo que dice.

## Lo que el usuario decidió

Entre tres opciones —el medidor del músico, el de la cuña, o los dos— eligió
**los dos**, que era la más cara y la más honesta:

> El medidor del músico prueba que él tocó; el de la cuña, que le llegó.

Las dos preguntas son distintas y ninguna implica la otra:

| | El músico tocó | A la cuña le llegó |
|---|---|---|
| Sólo el medidor del canal | sí | **no se sabe** |
| Sólo el medidor de la cuña | **no se sabe**: pudo sonar otro instrumento de esa cuña | sí |
| Los dos | sí | sí |

La fila del medio es la que el usuario señaló al elegir: en una cuña entran
varios instrumentos, así que verla moverse no dice que se haya movido **por este
músico**.

## Qué byte de la cuña, que es donde se decide si la promesa es verdadera

El bloque de auxiliar de la cola de `VU2` es mono de cinco bytes, con `+0` antes
del fader del auxiliar y `+1` después.

**Se lee el `+1`, el de después.** Entre los dos está el fader del propio
auxiliar, que es el mando capaz de dejar la cuña muda sin que ningún envío lo
delate. Leer el `+0` diría que el envío subió y no que al músico le llegó algo,
que es exactamente lo que esta decisión existe para no volver a afirmar de más.

**Y la distinción entre los dos está MEDIDA en este aparato, no heredada por
analogía.** Importa decirlo porque la analogía estaba disponible y habría sido
razonable: el bus de efectos tiene el mismo reparto pre/post y la medición 96a lo
comprobó ahí. Pero un bus de efectos tiene un procesador adentro y un auxiliar no,
y este repositorio ya pagó una vez extender al bus de efectos un resultado medido
sobre un subgrupo. Lo que hay para el auxiliar es propio:

- El reconocimiento del 2026-09-13 leyó `pre` y `post` **iguales, los dos en
  −47,33 dB**, con el fader del auxiliar en la unidad de ganancia.
- El barrido de la 94 puso ese mismo fader en 0,45 **como atenuador fijo,
  precisamente porque mueve `post` y deja `pre` quieto**.

Los dos están en
[`102-la-escala-del-bloque-de-bus.md`](../compromisos/102-la-escala-del-bloque-de-bus.md),
con su evidencia archivada.

**Se expone también el `+0`**, junto al otro y nombrado como lo que es. No es de
adorno: la diferencia entre los dos **es el fader del auxiliar**, y esa diferencia
es lo único que puede explicarle a alguien una cuña que recibe señal y no suena.

## Qué falta, dicho con todas las letras

**Esta decisión está implementada a medias, y la mitad que falta es la que
cambia el comportamiento.**

- **Hecho:** la cola de la trama se decodifica en la aplicación en marcha y los
  medidores de las diez cuñas llegan hasta el servicio que las expone. Hasta hoy
  esos bytes los leían sólo los guiones de medición, y la aplicación los tiraba.
- **Falta:** la captura que muestree los dos medidores durante la ventana, la
  guarde como medición y anote su identificador en la transacción de monitor.
  Mientras no exista, **`EnvioAMonitorService` sigue sin medir** y ninguna cuña
  queda con escucha comprobada — que es donde estaba antes de esta decisión, así
  que no hay cambio de comportamiento todavía.

**Y lo que esta decisión NO resuelve**, para que nadie lo lea de más:

- **No cruza el canal de la medición contra la ruta que se movió.** Ése es un
  hallazgo abierto del 2026-09-19 y la misma tarea que ADR-035 nombra como «el
  tope es por clave y el oído es por parlante». Guardar dos medidores no lo
  cierra: lo deja mejor servido para cuando se cierre.
- **No distingue una caída de conexión que empieza y termina dentro de la
  ventana.** Sigue abierto igual que para la ganancia, y se cierra mirando la
  frescura de las tramas.
- **No convierte esta medición en acústica.** Sale del medidor de la consola, sin
  micrófono y sin calibración, y `medicionEsConfiable` sigue contestando que no.

## Trabajo previo

**Buscado el 2026-09-19 en los cuatro repositorios, clonados y grepeados**, no de
memoria. La fila quedó agregada en
[`trabajo-previo-de-terceros.md`](../referencia/trabajo-previo-de-terceros.md).

**Dos de los cuatro publican el medidor del auxiliar en vivo, y es precedente
directo de la mitad mecánica de esta decisión:**

| | Medidor del auxiliar en un cliente en marcha |
|---|---|
| [`fmalcher/soundcraft-ui`](https://github.com/fmalcher/soundcraft-ui) | **Sí.** `VuProcessor.aux(n)` devuelve un flujo por auxiliar con `vuPost` y `vuPostFader`, y su lector de la cola usa las cuentas de la cabecera igual que el nuestro |
| [`Dennion/ioBroker.soundcraft`](https://github.com/Dennion/ioBroker.soundcraft) | **Sí, y los publica.** Suscribe el flujo de fmalcher y escribe `aux.N.vuPost` y `aux.N.vuPostFader` como estados, junto a los del general y los de las entradas |
| [`NaturalDevCR/MyUiPro`](https://github.com/NaturalDevCR/MyUiPro) | **No.** Declara la biblioteca de fmalcher en sus dependencias pero no la usa para esto: cero coincidencias de `vuProcessor` o `vuData` en su código |
| [`ndikanov/ui24`](https://github.com/ndikanov/ui24) | **No.** Es una inyección en el cliente oficial; el medidor lo dibuja el cliente y este proyecto no lo lee |

**Y la corroboración que importa, que es sobre el reparto de los bytes:** el
lector de fmalcher nombra los dos bytes del auxiliar `vuPost` y `vuPostFader`, o
sea **el segundo después del fader**, que es lo mismo que la medición de este
repositorio dice. Es una fuente independiente y coincide.

**Lo que ninguno de los cuatro tiene, y por eso pide más cuidado, no menos:**
ninguno **condiciona una escritura a haber medido**, así que la pregunta de esta
ADR —qué medidor prueba que hubo escucha— no tiene con qué contrastarse. Se
estresó la negativa con `throttle`, `debounce`, `ramp`, `fadeTo`, `since` y
`backoff` en una revisión anterior, archivada en el mismo documento; lo único que
apareció fue reconexión y sondeo de lectura. La rampa de `fmalcher` —`fadeTo`—
es lo más cerca que hay y **va en dirección contraria**: interpola sola, sin
escuchar en el medio, porque su motivo es que la transición no se note.
