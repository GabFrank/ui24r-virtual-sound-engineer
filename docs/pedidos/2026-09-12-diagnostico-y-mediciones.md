# Decisiones del usuario: el diagnóstico de realimentación y las mediciones

Las citas de este archivo van **como las escribió el usuario**, sin corregir la
ortografía, igual que en [`00-lo-que-dijo-el-usuario.md`](00-lo-que-dijo-el-usuario.md).
Una versión anterior corregía «simpes», «mecesites» y «rockit» en silencio y
recortaba el arranque de una cita: eso hace que el derivado ya no se pueda
contrastar con el original buscando el texto.

**El original de cada cita está en [`00-lo-que-dijo-el-usuario.md`](00-lo-que-dijo-el-usuario.md).**

Registradas el 2026-09-12, en una ronda de consultas antes de que el usuario se
fuera a dormir. **Vale la pena leer primero el procedimiento**, porque de él
salen casi todas las demás.

## Qué hace el usuario hoy cuando aparece un acople

> Si el acople es muy fuerte entonces bajo el nivel del auxiliar o pa,
> dependiendo de donde se escucha, luego vuelvo a subir de a poco buscando el
> acople nuevamente y empiezo a mutear canal por canal en busqueda, porque no
> mutear todo y abrir uno por uno? Porque a veces el acople viende del mix de dos
> microfonos o de algun micrófono y un instrumento.

**La pregunta que se contesta ahí adentro es la más importante del diseño.**
Silenciar de a uno **desde todo abierto** encuentra un canal **necesario**: si
sacarlo corta el lazo, forma parte. Abrir de a uno **desde todo callado**
buscaría un canal **suficiente**, y **para un lazo que necesita dos fuentes no
existe ninguno** — ninguno solo realimenta. Por eso se silencia, no se abre.

## El reparto de trabajo

> Si yo estoy haciendo el soundcheck, seras tu el que realice todos los pasos, no
> tocare ninguna perilla mientras estas en el comando a no ser que me lo pidas,
> probablemente la table este con la app abierta y no con la web app de la
> consola

Dos consecuencias que cambian decisiones anteriores:

1. **La aplicación ejecuta el procedimiento entero**, no una parte.
2. **La pantalla de la consola no la está mirando nadie**, así que apuntar el
   analizador a un canal deja de tener el costo que ADR-025 le atribuía. El
   usuario lo autorizó explícitamente: *«usá el analizador por canal
   libremente»*. Se devuelve al general al terminar.

## Las decisiones, una por una

| Tema | Decisión |
|---|---|
| **Estrategia de la prueba** | **De a un canal por vez**, aunque sean más pasos. Cada paso molesta a una persona y es obvio qué se prueba |
| **Cuánto dura cada silencio** | **Uno o dos segundos**, para estar seguro |
| **El supresor de la consola** | **Lo apaga el usuario** durante el diagnóstico y lo vuelve a prender. Eligió la opción que empieza «Lo apago **yo**»; una versión anterior de esta fila lo convirtió en «la aplicación», que es una escritura nueva y no una acción manual. La advertencia del enunciado que aceptó: está **medido** que es el único de 45 parámetros que una recuperación de instantánea **no devuelve**. Y `AFS2` sigue siendo `USER_ONLY` y no escribible en el código, sin ningún ADR que lo abra — coherente con esta lectura |
| **Bajar el auxiliar o el PA** | **Decidido abrir**, y no sólo para emergencias: también para el ajuste normal de monitores, que es el paso 12 del camino. **Abierto el 2026-09-12 por ADR-028, y sólo una de las dos mitades.** Se abrió `i.N.aux.M.value`, el envío por canal —240 rutas— cuando la ley del envío quedó medida. **`MASTER_FADER` sigue `USER_ONLY`. `a.N.mix` NO**, y esta fila lo decía mal: su dueño es `CHANNEL_ASSISTANT` con `escribible: true`, porque cae bajo el mismo `kind` que el envío. Lo que lo cierra es la lista blanca del motor, que nombra sólo el nivel del canal. La diferencia importa: quien lea esto creyendo que lo protege la propiedad no va a mirar el motor, que es donde está la única guarda. Lo encontró una auditoría de seguridad. El aviso de abajo se cumplió a medias: se separaron, y se implementó uno. *(Y la pregunta fundía dos cosas: el nivel de salida que el usuario baja en su procedimiento y el envío de monitor por canal son parámetros distintos con dueños distintos; hay que separarlos al implementarlo.)* |
| **Provocar el acople** | **Autorizado sin avisar cada vez**: es parte del soundcheck |
| **Hasta dónde subir buscándolo** | **Hasta donde estaba antes de que lo bajaran, y ni un paso más.** El enunciado que eligió decía «antes de que **yo** lo bajara»; una versión anterior de esta fila lo reescribió como «la aplicación», que es la segunda vez que un «yo» suyo se convierte en autoridad de la app. El techo resultante es el mismo. Si no reaparece ahí, algo cambió y se avisa en vez de seguir subiendo |
| **Acople combinado** | **Seguir buscando después del primero.** Saber que eran dos cambia la solución: quizá no hay que bajar uno mucho sino los dos un poco |
| **Cómo resolverlo** | Bajar un poco la ganancia, o **atenuar la frecuencia del acople en el ecualizador o en el auxiliar/PA**. Como la ley del ecualizador no está medida y esa medición ya es ruta crítica del MVP, **la función no sale antes de medirla**. El usuario además preguntó «¿está dentro del MVP?» y **la respuesta es sí**: el paso 10 del camino de punta a punta lo es, y las cinco leyes se miden antes de la primera entrega |

## La pantalla para la banda

Idea del usuario, a partir de la pregunta de si mostrar qué canal se está
probando:

> Me acabas de dar una excelente idea, podemos castear una pantalla simpes desde
> la app donde los demas puedan acceder via QR de inclusive de forma fija, asi
> todos pueden ver el progreso del soundcheck

| Tema | Decisión |
|---|---|
| Qué muestra | **El progreso del soundcheck y a quién le toca** |
| Interacción | **Sólo miran**, por ahora |
| Cuándo | **Fija**, siempre que la aplicación esté abierta |
| Red | **«Generalmente usamos un router externo»** — el «generalmente» es suyo y conviene conservarlo: es un hábito, no una garantía. Que los músicos se conecten a esa misma red **no lo dijo**; es lo que haría falta para que la pantalla funcione, y hay que comprobarlo o preverlo |

## Las mediciones

El usuario corrigió una confusión del que pregunta:

> No estoy entendiendo, una cosa es hacer un soundcheck, otra cosa es hacer
> mediciones que generaran datos para el mvp

**Medir las leyes de la consola es trabajo de banco**, no un soundcheck: no
depende de la sala ni de la banda.

Y sobre la fuente de señal:

> Lo mismo que ya tenemos hoy, tu controlas la imac que tiene una Scarlett que
> envia audio a la consola, tu mismo manejas que señal enviar

**Eso desbloquea las mediciones sin el usuario presente** — al menos para esta
noche, que es lo que autorizó. **Ojo con la regla general que no revocó**: al
definir el reparto del trabajo dijo *«todo lo que necesite prueba real de sonido,
lo vamos a hacer juntos»*, y `docs/alcance-mvp.md` afirma que son cuatro sesiones
y que todas necesitan la sala y el usuario presente. **Tres documentos decían
cosas distintas y ninguno declaraba el conflicto.** Lo que vale: la autorización
puntual es real y acotada a esta noche; la regla general sigue en pie para lo que
venga después. La Scarlett 2i2
es la salida por defecto de la máquina desde la que se trabaja, y el repositorio
ya tiene un generador de señales determinista.

| Tema | Decisión |
|---|---|
| Hacer ruido | **Autorizado**: *«No hay nadie cerca puedes hacer lo que mecesites»* |
| Qué hay disponible | *«tienes la Scarlett y tambien tienes el rockit en la salida de master y el B2 disponible»* — los Rokit son los monitores del general |
| Si algo no cierra | *«Seguí intentando, es una consola y aguanta»* |
| Cuánto tiempo | Lo estima quien mide, y el usuario lo arma |

**Lo que no cambia**: restaurar siempre la consola y comprobarlo por un camino
distinto del que escribió, no borrar las instantáneas del usuario —en particular
`Alma caninde`—, y preguntar por INV-007.
