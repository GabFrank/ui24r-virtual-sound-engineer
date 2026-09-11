# Invariantes de seguridad

**Versión 1.2.** Estas 34 invariantes son la suite de aceptación de seguridad del proyecto (ADR-011). Cada una tiene enunciado verificable y la versión desde la que aplica. El objetivo es que todas tengan además test unitario y test contra hardware real: la sección de abajo lleva la cuenta de dónde estamos, y ningún test contra hardware existe todavía.

**Ninguna historia que escriba en la consola o reproduzca audio se cierra sin su rebanada de la suite en verde.** Cada test lleva el identificador de su invariante en el nombre.

El generador de señal es el reproductor de la consola (ADR-002); las invariantes originales del retorno de análisis quedan reservadas para la épica opcional posterior.

**Definiciones comunes**
- *Store VALID:* `ConfirmedStateStore` alimentado por `inbound$`, con conexión CONNECTED ininterrumpida desde el último volcado completo y sin `BulkExternalChange` posterior.
- *Ventana de generación:* intervalo entre el `MEDIA_PLAY` de una transacción de generación y su `MEDIA_STOP` confirmado.
- *PLAYER_RESERVE:* transacción System que guarda y luego restaura el estado completo del Player (mute, fader, pan, sends a todos los buses, pista cargada).
- *Incidente de seguridad (para pruebas de campo):* write fuera del pipeline, change UNVERIFIED sin aviso visible, invariante violada en el log, audio no solicitado en el PA reportado por el usuario, transacción en APPLYING > 10 s, o E-Stop usado por necesidad.

## Estado de implementación

Cubiertas por test unitario, en `packages/safety`, `packages/domain`,
`packages/mixer-adapter`, `packages/logging` y `packages/updater`:
INV-001, INV-002, INV-003, INV-004, INV-005, INV-006, INV-007, INV-008,
INV-009, INV-010, INV-017 (**solo la cláusula del hueco entre tramas, y sobre
`RTA` con 300 ms fijos, no lo que decía el texto**: la del percentil 95 no la
calcula nadie, y vaciar la cola y suspender transacciones tampoco está
implementado), INV-019 (bloqueo, lista blanca, y presencia
y tamaño del botón en el recorrido automático), INV-020 (**solo contra un
diario en memoria**: no hay implementación persistente), INV-022
(formato, sumidero persistente y rotación; la rotación se acota por número de
eventos y no por sesiones, ver `docs/logging.md`), INV-021 (**solo la
invalidación del estado y el aviso**: abortar transacciones e invalidar las
mediciones «antes» no cerradas no lo hace nadie, y está diferido a MVP4a en la
tabla — el calificativo faltaba acá), INV-024, INV-025, INV-034
(con la cláusula de transacción en curso todavía sin llamador, ver el cuadro
de abajo).

Pendientes de hardware, se cierran con su spike: INV-012 a INV-016 y INV-026
(generador, dependen de SPK-P0.6' y SPK-SAFE-GEN), INV-018, INV-023, INV-027 a
INV-033.

**INV-011 tiene su texto normativo desde el 2026-09-10**, en
[ack-policy](ack-policy.md): qué se comprueba antes de escribir, el plazo de
500 ms y de dónde sale, los cuatro confirmadores en orden, por qué `ECHO` no es
alcanzable, **qué es lo que una confirmación no dice**, y qué pasa si el testigo
se cae en medio de una transacción. La tabla parámetro a método está medida: 18
rutas barridas contra la consola, 18 de 18 difundidas.

Lo que falta es la prueba en banco de la fila —cambiar desde la web durante un
apply— y no la decisión ni el texto.

Ninguna invariante se marca como cerrada por pasar contra el simulador: el
simulador reproduce nuestras hipótesis del protocolo, no la consola.

**Cláusulas que estaban declaradas y no las aplicaba nadie.** Se corrigieron
todas en la misma tanda, después de una auditoría que encontró cinco casos del
mismo patrón —la invariante escrita, probada y muerta— que ya se había visto
con INV-034:

- **INV-001** comprobaba que la referencia a la instantánea no fuera nula, no
  que la instantánea existiera. El campo `existenciaVerificada` estaba
  declarado y no lo escribía ni lo leía nadie. Ahora el ejecutor relee la lista
  de la consola antes de aplicar, y el segundo escenario del enunciado —borrar
  la instantánea entre guardarla y aplicar— por fin se detecta.
- **INV-008 e INV-010** están enunciadas sobre rutas, pero el motor decidía con
  la clase que declaraba quien proponía el cambio. Un envío a un auxiliar de
  monitor etiquetado como fader de canal pasaba. Ahora `clasificarRuta` deriva
  la clase de la ruta y el motor rechaza cuando no coinciden, o cuando la ruta
  no se reconoce.
- **INV-004**, cláusulas de Q mínimo en salidas y realce máximo de sala: las
  constantes existían en el dominio y ninguna regla las consultaba.
- **INV-004**, tope acumulado: sumaba magnitudes en vez de desplazamiento neto,
  así que bloqueaba justamente el movimiento que devuelve el parámetro hacia su
  valor inicial.
- **INV-019**, lista blanca: estaba escrita y el motor rechazaba todo con el
  paro activo, incluido un retroceso. Funcionaba porque el retroceso no pasaba
  por el motor, que no es lo mismo que estar permitido.
- **INV-034**, cláusula de transacción en curso: la señal existía en la
  aplicación y **nadie la ponía en `true`**, así que la parte de la invariante
  que impide actualizar en medio de una escritura no se disparaba nunca. Ahora
  lo avisa el ejecutor de transacciones, que es quien sabe cuándo hay una, y el
  aviso se apaga en un `finally` — un aviso pegado dejaría la aplicación sin
  poder actualizarse nunca y nadie sabría que está pegado. `SafetyService`
  arma el ejecutor ya conectado, para que no se pueda armar uno que se olvide.
**Lo que existe y todavía no tiene quien lo llame.** La auditoría señaló que
arreglar «la constante que nadie consulta» agregando «la función que nadie
llama» mueve el problema un nivel, no lo cierra. Es cierto, y hay tres casos
vivos. Se listan acá en vez de dejarlos implícitos:

| Qué | Quién debería llamarlo | Por qué todavía no |
|---|---|---|
| `snapshotsABorrar` (INV-003) | quien cree instantáneas | Nada las crea: depende de MVP4a y de SPK-P0.8 para listarlas. |
| `busDeAnalisis` de `clasificarRuta` (INV-008) | el motor de seguridad | Cuál auxiliar es el bus de análisis lo dice SPK-P0.5. Sin ese dato, `ANALYSIS_BUS_SEND` no es derivable y ningún envío es escribible — el lado seguro. |
| Un límite de INV-004 para los parámetros de sistema | — | Ninguna transacción de sistema puede pasar el motor: INV-004 rechaza todo parámetro sin límite declarado, y ni el mute de bus, ni la reserva del reproductor, ni el envío al bus de análisis tienen uno. Inventarles un tope para que la exención de INV-005 «funcione» sería un número sin evidencia con forma de regla. Lo fija el spike que caracterice cada uno. |
| `SafetyService.crearEjecutor` (INV-034) | quien aplique una transacción | La aplicación no escribe en la consola. Mientras tanto `transaccionEnCurso` es `false` siempre, igual que antes del arreglo. |

La diferencia con el patrón anterior es que la política está escrita y probada
en vez de ser un número suelto, y que este cuadro dice dónde falta el cable.

- **INV-005**, la exención que se pedía diciendo que se la merecía:
  `tipoDeOperacion` es una cadena libre que provee quien propone la
  transacción, y nada la cruzaba con lo que la transacción de verdad tocaba.
  Poner `'ANALYSIS_BUS_SELECT'` subía el máximo a infinito y bajaba el ritmo a
  veinte milisegundos aunque los cambios fueran ocho faders de canal — y el
  propio test que se escribió para la exención hacía exactamente eso. Ahora la
  concesión se deriva de las clases **reales**, las que salen de la ruta, y la
  declaración se comprueba en vez de creerse.
- **INV-005**, el ritmo y la exención de las transacciones de sistema: octavo
  caso del patrón. `PACING_MS` estaba escrita en el dominio y **no la importaba
  ningún código de producción** —el ejecutor llevaba un 100 a mano y nunca
  bajaba a 20—, y el único test que la usaba comprobaba que dos literales del
  mismo archivo guardaran entre sí la relación que el propio archivo escribió,
  que es una tautología y no una conducta. La exención del límite de cuatro
  parámetros ni siquiera se podía expresar: el máximo se resolvía solo por nivel
  de autonomía, así que una selección de bus de análisis —veinticuatro envíos—
  se rechazaba entera. Ahora las dos salen de `pacingMs()` y
  `maximoDeParametros()`, que derivan la condición **del tipo de operación** y no
  de una bandera que quien propone pueda encender: pedir la exención no puede
  ser tan fácil como decir que se la merece.
- **INV-001**, la trampa que quedó: el arreglo puso la relectura en el ejecutor
  y dejó vivas dos cosas que decían implementar la invariante y no lo hacían.
  `Snapshot.existenciaVerificada` no lo escribía ni lo leía nadie, y
  `puedeAplicarse` seguía comprobando que la referencia no fuera nula —
  literalmente el defecto que el enunciado describe—, exportada y con test
  propio. Ahora `puedeAplicarse` recibe la instantánea y exige que exista, que
  se llame como la referencia y que su existencia esté verificada.
- **INV-034**, el aviso que se apagaba temprano, otra vez y un nivel más arriba:
  el contador quedó **por instancia del ejecutor**, y `SafetyService.crearEjecutor`
  devuelve uno nuevo en cada llamada que escribe la misma señal con un `set`
  booleano. Dos ejecutores —que es la forma natural de usar una fábrica— y el
  paso por cero del primero apagaba el aviso con el segundo escribiendo: el
  mismo fallo que el contador había cerrado abajo, reintroducido arriba. La
  cuenta vive ahora en `SessionStateService`, donde está la señal.
- **INV-021**, la relectura que no releía: `releerEstado()` despejaba el cartel
  sin esperar el volcado. `conectar()` resuelve al abrir el socket, y lo que
  devuelve el estado a válido es el `DUMP_END` que llega después: si no llegaba,
  el usuario quedaba sin cartel, sin poder escribir y sin nada que se lo dijera.
  Y la comprobación que decía cubrirlo miraba la ausencia del cartel, que la
  propia función apaga sin mirar nada — pasaba con `releerEstado()` vaciado a
  `return;`. Ahora se espera el volcado, y la comprobación mira si el estado
  volvió a estar confirmado, que es lo que INV-017 exige para escribir y que
  hasta ahora no se veía en ninguna pantalla.
- **INV-021**, la relectura: la invariante dice «store INVALID **hasta
  re-lectura**» y la segunda mitad de la frase no existía. Lo único que
  devolvía el estado a válido era el volcado completo, que la consola manda
  sola al conectar; el cartel decía «hasta releerlo» y su botón decía
  «Entendido». Un recall desde el navegador de la consola dejaba el estado —y
  con él la posibilidad de escribir— muerto por el resto del show. Ahora hay
  `releerEstado()`, que reconecta: **no** pide el volcado, porque no hay
  mensaje verificado que lo pida, y usa lo único que el protocolo ya demostró
  hacer.
- **INV-034**, el aviso que se apagaba antes de tiempo: `conActividad` era un
  interruptor y no un contador, así que con dos transacciones solapadas el
  final de la primera apagaba el aviso con la segunda todavía escribiendo. El
  arreglo anterior se ocupó de que el aviso no quedara *pegado* y no de que no
  se apagara *temprano*, que es el mismo fallo por el otro lado.
- **INV-021**, cláusula del cambio de instantánea: la detección solo miraba el
  conteo de rutas, y la invariante dice «cambio masivo **o** cambio de
  `currentSnapshot`». Un recall desde el navegador de la consola cambia la
  instantánea activa y después los parámetros que difieran: si difieren menos
  de diez, no se detectaba nada y el estado local se seguía dando por bueno.
  Es peor que la avalancha grande, porque un recall chico es el que nadie nota.
  La causa probable, además, estaba fija en `SNAPSHOT_RECALL` —también cuando
  no había ninguna instantánea de por medio—, y es lo que decide qué conviene
  hacer. Ahora se deduce, y se corrige si la instantánea llega después de los
  parámetros que movió: la consola no promete un orden.
- **INV-003**, retención: `MAX_SNAPSHOTS_AUTOMATICAS = 20` estaba escrita y no
  la consultaba nadie, así que la retención existía como número en un archivo.
  Ahora `snapshotsABorrar` decide qué borrar y, sobre todo, qué no: nunca una
  instantánea ajena, nunca una `VSE_` que no sea automática, y nunca una cuyo
  nombre no se pueda fechar —sin poder ordenarla no se sabe si es la más vieja,
  y conservar de más es el error barato.

**INV-019, parte de interfaz.** El bloqueo de escrituras y la lista blanca
tienen test unitario. La *presencia* y el *tamaño* del botón los comprueba
`tools/visual/flujo.mjs`, que abre un diálogo modal y verifica que el paro siga
siendo alcanzable y mida al menos 64 px — la comprobación se agregó porque no
era alcanzable: un `dialog` abierto con `showModal()` tapaba el botón flotante.

El umbral de esa comprobación estuvo en 44 px, **por debajo de la propia
invariante**, y por eso aprobaba el paro del diálogo, que medía 48. Se había
corregido un caso de 60 px argumentando que «cuatro píxeles no valen debilitar
una invariante de seguridad» y se dejó pasar uno de dieciséis, en el único paro
alcanzable con un modal abierto. Una comprobación más floja que la regla que
dice comprobar no comprueba.

La presencia en todas las pantallas todavía no se verifica automáticamente: el
recorrido solo pasa por las que están en su camino.

## El estado en que quedó la consola de pruebas — 2026-09-10

**Esto no es una invariante, es el registro de lo que se dejó tocado en el
aparato del usuario.** Existe porque una nota que dice «se cruzó una invariante»
y no dice cómo quedó la consola no cumple su función.

| Qué | Cómo quedó | Por qué |
|---|---|---|
| `hw.8.phantom` (canal 9) | **encendido** | El Behringer B2 sin fantasma no entrega nada. Se cruzó INV-007 a mano, desde un spike y **no desde la aplicación**, con el usuario fuera de la sala y autorizándolo. Era seguro: es un condensador que lo necesita, no hay ningún micrófono de cinta, y se bajó el general antes de conmutar |
| `hw.13.phantom` (canal 14) | **conmutado cuatro veces y devuelto** | **Esto NO estaba autorizado y no debió pasar.** El guion `tools/spikes/p0-8/alcance-recall.ts` incluyó la alimentación fantasma entre los campos que mueve para medir el alcance de una recuperación, y se corrió cuatro veces. Su comentario afirmaba que el previo elegido «no tiene nada enchufado» y **nunca lo comprobaba**: `i.13.src = hw.13`, o sea que ese previo alimenta un canal patcheado. El mismo día, el guion hermano de P0.2a **se negó explícitamente** a escribir fantasma citando INV-007, así que la regla estaba clara y presente. Lo encontró una auditoría, no yo. Quedó restaurado —los cuatro volcados completos coinciden con el inicial— y el guion ya no la toca |
| `i.8.mute` (canal 9) | **en silencio** | **A propósito y es lo que protege el equipo**: hay un condensador enfrentado a un monitor a 1,7 m, o sea un lazo montado. Ese silencio es lo único que hoy impide el acople |
| Filtros automáticos del supresor | **borrados** | Los cinco que plantaron los tonos de prueba, más los que hubiera. Se limpiaron con `m.afs.clearlive` |
| Filtros fijos del supresor | **199,98 Hz a −6 dB y 1000 Hz a −18 dB** | El usuario autorizó borrarlos y **no se pudo por protocolo** —cuatro intentos archivados—. El de 1000 Hz probablemente sea nuestro, de la sesión del 2026-09-08 |
| Todo lo demás | restaurado | Ganancia y fader del canal 10, general, fuente del analizador, `m.afs.enabled` y los tres disparadores de borrado. **Comprobado releyendo por HTTP**, que es un camino distinto del que escribió |

Evidencia: `spikes/SPK-P0.5/evidence/fantasma-canal9-2026-09-10.txt`,
`.../limpiar-afs-2026-09-10.txt` y `.../borrar-fijos-2026-09-10.txt`.


| ID | Invariante | Test | Desde |
|---|---|---|---|
| INV-001 | Ninguna transacción pasa a APPLYING sin `snapshotRef` verificado en la lista de snapshots re-leída. **El punto de retorno tiene una excepción medida y hay que decirla: un `LOADSNAPSHOT` devuelve 44 de 45 campos y el que no devuelve es `m.afs.enabled`**, la supresión de realimentación (SPK-P0.8, 2026-09-10). O sea que la promesa de «se puede deshacer» **no cubre el supresor**. Hoy no es explotable porque la aplicación no lo escribe, pero el día que lo haga —las mediciones acústicas piden apagarlo, porque mete filtros de −18 dB por su cuenta— la instantánea no lo va a devolver. **Y hay una segunda clase, que son los «safe»**: cincuenta claves en esta consola —24 canales, 10 auxiliares, 6 subgrupos, 4 efectos, 2 del reproductor, 2 de línea, el general y `var.unsaved.chsafes`— con las que el operador le dice a la consola «esto no me lo muevan». Desde el 2026-09-11 la aplicación **las lee y las informa** (`fueraDelPuntoDeRetorno`), con una distinción que hay que respetar: que `m.afs.enabled` no vuelva **está medido**; que un safe impida la restauración **no** — el manual técnico dice que su alcance exacto, las prioridades de recuperación y la persistencia ante un corte «necesitan ensayos sobre una copia de show». Se informa qué está marcado, no qué va a pasar. Nombre `VSE_AUTO_<ms desde epoch>` en show `VSE` — la marca va en milisegundos y no en formato legible porque la retención de INV-003 lee la fecha de ahí para decidir qué borrar, y un nombre que no se puede fechar es uno que no se borra nunca. `nombreSnapshotAutomatica` y `fechaDeSnapshotAutomatica` son inversas, con test. | Unit + HIL: aplicar sin snapshot → rechazado; borrar snapshot entre save y apply → abortada. | MVP4a |
| INV-002 | Cada `Change` guarda `previousValue` leído de consola. Rollback restaura ese valor exacto y lo verifica por lectura. | HIL: 100 writes aleatorios + rollback → 100/100. | MVP4a |
| INV-003 | La app solo crea/borra nombres con prefijo `VSE_`. Retención máx. 20 automáticos. Snapshots no-VSE nunca se modifican. | Unit: `packages/domain/test/snapshots.test.ts` -- la política de retención decide qué borrar y nunca devuelve una instantánea ajena, una `VSE_` no automática, ni una que no se pueda fechar. HIL pendiente: hash de snapshots no-VSE idéntico tras 200 operaciones, cuando SPK-P0.8 permita listarlas. | MVP0 |
| INV-004 | Delta máximo por transacción: fader ±3 dB; gain ±3 dB; EQ ±3 dB (salida) / ±4 dB (entrada), Q ≥ 0,7 en salidas; HPF ≤ 1 octava; delay ≤ 5 ms; master ±1 dB y nunca por encima del máximo previo de la sesión. **Tope acumulado por parámetro y sesión** respecto al valor inicial: fader ±6, gain ±6, EQ ±6 por banda, HPF ≤ 2 octavas, delay ≤ 10 ms. Una nueva transacción sobre el mismo parámetro solo es elegible si existe una `Measurement` posterior a la anterior. **La cláusula «Q ≥ 0,7 en salidas» no se puede cumplir en esta consola, y hay que decirlo: su ecualizador de salida es un GRÁFICO de 31 bandas por lado (`m.eq.peak.l.0`…`.30`), sin factor de calidad.** El guardia del motor es `if (c.q !== undefined && …)`, así que sobre un gráfico no se dispara nunca — la forma nueva de «la constante que nadie consulta». El peligro que la cláusula quiere evitar, un realce estrecho sobre el sistema, en un gráfico lo acota `REALCE_MAXIMO_SALA_DB`, que sí se consulta. Se conserva para un paramétrico de salida, que la Ui24R no tiene. | Unit: 3 transacciones consecutivas de +3 dB sin Measurement intermedia → la tercera rechazada con `CUMULATIVE_CAP`; HIL: asserts sobre comandos. | MVP0 (recomendaciones), MVP4a (writes) |
| INV-005 | ASSISTED ≤ 4 parámetros por transacción; CONTROLLED AUTO ≤ 1; writes secuenciales ≥ 100 ms con confirmación del anterior. **Transacciones System** (Analysis Bus, PLAYER_RESERVE, mutes de componente, calibración) están exentas del límite de 4, con pacing ≥ 20 ms y verificación por lectura del conjunto completo ≤ 1 s tras el último write. | Unit + log; SPK-P0.5 mide el tiempo real. | MVP1 |
| INV-006 | Preamp gain solo escribible en `SessionState = CHANNEL_SETUP`; bloqueado en FULL_BAND, SHOW, ROOM_*, MIX, SOUNDCHECK_* y mientras exista un `VirtualSoundcheckTake` activo. | Unit: matriz estado × parámetro. | MVP4a |
| INV-007 | La app nunca escribe phantom (read-only en MixerDomainAPI). El Setup Wizard exige confirmación "Input 2 por TRS". | Estático + UX test. | MVP1 |
| INV-008 | Únicos routings escribibles: sends hacia el Analysis Bus; mute/fader/sends de Player L/R dentro de PLAYER_RESERVE; mute de buses ∈ `PAProfile.outputBuses` durante medición por componente (transacción System con restauración). **Desde MVP4b y solo en ASSISTED:** filtros PEQ/GEQ (gain, freq, Q) y HPF de los buses de `PAProfile.outputBuses`. Fader, mute fuera de medición, delay, polaridad y limiter de esos buses, y todo AUX de monitor, matrix y mute de inputs: read-only. **La lista blanca comparaba rutas completas contra una ruta inventada.** Hasta el 2026-09-11 el único test donde el motor aprobaba una escritura de sala declaraba `busesDeSalidaPermitidos: new Set(['m.eq.b1.gain'])`, con igualdad exacta. Esa ruta no existe: el ecualizador del general son **setenta claves**. Ahora el perfil declara **buses** y `prefijosPermitidos` traduce a prefijos, contrastados contra las 6732 claves del inventario. | Estático: paths escribibles de salida ⊆ {`m.eq.*`, `a.B.eq.*` para B ∈ PAProfile} + unit. | MVP1 |
| INV-009 | Fader master nunca > 0 dB y nunca escrito en MVP0–MVP3. | Unit. | MVP0 |
| INV-010 | Ningún AUX marcado como monitor recibe writes, con una única excepción: sends de Player L/R hacia AUX de monitor, únicamente hacia −∞ y solo dentro de PLAYER_RESERVE/restauración. | Estático: paths escribibles ∩ paths de AUX monitor = {`p.0.aux.*.value`, `p.1.aux.*.value`}; motor rechaza valor > −∞ salvo en restauración. | MVP1 |
| INV-011 | Toda escritura va precedida de `currentValue == expectedValue` leído del store en estado VALID; si el store está INVALID o difiere → CONFLICT, transacción en estado CONFLICT, sin write. Tras write: confirmación esperada ≤ 500 ms **por la segunda conexión testigo** (ADR-024), `confirmedBy ∈ {WITNESS, VU, TIMEOUT, NONE}`. **`ECHO` no es alcanzable**: está medido que la consola no le devuelve nada a quien escribe, y el tipo del código ya lo prohíbe. Cuando no hay testigo: VU válido para **fader y ganancia** —no para silencio— con señal presente (**VU2 ≥ −50 dB**). **Corregido el 2026-09-10, de una auditoría: decía «fader/mute/gain» y «−60 dB», y ninguno de los dos números era el que corre.** El silencio queda afuera **a propósito**: un `mute` no mueve el medidor de entrada de forma proporcional a lo pedido, así que el medidor no puede confirmarlo — sin testigo se rechaza, que es el lado seguro. El piso es `NIVEL_MINIMO_PARA_CONFIRMAR_DB = −50` — **implementado el 2026-09-09** en `confirmarPorMedidor`, que exige que el nivel se mueva en la dirección correcta y al menos la mitad de lo pedido, porque parecerse al cambio esperado no alcanza: con 1 dB pedido y 1,5 de tolerancia, quedarse quieto entraría; el resto continúa en ASSISTED con `confirmedBy = TIMEOUT` y aviso "no verificable" por change; en CONTROLLED AUTO todo parámetro sin confirmación del testigo ni VU es inelegible. | HIL: cambiar desde web durante apply → 100 % CONFLICT. | MVP4a |
| INV-012 | El Player L/R solo es controlado por la app tras el paso explícito "Reservar Player para VSE" del Setup Wizard: (a) se lee y guarda el estado completo del Player como PLAYER_RESERVE; (b) se muestra al usuario qué cambiará y se exige confirmación; (c) se fuerza mute ON, fader −∞ y sends a AUX de monitores −∞. Si el Player está reproduciendo al conectar, la reserva se rechaza y el generador queda NO DISPONIBLE. Al cerrar sesión o liberar, se restaura y verifica por lectura. Watchdog: mientras está reservado, si mute/fader/sends cambian fuera de ventana de generación → restaurar ≤ 300 ms + alerta. | HIL: reservar con sends a AUX 1 y 2 → al liberar, hash idéntico; desmutear desde web → restauración medida. | MVP1 |
| INV-013 | Precondiciones para reproducir cualquier señal: PLAYER_RESERVE activo; archivo con checksum válido y tope −12 dBFS; sends Player→monitores = −∞ verificados; sends Player→Analysis Bus y →master según modo; fader del Player dentro del rango operativo (INV-015); E-Stop no armado; test de aislamiento del bus (INV-016) vigente; cuenta regresiva 3 s visible y audible. | Unit: matriz de precondiciones, cada una falsa → no se envía `MEDIA_PLAY`, se muestra la precondición y se registra; HIL. | MVP1 |
| INV-014 | Al terminar, cancelar, perder foco, perder USB o perder red: `MEDIA_STOP` con confirmación ≤ 500 ms y mute de Player L/R; sin confirmación → 3 reintentos + alerta sonora/visual persistente. **Abort por ausencia de referencia:** si ≤ 1,5 s tras `MEDIA_PLAY` Input 2 no muestra energía correlacionada con la señal (> −50 dBFS en la banda del estímulo) → `MEDIA_STOP` y "ruta de referencia rota". | HIL: desconectar USB y Wi-Fi en medio de sweep; send Player→Analysis a −∞ a propósito → stop ≤ 2 s 10/10. | MVP1 |
| INV-015 | Señales: pre-roll de pink desde −40 dBFS con rampa 6 dB/s hasta el nivel nominal (4,7 s) + 1 s estable + señal útil a nivel constante (tope −12 dBFS); duración total ≤ 30 s. **Nivel operativo:** fader del Player (owner System) parte de −30 dB en el primer uso por `VenueProfile`; sube en pasos de +6 dB solo con acción explícita (hold 1 s) durante pre-roll; el nivel aceptado se guarda en `PAProfile.generatorFaderDb` y nunca se supera automáticamente. Con SPL calibrado: límite 95 dB SPL Z Leq(1 s), abort ≥ 98. Sin SPL calibrado: tope del fader del Player = −10 dB y aviso "sin techo acústico" permanente. Abort si Input 1 > −3 dBFS desde el primer sample. | Unit: envolvente RMS del WAV monótona en pre-roll y constante ± 0,5 dB en señal útil; HIL: con `generatorFaderDb = −18` ninguna transacción envía `p.N.mix` > −18 dB. | MVP1 |
| INV-016 | Test de aislamiento del bus ANALYSIS: antes de la primera medición de la sesión y tras cada cambio de Setup, pink a nivel de pre-roll (−40 → −30 dBFS) enviado solo al Analysis Bus (Player→master −∞, Player→monitores −∞) durante 3 s; si la correlación cruzada normalizada Input 2 ↔ Input 1 > 0,3, el bus está llegando al PA o a monitores → abort y bloqueo de Setup. | HIL: patchear el AUX ANALYSIS a un monitor a propósito → detección 10/10; patch correcto → 0 falsos positivos en 10/10. | MVP1 |
| INV-017 | En UNSTABLE/RECONNECTING/DISCONNECTED: cola de writes vaciada, transacciones APPLYING → SUSPENDED, generador detenido (INV-014). UNSTABLE = hueco entre tramas **`RTA`** mayor que **300 ms**. **Corregido el 2026-09-10, de una auditoría: este texto decía `VU2` y un umbral derivado, y ninguna de las dos cosas es la que corre.** Se vigila `RTA` y no `VU2` porque **`VU2` se calla en silencio** —la consola manda una trama cada 30 s sin señal—, así que un umbral sobre `VU2` declararía inestable cualquier pausa entre canciones; está derogado en `protocol-spec.md` desde que se midió. Y el umbral es **300 ms fijos** —ocho tramas perdidas del analizador—, elegido sobre los 99 ms que daba la fórmula del charter: sobre `RTA`, 99 ms serían tres tramas y quedaría sensible a cualquier hipo de la wifi. **La cláusula del percentil 95 no la calcula nadie**, y la otra mitad de la invariante —vaciar la cola y pasar las transacciones a SUSPENDED— **tampoco tiene implementación**: lo único que ocurre es que `connection.state.ts` baja `_storeValido`. | HIL: `tc netem loss 10%` y `delay 200ms` en el router → UNSTABLE ≤ 5 s en 10/10. | MVP0 |
| INV-018 | Al reconectar: cola vacía (assert), estado completo re-leído, diff mostrado, transacciones SUSPENDED requieren decisión humana. | HIL: 20 ciclos. | MVP0 |
| INV-019 | Emergency Stop: local ≤ 200 ms sin red (detener generador local, cancelar automatización, bloquear writes salvo lista blanca {MEDIA_STOP, MTK_STOP, mute Player L/R, ROLLBACK, restauración PLAYER_RESERVE/mutes de componente}); remoto con confirmación/reintento (MEDIA_STOP, MTK_STOP, mute Player); rearme explícito con re-lectura total; botón ≥ 64 px visible en el 100 % de pantallas y modales; no mutea master ni canales. | UI test automatizado que recorre todas las rutas + HIL cronometrado. | MVP0 |
| INV-020 | Journal write-ahead persistido antes de cada write. Al reiniciar: transacciones APPLYING/VERIFYING detectadas, estado real leído, diff mostrado, opciones rollback/aceptar. Nunca reaplicar. | Kill de proceso durante apply ×20. | MVP4a — hoy solo contra `DiarioEnMemoria`: no hay implementación persistente, así que lo que la invariante protege (sobrevivir a una caída) no está probado. |
| INV-021 | Cambio masivo (> 10 paths distintos en < 1 s) o cambio de `currentSnapshot` → invalidación global: abortar transacciones, invalidar Measurements "before" no cerradas, store INVALID hasta re-lectura, avisar. Rollback por change deshabilitado si la base cambió; solo por snapshot con confirmación. | HIL: recall desde web durante transacción. | MVP0 (detección), MVP4a (abortar) |
| INV-022 | Cada write registra ts, transacción, parámetro, expected, previous, sent, ack, verified. Log en el almacén, export desde la interfaz. **La rotación se acota por número de eventos (5000) y no por sesiones**: lo que hay que acotar es el espacio en la tablet, y «30 sesiones» no dice cuánto ocupa. Nada relaciona todavía las dos cifras — ver `docs/logging.md`. | Unit + inspección. | MVP0 |
| INV-023 | Ninguna transacción CONTROLLED AUTO se cierra como KEEP sin `measurementAfterId`. Tolerancia = max(2·σ_roomScore medida en SPK-REPEAT para ese `VenueProfile`, 2 puntos); KEEP requiere además que la desviación RMS al target baje ≥ 0,5 dB; si no, REVERT automático y verificado. Sin SPK-REPEAT para la sala, el closed loop no está disponible. | Unit con σ sintética. | MVP4b |
| INV-024 | Solo `confidence == HIGH` (definición por dominio en S-02.4) es `autoEligible`. LOW/INSUFFICIENT → solo Observation. | Unit. | MVP4b |
| INV-025 | Todo apply en ASSISTED requiere acción explícita (hold 1 s o doble confirmación); sin auto-aceptación por timeout. | UI test. | MVP4a |
| INV-026 | Ninguna salida de audio de Android participa en la cadena hacia el PA. Verificación: notificación sonora disparada durante reproducción del Player → Input 2 sin contenido correlacionado (< −90 dBFS). Scarlett OUT solo dentro del wizard LOOP (INV-030). | HIL en P0.6' y en cada release. | MVP1 |
| INV-027 | Si el tono de referencia en Input 2 difiere > 1 dB del calibrado (o el nivel del loop test en Input 1 difiere > 1 dB del calibrado, si hay SPL), toda medición nueva se marca `calibrationState = INVALID` y la UI lo muestra. | HIL: mover potenciómetro. | MVP1 |
| INV-028 | Durante medición por componente de PA: solo se mutean buses ∈ `PAProfile.outputBuses` con `muteable = true`; cualquier bus con sends de monitor activos es rechazado; un mute nunca permanece > 120 s sin re-confirmación del usuario (auto-restauración verificada); la UI muestra en todo momento la lista exacta de buses muteados por la app; ante pérdida de red o E-Stop, todos restaurados (con confirmación) o el usuario ve exactamente qué buses siguen muteados. Nunca un estado parcial silencioso. | HIL: cortar red con LEFT muteado; esperar 120 s. | MVP3 |
| INV-029 | Activar Soundcheck requiere: `recording$ = false` verificado; para cada canal marcado LIVE en `ChannelAssignment`, `i.N.scsrc` leído = fuente hardware (o lista con confirmación si la escritura no está en la matriz); al desactivar, patch re-leído e idéntico al previo. `MTK_REC_TOGGLE` solo se envía tras leer `recording$` y si difiere del objetivo; tras enviar, se espera el estado objetivo ≤ 1 s o se bloquea cualquier nuevo toggle. | HIL: canal LIVE con scsrc = pista → activación rechazada 10/10. | MVP2b |
| INV-030 | El generador local (Android → Scarlett OUT) solo existe dentro del wizard LOOP: (a) antes de abrirlo, tono por el Player y verificación de que **no** aparece en Input 2 (AUX desconectado); (b) tope −20 dBFS, ≤ 20 s, cierre ≤ 100 ms al salir, perder foco o E-Stop; (c) energía no correlacionada en Input 2 > −60 dBFS durante la captura → calibración descartada; (d) al salir, tono por el Player debe aparecer en Input 2 a −20 ± 1 dBFS ("cable del AUX restaurado") antes de habilitar mediciones. | HIL: salir sin reconectar el AUX → START SESSION bloqueado. | G-C |
| INV-031 | CONTROLLED AUTO no envía writes sin app en foreground y pantalla desbloqueada. Si la pantalla se bloquea o la app pasa a background durante Apply/Verify, la transacción completa su verificación (o revierte por timeout) y el loop se detiene en STOPPED_BY_LOCK sin iniciar otra iteración. | Instrumentado: bloquear en la iteración 2 → 0 writes posteriores. | MVP4b |
| INV-032 | Al conectar, la app publica un marcador de presencia (mecanismo validado en P0.9: `BMSG^SYNC` con id VSE o snapshot `VSE_LOCK_<deviceId>` renovado cada 60 s) y busca marcadores ajenos; si existe uno con antigüedad < 120 s, arranca en READ-ONLY (sin writes ni generador) y lo muestra. | HIL: dos tablets → exactamente una con writes; apagar la primera → la segunda obtiene writes tras ≤ 180 s con rearme explícito. | MVP0 |
| INV-033 | Si `deviceInfo.firmware$` ≠ firmware listado en la Capability Matrix, todo write RAW queda deshabilitado (solo API tipada y solo en ASSISTED) hasta que el usuario acepte explícitamente "firmware no certificado" y quede registrado en la sesión. **La comprobación es antes de escribir, no antes de conectar:** el firmware no está expuesto por HTTP —medido el 2026-09-08: `version.txt`, `/api/version` e `info.json` responden 301— y solo aparece como una clave más del volcado que la consola manda al abrir. Mientras el volcado no haya llegado, el firmware es desconocido y ninguna escritura está permitida de todos modos, así que no hay hueco. | Unit + HIL con matriz editada; además, un test que compruebe que con el volcado incompleto no se habilita ninguna escritura. | MVP1 |
| INV-034 | La aplicación no se actualiza a sí misma mientras haya una sesión de sonido abierta (estado ≠ `CLOSED`), ni con una transacción en curso, ni mientras esté conectada a la consola. La conexión es el suplente de la sesión hasta que el modelo de sesión esté cableado a la interfaz: sin él, en MVP0 la invariante no se dispararía nunca. El contexto se vuelve a evaluar inmediatamente antes de empezar la descarga, no sólo al consultar el catálogo. Sólo se instalan publicaciones estables, descargadas por HTTPS desde servidores de GitHub, con SHA-256 verificado antes de abrir la sesión de instalación (ADR-020). | Unit: `packages/updater/test/decision.test.ts` y `manifest.test.ts`; el aviso de transacción en curso, en `packages/safety/test/runner.test.ts` -- incluido que se apague cuando la escritura lanza, porque un aviso pegado dejaría la aplicación sin poder actualizarse nunca. | MVP0 |
