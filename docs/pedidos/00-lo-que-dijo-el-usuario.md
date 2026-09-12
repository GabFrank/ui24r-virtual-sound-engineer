# Lo que dijo el usuario, textual

**Para qué existe este archivo.** Todo lo demás que hay en `docs/pedidos/` y en
los ADR es **interpretación**: yo leo lo que el usuario dice y lo convierto en
una decisión con su motivo. Esa capa —la que interpreta— es exactamente donde
este proyecto documenta sus peores errores, y no había forma de auditarla porque
el original vivía sólo en la conversación.

Acá está el original. **Sin glosa, sin resumen y sin corregir la ortografía.** Lo
que sigue de cada cita, cuando hay algo, va marcado como lectura mía y se puede
discutir; la cita no.

Del 2026-09-11 y la madrugada del 2026-09-12.

---

## Sobre el reparto del trabajo

> ok, hagamos lo siguiente, todo lo que tiene que ver con disenho del producto y
> las reglas (flow) lo vas a trabajar ahora, todo lo que necesite prueba real de
> sonido, lo vamos a hacer juntos

> Si yo estoy haciendo el soundcheck, seras tu el que realice todos los pasos, no
> tocare ninguna perilla mientras estas en el comando a no ser que me lo pidas,
> probablemente la table este con la app abierta y no con la web app de la
> consola

## Sobre el alcance del MVP

> tambien tiene que entrar al mpv, GATE, COMPRESOR, EQ, EFFECTOS (porque el mix
> de una banda depende de estos y no solo de eq)

> Que te parece si antes del MVP hacemos estas mediciones? en el mvp ya tiene que
> estar funcional (minimamente)

> No te preocupes con el tamanho del MVP, porque lo que estamos construyendo de
> por si es gigante, y sera divertido hacerlo.

> Supongo que no vamos a usar esta funcion antes de medir el ecualizador, esta
> dentro del mvp no?

## Sobre el orden del recorrido guiado

> El sistema propone un orden de inicio pero el usuario puede cambiar, imagina
> una pantalla con una lista de items y drag and drop para ordenar. La propuesta
> del sistema no puede ser al azar, tenemos que verificar en internet o en algun
> lugar cual es el orden que mejor nos vendria

Respuestas de opción múltiple, textuales del enunciado que eligió:

- Cuándo se guarda el orden: **«Al soltar, sin botón»**
- Qué canales entran: **«Todo lo asignado, y se puede sacar a mano»**
- De dónde se agarra la fila: **«De un asidero al costado»**
- Qué hace restaurar: **«Olvida el orden guardado»**
- Dónde vive el lugar de un monitor: **«El lugar va en el escenario del local»**
- Cómo se carga el canal de un micrófono: **«Desde el plano: tocás el micrófono
  y elegís su canal»**

## Sobre silenciar canales

> Este bloqueo solo existe pensando en algun modo live, para un soundcheck es
> legitimo tenerlo totalmente abierto, recuerda que el modo live es una feature
> muy muy futura (si es que llegamos a eso algun dia)

> tomo tu recomendación, y que quede anotado, si futuramente aparece un bloqueo
> relacionado (pensando ya) al modo live, tienes libertad de retirarlo o que el
> motivo sea otro que si tiene sentido para nosotros

## Sobre cómo diagnostica un acople

> Si el acople es muy fuerte entonces bajo el nivel del auxiliar o pa,
> dependiendo de donde se escucha, luego vuelvo a subir de a poco buscando el
> acople nuevamente y empiezo a mutear canal por canal en busqueda, porque no
> mutear todo y abrir uno por uno? Porque a veces el acople viende del mix de dos
> microfonos o de algun micrófono y un instrumento.

> Primero intentar resolverlo, muchas veces bajando un poco la ganancia o
> dependiendo de la frecuencia que esta acoplando atenuarla en el eq o en el
> auxiliar/pa, soundcraft ya realiza esto de forma automática cuando detecta un
> acople fuerte

De las opciones múltiples:

- Estrategia: **«De a uno, aunque sean más pasos»**
- Duración del silencio: **«Uno o dos segundos, para estar seguro»**
- El supresor de la consola: **«Lo apago yo durante el diagnóstico y lo vuelvo a
  prender»** — *elegida la opción cuyo enunciado incluía la advertencia de que el
  supresor es el único parámetro que una recuperación no devuelve*
- Los envíos de monitor: **«Sí, y también para el ajuste normal de monitores»**
- Provocar el acople: **«Sí, sin avisar cada vez: es parte del soundcheck»**
- Techo al subir: **«Hasta donde estaba antes de que yo lo bajara, y ni un paso
  más»**
- Acople combinado: **«Sí: quiero saber si eran dos»**
- El analizador por canal: **«Sí, usá el analizador por canal libremente»**

## Sobre la pantalla para la banda

> Me acabas de dar una excelente idea, podemos castear una pantalla simpes desde
> la app donde los demas puedan acceder via QR de inclusive de forma fija, asi
> todos pueden ver el progreso del soundcheck

De las opciones: **«El progreso del soundcheck y a quién le toca»**, **«Sólo
miran, por ahora»**, **«Fija, siempre que la app esté abierta»**, y sobre la red:

> Generalmente usamos un router externo

## Sobre las mediciones

> No estoy entendiendo, una cosa es hacer un soundcheck, otra cosa es hacer
> mediciones que generaran datos para el mvp

> Lo mismo que ya tenemos hoy, tu controlas la imac que tiene una Scarlett que
> envia audio a la consola, tu mismo manejas que señal enviar

> No hay nadie cerca puedes hacer lo que mecesites, mira, tienes la Scarlett y
> tambien tienes el rockit en la salida de master y el B2 disponible. Utilizalos
> a tu gusto.

> Seguí intentando, es una consola y aguanta

> Decime vos cuánto necesitás y lo armo

## Sobre el proceso de trabajo

> Ok, estuve pensando en los errores repetidos que estamos cometiendo... que
> cambio en nuestro workflow podria ayudar a evitar esos errores? separar en
> agentes de medicion, de interpretación y de documentación trabajado en
> paralelo, no solo al final de cada commit, que opinas? ayudaria?

> En la teoría, siempre estuviste en lo correcto, el problema es en la práctica,
> cuando necesitaste aplicar eso, es donde te equivocabas o donde no aplicabas.

> ok, pero eso es normal en todo proceso inicial, podemos continuar

---

## Restricciones anteriores que siguen vigentes

De sesiones previas a ésta, conservadas porque no fueron revocadas:

> solo cuida para no borrar el snapshot llamado Alma Caninde

> lo unico que no puedes hacer es borrar el snapshots guardado en la consola

> preguntas siempre interactivas

> cada tarea se finaliza documentandola y haciendo commit y push solo asi iniciar
> la otra

Y las que salieron de la forma de trabajar, no de una frase: restaurar siempre la
consola y comprobarlo **por un camino distinto del que escribió**, y preguntar
antes de tocar la alimentación fantasma (INV-007).

---

## Del 2026-09-12, ya de noche

> de paso, la line que viene de la scarlet esta en el canal 10

> ahora entiendo, y no tenemos ningun parlante conectado a ningun auxiliar
> entonces no existe ningún peligro.

> ok, hagamos asi, primero haz la lista de todo lo que vas a desarrollar en esta
> madrugada, ya sea mediciones o del producto. Puede ser bastante extenso porque
> tienen mas o menos 10 horas para trabajar hasta que volvamos a hablar. Después
> de la lista, commit, push y a trabajar

**Lectura mía, discutible.** Lo segundo cierra el hueco que quedaba del reparto
de la madrugada anterior: el usuario había autorizado hacer ruido con la Scarlett,
el B2 y los Rokit, pero los auxiliares seguían siendo una incógnita porque sus
faders están en 0,904 y 0,373 y eso, con una cuña enchufada, es sonido en la sala.
No hay cuña enchufada. Los filtros que el supresor tiene plantados en `a.0`
—199,98 Hz, 999,97 Hz a −18 dB, 8190 Hz, 4226 Hz— son entonces de fechas viejas,
de cuando sí había monitores conectados. **Eso último es inferencia mía: el
usuario no dijo de dónde salieron esos filtros.**

> ok, no olvides de activar el gatilho que t mantiene despierto, si te da tiempo
> al final, haz una pasada completa en la UI del producto, ver que falta
> cablear, si falta algun ABM, crear el diseño del espacio con los instrumentos,
> microfonos, monitores, pa, todo utilizando drag and drop y mostrando distancia
> en cm de una cosa a la otra (o aun no llegamos a esa parte?) en fin, buen
> trabajo y nos vemos mañana

**Lectura mía, discutible.** La pregunta del paréntesis tiene respuesta: sí
llegamos, el plano con arrastre está construido. Lo que no coincide con el
pedido es el «en cm»: hoy muestra un **rango en metros**, porque un micrófono en
mano no tiene posición sino zona. Es una decisión de producto que el usuario
puede revocar, y queda preguntada, no decidida por mí.

> ese problema es fácil de solucionar, al creae el instrumento/microfono, se
> indica si es fijo o tiene rango de movimiento, punto final

**Lectura mía, discutible.** Resuelve de un tajo algo que el modelo venía
hedgeando: la fijeza declara **cuánto se mueve** algo y nada más. Si el usuario
dice fijo, es fijo, y la distancia se muestra como número. El error de medición
—que era el argumento para darle ±10 cm a `FIJO`, más que a `EN_PIE`— no es del
modelo: es de quien coloca la ficha, y para eso ya estaba el cuarto argumento de
`emplazar()`, que sigue existiendo.

## Sobre el plano, la madrugada del 2026-09-13

> Ok, entiendo mejor tus dudas pero antes quiero hacerte una pregunta, que
> verdaderamente cambiarja si algo esta a exactamente 1 metro o 1.10?  Si esta a
> 20cm de altura o 50? Es solo para tener un registro muy cool de nuestro
> espacio o porque verdaderamente te va a servir para alguna medicion precisa?
> Si realmente va a servir (no por suposición si no que porque tenes cerreza y
> prueba de que sera asi) entonces habilita altira, rango etc, si no, entonces
> simplifica, si es fijo lo marcamos asi y con el dedo posicionamos, el cm nos
> ayuda a tener jna idea del espacio, si no es fijo, cual es el rango de
> movimento? Y ahi punto final

> ahi me confundiste, que tiene que ver la yema del dedo?😂 estamos hablado de
> drag and drop no? posicionamos un equipo, luego al posicionar el otro vemos la
> distancia que hay entre uno y otro, talvez movemos un poco mas, cambia la
> distancia, o talvez en tiempo real, ai hay verios equipos vemos la distancia
> del que estamos moviendo contra los demas, al seleccionar un equill aparecen
> las distancias contra los demas. Si el equipl es movil entonces se ve el rango
> (que al registrar seteamos), puede ser un rectangulo editable. En fin, todavia
> no entiendo lo se la yema del dedo

> antes se vetar, explicam mejor y tomemos una decisión juntos

> ok, no olvides de documentar estaa ultimas decisiones tomadas

**Lectura mía, discutible.** Las tres cosas que dejan estos mensajes:

1. **«No por suposición, sino porque tenés certeza y prueba»** es una regla de
   trabajo, no un comentario sobre el plano. Está anotada como tal en
   [`2026-09-13-el-plano-como-mesa-de-trabajo.md`](2026-09-13-el-plano-como-mesa-de-trabajo.md).
2. **El reproche de «antes de vetar, expliquemos y decidamos juntos»** era
   justo: el usuario había decidido sobre un problema que yo le describí a
   medias, y yo implementé en diez minutos.
3. **El plano no es un instrumento de medición, es una mesa de trabajo.** Todo
   mi razonamiento sobre la precisión del dedo asumía que se suelta la ficha a
   ciegas. Con la distancia a la vista mientras se arrastra, el que mide es el
   usuario y el plano es dónde lo anota. El emoji del mensaje es el acuse de lo
   absurdo que sonaba.

