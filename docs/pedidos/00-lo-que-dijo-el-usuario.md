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
