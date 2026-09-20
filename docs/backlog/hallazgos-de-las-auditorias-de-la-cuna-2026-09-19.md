# Lo que dejaron abiertas las dos auditorías de la escucha de la cuña

**2026-09-19, segunda tanda.** Salieron de auditar `56eaf6e` y `7ab9c59` —los dos
commits que hicieron que la cuña de un músico se escuche con **dos** medidores—.
Lo que **tocaba esa pieza** se arregló en el acto; lo que no, se anota acá en vez
de meterse en la tarea que lo encontró.

Las dos auditorías corrieron sobre la cadena completa —trama `VU2`, adaptador,
mapeo, `INSERT` real, `SELECT` real, `historialDeLaSesion` y `SafetyEngine`—
contra SQLite real con el esquema de la migración. **Ninguna tocó la consola del
usuario.**

**Nada de esto está expuesto hoy**: ninguna pantalla llama a subir ni a bajar una
cuña. Pero los tres primeros se activan **con la pieza que sigue**, no en un
futuro lejano.


> ## ESTOS HALLAZGOS ESPERAN AL CAMPO
>
> **Decidido el 2026-09-20, y está en la hoja de ruta.** Todo lo que sigue está
> **medido, con sus números y su daño máximo**. Eso es casi todo lo que un hallazgo
> rinde. Lo que decide si además hay que **arreglarlo** no es leerlo de nuevo: es
> que aparezca en un soundcheck de verdad.
>
> **Ninguno de éstos es una tarea hasta entonces.** El motor acota el envío a
> monitor a 4 dB por sesión con techo en nominal, así que el daño de los peores es
> **dos pasos de 2 dB** sobre una cuña, con el usuario parado ahí escuchando.
>
> **Mientras haya una pieza de la hoja de ruta que todavía no existe, esa gana.**
> Ver «La regla que manda sobre esta tabla» en
> [`2026-09-17-recapitulacion-y-hoja-de-ruta.md`](../pedidos/2026-09-17-recapitulacion-y-hoja-de-ruta.md).

---

## 1. Un escalón basta, y el ambiente entre frases cuenta como música

> **NO CERRADO. Se intentó el 2026-09-19 y la auditoría adversarial midió que no
> alcanza.** Lo que sí quedó cerrado es la fila del medio --el ambiente **por
> debajo** del músico ya no cuenta: dos segundos de música con ambiente abajo
> declaran dos--. Lo que **no**: la ventana en que **nadie toca y hay sala viva**.
>
> **Medido con la cadena completa, ambientes correlacionados como se mueve un
> medidor de sala de verdad, sin que nadie toque una nota:**
>
> | la sala sola | declara | motor |
> |---|---|---|
> | canal −45 dB, cuña −30 dB | 14,00 s | **concede** |
> | canal −40 dB, cuña −25 dB | 16,25 s | **concede** |
> | canal −50 dB, cuña −35 dB | 13,40 s | **concede** |
> | canal −38 dB, cuña −28 dB | 11,75 s | **concede** |
>
> **Por qué.** Con nadie tocando, el pico de la ventana **es** el ambiente, así
> que la vara relativa de 20 dB no filtra nada --está escrito como límite
> conocido-- y queda sola la de movimiento, y 3 dB en medio segundo los recorre
> cualquier micrófono abierto con gente alrededor. **La frontera está entre 3,8 y
> 4,0 dB pico a pico** con ambiente uniforme. El nivel absoluto es irrelevante: el
> mismo ambiente a −55, −45, −35 y −25 da el mismo veredicto. **Y funciona igual
> por el camino de la ganancia**, con un solo medidor: canal −45 dB → 14,40 s.
>
> **Y una variante con un solo tic de música:** un golpe a −14 dB con la sala a
> −31 dB --17 dB de distancia, combinación normal de escenario-- declara
> **17,95 s** y concede. Con la sala a −45 o −58 el ataque se cae, o sea que el
> corte relativo sí trabaja; lo que no alcanza es él solo.
>
> **El test que tenía que cazarlo no lo caza, y es la parte instructiva.** Está
> escrito en él mismo: «si alguna vez pasa a PERFORMANCE, la vara relativa quedó
> sola». Ya está sola. No se ve porque ese test eligió un ambiente de 2 dB pico a
> pico, **justo por debajo del corte**: el dato de prueba es más manso que la
> realidad. Es el mismo género de agujero que este repositorio ya pagó, cometido
> al escribir la defensa contra él.
>
> **Lo que la auditoría también mostró, y decide qué sigue:** lo que separa a una
> sala tranquila no es cuánto se mueve sino **qué tan despacio** --una deriva lenta
> no pasa ni con mucho recorrido; una sala viva pasa con poco--. O sea que **desde
> un solo medidor, «el músico tocó» y «su micrófono tomó la banda» se ven
> iguales**, y ninguna vara sobre esa serie los separa.
>
> **Decisión del usuario del 2026-09-19, y es lo que sigue:** comparar contra una
> **ventana de referencia** del mismo canal, tomada con el músico callado a
> propósito antes de empezar. Es «primero medir, después corregir» aplicado bien, y
> es una pieza nueva.
>
> **El radio de daño mientras tanto, para dimensionarlo:** el motor acota el envío
> a monitor a 4 dB por sesión con techo en nominal, así que son **dos pasos de 2 dB**
> concedidos sobre una escucha que no existió, no la rampa entera.

**MEDIDO, y es HEREDADO de la escucha de ganancia, no lo trajo esta pieza.**

Las dos preguntas que deciden si hubo escucha se apoyan en cosas distintas y
flojas:

- **«El medidor se movió»** es un `max > min` sobre la ventana **entera**: un solo
  escalón de **0,3334 dB** en cualquiera de los 360 instantes la satisface.
- **«Sonaron a la vez»** sólo pregunta **presencia** por encima del piso de ruido,
  no movimiento.

Con eso, todo instante en que los dos medidores estén sobre −60 dB cuenta como
escucha, aunque no pase nada. Medido:

| escenario | música real | declara | señal | motor |
|---|---|---|---|---|
| Las dos series planas con **un solo escalón** en la muestra 7 | 0 s | **18,00 s** | `PERFORMANCE` | **permite +2 dB** |
| El músico toca 2 s y el resto es ambiente a −58 dB en los dos | 2,0 s | **18,00 s** | `PERFORMANCE` | **permite +2 dB** |
| La cuña la mueve **otra fuente** y el aporte de este canal es despreciable | este músico no se oye en su cuña | **18,00 s** | `PERFORMANCE` | **permite +2 dB** |

**Comprobado que es heredado:** la misma ventana por el camino de la ganancia
—sin cuña— también da `PERFORMANCE` y 18,00 s. O sea que el defecto viene del
2026-09-19 por la mañana y esta pieza lo arrastró, no lo creó.

**Y hay una frase de ADR-036 que hay que leer más floja de lo que está escrita.**
El ADR dice que el medidor de la cuña «prueba que le llegó». Lo que prueba,
medido, es que **algo** llegó al parlante: el medidor del auxiliar es la suma del
bus y no distingue la voz del cantante de la guitarra que no suena. Que las dos
cosas pasen **a la vez** no dice que una haya causado la otra, y en una cuña con
una voz adentro pasan a la vez siempre. La tabla del ADR ya dice esto en su fila
del medio; la prosa alrededor promete más.

**Plausibilidad: alta.** Toda cuña de escenario tiene más de una fuente, y todo
micrófono abierto entrega ambiente por encima de −60 dB entre frase y frase.

**Rampa completa medida**, con `nivelEstablecidoEn` vacío —que es lo que escribe
producción hoy—: **16 pasos, 32 dB, de −32 hasta nominal**. Lo único que corta es
el techo. Con el nivel marcado como establecido el motor sí corta en el paso 4,
pero **nadie lo marca todavía**.

---

## 2. La caída dentro de la ventana cuesta una muestra, y cerrarla cuesta una línea

> **CERRADO el 2026-09-19**, en las dos herramientas y en el mismo commit. El
> muestreo pregunta si la consola sigue ahí **en cada tic** —no una sola vez al
> final— y **no registra el instante que no pudo oír**: ni un cero, que afirmaría
> que no sonó, ni el último valor conocido, que afirmaría que sigue sonando. Como
> la escucha se cuenta por muestras, lo que la aplicación no oyó sale solo de la
> cuenta. Decisión del usuario entre tres opciones: **descontar lo que no se oyó y
> seguir**, en vez de abortar ante cualquier corte; y los dos servicios devuelven
> además **cuántos segundos no se pudieron oír**, que es lo que separa «no te
> escuché» de «no tocaste». Lo vigila una sexta regla de
> `validate-escucha-anotada.mjs`, que exige la consulta **adentro del bucle**
> porque la regla anterior —mirar el archivo entero— la cumplía la versión con el
> defecto puesto. Probada mutando: con la consulta fuera del bucle, en rojo en los
> dos archivos.

**MEDIDO.** El enlace se cae, los dos medidores quedan clavados, y vuelve antes de
terminar la ventana, así que la comprobación del final da que sí:

| muestras vivas | declara | señal | motor |
|---|---|---|---|
| 0 (0,00 s) | 18,00 s | `SILENCE` | niega |
| **1 (0,05 s)** | **18,00 s** | `PERFORMANCE` | **permite +2 dB** |
| 10 (0,50 s) | 18,00 s | `PERFORMANCE` | permite +2 dB |

**Una sola muestra viva compra el paso.** Es el defecto que el 2026-09-19 se midió
como «17,95 s con cero segundos de música», movido de sitio: antes lo tapaba el
medidor congelado, ahora un escalón lo destapa.

**Y el precio de cerrarlo estaba mal estimado en el código, que decía que pedía
mirar la frescura de las tramas y era una tarea aparte.** No: `permiteEscribir()`
**ya es falso durante toda la caída** —el estado confirmado se invalida con
cualquier estado que no sea conectado y no vuelve hasta un volcado completo—. Lo
que falla es que la captura lo consulta **una sola vez, al final**, mientras el
muestreo ya corre cada 50 ms. Consultarlo ahí cierra el caso **sin ningún
mecanismo nuevo**. La línea no se escribió porque cambia el comportamiento y no
era la tarea en curso.

**Y esta frase decía «el comentario falso ya se corrigió», que era falso de la
misma forma que el comentario.** Se corrigió **uno** de cinco. La frase
retractada seguía escrita en el molde de la escucha, en el asistente de
ganancia, en ADR-036 y en el hallazgo 2 de la tanda anterior —donde además
proponía el mecanismo caro con nombre y apellido—. Las cuatro quedaron marcadas
como retractadas el 2026-09-19, en su sitio y con qué las hizo caer, que es lo
que este repositorio pide en vez de borrarlas.

**La lección no es «corregir mejor».** Es que **una corrección no se declara
hecha sin contar las copias**, y contarlas es un `grep` de un término que no
aparece en ningún otro contexto —acá, «frescura»—. La frase que se retractó
había llegado a cinco lugares por copia; la que decía haberla arreglado se
escribió mirando uno. Es la misma forma de la sesión de la mañana, donde una
afirmación falsa vivía en cinco sitios: **lo que se repite se pudre en bloque, y
el que lo corrige ve sólo el sitio que tenía abierto.**

Variante igual de barata: que deje de llegar **la cola** de la trama mientras el
canal sigue actualizándose. Cuña realmente medida 2,0 s de 18 → 18,00 s
declarados.

---

## 3. Una sola escucha autoriza el segundo paso en tantas rutas como se anoten

**MEDIDO: 8 de 8 rutas** con una sola ventana honesta de 18 segundos. Es el mismo
hallazgo que el número 1 de la tanda anterior —el motor no cruza el canal de la
medición contra la ruta— y **no hace falta abrirlo dos veces**; se anota acá
porque cambió de tamaño.

**Por qué ahora importa más.** Con la ganancia, reutilizar pedía mala fe: una
captura era por canal. La pieza que sigue —la pantalla por músico— escucha **una
vez** y tiene a mano varias rutas del mismo músico, y `escuchar()` devuelve un
único identificador que `anotarEscucha` acepta cuantas veces se lo llame. Anotar
el mismo identificador en dos transacciones no se leería como trampa: se leería
como no repetirle la cuenta regresiva al músico. **Es el error que la pieza
siguiente está invitada a cometer.**

*Refutado, y conviene decirlo:* reusar la misma medición para un segundo paso de
la **misma** ruta no funciona; lo rebota la condición de que la medición no sea
anterior al último envío. Sólo sirve **en paralelo, entre rutas**.

---

## 4. `duracionS` dejó de describir la ventana, y el motor la usa para dos cosas

**MEDIDO, y HEREDADO.** Desde que `duracionS` es «cuánto sonó» y no «cuánto duró
la ventana», la condición que comprueba que **la ventana haya terminado** —que
hace `timestamp + duracionS`— mide otra cosa. Con una escucha honesta de 18
segundos de ventana y 10,0 de música, el motor da la ventana por terminada **a
los 10,0 s, ocho segundos antes** de que termine de verdad.

Hoy no está expuesto porque anotar ocurre después de guardar y el `await` lo
serializa. Pero esa condición existe textualmente para «convertir un campo
declarado en tiempo transcurrido de verdad», y quedó recortada en la diferencia
entre la ventana y la música.

---

## 5. El adaptador nunca olvida el nivel de una cuña, y la cuenta nunca baja

**MEDIDO.** `auxiliaresDetectados` sólo crece, y los niveles de cuña no se limpian
nunca —ni al desconectar, ni al reiniciar picos—:

```
con 10 cuñas a 0,9        -> 10 cuñas, aux 1 en -7,99 dB
tras 40 tramas SIN cola   -> 10 cuñas, aux 1 en -7,99 dB   (el dato es de hace 40 tramas)
```

`auxiliares()` no distingue «esto lo acabo de leer» de «esto es de hace dos
segundos». **Por sí solo falla cerrado** —un valor clavado no se mueve, así que da
silencio— pero es el material del hallazgo 2. Es además el mismo comportamiento
que tienen los canales, así que arreglarlo es una decisión sobre los dos.

---

## 6. El decodificador de buses promete más de lo que cumple

**MEDIDO, y es ANTERIOR a esta pieza** —del 2026-09-09—, pero desde `56eaf6e`
alimenta la aplicación en marcha y no sólo los guiones de medición.

Su docblock dice: *«Devuelve listas vacías si la trama es más corta de lo que su
propia cabecera promete: preferimos no informar antes que informar un byte de otra
sección»*. **No es cierto para los auxiliares**: cuando una sección no entra, el
desplazamiento no avanza, y la siguiente —con paso 5 en vez de 7— sí puede entrar
en los bytes que sobran.

```
cabecera 24/2/6/4/1 aux, trama cortada en 169 bytes
  -> aux = 1, nivel -60,0 dB, que son los bytes del SUBGRUPO 1
     (la cuña de verdad estaba en -40,0 dB)
```

**Plausibilidad baja** —pide una trama truncada y una cabecera con pocos
auxiliares; con los diez de esta consola no se manifiesta— pero la garantía
escrita es más fuerte que la que el código da.

---

## 7. La cuña pudo haberla movido OTRO músico, y nada lo distingue

**MEDIDO, y es hallazgo propio desde el 2026-09-19.** Estaba nombrado dentro del
hallazgo 1 como «su tercera fila» y una corrección lo mandaba a leer al hallazgo 3,
**que trata de otra cosa** --que el motor no cruza el canal de la medición contra
la ruta--. Son la misma familia, ADR-035, pero no el mismo hallazgo, y mandar al
lector a un sitio que no lo dice es peor que no mandarlo: lo cazó una auditoría de
fidelidad.

El medidor del auxiliar es **la suma del bus**. Que el músico toque y que su cuña
se mueva **a la vez** no dice que una cosa haya causado la otra, y en una cuña con
una voz adentro pasan a la vez siempre. Medido con dos series que no tienen nada
que ver entre sí --canal y cuña moviéndose con ritmos distintos--: **concede igual**.

Hay un test que lo deja escrito, `LÍMITE ESCRITO: la cuña movida por OTRA fuente
sigue concediendo`, para que se vea en la suite en vez de suponerse.

**Lo cierra la misma pieza que el hallazgo 1**: una ventana de referencia por
canal. Con la referencia, «este canal subió respecto de su propia sala» es
comprobable; sin ella, no.

---

## 8. El límite «una fuente quieta no cuenta» vale menos de lo que dice

**MEDIDO el 2026-09-19.** El límite está escrito como «una fuente perfectamente
quieta no cuenta, aunque suene», y el test lo prueba con una fuente **continua**.
Medido: la misma fuente plana de −35 dB, sin un decibel de textura propia,
**encendida 500 ms y apagada 250 ms declara 11,75 s y concede**; 600/200 da 11,00
y concede; 300/200 da 10,75 y concede. Continua, en cambio, da silencio.

El motivo: el movimiento se mide **contra el silencio de al lado**, no contra la
textura de la fuente. El mínimo y el máximo de la vecindad incluyen muestras que
están excluidas de **contar** pero no de **medir**. O sea que la tercera pregunta
no comprueba «la fuente hizo algo» sino «este valor es distinto del de al lado».

**No es explotable por sí solo** --una compuerta que abre y cierra es alguien
haciendo ruido-- pero el límite está escrito con más alcance del que tiene.

## 9. `duracionS` son muestras × 50 ms, y nada lo ata al reloj

**MEDIDO.** 400 muestras en una ventana de 18 s declaran **20,00 s** y conceden;
720 declaran 36,00 y conceden. **No es alcanzable hoy** --`setInterval` no encola
disparos perdidos, así que el muestreo no puede sobrepasar los 360 tics-- pero la
condición del motor que comprueba que la ventana terminó usa ese número **como
tiempo transcurrido**, y el invariante «muestras ≤ ventana ÷ intervalo» no está
asertado en ningún lado ni tiene test. Es el mismo género que la auditoría del
2026-09-18 ya explotó con `duracionS` declarado.

## 10. Cancelar una escucha igual guarda una fila y deja la pantalla en «lista»

**LECTURA DE CÓDIGO, no medido.** `cancelar()` resuelve la cuenta regresiva, así
que el `await` de `escuchar()` **continúa**: sigue con las series vacías, pone el
estado en `LISTA` --pisando el `INACTIVA` que acababa de poner `cancelar`-- y
guarda una medición de silencio de 0 s. El veredicto **falla cerrado**, así que no
es un agujero de seguridad; lo que queda mal es la pantalla --cancelar termina
mostrando «lista»-- y una fila espuria por cancelación. Además, entre el cancelar y
el final de la cola, una segunda escucha puede arrancar y la cola de la primera le
pisa el estado.

**Lo estrena la pantalla por músico**, que es la que va a tener el botón de
cancelar.

## Lo que las auditorías confirmaron que está bien

Vale anotarlo, porque un ataque refutado también es información:

- **Series vacías, en cualquiera de las dos o en las dos:** silencio, 0,00 s, el
  motor niega. Y el muestreo **no empuja ninguna si falta una**, así que las series
  no se pueden desalinear por el camino de producción.
- **Auxiliar que no existe, o lista de cuñas vacía:** no se empuja nada, ni siquiera
  el canal. Falla cerrado.
- **`NaN`, `Infinity` y `−Infinity` en cualquiera de las dos series:** los filtran
  las dos funciones con `Number.isFinite`. No hay `NaN` que conceda — que es la
  familia de defecto que este motor ya tapó tres veces.
- **Reusar una medición para un segundo paso de la misma ruta:** rebotado.
- **Las cuatro afirmaciones de mutación de los mensajes de commit** se
  reprodujeron exactamente, mutando de verdad.
- **Las cuatro afirmaciones sobre los cuatro repositorios de terceros** se
  comprobaron clonando y grepeando: las cuatro exactas, byte a byte en el caso del
  reparto de la cola de `fmalcher`.
