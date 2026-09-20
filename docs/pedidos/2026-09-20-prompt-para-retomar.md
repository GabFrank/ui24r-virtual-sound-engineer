# Prompt para retomar — 2026-09-20

**Corto a propósito.** El usuario pidió el 2026-09-20 que el prompt apunte al
producto y no arrastre todo lo que ya está escrito. El contexto largo vive en
[`2026-09-20-donde-quedamos.md`](2026-09-20-donde-quedamos.md); acá va sólo lo que
hace falta para construir lo que sigue.

---

Proyecto Ui24R Virtual Sound Engineer, rama `claude/soundcraft-ui24-assistant-kh8ezj`.

ANTES DE TOCAR NADA:
1. Leé `docs/pedidos/2026-09-20-donde-quedamos.md`.
2. Cargá las skills `vse-experto` y `vse-disciplina`. Se aplican siempre.
3. `git status` y `npm run verificar`, antes de creerle a la documentación.

**LA REGLA QUE MANDA, y es nueva:** está en
`docs/pedidos/2026-09-17-recapitulacion-y-hoja-de-ruta.md`, antes de la tabla. **Un
hallazgo medido y anotado NO es una tarea.** Entra cuando el campo lo encuentre. Los
tres documentos de `docs/backlog/` dicen en su encabezado que esperan al campo: no
los abras para trabajar, sólo si lo que estás construyendo los toca. **Mientras haya
una pieza de la hoja de ruta que no existe, esa gana.**

**LO ÚNICO QUE SIGUE: LA PANTALLA POR MÚSICO.** Cierra la pieza 1. Subir, escuchar y
anotar están enteros, probados y auditados, y **nadie los llama**: `monitor/` tiene
los tres servicios y ninguna pantalla los toca.

Son dos cosas y las dos son la misma pantalla:

- **Se elige a alguien y se ve su cuña**, con todo lo que le llega y su propio
  instrumento primero. Tiene que **saber pedir el resto en el último paso**: con
  pasos fijos de 2 dB la rampa queda a 0,138 dB del nominal, y eso es una cuenta de
  la pantalla — el asistente ya acepta cualquier subida hasta 2 dB.
- **El acto de marcar «así está bien»**, que hoy no existe. Mientras no exista, toda
  cuña vive permanentemente en la primera operación: sin presupuesto acumulado,
  techo en nominal, 2 dB por paso y escucha obligatoria entre pasos.

La pantalla es la que **encadena** subir, escuchar y anotar. La orquestación vive
afuera de los servicios a propósito: el músico tiene que ver la cuenta regresiva y
poder cancelar.

**DOS COSAS QUE ESTA PANTALLA VA A PISAR SI NADIE MIRA:**
- El motor **no cruza el canal de la medición contra la ruta**: una sola escucha
  autoriza ocho rutas en paralelo, medido. La pantalla escucha una vez y tiene
  varias rutas del mismo músico a mano — es el error que está invitada a cometer.
  ADR-035, «el tope es por clave y el oído es por parlante».
- **Cancelar una escucha** deja el estado en `LISTA` y guarda una fila espuria
  (hallazgo 10). Lo estrena el botón de cancelar de esta pantalla.

CÓMO QUIERO QUE TRABAJES — no es negociable:
- Preguntame SIEMPRE con preguntas interactivas, nunca con una frase al final.
- Explicame en lenguaje de producto: entiendo de consola, sonido y show, no de
  código. El detalle técnico va al commit.
- Lo que yo tenga que copiar, ESCRIBILO EN EL CHAT: entro por sesión remota.
- Buscá el trabajo previo de verdad y decime que lo hiciste. El inventario está en
  `docs/referencia/trabajo-previo-de-terceros.md`. Si no está, cloná, grepeá y
  agregá la fila. «No encontré X» no es «no hacen X».
- Una tarea, un commit, empujado, y RECIÉN AHÍ la siguiente. `npm run verificar` en
  verde antes de commitear. El asunto no pasa de 72 caracteres.
- LANZÁ UNA AUDITORÍA antes de dar el trabajo por bueno. Mutar sólo prueba que los
  tests cazan lo que hay; atacar con entradas BIEN FORMADAS prueba que lo que hay
  alcanza. Y probá la CADENA COMPLETA.
- CUIDADO CON LAS JUSTIFICACIONES. El 2026-09-19 y el 2026-09-20 se escribieron
  afirmaciones falsas que sonaban bien al lado de decisiones correctas, y la
  evidencia verdadera estaba en el archivo que se tenía abierto. Antes de escribir
  «esto no se midió», «esto no puede pasar» o «esto pide una tarea aparte»,
  comprobalo. Y antes de escribir «lo corregí», contá las copias con `grep`.
- Avisame cuando la sesión se alargue y dejá todo listo para cerrar.

ESTA MÁQUINA:
- Node 22: `export PATH="$HOME/.nvm/versions/node/v22.23.2/bin:$PATH"`
- Consola en 192.168.0.78. `curl -s --max-time 6 http://<consola>/raw` da el estado
  entero; sale con código 28 y hay que tolerarlo. Ese volcado NO se commitea, y se
  LEE ENTERO, no su principio.
- NO tengo acceso físico a la MacBook: entro por SSH y AnyDesk (ID 287825547).
- Antes de tonos sostenidos, mirá las CUATRO claves del supresor. Y **NUNCA borres
  los snapshots**: es la única prohibición absoluta.

Preguntame por dónde arrancar la pantalla antes de empezar, y si al leer encontrás
que algo de lo que dice la documentación ya no es cierto, decime primero.
