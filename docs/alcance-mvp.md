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
| 5 | **Armar el escenario**: dónde está cada fuente, micrófono, monitor y caja | **construido** |
| 6 | **Recorrido guiado, instrumento por instrumento** | **construido**; falta que entre en el camino de usuario verificado |
| 7 | Por cada instrumento: ganancia | construido, y **medido** |
| 8 | Por cada instrumento: **puerta** | **la ley del umbral no está medida** |
| 9 | Por cada instrumento: **compresor** | **las leyes no están medidas** |
| 10 | Por cada instrumento: **ecualizador de canal** | **las leyes no están medidas** |
| 11 | Por cada instrumento: **cuánto manda a cada efecto** | **la ley del envío no está medida** |
| 12 | Envíos de monitor por auxiliar | **la ley del envío no está medida** |
| 13 | Guardar la instantánea al terminar | **construido** |
| 14 | Cerrar la sesión con su registro exportable | **construido** |

El paso 5 va **antes** del recorrido guiado a propósito: lo que la aplicación
sabe del espacio cambia lo que puede proponer en los pasos siguientes, y sobre
todo cambia lo que puede **explicar**.

**Las cinco leyes que faltan se miden antes de la primera entrega.** Decidido con
el usuario el 2026-09-11, y no es un detalle de cronograma: cambia qué es el
recorrido guiado. La alternativa era un recorrido que lleva a la banda por las
seis etapas ajustando sola la única medida y anotando a mano las otras cinco —
útil, y a la vez un soundcheck a medias que se quedaría así. Se eligió medirlas.

Eso las convierte en **trabajo presencial de la ruta crítica**: puerta y
compresor encadenados, ecualizador de canal, y envíos a efecto y a monitor con
el dato de dónde derivan. Hasta entonces el recorrido existe, ordena y explica,
pero sólo la ganancia se aplica sola.

### El orden del recorrido

Lo publica [orden-del-soundcheck.md](orden-del-soundcheck.md), con las tres
fuentes de oficio de las que sale. La aplicación **propone**; el usuario
reordena arrastrando y lo que elija queda guardado en el perfil de la banda. La
propuesta no puede salir de la intuición de quien programa: o se la respalda o
no se la propone.

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

## El escenario, y por qué la geometría cambia lo que se puede decir

La aplicación de hoy razona sobre **señales**: niveles, espectro, medidores. Con
el escenario cargado razona además sobre **el espacio**, y eso da algo que este
proyecto no tiene: **dos caminos independientes hacia la misma conclusión**.

Si la geometría dice «el monitor 2 apunta casi directo al micrófono 4» y el
analizador dice «hay un lazo a 9 kHz», se confirman. Si la geometría señala otra
pareja como la más acoplada, **una de las dos está mal**: el monitor no está
donde se dijo, está en un auxiliar distinto del registrado, o el micrófono se
movió. Hoy no hay forma de detectar ninguna de las tres.

Es el método de siempre —medir por dos caminos y comparar— aplicado a la sala.

### Qué permite decir, de más fuerte a más flojo

1. **Convertir el detector de realimentación en un diagnóstico.** Hoy dice «algo
   suena a 9 kHz». Con el escenario: «el par más acoplado es monitor 2 →
   micrófono 4, a 1,2 m y 30° fuera del eje; ese canal tiene la ganancia en
   34 dB».
2. **Estimar la filtración, que es lo que le da sentido a la puerta.** El umbral
   tiene que quedar **por encima de lo que se filtra y por debajo de la fuente**.
   Con las distancias hay una primera estimación de esa diferencia; sin ellas, el
   umbral es adivinanza.
3. **Un punto de partida para los envíos de monitor.** Quien ya escucha algo por
   el aire necesita menos en su cuña.
4. **Documentación de lo que sonó bien.** El escenario es parte del sonido de la
   banda, tanto como la instantánea.

### Qué NO permite, escrito antes de construirlo

**No predice la frecuencia del lazo.** Eso lo deciden los modos de la sala y la
respuesta del micrófono y de la caja. La geometría **ordena parejas por riesgo**;
la frecuencia la dice el analizador.

**Y la precisión al centímetro es falsa para la mitad de los elementos.** Un
micrófono en un pie frente a un amplificador está a ±5 cm. Un cantante con
micrófono de mano se mueve medio metro cada dos compases.

Por eso **cada elemento lleva su incertidumbre** —fijo, en pie, o en mano— y
**toda inferencia se presenta con ella**. «Entre 8 y 14 dB de acoplamiento» es
honesto; «11,3 dB» es mentir con decimales. La aplicación acepta centímetros
porque el usuario los sabe para algunas cosas; lo que no hace es devolver
conclusiones más precisas que sus entradas.

### El modelo

**Lo que se acopla es el micrófono, no el instrumento.** Un amplificador de
guitarra en un punto es una *fuente*; el micrófono delante es lo que el monitor
realimenta. Para una voz están casi en el mismo sitio; para una batería, no.

Tres piezas nuevas, colgadas de lo que ya existe:

- **Escenario**, que vive en el **local** y no en la banda, porque los monitores
  se mueven de sala en sala. El local ya tiene dimensiones en el modelo.
- **Emplazamiento**: posición, orientación e incertidumbre.
- **Elementos**: fuente, captación (micrófono con su patrón polar, o caja directa
  —que no tiene relevancia espacial—), monitor con el auxiliar que lo alimenta, y
  componente de amplificación.

Los monitores y el sistema **ya están medio modelados**: el perfil de
amplificación tiene componentes con su bus, y el bus distingue general, auxiliar
y matriz. Falta agregarles emplazamiento y tipo.

El micrófono necesita **el patrón polar** —cardioide, supercardioide, omni—, que
es un dato de catálogo. **No reabre el registro de micrófonos**, que es sobre
curvas de corrección y sigue siendo fase futura.

### Orden

El escenario **se construye primero**, antes de medir las leyes. Es producto
puro, no necesita la consola ni la sala, y arranca dando **diagnóstico** —qué se
filtra en qué, qué pareja es la más acoplada— sin proponer ni escribir nada. Para
cuando haya sesión de mediciones, ya está listo para alimentarla.

## Sobre el tamaño

El usuario lo dijo así, y conviene tenerlo a mano cuando algo se quiera recortar
por largo:

> No te preocupes con el tamanho del MVP, porque lo que estamos construyendo de
> por si es gigante, y sera divertido hacerlo.

**Eso no autoriza a agregar cualquier cosa**: lo que queda fuera sigue fuera por
sus motivos. Lo que retira es un motivo en particular — que algo cueste mucho
tiempo no alcanza, por sí solo, para dejarlo afuera.

## Qué queda dentro

- Ganancia asistida y automática.
- **Puerta, compresor y ecualizador de canal**, asistidos y automáticos. Una
  mezcla de banda no se resuelve sólo con ecualización: la puerta decide cuánto
  de lo ajeno entra por cada micrófono y el compresor cuánto se mueve cada fuente.
- **Cuánto manda cada canal a cada efecto**, y qué efecto es.
- **Envíos de monitor por auxiliar**, con el escenario como punto de partida.
- **El escenario**: dónde está cada cosa, con qué orientación y con cuánta
  incertidumbre. Registro de monitores y sistema de amplificación con su tipo.
- El recorrido guiado que lleva a la persona de un instrumento al siguiente.
- **Detección de realimentación durante el soundcheck**, con los micrófonos
  abiertos. Está construida y medida contra un lazo real; el escenario la
  convierte en diagnóstico.
- La instantánea final, y el registro de qué se cambió y por qué.

### La pantalla para la banda

Idea del usuario el 2026-09-12: **una pantalla de sólo lectura, accesible por QR,
donde la banda ve el progreso del soundcheck y a quién le toca.** Fija —
disponible siempre que la aplicación esté abierta— y servida sobre la red local,
que según él suele ser un router externo.

Entra al MVP porque resuelve un problema real del soundcheck —que nadie tenga que
preguntar cuándo le toca, y que quien se queda sin monitor dos segundos entienda
por qué— y porque **no depende de ninguna ley sin medir**.

**Y deja de ser sólo de lectura.** El 2026-09-12 el usuario la amplió: «*cada
integrante selecciona su propio instrumento/voz, mientras se hace el soundcheck
puede solicitar bajar o subir su retorno, **solamente solicitar**, la app decide
si aceptar o declinar*». Y eligió, entre opciones, que la aplicación **decida
sola y le avise** —no que le pase cada pedido para aprobar—.

Tres cosas de ese enunciado que cambian el diseño y conviene no perder:

1. **«Solamente solicitar» es la parte importante.** El músico no escribe en la
   consola: propone. Lo que decide es el motor de seguridad, con los mismos
   límites, techo y estados que cualquier otro cambio. Un pedido es un
   `CambioPropuesto` más, y eso es justamente lo que hace esto barato de
   construir: la puerta ya está abierta por ADR-028.
2. **«Cada integrante selecciona su propio instrumento/voz»** ata la pantalla al
   perfil de la banda que ya existe, y resuelve solo el problema de a qué canal
   corresponde cada pedido — sin login, sin cuentas.
3. **Declinar tiene que decir por qué.** Un pedido rechazado sin motivo es peor
   que no poder pedir: el músico vuelve a pedir. El motor ya devuelve el
   invariante y el mensaje de cada rechazo; esta pantalla es el primer lugar
   donde ese mensaje lo lee alguien que no es el operador.

**Lo que sigue sin entrar:** que el músico toque nada que no sea su propio
retorno.

Su detalle está en
[`pedidos/2026-09-12-diagnostico-y-mediciones.md`](pedidos/2026-09-12-diagnostico-y-mediciones.md).

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
| **Parámetros internos de los efectos** (`par1`…`par6`) | Su significado **cambia según el tipo de efecto** y son seis sin nombre por cada uno: la medición de resultado menos claro. Decidir el tiempo de caída de un reverb es gusto, no técnica. **Y esto recorta un pedido explícito del usuario**, que nombró los efectos entre lo que tiene que entrar al MVP: entra cuánto manda cada canal a cada efecto y qué efecto es, no cómo suena por dentro. Queda declarado como recorte, y se puede volver a preguntar. *(Y el argumento de que era «la medición más larga» se retira: el usuario dijo «no te preocupes con el tamaño del MVP».)* |
| Curvas de corrección de micrófono | El escenario necesita el **patrón polar**, que es de catálogo. La curva medida sigue siendo fase futura |
| Automix | Mueve ganancias por su cuenta; se superpone con lo que hace la aplicación |
| Concurrencia con **otro operador** | Congelado donde está: medido y funcionando. En este escenario hay un solo operador |
| Otra banda, otros instrumentos | El criterio de aceptación es la banda y el local de siempre |

## Lo que bloquea

**Ninguno de los parámetros nuevos tiene su ley medida.** La matriz de
capacidades los declara *desconocidos*: se sabe escribir las rutas y que la
consola las difunde, pero no qué significan los números.

| Qué | Rutas | Qué falta saber |
|---|---|---|
| Ecualizador de canal | `i.N.eq.b1..b5.{gain,q,freq}`, `i.N.eq.hpf.freq` | cuántos dB, sobre qué Hz, con qué Q |
| Puerta | `i.N.gate.{thresh,depth,attack,hold,release}` | sobre todo **el umbral en dB**: es lo que la filtración estimada alimenta |
| Compresor | `i.N.dyn.{threshold,ratio,attack,release,outgain}` | umbral en dB, relación, tiempos en ms |
| Envío a efecto y a monitor | `i.N.fx.M.value`, `i.N.aux.M.value` | dB, y dónde se deriva (antes o después del fader) |

Son **cuatro sesiones de medición** y todas necesitan la sala: señal, micrófono y
el usuario presente. La de la puerta y la del compresor se pueden encadenar,
porque comparten la fuente.

Sin ellas hay asistencia de ganancia, y el escenario dando diagnóstico. Nada más.

## Cuándo está terminado

**Una sesión completa, con la banda de siempre, en el local de siempre, sin
tocar la consola a mano en ningún momento**, que termine con la instantánea
guardada y verificada en la lista de la consola.

Y dos condiciones que no se ven en la pantalla:

- El registro de la sesión permite **reconstruir qué se cambió y por qué**,
  parámetro por parámetro, con su confirmación.
- La consola queda como se la encontró en todo lo que la aplicación no debía
  tocar, **comprobado por un camino distinto del que escribió**.
- **El escenario y la medición no se contradicen**: cuando hay realimentación, la
  pareja que la geometría señala como más acoplada es una de las que el
  analizador confirma. Si no coinciden, la sesión no está terminada — hay algo
  registrado donde no está.
