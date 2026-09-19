# Dónde quedamos — 2026-09-19

**Para quien retome, en cualquier sesión.** Reemplaza a
[`2026-09-18-donde-quedamos.md`](2026-09-18-donde-quedamos.md) en lo que cambió.
Las listas de tareas **siguen viviendo en**
[`2026-09-17b-donde-quedamos.md`](2026-09-17b-donde-quedamos.md) —este documento
apunta a ellas en vez de copiarlas— y sigue en pie el estado del banco, el
hallazgo del servicio de audio de la Mac, y lo que el usuario pidió sobre cómo
trabajar.

## Lo primero, porque manda sobre todo lo demás

**El usuario cortó una deriva y dejó una regla nueva.** La jornada empezó
revisando un documento y derivó en seis commits y cuatro rondas de auditoría
sobre el bus de análisis, la matriz y la clasificación de claves. Su frase:

> *«no quiero que salgamos de nuestra hoja de ruta y medir cosas que serán
> inútiles, necesito que mantengamos el foco para lo que se necesita para el
> MVP»*

**Y tenía razón medida: de los nueve hallazgos de esa deriva, ninguno estaba en
el camino de la pieza 1.** La auditoría encontraba defectos reales y cada ronda
encontraba más, pero todos en partes del sistema que el MVP no toca.

**La regla que deja:** un hallazgo cierto no es una tarea si no toca la pieza en
curso. Va al backlog y se sigue. Auditar sigue siendo obligatorio, pero manda
sobre **cómo** se valida lo que se hace, no sobre **qué** se hace.

## Lo que se hizo: tres tareas de la pieza 1, tres commits empujados

La rama es `claude/soundcraft-ui24-assistant-kh8ezj` y está sincronizada. El
árbol está limpio. **No se abrió ningún PR**: nadie lo pidió.

El usuario las pidió **de seguido**, en este orden, y el orden era el correcto:
cada una sostiene a la siguiente.

### 1. `f7a5f7b` — las mediciones de la sesión llegan al historial

`historialDeLaSesion` decide si entre un paso y el siguiente **se escuchó de
verdad** resolviendo `medicionPosteriorId` contra la lista de mediciones que
recibe. Los dos servicios de producción le pasaban `[]`.

Con la lista vacía **ninguna ruta queda nunca con escucha comprobada**, así que
el segundo cambio sobre el mismo parámetro se rechazaba siempre. Una cuña se
levanta en pasos de 2 dB escuchando entre uno y otro: **el segundo paso no
llegaba nunca**. Frenaba, no aflojaba, pero frenaba justo la rampa que la hoja de
ruta pide construir.

`MedicionesService` lee la tabla `measurement`, que estaba en el esquema desde la
primera migración y que nadie leía. Sin `ORDER BY` a propósito —el consumidor
indexa por identificador, y ordenar por `timestamp` en SQL sería ordenar texto—.

**Y hay una guarda, porque los tests no alcanzaban.** Los tests prueban que el
historial cambia de veredicto con y sin mediciones, pero **ninguno falla si
alguien vuelve a escribir `[]` en el servicio**: prueban el historial, no el
cableado, y este repositorio no monta el inyector de Angular en ningún test.
`tools/docs/validate-mediciones-al-historial.mjs` mira qué se le pasa desde
producción, corre con `verificar`, y está probada contra su caso motivador.

**Y una afirmación que se escribió acá y era falsa**, corregida por la auditoría
del cierre: se dijo que «la base ya impide una medición huérfana» porque SQLite
rechazó la fila en el test. Es cierto **en el test** —`node:sqlite` activa las
claves foráneas— y falso en la aplicación, que **nunca ejecuta `PRAGMA
foreign_keys = ON`**. El cruce por sesión de `escuchaComprobada` sigue siendo la
única defensa real.

### 2. `de4df69` — la cuña apagada se puede levantar

**Era el último pedazo de ADR-034 que el motor no hacía.** Desde el crudo del
silencio la ley medida da −∞, y la atadura del origen no aceptaba **ningún**
punto de partida declarable: un número finito no coincide con −∞, y −∞ no es un
número finito. Una cuña apagada no se podía levantar por ninguna vía.

Dos piezas, y **ninguna concede sola**:

- La **atadura nombra** el borde con `ORIGEN_EN_SILENCIO` y le pasa al motor el
  mínimo escribible leído de la ley. Sigue devolviendo `atada: false`, porque de
  verdad no hay nada que atar. Conceder ahí sería que la guarda se autorice a sí
  misma.
- El **motor decide**, exigiendo que la clase sea el envío a monitor y que el
  destino sea exactamente ese mínimo. Cualquier otra cosa cae con
  `SALIDA_DEL_SILENCIO_NO_PERMITIDA`.

**Tres condiciones estrechas:** es el origen y no el destino —−∞ como destino
sigue siendo `MAGNITUD_NO_NUMERICA`, porque apagarle la cuña a un músico por esta
puerta sería lo contrario—; la ley dice que el crudo de partida **es** silencio;
y **el llamador lo declara**. Declarar un finito estando en silencio sigue cayendo
donde caía: el caso con nombre propio pide decir la verdad, no lo deduce.

Es **el único sitio del motor donde el tope por paso no se aplica**, y el motivo
lo escribió ADR-034: el delta es infinito y lo que acota es el destino.

**Y acá la primera versión tenía el defecto más grave del día, corregido antes de
cerrar:** saltear el tope por paso se implementó salteando el bloque entero, o sea
también la escucha, el acumulado y el techo. La auditoría midió **veinticinco
salidas del silencio seguidas sin una sola escucha**. Hoy hay una condición más:
salir del silencio es **el primer cambio de esa ruta en la sesión** o no es nada.
Eso es lo que hace verdadera la frase «la puerta se cierra sola» **en el motor**,
que es donde tenía que ser verdadera; antes dependía del adaptador, dos pasos más
abajo y después del veredicto.

**Una afirmación retirada donde estaba:** un test afirmaba que este borde estaba
cerrado y que eso era correcto. No se borró, se partió en dos.

### 3. `99aa585` — el asistente de monitor ya sabe subir

El motor sabía distinguir poner el nivel de retocarlo desde el 2026-09-17 y salir
del silencio desde el 18; **lo que no existía era quien lo propusiera**.

**Función nueva y no un signo en la que baja**, porque `puedeBajarEnvioAMonitor`
cita al usuario diciendo «esta función sólo baja», y porque las dos direcciones no
son simétricas: subir tiene el techo en nominal, el borde del silencio, y la
escucha entre pasos. Comparten la ley, que se importa en vez de copiarse.

Los números salen de `LIMITES.MONITOR_AUX_SEND`, no escritos a mano. El techo se
**rechaza en vez de recortar en silencio**: una cuña que queda más abajo de lo
pedido sin avisar es una sorpresa, y el músico pregunta por qué no subió.

**`subir()` no ancla techo, al revés que `bajar()`.** El techo por ruta existe
para devolver una cuña adonde estaba después de que la aplicación la bajó;
anclarlo al subir convertiría cada subida en permiso para seguir subiendo.

**El servicio se renombró antes de heredar el problema:** `BajarEnvioService` con
un método `subir()` sería el mismo defecto que se acababa de evitar en el
asistente. Hoy es `EnvioAMonitorService`, y **ninguna pantalla lo llama todavía**.
El commit dijo que costó cuatro referencias: eran dos en código y **quedaron
cuatro muertas en documentación**, que la auditoría encontró y se corrigieron.

**Y se probó de punta a punta, que es la lección de esta sesión.** Además de los
tests del asistente —la mayoría ataques— y los de la ley real, hay **dos que arman
el `CambioPropuesto` exactamente como lo arma el servicio y lo pasan por
`SafetyEngine.evaluar`**. (El commit dio tres cuentas de tests que no daban, y la
auditoría las corrigió: acá se dice cuáles hay sin inventar un total.) Son los que más importan: el 2026-09-18 se
midieron dos funciones sueltas, se concluyó sobre el sistema, y la conclusión era
falsa porque la cadena se rompía en un eslabón que ninguna de las dos tocaba.

## La auditoría del cierre, que encontró once defectos con la suite en verde

**Acotada al MVP y a las herramientas, como el usuario pidió.** Corrió la rampa
entera contra el motor real y el resultado importa como producto:

> **Con mediciones de verdad, la rampa llega: 17 escrituras desde la cuña apagada
> hasta −0,138 dB.** Ningún paso se traba por algo imprevisto. Como está la
> aplicación hoy —nadie escribe mediciones— **son una escritura y para**, con
> `SIN_MEDICION_INTERMEDIA`, que es exactamente lo que los commits dicen.

**Y no llega a nominal exacto: se queda a 0,138 dB.** No es un defecto, es la
decisión de rechazar en vez de recortar; pero **la pantalla tiene que saber pedir
el resto**, porque con pasos fijos de 2 dB el cero es inalcanzable. Eso es un
requisito de la pieza que sigue y no estaba dicho en ninguna parte.

### Lo que encontró y se arregló en el acto

- **El peor, y era mío: salir del silencio salteaba cuatro comprobaciones, no
  una.** El commit y ADR-034 decían que sólo se salteaba el tope por paso.
  Medido: también la escucha, el acumulado y el techo absoluto. **Veinticinco
  salidas del silencio seguidas sin una sola escucha.** No escalaba el nivel —el
  destino es siempre el mínimo— pero convertía una puerta de un solo uso en una
  que se empujaba indefinidamente, y el freno real quedaba en el adaptador,
  después del veredicto. Hoy la condición que faltaba está puesta: **salir del
  silencio es el primer cambio de esa ruta o no es nada.**
- **Un test afirmaba en el nombre algo que no probaba.** «La puerta se cierra
  sola» sobrescribía el origen con un valor finito, así que lo que evaluaba era
  un paso normal. Reescrito, más una ráfaga de 25.
- **La guarda nueva se burlaba por seis vías.** Comparaba contra `[]` exacto:
  `[ ]`, una aserción de tipo, `new Array()`, un comentario pegado y **el archivo
  movido a otro paquete** pasaban en verde. Y el centinela anti-renombre se
  satisfacía con una mención en un comentario. Arregladas cinco de seis y la
  sexta —una variable local que valga vacío— queda dicha con todas las letras.
- **El asistente contestaba que sí a un pedido de bajar**, desde el silencio: la
  rama del silencio se adelantaba a la comprobación. Inocuo para el producto,
  pero el nombre de la función mentía.
- **«La base garantiza que no hay mediciones huérfanas» es falso en la
  aplicación.** Es cierto en el test —`node:sqlite` activa las claves foráneas—
  y la aplicación **nunca ejecuta `PRAGMA foreign_keys = ON`**, cosa que el
  propio repositorio ya tenía escrita en otro archivo.
- **Una fila de medición ilegible tiraba las tres pantallas.** El `JSON.parse`
  sin capturar hacía subir la excepción hasta rechazar subir, bajar y aplicar
  ganancia. Hoy se descarta la fila: se falla hacia frenar, que es el mismo lado
  al que fallaba la lista vacía.
- **El SQL del servicio vivía duplicado en el test**, así que nadie ejercitaba la
  consulta real. Ahora vive en su propio archivo, por el mismo motivo que
  `LEY_DEL_ENVIO`: el decorador de Angular no se puede importar desde un test.
- **Tres cuentas de tests falsas en los mensajes de commit** y **cuatro
  referencias muertas** que el rename dejó en documentación.

### Lo que la auditoría confirmó

Que no se puede pasar de nominal encadenando; que el alias con ceros no esquiva
nada; que en SHOW no se enciende una cuña; que el destino desde el silencio no se
puede estirar ni 0,001 dB; y que **un delta infinito no envenena la cuenta de la
sesión**, porque el historial ya descartaba los deltas no finitos.

## Lo que falta de la pieza 1

**Una sola cosa: la pantalla por músico.** Se elige a alguien y se ve su cuña con
todo lo que le llega, su propio instrumento primero. Y **es la que trae el acto de
marcar «así está bien»**, que es lo que hoy no existe.

**Y le quedó un requisito nuevo, que salió de la auditoría:** con pasos fijos de
2 dB nominal es inalcanzable —la rampa se queda a 0,138 dB—, así que la pantalla
tiene que saber **pedir el resto** en el último paso.

Es la que cierra los dos huecos que quedan abiertos:

1. **Nadie marca todavía un nivel como establecido**, así que toda cuña vive
   permanentemente en la primera operación de ADR-034: sin presupuesto acumulado,
   acotada por el techo de nominal, los 2 dB por paso y la escucha obligatoria.
2. **Nadie escribe en la tabla `measurement`.** La lectura ya está hecha y
   cableada; falta que la pantalla **guarde** la medición y **anote su
   identificador** como `medicionPosteriorId` de la transacción. Hasta entonces la
   lista sigue llegando vacía y la rampa se frena en el segundo paso —ahora por
   falta de dato, no por falta de código—.

El servicio de ganancia tiene la misma mitad suelta y está dicho en su código: ya
vuelve a medir después de aplicar y **no guarda lo que mide**.

## Lo que hay abierto, fuera de la pieza 1

Las listas siguen en
[`2026-09-17b-donde-quedamos.md`](2026-09-17b-donde-quedamos.md). Y están los
**nueve hallazgos del 2026-09-18** en
[`hallazgos-de-la-auditoria-del-censo-2026-09-18.md`](../backlog/hallazgos-de-la-auditoria-del-censo-2026-09-18.md),
uno cerrado.

**Ninguno de los nueve está en el camino de la pieza 1**, y por eso se quedaron
anotados. El más accionable el día que se retomen: el compresor y la puerta de
los auxiliares —190 claves— se rechazan **citando un motivo falso**, que la ruta
no se conoce cuando sí se conoce.

## El estado del equipo del usuario

**Esta sesión no midió nada con audio y no le escribió nada a la consola.** El
banco sigue como el 2026-09-16. El último volcado comparado es el del 2026-09-18:
6665 claves, cero diferencias.

Sigue valiendo:

- **El servicio de audio de la Mac se traba y el síntoma se lee como un permiso
  denegado.** Se cura con `sudo killall coreaudiod`, lanzable por SSH. Ver
  [el hallazgo](../backlog/hallazgo-el-audio-de-la-mac-se-traba-y-parece-un-permiso.md).
- **El usuario opera la MacBook a distancia**, por SSH y AnyDesk. No se puede mover
  ningún cable del banco ni tocar la perilla de la Scarlett hasta que vuelva.
- **Antes de meter tonos sostenidos, mirar las cuatro claves del supresor que están
  en 1**: la global, la de la mezcla y las de los auxiliares 1 y 2, que son cuñas.
- **Nunca borrar los snapshots guardados.** Es la única prohibición absoluta.
- **El fader del canal no llega a las cuñas**: los 320 envíos a auxiliar están
  antes del fader. Lo que sí llega es el ecualizador.
- **Hay dos pares estéreo activos**: las entradas de línea y el reproductor.

## Cómo arrancar la próxima sesión

El prompt para pegar después de un `/clear` está en
[`2026-09-19-prompt-para-retomar.md`](2026-09-19-prompt-para-retomar.md).

**Y hay que escribírselo en el chat, no sólo dejarlo acá.** Lo pidió el
2026-09-19: *«los prompts para retomar tarea necesito que lo escribas aquí para
que lo copie, de otra forma tengo que abrir el archivo (...) y si estoy en sesión
remota no tengo acceso a ese archivo»*. Trabaja por SSH y AnyDesk, así que un
entregable que tiene que **copiar** y que vive sólo en un archivo es un
entregable que no le llegó. El archivo queda para auditar; la copia va en la
respuesta.
