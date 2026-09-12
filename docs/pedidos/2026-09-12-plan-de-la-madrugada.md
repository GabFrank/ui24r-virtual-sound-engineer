# Plan de la madrugada del 2026-09-12

**Pedido del usuario**, textual en [`00-lo-que-dijo-el-usuario.md`](00-lo-que-dijo-el-usuario.md):
«*primero haz la lista de todo lo que vas a desarrollar en esta madrugada, ya sea
mediciones o del producto… tienen mas o menos 10 horas*».

**Condiciones que hacen posible esta lista y que no existían anoche:**

1. La consola está encendida y alcanzable en `192.168.0.78`, con la Mac en
   `WIFI SALA_5G`.
2. La entrada de línea de la Scarlett es el **canal 10** — dato del usuario,
   confirmado leyendo el aparato.
3. **No hay ningún parlante conectado a ningún auxiliar.** Barrer un envío a
   monitores es medición de banco, no sonido en la sala.

---

## El orden, y por qué

**Primero las mediciones.** No porque valgan más, sino porque **la consola se
puede apagar**: anoche estuvo inalcanzable toda la noche y hoy volvió sin aviso.
Todo lo que necesita el aparato se hace mientras el aparato está. El trabajo de
producto no se pierde si la consola desaparece; una medición sí.

**Dentro de las mediciones, primero la del envío a auxiliar.** Es la que
desbloquea una decisión del usuario que lleva dos días sin llegar al código.

---

## Bloque 1 — Mediciones (necesitan la consola)

Cada una sigue el protocolo completo: contrato de expectativas **antes** de
tocar nada, una sola corrida archivada con `medir.mjs`, verificación por un
camino distinto del que escribió, restauración del estado, y commit propio.

| # | Qué | Qué queda sabido | Riesgo declarado |
|---|---|---|---|
| **94** | **Ley del envío a auxiliar**: `i.N.aux.M.value` → dB | El eje vertical que hoy falta. Sin esto no se puede declarar un límite en dB, e INV-004 rechaza todo parámetro sin límite | **El auxiliar 1 tiene el supresor encendido con un filtro de −18 dB en 999,97 Hz.** Barrer con tono de 1 kHz por ahí mide el notch y da una curva creíble y falsa. Se mide por un auxiliar con el supresor apagado (3 al 10) |
| **95** | **Qué hacen `post` y `postproc` en el audio** | Si el monitor sigue al fader y al procesamiento. Hoy están medidos como booleanos que se escriben; su efecto **no** | Son 240 banderas independientes y `settings.auxsendpoint` no las reescribe. Medir una y generalizar a las 240 sería exactamente el error que este proyecto documenta |
| **96** | **Ley del envío a efectos**: `i.N.fx.M.value` → dB | El paso 11 del camino del MVP | Puede resultar idéntica a la del auxiliar. Si lo es, hay que **demostrarlo**, no suponerlo: es la misma hipótesis que ya fue falsa una vez entre fader y medidor |
| **97** | **Compresor**: verificar `VtoTHRESH(a) = −90 + 96a` y `VtoRATIO(a) = 1/a` contra el aparato, y medir ataque y relajación en ms | Paso 9 | Las dos fórmulas salen del `mixer.html`, no de una medición. `VtoRATIO` está invertida —1 es *sin comprimir*— y ya costó una corrida entera |
| **98** | **Puerta**: verificar `gate.thresh` y `VtoGATE_DEPTH(a) = 60a − 60`, y medir retención y relajación | Paso 8. El umbral en dB es lo que alimenta la estimación de filtración | Tercera escala invertida de la consola: profundidad 0 es atenuación **máxima** |
| **99** | **Ecualizador**: las cinco bandas, `freq` en Hz, `gain` en dB, `q`, más `hpf`/`lpf` | Paso 10 | Quince parámetros. Es la medición más larga y la que más tienta a interpolar en vez de medir |
| **100** | **De-esser** | El cuarto bloque dinámico, el único que nunca se midió | No informa cuánto atenúa. Puede terminar en «no se puede medir con lo que hay», y eso también es un resultado |

## Bloque 2 — Producto que depende de lo medido

| # | Qué | Depende de |
|---|---|---|
| **101** | **Las leyes medidas entran a `conversiones.ts`**, con sus tests y su `ORIGEN_DE_LAS_CURVAS` | 94, 96, 97, 98, 99 |
| **102** | **Abrir el envío a monitores**, con su propio ADR —el número se toma al escribirlo—. `MONITOR_AUX_SEND` pasa de `USER_ONLY` a escribible, con límites en dB y su invariante | 94, 95, 101. **Es la decisión del usuario que la auditoría encontró sin propagar** |

## Bloque 3 — Producto que no necesita la consola

Se hace si la consola se cae, o cuando las mediciones terminan.

| # | Qué |
|---|---|
| **103** | **La pantalla por QR para la banda**: sólo lectura, progreso del soundcheck y a quién le toca. Idea del usuario del 2026-09-12 |
| **91** | **El plano es inusable sin dedo**: las tarjetas superpuestas no se pueden tocar |
| **92** | **`compararCaminos` a una pantalla**. Bloqueado porque `ElementoCaptacion.asignacionId` no lo escribe nadie; la salida decidida es «desde el plano: tocás el micrófono y elegís su canal» |

| **104** | **Pasada completa por la interfaz.** Pedido del usuario al cerrar la noche: qué falta cablear, si falta algún ABM, y el estado del plano del local |

### Sobre el 104, y sobre el plano que el usuario pidió

El usuario lo pidió así: «*crear el diseño del espacio con los instrumentos,
microfonos, monitores, pa, todo utilizando drag and drop y mostrando distancia
en cm de una cosa a la otra (o aun no llegamos a esa parte?)*».

**Sí llegamos, y está construido.** `apps/mobile/src/app/escenario/` tiene el
plano con fichas arrastrables por eventos de puntero, con captura, con filtro
por `pointerId` para que un segundo dedo no secuestre el arrastre en curso, y
con la aritmética separada del componente para poder probarla sin navegador.
La geometría se lee en `lo-que-dice-la-geometria.ts` y se muestra en
`escenario-edit.component.ts`.

**Pero no muestra un número en centímetros, y es a propósito.** Muestra un
**rango en metros**. La razón está en el modelo del escenario: un micrófono *en
mano* no tiene una posición, tiene una zona, y presentar «173 cm» para algo que
se mueve medio metro es inventar precisión que las entradas no tienen. Por eso
`Rango` no tiene campo de centro: para que nadie pueda leer un número único
donde no lo hay.

**El usuario lo revocó en el acto**, el 2026-09-12: «*al creae el
instrumento/microfono, se indica si es fijo o tiene rango de movimiento, punto
final*». Implementado la misma noche, en tres partes:

1. `INCERTIDUMBRE_POR_FIJEZA.FIJO` pasó de ±10 cm y ±10° a **cero**. Era el
   único número de esa tabla sin origen documental, y el único que hacía que
   `FIJO` tuviera *más* duda que `EN_PIE`.
2. El render muestra **el número solo** cuando no hay rango —«1,20 m», no «unos
   1,20 m»—, y sigue mostrando el rango entero cuando lo hay.
3. El texto de ayuda de «Fijo» en la pantalla dejó de prometer lo contrario.

Y quedó un hallazgo de regalo: el test que se rompió al cambiar la constante
pedía `r.max > 1.0`, que con `FIJO = 0,10` daba 1,1. **Estaba calibrado contra
el valor de la constante, no contra la regla.** Ahora fija la regla.

**Lo que sí falta en el plano** ya está anotado como el ítem 91: **es inusable
sin dedo** —las fichas superpuestas no se pueden tocar— y esa es la parte que
importa arreglar antes que ninguna otra del escenario.

---

## Lo que esta lista promete y lo que no

**Compromiso:** los ítems **94, 95, 96 y 102**. Son los que cierran la decisión
pendiente del usuario y el hueco que más duele.

**Probable:** 97, 98, 101.

**Si alcanza el tiempo:** 99, 100, 103, 91, 92, 104.

El 104 lo pidió el usuario «*si te da tiempo al final*», así que queda donde él
lo puso: al final, y condicionado.

**No prometo las diez horas completas de avance parejo.** Una medición sobre
hardware que sale mal se lleva una hora en entender por qué, y este proyecto
tiene escrito lo que pasa cuando se apura: se archiva una corrida distinta de la
que se miró. Si algo no se puede medir con lo que hay, se escribe que no se pudo
y por qué, en vez de estimarlo.

## Reglas que no se tocan esta noche

- **No se borra ninguna instantánea de la consola**, y menos la llamada
  «Alma Caninde».
- Antes de cada medición, instantánea automática; después, restauración
  **verificada releyendo por HTTP**, que es un camino distinto del que escribió.
- El supresor de acoples se apaga sólo si una medición lo exige, y se deja como
  estaba. Es el único de 45 campos que un recall **no** devuelve: si se apaga y
  se olvida, ninguna instantánea lo arregla.
- La alimentación fantasma del canal 9 **no se toca** (INV-007, y además es del
  usuario).
- Una tarea se cierra documentada, commiteada y empujada, y **sólo así se inicia
  la otra**.
