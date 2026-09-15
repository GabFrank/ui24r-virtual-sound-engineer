# Compromisos: contrastar la geometría con el analizador

**Escrito antes de implementar.** Contrato compacto: el cambio es acotado.

## Qué falta

`compararCaminos()` está escrito y probado en `packages/assistants/src/acoplamiento.ts`
y **no lo llama ninguna pantalla**. Es la justificación entera del módulo del
acoplamiento —dos caminos independientes que pueden contradecirse— y hoy es
inerte a nivel de sistema.

Para contrastarlos hace falta unir tres cosas que hoy viven separadas: el canal
que sospecha el analizador (pantalla del espectro), el escenario del local (perfil
del local), y la resolución de una captación a su canal de consola (asignaciones
de la banda).

## Los compromisos

| # | Compromiso observable | Qué lo haría fallar | Procedencia |
|---|---|---|---|
| E1 | Cuando el analizador señala un canal y la geometría señala **el mismo**, la pantalla dice que se confirman | Que no lo diga, o que lo diga sin que coincidan | **Derivación**: `compararCaminos` ya distingue los casos |
| E2 | Cuando señalan canales **distintos**, la pantalla dice que **un dato registrado está mal** y cuáles pueden ser | Que diga cuál de los dos tiene razón | **Decisión propia**, apoyada en el docblock del módulo: el desacuerdo no dice quién acierta |
| E3 | Cuando la geometría **no separa** —el escalón alto apunta a más de un canal— la pantalla lo dice y no compara | Que elija uno a dedo | **Derivación**: el veredicto ya tiene ese caso |
| E4 | Sin escenario cargado, o sin sospechoso, la pantalla dice **cuál de los dos falta** | Un silencio, o un mensaje genérico | **Derivación**: el veredicto distingue los dos |
| E5 | La resolución de captación a canal **sale de las asignaciones de la banda**, no de un supuesto | Que adivine por nombre o por orden | **Regla del proyecto**: no se construye sobre un dato inventado |
| E6 | La pantalla **no propone ni escribe nada** | Cualquier sugerencia de bajar algo | **Obligación**: el módulo lo declara y `validate:limites` lo verifica |

## Supuestos y dudas

1. **De qué local sale el escenario.** De la sesión en curso. Sin sesión no hay
   local, y entonces no hay geometría: es el caso E4.
2. **Qué pasa si el escenario está cargado pero ningún micrófono tiene canal
   asignado.** La resolución devuelve nada y no hay con qué comparar. Es E4
   también, y hay que distinguirlo de «no hay escenario».
3. **El analizador puede sospechar de varios canales.** `sospechososDeRealimentacion`
   devuelve una lista ordenada por nivel. **Decisión: se compara contra el
   primero**, y la pantalla dice que es el primero, no el único.

## Lo que NO promete

- No dice a qué frecuencia. Eso lo dice el analizador y ya lo muestra.
- No dice cuál de los dos datos está mal cuando se contradicen.
- No funciona sin escenario cargado, y no lo disimula.

---

## El bloqueo estaba mal diagnosticado (2026-09-12)

El plan de la madrugada decía que este ítem estaba «bloqueado porque
`ElementoCaptacion.asignacionId` no lo escribe nadie». **El campo nunca se
escribe y ése no era el bloqueo.** `compararCaminos` no lo lee: recibe un
resolvedor, `canalDeLaPareja: (p: ParejaExpuesta) => number | null`, y lo único
que faltaba era escribir ese resolvedor. Lo hizo mirar un mandato de auditoría.

**Y `asignacionId` no habría que escribirlo, aunque se pudiera.** El escenario es
del **local**: se carga una vez y se reusa con cada banda que toca ahí. La
asignación de canal es de la **sesión**, que empareja una banda con un local.
Guardar el canal en el elemento del escenario lo dejaría viejo la primera vez que
toque otra banda, y nadie se enteraría — el dato seguiría ahí, plausible y falso.
Es la misma forma de defecto que la auditoría de anoche encontró nueve veces en
la documentación: **una copia que envejece sola.**

La cadena ya existía entera y nadie la había recorrido:

    micrófono --fuenteId--> fuente --bandMemberId--> integrante
                                                          |
                                          asignación --bandMemberId

`canalDeLaCaptacion(escenario, asignaciones)` la recorre y arma sus índices una
sola vez, porque el asistente lo llama por cada pareja expuesta —que son n × m—.

**Las cuatro ambigüedades se distinguen, y eso es la mitad del valor.** Devuelve
`null` cuando el micrófono no dice qué instrumento toma, cuando apunta a una
fuente que no está, cuando la fuente no dice quién la toca, y —el interesante—
**cuando el integrante tiene más de un canal**: quien canta también toca la
guitarra, la cadena llega al integrante y ahí se bifurca. Devolver el primero
sería inventar.

Para que la pantalla pueda decir qué hacer en cada caso hay `porQueNoHayCanal`,
que devuelve la razón en castellano con los canales concretos: «quien toca
“Voz” tiene 2 canales (7, 12) y “SM58” no dice cuál toma». Un «no se pudo» sin
decir cuál de las cuatro deja al usuario sin nada que hacer.

`compararCaminos` trata bien el `null`: lo filtra, y si no le queda ningún canal
contesta `SIN_GEOMETRIA` en vez de adivinar. Así que las cuatro terminan
diciendo «la geometría no puede decidir esto».

**Lo que sigue faltando es la pantalla**, no el dato.
