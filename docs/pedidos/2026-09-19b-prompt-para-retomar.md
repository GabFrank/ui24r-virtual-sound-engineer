# Prompt para retomar — después del segundo cierre del 2026-09-19

**Para pegar tal cual después de un `/clear`.** Reemplaza a
[`2026-09-19-prompt-para-retomar.md`](2026-09-19-prompt-para-retomar.md), que
queda superado: cita como pendiente la tarea de guardar las mediciones, que ya
está hecha.

---

Proyecto Ui24R Virtual Sound Engineer, rama claude/soundcraft-ui24-assistant-kh8ezj.

ANTES DE TOCAR NADA, en este orden:
1. Leé docs/pedidos/2026-09-19b-donde-quedamos.md — estado, qué se hizo y qué
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
- Y CUIDADO CON LAS JUSTIFICACIONES: el 2026-09-19 una auditoría de fidelidad
  encontró ONCE afirmaciones falsas en un solo commit mío, casi todas de la misma
  forma — un motivo convincente al lado de una decisión correcta. Una de ellas
  contradecía una medición que el propio repositorio tenía archivada, y otra
  estaba en el mensaje de un test. Antes de escribir "esto no se midió" o "esto no
  puede pasar", comprobalo.
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
Pieza 1 de la hoja de ruta, la pantalla de monitor. De las cuatro partes se
cerraron TRES el 2026-09-19 y una CUARTA ese mismo día, en la segunda sesión: las
mediciones llegan al motor, la cuña apagada se puede levantar, el asistente sabe
subir, y AHORA LA APLICACIÓN GUARDA LO QUE ESCUCHA Y LO ANOTA EN LA TRANSACCIÓN.

Eso último tuvo efecto medible: antes, un segundo ajuste de ganancia sobre el
mismo canal se rechazaba SIEMPRE por falta de escucha, aunque el músico hubiera
tocado. Ahora no.

Y trajo una decisión mía que hay que respetar: lo que cuenta como "el músico
estaba tocando" es que EL MEDIDOR SE HAYA MOVIDO y haya estado por encima del
piso de ruido; y la escucha que se declara es CUÁNTO SONÓ LA MÚSICA, no cuánto
duró la ventana. En la práctica el músico tiene que tocar al menos diez de los
dieciocho segundos.

FALTA LA PANTALLA POR MÚSICO, que son dos cosas y las dos son la misma pantalla:
1. Se elige a alguien y se ve su cuña con todo lo que le llega, su propio
   instrumento primero. Tiene que saber PEDIR EL RESTO en el último paso, porque
   con pasos fijos de 2 dB nominal es inalcanzable: la rampa se queda a 0,138 dB.
   Eso NO necesita tocar el motor — el asistente ya acepta cualquier subida hasta
   2 dB, así que pedir los últimos 0,138 es una cuenta de la pantalla.
2. El acto de marcar "así está bien", que es lo que hoy no existe. Mientras no
   exista, toda cuña vive permanentemente en la primera operación: sin presupuesto
   acumulado, con techo en nominal, 2 dB por paso y escucha obligatoria.

Y OJO CON ESTO, que es lo que queda a medias: la escritura de mediciones está
hecha para la GANANCIA y no para el MONITOR, y no por falta de código —el
servicio de envío a monitor NO MIDE—. Quien va a capturar ahí es esta pantalla.

LO QUE HAY ABIERTO FUERA DE LA PIEZA 1:
Las listas están en el documento 2026-09-17b. Hay nueve hallazgos del 2026-09-18
en docs/backlog/hallazgos-de-la-auditoria-del-censo-2026-09-18.md, uno cerrado, y
CINCO NUEVOS del 2026-09-19 en
docs/backlog/hallazgos-de-las-auditorias-de-la-escucha-2026-09-19.md.

NINGUNO está en el camino de la pieza 1. El más grande de los nuevos: una sola
medición guardada autoriza el segundo paso de las 24 ganancias —96 dB con una
fila— porque nadie cruza el canal de la medición contra la ruta. No está expuesto
por la pantalla de hoy, pero pasó de inalcanzable a estar a una línea. Y de los
del 18, el más accionable sigue siendo el compresor y la puerta de los auxiliares,
190 claves, que se rechazan citando un motivo FALSO.

Preguntame por dónde arrancar antes de empezar, y si al leer encontrás que algo
de lo que dice la documentación ya no es cierto, decime primero.
