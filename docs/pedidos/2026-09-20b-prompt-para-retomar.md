# Prompt para retomar — después del 2026-09-20b

**Corto y apuntado a investigar**, porque lo que sigue es investigación y no
construcción. Todo lo demás vive en
[`2026-09-20b-donde-quedamos.md`](2026-09-20b-donde-quedamos.md).

---

Proyecto Ui24R Virtual Sound Engineer, rama claude/soundcraft-ui24-assistant-kh8ezj.

ANTES DE TOCAR NADA:
1. Leé docs/pedidos/2026-09-20b-donde-quedamos.md.
2. Cargá las skills vse-experto y vse-disciplina. Se aplican siempre.
3. git status y npm run verificar, antes de creerle a la documentación.

LA REGLA QUE MANDA está en docs/pedidos/2026-09-17-recapitulacion-y-hoja-de-ruta.md,
antes de la tabla: UN HALLAZGO MEDIDO Y ANOTADO NO ES UNA TAREA, entra cuando el
campo lo encuentre. Los documentos de docs/backlog/ esperan al campo.

LA PIEZA 1 ESTÁ CERRADA Y PROBADA CONTRA EL APARATO. No la toques salvo que algo
de lo que sigue la rompa.

LO ÚNICO QUE SIGUE: LA PIEZA 2, EL ECUALIZADOR DE CANAL. No existe nada de ella.
Empieza por una DECISIÓN DEL USUARIO, y la pregunta de fondo es CON QUÉ CRITERIO
la aplicación decide mover una banda. "Que suene bien" no es un número.

ESTA SESIÓN ES DE INVESTIGAR, NO DE CONSTRUIR. Tres frentes, en este orden:

1. LO DEL USUARIO, QUE YA ESTÁ. Sus preajustes están en su consola con sus
   nombres, y reúsa la misma curva de voz en varios cantantes. Leé
   docs/backlog/hallazgo-los-preajustes-del-usuario-ya-estan-en-la-consola.md.
   Falta averiguar tres cosas, y son baratas: qué significa `prmod` de verdad
   (hoy es INFERIDO, no medido), si el protocolo deja guardar y cargar
   preajustes, y si se pueden listar. Es lo que más cambia el diseño.

2. EL TRABAJO PREVIO DE VERDAD, y no alcanza con los cuatro repositorios: son
   bibliotecas de protocolo, no asistentes. Hay que mirar ecualizadores
   automáticos y asistentes de mezcla, y lo que dicen las fuentes de oficio sobre
   CADA instrumento de la lista de abajo. El inventario está en
   docs/referencia/trabajo-previo-de-terceros.md y se agregan filas, no se
   recuerda. "No encontré X" NO es "no hacen X".

3. RECIÉN AHÍ, LA DECISIÓN, con opciones y con el trabajo previo al lado.
   Acordate del 2026-09-15: ofrecer opciones sin haber mirado antes es el error
   que el usuario ya cortó una vez.

LOS INSTRUMENTOS DEL MVP, que los pidió él por nombre:
- Voces: masculina y femenina, principal y coros
- Guitarra acústica: cuerdas de nylon y de acero; rítmica y de solos
- Bajo eléctrico
- Teclado eléctrico
- Percusión: djembe grande, mediano, pequeño, de repique y de base
- Bombo/kick, PRIMERO el kick del foot case (un pedal de madera que simula un kick)
- Flautas nativo americanas
- Maracas

LAS CONDICIONES DE DISEÑO, también suyas:
- Primero una base, después se pule con él. No es definitivo ni rígido.
- LOS VALORES NO PUEDEN SER FIJOS, tienen que ser configurables.
- En el MVP NO hay configuración manual en la app: el asistente hace todo.
- Pero él puede auxiliar tocando el mixer y AVISANDO que ése es el eq preferido.
- Puede haber MÁS DE UNA configuración por tipo de instrumento.
- La consola deja crear preajustes personalizados y conviene aprovecharlo.

LO QUE HAY QUE CORREGIR ANTES DE PROMETER NADA: se le dijo que la pieza 2 no
necesita medir, y es FALSO. Del ecualizador de canal están medidas las cuatro
GANANCIAS, pero la frecuencia y el Q de la BANDA 1 SOLAMENTE. La aplicación no
sabe en qué frecuencia están paradas las bandas 2, 3 y 4. Probablemente compartan
la ley —las cuatro ganancias dieron la misma recta— pero probable no es medido.

CÓMO QUIERO QUE TRABAJES — no es negociable:
- Preguntame SIEMPRE con preguntas interactivas, nunca con una frase al final.
- Explicame en lenguaje de producto: entiendo de consola, sonido y show, no de
  código. El detalle técnico va al commit.
- Lo que yo tenga que copiar, ESCRIBILO EN EL CHAT: entro por sesión remota.
- Una tarea, un commit, empujado, y RECIÉN AHÍ la siguiente. npm run verificar en
  verde antes de commitear. El asunto no pasa de 72 caracteres.
- LANZÁ UNA AUDITORÍA antes de dar el trabajo por bueno, y verificá lo que la
  auditoría te diga: el 2026-09-20 una afirmó lo contrario de un hallazgo medido.
- CUIDADO CON LAS JUSTIFICACIONES. Antes de escribir "esto no se midió" o "esto
  no se puede", comprobalo. Antes de escribir "lo corregí", contá con grep.
- Avisame cuando la sesión se alargue y dejá todo listo para cerrar.

ESTA MÁQUINA Y MI EQUIPO:
- Node 22: export PATH="$HOME/.nvm/versions/node/v22.23.2/bin:$PATH"
- Consola en 192.168.0.78. curl -s --max-time 6 http://<consola>/raw da el estado
  entero; sale con código 28 y hay que tolerarlo. No se commitea, y se LEE ENTERO.
- LA TABLET SE CONDUCE POR RED, y es el único lugar donde la escritura se puede
  ejercitar: el diario es de Android. Pedime que la prenda con depuración
  inalámbrica; si el emparejamiento se perdió te paso el puerto y el código de
  seis dígitos de "Vincular dispositivo". Después va adb pair, adb connect,
  adb install -r con -PvseVersionCode mayor al instalado, y tools/tablet/cdp.mjs.
- NO tengo acceso físico a la MacBook: entro por SSH y AnyDesk (ID 287825547).
- Antes de tonos sostenidos, mirá las CUATRO claves del supresor: está ENCENDIDO
  en los auxiliares 1 y 2 y en el general. Y NUNCA borres los snapshots.
- Si escribís en mi consola: anotá el valor previo, elegí un bus con el fader en
  cero para que no suene, restaurá y COMPROBÁ POR HTTP.

Arrancá por el punto 1, que es lo más barato y lo que más cambia el diseño, y
decime qué encontraste antes de seguir al 2.
