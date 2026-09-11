# Compromisos: la pantalla del recorrido guiado

**Escrito antes de implementar**, según `docs/protocolo-de-verificacion.md`. Lo
que sigue es el contrato: qué tiene que hacer, qué observación lo haría fallar, y
**de dónde sale cada expectativa**. El núcleo del orden ya está construido
(`packages/domain/src/rules/recorrido.ts`, commits `1a0f703` y `94e9c5b`); falta
la pantalla.

## Qué falta hoy

Una auditoría lo dejó claro: `ordenPropuesto`, `aplicarOrdenGuardado`,
`LEY_MEDIDA` y `ETAPAS_EN_ORDEN` **no los llama nadie**. No hay ruta, no hay
arrastre, y **no existe ningún lugar donde el orden del usuario se persista** —
aunque un docblock decía que quedaba guardado.

## Los compromisos

| # | Compromiso observable | Qué lo haría fallar | De dónde sale |
|---|---|---|---|
| C1 | Desde una sesión activa se llega al recorrido, y muestra un instrumento por canal asignado, en el orden propuesto | Que falte un canal asignado, o que el orden sea el de canal | **Derivación** del núcleo ya construido |
| C2 | Arrastrar un instrumento a otra posición cambia su puesto en la lista | Que el arrastre no mueva nada, o mueva otro | **Pedido del usuario**: «una pantalla con una lista de items y drag and drop para ordenar» |
| C3 | Al guardar, el orden queda en el perfil de la banda, y al volver a entrar se muestra ése y no el propuesto | Que al reabrir vuelva el propuesto | **Pedido del usuario**: «el usuario puede cambiar» implica que el cambio sobreviva |
| C4 | Un canal asignado después de guardar el orden aparece al final, no desaparece | Que no esté en la lista | **Derivación**: ya está en `aplicarOrdenGuardado` y su test |
| C5 | Cada instrumento muestra sus seis etapas, y las cinco sin ley medida se ven distintas de la que sí la tiene | Que las seis se vean igual, o que se insinúe que la app puede ajustar las cinco | **Decisión propia**, apoyada en la regla de no construir sobre ley no medida |
| C6 | La etapa de ganancia lleva a la pantalla de ganancia que ya existe | Que duplique esa pantalla o que no lleve a ningún lado | **Decisión propia** |
| C7 | La pantalla no escribe en la consola por sí misma | Cualquier escritura originada acá | **Decisión propia**: el recorrido navega y registra; quien escribe es la pantalla de cada etapa |

## De dónde sale el orden, y qué es decisión

Está en `docs/orden-del-soundcheck.md`, con la separación ya hecha: la tabla de
familias sale de **una sola fuente** —las otras dos no coinciden y una la
contradice—, esa fuente **no da ningún motivo**, y **seis de los trece puestos
son decisión propia**. La pantalla no puede presentar el orden como si lo
prescribiera el oficio.

## Supuestos y dudas abiertas

1. **Dónde se persiste el orden.** Lo natural es el perfil de la banda
   (`BandProfile`), porque el orden depende de la formación y no del local. Eso
   necesita un campo nuevo y una migración. **Es una decisión, no un hecho.**
2. **Si el orden es por banda o por banda-y-local.** Una banda puede ordenarse
   distinto en una sala distinta. Se decide por banda, que es lo más simple, y
   queda anotado que puede ser insuficiente.
3. **Qué pasa con los canales asignados que no están en vivo.** `isLive` existe
   y hoy el recorrido lo ignora. Una auditoría lo señaló: en una consola de 24
   entradas con 9 usadas, las asignaciones viejas se recorren igual. **Duda
   abierta**: ¿se excluyen, o se muestran marcadas?
4. **Un kit de batería son varios canales y un solo paso de soundcheck.** El
   recorrido es canal por canal. Está declarado como límite en el documento del
   orden; no se resuelve acá.

## Lo que este contrato NO promete

- No promete que el orden propuesto sea bueno para cualquier formación. Para un
  coro, una obra de teatro o un grupo de percusión, la mayoría de los canales
  cae en «no clasificado» y el orden propuesto es el de canal disfrazado.
- No promete que la app ajuste nada más que la ganancia.
- No promete nada sobre el orden dentro de una familia más allá del número de
  canal.
