# SPK-P0.8 — Instantáneas y alcance de la recuperación

**Estado:** Parcial — **criterio 5 contestado** el 2026-09-10 · **Timebox:** 3 días · **Control:** G-A

> **Dos cosas medidas de paso, que no eran criterios de este spike pero salieron acá.**
>
> `SNAPSHOTLIST` contesta en **6 ms de mediana** sobre 84 pedidos en tres corridas —mínimo 5, máximo 13, más un único caso de 277 ms que no se repitió en sesenta intentos seguidos—, o sea **más rápido que el testigo**. La política de confirmación afirmaba «del orden de un segundo» sin haberlo medido nunca, y ese número inventado tapaba un defecto real: `pedirLista()` tomaba prestados los 500 ms del plazo de confirmación de escritura y, al vencer, devolvía lista vacía **en silencio** —indistinguible de un show sin instantáneas—. Ahora tiene plazo propio y devuelve `null` cuando no hubo respuesta.
>
> Y la retención **nunca había borrado nada desde el adaptador**: todas las corridas anteriores tenían menos de veinte automáticas, o sea por debajo del máximo. Se llenó el show a propósito para comprobarlo. Ver `evidence/retencion-y-lista-2026-09-10.txt` — **transcripción sin archivar**: se escribió a mano en vez de pasar por `medir.mjs`, que ya existía ese día. El guion no está en el árbol, así que remedirla es escribirlo de nuevo.
**Depende de:** SPK-P0.2a · **Bloquea a:** S-02.13
**Montaje:** Ui24R con un show de trabajo, router, laptop.

## Pregunta que responde

¿Se puede guardar y recuperar instantáneas sin tocar las del usuario, y qué incluye exactamente una recuperación?

Lo segundo importa porque el retroceso por instantánea es la última red de seguridad: si no se sabe qué restaura, no se sabe qué promete.

## Pasos

1. Crear un show dedicado. Si el protocolo no permite crearlo, hacerlo a mano y documentarlo.
2. Cincuenta ciclos de guardar y recuperar con nombres del prefijo reservado.
3. Calcular el hash del estado de las instantáneas manuales antes y después.
4. Volcar el estado completo antes y después de una recuperación, y comparar campo por campo.
5. Guardar una instantánea con un nombre que ya existe, y observar el comportamiento.
6. Guardar una instantánea con audio pasando y escuchar si produce un corte audible.

## Criterios

| # | Criterio | Tipo | Umbral | Medido | Resultado |
|---|---|---|---|---|---|
| 1 | Ciclos de guardar y recuperar correctos | bloqueante | 50 de 50 | | ⬜ |
| 2 | Instantáneas manuales intactas | bloqueante | hash idéntico antes y después de 50 ciclos | | ⬜ |
| 3 | Alcance de la recuperación documentado: ¿incluye ganancia, alimentación fantasma, supresión de realimentación, patcheo, retardos, reproductor? | bloqueante | campo por campo | **Contestado el 2026-09-10, con dos asteriscos que puso una auditoría.** De 45 campos movidos vuelven 44; el que no es `m.afs.enabled`, la supresión de realimentación. Vuelven ganancia, patcheo, retardos de canal, reproductor, ecualizador, puerta, dinámica, nombres, silencios, panoramas y envíos auxiliares. **(a) La alimentación fantasma sale de la lista**: se midió cruzando INV-007, que no correspondía, y el guion ya no la toca — o sea que esa familia vuelve a estar **sin medir**. **(b) Los retardos medidos son `i.N.delay`, los de canal**; los de salida —`m.delayL`, `m.delayR`, `a.B.delay`— no están cubiertos. Y el «cero efectos colaterales sobre 6.700 claves» es más fuerte de lo que el método sostiene: la comparación final no puede ver una clave que el recall escribió **devolviéndola a su valor de base**. Lo que sí lo sostiene es que la consola difundió exactamente 45 rutas | 🟡 |
| 4 | Comportamiento al guardar sobre un nombre existente | bloqueante | documentado | | ⬜ |
| 5 | Existencia de borrado o renombrado por protocolo | informativo | sí o no | **Borrado: SÍ, y probado desde el adaptador.** `DELETESNAPSHOT^show^nombre` funciona: se llenó el show hasta el máximo y al guardar la 21 la retención borró la más vieja, dejando 20. `evidence/borrado-instantanea-2026-09-10.txt` y `evidence/retencion-y-lista-2026-09-10.txt`, las dos **transcripción sin archivar**. **Renombrar: sin clave conocida y sin probar** | ✅ |
| 6 | Corte audible al guardar con audio pasando | informativo | sí o no | | ⬜ |

## Evidencia a entregar

- `evidence/snapshot-cycles.jsonl`, `evidence/recall-diff.json`, `evidence/manual-hash.txt`.

## Acción ante fallo

Si la recuperación no restaura la ganancia de entrada, el retroceso por instantánea deja de ser red de seguridad para ese parámetro y el retroceso transaccional pasa a ser obligatorio antes de habilitar cualquier escritura de ganancia.


---

## Qué devuelve una recuperación, campo por campo — 2026-09-10

El criterio nombra seis familias y pregunta si la recuperación las incluye. La
pregunta importa más que su lugar en la tabla: **si el punto de retorno que la
aplicación guarda antes de escribir (INV-001) no devuelve todo, entonces no es
un punto de retorno**, y la promesa de «se puede deshacer» tiene una letra chica
que nadie escribió.

Método: guardar una instantánea **del estado de ahora**, mover 45 campos de
quince familias distintas, guardar una segunda, y recuperar la primera — con lo
cual la propia recuperación es la restauración. Antes y después se leen los
~6.700 valores por `GET /raw`. Evidencia: `evidence/alcance-recall-booleanos-2026-09-10.txt`

### La respuesta: 44 de 45, y la excepción importa

| Familia | ¿Vuelve? |
|---|---|
| Ganancia del previo (`hw.N.gain`) | sí |
| Alimentación fantasma (`hw.N.phantom`) | **sin medir** — se midió cruzando INV-007 y esa medición se retira |
| Patcheo de salida física (`hwoutaux.N.src`) | sí |
| Retardos **de canal** (`i.N.delay`) | sí. Los de salida, sin medir |
| Reproductor (`p.0.mix`, `p.0.mute`) | sí |
| Fader, silencio, panorama, envío auxiliar, nombre | sí |
| Ecualizador, puerta, dinámica | sí |
| **Supresión de realimentación (`m.afs.enabled`)** | **no** |

Sobre los efectos colaterales, con la precisión que faltaba: la consola difundió
**exactamente 45 rutas para 45 campos movidos**, y eso es lo que sostiene que no
tocó nada más. La comparación final del volcado **no** lo prueba por sí sola: una
clave que el recall hubiera escrito devolviéndola a su valor de base saldría
idéntica y sería invisible ahí — porque la base *es* el contenido de la
instantánea.

**Y hay una clave sin rendir cuentas.** La corrida informa «claves que de verdad
cambiaron: 46» contra 45 campos movidos. Una de ellas es `var.currentSnapshot`,
que movió el guardado del paso 1. Queda **una** sin identificar, reproducible en
la corrida gemela. El candidato obvio es un compañero de par estéreo arrastrado
por `stereoIndex`, pero no está comprobado, y «44 de 45» es justamente el
inventario de lo que el punto de retorno de INV-001 promete devolver.

**`m.afs.enabled` es la única excepción, y no es una cualquiera.** El supresor
de realimentación ya nos había arruinado una ronda entera de mediciones: toma
los tonos de prueba por acople y les pone un filtro de −18 dB mientras uno mide.
O sea que su estado **cambia materialmente lo que la consola le hace al audio**,
y es justo lo que el punto de retorno no devuelve. Si algo lo apaga o lo
enciende, recuperar la instantánea no lo deshace.

### Un recall difunde lo que cambió, no el volcado entero

45 rutas movidas, **45 mensajes difundidos**. No manda las 6.700 claves: manda
la diferencia. Eso confirma lo que el almacén confirmado ya suponía en un
comentario — que **un recall chico es un puñado de mensajes** — y por eso mismo
puede pasar por debajo del umbral de avalancha sin que nadie lo note.

### Tres formas de medir esto mal, las tres cometidas acá

**1. Un campo que no se movió no prueba nada.** La primera corrida usó los
canales 21 a 24 y mostró nueve familias en verde. Pero esos canales **no tienen
previo** —la consola declara veinte previos para veinticuatro entradas— así que
los cuatro `hw.N.gain` no existían, la consola los ignoró en silencio, y la
familia **ganancia**, que es la única que la aplicación escribe de verdad, quedó
sin medir mientras la tabla se veía completa. El guion ahora lo dice a los
gritos: *«no aceptaron el cambio, y por eso no prueban nada del recall»*.

**2. Recuperar la instantánea que acabás de guardar no contesta si el puntero
cambia.** Guardar deja `var.currentSnapshot` apuntando a la recién guardada; al
recuperar esa misma, el puntero ya estaba donde tenía que estar y la consola no
tenía nada que difundir. La corrida concluyó «no difunde el puntero» cuando lo
único que había demostrado es que no había nada que difundir. Con una segunda
instantánea de por medio, **sí lo difunde**.

**3. A un booleano no se le escribe 0,8.** El perturbador genérico movía todo
±0,2. Sobre un interruptor eso manda un valor que la consola tiene que
interpretar, y después «el recall no lo devolvió» es indistinguible de «la
consola nunca aceptó lo que le mandamos». Con `m.afs.enabled` importaba de
verdad, porque es el único que no vuelve: se remidió con 1↔0 y **el hallazgo se
sostiene**.


## Evidencia archivada

Las cuatro primeras corridas del alcance del recall están acá con nombre y
apellido, y no se borraron: **cada una es el registro de una forma distinta de
medir esto mal**, y la sección de arriba las explica una por una. Un archivo que
solo dice el resultado bueno deja al que venga sin saber qué trampas hay.

- `evidence/alcance-recall-2026-09-10.txt` — la primera. Canales 21 a 24, que
  **no tienen previo**: los cuatro `hw.N.gain` no existían y la familia
  ganancia quedó sin medir mientras la tabla mostraba nueve familias en verde
- `evidence/alcance-recall-ganancia-2026-09-10.txt` — con previos de verdad. La
  ganancia entra, pero se recupera **la instantánea recién guardada**, así que
  el puntero no tenía a dónde volver y la pregunta de la causa quedó tapada
- `evidence/alcance-recall-puntero-2026-09-10.txt` — con dos instantáneas: acá
  sí se ve que la consola **difunde `var.currentSnapshot`**. Faltaban cuatro de
  las seis familias que el criterio nombra
- `evidence/alcance-recall-completo-2026-09-10.txt` — las seis familias, pero
  moviendo los booleanos con ±0,2, con lo que «no volvió» no se distinguía de
  «nunca lo aceptó»
- `evidence/alcance-recall-booleanos-2026-09-10.txt` — **la buena.** Booleanos
  con 0↔1, las seis familias, 44 de 45 campos vuelven y `m.afs.enabled` no
- `evidence/borrado-instantanea-2026-09-10.txt` — el borrado de una automática (**transcripción sin archivar**)
  nuestra, ejecutado contra el aparato


---

## La consola le devuelve el puntero a quien guardó — 2026-09-10

Salió de una auditoría que preguntó lo obvio: si guardar mueve
`var.currentSnapshot`, y el almacén confirmado ahora reconoce ese cambio como un
recall ajeno, **¿qué pasa cuando el que guardó es uno mismo?**

Medido con **una sola conexión**, que es la única forma de contestarlo:
`SAVESNAPSHOT`, y a los **172 ms** vuelve `SETS^var.currentSnapshot^<nombre>` por
esa misma conexión. Evidencia: `evidence/eco-del-puntero-2026-09-10.txt`

**Esto no contradice lo medido el 2026-09-08.** Ahí se midió que la consola no le
devuelve un `SETD` de parámetro a su autor, sobre `i.9.mute` y `i.9.mix`. Acá hay
dos diferencias que nadie había probado: es un `SETS`, y no es una escritura sino
el **efecto colateral de un comando**.

### Lo que rompía, y por qué importaba tanto

La aplicación guarda una instantánea **antes de cada escritura**, por INV-001.
Sin distinguir el eco propio, el arreglo de INV-021 hecho unas horas antes hacía
que **la aplicación se invalidara a sí misma en cada escritura**: el cartel
diría «alguien recuperó una instantánea en la consola» culpando a un operador que
no existe, `otroOperador()` informaría presencia inventada, y toda escritura
posterior saldría en conflicto. Un arreglo que rompía más de lo que arreglaba.

**Y no había forma de que los tests lo atraparan**, porque el doble de transporte
admite un solo oyente y se desengancha justo durante el guardado. La única
manera de encontrarlo era preguntarle al aparato.

El almacén ahora anota los punteros que provoca antes de mandar el comando, y los
reconoce al volver. Un recall ajeno sigue invalidando; un valor repetido no.
