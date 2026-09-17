# Dónde quedamos — cierre del 2026-09-16

**Para quien retome, en cualquier sesión.** Esto no cuenta qué se hizo —eso está
en los contratos y en el `CHANGELOG`— sino **en qué estado queda todo y qué
conviene saber antes de tocar nada**.

## El estado del equipo del usuario

**Comprobado contra el volcado del 2026-09-15 a las 21:50**, tomado antes de la
primera medición de esta tanda:

| | |
|---|---|
| Líneas del volcado | **6665 antes y 6665 ahora** |
| Claves nuevas o perdidas | **0** |
| Valores distintos | **18** |
| De esos, en el canal 10 | **17** — el usuario autorizó resetearlo |
| Fuera del canal 10 | **1**: `m.afs.clearall`, de 1 a 0, **deliberado** |
| Filtros plantados en el supresor | **0** |
| Instantánea «alma caninde» | **intacta** |
| Papelito de restauración | **cerrado** |

El único cambio fuera del canal 10 está explicado en
[el hallazgo del botón trabado](../backlog/hallazgo-el-boton-clear-all-estaba-trabado.md):
el 1 que había era un residuo de este proyecto y dejaba el botón CLEAR ALL del
usuario sin flanco que disparar.

## El banco, tal como quedó cableado

Salida de la Scarlett → **canal 10**. **Master 1** → entrada 1 de la Scarlett.
Aux 5 → entrada 2. La perilla de la Scarlett en 10 dB.

**El lado derecho del general no se puede medir sin mover un cable**, y eso pide
las manos del usuario.

## Lo que quedó a medias, y es lo primero que conviene mirar

**El [ítem 120](../compromisos/120-el-umbral-y-la-profundidad-de-la-puerta.md) está
SIN CERRAR**, con dos corridas y un incidente. Su propio documento dice qué falta;
el resumen es:

1. **Volver a correr con la escalera fina** (1,5 dB), que es lo que quedó a medias
   cuando la corrida se murió.
2. **Separar el techo de la profundidad de una posible fuga del banco**, repitiendo
   con la fuente más baja.
3. **La histéresis**, que sigue sin medirse.

**Y antes de correr nada, leer
[el incidente del reparador](../backlog/hallazgo-el-reparador-planto-un-filtro.md).**
Es corto y explica por qué `reparar-pendiente.ts` ahora calla todo antes de tocar.

## Las decisiones que están tomadas y sin implementar

- **[ADR-030](../adr/ADR-030-como-se-nombran-los-tiempos.md)**: los tiempos se
  muestran con los **dos** números, el de la consola y el medido. Sin pantalla
  todavía.
- **La misma pregunta está ABIERTA para la compresión** y nadie la decidió: con la
  curva medida, la app no sabe qué mostrarle al usuario. Sin eso, la superficie
  medida no se usa.

## Lo que el usuario pidió y conviene no perder

- **Preguntarle siempre de forma interactiva**, nunca con una frase al final de un
  informe.
- **Explicarle en lenguaje de producto**, no de código ni de claves.
- **Decir explícitamente que se buscó trabajo previo**, y buscarlo de verdad: el
  inventario comprobado de los cuatro repositorios está en
  [`trabajo-previo-de-terceros.md`](../referencia/trabajo-previo-de-terceros.md).
- Preguntó **tres veces en el día** si la documentación estaba completa y **las
  tres veces faltaba algo**. La lista de los documentos que se quedan atrás está
  en la skill `vse-disciplina`, sección «Terminar una medición es más que
  archivarla».

## La observación que el usuario todavía no accionó

**El cuello de botella dejó de ser la medición.** En el día se pasó de 7 a 12 leyes
en la tabla de conversión, más la superficie del compresor, más los tiempos. **La
aplicación sigue escribiendo una sola cosa desde una sola pantalla.** Se le señaló
dos veces y eligió seguir midiendo, que es una decisión legítima; queda anotado
para que la próxima vez se pueda pesar con el número a la vista.
