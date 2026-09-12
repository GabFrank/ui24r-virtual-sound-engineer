# ADR-027 — Silenciar un canal para diagnosticar, en soundcheck

**Estado:** Aceptada
**Fecha:** 2026-09-11
**Origen:** Decisión del usuario, al diseñar el diagnóstico de realimentación.
Revierte, para el soundcheck, la postura de que el silencio de canal es
territorio exclusivo del usuario.

## Contexto

La aplicación tiene dos formas de acercarse a una realimentación y las dos son
**indicios**, no pruebas. El analizador dice a qué frecuencia y qué canales están
abiertos; la geometría dice qué pareja monitor↔micrófono está más expuesta.
Ninguna de las dos puede decir **cuál canal cierra el lazo**.

Hay una tercera que sí puede, y es un experimento en vez de una correlación:
**silenciar un candidato y ver si la banda sostenida se cae.** El usuario lo
planteó así, y agregó el argumento que faltaba: *total es un soundcheck y eso es
normal en estas condiciones*.

El motor de seguridad no lo permitía. `CHANNEL_MUTE` estaba como `USER_ONLY` y no
escribible: de las 6732 claves de la consola, **ninguna ruta de silencio de canal
pasaba el motor**.

## La decisión, y el argumento del usuario

**El bloqueo existía pensando en un modo de show que hoy no existe**, y que el
usuario describe como una función muy futura, si es que llega. Durante un
soundcheck, silenciar un canal para probar algo es lo más normal del oficio.

Se abre `CHANNEL_MUTE` a la aplicación, **con estas condiciones**:

1. **Sólo en los estados de configuración y de mezcla**, nunca en los estados en
   vivo (`FULL_BAND`, `RINGOUT`, `SHOW`). Es la misma forma de la restricción que
   INV-006 ya aplica a la ganancia.
2. **Con punto de retorno** antes de la transacción, como cualquier otra
   escritura (INV-001).
3. **Con confirmación de cada escritura** por la conexión testigo, y restauración
   comprobada por un camino distinto del que escribió.

## Lo que el diagnóstico NO va a hacer, y por qué no es una regla de permisos

**Nunca va a desilenciar un canal.** No porque el motor lo impida —ahora no lo
impide— sino porque **un canal en silencio no es candidato**: no llega al
general, así que no puede estar cerrando el lazo, y el buscador de culpables ya
lo descarta por eso. La prueba sólo silencia lo que estaba sonando y lo devuelve
a sonar.

Queda dicho porque hay un caso concreto donde importa. El inventario del
2026-09-11 registra que `i.8.mute` —el canal 9— está en silencio **a propósito**:
hay un condensador enfrentado a un monitor a 1,7 m, y *ese silencio es lo único
que hoy impide el acople*. Desilenciarlo monta el lazo que el silencio evita. El
diagnóstico no lo va a tocar; **cualquier otra función que algún día quiera
desilenciar tiene que mirar ese caso primero.**

## Consecuencias

- **El conteo de rutas escribibles sube de 666 a 690**, medido con
  `tools/inventario/permisos.ts`. Son exactamente **+24**: los veinticuatro
  silencios de canal de la consola, ni uno más. La regla del proyecto era que ese
  número no subiera; existía para que ampliar el clasificador no autorizara de
  contrabando. Esto es lo contrario: una autorización decidida, escrita y
  contada. **690 es el techo nuevo.**
- **El silencio necesitaba su límite declarado y eso reveló una confusión.**
  INV-004 rechaza todo parámetro sin tope, así que hubo que darle uno; pero el
  tope por transacción acota la **magnitud**, y la de un silencio es siempre 1.
  La primera versión declaró `porTransaccion: 1` creyendo que con eso silenciaba
  «de a uno», y **el test lo desmintió: dos silencios pasaban**, porque cada uno
  cumplía el tope por separado. La regla de cuántos entran en una transacción
  vive en el motor, que sí cuenta. El límite de la tabla queda igual y su
  comentario, corregido.
- **Abre la puerta a que la aplicación deje un canal mudo.** El riesgo real no es
  silenciar: es no restaurar. Por eso la restauración se comprueba por un camino
  distinto, que es lo que este proyecto ya exige para todo lo demás.

## Autorización permanente del usuario sobre esta clase de bloqueo

Dicho por el usuario el 2026-09-11, al tomar esta decisión, y anotado acá para
que sobreviva a la conversación donde se dijo:

> si futuramente aparece un bloqueo relacionado (pensando ya) al modo live,
> tienes libertad de retirarlo o que el motivo sea otro que si tiene sentido para
> nosotros

O sea: **un bloqueo cuyo único fundamento sea un modo de show que todavía no
existe se puede retirar sin volver a preguntar** — o reescribir con el motivo que
sí aplica hoy. Lo que no cambia es que el retiro se escribe, se cuenta y se
justifica, como éste.

**Esto no autoriza a retirar cualquier bloqueo.** Los que existen por otros
motivos —que el parámetro sea del usuario, que la ley no esté medida, que haya
una toma grabada— siguen necesitando su propia decisión.

## Alternativa considerada

**Que la aplicación diga a quién silenciar y lo haga el usuario a mano.** Mismo
poder de diagnóstico y cero escrituras nuevas. Se descartó porque son varios
pasos, cada uno con una espera del operador en el medio, y porque el argumento
del usuario —que en soundcheck eso es normal— vale igual para quien lo hace.
