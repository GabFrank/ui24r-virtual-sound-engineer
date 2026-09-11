# SPK-P0.9 — Concurrencia y presencia

**Estado:** Parcial — cinco criterios cerrados el 2026-09-10; **el 4 volvió a ⬜ el mismo día**, cuando una auditoría mostró que su celda celebraba las diez causas correctas y callaba las dos mitades del umbral que no se cumplen · **Timebox:** 3 días · **Control:** G-A
**Depende de:** SPK-P0.1 · **Bloquea a:** S-02.5b
**Montaje:** Ui24R, router, laptop con Node, navegador oficial abierto en otro equipo, teléfono con la aplicación oficial.

## Pregunta que responde

¿Se puede detectar de forma fiable que otro cliente cambió un parámetro, sin sobrescribir su cambio, y cómo se detecta que hay otra instancia de esta aplicación conectada?

## Pasos

1. Implementar un prototipo del almacén de estado confirmado alimentado solo por mensajes entrantes, con correlación por ventana temporal.
2. Ejecutar cien escrituras propias mientras un operador hace cien cambios desde el navegador oficial.
3. Recuperar una instantánea desde el navegador durante una escritura.
4. Arrastrar un fader en el navegador y observar la ráfaga.
5. Probar los dos mecanismos candidatos de presencia: el mensaje de sincronización con identificador propio, y una instantánea con nombre reservado renovada cada sesenta segundos.

## Criterios

| # | Criterio | Tipo | Umbral | Medido | Resultado |
|---|---|---|---|---|---|
| 1 | Cambios externos etiquetados correctamente | bloqueante | 100 de 100 | **100 de 100, contra la consola el 2026-09-10, con los cambios espaciados 400 ms.** El espaciado era de 120 ms y **se subió a propósito**: al cerrar el criterio 5 la agrupación quedó en 250 ms y esta prueba pasó de 100 a **1 de 100** en la misma corrida. Ver la nota de abajo: los dos criterios están en tensión y elegir es parte del spike. `evidence/agrupacion-arrastre-2026-09-10.txt` — **transcripción sin archivar**, ver la nota al pie. La corrida anterior, con el criterio 5 todavía sin cerrar, quedó en `evidence/concurrencia-2026-09-10.txt`, y se **remidió con la herramienta el 2026-09-11**: `evidence/concurrencia-2026-09-11.txt`, los tres criterios reproducen | ✅ |
| 2 | Sobrescrituras de cambios ajenos | bloqueante | 0 | **0, contra la consola el 2026-09-10.** El otro operador cambió la ruta y la aplicación intentó escribir con el valor esperado viejo: devolvió `CONFLICT` con «se esperaba 0.256 y hay 0.3, cambiado desde otro cliente» y **no escribió**. La ruta quedó con el valor ajeno | ✅ |
| 3 | Escrituras propias etiquetadas como propias | bloqueante | 98 % o más | **100 de 100 el 2026-09-10, todas por testigo.** Por correlación de mensajes entrantes era imposible —la consola no devuelve eco— así que se cumple por la vía que el charter recomendaba: todo lo que entra por la principal es ajeno **sin excepción**, y lo propio se marca al verificarse, sin deducir. Que no haya que deducir es lo que da el 100 %: no hay ventana que ajustar ni carrera que perder. `evidence/escrituras-propias-2026-09-10.txt`, remedido con la herramienta en `evidence/escrituras-propias-2026-09-11.txt`: 100 de 100 otra vez | ✅ |
| 4 | Recuperación de instantánea detectada como avalancha | bloqueante | 10 de 10, con más de 10 rutas en menos de 1 s | **Detectada 10 de 10 con causa `SNAPSHOT_RECALL` las diez veces** (`evidence/recall-diez-veces-2026-09-10.txt`). **Pero el umbral escrito pide dos cosas más y ninguna se cumple, y esto lo destapó una auditoría, no la corrida.** (a) «Más de 10 rutas»: el aviso informa **1**, porque el puntero llega primero y dispara solo — la ráfaga de escrituras sí supera diez, pero ésa da causa `DESCONOCIDA` y no es un recall. **Ninguna corrida sola satisface el enunciado.** (b) «En menos de 1 s»: **no se midió nunca.** La columna `ms` de la corrida de ráfaga es `Date.now() - t0` tomado después de un `setTimeout` fijo de 1400 ms, y por eso da 1400-1403 las diez veces (`evidence/avalancha-real-2026-09-10.txt`): **es la espera del guion publicada como si fuera una medición.** | 🟡 |
| 5 | Arrastre de fader agrupado como un único cambio externo | bloqueante | sí | **Sí, desde el 2026-09-10: de 40 escrituras, un solo aviso.** Antes eran 19 o 20 y **una sola pasada de fader ajena borraba el historial reciente** de la aplicación. Dos arreglos: la causa `FADER_DRAG` pasó a llamarse `GRUPO_DE_CANALES` —siempre detectó varios canales moviendo el mismo parámetro, no un arrastre— y los cambios sobre una misma ruta se agrupan en 250 ms, ventana que tiene que ser mayor que el tic de 34 ms de la consola. `evidence/agrupacion-arrastre-2026-09-10.txt` — **transcripción sin archivar**, ver la nota al pie | ✅ |
| 6 | Mecanismo de presencia elegido y verificado | bloqueante | uno de los dos, con prueba de dos clientes | **Elegido y verificado el 2026-09-10: se infiere del tráfico ajeno.** La consola no publica presencia —cero líneas al entrar o salir un cliente, ninguna clave movida— así que lo único que cuenta es quién **toca** algo. Prueba de dos clientes contra el aparato: con el volcado de ~6700 claves adentro **no inventa** un operador; con una escritura propia `APPLIED` **no se ve a sí misma**; con otro cliente escribiendo lo detecta a los 1467 ms. El límite está dicho en la API y no en la letra chica: **no ve al que solo mira**. Y el verde es del mecanismo: **`otroOperador()` no lo llama nadie todavía**, así que está verificado y sin conectar al producto. `evidence/presencia-dos-clientes-2026-09-10b.txt` | ✅ |

## Los criterios 1 y 5 están en tensión, y se eligió — 2026-09-10

Agrupar el arrastre —criterio 5— significa que dos cambios sobre la misma ruta
más juntos que la ventana se avisan como **uno**. Con la ventana en 250 ms, la
medición del criterio 1 con cambios cada 120 ms pasó de **100 de 100 a 1 de
100**: se rompió un criterio que se acababa de cerrar unas horas antes.

No se pueden tener los dos para cualquier ritmo. Se eligió:

- Medir el etiquetado con un ritmo que un operador produce de verdad —un cambio
  cada 400 ms, dos por segundo—, y ahí son 100 de 100.
- **No** pretender que cien cambios en doce segundos sigan contando de a uno.

**Lo que hace aceptable la elección es que se pierden avisos, nunca
conocimiento.** El estado confirmado se actualiza con cada línea, antes del
aviso y sin pasar por la agrupación. La comprobación de INV-011 —¿el valor sigue
siendo el que creo?— lee del estado y no del aviso, así que el **criterio 2 no
depende de esto en absoluto**. Hay un test que lo fija, y otro que fija el costo
para que no sea un descubrimiento.

## Lo que ya se midió, y a qué obliga — 2026-09-09

**Tres clientes simultáneos, con uno escribiendo.** Los tres recibieron **6 087 claves** y la **misma huella exacta**. La difusión llega **una sola vez a cada uno menos al origen**: 0 líneas para el que escribe, 1 para cada uno de los otros dos. La prueba duró minutos, no los diez que pide el criterio 5 de SPK-P0.1, así que allá sigue abierta; para este spike lo que importa es otra cosa.

**El criterio 3 no se puede cumplir como está planteado.** El paso 1 de este spike dice «almacén de estado confirmado alimentado solo por mensajes entrantes, con correlación por ventana temporal», y el criterio 3 pide que el 98 % de las escrituras propias se etiqueten como propias. Con esta consola, **el mensaje con el que se correlacionaría no llega jamás**. La ventana de 300 ms del `ConfirmedStateStore` espera algo que no existe, y ADR-005 ya lo tenía anotado como cabo suelto.

Quedan dos salidas, y elegir es parte de cerrar este spike:

1. **Etiquetar por lo que la aplicación ya sabe**: si acaba de enviar esa ruta con ese valor, es propia, sin esperar confirmación de nadie. Es local y no depende del protocolo.
2. **Etiquetar contra el testigo** de SPK-ACK-POLICY: la línea que llega por la conexión testigo y coincide con lo que la principal acaba de enviar es propia; cualquier otra es ajena. Cuesta lo que cuesta el testigo, que ya se paga igual para confirmar escrituras.

La segunda es la que además contesta el criterio 2 —no sobrescribir cambios ajenos— con un dato y no con una suposición, porque distingue propio de ajeno **en el mismo flujo** en vez de en dos relojes distintos.

**Y el mecanismo de presencia hereda un problema.** La aplicación pasa a tener **dos sesiones abiertas** contra la consola, la principal y el testigo. Cualquier mecanismo de presencia que cuente clientes o mire sesiones va a ver dos donde hay un operador. Si no las distingue, la aplicación se avisa a sí misma de un segundo operador que no existe y ensucia justamente la señal que protege contra pisar cambios ajenos. Está en el registro como R-27.

## Evidencia a entregar

- `evidence/concurrency-run.jsonl`, `evidence/bulk-detection.log`, `evidence/presence.md`.
- **Falta archivar** la corrida de tres clientes del 2026-09-09, con las claves, la huella compartida y el reparto 0/1/1 de líneas vistas.

## Acción ante fallo

Si no se puede detectar la ráfaga de forma fiable, la aplicación asistida queda condicionada: cada escritura exige confirmación humana del valor actual leído en pantalla, y el modo automático controlado no se habilita.


---

## La avalancha, contra la consola — 2026-09-10

El criterio figuraba cubierto por la captura `06-cambio-masivo.png`, y la
captura es correcta: la pantalla dibuja el aviso. Lo que probaba era eso.
**El simulador dispara la avalancha porque nosotros le pedimos que la dispare**,
así que la captura no dice nada sobre si el detector reconoce una avalancha real
llegando por el socket. Eran dos afirmaciones y el acta las tenía por una.

Ahora está medida la que faltaba. Hacen falta **dos clientes**: la consola no le
devuelve la escritura a quien la hizo, así que un proceso solo no puede
generarse una avalancha a sí mismo. El segundo hace de otro operador y escribe
16 rutas distintas de golpe —panorama, fader y dos envíos auxiliares de los
canales 21 a 24, que no tienen nada enchufado y están silenciados, así que nada
de esto puede sonar—. Diez vueltas, **diez avisos**, 16 de 16 rutas restauradas
y comprobadas por `GET /raw`. Evidencia: `evidence/avalancha-real-2026-09-10.txt`

### El detector dijo «10» las diez veces, y se escribieron 16

No es ruido de medición: es **exacto** las diez veces, y esa exactitud es la
pista. El aviso se emite en el instante en que se cruza el umbral, y lo que
informa es el tamaño del conjunto **en ese instante** — diez, que es el umbral.
Todo lo que llega después cae en la ventana de silencio y no actualiza el
número.

Para la seguridad da igual: el estado se invalida y INV-021 se cumple. Para el
operador no. La pantalla dice «10 parámetros cambiaron en menos de un segundo»
cuando cambiaron dieciséis, y el número existe justamente para que él dimensione
lo que pasó. **Un aviso que informa el umbral en vez del tamaño le está dando el
valor de su propia constante disfrazado de medición.**

Es un hallazgo del tipo que el simulador no podía dar: allí el número se lo
pasábamos nosotros, así que siempre coincidía. Queda anotado como tarea aparte y
no se corrige acá.

### Lo que sigue faltando, y por qué no se hizo

El criterio se llama «**recuperación de instantánea** detectada como avalancha».
Lo medido es una ráfaga de escrituras, que dispara el mismo detector por el
mismo camino pero **no** cambia `var.currentSnapshot` — por eso la causa salió
`DESCONOCIDA` y no `SNAPSHOT_RECALL`, que es lo correcto: no hubo ningún recall.

Hacer uno de verdad se puede: guardar una instantánea del estado de ahora en el
show `VSE`, mover unas rutas, y recuperarla — la propia recuperación sería la
restauración. Pero recuperar una instantánea es **la operación de mayor alcance
que expone el protocolo**, la aplicación no la manda nunca, y se haría sobre la
consola del usuario. Eso se pregunta antes, no se decide por él.


---

## No hay presencia por protocolo — 2026-09-10

Tres ciclos de un cliente entrando y saliendo, con un observador escuchando por
la conexión principal: **cero líneas difundidas** en los seis eventos, y
ninguna de las claves candidatas se movió. Evidencia: `evidence/hay-presencia-2026-09-10.txt`

`settings.maxconn` vale 48, así que la consola **sabe** cuántas conexiones
admite; simplemente no cuenta ni publica cuántas hay. `var.present` vale 0 y no
cambió con tres clientes entrando: no es lo que el nombre sugiere.

**Esto convierte el criterio en una decisión y no en una medición.** Las
alternativas que quedan sobre la mesa son de costo y alcance muy distintos:

| Camino | Qué ve | Qué cuesta | Qué NO ve |
|---|---|---|---|
| **Inferir del tráfico ajeno** | A quien *toca* algo | Nada: ya está medido que todo lo que entra por la principal es ajeno, y el testigo nunca escribe | Al que **solo mira** — y ése es justo el que se sorprende cuando la aplicación mueve un fader |
| **Un tablero en la consola** | A todos los que se anuncien | Escribir periódicamente una clave que no es de audio, y ensuciar el estado del usuario | A la interfaz web oficial, que no se anuncia |
| **Anuncio en la red, fuera de la consola** | A otras instancias nuestras | Descubrimiento en la red local | A la interfaz web oficial, que es el caso que importa |
| **Cambiar la pregunta** | «¿alguien tocó esto?», no «¿hay alguien?» | Nada: ya está cerrado y medido —0 sobrescrituras, 100 % de cambios ajenos etiquetados— | Nada que hoy se necesite; lo que se pierde es el aviso *anticipado* |

**El requisito nuevo lo cumple el primero por construcción**: nuestro testigo
escucha y no escribe nunca, así que toda escritura que llega por la principal es
de un tercero de verdad. No hay que distinguir nada — no hay nada nuestro que
confundir.


---

## El recall dispara el aviso, y la causa no llega nunca — 2026-09-10

Con el recall medido de verdad (ver SPK-P0.8, que lo ejecutó para otra
pregunta), el criterio 4 tiene por fin una respuesta — y la respuesta trae un
defecto.

**Lo que funciona.** Un `LOADSNAPSHOT` mueve 45 rutas y el detector avisa. La
avalancha se reconoce.

**Lo que no.** La causa sale `DESCONOCIDA` en vez de `SNAPSHOT_RECALL`, y el
motivo no es un umbral mal puesto: `RUTA_INSTANTANEA_ACTIVA` se compara dentro
de `registrarCambioReciente`, al que solo se llega desde `aplicar`, al que solo
se llega desde `procesarLinea`, que arranca con `if (m.tipo !== 'SETD') return`.
Y `var.currentSnapshot` viaja como **`SETS`**. La rama nunca se ejecuta.

La consola **sí** difunde el puntero: está comprobado, en cuanto el recall lo
cambia de verdad. El mensaje llega y el almacén lo tira.

**Lo grave no es la etiqueta de la causa.** INV-021 dice «cambio masivo **o**
cambio de `currentSnapshot`», y la segunda mitad existe por una razón que el
propio código explica: *«un recall desde el navegador de la consola cambia la
instantánea activa y después los parámetros que difieran: si difieren menos de
diez, la avalancha no se detectaba y el estado local seguía dándose por bueno
cuando ya no describía la consola. Es peor que la avalancha grande, porque un
recall chico es el que nadie nota.»*

Ese párrafo describe con exactitud lo que seguía pasando. **El comentario acertó
el diagnóstico y el arreglo no llegó a la ruta por donde entra el dato.** Y el
mismo día se midió que un recall difunde solo lo que cambió —45 rutas, 45
mensajes— así que un recall chico es, efectivamente, un puñado de mensajes por
debajo del umbral.

### Por qué los tests no lo vieron

Los cuatro tests de esta rama construían la línea con **`codificarSetd`**:
`SETD^var.currentSnapshot^3`. La consola manda `SETS^var.currentSnapshot^<nombre>`.
La rama funcionaba con la forma inventada y era inalcanzable con la real, así
que el archivo pasaba en verde probando algo que no ocurre. Es el mismo error
que dejó vivo un factor mil en la retención de picos: **una comprobación de
coherencia interna no puede ver un error de lectura de la fuente**. Ahora usan
`codificarSets`, y sin el arreglo fallan ocho.

### Arreglado y contado hasta diez

`procesarLinea` reconoce el `SETS` de esa ruta y el adaptador se la pasa. Contra
la consola: **diez recuperaciones, diez avisos, diez veces `SNAPSHOT_RECALL`**,
once instantáneas creadas y las once borradas, y cero claves distintas de como
estaban. Evidencia: `evidence/recall-diez-veces-2026-09-10.txt`

La primera comprobación del arreglo, con una sola recuperación, está en
`evidence/recall-causa-arreglada-2026-09-10.txt`. Vale la pena guardarla aparte
porque en esa corrida se arregló también **el instrumento**: el guion llamaba a
`aplicar` a mano para los números y descartaba los textos, o sea que reproducía
el mismo defecto que estaba midiendo. Un medidor que comparte el error del
programa lo confirma en vez de encontrarlo.

Una nota sobre el número que informa el aviso: en un recall vale **1**, porque
el puntero llega primero y dispara solo. No llega a la pantalla —el texto de
`SNAPSHOT_RECALL` no lo usa, dice «cambió la instantánea activa, así que
cualquier parámetro pudo moverse», que es lo correcto—. El caso donde el número
estaría más equivocado es justo el que no lo muestra.


## La presencia, elegida y verificada — 2026-09-10

Medido que la consola no ofrece ninguna, el usuario eligió **inferirla del
tráfico ajeno**: si llegó una escritura ajena hace poco, hay otro operador.

Cuesta cero porque todo estaba medido: lo que entra por la conexión principal
es ajeno **sin excepción** —la consola no le devuelve la escritura a quien la
hizo— y nuestra conexión testigo escucha y nunca escribe. El requisito que se
le agregó al criterio —distinguir el testigo propio de un segundo operador— se
cumple por construcción: **no hay nada nuestro que confundir**.

La ventana es de **30 segundos**, elegida y no medida. Una persona trabajando
toca algo cada pocos segundos; medio minuto cubre las pausas normales sin que
alguien que se fue siga figurando.

### Lo que no ve, dicho donde se lee y no en una nota al pie

`presente: false` significa **«nadie tocó nada últimamente»**, no «no hay
nadie». El operador parado frente a la consola mirando la pantalla es invisible
para esto — y es exactamente el que se sorprende cuando la aplicación mueve un
fader. Está escrito en `PresenciaAjena`, en el tipo que se usa, para que el que
lo consuma no pueda no verlo.

### Cómo se comprobó, y el paso que casi no prueba nada

Tres condiciones contra el aparato, con dos clientes: el volcado inicial no
inventa un operador; una escritura propia no se ve a sí misma; otra ajena se
detecta. Evidencia: `evidence/presencia-dos-clientes-2026-09-10b.txt`

La primera corrida **daba las tres por buenas y una era hueca**. El paso de la
escritura propia llamaba a `escribir` con un objeto, cuando toma tres
argumentos posicionales, y leía `estado` cuando el campo es `status`: imprimía
«undefined» y seguía. Lo que probaba era que **una escritura que nunca ocurrió**
no se ve — cierto, inútil, y con la misma cara que el resultado bueno. Ahora el
guion exige `APPLIED` antes de contar ese paso.

Queda archivada, en `evidence/presencia-dos-clientes-2026-09-10.txt`: es el
registro de un resultado que se veía bien y no lo era.


## Por qué el criterio 4 volvió atrás — 2026-09-10

Se había marcado ✅ y no correspondía. El enunciado pide **«10 de 10, con más de
10 rutas en menos de 1 s»**, y la celda contestaba solo la primera parte.

**Las rutas.** El aviso de un recall informa **1**, no 45. El puntero de
instantánea llega primero, dispara el detector con una sola ruta en el conjunto,
y las 44 que siguen caen en la ventana de silencio sin corregir el número. Antes
del arreglo decía 10 —el umbral—; ahora dice 1. **El número empeoró y se archivó
como criterio cumplido.**

La pantalla no lo muestra en esta rama, y eso es un atenuante real: el texto de
`SNAPSHOT_RECALL` dice «cambió la instantánea activa, así que cualquier parámetro
pudo moverse», que es lo correcto. Pero `rutasAfectadas` va al registro y es API
pública: una reconstrucción después de un incidente va a leer «1 ruta» sobre un
recall de 45.

**El tiempo.** Nunca se midió. La columna `ms` de `avalancha-real.ts` es el
resultado de un `setTimeout(1400)` del propio guion. Publicar una constante
nuestra en una columna llamada `ms`, al lado de un criterio cuyo umbral es un
tiempo, es exactamente la clase de número que este proyecto persigue: **parece
medido y no lo es.**

## Las evidencias que no pasaron por `medir.mjs`

Lo encontró una auditoría el 2026-09-10, y duele por dónde: `medir.mjs` había
entrado ese mismo día, justo para que no se pueda mirar una corrida y archivar
otra, y estas se archivaron **a mano**. Son **transcripciones**, que es la forma
exacta del error que la herramienta vino a impedir.

**Remedidas con la herramienta el 2026-09-11**, sobre el mismo canal 17 (`i.16`)
—silenciado, fader al fondo, sin envíos abiertos a auxiliares ni a efectos,
comprobado por HTTP antes de escribir— y con la restauración verificada después
por HTTP, que es un camino distinto del que escribió:

- `evidence/escrituras-propias-2026-09-11.txt` — criterio 3: **100 de 100**.
- `evidence/concurrencia-2026-09-11.txt` — criterios 1, 2 y 5, los tres reproducen.
- `evidence/cadencia-difusion-2026-09-11.txt` — el tic de ~34 ms reproduce exacto.

**Todavía transcripción sin archivar**, y por eso queda dicho acá en vez de
escondido: `evidence/agrupacion-arrastre-2026-09-10.txt` y
`evidence/testigo-en-el-tic-2026-09-10.txt` —transcripción—, remedido en `evidence/testigo-en-el-tic-2026-09-11.txt`: diez vueltas, la segunda escritura vista 10 de 10 y la primera 0 de 10. Sus guiones no están en el árbol, así
que remedirlas es escribirlos de nuevo. Hasta entonces, lo que sostienen se lee
con esa advertencia puesta.
