# El validador de capturas no distingue una vieja de una actual

**Encontrado** el 2026-09-12, al cablear el zoom del plano (ítem 91).

## Qué pasó

Cambié la pantalla del plano —le agregué los mandos de zoom— y corrí
`node tools/visual/flujo.mjs`, que recorre el camino completo y captura los 28
pasos en dos anchos. Después corrí `npm run validate:docs`, que dijo:

    Capturas: 138 guardadas, alineadas con los guiones y con el índice.

Y era mentira, o mejor dicho: era verdad sobre otra cosa. Las capturas de
`docs/visual/` seguían siendo las de **antes** del cambio, sin los mandos. El
validador las declaró alineadas porque compara **nombres**, no contenido
(`tools/docs/validate-capturas.mjs:49`: «se produjo, pero no se copió a
`docs/visual/`»). Una captura que existe con el nombre correcto y muestra una
pantalla de hace tres semanas pasa el control sin que nada chille.

`tools/visual/out/` está en `.gitignore`, así que la única copia versionada es la
de `docs/visual/`, que es justamente la que puede quedar vieja. Y la copia de
`out/` a `docs/` es un paso a mano que nada obliga a dar.

## Y algo peor, que apareció al mirarlo

Comparé las 138 producidas contra las 138 guardadas. **Difieren 21.** Dos son las
del plano, que es lo que yo cambié. Las otras diecinueve son pantallas que no
toqué:

    flujo-tablet-06-banda-guardada     flujo-telefono-01-vacio
    flujo-tablet-15..19 (sesión)       flujo-telefono-17,18,20,21
    flujo-tablet-23,24,26              flujo-telefono-23,24,25,26,27

Casi todas muestran fecha, hora o duración de la sesión de prueba, así que
cambian en cada corrida por el reloj. O sea: **el flujo visual no es
reproducible**, y por eso nadie copia las capturas —copiarlas ensucia el
historial con diecinueve PNG de ruido cada vez—. El paso a mano no se saltea por
descuido: se saltea porque hacerlo bien cuesta.

Las dos cosas se refuerzan. El validador no puede exigir contenido igual porque
el contenido no es igual dos veces; y como no lo exige, una captura de verdad
vieja pasa igual.

## Por qué importa

`docs/visual/` es lo que alguien mira para saber cómo se ve el producto sin
compilarlo, y el proyecto lo trata como documentación verificada. Una captura
vieja es una afirmación falsa sobre el estado de la aplicación, de la misma
familia que una cifra citada de una corrida descartada.

## Lo que hice ahora

Copié **sólo las dos del plano**, que son las del cambio que estoy haciendo, y
dejé las diecinueve del reloj como estaban. Copiarlas todas habría metido ruido
en el commit y habría escondido este hallazgo detrás de un diff grande.

## Lo que haría falta, y no hago acá

1. **Fijar el reloj del flujo visual** (una fecha y hora congeladas por variable
   de entorno) para que las 138 capturas sean función del código y nada más.
2. **Recién entonces** el validador puede comparar contenido, y la copia de
   `out/` a `docs/` puede ser automática o exigida.

El orden importa: comparar contenido hoy daría falla en diecinueve pasos en cada
corrida, y un control que falla siempre se apaga.

## Relación con el otro hallazgo de capturas

`hallazgo-capturas-huerfanas.md` dice que el validador comprueba una sola
dirección. Éste es la otra mitad del mismo agujero: comprueba que estén los
nombres, en un sentido o en los dos, y nunca qué hay dentro.
