# Decisiones del usuario: el diagnóstico de realimentación y las mediciones

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
| **El supresor de la consola** | **La aplicación lo apaga durante el diagnóstico y lo vuelve a prender.** Con la advertencia dicha y aceptada: está **medido** que es el único de 45 parámetros que una recuperación de instantánea **no devuelve**, así que hay que restaurarlo explícitamente y sobrevivir a un corte |
| **Bajar el auxiliar o el PA** | **Se abre**, y no sólo para emergencias: también para el ajuste normal de monitores, que es el paso 12 del camino. Necesita la ley del envío medida |
| **Provocar el acople** | **Autorizado sin avisar cada vez**: es parte del soundcheck |
| **Hasta dónde subir buscándolo** | **Hasta donde estaba antes de que la aplicación lo bajara, y ni un paso más.** Si no reaparece ahí, algo cambió y se avisa en vez de seguir subiendo |
| **Acople combinado** | **Seguir buscando después del primero.** Saber que eran dos cambia la solución: quizá no hay que bajar uno mucho sino los dos un poco |
| **Cómo resolverlo** | Bajar un poco la ganancia, o **atenuar la frecuencia del acople en el ecualizador o en el auxiliar/PA**. Como la ley del ecualizador no está medida y esa medición ya es ruta crítica del MVP, **la función no sale antes de medirla** |

## La pantalla para la banda

Idea del usuario, a partir de la pregunta de si mostrar qué canal se está
probando:

> podemos castear una pantalla simples desde la app donde los demas puedan
> acceder via QR de inclusive de forma fija, asi todos pueden ver el progreso del
> soundcheck

| Tema | Decisión |
|---|---|
| Qué muestra | **El progreso del soundcheck y a quién le toca** |
| Interacción | **Sólo miran**, por ahora |
| Cuándo | **Fija**, siempre que la aplicación esté abierta |
| Red | **Router externo**: hay una red local con la consola y la tablet, y los músicos se conectan ahí |

## Las mediciones

El usuario corrigió una confusión del que pregunta:

> No estoy entendiendo, una cosa es hacer un soundcheck, otra cosa es hacer
> mediciones que generaran datos para el mvp

**Medir las leyes de la consola es trabajo de banco**, no un soundcheck: no
depende de la sala ni de la banda.

Y sobre la fuente de señal:

> Lo mismo que ya tenemos hoy, tu controlas la imac que tiene una Scarlett que
> envia audio a la consola, tu mismo manejas que señal enviar

**Eso desbloquea las tres mediciones sin el usuario presente.** La Scarlett 2i2
es la salida por defecto de la máquina desde la que se trabaja, y el repositorio
ya tiene un generador de señales determinista.

| Tema | Decisión |
|---|---|
| Hacer ruido | **Autorizado**: *«No hay nadie cerca puedes hacer lo que necesites»* |
| Qué hay disponible | La **Scarlett** a la entrada, los **Rokit** en la salida del general, y el **B2** |
| Si algo no cierra | *«Seguí intentando, es una consola y aguanta»* |
| Cuánto tiempo | Lo estima quien mide, y el usuario lo arma |

**Lo que no cambia**: restaurar siempre la consola y comprobarlo por un camino
distinto del que escribió, no borrar las instantáneas del usuario —en particular
`Alma caninde`—, y preguntar por INV-007.
