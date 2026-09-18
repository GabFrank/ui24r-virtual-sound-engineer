# Prompt para retomar, después de un `/clear`

**Para pegar tal cual.** Sale del cierre del 2026-09-17 y reemplaza al que venía
usándose, que citaba el documento anterior y una pieza que ya está hecha.

---

Proyecto Ui24R Virtual Sound Engineer, rama claude/soundcraft-ui24-assistant-kh8ezj.

ANTES DE TOCAR NADA, en este orden:
1. Leé docs/pedidos/2026-09-17b-donde-quedamos.md — estado de mi consola, qué se
   hizo, qué encontraron las auditorías y qué quedó abierto.
2. Leé docs/pedidos/2026-09-17-recapitulacion-y-hoja-de-ruta.md — manda sobre qué
   se hace y en qué orden.
3. Cargá las skills vse-experto y vse-disciplina. Se aplican siempre, no sólo
   cuando pregunto por el proceso.
4. Verificá el estado real antes de creerle a la documentación: git status,
   npm run verificar, y el volcado de la consola contra el retrato.

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
  verde antes de commitear, nunca en rojo.
- Si aparece un hallazgo en medio de una tarea, va como tarea nueva.
- LANZÁ UNA AUDITORÍA del trabajo antes de darlo por bueno, y decime qué
  encontró. La del 2026-09-17 encontró un agujero grave y once afirmaciones
  falsas con la suite entera en verde: las pruebas no alcanzan.
- Avisame cuando la sesión se esté poniendo larga y dejá todo preparado para
  cerrar: árbol limpio, rama empujada y el documento de dónde quedamos escrito.
  El corte va después de un commit empujado, nunca a mitad de una tarea.

DETALLES PRÁCTICOS DE ESTA MÁQUINA:
- Node 22: export PATH="$HOME/.nvm/versions/node/v22.23.2/bin:$PATH"
- La consola está en 192.168.0.78. curl -s --max-time 6 http://<consola>/raw da el
  estado entero; sale con código 28 y hay que tolerarlo.
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
(ADR-034), el piso construido y EL MOTOR YA HECHO: distingue poner el nivel de
una cuña de retocarla, suspende el presupuesto mientras la cuña no tiene nivel y
frena en nominal.

Faltan dos cosas, en este orden:
1. El asistente que sepa subir — hoy sólo sabe bajar. Incluye el primer paso
   desde el silencio, que es el único pedazo de ADR-034 que el motor no hace.
2. La pantalla por músico, que es además la que marca "así está bien" y cierra el
   hueco de que hoy ninguna cuña llega a tener nivel establecido.

De las tareas que dejaron las auditorías quedan DOS abiertas, en "Tres cosas que
las auditorías encontraron: una arreglada, dos abiertas", más una nueva: medir la
ley de la ganancia del previo contra el aparato. La primera de las tres —que el
tope de 2 dB por paso era evadible mintiendo de dónde venía— YA SE ARREGLÓ, y su
arreglo le cambió el trabajo al asistente que sigue: leé el punto 1 de "Lo que
falta de la pieza 1" antes de empezarlo.

Preguntame por dónde arrancar antes de empezar, y si al leer encontrás que algo de
lo que dice la documentación ya no es cierto, decímelo primero.
