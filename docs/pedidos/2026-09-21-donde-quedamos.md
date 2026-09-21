# Dónde quedamos — 2026-09-21

**Para quien retome.** Reemplaza a
[`2026-09-20b-donde-quedamos.md`](2026-09-20b-donde-quedamos.md) en lo que cambió
y lo deja en pie en el resto. Sigue valiendo todo lo que los cierres anteriores
dicen del banco, del servicio de audio de la Mac y de cómo el usuario pide que se
trabaje.

**Este documento apunta, no repite.**

## Lo más importante: la pieza 2 tiene decisión, plan, y su primera tarea hecha

**El usuario eligió el criterio** entre cuatro opciones, con el trabajo previo al
lado: [ADR-038](../adr/ADR-038-el-criterio-del-ecualizador-de-canal.md). Tres
fuentes en cascada — una curva nombrada para arrancar, la medición del propio
canal para corregir, y lo que él aprueba vuelve a la biblioteca. El plan está en
[`2026-09-20c-plan-de-la-pieza-2.md`](2026-09-20c-plan-de-la-pieza-2.md).

**Y el ecualizador de canal quedó medido entero**: las doce hojas de sus cuatro
bandas. Faltaban la frecuencia y el Q de las bandas 2, 3 y 4, y comparten la ley
de la banda 1.

## La novedad que cambia el orden de lo que sigue

**Medir esas seis rutas NO las hizo escribibles, y bajó de 834 a 690 la cuenta de
lo que el motor permite.** No se cayó nada: nunca habían sido escribibles, y lo
que las contaba era el arnés de pruebas declarando decibeles para todo. Sus leyes
están en hercios y en Q, el tope de su categoría está en decibeles, e INV-004 las
rechaza — con razón, porque un tope de 4 dB no acota un salto de frecuencia.

**La guarda de ese número tenía la predicción escrita desde el 2026-09-13**:
*«mientras eso siga así, medir más leyes del ecualizador no las hace
escribibles»*. Se midieron, y no las hizo.

**Así que la tarea que sigue no es otra medición: es «un `kind`, una unidad»**
—[`hallazgo-un-kind-una-unidad-y-las-hojas-no-coinciden.md`](../backlog/hallazgo-un-kind-una-unidad-y-las-hojas-no-coinciden.md)—,
y entró al plan como la **1b**, delante de todo lo demás. Mientras no se
resuelva, la aplicación no puede mover una banda por más que las doce hojas estén
medidas.

## Los commits, en orden

| | Qué |
|---|---|
| `4f8ab6a` | **Los preajustes se pueden listar y leer**, medido. Y sus diez son de canal entero, no de ecualizador |
| `15409c9` | La auditoría tenía razón en los catorce hallazgos, y uno era una garantía rota |
| `791cf24` | **Con qué criterio decide otro cuándo mover una banda**: seis familias, y el oficio contesta con un procedimiento, no con una tabla |
| `4ce7210` | **ADR-038**, la decisión del usuario, y el plan de la pieza 2 |
| `09b0cbd` | Medir cualquier banda, y por qué la banda 2 no contaba |
| `b1811a4` | **El banco no estaba roto: el instrumento se comía 28 dB** |
| `43641d1` | **El ecualizador de canal queda medido entero** |
| *(este)* | El cierre |

Árbol limpio, `npm run verificar` en verde, **ningún PR abierto**: nadie lo pidió.

## Lo que se aprendió sobre el banco, y hay que tener presente

**El instrumento puentea el compresor del canal** —tiene que hacerlo— y con eso
**se lleva la ganancia de salida que ese compresor tenga cargada**. En el canal
10 del usuario son **28,00 dB**, del preajuste `Kick Drum` que le puso el
2026-09-15. Tres corridas fallaron su control de cierre por eso, con la ley
saliendo bien igual.

**Se compensa con el quinto argumento del guion**, el pico del estímulo: `-8` en
vez del `-27` por omisión. Con eso la dispersión pasó de 0,3 a 0,03 dB.

**Y hubo dos diagnósticos equivocados antes del bueno**, los dos con un argumento
convincente. Está entero en
[`el-banco-no-estaba-roto-el-instrumento-se-comia-28-db.md`](../backlog/el-banco-no-estaba-roto-el-instrumento-se-comia-28-db.md),
incluido lo que el usuario dijo para cortarlo, que fue lo que lo resolvió.

**La herramienta que faltaba** es `donde-se-pierden-los-db.ts`: mira **las cuatro
entradas de la interfaz a la vez**, las dos físicas y las dos que devuelven lo
que la computadora transmitió. Sin esa referencia no hay forma de distinguir
«sale poco» de «vuelve poco».

## El estado del equipo del usuario

**Esta sesión tocó su consola varias veces y la dejó como estaba, siempre
comprobado por HTTP.** Lo que se escribió: el supresor del general —apagado y
devuelto en cada corrida con tono—, el compresor y la puerta del canal 10, y una
vez 31 silencios que resultaron no servir para nada y volvieron todos. **Se
comparó el volcado completo antes y después: ninguna diferencia.**

Del volcado, para tener presente: **el canal 10 es su bombo** y tiene `Kick Drum`
en compresor y puerta; **no manda nada a los auxiliares ni a los efectos**, así
que el tono sostenido nunca llega a los supresores de las cuñas, que están
encendidos en los auxiliares 1 y 2. El supresor del general no plantó ni un
filtro en toda la sesión.

Sigue valiendo todo lo del cierre anterior: el servicio de audio de la Mac que se
traba, y que **nunca se borran los snapshots**.

## Cómo arrancar la próxima sesión

El prompt está en
[`2026-09-21-prompt-para-retomar.md`](2026-09-21-prompt-para-retomar.md),
apuntado a la tarea **1b**, que es lo único que desbloquea lo demás. Va también
escrito en el chat.
