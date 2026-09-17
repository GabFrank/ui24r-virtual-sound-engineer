# Recapitulación y hoja de ruta rumbo al MVP — 2026-09-17

**Qué pidió el usuario, textual**, y qué se decidió a partir de eso. Es la
primera hoja de ruta escrita **desde el soundcheck** y no desde la consola.

## Lo que dijo

> me gustaria hacer una recapitulacion de todo. Volver a leer cuales son
> nuestros objetivos, nuestro mvp, que ya hicimos y que aun no hicimos. Sobre
> mediciones, me gustaria que averigues cuales mediciones son realmente utiles
> para nuestra aplicacion y cuales son meramente informativas, lo que no quiero
> que pase es que gastemos un tiempo considerable para obtener una medicion que
> al final no lo va a usar nadie, sera como un trofeo de plastico.

Y corrigiendo una primera lectura que contaba «13 leyes medidas, 1 en uso» como
defecto:

> que la app no la use hoy tiene sentido porque aun no la cableamos, osea por
> mas que visualmente ya se crearon varias cosas en la app, todavia [no]
> ingresamos a la etapa de vincular lo que se midio con alguna herramienta real
> dentro de la app.

**Su soundcheck, paso por paso**, con la advertencia que puso él mismo —«*es lo
que yo hago, no significa que es lo correcto y estoy abierto a aprender como
hacen los mejores*»—:

> iniciar desde un show nuevo, sin nada configurado, primeramente identificar
> cada canal, de quien es, que instrumento, etc, identificar cuantos monitores
> tengo y donde estan, PAs (nivel de master y Pas en minimo). Luego voy al primer
> instrumento, supongamos, guitarra acustica, de inicio la ganancia esta en
> minimo, lo subo hasta que visualmente me carga unos -12 db (lo habia leido en
> algun tutorial, puedes investigar si existe alguna forma mejor de setear la
> ganancia dependiendo del instrumento o voz), una vez que la ganancia esta en
> -12 con la persona tocando el instrumento de forma intensa, ahi levanto el
> nivel del master a un volumen razonable y tambien el volumen el aux para que el
> musico tenga referencia, una vez ambos arribas (sin estar aun en volumen
> final), voy pasando primero por eq, luego gate (si hace falta), luego
> compresor, luego efectos, una vez el sonido este como me gusta, paro ese
> instrumento y voy al proximo, uno por uno hasta terminar. La siguiente etapa es
> levantar uno por uno, voy probando algunas combinaciones, voz + guitarra, luego
> mas una voz, mas una guitarra, el bajo, mas voces, percusiones, etc, no tengo
> una base teorica del porque lo hago asi, solo estoy contandote, tu trabajo fue
> y es investigar las mejores formas de hacer el soundcheck. Penultimo, ajusto
> los niveles de monitor para cada musico y por ultimo ajusto el nivel final del
> master.

> Pasos extras: a veces tambien ajusto el eq de los efectos, principalemente el
> delay, retiro un poco freq altas pues tiende a querer dar feedback, soundcraft
> automaticamente genera algunos cortes cuando detecta feedback, yo los dejo asi,
> pero reseteo cada vez que voy a iniciar en un lugar distinto.

## Su soundcheck contra el de las fuentes

**En lo esencial coincide** con el orden que publican las fuentes: revisión de
líneas → instrumento por instrumento → monitores desde silencio → mezcla →
general → guardar. Lo que difiere o afina:

| Lo que hace | Lo que dicen las fuentes | Consecuencia |
|---|---|---|
| Ganancia hasta −12 con el músico tocando fuerte | Picos entre −12 y −6 dBFS **a nivel de show** ([Reliable Audio Gear][rag]); [gearnews][gn-gain] va más arriba, −6 a 0. **Ninguna distingue por instrumento**; lo que sí dicen es dejar más margen a lo que va a recibir realce de ecualización | Su −12 está dentro. La aplicación ya lo hace **por perfil** (`channel-profiles.ts`: voz 12, guitarra 14, bajo 10, cajón 8), más fino que las fuentes. **Pendiente:** revisar esos márgenes contra fuentes — el cajón con menos margen que la voz va contra el sentido común de los transitorios |
| Sube general y monitor «a un nivel razonable» antes de ecualizar | Monitores desde silencio, primero el propio instrumento; general a nivel de trabajo | Coincide. **No estaba en los 14 pasos del MVP** |
| EQ → puerta → compresor → efectos | La única fuente que lista etapas las da **en orden de importancia, no de ejecución** ([orden-del-soundcheck.md](../orden-del-soundcheck.md)) | Su orden vale tanto como el del recorrido (puerta → EQ → compresor). La aplicación deja reordenar instrumentos y **no etapas**: pendiente |
| Combinaciones: voz + guitarra, + voz, + bajo… | «Full band pass»; armar la mezcla empezando por la voz principal al máximo antes del acople, después bombo y bajo ([gearnews][gn-sc]) | Tiene base de oficio. **La etapa no existía en el MVP.** Decidido: entra (ADR-031) |
| Resetea los cortes del supresor en cada sala | El «ring out» se hace **antes** de que llegue la banda, parado en el lugar del músico ([Ringing out][ro]) | Correcto; el botón ya está destrabado. Lo que agregan las fuentes es *cuándo* |

*Sound on Sound —«monitores o sala primero» y «mezcla de monitores»— no cargó
en tres intentos el 2026-09-17. Lo dicho sobre monitores sale de las otras.*

## Las herramientas que su soundcheck le pide a la aplicación

Una herramienta **actúa** cuando tiene las cinco cosas: **tope** en el motor de
seguridad, **decisión** que abre la categoría, **servicio** que arma el cambio,
**pantalla**, y **ley medida o lazo cerrado** sobre un medidor.

| # | Herramienta | Construido | Medido | Le falta |
|---|---|---|---|---|
| 1 | **Preparar el show**: canales, monitores y su lugar, PA abajo, supresor reseteado, revisión de líneas | canales, escenario, medidores | el reset del supresor | la lista de preparación; decidir si la aplicación resetea el supresor o lo pide |
| 2 | **Ganancia por instrumento** | **de punta a punta** | sí | revisar los márgenes por perfil |
| 3 | **Nivel de referencia**: general y monitor a nivel de trabajo | no | monitor sí | el general es **sólo del usuario**: la aplicación lo pide. Subir el monitor desde silencio **no tiene techo decidido** |
| 4 | **Ecualizador de canal** | no | **entero** | decisión, criterio del asistente, servicio, pantalla |
| 5 | **Puerta** «si hace falta» | no | profundidad y sostenido | tope, decisión, servicio, pantalla. El «si hace falta» ya está en el perfil (`usaPuerta`) |
| 6 | **Compresor** | no | pendiente del umbral; la «relación» es una curva | tope, cómo se muestra, servicio, pantalla. El perfil ya trae una relación por instrumento |
| 7 | **Envío a efectos** | no | acotado a 0,25 dB | resolver la contradicción alcance/autonomía: **resuelta, entra** (ADR-033) |
| 8 | **Mezcla de conjunto** | **nada** | el fader de canal **no está en la tabla medida** | todo. Decidido: entra, la aplicación mueve faders (ADR-031) |
| 9 | **Monitores por músico** y **general final** | servicio de monitor sí; pantalla no; pantalla QR no | sí | la pantalla; el general se pide |

## Las mediciones, rehechas: herramienta o trofeo

La pregunta correcta, con la etapa de cableado por delante, no es «¿quién la
usa hoy?» sino **«¿alguna de las nueve herramientas la va a cablear?»**.

**Herramienta — alguna de las nueve la cablea:** la ganancia del previo; el
medidor calibrado contra la salida real (99b, 102); el ecualizador de canal
entero (101, 103, 108, 113); el envío a monitor (94, 104); el indicador de puerta
y el medidor de reducción; el modo seguro del supresor (111); la profundidad y el
sostenido de la puerta (116, 120), para mostrar.

**Trofeo respecto del MVP — ninguna herramienta la cablea:** el ecualizador de
salida en sus dos superficies (109, 112: el propio alcance lo deja para la
segunda entrega); los faders de bus y del general (99a, 106, 107: rutas
cerradas); la superficie y los tiempos del compresor (98, 114, 115, 117, 118,
119: para actuar alcanza el medidor de reducción, ADR-032); **el umbral de la
puerta en dB** (120: se ajusta por lazo cerrado, ADR-032).

**Y dos que faltan y SÍ son herramienta**, porque la mezcla de conjunto entra:
la **ley del fader de canal contra la salida real** —lo que el 104 hizo para el
envío a monitor, y se puede hacer sin manos en el banco— y **dónde deriva el
envío a monitor**, antes o después del fader: si es después, mover faders en la
mezcla cambia los monitores que ya quedaron bien.

## Lo que se decidió, eligiendo entre opciones

1. **La mezcla de conjunto entra al MVP, y la aplicación mueve faders**, dentro
   de topes. → [ADR-031](../adr/ADR-031-la-mezcla-de-conjunto-entra.md).
2. **Puerta y compresor se ajustan cerrando el lazo** sobre el indicador de
   puerta y el medidor de reducción, sin medir más leyes. El umbral en dB y la
   superficie del compresor quedan congelados. →
   [ADR-032](../adr/ADR-032-puerta-y-compresor-por-lazo-cerrado.md).
3. **Los envíos a efectos entran**: cuánto manda cada canal a cada efecto, con
   tope. Los parámetros internos y el ecualizador del retorno siguen siendo del
   usuario. → [ADR-033](../adr/ADR-033-los-envios-a-efectos-entran.md).
4. **La primera pieza después de arreglar lo que miente es la pantalla de
   monitor.**

## La hoja de ruta

| Orden | Pieza | Herramientas | Necesita consola |
|---|---|---|---|
| 0 | **Arreglar lo que miente** — hecho el 2026-09-17: la tabla del recorrido, el alcance, la contradicción de los efectos | — | no |
| 1 | **Pantalla de monitor**. El techo desde silencio **ya estaba decidido** (ADR-028: si la app no bajó, no hay techo). Lo que apareció al empezar: el asistente sólo sabe bajar, el presupuesto de 4 dB por sesión hace imposible la rampa, y el silencio queda fuera del tramo medido. Decidido en [ADR-034](../adr/ADR-034-poner-el-nivel-de-monitor-y-retocarlo.md) | 9, 3 | no |
| 2 | **Ecualizador de canal**: decisión, asistente con criterio (espectro contra curva objetivo y banda útil del perfil), servicio, pantalla | 4 | para verificar |
| 3 | **Puerta y compresor por lazo cerrado**: topes, servicio, pantalla | 5, 6 | para verificar |
| 4 | **Preparar el show** y **nivel de referencia** | 1, 3 | no |
| 5 | **Mezcla de conjunto**: medir el fader de canal y dónde deriva el envío; el asistente de mezcla | 8 | **sí, sin manos** |
| 6 | **Envíos a efectos** | 7 | para verificar |
| 7 | **La sesión de verdad**, con la banda y en el local | todas | **sí, con la banda** |

**Congeladas hasta después del MVP:** el umbral de la puerta en dB, la
superficie del compresor como interfaz, el ecualizador de salida y su lado
derecho, los faders de bus y del general.

## Fuentes

- [Gain Staging for Live Sound — Reliable Audio Gear][rag]
- [Gain Staging for PA Systems — gearnews][gn-gain]
- [Soundcheck like a Pro — gearnews][gn-sc]
- [Ringing out — Wikipedia][ro]
- [The Pro Audio Files, Sweetwater y Sound on Sound, ya citadas en `orden-del-soundcheck.md`](../orden-del-soundcheck.md)

[rag]: https://reliableaudiogear.com/gain-staging-for-live-sound/
[gn-gain]: https://www.gearnews.com/gain-staging-for-pa-systems-live/
[gn-sc]: https://www.gearnews.com/soundcheck-like-a-pro-an-engineers-guide/
[ro]: https://en.wikipedia.org/wiki/Ringing_out
