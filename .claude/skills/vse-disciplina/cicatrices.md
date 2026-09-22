# Cicatrices: el caso que produjo cada regla

**Cargar antes de medir, de implementar sobre el motor o el adaptador, y antes
de escribir «no hay», «no se puede» o «no se midió».** Las reglas están en las
skills breves; acá está lo que las produjo, porque *una regla sin el caso que la
produjo se lee, se acepta y se olvida*. Las skills se acortaron el 2026-09-21
para leer menos al arrancar; este archivo se lee por tarea, no por sesión.

**Y la prueba de que hace falta es del mismo día en que se acortaron**: con las
skills largas cargadas, ADR-039 escribió igual «ninguno de los cuatro tiene
topes por parámetro», que era falso — la quinta vez de la misma forma. Con las
breves no habría tenido ni la advertencia.

## Medir

**Medí el instrumento, no la cadena.** El recorrido del medidor se documentó
como 84,5 dB midiendo con tonos por la interfaz; el valor real es 80. Meses
después, el techo se documentó como byte 239 con el mismo método; el real es 255,
y el 239 era donde saturaba la Scarlett. **La segunda vez la lección ya estaba
escrita en el mismo documento.** Y una tercera: el techo de 29 dB atribuido a la
profundidad de la puerta era el piso del banco; se dirimió subiendo la fuente
12 dB y viendo que el techo no se movía en absoluto.

**Comprobá que la fuente suena antes de concluir sobre el instrumento.** Una
medición sobre silencio parece un hallazgo y no lo es.

**Mirá el estado de alrededor antes de concluir.** Tres conclusiones falsas de
una sola sesión tuvieron la misma forma: un bus silenciado, una fuente apagada,
una clave que se creía inexistente. Las tres veces el dato estaba a un `grep`.

**El instrumento puede comerse decibeles que no son del aparato.** El banco del
ecualizador puentea el compresor del canal y con eso se lleva la ganancia de
salida que ese compresor tenga cargada: 28 dB del preajuste del bombo. Tres
corridas fallaron su control con la ley saliendo bien, y hubo dos diagnósticos
convincentes y equivocados antes del bueno; el usuario cortó el segundo con una
frase. Ver `docs/backlog/el-banco-no-estaba-roto-el-instrumento-se-comia-28-db.md`.

**Dos caminos que comparten un supuesto no son dos caminos.** Si el mapa por
bytes y el censo del vocabulario pueden equivocarse por el mismo motivo,
coincidir no confirma nada.

**Una medición que no se archiva no se midió: se contó.** Tres veces en un día
se corrió el guion, se leyó la terminal, y se corrió otra vez para archivar: dos
corridas, dos números. El peor fue un «máximo 277» que era el argumento entero
para cambiar un plazo y que no volvió a aparecer en sesenta corridas. De ahí
`tools/spikes/medir.mjs`, que muestra y archiva la misma corrida y no pisa un
archivo existente.

**Terminar una medición es más que archivarla.** El usuario preguntó tres veces
en un día si la documentación estaba bien, y las tres veces faltaba algo: la fila
narrativa de la matriz, la tabla de constantes de la especificación, el resumen
del README, la sección de estado de la skill, el changelog, y el contrato
anterior que dejó la pregunta abierta. *«Se me hace costumbre preguntar porque
es algo en donde siempre fallamos.»* Se recorren, no se recuerdan.

## Escribir lo que se sabe

**Un comentario que explica un valor equivocado es peor que el valor solo.**
`PEAK_HOLD_TIME` estuvo escrito como 3 en vez de 3000 con el comentario «es tan
corto que el pico cae de inmediato». Esa frase le daba al lector una razón para
no dudar.

**Escribí la limitación con todas las letras.** Al documentar «con 1 dB esperado
y 1,5 de tolerancia, quedarse quieto también confirma» quedó claro que no era un
límite tolerable sino un agujero.

**Un número escrito a mano se pudre.** La cuenta de tests estuvo en 220 cuando
eran 283, se corrigió a 293, y dos PR después eran 298. Cuando un dato cambia
cada semana y nada lo comprueba, la respuesta no es corregirlo otra vez: es no
afirmarlo y decir dónde se consulta. Los que sí vale escribir son los que cambian
con una decisión.

**La sección «estado real, hoy» avisa de que se pudre y se pudre igual.** Dijo
«no escribe nada en la consola» tres días después de que ya escribía, y una
línea se corrigió dos veces el mismo día y las dos duraron horas.

**La versión cómoda del «no encontré».** Un `grep` negativo del parámetro del día
dice que ese parámetro no aparece, y nada más. Convertirlo en una afirmación
sobre todo el proyecto ajeno es ampliar el alcance en silencio, y **cinco veces**
la frase falsa fue la que dejaba el hallazgo propio sin precedente: que ninguno
nombra `afs.*` (`fmalcher` lista las doce claves), que `fmalcher` no expone el
ecualizador de salida (lo expone entero, anidado), que `MyUiPro` e `ioBroker` no
tocan parámetros de mezcla (los dos escriben la ganancia del previo), que ninguno
tiene rampa (`fmalcher` tiene `fadeTo`), y que ninguno tiene topes por parámetro
(`fmalcher` recorta el retardo a 250 ms en entrada y 500 en auxiliar, y se llama
`sanitize`, no `clamp`). Antes de escribir «ninguno hace X»: clonar, grepear con
más de una palabra, y agregar la fila en `docs/referencia/`.

**Y mirar el trabajo previo antes de proponer, siempre.** El 2026-09-15 se le
pidió al usuario decidir hasta dónde vuelve a subir el general después de cazar
un acople, con cuatro opciones y sin mirar qué hace nadie. *«¿No habíamos quedado
en que nada iba a ser implementado antes que se investigue en proyectos
existentes?»* El supresor de su propia consola ya contestaba la pregunta. Y en el
ítem 108 se probaron **nueve hipótesis** contra el aparato antes de que él
pidiera dos veces buscar en repositorios de terceros.

## Guardas y tests

**Un validador que compara el repositorio consigo mismo no detecta un error de
lectura.** Con código y documento diciendo 3, el validador pasaba y el error de
factor mil sobrevivía. Las constantes del cliente de la consola se comparan
contra una transcripción literal con su `sha256`.

**Un test que pasa con y sin la corrección no protege de nada.** Después de
arreglar algo, revertí la corrección y comprobá que el test falla. Y **mutar no
alcanza**: hubo un arreglo con la suite verde y once mutantes cazados que no
arreglaba nada, porque nadie lo atacó.

**Invariantes vivas pero inertes.** INV-034 estaba escrita, probada y no se
disparaba nunca: el campo del que dependía no lo poblaba nadie. Cuando agregues
una invariante, verificá que algo real la active. Lo mismo `PACING_MS`, escrita
y sin que ningún código de producción la importara.

**Una comprobación puede estar calibrada por debajo de la regla.** El recorrido
medía el paro del diálogo con 44 px cuando INV-019 exige 64, así que aprobaba un
botón de 48. Copiá el número de la regla, no uno parecido.

**Una comprobación puede comprobar menos de lo que dice.** El validador de
identificadores reconocía ocho familias y comprobaba tres: sobrevivió una cita a
EP-09, que no existe. Comprobá también la cobertura de la guarda. **Y la guarda
de rutas medidas «miraba todos los .md del repositorio» sin entrar en
subcarpetas**: ninguna ADR ni ningún contrato, hasta el 2026-09-21.

**Probá la guarda contra el caso que la motivó.** La primera versión del
validador de cifras no atrapaba el 277 —la cifra en una línea, la cita en la
siguiente— y estaba en verde. **Y que una entrada rota no la apague**: una cita a
una ruta que no resolvía hacía `return` en silencio y desactivaba el bloque.

**La suite verde no es auditoría.** El día que el usuario preguntó si se había
auditado, la auditoría encontró un agujero grave con la suite en verde. Y el
auditor también se equivoca: un informe afirmó lo contrario de un hallazgo
medido; se verifica antes de actuar.

**La primera versión de una guarda de tiempo comprobaba una promesa.** La escucha
entre pasos tenía cinco condiciones y no cerraba nada: con mediciones bien
formadas, dieciséis transacciones honestas de 2 dB levantaban una cuña 32 dB sin
una sola espera. Se cerró exigiendo tiempo transcurrido, no campos presentes.

**El límite que se comprueba tarde no es un límite.** La convención de commits se
revisaba después de commitear, y dos veces en una sesión hubo que reescribir
historia por uno o dos caracteres. Ahora hay un gancho `commit-msg`. Cuando algo
se repite, la pregunta no es «cómo me acuerdo» sino «dónde se pone para que no
dependa de acordarme».

## Código: las trampas que ya mordieron

**El signo de la propuesta de ganancia.** Con el pico a −4 dBFS proponía *subir*
la ganancia, empujando hacia la saturación el canal que ya estaba cerca. La resta
estaba invertida. Hay un test que exige bajar cuando el pico está alto.

**`null` en SQL contra `null` en JavaScript.** `columna = NULL` nunca es cierto
en SQL; `x === null` sí lo es. «La sesión abierta» se busca por
`cerrada_el IS NULL`. Y al ordenar, SQLite manda `NULL` primero y la referencia
lo mandaba al final. Por eso el esquema **y el SQL** viven en `packages/store` y
se corren contra SQLite real.

**El volcado inicial parecía una avalancha.** Al conectar, la consola manda su
estado entero y el detector de cambios masivos lo leía como una instantánea
recuperada. `volcadoIniciado()`.

**La misma regla implementada dos veces.** El adaptador calculaba bien la
conexión inestable y la interfaz tenía una segunda copia rota. El adaptador es la
única fuente. Y el arnés de pruebas y la herramienta de inventario construían el
mismo cambio a mano y se separaron dos veces.

**Nombres de clase que colisionan.** `.aviso.aviso` coincidía con cualquier
mensaje y todos salían en ámbar.

**Elementos fijos que tapan contenido.** El paro y la barra inferior flotan;
toda página que termine en un botón reserva `--zona-inferior`.

**Firma de Android.** Sin un almacén de claves fijo guardado como secreto,
ninguna actualización instala y el mensaje es «aplicación no instalada».

**Los mapas de código de scripts rompen la compilación de desarrollo.** Con
`allowImportingTsExtensions` el compilador pierde `src/main.ts`; están apagados
a propósito en `angular.json`.

**Llamar funciones desde una plantilla.** Se violó tres veces y costó cuarenta y
ocho llamadas por ciclo en la pantalla de telemetría.

**`NaN` pasa todos los topes.** Toda comparación con `NaN` da `false`, así que un
cambio con magnitud `NaN` aprobaba INV-004 entera, y después el crudo en `NaN`
pasaba por el otro operando del mismo `if`. Se tapó tres veces, cada una en el
vecino de la anterior. Se comprueba el tipo y después el valor.

**Los topes se cobraban por cambio y el movimiento real es la cadena.** Cuatro
pasos honestos de 2 dB en una transacción movían la cuña 8 dB, y los intermedios
suenan: el ejecutor escribe uno por uno. `RUTA_REPETIDA`. Y el orden de los
cambios dentro de una transacción es parte de lo que se decide (ADR-039).

## Lotes y consola

**Un lote tiene que informar cuáles no aplicaron.** Un lote de tres correcciones
abortó en la primera; se volvió a correr con dos, y la tercera nunca llegó al
archivo. El commit decía haberla hecho. Después de un lote, `grep`, no memoria.

**No uses tuberías que puedan cortar el proceso.** Un `| head` manda `SIGPIPE`,
el `finally` no corre, y la consola queda con la ganancia a mitad de un barrido.
Escribí a archivo.

**Y las cuatro afirmaciones falsas sobre la consola del usuario** salieron de
mirar el principio de un volcado y generalizar. Se lee entero.
