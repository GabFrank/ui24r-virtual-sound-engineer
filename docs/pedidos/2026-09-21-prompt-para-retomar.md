# Prompt para retomar — 2026-09-21

> Registro histórico. Para retomar usar [estado actual](../estado-actual.md).
> Sus reglas de arranque y comprobación fueron reemplazadas por AGENTS.md y CONTRIBUTING.md.

Pegar tal cual al abrir la próxima sesión.

---

Proyecto Ui24R Virtual Sound Engineer, rama claude/soundcraft-ui24-assistant-kh8ezj.

ANTES DE TOCAR NADA:
1. Leé docs/pedidos/2026-09-21-donde-quedamos.md.
2. Cargá las skills vse-experto y vse-disciplina. Se aplican siempre.
3. git status y npm run verificar, antes de creerle a la documentación.

LA REGLA QUE MANDA está en docs/pedidos/2026-09-17-recapitulacion-y-hoja-de-ruta.md,
antes de la tabla: UN HALLAZGO MEDIDO Y ANOTADO NO ES UNA TAREA, entra cuando el
campo lo encuentre. Los documentos de docs/backlog/ esperan al campo.

LA PIEZA 1 ESTÁ CERRADA Y PROBADA CONTRA EL APARATO. No la toques.

LA PIEZA 2 ES EL ECUALIZADOR DE CANAL, y ya tiene decisión y plan:
- ADR-038 fijó el criterio: tres fuentes en cascada. Una curva nombrada para
  arrancar, la medición del propio canal para corregir una banda por vez, y lo
  que el usuario aprueba vuelve a la biblioteca con nombre.
- El plan está en docs/pedidos/2026-09-20c-plan-de-la-pieza-2.md.
- La tarea 1 está HECHA: el ecualizador de canal quedó medido entero el
  2026-09-21, las doce hojas de sus cuatro bandas (ítem 121).

LO ÚNICO QUE SIGUE ES CONSTRUIR LA TAREA 1b, Y ES LO QUE DESBLOQUEA TODO LO
DEMÁS. La decisión ya está tomada: ADR-039, del 2026-09-21. Leela entera antes
de tocar código, incluido el recuadro del principio, que dice qué encontró la
auditoría.

EN UNA FRASE: el motor tiene dos guardas de unidad y cada una mira una tabla
distinta, así que para una hoja de frecuencia NINGUNA declaración pasa las dos.
Se arregla separando la unidad de la magnitud —que queda como está— de la
ESCALA DEL MOVIMIENTO, que es nueva: octavas en la frecuencia, octavas de ancho
de banda en el Q, decibeles en la ganancia.

LOS CUATRO PASOS ESTÁN EN docs/pedidos/2026-09-20c-plan-de-la-pieza-2.md, en la
1b. Tres cosas que no se pueden pasar por alto:
- El orden de «poner la banda» es parte de la decisión: LA GANANCIA VA PRIMERO.
  El ejecutor escribe uno por uno y los intermedios suenan.
- Leer el tope por hoja CAMBIA LA INTERFAZ PÚBLICA de @vse/domain: el contexto
  del cambio no lleva la ruta. Son siete sitios que consultan LIMITES, no
  cuatro, y tres están fuera del motor.
- El conteo tiene que volver a 930 EXACTO, ni una ruta más.

Y ANTES DE ENCENDER LA EXENCIÓN DEL SALTO LIBRE FALTA UNA MEDICIÓN BARATA:
correr una campana neutra a lo largo del tramo medido y comprobar que la
respuesta no se mueve. Lo que hay hoy es una cota sobre una configuración
quieta. Lo demás se construye sin eso.

DESPUÉS DE 1b, EL PLAN SIGUE ASÍ: decidir si la aplicación puede elegir qué canal
analiza el analizador de la consola —es una escritura de clase nueva y le cambia
una pantalla al operador—; leer el espectro de un canal; el asistente que decide
qué banda mover; el servicio; la pantalla; y las dos fuentes de la biblioteca.

SI HAY QUE VOLVER A MEDIR CONTRA EL BANCO, LEÉ ESTO PRIMERO:
docs/backlog/el-banco-no-estaba-roto-el-instrumento-se-comia-28-db.md. El
instrumento puentea el compresor del canal y se lleva la ganancia de salida que
ese compresor tenga cargada: en el canal 10 son 28 dB del preajuste Kick Drum. Se
compensa con el quinto argumento de curvas-del-ecualizador.ts, el pico del
estímulo: -8 en vez del -27 por omisión. Y si algo no cuadra, corré primero
tools/spikes/p0-2b-eq/donde-se-pierden-los-db.ts, que mira las cuatro entradas de
la interfaz a la vez y separa «sale poco» de «vuelve poco».

CÓMO QUIERO QUE TRABAJES — no es negociable:
- Preguntame SIEMPRE con preguntas interactivas, nunca con una frase al final.
- Explicame en lenguaje de producto: entiendo de consola, sonido y show, no de
  código. El detalle técnico va al commit.
- Lo que yo tenga que copiar, ESCRIBILO EN EL CHAT: entro por sesión remota.
- Una tarea, un commit, empujado, y RECIÉN AHÍ la siguiente. npm run verificar en
  verde antes de commitear. El asunto no pasa de 72 caracteres.
- LANZÁ UNA AUDITORÍA antes de dar el trabajo por bueno, y verificá lo que la
  auditoría diga.
- CUIDADO CON LAS JUSTIFICACIONES. Antes de escribir «esto no se midió» o «esto
  no se puede», comprobalo. Antes de escribir «lo corregí», contá con grep.
- Avisame cuando la sesión se alargue y dejá todo listo para cerrar.

ESTA MÁQUINA Y MI EQUIPO:
- Node 22: export PATH="$HOME/.nvm/versions/node/v22.23.2/bin:$PATH"
- Consola en 192.168.0.78. curl -s --max-time 6 http://<consola>/raw da el estado
  entero; sale con código 28 y hay que tolerarlo. No se commitea, y se LEE ENTERO.
- EL BANCO DE MEDICIÓN: la Scarlett está en el canal 10, que es mi BOMBO y tiene
  el preajuste Kick Drum. El canal 10 no manda nada a los auxiliares ni a los
  efectos.
- LA TABLET SE CONDUCE POR RED, y es el único lugar donde la escritura a la
  consola se puede ejercitar. Pedime que la prenda con depuración inalámbrica.
- NO tengo acceso físico a la MacBook: entro por SSH y AnyDesk (ID 287825547).
- Antes de tonos sostenidos, mirá las CUATRO claves del supresor: está ENCENDIDO
  en los auxiliares 1 y 2 y en el general. Y NUNCA borres los snapshots.
- Si escribís en mi consola: anotá el valor previo, restaurá y COMPROBÁ POR HTTP.
