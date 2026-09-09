# ADR-024 — Las escrituras se confirman por una segunda conexión testigo

**Estado:** Aceptada
**Fecha:** 2026-09-09
**Origen:** SPK-ACK-POLICY, desbloqueado por lo medido en SPK-P0.1 el 2026-09-08. Cierra el cabo suelto que ADR-005 dejó anotado: «hay que probar en el primer spike si la consola devuelve eco al emisor».

## Contexto

Medido el 2026-09-08 contra la Ui24R en `192.168.0.78`, firmware `3.4.8318-ui24`, en `i.9.mute`, `i.9.mix` e `i.9.pan`:

1. **La consola no devuelve eco de las escrituras propias.** Se escribe, se escucha seis segundos, no llega ninguna línea para esa ruta. Se pide `INIT` y el valor nuevo está: el silencio no es un rechazo, la escritura se aplicó.
2. **Sí difunde a los demás clientes.** Con tres conexiones simultáneas, el que escribe ve 0 líneas para la ruta y los otros dos ven 1 cada uno.
3. **Dos conexiones del mismo proceso alcanzan.** La consola las trata como clientes distintos: el testigo vio la escritura a los **27 ms**.
4. **Los tres clientes ven el mismo estado**: 6 087 claves y huella idéntica.

El hecho 3 es el que convierte la opción C de SPK-ACK-POLICY —hasta entonces «una pregunta, no un mecanismo»— en algo elegible.

Contra eso, el código escrito antes de medir no funciona. `Ui24rMixerAdapter.escribir()` llamaba a `esperarConfirmacion()`, que espera que el estado confirmado marque la ruta con origen `SELF`, y eso exige un mensaje entrante que **no llega nunca**. La rama que devolvía `APPLIED` con `confirmedBy: 'ECHO'` era código inalcanzable, y toda transacción se habría detenido en su primera escritura.

Hay una segunda consecuencia, menos visible y peor: sin eco, **la conexión principal nunca ve sus propias escrituras**, así que el estado confirmado queda viejo justo en los parámetros que tocamos. El segundo cambio sobre la misma ruta comparaba contra el valor anterior y daba CONFLICT contra nosotros mismos (INV-011). Una rampa de dos pasos era imposible.

## Decisión

Una escritura se da por aplicada cuando **una segunda conexión testigo ve a la consola difundir esa ruta con ese valor** dentro de la ventana de confirmación de 500 ms. El resultado lo declara con `confirmedBy: 'WITNESS'`.

Cuatro cosas que forman parte de la decisión y no son detalles de implementación:

- **El testigo se conecta perezosamente, en la primera escritura de la sesión.** No al conectar. Hoy la aplicación está en nivel OBSERVE y no escribe nada, y ese uso no paga ni un byte de tráfico extra.
- **El testigo no escribe nunca** y no publica marcador de presencia. INV-032 arranca en solo lectura cuando ve un marcador ajeno de menos de 120 s; si el testigo publicara el suyo, la aplicación se declararía a sí misma en conflicto consigo misma.
- **Si el testigo no se puede abrir, no se escribe.** La escritura se rechaza con `REJECTED` y no sale nada por el socket. «Rechazada» es un resultado que el operador puede leer; «pudo aplicarse o no» no lo es, y mandar a ciegas lo que no se va a poder verificar contradice la cuarta regla del repositorio.
- **El valor confirmado entra al estado confirmado por esa vía**, con origen `SELF`. No rompe la regla 1 de ADR-005 —el almacén se alimenta solo de mensajes entrantes— sino que la extiende: la línea es un mensaje entrante de la consola, aunque haya llegado por el otro socket. Lo que sigue prohibido es dar algo por bueno porque lo enviamos nosotros.

El tipo lo dice: `WriteResult.confirmedBy` pasa a ser `ConfirmedByAlcanzable`, que es el vocabulario **sin** `ECHO`. `ECHO` se conserva en `ConfirmedBy` porque el diario guarda entradas escritas antes de medir esto y tienen que poder leerse, pero ya no se puede producir.

La correlación es por ruta, valor y ventana de tiempo, que es lo que ya hace `ConfirmedStateStore`. El testigo **no reusa ese almacén**: mantiene su propia lista de escrituras pendientes y ninguna copia del estado. Reusarlo habría traído la detección de avalanchas, los avisos de cambio externo y el ciclo VALID/INVALID, que sobre el testigo no significan nada, y una segunda copia de las 6 087 claves en memoria de la tablet. Lo que sí se comparte es el criterio: misma ruta, mismo valor con tolerancia `1e-9`, dentro de una ventana.

## Consecuencias

**El costo del testigo es real, y por eso se paga tarde.** Cada sesión recibe el volcado completo —del orden de seis mil claves en unos 220 mensajes, entre 112 y 158 ms; 6 665 y 6 087 en las dos sesiones medidas, o sea que **no es constante**— y después los flujos continuos: `RTA` a 30 Hz pase lo que pase, más `VU2` con señal. Sostenido durante todo un show, en una tablet, sobre la red que levanta la propia consola. Es tráfico y batería que en OBSERVE no compra nada.

- La **primera escritura de la sesión** paga la apertura del testigo y su volcado. Las siguientes no pagan nada.
- Ese retraso abre un hueco entre la comprobación previa de INV-011 y el envío, así que la comparación contra el valor esperado se repite después de tener el testigo listo.
- **El testigo no correlaciona hasta que su volcado se aquieta.** Sin eso, una escritura que repite el valor actual —revertir a lo que había, reaplicar algo idempotente— se daría por confirmada con una línea del volcado que salió de la consola antes de que la escritura existiera.
- Hay **una ambigüedad que no se puede cerrar**: el testigo confirma que la consola difundió esa ruta con ese valor, no que la línea sea nuestra. Si otro cliente escribe lo mismo al mismo tiempo, no hay forma de distinguirlo, porque el protocolo no identifica al emisor. Y confirmar tampoco prueba que ese siga siendo el valor actual: una escritura ajena posterior, dentro de la misma ventana, llega cuando el resultado ya se resolvió. Es la misma ambigüedad que ADR-005 asume para el origen de los cambios; con este mecanismo se hereda tal cual, y la interfaz no puede prometer más que eso.
- Una sesión más que mantener viva con `ALIVE` y que reconectar. Si el testigo se cae, la escritura en vuelo queda `UNVERIFIED` de inmediato en vez de esperar el plazo entero, y la siguiente escritura lo vuelve a abrir.
- Queda habilitado lo que estaba bloqueado: `escribir()` puede devolver `APPLIED`, y con eso las transacciones de más de un cambio y el retroceso verificado de INV-002.
- La tabla parámetro a método de confirmación de SPK-ACK-POLICY ya no necesita mezclar familias: el testigo cubre cualquier parámetro, con medidores o sin ellos.

## Alternativas descartadas

- **Eco de la propia escritura.** No existe. Seis segundos escuchando, cero líneas. Es el hecho que motiva todo lo demás.
- **Relectura por `INIT`.** Confirma cualquier parámetro con certeza, y el valor nuevo aparece a los ~100 ms. Pero cada confirmación arrastra el **volcado entero de más de 6 000 claves**, contra los 27 ms y una línea del testigo. No escala a una transacción de varias escrituras ni a nada parecido a una rampa, que es R-23. Sigue siendo el mecanismo correcto para `releerEstado()`, donde lo que se quiere *es* el estado entero.
- **Medidores.** Cuestan cero porque las tramas ya llegan, pero solo confirman fader, silencio y ganancia, y solo con señal presente. No dicen nada del ecualizador, la dinámica, los envíos ni los retardos, ni de un canal en silencio. Queda disponible como confirmación adicional, no como la principal.
- **No confirmar.** `confirmedBy = TIMEOUT` y aviso «no verificable» por cada cambio. Cuesta cero y deja todo parámetro inelegible en automático controlado, que es adonde apunta ADR-023. Con el testigo medido en 27 ms, aceptar eso sería renunciar al destino del producto por no abrir un socket.
- **Abrir el testigo al conectar.** Simplifica el código —desaparecen la apertura perezosa y la segunda comprobación de INV-011— y le cobra a un uso que solo observa el volcado completo y dos flujos continuos durante todo el show. Se prefirió el código más largo.
