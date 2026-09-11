# Alcance del MVP

Decidido con el usuario el 2026-09-11. **Reemplaza a la escalera MVP0–MVP4b**
que estaba repartida por otros documentos: aquélla no definía un entregable sino
una progresión de riesgo, y estaba ordenada suponiendo que había un show en
curso. Ya no lo hay en la primera entrega, así que el orden cambia.

## Qué es

Un asistente de sonido **para el soundcheck**. Acompaña a la banda de principio
a fin —instrumento por instrumento— hasta dejar la mezcla guardada en una
instantánea de la consola.

**No es un asistente de show.** Durante la función no hace nada.

## El camino, de punta a punta

| # | Paso | Estado |
|---|---|---|
| 1 | Cargar la banda: integrantes e instrumentos | **construido** |
| 2 | Cargar el local y el sistema de amplificación | **construido** |
| 3 | Empezar la sesión eligiendo banda y local | **construido** |
| 4 | Asignar qué entrada es qué instrumento | **construido** |
| 5 | **Recorrido guiado, instrumento por instrumento** | **falta entero** |
| 6 | Por cada instrumento: ganancia | construido, y **medido** |
| 7 | Por cada instrumento: ecualización de canal | **la ley del ecualizador no está medida** |
| 8 | Guardar la instantánea al terminar | **construido** |
| 9 | Cerrar la sesión con su registro exportable | **construido** |

## Cómo actúa

**La aplicación aplica sola, dentro de topes, y se la puede frenar.** No propone
para que alguien toque un botón: mueve el parámetro, vuelve a medir, y conserva
o revierte.

Esa decisión tiene un precio que conviene ver de frente: **los topes tienen que
morder de verdad**. El 2026-09-11 se encontró que el tope de ±3 dB por
transacción comparaba decibeles contra el valor crudo del protocolo y **no se
disparaba nunca** — dejaba pasar un salto de 61,9 dB, el recorrido entero del
previo. Con la aplicación proponiendo, eso es un aviso feo; con la aplicación
aplicando sola, es un altavoz roto.

Por eso lo que sigue **no es opcional en este MVP**, aunque no se vea en ninguna
pantalla:

- **Punto de retorno antes de cada transacción** (INV-001), verificado releyendo
  la lista de la consola.
- **Comparación contra el valor esperado** antes de escribir (INV-011): si otro
  cliente lo movió, no se escribe.
- **Confirmación de cada escritura** por la conexión testigo, o por el medidor
  cuando el testigo no puede abrir.
- **Topes por transacción y acumulados por sesión**, en la unidad correcta.
- **Paro de emergencia** que corta la autonomía en el acto.

## Qué queda dentro

- Ganancia asistida y automática.
- **Ecualización de canal** asistida y automática — el verbo central.
- El recorrido guiado que lleva a la persona de un instrumento al siguiente.
- **Detección de realimentación durante el soundcheck**, con los micrófonos
  abiertos. Está construida y medida contra un lazo real.
- La instantánea final, y el registro de qué se cambió y por qué.

## Qué queda fuera, y por qué

| Fuera | Motivo |
|---|---|
| Cualquier corrección **durante el show** | Decisión del usuario: la primera entrega no la necesita |
| **Traslado a una sala nueva** con micrófonos | Segunda entrega. Arrastra el ecualizador de salida, la curva objetivo y el registro de micrófonos |
| Micrófono de medición y su curva de corrección | Depende de lo anterior |
| Ecualizador **de salida** (el gráfico de 31 bandas) | Depende de lo anterior |
| Retardo y polaridad de salida | Alineación de sistema; no hace falta para mezclar una banda |
| Grabación multipista y pendrive | No aparece en el camino de punta a punta |
| Supresor de realimentación de la consola | Solo lectura. Es el único campo que un recall **no** devuelve |
| Automix | Mueve ganancias por su cuenta; se superpone con lo que hace la aplicación |
| Concurrencia con **otro operador** | Congelado donde está: medido y funcionando. En este escenario hay un solo operador |
| Otra banda, otros instrumentos | El criterio de aceptación es la banda y el local de siempre |

## Lo único que bloquea

**La ley del ecualizador de canal no está medida.** La matriz de capacidades la
declara *desconocida* para `i.N.eq.b1..b5.{gain,q,freq}`: se sabe escribir esas
rutas y que la consola las difunde, pero no cuántos decibeles son, sobre qué
frecuencia, ni con qué factor de calidad.

Sin eso no hay ecualización asistida — sólo de ganancia. Y necesita la sala:
señal, micrófono y el usuario presente.

## Cuándo está terminado

**Una sesión completa, con la banda de siempre, en el local de siempre, sin
tocar la consola a mano en ningún momento**, que termine con la instantánea
guardada y verificada en la lista de la consola.

Y dos condiciones que no se ven en la pantalla:

- El registro de la sesión permite **reconstruir qué se cambió y por qué**,
  parámetro por parámetro, con su confirmación.
- La consola queda como se la encontró en todo lo que la aplicación no debía
  tocar, **comprobado por un camino distinto del que escribió**.
