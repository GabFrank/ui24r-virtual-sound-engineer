# El canal del banco no estaba plano, y el contrato del 108 lo daba por sentado

**2026-09-15.** Encontrado **antes** de correr el ítem 108, leyendo el estado de
la consola por HTTP. Contrato afectado:
[`108-la-ley-de-la-ganancia-del-ecualizador.md`](../compromisos/108-la-ley-de-la-ganancia-del-ecualizador.md).
Guion nuevo: `tools/spikes/p0-10b-vu/aplanar-canal.ts`.

## Qué pasó

El contrato del 108 se escribió el 2026-09-13 y describe el banco así:

> *«La banda 2 ya está exactamente en 1000,0 Hz. [...] **No se escribe la
> frecuencia**: una clave menos que tocar y una menos que restaurar. Las cinco
> bandas están planas (`gain = 0,5`), y se exige que sigan así.»*

Entre esa fecha y el 2026-09-15 el usuario cargó el show `Prueba` y ensayó sobre
el canal 10, que quedó configurado como un bombo: nombre `BOMBO`, preajuste
`Kick Drum` en compresor y puerta, y el ecualizador movido entero. Convertido con
la ley que midió el ítem 101 —`20·1102,5^V`—, el estado que se encontró era:

| clave | crudo | convertido | lo que el contrato exige |
|---|---|---|---|
| `i.9.eq.hpf.freq` | 0,09807360763 | **39,8 Hz** | por debajo de 37 Hz |
| `i.9.eq.lpf.freq` | 0,5588 | **1002,6 Hz** | lejos del centro |
| `i.9.eq.b2.freq` | 0,2377317311 | 105,8 Hz | 1000,0 Hz |
| `i.9.eq.b1..b4.gain` | 0,676 / 0,684 / 0,136 / 0 | — | las cinco en 0,5 |
| `i.9.eq.prmod` | 1 | — | 0 |

## Por qué importa más que un aborto

Tres de esas discrepancias habrían hecho **fallar** la corrida en sus
precondiciones, que es el caso barato. La cuarta no.

**El pasa-bajos estaba en 1002,6 Hz, apoyado sobre el bin de 1 kHz que la corrida
mide.** El barrido de ganancia habría recorrido el codo del filtro del usuario, y
la ley resultante —la altura del bin en función del crudo— habría salido
deformada por esa pendiente. Ninguno de los controles del contrato lo habría
visto: C1 mide que el tono llega, C2 mide que la banda es local, L8 mira el
medidor de salida del canal. Un pasa-bajos del propio canal está aguas arriba de
todos ellos y es indistinguible de la ley que se busca.

O sea: la corrida **no habría fallado, habría contestado mal y publicado el
resultado como la ley**, en la medición que existe justamente para resolver la
contradicción entre ±15 dB y ±20 dB.

Y no hay que atribuirlo a un descuido: **el contrato era cierto cuando se
escribió**. Lo que falló es que una precondición sobre el estado de un equipo
compartido caduca, y el guion la comprobaba recién al arrancar. La lectura previa
por HTTP cuesta diez segundos y es lo que convirtió un resultado falso en un
trámite.

## Qué se hizo

El usuario confirmó que la configuración era suya —un ensayo— y autorizó resetear
el canal, nombrando también el compresor.

`aplanar-canal.ts` escribe 18 claves del canal del banco: las cinco ganancias del
ecualizador, cuatro frecuencias de banda, los dos filtros de corte, `eq.prmod` y
las seis del compresor. **17 de 18 cambiaron realmente.** Se verificó releyendo
por HTTP, que es una vía distinta de la que escribió.

**No se tocó** el nombre del canal, los nombres de preajuste de compresor y
puerta, ni `mtkrec`. Son etiquetas y armado de grabación: no entran en el camino
de audio de la medición, y borrarlas le cuesta algo al usuario sin darle nada a
la corrida.

**La restauración es condicional**: si la corrida termina y verifica, el canal
queda plano; si muere o falla a mitad, vuelve al bombo. Además imprime los
valores previos, que quedan en la evidencia — con ese archivo el bombo se repone
clave por clave aunque la corrida haya salido bien.

Evidencia:
[`aplanar-canal-10-2026-09-15b.txt`](../spikes/SPK-P0.10b-vu2/evidence/aplanar-canal-10-2026-09-15b.txt).

## La guarda encontró un error del guion, y esa es la parte instructiva

Los valores de destino **no están escritos en el guion**: se leen de los canales
que la propia consola tiene planos, exigiendo que al menos tres coincidan. Poner
un «0,5 es plano» en el archivo habría sido producir la solución y el criterio con
el que se la declara correcta, que es el diagnóstico entero de
[`protocolo-de-verificacion.md`](../protocolo-de-verificacion.md).

La primera corrida **abortó sin escribir nada**, y tenía razón. La lista incluía
el fader `mix`, «para que el canal quede como un canal sin usar». Los once canales
planos lo tienen en cinco posiciones distintas —0, 0,003611, 0,586216, 0,589338 y
0,022148—, así que la unanimidad no se cumplió.

El fader es una **posición operativa, no una propiedad de la configuración del
canal**: «plano» no dice nada sobre él. Elegir uno de los cinco valores habría
sido inventar el criterio. Se lo sacó de la lista, y no hace ninguna falta: el
guion del 108 escribe el fader él mismo y lo restaura al valor previo.

Evidencia del aborto:
[`aplanar-canal-10-2026-09-15.txt`](../spikes/SPK-P0.10b-vu2/evidence/aplanar-canal-10-2026-09-15.txt).

## Y una guarda del repositorio encontró otro error del guion

La primera versión no usaba `conRestauracion`, con este argumento: un guion cuyo
propósito es dejar el canal distinto no debe deshacer su propio trabajo.
`restauracion-garantizada.test.ts` lo rechazó, y el argumento resultó malo.

**Lo que hay que evitar no es el estado final sino el de mitad de camino.** Si el
proceso muere después de aplanar las cinco ganancias y antes de mover el
pasa-bajos, el canal queda pasando a simple vista por «listo para medir» —las
bandas planas— mientras conserva en 1002,6 Hz exactamente el filtro que deforma
la ley. Es el mismo resultado falso de más arriba, llegando por una caída de
socket en vez de por un show recalado.

Así que la restauración quedó **condicional**: al terminar bien no restaura nada,
al fallar vuelve al bombo. Nunca queda en el medio.

Esto es lo que el trinquete de esa lista compra, y vale anotarlo: la guarda no
sabía nada de pasa-bajos ni de bines de 1 kHz. Sólo sabía que un guion nuevo que
escribe tiene que poder volver atrás, y con eso alcanzó para encontrar un agujero
que el autor había mirado y descartado con un argumento.

## Trabajo previo

**No se buscó en otros proyectos, y el motivo es que la fuente correcta estaba más
cerca.** La pregunta no era «cómo aplana un canal el software de otro», sino «qué
considera plano *esta* consola», y eso lo contesta el propio aparato: once de sus
veinticuatro canales lo están. Un precedente externo habría entrado como hipótesis
—`DigiMixer` recorta el medidor en 240 y está mal— mientras que los canales de
referencia son una lectura directa del equipo que se va a medir.

Lo que sí quedó sin mirar es si algún otro proyecto expone un mandato de «reset de
canal» en el protocolo de la Ui24R, que ahorraría las 18 escrituras. No se buscó
porque los verbos destructivos conocidos de esta consola —`MIXER_RESET`,
`DELETESHOW`, `clearall`— tienen alcance mucho mayor que un canal y este
repositorio tiene prohibido escribirlos.

## Lo que queda abierto

- **La precondición del 108 se comprueba tarde.** El guion la mira al arrancar,
  con el tono a punto de sonar. Que la lectura previa sea un paso declarado del
  procedimiento —y no algo que se le ocurrió a quien iba a correrlo— es una
  guarda que hoy no existe. Es la regla de la disciplina: *una comprobación que
  llega después del hecho es un reproche, no una guarda.*
- **El bombo del canal 10 no está repuesto.** Está archivado y se repone clave por
  clave desde la evidencia, pero hoy el canal está plano. Si el usuario lo quiere
  de vuelta, hay que hacerlo explícitamente.
