# Prompt para retomar, después de un `/clear`

**Para pegar tal cual.** Sale del tercer cierre del 2026-09-17 y reemplaza a
[`2026-09-17b-prompt-para-retomar.md`](2026-09-17b-prompt-para-retomar.md), que
cita dos tareas que ya están hechas.

---

Proyecto Ui24R Virtual Sound Engineer, rama claude/soundcraft-ui24-assistant-kh8ezj.

ANTES DE TOCAR NADA, en este orden:
1. Leé docs/pedidos/2026-09-17c-donde-quedamos.md — estado de mi consola, qué se
   hizo y qué quedó abierto. Las listas de tareas viven en el documento anterior,
   2026-09-17b-donde-quedamos.md, y ése te las apunta: leé los dos.
2. Leé docs/pedidos/2026-09-17-recapitulacion-y-hoja-de-ruta.md — manda sobre qué
   se hace y en qué orden.
3. Cargá las skills vse-experto y vse-disciplina. Se aplican siempre, no sólo
   cuando pregunto por el proceso.
4. Verificá el estado real antes de creerle a la documentación: git status,
   npm run verificar, y el volcado de la consola contra el del cierre anterior.

CÓMO QUIERO QUE TRABAJES — esto no es negociable:
- Preguntame SIEMPRE con preguntas interactivas, nunca con una frase al final de
  un informe.
- Explicame en lenguaje de producto: entiendo de consola, sonido y show; no de
  código, claves ni nombres de función. El detalle técnico va al commit o al
  documento, que es donde se audita.
- Buscá el trabajo previo de verdad y decime explícitamente que lo hiciste. El
  inventario de los cuatro repositorios está en
  docs/referencia/trabajo-previo-de-terceros.md. "No encontré X" no es "no hacen
  X", y ya pasó cuatro veces.
- Una tarea, un commit, empujado, y RECIÉN AHÍ la siguiente. npm run verificar en
  verde antes de commitear, nunca en rojo. El asunto del commit no pasa de 72
  caracteres: el gancho lo frena y hay que reescribirlo.
- Si aparece un hallazgo en medio de una tarea, va como tarea nueva.
- LANZÁ UNA AUDITORÍA del trabajo antes de darlo por bueno, adversarial y de
  fidelidad, y decime qué encontró. Van tres jornadas seguidas en que la auditoría
  encuentra defectos reales CON LA SUITE ENTERA EN VERDE: un agujero por el que
  se movieron 31 dB con la transacción aplicada, y un test calibrado por encima
  de la regla que decía comprobar. Las pruebas verdes no son evidencia de nada.
- Avisame cuando la sesión se esté poniendo larga y dejá todo preparado para
  cerrar: árbol limpio, rama empujada y el documento de dónde quedamos escrito.
  El corte va después de un commit empujado, nunca a mitad de una tarea.

DETALLES PRÁCTICOS DE ESTA MÁQUINA:
- Node 22: export PATH="$HOME/.nvm/versions/node/v22.23.2/bin:$PATH"
- La consola está en 192.168.0.78. curl -s --max-time 6 http://<consola>/raw da el
  estado entero; sale con código 28 y hay que tolerarlo. Ese volcado NO se
  commitea: trae los valores enteros y el identificador de la unidad, y el
  repositorio es público.
- NO tengo acceso físico a la MacBook: entro por SSH y AnyDesk (ID 287825547).
  Vos podés medir igual porque corrés dentro de ella, en iTerm, que es el que
  tiene permiso de micrófono. Lo que NO se puede hasta que vuelva: mover cables
  del banco, tocar la perilla de la Scarlett, o reenchufarla si el USB se corta.
  Decímelo antes de lanzar una corrida larga.
- Si el grabador no arranca la captura, NO asumas que es el permiso: leé
  docs/backlog/hallazgo-el-audio-de-la-mac-se-traba-y-parece-un-permiso.md. Se
  cura con sudo killall coreaudiod, que lo corro yo por SSH.
- Antes de meter tonos sostenidos, mirá m.afs.enabled — está en 1. Y nunca borres
  los snapshots guardados: es la única prohibición absoluta.

DÓNDE ESTAMOS:
Pieza 1 de la hoja de ruta, la pantalla de monitor. La decisión está escrita
(ADR-034), el piso construido y el motor hecho. Faltan el asistente que sepa
subir —hoy sólo sabe bajar— y la pantalla por músico, que es la que marca "así
está bien" y cierra el hueco de que hoy ninguna cuña llega a tener nivel
establecido.

OJO CON ESTO ANTES DE EMPEZAR EL ASISTENTE: el trabajo de salir del silencio
creció con lo que se arregló el 2026-09-17c. Antes necesitaba una excepción al
tope por paso; ahora necesita además un caso con nombre propio dentro de la
atadura del origen, porque desde el piso absoluto no hay ningún punto de partida
en decibeles que la guarda acepte, así que el destino que ADR-034 eligió no se
puede ni expresar. Está en ADR-034 y en el punto 1 de "Lo que falta de la pieza 1"
del documento 2026-09-17b.

QUEDAN OCHO TAREAS ABIERTAS, todas medidas, repartidas en cuatro listas del
documento 2026-09-17b. La que yo pondría primera es la de la escucha entre
transacciones: hoy nadie comprueba que entre un paso y el siguiente se haya
escuchado de verdad, y es lo que le da sentido al freno que se acaba de poner.
Anotando la medición, quince transacciones mueven 28,5 dB en 19 ms.

Y hay un hilo que une a la mitad de esas tareas, que conviene mirar antes de
atacarlas una por una: el tope se cuenta por clave y el oído es por parlante.
El alias con ceros, el enlace estéreo de fmalcher y las familias distintas sobre
el mismo canal son la misma tarea vista desde tres lados.

Preguntame por dónde arrancar antes de empezar, y si al leer encontrás que algo de
lo que dice la documentación ya no es cierto, decímelo primero.
