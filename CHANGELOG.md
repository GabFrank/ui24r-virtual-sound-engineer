# Changelog

Sigue [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/) y versionado semántico.

## [Sin publicar]

### Agregado

- **Qué devuelve de verdad una recuperación de instantánea, campo por campo.**
  Era la pregunta más importante que quedaba sin contestar, porque el punto de
  retorno que la aplicación guarda antes de escribir promete «se puede
  deshacer». Medido con un `LOADSNAPSHOT` real: **44 de 45 campos vuelven**,
  incluidas ganancia, alimentación fantasma, patcheo de salida, retardos y
  reproductor, y sin un solo efecto colateral sobre 6.700 claves.

  **La excepción es `m.afs.enabled`**, la supresión de realimentación — y no es
  un campo cualquiera: ese supresor le pone filtros de −18 dB al audio por su
  cuenta, así que su estado cambia lo que la consola hace. Si algo lo mueve,
  recuperar la instantánea no lo deshace. Queda dicho en la promesa.

- **Y el mismo recall destapó que la mitad de INV-021 nunca se ejecutó.** El
  almacén confirmado compara la ruta `var.currentSnapshot` para detectar un
  recall, pero se llega a esa comparación solo desde `procesarLinea`, que
  arranca descartando todo lo que no sea `SETD` — y el puntero de instantánea
  viaja como `SETS`. La consola **sí** lo difunde, comprobado contra el aparato;
  el almacén lo tiraba.

  El comentario que acompaña a ese código ya decía por qué importaba: *«un recall
  chico es el que nadie nota»*. Y el mismo día se midió que un recall difunde
  solo lo que cambió, así que un recall chico es, efectivamente, un puñado de
  mensajes por debajo del umbral de avalancha. El diagnóstico estaba escrito
  hace tiempo; lo que faltaba era que el dato llegara a la rama que lo esperaba.

### Corregido

- **Un recall chico ya no pasa desapercibido.** El almacén confirmado ahora
  reconoce el `SETS` de `var.currentSnapshot` y el adaptador se lo pasa, con lo
  que la mitad de INV-021 que habla de la recuperación de instantánea deja de
  ser código inalcanzable. Contra la consola: **diez recuperaciones, diez
  avisos, diez veces con la causa correcta**, y la consola quedó con cero claves
  distintas de como estaba.

  Los tests de esa rama llevaban tiempo en verde **probando algo que no pasa**:
  construían la línea con `codificarSetd` y la consola manda `SETS`. Ahora usan
  la forma real, y sin el arreglo fallan ocho. Un test que fabrica su propia
  entrada solo prueba lo que el que lo escribió creía del protocolo.

- **La avalancha, medida contra la consola de verdad.** Estaba probada solo
  contra el simulador — que la dispara porque nosotros se lo pedimos, así que
  probaba que la pantalla dibuja el aviso y nada más. Ahora un segundo cliente
  hace de otro operador y escribe dieciséis rutas de golpe: **diez de diez
  avisos**, dieciséis de dieciséis rutas restauradas.

  Y apareció algo que el simulador no podía mostrar: **el aviso dice «10
  parámetros cambiaron» cuando cambiaron 16**. Emite el tamaño en el instante en
  que cruza el umbral, que es diez. Para la seguridad da igual —el estado se
  invalida igual—, pero el número está ahí para que el operador dimensione lo
  que pasó, y le está devolviendo el valor de nuestra propia constante
  disfrazado de medición.

- **Las seis capacidades que le faltaban al primer entregable, medidas contra el
  aparato.** Alimentación fantasma en lectura, silencio de envío auxiliar, los
  dos puntos de derivación, matriz con el general como fuente y retardos de
  salida. Nueve escrituras, nueve difundidas, nueve restauradas, con la
  restauración comprobada por HTTP —un camino distinto del que escribió—.

  Y tres cosas que nadie había anticipado. **`i.N.phantom` existe y contradice a
  `hw.N.phantom`**: con el condensador alimentado, una decía 1 y la otra 0 en el
  mismo instante. Quien lea la del canal va a diagnosticar «este micrófono no
  tiene fantasma» sobre uno que sí la tiene. **La matriz solo la alcanzan dos de
  los veinticuatro canales**, y no es la familia que parecía serlo:
  `hwoutaux.N.src` es el patchbay físico, no la matriz. Y **la unidad de los
  retardos sigue sin medirse**: la ruta acepta el valor y lo difunde, pero el
  «de 0 a 500 ms» que decía la matriz de capacidades salía de una API de
  terceros, no de una medición nuestra. Quedó dicho así.

- **Con una pista de soundcheck sonando, la ganancia no se aplica.** El canal
  reproduce lo grabado, así que mover la perilla del previo no cambia nada de lo
  que se escucha: el consejo no es impreciso, es **inaplicable**. Dejar aplicar y
  que no se oiga ningún cambio es peor que no dejar — le enseña al usuario a
  desconfiar de la aplicación. El botón se apaga y el motivo lo explica.

- **Pantalla de espectro, con aviso de realimentación.** Muestra qué
  frecuencias están sonando en el general y avisa si alguna se queda colgada.
  **Pide permiso antes de tocar nada** —el analizador de la consola es uno solo,
  así que tomarlo le cambia la pantalla al operador— y lo devuelve al salir, a
  la fuente que se leyó y no a una reconstruida (ADR-025).

  **Se vigila el general y no un canal**: la realimentación es un lazo del
  sistema, sale por los parlantes y vuelve por un micrófono, así que aparece ahí
  venga del canal que venga. Lo que el general no dice —cuál canal la produce—
  se acota con los medidores por canal, que ya llegan siempre: un canal en
  silencio no puede ser la fuente. La pantalla lo presenta como pista y no como
  veredicto, porque eso es lo que es.

- **«No entró nada» y «entró muy bajo» dejaron de decir lo mismo.** Con un canal
  sonando a −54 dB —por debajo del umbral con el que el asistente descarta
  silencio— la pantalla decía «no hubo señal para medir». Es cierto para el
  asistente y confuso para quien está escuchando: la fuente suena, solo que
  bajo. Y los dos casos llevan a consejos opuestos —revisar el cable, o subir
  la ganancia—, así que el caso más común de un canal mal puesto terminaba en un
  callejón sin salida. Ahora dice cuál de los dos es.

- **Se descubrió que el supresor de realimentación de la consola reacciona a los
  tonos de prueba.** Los toma por acople y les pone un filtro de −18 dB a cada
  uno, así que cualquier medición acústica que pase por el general se altera sola
  mientras ocurre. La consola además publica qué frecuencias ya filtró, que es
  información que el aviso de realimentación puede usar en vez de duplicarla.

- **El analizador quedó comprobado contra frecuencias conocidas por el aire**: de
  250 Hz a 1 kHz, un tono emitido por el monitor aparece exactamente en la banda
  que predice la ley medida, y es el pico del espectro.

- **Ya hay una curva de respuesta de la cadena completa**, medida con ruido rosa
  en las dos puntas: cómo entra y cómo llega después del aire. Es lo que haría
  falta guardar para corregir un micrófono que no es plano — con la salvedad de
  que mide el conjunto, no el micrófono solo.

- **El aviso de realimentación mide lo mismo en graves que en agudos**, y ahora
  está comprobado: la escala del analizador se había establecido solo a 1 kHz.
  Entre 125 Hz y 8 kHz no se desvía más de 0,3 dB.

- **La confirmación por medidor ya no supone que el canal 10 use el previo 10.**
  Con un enrutamiento distinto del de fábrica miraba el medidor de otro canal y
  podía dar por buena una escritura mirando una señal ajena. Ahora saca el canal
  del enrutamiento real, y si no lo sabe no escribe.

- **Los graves sí llegaban: lo que faltaba era apagar el supresor.** Con él
  encendido, un tono de 63 Hz no aparecía en absoluto; con él apagado aparece
  claramente. La caída que queda por debajo de 250 Hz es real pero mucho más
  suave, y puede ser del monitor, del micrófono o de la sala.

- **Queda anotado en qué estado quedó la consola de pruebas**: qué se dejó tocado
  a propósito, qué no se pudo restaurar y por qué. Una nota que dice que se cruzó
  una regla y no dice cómo quedó el aparato no sirve de nada.

- **El espectro quedó comprobado con un micrófono de verdad**, y no solo con
  tonos: 75 de las 122 bandas con energía y la forma que corresponde. En la misma
  prueba, el aviso de realimentación **no saltó ni una vez** con ruido de banda
  ancha, que es exactamente lo que tiene que hacer.

- **Las mediciones se archivan solas, y una cifra sin respaldo ya no pasa.** Se
  corría la medición dos veces —una para mirarla y otra para guardarla— y la
  documentación terminaba citando números de la corrida que no quedó. Pasó tres
  veces; una de ellas era el único argumento para cambiar un plazo, y al medirlo
  de nuevo sesenta veces no volvió a aparecer. Ahora se muestra y se guarda la
  misma corrida, y la verificación falla si un número con unidad no está en la
  evidencia que lo respalda.

- **La aplicación distingue sin fallar lo que cambió ella de lo que cambió otro.**
  Cien de cien, medido contra la consola. No lo consigue adivinando por tiempo
  —eso era imposible, porque la consola no le devuelve nada a quien escribe— sino
  porque no hace falta: lo que llega por la conexión de trabajo es siempre de
  otro, y lo propio se marca al verificarse.

- **Un fader movido desde otro dispositivo ya no borra el historial reciente.**
  Un arrastre llegaba como veinte cambios separados y llenaba solo él la lista de
  los últimos veinte, que es justo lo que se mira para entender qué pasó. Ahora
  es un único aviso, con el valor donde el fader quedó. El costo, dicho: dos
  cambios sobre lo mismo a menos de un cuarto de segundo se cuentan como uno.

- **La limpieza de instantáneas viejas ahora se comprueba.** Se mandaba el
  borrado y nadie miraba si había ocurrido; si algo fallaba, el show crecía igual
  y nada avisaba. Además, la aplicación ya no confunde «la consola no contestó»
  con «no hay ninguna instantánea», que hacía abortar una transacción con un
  motivo que no decía la verdad.

- **La aplicación ya puede confirmar un cambio mirando el medidor**, para cuando
  la wifi no da para abrir la segunda conexión que normalmente lo verifica —o
  sea, en pleno show—. Estaba escrito y sin conectar: sin esa conexión, antes no
  se escribía nada. Y si el canal está en silencio sigue sin escribirse, porque
  ahí el medidor tampoco puede confirmar y un cambio a ciegas no se distingue de
  uno que funcionó.

- **Se descubrió que la consola difunde en un tic de ~34 ms**, y no una línea por
  escritura. Dos cambios a la misma ruta dentro de ese tic producen uno solo, con
  el segundo valor: el primero se aplica y su confirmación no llega nunca. Las
  escrituras normales quedan fuera del problema porque van espaciadas 100 ms, casi
  tres tics, pero ahora está medido en vez de ser suerte.

- **La aplicación no pisa un cambio hecho desde otro dispositivo**, y ya no es
  algo probado solo contra el simulador: medido contra la consola, con un segundo
  cliente haciendo de otro operador. 100 de 100 cambios ajenos etiquetados, cero
  sobrescrituras.

- **La política de confirmación de escrituras quedó cerrada, y medida.** La tabla
  de qué confirma cada escritura iba a escribirse a mano diciendo «se supone que
  sí» en casi todas las filas; se midió en cambio, ruta por ruta contra la
  consola: 18 de 18 difundidas, mediana 17 ms. Lo que no se midió queda marcado
  como inferido, diciendo que lo es.

- **La retención de instantáneas ya está probada contra la consola.** El comando
  de borrado se había implementado sin ejecutarse nunca contra el aparato: la
  prueba corrió por debajo del máximo y no borró nada. Medido, funciona y deja
  los shows del usuario intactos.

- **Las capturas viejas dejan de pasar por documentación buena.** Dos mostraban
  un paso del recorrido que se había corrido de número. La verificación falla
  ahora si el índice no nombra todo lo guardado, y —cuando se corre junto a los
  guiones— si lo guardado no coincide con lo recién producido. En integración
  continua solo se revisa el índice, porque ahí nadie sacó capturas.

- **El aviso de realimentación ya señala qué banda es.** La barra tenía que
  salir en color de aviso y salía blanca como todas: la pantalla usaba cinco
  fichas de diseño que no existen, y `var()` con valor de reserva no falla. El
  aviso contaba la banda sostenida y no marcaba cuál. Había otras nueve, con
  dieciséis usos, en cinco pantallas más, y ahora la verificación falla si
  alguna ficha usada no está declarada.

- **Las instantáneas automáticas dejan de acumularse.** Se conservan las 20 más
  recientes, que es lo que INV-003 ya tenía decidido. **Solo se borran las
  propias y solo las que se pueden fechar**: una instantánea que guardaste a
  mano no se puede borrar ni por error, porque el comando ni siquiera se
  construye para ella. Sin esto, con una instantánea por aplicación de ganancia,
  una sesión de veinte canales dejaba sesenta.

- **Guardar una instantánea ya no te cambia cuál es la actual.** Se descubrió
  midiendo: al crear su punto de retorno, la aplicación hacía que la consola
  pasara a considerar «actual» la automática en vez de la tuya. Si después
  tocabas «actualizar instantánea actual» en la consola, escribías sobre la
  automática y perdías tu trabajo sin enterarte. Ahora la aplicación devuelve la
  etiqueta sola, escribiendo **solo la etiqueta** — cargar la instantánea
  aplicaría todo su contenido, que es lo contrario de restaurar.

- **El lazo se cerró: medir, proponer, aplicar y verificar.** Comprobado contra
  la consola real: midió 30,7 dB de margen, propuso +3, escribió la ganancia de
  30 a 33 dB, volvió a medir y dijo «mejoró, quedó en 27,7 y faltan 13,7». El
  margen bajó exactamente los 3 dB aplicados.

- **La aplicación crea su propio punto de retorno antes de escribir.** INV-001
  lo exigía y no estaba implementado. Guarda en un show propio llamado `VSE`
  —**nunca en los del usuario**, y no por convención sino porque el show no es
  un parámetro del comando— y lo verifica releyendo la lista de la consola. **No
  sabe borrar**: el protocolo tiene `DELETESNAPSHOT` y el módulo no lo
  construye, con un test que lo fija leyendo su propio código.

- **La aplicación aplica la ganancia en la consola.** Hasta ahora medía,
  proponía y ahí se cortaba: el cambio lo hacía el usuario a mano. El
  mecanismo estaba entero desde antes —motor de seguridad, ejecutor de
  transacciones, tabla del diario— y **nadie lo instanciaba**. Se aplica con
  confianza ALTA o MEDIA, un canal por vez, solo en configuración de canales, y
  se verifica volviendo a medir: que el valor haya llegado prueba que la
  perilla se movió, no que haya servido (ADR-026).

- **El diario de transacciones se guarda en la base.** Había uno en memoria,
  que sirve para los tests y el simulador. Pero ADR-013 pide anotar **antes**
  de escribir para que, si la aplicación se cae a mitad de una transacción, al
  volver se sepa qué quedó tocado — y un diario en memoria se lleva esa
  información en la misma caída que tenía que sobrevivir.

- **Sin conexión testigo, la escritura se confirma por el medidor.** Es lo que
  INV-011 ya contemplaba para la ganancia con señal presente: si se subió 3 dB,
  el nivel tiene que subir 3 dB. Comprueba el efecto y no el valor, así que se
  anota como `VU` y nunca como `WITNESS`. Sin señal no hay confirmación posible
  y no se escribe.

- **Los medidores de las salidas se leen: general, subgrupos, efectos,
  auxiliares y reproductor.** La cola de `VU2` estuvo meses declarada
  indescifrable porque se la leía con el paso de las entradas y las secciones
  **no comparten el paso**. Además resultó **autodescriptiva**: la cabecera
  dice cuántos hay de cada cosa, así que el decodificador lee las cuentas en
  vez de tenerlas escritas —fijarlas sería la misma trampa que suponer
  enrutamiento identidad, que coincide hasta que alguien cambia la
  configuración de la consola.

- **Detección de realimentación sobre el espectro de la consola.** La regla es
  «no cayó como debía», no «creció»: cualquier golpe de música crece, lo que
  distingue a una resonancia es que **se queda**. Como la balística del
  analizador está medida —cae 20 dB en unos 300 ms— hay un valor esperado para
  cuánto tendría que haber bajado una banda, y se avisa de la que no bajó eso
  y además sobresale de sus vecinas. Comprobado contra la consola: un tono
  sostenido en el canal 10 sale como **una** candidata en 1000 Hz exactos, y
  doce segundos de música no dan ninguna. **Devuelve candidatas, no un
  veredicto**: sin micrófono de medición no se puede distinguir por señal una
  resonancia de la sala de una nota tenida, porque el analizador mira el canal
  y no el aire.

- **Los pares estéreo se leen de la consola en vez de declararse a mano.** El
  plan era pedirle al usuario que dijera qué canales forman un par —era lo
  primero de la lista de lo que faltaba para el panorama—. Resultó que la
  consola ya lo sabe: `i.N.stereoIndex` vale 0 en el primero del par, 1 en el
  segundo y −1 sin enlazar. Una cosa menos que el usuario tiene que decir, y
  una cosa menos que se puede desincronizar. **El adaptador solo lee**: enlazar
  desde la aplicación sería destructivo, porque el cliente de la consola copia
  todos los ajustes del canal izquierdo sobre el derecho antes de enlazar.

- **El analizador de espectro se toma prestado con permiso y se devuelve.**
  `RTA` resultó ser el analizador de la consola y no un latido, pero la fuente
  se elige con `var.rta`, que es **global**: apuntarlo a un canal le cambia el
  RTA al operador en su propia pantalla. ADR-025 decide cómo se pide: permiso
  una vez por sesión, y la fuente vuelve al valor **leído** del volcado. Hoy la
  aplicación no lo escribe en ningún nivel de autonomía; lo que ya cambió es
  que los guiones de medición leen antes de escribir en vez de restaurar a un
  valor reconstruido.

- **Las escrituras se confirman con una segunda conexión testigo.** La consola
  no le devuelve eco a quien escribe, pero sí difunde el cambio a los demás
  clientes: abrir una segunda conexión del mismo proceso y escuchar por ahí ve
  la escritura a los 27 ms. Cambia la semántica de `escribir()`: `APPLIED` pasa
  a ser alcanzable de verdad, aparece `REJECTED` cuando el testigo no abre —se
  prefiere no escribir antes que escribir a ciegas— y `ECHO` deja de poder
  producirse. Es ADR-024 en código.

- **Retención y caída del pico en el medidor.** La consola manda el nivel
  instantáneo y la balística la dibuja su cliente, así que esto es una decisión
  de producto y no algo heredado: el pico se sostiene 3 ms y cae 24 dB por
  segundo, que son las constantes del `mixer.html` traducidas a tiempo real
  suponiendo 60 cuadros por segundo. Antes se guardaba el máximo absoluto hasta
  que alguien lo reiniciaba, que responde otra pregunta.

- **Aviso cuando el compresor está apretando durante la medición.** El nivel de
  entrada viene procesado; si el compresor actúa, la lectura dice cuánta señal
  queda, no cuánta entra.

### Corregido

- **La ganancia informa lo que el previo entrega, no lo que la tabla promete.**
  Medida la curva completa contra el aparato: de −6 a +24 dB la tabla de la
  consola es exacta dentro de 0,33 dB, pero el salto de 24 a 26 que promete
  2 dB entrega 0,71, y de ahí para arriba hay un déficit constante de ~1,15 dB.
  Se corrige de nuestro lado. **Tiene una consecuencia visible**: por encima de
  26 dB nuestra lectura deja de coincidir a propósito con la que el operador ve
  en la pantalla de la consola. Es una decisión tomada sabiendo el costo.

- **Un canal con la puerta trabajando ya no pierde confianza.** Era una
  inferencia —que la puerta no toca el punto de medición— y pasó a estar
  medida. Sigue costando confianza el de-esser, que es el único bloque del
  canal que nadie midió.

- **INV-021 se apagaba sola.** Después de una avalancha, el estado volvía a
  declararse confirmado a los 250 ms sin que nadie hubiera releído nada, por el
  temporizador de quietud. Y quedaba un segundo camino por el que pasaba lo
  mismo: un `DUMP_END` suelto. Los dos llevan ahora el mismo resguardo.

- **«1 integrantes».** Las cuentas concuerdan con su sustantivo.


- **Catálogo de instrumentos, para elegirlos en vez de escribirlos.** Cada
  instrumento se describe con tres facetas independientes —qué es, qué clase de
  esa cosa es y para qué se lo usa en el tema— y no con un árbol de tres
  niveles: el árbol multiplica hojas por combinación y obliga a recorrer ramas
  para preguntar «todos los repiques», que con facetas es un filtro. Cada
  fuente declara qué variantes y qué roles admite, así que un djembe no puede
  quedar con tesitura de voz. Elegir una fuente trae su perfil de canal;
  **djembe y bombo quedan a propósito sin perfil**, con el motivo escrito, en
  vez de heredar el más parecido y presentar rangos que nadie midió para ellos.
  El texto ya cargado no se pierde: la migración 4 le da forma al documento sin
  interpretarlo, el dominio lo clasifica al guardarlo y la pantalla sigue
  mostrando lo que el usuario escribió. Documentado en
  [docs/instrumentos.md](docs/instrumentos.md), con un test que compara sus
  tablas con el código.

### Corregido

- **A un integrante de la banda solo se lo podía borrar.** Un nombre mal escrito
  o un instrumento equivocado obligaban a quitarlo y cargarlo de nuevo, y el
  alta le da un identificador nuevo: todo lo que apuntaba al anterior
  —empezando por la asignación de canal— quedaba huérfano en silencio. Ahora
  cada integrante se corrige desde el mismo diálogo que lo dio de alta, y
  `editarIntegrante()` conserva el identificador y el lugar en la lista.

- **Un intento de conexión que no terminaba bloqueaba a todos los siguientes.**
  Medido en el teléfono con la red cortada: el `fetch` del apretón de manos se
  quedaba colgado sin resolver ni fallar, así que el intento nunca moría, el
  reintento se saltaba por haber uno en curso, y la aplicación se quedaba en
  RECONECTANDO **con la red ya restablecida**. Ahora el apretón y la apertura
  del socket llevan corte de tiempo de tres segundos: la consola contesta en
  menos de dos milisegundos en la misma red, así que tres segundos son mil veces
  su tiempo de respuesta y siguen siendo menos de la mitad del umbral de diez
  segundos del criterio 1 de SPK-P0.1.

- **Si el primer intento de conexión fallaba, no se reintentaba nunca.** El
  reintento sólo se programaba al recibir un `DISCONNECTED`, y ese camino no lo
  emite: el adaptador anuncia `RECONNECTING` al empezar y, si el intento falla,
  se queda ahí. La aplicación decía «RECONECTANDO» sin que nadie estuviera
  reconectando. Ahora el fallo baja el estado a desconectado —que es la verdad—
  y programa el reintento. Medido con cortes de wifi reales: vuelve en 3,8 a
  4,9 segundos desde que la red se restablece.

- **El simulador se había quedado en doce canales** mientras el adaptador ya
  leía la cantidad real, o sea el mismo agujero de antes reabierto por el otro
  lado: contra el simulador, el camino que descubre cuántas entradas hay no se
  ejercitaba nunca. Ahora sirve veinticuatro, con las dos entradas de línea en
  los canales 21 y 22 como la consola, y las que no se usan con el nombre vacío
  —que es como llegan de verdad—.

- **La aplicación decía «dBFS» sobre números que no son dBFS.** El pico de la
  pantalla de ganancia, el texto accesible del medidor y la explicación del
  asistente afirmaban una referencia de fondo de escala que nadie midió. Son dB
  de la escala de la consola; la correspondencia con un nivel digital real la
  mide SPK-P0.10b. Una etiqueta que afirma de más es peor que una que no dice
  nada: enseña a desconfiar del resto.

- **Los medidores mostraban decibeles que no eran los de la consola, y contaban
  saturaciones que no existían.** La conversión usaba la ley del fader, sobre la
  hipótesis —escrita como tal en el código— de que la consola dibuja sus
  medidores con la misma regla que sus faders. Es falsa. Con la guitarra en el
  canal 1 de una Ui24R real, el byte 225 daba «+4,6 dB», recortado a +10 en
  pantalla y con mil saturaciones por minuto, mientras la consola mostraba −12.

  La ley sale ahora del `mixer.html` de la propia consola, que dibuja la barra
  proporcional a la posición y coloca las marcas de su escala en
  `-dB · h / VU_RANGE`, con `VU_RANGE = 80`. Eso deja una sola recta posible:
  `dB = 80 · posición − 80`, o sea 0,333 dB por escalón del byte. Comprobada
  contra el aparato en dos puntos independientes: la guitarra, con el fader en
  −6,9 dB, da −11,9 a la salida —los «−12» de la consola—; y la música por las
  RCA da −46 dB, que es la barra que se ve en pantalla.

  La saturación tampoco se deduce ya de un umbral propio: la consola enciende su
  indicador cuando el medidor llega a la punta de la escala. Y el bit 7 del
  último byte del canal, que invita a leerse como saturación, es el **indicador
  de puerta de ruido**: vale 1 en todos los canales quietos.

  Sigue sin ser dBFS verificado. Es lo que ve el operador en su pantalla, que es
  lo que hace falta para hablarle en sus términos; la correspondencia con un
  nivel digital real la mide SPK-P0.10b.

- **La aplicación leía doce canales de una consola de veinticuatro.** El número
  estaba fijo en el adaptador, así que las dos entradas RCA —los canales 21 y
  22, que son con los que se prueba con música— no se veían. Ahora sale de lo
  que informa la consola: la cabecera de cada trama `VU2` trae la cantidad de
  entradas y el volcado manda un `i.N.name` por cada una.

- **La aplicación mostraba, en una misma fila, el medidor de un canal junto al
  nombre y la ganancia del siguiente.** Las rutas del protocolo son de base
  cero —el canal 1 es `i.0.mix`, `hw.0.gain`, `i.0.name`— y estaba medido y
  escrito en [docs/protocol-spec.md](docs/protocol-spec.md) desde el
  2026-09-08, pero el adaptador componía `i.1` para el canal 1. La trama `VU2`
  **sí** trae el canal 1 en su posición 0, así que el nivel caía en la fila
  correcta y todo lo demás corrido uno.

  Con una guitarra en el canal 1 de una Ui24R real, la aplicación decía «BAJO
  OKU · Ganancia 14» —los datos del canal 2— al lado del nivel de la guitarra.
  Un asistente que propusiera bajar la ganancia de ese canal habría nombrado el
  canal equivocado, y en el nivel ASISTIDO habría escrito en el equivocado.

  **Ningún test lo agarró porque el simulador cargaba la misma suposición**, así
  que los dos errores se cancelaban. Se corrigieron los dos: el adaptador
  convierte canal ↔ índice en un solo lugar, y el simulador numera sus rutas
  desde cero como la consola. Los tests nuevos van contra un transporte falso,
  no contra el simulador.

- **La prueba de conexión medía el flujo equivocado.** Contaba tramas `VU2`,
  que la consola **deja de emitir cuando no hay señal**, y presentaba su
  cadencia como la de la conexión. En una sala callada eso da un percentil 95
  de varios segundos y parece una conexión moribunda; con música, 44 ms. El
  criterio 4 de SPK-P0.1 se decide sobre `RTA`, que llega igual siempre, y era
  el único flujo que la prueba no miraba.

  El adaptador expone ahora `alLatido()` para `RTA`, separado de la telemetría,
  y el informe —versión 2— trae las dos cadencias con su significado: la del
  analizador juzga la conexión, la de los medidores dice cuánto audio hubo.

  Medido desde el Motorola Edge 60 Pro contra la consola: `RTA` a **33 ms de
  media, p95 40 ms**, idéntico en silencio y con la guitarra sonando. `VU2`
  pasó de 1 231 ms a 44 ms entre una cosa y la otra.

- **La base local no se creaba nunca, en ninguna instalación.** La migración
  abría su propia transacción con `BEGIN;`, pero el `execute()` del complemento
  de SQLite ya abre una y la cierra con `COMMIT`. SQLite rechazaba la
  transacción anidada —`cannot start a transaction within a transaction`— y con
  eso **ninguna migración se aplicaba**: la base quedaba sin una sola tabla. El
  `ROLLBACK;` del manejo de error, envuelto igual, fallaba después por su
  cuenta. Lo que se veía era `arranque_incompleto` y `no such table:
  sound_session`, que apuntan al almacén y no a la transacción.

  Cada migración se manda ahora en **un solo lote**, con su `PRAGMA
  user_version` adentro, y la transacción la hace el complemento —que revierte
  sola si algo falla, así que la atomicidad no se pierde. La lógica salió de
  `DatabaseService` a `core/migracion.ts` para poder probarla: los tests emulan
  el `execute()` del complemento contra SQLite de verdad, que es lo único que
  reproduce el error, y verifican que ningún lote lleve transacción propia.

  Medido en el Motorola Edge 60 Pro el 2026-09-08: tres migraciones aplicadas y
  `base_abierta` en el registro, donde antes había tres errores seguidos.

- **Tres bloqueos encadenados impedían que la aplicación hablara con una Ui24R, y
  ninguno se ve en el navegador de escritorio.** Los tres se encontraron en el
  WebView del teléfono el 2026-09-08 y son anteriores a cualquier defecto del
  adaptador: mientras estuvieran, **ninguna versión de la aplicación podía
  conectarse a una consola real**.

  1. **La aplicación se servía por `https://localhost`**, y desde un origen
     https el navegador prohíbe abrir un `ws://`:
     `SecurityError: Failed to construct 'WebSocket'`. La Ui24R no tiene TLS ni
     forma de tenerlo. Se resolvió con `server.androidScheme: 'http'`.
  2. **`allowMixedContent: true` no alcanzaba.** Destraba la construcción del
     socket pero `fetch()` es contenido mixto activo y Blink lo bloquea igual, y
     el apretón de manos de socket.io es un `fetch`. Se probó y se descartó.
  3. **Android prohíbe el tráfico en claro desde la versión 9**, así que todo
     pedido moría con `net::ERR_CLEARTEXT_NOT_PERMITTED`. Se agregó
     `network_security_config.xml`, con el porqué y el costo escritos ahí.

  Costo del cambio de esquema, que es real: **cambia el origen y se vacía el
  almacenamiento web**. Las preferencias de `localStorage` se pierden una vez.
  La base de datos no: es SQLite nativa.

- **La marca «≈» decía que la ganancia y el fader eran estimaciones**, y desde
  que las curvas se tomaron de la consola dejaron de serlo. Ahora depende de
  `VERIFICADO_CONTRA_CONSOLA`, así que desaparece sola y reaparece sola si
  alguien vuelve la bandera a falso. Una marca que miente enseña a ignorarla.

### Agregado

- **[docs/guia-de-pruebas-manuales.md](docs/guia-de-pruebas-manuales.md)**: qué
  hay que probar a mano contra hardware, con lo ya probado marcado y lo que
  falta separado de lo que **no se puede** probar en nivel OBSERVE. Cierra con
  las cinco trampas que costaron esta sesión.
- **[docs/entorno-de-desarrollo.md](docs/entorno-de-desarrollo.md)**: cómo dejar
  una máquina nueva en condiciones de compilar, firmar con la clave buena,
  instalar sin desinstalar y depurar el WebView sin depender de
  `chrome://inspect`.
- Resultados medidos en los charters de **SPK-P0.1** y **SPK-P0.2a**, con su
  evidencia en `docs/spikes/<id>/evidence/`. Ninguno de los dos se da por
  cerrado, y cada uno dice qué le falta.

### Corregido

- **El adaptador no podía hablar con una Ui24R real.** La sesión con hardware del
  2026-09-08 encontró cinco defectos, y los tres primeros bastaban para que no
  llegara ni un mensaje. Ninguno se había visto antes porque el simulador
  reproduce nuestras suposiciones, que es exactamente lo que su propio comentario
  advertía.

  1. **Faltaba el apretón de manos.** La consola habla socket.io 0.9: hay que
     pedir un identificador de sesión por HTTP antes de abrir el socket, y **es
     de un solo uso**. Por eso el campo «Dirección» de Ajustes no puede guardar
     una URL: ahora hay `resolverDireccionUi24r()`, que la deriva de la máquina.
     Lo anticipaba el comentario de `validarUrlDeConsola`.
  2. **No se quitaba el envoltorio de socket.io.** Las líneas llegan como
     `3:::SETD^i.0.mix^0.41`, y `decodificar()` comparaba `'3:::SETD'` contra
     `'SETD'`: **todos** los mensajes caían en `OTRO` y el estado confirmado
     quedaba vacío. Lo resuelve `despojarSocketIo()`.
  3. **No se mandaba `ALIVE`.** El cliente oficial lo manda cada segundo y sin él
     la consola deja de emitir, sin cerrar el socket: en 20 s sin `ALIVE`
     llegaron 148 tramas de analizador; en 30 s con él, 905.
  4. **`decodificarVu()` decodificaba otro formato.** Asumía un byte por canal
     mapeado de −80 a 0 dB. El real tiene **cabecera de 8 bytes y 6 bytes por
     canal**, y el byte es una posición normalizada, no decibeles. Con la lectura
     vieja el canal 1 devolvía el byte de la cabecera —la cuenta de entradas, 24—
     informado como −72,5 dB. Comprobado contra una fuente conocida: con música
     solo por las RCA, la señal cae en los canales 21 y 22 y en ningún otro.
  5. **El estado confirmado se quedaba en INVALID para siempre.** El adaptador
     esperaba una línea `DUMP_END` que el simulador emite y **la consola real no
     manda**. Ahora el volcado se da por terminado tras un cuarto de segundo sin
     líneas de estado; el centinela se sigue respetando cuando está.

- **La conexión se declaraba inestable en cada silencio.** El vigilante miraba el
  hueco entre tramas de medidores, y **la consola deja de emitir `VU2` cuando no
  hay señal**: 1 trama en 30 s de silencio contra 1932 en 90 s con música. Eso
  marcaba la conexión como inestable entre tema y tema y durante toda la prueba
  de sonido, justo cuando el operador mira la pantalla. Ahora se vigila el
  analizador, que no hace esa supresión: 30,0 Hz con señal y 30,2 Hz en silencio,
  con percentil 95 de 37 ms. Ese percentil es **el de la laptop**; el que fija el umbral de 99 ms es el de la **tablet**, 40 ms, que es el aparato donde corre la aplicación.
  `umbralHuecoRtaMs`.

### Cambiado

- **Las conversiones del fader y de la ganancia dejaron de ser suposiciones.** Se
  extrajeron de `mixer.html`, que sirve la propia consola —el paso 2 que preveía
  SPK-P0.2b— y `VERIFICADO_CONTRA_CONSOLA` pasó a `true`, con
  `ORIGEN_DE_LAS_CURVAS` diciendo de qué firmware salieron. Dos números cambiaron
  al medirlos:

  - **El fader llega a +10 dB, no a 0.** 0 dB está en la posición 0,764706. Dar
    por sentado que 1,0 es 0 dB erraba diez decibeles justo en el extremo
    peligroso. La curva anterior tenía una pendiente inventada de 2,2.
  - **La ganancia de entrada es escalonada.** La consola indexa una tabla de 64
    entradas: solo puede tomar **48 valores**, de 2 en 2 dB hasta +26 y de 1 en 1
    desde +27. La recta que se suponía erraba más de un decibel. Una
    recomendación de «subí 1,5 dB» en la mitad baja **no se puede ejecutar**, y
    ahora hay `rawParaGananciaMasCercana()` para elegir el escalón que sí existe.
    Encadenar las dos conversiones de la consola desvía hasta 1,97 dB por debajo
    y 0,98 por encima, así que no sirve para elegir.

  Lo que esto garantiza es que nuestra lectura coincide con la que ve el operador
  en la consola. **Que corresponda a un nivel digital real sigue sin medirse**: lo
  mide SPK-P0.10b con tonos y bucle físico.

### Agregado

- **`docs/protocol-spec.md` versión 1**, que estaba vacío esperando este spike:
  transporte, envoltorio, volcado, formato de medidores, rutas confirmadas y
  curvas, cada cosa con lo que se midió y con una sección final de lo que no.
- **Matriz de capacidades versión 1**, con firmware `3.4.8318-ui24` registrado y
  **siete filas probadas contra el aparato** — fader de canal y general, silencio,
  panorama, nombre, ganancia de entrada y nivel de envío auxiliar. Se separaron
  las filas que agrupaban parámetros probados con otros que no: el solo de canal
  y el silencio de envío auxiliar siguen sin probar y ahora se ve.
- Aviso en la matriz sobre **INV-033**: el firmware **no está expuesto por HTTP**
  —siete rutas probadas, todas `301`— y solo aparece en el volcado del socket, o
  sea después de conectarse. Si INV-033 tiene que decidir antes de conectar, no
  hay dato con el que decidir.

### Cambiado
- **ADR-023: el destino del proyecto es la automatización**, y se llega por
  niveles. No es un asistente de medición con automatización como extra: es un
  automatizador que todavía no se ganó el derecho a escribir. Cada escalón tiene
  condiciones escritas antes de intentarlo, en la matriz de autonomía. Hoy no
  cambia nada —sigue en OBSERVE y sin escribir— y INV-010 no se mueve en ningún
  nivel: ningún envío de monitor recibe escrituras, nunca.

## [0.2.0] - 2026-09-08

Primera versión que trae algo para usar con la consola delante. Sigue sin
escribir nada: mide, cronometra y exporta.

### Agregado
- **Prueba de conexión dentro de la aplicación** (Ajustes → Prueba de conexión).
  Cronometra la cadencia de los medidores —media, mediana, percentil 95,
  fluctuación y el umbral de inestabilidad de SPK-P0.1— y cada reconexión tras
  un corte de red, y exporta el informe en Markdown o JSON. Se mide desde la
  tablet porque esos dos números son del aparato en esa red, no del protocolo:
  medirlos en una laptop daría los de la laptop.
  **No escribe nada en la consola.** El eco de las escrituras propias queda sin
  medir por eso, y el informe lo dice en vez de callarlo. La cadencia se calcula
  por tramos entre cortes: el hueco de una caída no es cadencia de la consola, y
  contarlo subía la media de 50 a 66 ms en la prueba contra el simulador.
- **Los hallazgos de firmware y el contexto musical, como preguntas y no como
  hechos.** Llegó un documento con capacidades de la consola que el manual base
  no documenta —sidechain entre subgrupos, RTA compartido, pre-delay, canales DSP
  adicionales— y con una propuesta de automatización por canción. Se guarda tal
  como llegó, y sus doce afirmaciones entran en la matriz de capacidades como
  DESCONOCIDO con el spike que las mide (SPK-FW3). Ninguna se implementa hasta
  entonces.
- **ADR-022**: qué canción se está tocando entra por un puerto y se referencia
  por identificador externo, no por una lista de temas propia ni por la pantalla.
  Sin código todavía: se implementa cuando exista su primer usuario real.
- **R-21, R-22 y R-23**: el alcance crecería a automatización de show sin revisar
  la matriz de autonomía; la recuperación de un CUE podría mover la mezcla
  personal de un músico; y las transiciones graduales exigen un ritmo de
  escritura que nadie midió.

## [0.1.1] - 2026-09-08

Primera versión con APK instalable. El contenido es el mismo que describe
0.1.0 —que no llegó a producir fichero—, más lo que sigue.

### Cambiado
- **La versión la deciden los commits.** Cada fusión en `main` pasa por la
  publicación: `semantic-release` lee los commits desde la última etiqueta,
  decide el incremento, compila, firma y publica. Empujar una etiqueta a mano ya
  no publica nada. ADR-021 dice por qué, y qué se pierde con eso.

### Corregido
- **La restauración del almacén de claves.** El secreto estaba bien cargado pero
  traía retornos de carro, y `base64 -d` los rechaza: la publicación de 0.1.0
  murió ahí, después de pasar las seis comprobaciones. Ahora se quitan los
  espacios antes de decodificar, se comprueba que lo decodificado sea un almacén
  y que abra con la contraseña cargada, y cada uno de los tres fallos dice cuál
  fue. Si aun así no es base64, dice cuánto mide, cuántos caracteres se
  salen del alfabeto y si el largo cierra en múltiplo de cuatro: eso distingue
  haber pegado el `.jks` binario de haber copiado solo una parte. Y hace un
  segundo intento ignorando lo que no sea del alfabeto —una marca de orden de
  bytes, unas comillas—, que igual tiene que abrirse como almacén y coincidir
  con la huella del APK.
- **La firma del APK se comprueba contra el almacén, no a ojo.** La corrida
  compara la huella SHA-256 del certificado del APK con la del almacén que
  restauró y se detiene si difieren. Descartar la clave de depuración —lo único
  que hacía antes— dejaba pasar cualquier otra clave equivocada.

## [0.1.0] - 2026-09-08

**No llegó a producir un APK.** La etiqueta existe y la corrida falló al
restaurar el almacén de claves; la primera versión con fichero instalable es la
siguiente. Se deja anotada porque la etiqueta quedó publicada.

Primera versión publicada. **No habla con la consola todavía**: sirve para
cargar bandas, locales y sistemas de amplificación, abrir y cerrar sesiones, y
para dejar funcionando el camino de actualización antes de la fase de pruebas
con hardware. Medir y escribir en la Ui24R depende de los spikes de la puerta
G-A, ninguno de los cuales está cerrado.

### Corregido
- **INV-019**: el paro de emergencia dentro de un diálogo medía 48 px cuando la
  invariante exige 64, y la comprobación que lo cubría estaba calibrada en 44 —
  por debajo de la propia regla.
- **INV-021**: un cambio de la instantánea activa no invalidaba el estado si
  venía con menos de diez parámetros, y la causa probable estaba fija en
  «recuperación de instantánea» también cuando no lo era.
- **INV-034**: la señal de transacción en curso no la ponía nadie en `true`, y
  al conectarla se apagaba antes de tiempo con dos transacciones solapadas.
- **INV-005**: `PACING_MS` no la importaba ningún código de producción, y la
  exención del límite de cuatro parámetros para las transacciones de sistema no
  se podía ni expresar.
- **INV-003**: la retención de veinte instantáneas automáticas existía como un
  número y no la consultaba nadie.
- **INV-001**: `puedeAplicarse` comprobaba que la referencia no fuera nula, que
  es el defecto que la invariante describe.
- El orden de los documentos sin el índice por el que se ordena divergía entre
  SQLite y el navegador; ordenar por `id` funcionaba en uno y no en el otro.
- El fader tenía un salto de 47 dB por debajo de 0,0625, y la ganancia se
  calculaba con una conversión inventada.
- El validador de identificadores comprobaba tres de las ocho familias que
  reconocía; el de plantillas no miraba `@else if`, `@switch` ni `@for`;
  `verificar` no corría los tests de DSP.

### Agregado
- `npm run verificar` y `npm run verificar:commits`: lo mismo que comprueba la
  integración continua, en un comando, antes de empujar.
- `packages/logging`: el registro, el sumidero de consola y uno **persistente**
  sobre el puerto de almacén, así que funciona igual en la tablet y en el
  navegador. Encola y vuelca por lotes, purga por número contando sin traer, y
  no lanza nunca: si el almacén falla, anota el error y sigue. Ajustes lista los
  últimos cien eventos, filtra por avisos y errores, y los copia como
  `events.jsonl`.
- `Cargable` y `Lectura`, con `ui-cargando` y `ui-fallo`: una pantalla que lee
  distingue cargando, error y vacío, en ese orden. El esqueleto solo aparece la
  primera vez; una recarga que falla no vacía lo que ya estaba en pantalla.
- `intentarGuardar()`: escribir en el almacén y fallar ahora se ve. Antes no
  aparecía ni el aviso de éxito ni ningún error, y lo escrito se perdía.
- Aviso antes de salir de una edición con cambios sin guardar
  (`guardaDeSalida`, `ui-salir-sin-guardar`), en las tres pantallas de perfiles.
- Borrado de un sistema de amplificación, con la comprobación de que no lo use
  ningún local.
- `packages/mixer-adapter/src/conversiones.ts`: las cuatro conversiones entre el
  valor crudo y unidades físicas, juntas y marcadas con
  `VERIFICADO_CONTRA_CONSOLA = false`. La interfaz antepone «≈» a lo que sale de
  ellas, y «—» cuando la consola todavía no dijo el valor.
- `releerEstado()`: la relectura que INV-021 exigía y no existía. El estado
  invalidado por una avalancha se quedaba inválido hasta desconectar a mano.
- `contar()` en el puerto de almacén, y el esquema de la base mudado a
  `@vse/store` para poder probar su SQL contra SQLite real.
- Estructura de monorepo, integración continua y convenciones de contribución (S-00.1, S-00.5).
- 18 decisiones de arquitectura, de ADR-001 a ADR-018 (S-00.2).
- Charters de los 22 spikes de fase 0 con criterio de aprobación numérico (S-00.3).
- Matriz de capacidades del protocolo, matriz de hardware y registro de riesgos (S-00.4).
- 33 invariantes de seguridad con su test y la versión desde la que aplican (S-00.6). Hoy son 34: INV-034 se agregó con la actualización dentro de la aplicación.
- Actas de gate en blanco para G-A a G-E, y plantilla de informe de prueba de campo.
- Actualización dentro de la aplicación, sin tienda: consulta las publicaciones
  del repositorio, descarga el APK, verifica su SHA-256 e instala con
  `PackageInstaller` (ADR-020).
- `packages/updater`: comparación de versiones, lectura del catálogo de
  publicaciones y política de cuándo corresponde actualizar. 32 tests.
- Complemento nativo `Actualizador` y plataforma Android de Capacitor, con el
  permiso de instalación, el enlace al ajuste del sistema y la traducción de los
  fallos del instalador a algo legible.
- INV-034: no se actualiza durante una sesión, con una transacción en curso ni
  con la consola conectada.
- Flujo de publicación que compila, firma y adjunta el APK con su suma.
- `docs/actualizacion-en-app.md`: la ceremonia del almacén de claves, que hay
  que hacer **antes** de la primera instalación en la tablet.

- Sistema de diseño: fichas de color, espaciado, tipografía y tacto; catorce
  primitivas de componente; galería viva en la compilación de desarrollo
  (`docs/design-system.md`).
- Interfaz responsiva de verdad en teléfono, optimizada para tablet: tres
  puntos de corte puestos donde el contenido se rompe, no en tamaños de
  dispositivo.

- Enrutador con rutas reales: el gesto de atrás de Android funciona, las
  pantallas de edición reciben qué editan y al reanudar se vuelve donde estaba.
- Persistencia con dos implementaciones del mismo puerto, SQLite en la tablet y
  `localStorage` en el navegador, con la semántica de consulta en `@vse/store`
  y probada.
- Perfiles: altas, ediciones, listas y borrado de bandas, locales y sistemas de
  amplificación, con validación en el dominio.
- Sesión: crear, avanzar según la tabla de transiciones, cerrar y recuperar la
  que hubiera quedado abierta al arrancar.
- Historial de sesiones con detalle de solo lectura y exportación.
- Ajustes: dirección de la consola, conexión, datos y acceso a la actualización.
- `tools/visual/flujo.mjs`: recorre el camino de usuario completo en dos anchos
  y falla si algún paso se atasca (`docs/flujo-de-usuario.md`).

- Telemetría, canales, ganancia y actualización migradas al sistema de diseño,
  con lista de tarjetas en lugar de tabla en pantallas angostas.

### Agregado
- `npm run validate:limites`: verifica los límites entre paquetes que el
  proyecto declara. Tres sitios afirmaban «hay una regla de lint que lo
  verifica» y no hay ESLint en el repositorio.
- Comprobación de funciones llamadas desde plantillas de Angular.
- Test que **lee la tabla de `docs/channel-profiles.md`** y la compara fila por
  fila con el código. El que había comprobaba ocho valores sueltos de trece
  perfiles y no leía el documento; las dos tablas ya habían divergido en cinco
  celdas.

### Corregido
- Accesibilidad: la navegación perdía el nombre accesible entre 600 y 899 px;
  `ui-field` generaba los identificadores de ayuda y error y no los enlazaba
  nunca; el medidor no exponía valor; las filas del historial no se podían
  navegar con teclado; las pestañas tenían un patrón ARIA a medias; el diálogo
  no tenía nombre accesible; y al cambiar de pantalla el foco no se movía.
- La casilla «en vivo», que decide si una fuente real se sustituye por una
  pista grabada, medía 22 px.
- `ui-stat` se usaba para texto en 28 px monoespaciado y los valores se
  montaban unos sobre otros en la tarjeta de resumen de la sesión.
- Jerga interna en pantalla: códigos de invariante, rutas crudas del protocolo,
  «σ ± 3», markdown sin renderizar y estados del dominio en inglés.
- Estados que se distinguían solo por color, sin refuerzo textual.
- Las últimas seis funciones llamadas desde plantillas.
- La documentación afirmaba cuatro coberturas de test que no existían, el
  README llevaba tres entregas de retraso, y varios documentos citaban rutas y
  cifras que ya no eran ciertas.
- **Las asignaciones de canal vivían en dos sitios y el que se persistía estaba
  siempre vacío.** La pantalla de canales decía «12 de 12 asignados» mientras
  el tablero de la sesión decía «0 canales», y al reiniciar la aplicación se
  perdía la asignación entera en silencio, incluida la marca de canal en vivo
  de la que depende INV-029. Ahora hay una sola fuente: el perfil de banda.
- La pantalla de canales mostraba «Sin asignar» sobre canales que sí lo
  estaban: el enlace de propiedad sobre el desplegable se aplicaba antes de que
  existieran sus opciones.
- Guardar dos de las tres dimensiones de un local descartaba las dos en
  silencio y mostraba un aviso de éxito.
- Los errores de validación aparecían al primer carácter, y un formulario
  recién abierto ya estaba en rojo antes de que el usuario escribiera nada.
- «Cancelar» durante la captura de ganancia no detenía el muestreo, que seguía
  vivo y empujaba muestras dentro de la ventana del canal siguiente.
- «Proponer todos» podía no hacer nada sin decirlo, y proponía el perfil
  genérico para nombres que no reconocía.
- Los avisos efímeros se apilaban sin límite y tapaban el contenido.
- **Cinco invariantes estaban escritas, probadas y muertas**, el mismo patrón
  que ya se había visto con INV-034. Todas corregidas con su test:
  INV-001 comprobaba que la referencia a la instantánea no fuera nula, no que
  la instantánea existiera; INV-008 e INV-010 se aplicaban sobre la etiqueta
  que declaraba quien proponía el cambio y no sobre la ruta, así que un envío
  a un auxiliar de monitor etiquetado como fader de canal pasaba; las cláusulas
  de Q mínimo y realce máximo de INV-004 tenían su constante en el dominio y
  ninguna regla las consultaba; el tope acumulado de INV-004 sumaba magnitudes
  y bloqueaba el movimiento que deshace; y la lista blanca del paro de
  emergencia de INV-019 no la consultaba el motor.
- El estado confirmado se daba por válido al abrir el socket, antes de recibir
  el volcado, y una trama de medidores tras un tramo inestable lo revalidaba
  sin haber releído nada.
- Una transacción sin cambios se aprobaba.
- **INV-019: el paro de emergencia quedaba inoperable con cualquier diálogo
  abierto.** Un `dialog` con `showModal()` se pinta en la capa superior del
  navegador y su velo intercepta los eventos: el botón flotante dejaba de
  existir para el usuario. Ahora `ui-dialog` monta el paro en su cabecera, y
  el recorrido automático lo verifica en cada corrida.
- El paro medía 60 px en teléfono, por debajo de los 64 que exige INV-019.
- Con el paro activo, «PARO» quedaba en 2,42:1 sobre gris: ilegible justo
  cuando importa.
- La banda de rearme tapaba la barra superior entera, incluido el estado de la
  conexión, y su botón medía 31 px de alto.
- La tecla de escape cerraba los diálogos que exigen una decisión.
- El aviso efímero se solapaba con el paro entre 600 y 696 px de ancho.
- La marca de pico del medidor se pintaba según el nivel instantáneo, no según
  el pico.
- El medidor no tenía rol ni valor accesible, y en teléfono es el único
  portador del nivel.
- Las cuatro pantallas heredadas llamaban funciones desde la plantilla, que se
  reevalúan en cada ciclo de detección de cambios. En telemetría eran cuarenta
  y ocho llamadas por ciclo, en la pantalla que más ciclos genera. Ahora cada
  una deriva sus filas de una sola señal calculada.
- La asignación de canales usaba una señal `version` incrementada a mano para
  forzar el refresco, en vez de derivar de las asignaciones.
- La compilación de desarrollo no compilaba, y con ella `ng serve` tampoco:
  los mapas de código de scripts hacían que el compilador perdiera `main.ts`.
- El paro de emergencia se montaba sobre el último botón de la pantalla en
  teléfono, dejándolo inalcanzable.
- Todos los avisos efímeros salían en ámbar, incluidos los de éxito: el tono
  «aviso» colisionaba con la clase base del componente.
- La dirección de la consola estaba en dos sitios, con valores por defecto
  distintos y sin validación.
- INV-034 quedaba inerte en MVP0: no existiendo todavía el modelo de sesión, la
  pantalla ofrecía actualizar con la consola conectada. Lo encontró una captura
  visual hecha para mostrar lo contrario.
