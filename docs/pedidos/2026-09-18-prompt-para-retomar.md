# Prompt para retomar — pegar después de un `/clear`

```
Proyecto Ui24R Virtual Sound Engineer, rama claude/soundcraft-ui24-assistant-kh8ezj.

ANTES DE TOCAR NADA, en este orden:
1. Leé docs/pedidos/2026-09-18-donde-quedamos.md — estado de mi consola, qué se
   hizo y qué quedó abierto. Las listas de tareas viven en el documento
   2026-09-17b-donde-quedamos.md, y ése te las apunta: leé los dos.
2. Leé docs/pedidos/2026-09-17-recapitulacion-y-hoja-de-ruta.md — manda sobre qué
   se hace y en qué orden.
3. Leé docs/adr/ADR-035-el-tope-es-por-parlante-no-por-clave.md, que es la
   decisión escrita más reciente y todavía sin implementar.
4. Cargá las skills vse-experto y vse-disciplina. Se aplican siempre, no sólo
   cuando pregunto por el proceso.
5. Verificá el estado real antes de creerle a la documentación: git status,
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
  fidelidad, y decime qué encontró. Van CUATRO jornadas seguidas en que la
  auditoría encuentra defectos reales CON LA SUITE ENTERA EN VERDE, y el
  2026-09-18 encontró el peor de todos: un arreglo que NO ARREGLABA NADA, con
  once mutantes probados y cazados y tests para cada condición. Le faltaba una
  condición que nadie había pensado, y ningún test caza una guarda que no
  existe. MUTAR prueba que los tests cazan lo que hay; sólo ATACAR con entradas
  BIEN FORMADAS prueba que lo que hay alcanza. Las pruebas verdes no son
  evidencia de nada.
- Avisame cuando la sesión se esté poniendo larga y dejá todo preparado para
  cerrar: árbol limpio, rama empujada y el documento de dónde quedamos escrito.
  El corte va después de un commit empujado, nunca a mitad de una tarea.

DETALLES PRÁCTICOS DE ESTA MÁQUINA:
- Node 22: export PATH="$HOME/.nvm/versions/node/v22.23.2/bin:$PATH"
- La consola está en 192.168.0.78. curl -s --max-time 6 http://<consola>/raw da el
  estado entero; sale con código 28 y hay que tolerarlo. Ese volcado NO se
  commitea: trae los valores enteros y el identificador de la unidad, y el
  repositorio es público.
- LEÉ EL VOLCADO ENTERO, NO SU PRINCIPIO. El 2026-09-18 se afirmó TRES veces algo
  falso o corto sobre mi consola por mirar una parte del volcado y generalizar:
  que las 38 claves de enlace estaban en "nada", que los envíos antes del fader
  eran 240, y que el supresor estaba encendido en un solo sitio. Es la misma
  forma de error que el repositorio corrige con los proyectos ajenos, cometida
  sobre el propio aparato, y las tres veces la afirmación cómoda era la falsa.
  Las dos últimas se encontraron RELEYENDO el cierre del mismo día, o sea que el
  documento que te avisa de este error lo tenía dentro.
- NO tengo acceso físico a la MacBook: entro por SSH y AnyDesk (ID 287825547).
  Vos podés medir igual porque corrés dentro de ella, en iTerm, que es el que
  tiene permiso de micrófono. Lo que NO se puede hasta que vuelva: mover cables
  del banco, tocar la perilla de la Scarlett, o reenchufarla si el USB se corta.
  Decímelo antes de lanzar una corrida larga.
- Si el grabador no arranca la captura, NO asumas que es el permiso: leé
  docs/backlog/hallazgo-el-audio-de-la-mac-se-traba-y-parece-un-permiso.md. Se
  cura con sudo killall coreaudiod, que lo corro yo por SSH.
- Antes de meter tonos sostenidos, mirá el supresor de las CUATRO instancias
  encendidas y no sólo la de la mezcla: el global, m.afs.enabled, y los
  auxiliares 1 y 2, que son las cuñas. Y nunca borres los snapshots guardados:
  es la única prohibición absoluta.

TRES COSAS DE MI CONSOLA QUE SE DESCUBRIERON EL 2026-09-18 Y CAMBIAN SUPUESTOS:
- Tengo DOS PARES ESTÉREO ACTIVOS ahora mismo: las entradas de línea y el
  reproductor. De las 38 claves de enlace, 34 están en "nada" y cuatro no.
- EL FADER DEL CANAL NO LLEGA A LAS CUÑAS: los 320 envíos a auxiliar están
  puestos ANTES del fader. Lo que sí llega es el ecualizador. Son 320 y no 240:
  los 240 son los de los canales de entrada, y faltaban los de las entradas de
  línea, el reproductor y los retornos de efecto, que son justo los dos pares
  estéreo del punto de arriba.
- EL SUPRESOR DE ACOPLE ESTÁ ENCENDIDO EN LAS CUÑAS 1 Y 2, no sólo en la mezcla
  principal. Sin ningún filtro plantado hoy, pero con los doce huecos armados.
  Son las dos cuñas sobre las que trabaja la pieza que sigue.

DÓNDE ESTAMOS:
Pieza 1 de la hoja de ruta, la pantalla de monitor. La decisión está escrita
(ADR-034), el piso construido y el motor hecho. Faltan el asistente que sepa
subir —hoy sólo sabe bajar— y la pantalla por músico, que es la que marca "así
está bien" y cierra el hueco de que hoy ninguna cuña llega a tener nivel
establecido.

OJO CON ESTO ANTES DE EMPEZAR EL ASISTENTE, son dos cosas:
1. Salir del silencio necesita una excepción al tope por paso Y un caso con
   nombre propio dentro de la atadura del origen, porque desde el piso absoluto
   no hay ningún punto de partida en decibeles que la guarda acepte. Está en
   ADR-034 y en el punto 1 de "Lo que falta de la pieza 1" del documento
   2026-09-17b.
2. La pantalla de monitor va a tener que PASARLE LAS MEDICIONES AL HISTORIAL.
   Hoy los dos servicios pasan la lista vacía, y con la lista vacía ninguna cuña
   queda con escucha comprobada, así que el segundo paso de cualquier rampa se
   rechaza. El compilador no caza una lista vacía.

LO QUE HAY ABIERTO:
Las listas están en el documento 2026-09-17b, y el 2026-09-18 cambiaron así: la
escucha entre transacciones quedó CERRADA, y el alias con ceros, el enlace
estéreo y las familias distintas dejaron de ser tres tareas para ser UNA sola,
decidida en ADR-035 y sin implementar.

Y hay nueve hallazgos nuevos, del 2026-09-18, UNO solo cerrado, en
docs/backlog/hallazgos-de-la-auditoria-del-censo-2026-09-18.md. Dos pegan
directo en ADR-035: hay 170 caminos más a los buses que NO publican la clave que
el ADR iba a leer para decidir; y el "veintitrés" del choque 2 subcontaba igual
que el 240, que ya se corrigió —y al corregirlo apareció que HOY EL BUS DE
ANÁLISIS NO SE PUEDE AISLAR por ningún camino, con dos frenos encadenados en el
motor y una fila de invariantes que prometía lo contrario—.

ADR-035 dejó tres choques anotados que hay que resolver al implementarlo: con
INV-005, con las transacciones de sistema —seleccionar el bus de análisis toca 31
rutas al mismo destino y tiene que quedar exento— y con ADR-031. Y
tres cosas sin definir: cómo se calcula el destino audible, cuánto pesa cada
camino, y cuándo dos bandas del ecualizador se pisan.

Preguntame por dónde arrancar antes de empezar, y si al leer encontrás que algo de
lo que dice la documentación ya no es cierto, decímelo primero.
```
