# Catálogo de instrumentos

Para que el usuario **elija** su instrumento de una lista en vez de escribirlo, y
para que esa elección sirva después: traer el perfil de canal que le
corresponde y, más adelante, sostener decisiones de mezcla.

El catálogo vive en `packages/domain/src/data/instrumentos.ts`. Esta página
explica el porqué; **hay un test que lee las tablas de acá y las compara con el
código** (`packages/domain/test/instrumentos-doc.test.ts`), como el de
[channel-profiles.md](channel-profiles.md).

## Tres facetas, no un árbol

Un instrumento se describe con tres cosas independientes entre sí:

| Faceta | Qué responde | Ejemplos |
|---|---|---|
| `fuente` | qué es | voz, guitarra, djembe, entrada de línea |
| `variante` | qué clase de esa cosa es | de nylon, eléctrica, tumbadora, tesitura aguda |
| `rol` | para qué se la usa en el tema | principal, coro, base, repique, solista |

El árbol de tres niveles —fuente → variante → rol, cada hoja una combinación—
se descartó por dos motivos:

- **Multiplica hojas.** «Conga» por tres tamaños por tres roles son nueve hojas
  que repiten nueve veces la misma información. Agregar un rol obliga a tocar
  todas las ramas de todas las fuentes.
- **Obliga a recorrer ramas para preguntar lo obvio.** «Todos los repiques»,
  «todas las voces de coro» y «qué hay conectado de registro grave» son
  preguntas que el sistema va a hacer seguido. Con facetas cada una es un
  filtro sobre una lista plana; con un árbol es un recorrido.

Lo que **sí** depende de la fuente es qué variantes y qué roles tienen sentido:
un djembe no tiene tesitura de voz y una voz no es «de nylon». Cada fuente
declara su propia lista, y el constructor `crearInstrumento()` rechaza lo que
la fuente no admita. Que la estructura impida las combinaciones absurdas antes
de guardarlas es la mitad del valor de esto.

`variante` y `rol` pueden quedar en `null`: un shaker no tiene tesitura ni
tamaño declarado, y una entrada de línea no cumple una función musical propia
—la cumple lo que venga por ella—.

## Nada de esto es una medición

Los nombres, las variantes y los roles son **convención musical** del
repertorio del usuario: percusión afrolatina y canción. No salen de ningún
spike y no hay un número detrás. Lo único que enlaza con datos del proyecto es
la última columna, el perfil de canal, y ese enlace se declara fuente por
fuente.

Los nombres siguen a los que el proyecto ya usa: los canales del simulador
(`tools/mixer-sim/src/state.mjs`) y los perfiles de
[channel-profiles.md](channel-profiles.md). No se inventó vocabulario nuevo
para cosas que acá ya tenían nombre.

## Las trece fuentes

| Fuente | Se muestra | Variantes | Roles | Perfil de canal |
|---|---|---|---|---|
| VOZ | voz | TESITURA_GRAVE, TESITURA_MEDIA, TESITURA_AGUDA | PRINCIPAL, SEGUNDA_VOZ, CORO | LEAD_VOCAL |
| PALABRA | palabra | — | PRINCIPAL | SPEECH |
| GUITARRA | guitarra | NYLON, ACERO, ELECTRICO | BASE, SOLISTA, REFUERZO | ACOUSTIC_GUITAR |
| BAJO | bajo | ELECTRICO, ACUSTICO | BASE, SOLISTA | BASS |
| TECLADO | teclado | — | BASE, SOLISTA, REFUERZO | KEYBOARD |
| FLAUTA | flauta | — | PRINCIPAL, SOLISTA, REFUERZO | FLUTE |
| DJEMBE | djembe | TAMANO_GRANDE, TAMANO_MEDIANO, TAMANO_PEQUENO | BASE, REPIQUE, SOLISTA | — |
| BOMBO | bombo | — | BASE, REPIQUE | — |
| CAJON | cajón | CON_BORDONAS, SIN_BORDONAS | BASE, REPIQUE, SOLISTA | CAJON |
| CONGA | conga | TAMANO_GRANDE, TAMANO_MEDIANO, TAMANO_PEQUENO | BASE, REPIQUE, SOLISTA | CONGA |
| MARACA | maraca | — | BASE, REFUERZO | SHAKER |
| SHAKER | shaker | — | BASE, REFUERZO | SHAKER |
| LINEA | entrada de línea | — | — | PLAYBACK |

La columna «perfil de canal» es el perfil por defecto de la fuente. Dos fuentes
lo afinan según la faceta elegida:

| Fuente | Faceta | Valor | Perfil |
|---|---|---|---|
| VOZ | rol | SEGUNDA_VOZ | BACKING_VOCAL |
| VOZ | rol | CORO | BACKING_VOCAL |
| GUITARRA | variante | NYLON | ACOUSTIC_GUITAR |
| GUITARRA | variante | ACERO | ACOUSTIC_GUITAR |
| GUITARRA | variante | ELECTRICO | ELECTRIC_GUITAR |

Precedencia: manda la variante, después el rol, después el perfil por defecto.
La variante gana porque describe el aparato —una guitarra eléctrica es otro
aparato— mientras que el rol solo describe cómo se lo usa. Hoy ninguna fuente
declara las dos tablas, y hay un test que lo comprueba: el día que alguna las
declare, esta regla ya está escrita y no se decide sobre la marcha.

## Las fuentes que no tienen perfil

**Djembe** y **bombo** quedan deliberadamente sin perfil de canal.

No es una omisión ni una tarea pendiente de completar con el más parecido. Un
perfil dice «para esta fuente el pasa altos suele estar entre tanto y tanto, y
el margen buscado es este». Ponerle a un djembe el perfil de conga
—pasa altos entre 60 y 90 Hz— corta justo donde vive el golpe grave del
djembe, y la aplicación presentaría ese rango con la misma cara que los que sí
se pensaron. Con el bombo pasa lo mismo: ningún perfil de la tabla baja de
30 Hz con el margen que pide un parche grande, y el de cajón, que es el otro
golpe grave con parche, arranca en 45 Hz.

Cada fuente sin perfil dice por qué en `sinPerfilPorque`, y hay un test que
exige que lo diga: una fuente no puede quedarse sin perfil en silencio. Hasta
que se midan, esos canales se configuran a mano o con el perfil
«Personalizado», que existe exactamente para eso.

## Qué pasa con lo que ya estaba escrito

Hasta ahora, `BandMember.instrumentos` era una lista de cadenas escritas a mano
y `ChannelAssignment.instrumento` una cadena. Hay perfiles de banda guardados
así en la columna `datos` de `band_profile`.

La regla es que **el texto no se pierde nunca**:

1. La **migración 4** del almacén (`packages/store/src/esquema.ts`) le da forma
   al documento: cada cadena pasa a ser un instrumento con las tres facetas en
   nulo y el texto en `textoOriginal`. No clasifica nada, porque SQL no sabe
   qué es un djembe. Convierte elemento por elemento, así que es idempotente y
   una base a medio migrar termina bien igual.
2. `normalizarInstrumentos()` completa la clasificación la primera vez que el
   perfil pasa por el dominio. Lo que el catálogo no reconoce se queda sin
   fuente, con su texto intacto.
3. `etiquetaDeInstrumento()` muestra **el texto original cuando lo hay**. Un
   integrante cargado con «GUITARRA CRIOLLA» sigue diciendo «GUITARRA CRIOLLA»
   en la pantalla, aunque por dentro ya esté clasificado como guitarra de
   nylon. Reescribirle al usuario lo que él escribió, para mostrarle nuestro
   nombre, es cambiarle los datos sin pedirle permiso.

Separar la migración de la clasificación es deliberado. Una conversión que
interpreta es una conversión que puede equivocarse, y equivocarse dentro de una
migración deja al usuario sin forma de volver atrás.

`ChannelAssignment.instrumento` sigue siendo texto: es la etiqueta que se
muestra y la que se sincroniza con el nombre del canal en la consola. La
clasificación va aparte, en `instrumentoDetalle`, y se lee siempre con
`instrumentoDeAsignacion()`, que interpreta la etiqueta cuando la clasificación
todavía no está.

## Lo que falta para decidir el panorama

El motivo por el que el usuario pidió clasificar los instrumentos es poder
derivar hacia qué lado va cada canal. **Eso todavía no está decidido y no está
implementado.** Una sugerencia de panorama es una convención, no una medición,
y esta fase no escribe nada en la consola.

Lo que ya está:

- El protocolo expone `i.N.pan` como CONFIRMADO en
  [capability-matrix.md](capability-matrix.md), con rango 0..1.
- `packages/domain/src/rules/ownership.ts` clasifica `CHANNEL_PAN` como
  escribible y propiedad del asistente de mezcla, y
  [autonomy-matrix.md](autonomy-matrix.md) lo deja en SUGGEST.
- Las facetas son lo que una regla de panorama necesita para agrupar: todas las
  fuentes de una misma familia, todos los repiques, todo lo que va al centro
  por ser la voz principal.

Lo que falta, en orden:

1. ~~**Qué canales forman un par estéreo.**~~ **Resuelto el 2026-09-09, y no
   como estaba previsto.** Iba a pedírsele al usuario; resultó que la consola ya
   lo sabe. `i.N.stereoIndex` existe en los 24 canales: **0 es el primero del
   par y su compañero es el canal siguiente, 1 es el segundo, −1 es sin
   enlazar**. Se lee, no se declara — una cosa menos que el usuario tiene que
   decir, y una cosa menos que se puede desincronizar con la consola. Ver
   `packages/mixer-adapter/src/pares-estereo.ts` y
   `docs/spikes/SPK-P0.2a/evidence/enlace-estereo-2026-09-09.txt`.

   Con una advertencia que sí es nueva: **enlazar desde la aplicación sería
   destructivo**. El cliente de la consola copia todos los ajustes del canal
   izquierdo sobre el derecho antes de escribir el enlace. Por eso el adaptador
   solo lee.
2. **La regla, escrita como convención y no como medición.** Qué va al centro
   (voz principal, bajo, bombo), qué se abre y cuánto, y qué hace cuando hay
   tres congas y no dos. Con su fundamento, o declarada como preferencia del
   usuario y guardada en el perfil de banda.
3. **La invariante que la acota.** Escribir panorama es escribir en la consola,
   así que necesita su entrada en [safety-invariants.md](safety-invariants.md) y
   su test antes de salir de SUGGEST.
4. **Con qué se verifica que mejoró.** La regla 4 del repositorio —primero
   medir, después corregir— pide volver a medir y revertir si empeoró. Para el
   panorama no hay hoy ninguna medición que diga si mejoró.

## Revisión

El catálogo es un punto de partida informado y **no está validado con la banda
todavía**. Lo que hace falta revisar con el usuario: si faltan fuentes de su
repertorio, si las variantes son las que él distingue al tocar, y si los
nombres son los que usa.

| Fecha | Revisado por | Cambios |
|---|---|---|
| _pendiente_ | | |
