# Prompt para retomar — pegar después de un `/clear`

> **SUPERADO por [`2026-09-19b-prompt-para-retomar.md`](2026-09-19b-prompt-para-retomar.md)**: cita como pendiente la tarea de guardar las mediciones, que se cerró el mismo día.

```
Proyecto Ui24R Virtual Sound Engineer, rama claude/soundcraft-ui24-assistant-kh8ezj.

ANTES DE TOCAR NADA, en este orden:
1. Leé docs/pedidos/2026-09-19-donde-quedamos.md — estado, qué se hizo y qué
   quedó abierto. Las listas de tareas viven en 2026-09-17b-donde-quedamos.md:
   leé los dos.
2. Leé docs/pedidos/2026-09-17-recapitulacion-y-hoja-de-ruta.md — manda sobre qué
   se hace y en qué orden.
3. Cargá las skills vse-experto y vse-disciplina. Se aplican siempre, no sólo
   cuando pregunto por el proceso.
4. Verificá el estado real antes de creerle a la documentación: git status,
   npm run verificar, y el volcado de la consola si vas a afirmar algo sobre ella.

LO PRIMERO, PORQUE MANDA SOBRE TODO LO DEMÁS — NO SALIRSE DE LA HOJA DE RUTA:

NO EXPLORES, NO MIDAS Y NO INVESTIGUES NADA QUE NO HAGA FALTA PARA EL MVP.
Mis palabras del 2026-09-19: "no quiero que salgamos de nuestra hoja de ruta y
medir cosas que seran inutiles, necesito que mantengamos el foco para lo que se
necesita para el MVP".

Esto vale ANTES de empezar, no sólo al final. Antes de medir algo, de leer un
volcado, de auditar una parte del sistema o de abrir una investigación,
preguntate: ¿esto hace falta para la pieza en curso de la hoja de ruta? Si la
respuesta es no, NO LO HAGAS. Y si creés que hace falta y no es obvio,
preguntame antes de gastar la sesión en eso.

Por qué está así de fuerte: el 2026-09-19 una revisión de un documento derivó en
seis commits y cuatro rondas de auditoría sobre el bus de análisis, la matriz y
la clasificación de claves. Salieron NUEVE hallazgos, todos ciertos, todos
medidos — y NINGUNO estaba en el camino de la pieza en curso. Media jornada
gastada en cosas que no me acercan al producto.

La regla que queda: un hallazgo cierto NO es una tarea si no toca la pieza en
curso. Va al backlog y se sigue. Auditar es obligatorio, pero manda sobre CÓMO
se valida lo que se hace, no sobre QUÉ se hace. Si una cadena de correcciones
empieza a auditar correcciones de correcciones, el foco ya se perdió: cortá.

CÓMO QUIERO QUE TRABAJES — esto no es negociable:
- Preguntame SIEMPRE con preguntas interactivas, nunca con una frase al final de
  un informe.
- Explicame en lenguaje de producto: entiendo de consola, sonido y show; no de
  código, claves ni nombres de función. El detalle técnico va al commit o al
  documento, que es donde se audita.
- Los prompts para retomar y todo lo que yo tenga que copiar, ESCRIBILO EN EL
  CHAT. Muchas veces entro en sesión remota y no tengo cómo abrir un archivo.
  Guardalo en el repositorio igual, pero la copia va acá.
- Buscá el trabajo previo de verdad y decime explícitamente que lo hiciste. El
  inventario de los cuatro repositorios está en
  docs/referencia/trabajo-previo-de-terceros.md. "No encontré X" no es "no hacen
  X", y ya pasó cuatro veces.
- Una tarea, un commit, empujado, y RECIÉN AHÍ la siguiente. npm run verificar en
  verde antes de commitear, nunca en rojo. El asunto del commit no pasa de 72
  caracteres: el gancho lo frena y hay que reescribirlo.
- Si aparece un hallazgo en medio de una tarea, va como tarea nueva.
- LANZÁ UNA AUDITORÍA del trabajo antes de darlo por bueno, adversarial y de
  fidelidad, y decime qué encontró. ACOTADA AL MVP Y A LAS HERRAMIENTAS: lo
  demás no me importa. MUTAR prueba que los tests cazan lo que hay; sólo ATACAR
  con entradas BIEN FORMADAS prueba que lo que hay alcanza. Y probá la CADENA
  COMPLETA: el error más caro del 2026-09-18 fue medir funciones sueltas y
  concluir sobre el sistema, con la suite entera en verde.
- Avisame cuando la sesión se esté poniendo larga y dejá todo preparado para
  cerrar: árbol limpio, rama empujada y el documento de dónde quedamos escrito.
  El corte va después de un commit empujado, nunca a mitad de una tarea.

DETALLES PRÁCTICOS DE ESTA MÁQUINA:
- Node 22: export PATH="$HOME/.nvm/versions/node/v22.23.2/bin:$PATH"
- La consola está en 192.168.0.78. curl -s --max-time 6 http://<consola>/raw da el
  estado entero; sale con código 28 y hay que tolerarlo. Ese volcado NO se
  commitea: trae los valores enteros y el identificador de la unidad, y el
  repositorio es público.
- LEÉ EL VOLCADO ENTERO, NO SU PRINCIPIO. Mirar una parte y generalizar ya dio
  tres afirmaciones falsas sobre mi consola en un solo día.
- NO tengo acceso físico a la MacBook: entro por SSH y AnyDesk (ID 287825547).
  Vos podés medir igual porque corrés dentro de ella, en iTerm, que es el que
  tiene permiso de micrófono. Lo que NO se puede hasta que vuelva: mover cables
  del banco, tocar la perilla de la Scarlett, o reenchufarla si el USB se corta.
  Decímelo antes de lanzar una corrida larga.
- Si el grabador no arranca la captura, NO asumas que es el permiso: leé
  docs/backlog/hallazgo-el-audio-de-la-mac-se-traba-y-parece-un-permiso.md. Se
  cura con sudo killall coreaudiod, que lo corro yo por SSH.
- Antes de meter tonos sostenidos, mirá las CUATRO claves del supresor que están
  en 1: la global, la de la mezcla, y los auxiliares 1 y 2, que son cuñas. Y
  nunca borres los snapshots guardados: es la única prohibición absoluta.

DÓNDE ESTAMOS:
Pieza 1 de la hoja de ruta, la pantalla de monitor. El 2026-09-19 se cerraron
TRES de las cuatro partes: las mediciones ya llegan al motor, la cuña apagada se
puede levantar, y el asistente ya sabe subir además de bajar.

FALTA UNA SOLA COSA: LA PANTALLA POR MÚSICO.
Se elige a alguien y se ve su cuña con todo lo que le llega, su propio
instrumento primero. Es la que trae el acto de marcar "así está bien".

UN REQUISITO SUYO QUE SALIÓ DE LA AUDITORÍA DEL CIERRE: con pasos fijos de 2 dB
NOMINAL ES INALCANZABLE. La rampa medida llega hasta 0,138 dB por debajo y ahí el
asistente frena, porque rechaza en vez de recortar. La pantalla tiene que saber
PEDIR EL RESTO en el último paso.

Y es la que cierra los dos huecos que quedan, los dos son DATOS que faltan, no
código:
1. Nadie marca todavía un nivel como establecido, así que toda cuña vive
   permanentemente en la primera operación: sin presupuesto acumulado, con techo
   en nominal, 2 dB por paso y escucha obligatoria entre pasos.
2. Nadie ESCRIBE en la tabla measurement. La lectura ya está hecha y cableada;
   falta que la pantalla guarde la medición y anote su identificador en la
   transacción. Hasta entonces la rampa se frena en el segundo paso, ahora por
   falta de dato y no por falta de código. El servicio de ganancia tiene la
   misma mitad suelta: ya vuelve a medir después de aplicar y no guarda lo que
   mide.

LO QUE HAY ABIERTO FUERA DE LA PIEZA 1:
Las listas están en el documento 2026-09-17b. Y hay nueve hallazgos del
2026-09-18 en docs/backlog/hallazgos-de-la-auditoria-del-censo-2026-09-18.md,
uno cerrado. NINGUNO está en el camino de la pieza 1: por eso quedaron anotados
y no se tocan hasta que la hoja de ruta los pida. El más accionable el día que
se retomen: el compresor y la puerta de los auxiliares, 190 claves, se rechazan
citando un motivo FALSO — que la ruta no se conoce, cuando sí se conoce.

Preguntame por dónde arrancar antes de empezar, y si al leer encontrás que algo
de lo que dice la documentación ya no es cierto, decímelo primero.
```
