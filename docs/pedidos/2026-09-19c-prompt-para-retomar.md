# Prompt para retomar — después del 2026-09-19c

**Acotado a propósito.** El usuario pidió que lleve sólo lo que sirve para las dos
tareas que siguen. Lo demás se consulta en
[`2026-09-19c-donde-quedamos.md`](2026-09-19c-donde-quedamos.md).

---

Proyecto Ui24R Virtual Sound Engineer, rama claude/soundcraft-ui24-assistant-kh8ezj.

ANTES DE TOCAR NADA:
1. Leé docs/pedidos/2026-09-19c-donde-quedamos.md.
2. Cargá las skills vse-experto y vse-disciplina. Se aplican siempre.
3. git status y npm run verificar, antes de creerle a la documentación.

NO TE SALGAS DE LA HOJA DE RUTA. Antes de medir algo, leer un volcado o abrir una
investigación, preguntate si hace falta para la tarea en curso. Si no, NO LO HAGAS,
y si no es obvio, preguntame. Un hallazgo cierto NO es una tarea si no toca la
pieza en curso: va al backlog y se sigue.

CÓMO QUIERO QUE TRABAJES — no es negociable:
- Preguntame SIEMPRE con preguntas interactivas, nunca con una frase al final de
  un informe.
- Explicame en lenguaje de producto: entiendo de consola, sonido y show, no de
  código ni de nombres de función. El detalle técnico va al commit.
- Lo que yo tenga que copiar, ESCRIBILO EN EL CHAT. Entro por sesión remota y
  muchas veces no puedo abrir un archivo.
- Buscá el trabajo previo de verdad y decime que lo hiciste. El inventario de los
  cuatro repositorios está en docs/referencia/trabajo-previo-de-terceros.md. Si lo
  que buscás no está ahí, cloná, grepeá y agregá la fila. "No encontré X" no es
  "no hacen X".
- Una tarea, un commit, empujado, y RECIÉN AHÍ la siguiente. npm run verificar en
  verde antes de commitear. El asunto no pasa de 72 caracteres.
- LANZÁ UNA AUDITORÍA antes de dar el trabajo por bueno, adversarial y de
  fidelidad, acotada al MVP. MUTAR sólo prueba que los tests cazan lo que hay;
  ATACAR con entradas BIEN FORMADAS prueba que lo que hay alcanza. Y probá la
  CADENA COMPLETA: medir funciones sueltas y concluir sobre el sistema ya salió
  caro dos veces.
- CUIDADO CON LAS JUSTIFICACIONES. El 2026-09-19, en la última sesión, escribí una
  afirmación falsa en CINCO lugares: un motivo que sonaba bien al lado de una
  decisión correcta, cuando la evidencia verdadera era más fuerte y estaba en el
  archivo que yo tenía abierto. Antes de escribir "esto no se midió", "esto no
  puede pasar" o "esto pide una tarea aparte", comprobalo.
- Avisame cuando la sesión se alargue y dejá todo listo para cerrar.

ESTA MÁQUINA:
- Node 22: export PATH="$HOME/.nvm/versions/node/v22.23.2/bin:$PATH"
- Consola en 192.168.0.78. curl -s --max-time 6 http://<consola>/raw da el estado
  entero; sale con código 28 y hay que tolerarlo. Ese volcado NO se commitea.
  LEÉ EL VOLCADO ENTERO, no su principio.
- NO tengo acceso físico a la MacBook: entro por SSH y AnyDesk (ID 287825547). No
  se pueden mover cables del banco ni tocar la perilla de la Scarlett. Vos podés
  medir igual porque corrés dentro, en iTerm, que tiene permiso de micrófono.
- Si el grabador no arranca, NO asumas que es el permiso: está en
  docs/backlog/hallazgo-el-audio-de-la-mac-se-traba-y-parece-un-permiso.md. Se cura
  con sudo killall coreaudiod, que lo corro yo.
- Antes de tonos sostenidos, mirá las CUATRO claves del supresor que están en 1.
  Y NUNCA borres los snapshots: es la única prohibición absoluta.

DÓNDE ESTAMOS: pieza 1, la pantalla de monitor. Lo último que se cerró fue que la
cuña de un músico se escuche con DOS medidores antes de dejar dar otro paso —el del
músico prueba que tocó, el de la cuña que a su parlante le llegó algo—, porque el
medidor del canal NO se mueve cuando la app sube una cuña. Está en ADR-036. La
mecánica está entera y ninguna pantalla la dispara todavía.

LAS DOS TAREAS QUE SIGUEN, y la primera sostiene a la segunda:

1. QUE LA ESCUCHA SEA DE VERDAD. Dos agujeros medidos, con sus números en
   docs/backlog/hallazgos-de-las-auditorias-de-la-cuna-2026-09-19.md:
   - Alcanza con que cada medidor se mueva UN ESCALÓN UNA SOLA VEZ en los dieciocho
     segundos, y el resto de la ventana cuenta con sólo estar sobre el piso de
     ruido. Medido: dos segundos de música con ambiente alrededor declaran
     dieciocho. En un escenario real, con un micrófono abierto entre frase y frase,
     eso se cumple solo.
   - Una caída de conexión dentro de la ventana cuesta UNA SOLA MUESTRA: 0,05 s de
     música compran el paso de 2 dB. Y cerrarlo NO pide mirar la frescura de las
     tramas: permiteEscribir() ya es falso durante toda la caída, y el muestreo ya
     corre cada 50 ms; hoy se consulta una sola vez, al final.
   LOS DOS SON HEREDADOS de la escucha de ganancia —comprobado, la misma ventana
   por ese camino da lo mismo— así que arreglarlos arregla las dos herramientas.
   Ninguno está expuesto hoy y los dos los estrena la tarea 2.

2. LA PANTALLA POR MÚSICO, que cierra la pieza 1. Son dos cosas y las dos son la
   misma pantalla:
   - Se elige a alguien y se ve su cuña con todo lo que le llega, su propio
     instrumento primero. Tiene que SABER PEDIR EL RESTO en el último paso: con
     pasos fijos de 2 dB la rampa se queda a 0,138 dB del nominal. Eso NO necesita
     tocar el motor, es una cuenta de la pantalla: el asistente ya acepta cualquier
     subida hasta 2 dB.
   - El acto de marcar "así está bien", que hoy no existe. Mientras no exista, toda
     cuña vive permanentemente en la primera operación: sin presupuesto acumulado,
     techo en nominal, 2 dB por paso y escucha obligatoria entre pasos.
   La pantalla es la que ENCADENA subir, escuchar y anotar. Los tres servicios ya
   existen; la orquestación vive afuera a propósito, porque el músico tiene que ver
   la cuenta regresiva y poder cancelar.

Y OJO CON ESTO AL HACER LA PANTALLA: el motor no cruza el canal de la medición
contra la ruta, así que UNA SOLA ESCUCHA AUTORIZA OCHO RUTAS EN PARALELO, medido.
No hace falta mala fe: la pantalla escucha una vez y tiene varias rutas del mismo
músico a mano, así que es el error que esta pieza está invitada a cometer. Es la
misma tarea que ADR-035 nombra como "el tope es por clave y el oído es por
parlante".

Preguntame por dónde arrancar antes de empezar, y si al leer encontrás que algo de
lo que dice la documentación ya no es cierto, decime primero.
