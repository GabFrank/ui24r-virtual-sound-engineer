# Con qué criterio decide otro cuándo mover una banda

**Buscado el 2026-09-20**, antes de proponerle nada al usuario sobre la pieza 2
—el ecualizador de canal—. La pregunta de fondo que él planteó es **con qué
criterio la aplicación decide mover una banda**, y su propia frase marca el
problema: *«que suene bien» no es un número*.

**Por qué este documento existe y por qué se hizo antes y no después.** La regla
está en la disciplina del proyecto: toda propuesta lleva su sección de trabajo
previo, y el 2026-09-15 se le ofrecieron al usuario cuatro opciones sobre el
fader del general **sin haber mirado qué hace nadie más**. Su respuesta fue *«¿no
habíamos quedado en que nada iba a ser implementado antes que se investigue en
proyectos existentes?»*, y tenía razón dos veces, porque al mirar apareció que el
supresor de su propia consola ya contestaba la pregunta.

**Este documento es el complemento de
[`trabajo-previo-de-terceros.md`](trabajo-previo-de-terceros.md), no su
reemplazo.** Aquél cubre los cuatro repositorios que hablan el protocolo de esta
consola, y la conclusión de aquél vale entera: **son bibliotecas de protocolo y
clientes, no asistentes**. Ninguno decide nada sobre el sonido. Así que para esta
pregunta hubo que mirar afuera del protocolo.

---

## El resumen, antes del detalle

Hay **seis familias de criterio** en uso, y se distinguen por **de dónde sacan la
respuesta**, no por la calidad del resultado:

| # | Familia | De dónde sale la decisión | ¿Sirve para nuestro caso? |
|---|---|---|---|
| A | **Curva objetivo por instrumento** | una biblioteca escrita de antemano: «así suena una voz masculina» | **Sí**, y la consola ya trae una |
| B | **Curva aprendida del propio sonido** | un pasaje de escucha del canal real | **Sí, y es la que más se parece a lo que ya hacemos** |
| C | **Reducción de enmascaramiento** | comparar una fuente contra las otras que suenan a la vez | **No todavía**: pide oír dos canales a la vez |
| D | **Supresión de resonancias** | picos que sobresalen del propio espectro del canal | **Sí**, con el analizador de la consola |
| E | **Corrección de sala o sistema** | un micrófono de medición y ruido rosa | **No es esta pieza**: corrige la PA, no el canal |
| F | **Preajustes del usuario reutilizados** | lo que él guardó la vez anterior | **Sí, y ya lo está haciendo** |

**Y el hallazgo que más cambia la conversación:** la respuesta del oficio a «qué
banda muevo» **no es una tabla, es un procedimiento**. Sound On Sound lo escribe
así, textual: *«la forma más fácil de identificar las frecuencias que
corresponden a características tímbricas concretas es subir el control de realce
de un filtro de campana, con su Q en alrededor de tres o cuatro, y barrerlo por
el espectro escuchando cada parte del rango a medida que se realza»*, y agrega que
para arreglar un problema **conviene recortar antes que realzar**
([Using EQ](https://www.soundonsound.com/techniques/using-eq)).

**Y esa misma página, que publica su propia tabla de frecuencias por instrumento,
dice que la tabla sirve poco**: *«hay sólo un uso práctico limitado para la tabla
de la Figura 1 a la hora de aprender a ecualizar… y la única forma de aprender
esto efectivamente es pasando sonidos por un ecualizador y experimentando uno
mismo»*. Es la fuente de oficio más citada del rubro **desautorizando el uso
mecánico de su propia tabla**, y conviene tenerlo presente antes de construir la
pieza 2 sobre una.

---

## A. Curva objetivo por instrumento

**Qué decide.** Se identifica qué instrumento es, se elige su espectro ideal de
una biblioteca, se mide la diferencia contra lo que está entrando, y se ajustan
las bandas para acercarlos.

**Quién lo hace.**

- **La propia consola del usuario.** Trae **28 preajustes de ecualizador de canal
  de fábrica**, con nombre de instrumento: voz masculina 1 y 2, voz femenina 1 y
  2, coros, acústica 1 y 2, eléctrica, bajo, piano, sintetizador, bombo,
  redoblante 1 y 2, charles, aéreos de batería, tom, metales 1 y 2 —diecinueve—
  más **nueve de la serie *Vintage***. Cada uno son las cuatro bandas con
  frecuencia, Q y ganancia, más el pasa-altos. *(Su gestor muestra el logo de dbx
  en esas categorías; de ahí a decir que las curvas las firmó dbx hay un paso que
  esta página no da.)* Detalle y cómo se leen en
  [`hallazgo-los-preajustes-del-usuario-ya-estan-en-la-consola.md`](../backlog/hallazgo-los-preajustes-del-usuario-ya-estan-en-la-consola.md).
- **[sonible smart:EQ](https://www.sonible.com/smarteq4/)**, que trae **21
  perfiles de instrumento y voz** más 22 por género, y usa el perfil para
  **orientar** el aprendizaje, no como curva final.
- **Investigación académica**: [*Automatic Equalization for Individual Instrument
  Tracks Using Convolutional Neural Networks*](https://arxiv.org/abs/2407.16691)
  (DAFx24) hace exactamente esto —identifica el instrumento, elige su espectro
  ideal como objetivo, y una red predice los valores de un ecualizador
  paramétrico—. **Lo que el resumen no dice, y hay que decir que no lo dice, es
  de dónde salen esos espectros ideales ni cuántos instrumentos cubre**: se leyó
  el resumen, no el trabajo completo.

**Lo que le falta a esta familia para nuestro caso.** La lista del usuario tiene
instrumentos que **ninguna biblioteca cubre**: cinco djembes distintos, flautas
nativo americanas, maracas, y un kick de foot case. Ver la sección de
instrumento por instrumento, más abajo.

---

## B. Curva aprendida del propio sonido

**Qué decide.** No hay biblioteca: se escucha el canal un rato y se construye la
curva a partir de lo que entró.

**Quién lo hace, y el precedente más directo de todos.**

**[Waves Curves AQ](https://www.waves.com/plugins/curves-aq)**, presentado en
2025 como «el primer ecualizador autónomo». Se aprieta *learn*, escucha, y arma
la curva. **Y la arma con cuatro anclas: el grave, el fundamental, los armónicos
y el aire**
([rAVe](https://ravepubs.com/waves-audio-debuts-curves-aq-an-ai-powered-eq-plugin-that-sets-itself-up/)).

**Cuatro anclas es exactamente lo que tiene el ecualizador de esta consola**, y
eso no es casualidad de marketing: es la forma natural de repartir cuatro
campanas sobre un instrumento. Si la pieza 2 necesita una estructura para decidir
qué hace cada banda, **ésta es la que ya probó otro sobre el mismo número de
bandas**.

Waves además publica **una versión de latencia cero para vivo**, y el caso de uso
que promociona es **el de este usuario**: bandas de iglesia sin ingeniero de
sonido dedicado
([Churchfront](https://churchfront.com/2025/06/24/can-ai-mix-your-worship-band-testing-waves-aq/)).

También entra acá **[Gullfoss](https://www.soundtheory.com/gullfoss)**, que corre un
modelo de percepción auditiva y mueve el espectro continuamente; el usuario **no
elige qué resonancia tocar**, sólo el rango en el que se lo permite.

**Por qué esta familia es la que más se parece a lo que ya hacemos.** La pieza 1
—el envío a monitor— ya está construida sobre **subir un poco, escuchar, medir,
decidir**. El analizador de esta consola **se puede apuntar a un canal** y da 122
bandas de un doceavo de octava, y eso está medido contra el aparato con un
micrófono real. O sea que **el pasaje de escucha que Curves AQ hace adentro del
complemento, esta aplicación lo puede hacer con el propio analizador de la
consola**, sin micrófono de medición y sin motor de audio propio.

---

## C. Reducción de enmascaramiento

**Qué decide.** No mira un instrumento solo: mira **cuánto le tapa una fuente a
otra**, y mueve las bandas para que se estorben menos.

**Quién lo hace.**

- El trabajo canónico es **Hafezi y Reiss, *Autonomous Multitrack Equalization
  Based on Masking Reduction*, JAES 2015**
  ([AES](https://aes2.org/publications/elibrary-page/?id=17637),
  [QMUL](https://qmro.qmul.ac.uk/xmlui/handle/123456789/7804)). Arma una medida
  simplificada de enmascaramiento **a partir de las buenas prácticas del oficio**
  y ecualiza para bajarlo, con **un solo parámetro de usuario**. El resultado
  reportado: mejora la mezcla cruda **más que un aficionado y cerca de un
  profesional**.
- En producto: **MixSense de Curves AQ**, que por una entrada lateral escucha lo
  que compite y **atenúa sólo lo necesario** para que la fuente pase; y la
  función equivalente de iZotope Neutron.

**Por qué hoy no nos sirve, dicho con todas las letras.** Pide oír **dos o más
canales a la vez**. Esta aplicación no reproduce audio, no tiene micrófono de
medición, y el analizador de la consola es **uno solo y global**: elegir qué
canal analiza **le cambia la pantalla al operador**. Así que el enmascaramiento
queda como criterio conocido y **no alcanzable con lo que hay**, no como criterio
descartado.

---

## D. Supresión de resonancias

**Qué decide.** Busca picos que sobresalen del propio espectro —resonancias,
siseo, campaneo— y los baja, sólo cuando aparecen.

**Quién lo hace.** **[soothe2](https://oeksound.com/plugins/soothe2/)** es el
referente: recorta quirúrgicamente lo que sobresale y deja el resto del timbre
quieto. Es el opuesto de Gullfoss, que reparte el equilibrio entero.

**Y acá hay un precedente adentro de la propia consola.** El supresor de
realimentación dbx AFS hace esto mismo con otro objetivo: encuentra el pico que
se está yendo de las manos y le planta un filtro. Ya está documentado en este
repositorio que **sus filtros LIVE se levantan solos cuando dejan de hacer
falta**, y esa fue la respuesta a una pregunta de producto anterior. La forma
—medir el espectro, encontrar lo que sobresale, actuar ahí y sólo ahí— es
**aplicable con el analizador de la consola**.

---

## E. Corrección de sala o de sistema

**Qué decide.** Compara lo que llega a un micrófono de medición contra una curva
objetivo y ecualiza **la salida**, no el canal.

**Quién lo hace.** Es el territorio de Smaart y de los ecualizadores de sistema.
Y **el precedente más cercano a nosotros está en una aplicación que habla con
esta misma familia de consolas**: **Mixing Station** tiene una función *Auto EQ*
—[su documentación](https://dev-core.org/ms-docs/auto-eq/)— que ajusta un
ecualizador para **igualar una curva objetivo**, midiendo con **micrófono de
medición y ruido rosa** sobre el analizador.

**Hay que tener cuidado con este precedente, porque se parece y no es lo mismo.**
Su propia documentación dice qué hace: corrige **la respuesta del sistema en la
posición del micrófono**, y advierte que *«no está diseñado para reemplazar tus
oídos»* y que **la función sigue en desarrollo**. No decide nada sobre un
instrumento. **Citarlo como «ya existe un ecualizador automático para la Ui24R»
sería exactamente la clase de afirmación cómoda que este proyecto ya corrigió
cuatro veces**: existe, pero resuelve otro problema.

---

## F. Preajustes del usuario reutilizados

**Qué decide.** Nada, y ése es el punto: la decisión ya la tomó una persona y se
guardó con un nombre.

**Quién lo hace.** **El usuario, en su consola, hoy.** Tiene diez preajustes
propios de canal entero, reúsa la misma curva de voz en varios cantantes, y tiene
dos djembes con una variante alternativa cada uno. Y **sonible** permite
exactamente lo mismo en producto: generar perfiles propios a partir de una
referencia **y compartirlos**.

**Es la familia que el usuario pidió explícitamente** —*«yo puedo auxiliar tocando
el mixer y avisando que ése es el ecualizador preferido»*— y la única de las seis
que **ya está funcionando en su aparato** sin que nosotros construyamos nada.

---

## Lo que dicen las fuentes de oficio, instrumento por instrumento

El usuario pidió que se mirara **cada instrumento de la lista del MVP**. Esto es
lo que hay, y **el hueco es tan informativo como el dato**.

| Instrumento del MVP | ¿Preajuste en la consola? | ¿Fuentes de oficio? |
|---|---|---|
| Voz masculina, principal | **Sí**, dos | **Muchas**, y coinciden en la forma general |
| Voz femenina, principal | **Sí**, dos | **Muchas** |
| Coros | **Sí**, uno | Sí, en general «como la principal pero más atrás» |
| Guitarra acústica de acero | **Sí**, dos más una *vintage* | **Muchas** |
| Guitarra acústica de nylon | **No** | **Sí, y distinguen**: más cuerpo entre 200 y 500 Hz, cuidado con la dureza entre 2 y 3 kHz |
| Guitarra rítmica vs. de solos | **No distingue** | Sí, pero como criterio de mezcla —quién ocupa el medio— más que como curva |
| Bajo eléctrico | **Sí**, uno más una *vintage* | **Muchas** |
| Teclado eléctrico | **Sí**, como piano y como sintetizador | Sí |
| Bombo / kick | **Sí**, uno más una *vintage* | **Muchas** |
| **Kick de foot case** | **No** | **Casi nada, y lo poco que hay es sobre la cápsula**: un piezo tira hacia el agudo, y el consejo es pasa-bajos para dejar pasar el golpe grave |
| **Djembe (cinco tamaños)** | **No** | **Poco, y contradictorio.** Un foro serio lo dice mejor que nadie: *no hay un ecualizador genérico para ningún instrumento*, depende del sistema, del estilo, del ejecutante y del tambor concreto |
| **Flauta nativo americana** | **No** | **Sobre flauta en general, sí**: cuerpo entre 500 Hz y 1 kHz, y el soplido se resta entre 5 y 6 kHz. Específico de la nativo americana, casi todo es sobre micrófono y ubicación, no sobre ecualización |
| **Maracas** | **No** | **Por analogía**: se tratan como shaker o pandereta —pasa-altos para limpiar el grave y cuidado con la dureza arriba— |

**Y la conclusión honesta de esta tabla no es «faltan datos».** Es que **para la
mitad de los instrumentos del usuario, una tabla fija es terreno flojo**, y las
propias fuentes de oficio lo dicen. Donde hay consenso —voces, acústica de acero,
bajo, bombo— la consola ya trae la curva del fabricante. Donde no lo hay —los
cinco djembes, las flautas, las maracas, el foot case— **lo que queda es
escuchar el canal**, que es la familia B.

---

## En qué unidad se cuenta un movimiento de frecuencia, y cuánto deja mover otro

**Buscado el 2026-09-21**, antes de ofrecerle al usuario las opciones de la tarea
1b ([ADR-039](../adr/ADR-039-el-freno-viaja-con-la-hoja-y-se-cuenta-en-octavas.md)).
Es una pregunta distinta de la de arriba: no **cuándo** se mueve una banda sino
**con qué freno**, y en qué moneda se mide ese freno.

**La moneda no está en discusión en ninguna fuente: es la octava.** Se ecualiza y
se analiza en fracciones de octava porque el oído es logarítmico, y un ancho fijo
en hercios es enorme abajo y despreciable arriba. Las dos fuentes más claras:
[Prosoundtraining, *Why do we equalize in 1/3-octave bands?*](https://www.prosoundtraining.com/2019/07/26/why-equalize-in-1-3-octave-bands/)
—de 100 a 200 Hz y de 1 a 2 kHz es la misma octava y son 100 y 1000 hercios— y
[Rational Acoustics, *Linear and Logarithmic Frequency Scales*](https://support.rationalacoustics.com/support/solutions/articles/150000214526-linear-and-logarithmic-frequency-scales),
que además explica por qué un ancho de banda en hercios no sirve como control:
barriendo el centro, el mismo número de hercios pasa de anchísimo a angostísimo.

**Y el precedente de forma —la unidad viaja con el parámetro, no con el módulo—
está en los formatos de plugin.** CLAP declara para **cada** parámetro su nombre,
su mínimo, su máximo y su unidad
([`clap/ext/params.h`](https://github.com/free-audio/clap/blob/main/include/clap/ext/params.h));
VST3 y AU hacen lo mismo. Ninguno agrupa los parámetros de un ecualizador bajo
una unidad común. Vale como forma probada, no como verdad: **ninguno de esos
formatos acota por seguridad cuánto se mueve un parámetro**, porque no escriben
en el aparato de nadie.

**Lo que NO se encontró, y es lo que más importa de esta sección.** **No hay
coincidencias en otros proyectos** sobre acotar cuánto puede moverse una banda de
ecualizador entre una escucha y la siguiente:

- Los cuatro repositorios del protocolo no acotan nada — comprobado clonando y
  grepeando el mismo día, en [`trabajo-previo-de-terceros.md`](trabajo-previo-de-terceros.md).
- **Gullfoss** limita **el rango del espectro en el que se le permite actuar**, no
  el tamaño de cada movimiento. Es otra especie de freno: acota dónde, no cuánto.
- **soothe2** y **Curves AQ** son procesadores de audio: mueven filtros propios
  dentro de su propio complemento, sin escribir en un aparato que otra persona
  está usando, así que la pregunta del freno no se les presenta.

Que no haya precedente significa que hay que tener más cuidado, no menos, y es la
razón por la que los números del retoque de ADR-039 quedan marcados como
operacionalización del agente y sujetos a revisión.

## Qué no se buscó, para que nadie lo dé por buscado

- **No se leyeron los trabajos académicos completos**, sólo sus resúmenes y sus
  páginas de publicación. Lo que dicen las secciones A y C es lo que el resumen
  afirma, no lo que el método hace en detalle.
- **No se probó ningún producto.** Nada de esto se ejecutó ni se midió: es
  documentación de terceros, y vale como hipótesis. La advertencia de siempre:
  `DigiMixer` recorta el medidor en 240 y está mal.
- **No se buscó nada sobre compresor, puerta ni efectos.** Esta búsqueda es del
  ecualizador de canal, que es la pieza 2.
- **No se buscaron patentes más allá de las que aparecieron solas** en las
  búsquedas —hay al menos dos de sistemas de ecualización automática—, y no se
  leyeron.

## Cómo se usa este documento

**Antes de escribir «nadie hace X» sobre criterios de ecualización, buscá X
acá.** Si no está, buscalo de verdad y agregá la fila. Y antes de proponerle al
usuario una forma de decidir, **decí de cuál de las seis familias sale**: si no
sale de ninguna, es sin precedente, y eso pide más cuidado, no menos.
