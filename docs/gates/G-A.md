# Acta de control G-A

**Estado:** ⬜ Pendiente · **12 de 14 criterios contestados, 8 en verde** · repasado contra la realidad el 2026-09-10

> **Ningún criterio de esta tabla pasa a ✅ sin que lo mire alguien más.** La
> regla está en [TEMPLATE.md](TEMPLATE.md) con el porqué. Salió de esta misma
> acta: el 2026-09-10 se cerraron cuatro criterios y una auditoría independiente
> volvió uno a amarillo, le puso salvedades a dos, y encontró que el arreglo
> hecho para cerrar otro rompía la aplicación entera.

> **Qué cuenta como «contestado»:** que la celda *Medido* tenga un resultado, aunque sea parcial o negativo. Un criterio que dice «un modo de tres» está contestado y no cumplido; uno que dice «sin medir» o «solo contra el simulador» no está contestado. Con esa definición son **12**: los **ocho en ✅**, más reconexión, la avalancha —detectada, con el umbral a medias— —un modo de tres—, instantáneas manuales —sin los 50 ciclos, pero con lo que sí está medido— y el alcance de la recuperación, contestado con una excepción. Los dos que faltan son los de P0.7a, que necesitan un pendrive con contenido. La avalancha, que en el repaso anterior no contaba por estar probada solo contra el simulador, ahora está medida contra el aparato y entra. Y el alcance de la recuperación pasó de una celda vacía a una respuesta con una excepción, así que también.
>
> **Y el denominador estaba mal.** Esta línea dijo «de 13» durante varias revisiones; la tabla tiene **14** filas desde que se escribió. El error sobrevivió porque nadie contó: se venía copiando el número de la revisión anterior mientras se discutía el numerador. **Un total heredado no es un total medido** — y este documento existe precisamente para no dejar pasar eso.
**Responsable:** desarrollador principal

## Qué desbloquea

El adaptador de la consola, la máquina de estados de conexión, y con ellos el primer entregable completo.

## Criterios

| Spike | Criterio | Tipo | Umbral | Medido | Resultado |
|---|---|---|---|---|---|
| P0.1 | Reconexión automática por cada modo de corte | bloqueante | 20 de 20 en 10 s o menos | **Un modo de tres.** Wifi cortada: 20 de 20 desde la tablet, mediana 3,7 s, máximo 5,0. Faltan router apagado y cambio de IP, que necesitan a alguien físicamente ahí | ⬜ |
| P0.1 | Cadencia de medidores registrada y umbral de inestabilidad fijado | bloqueante | tres estadísticos | `RTA` **desde la tablet**: media 33 ms, p95 40 ms, idéntico en silencio y con señal → **umbral de inestabilidad 99 ms**. **La mediana de 33 ms NO es de la tablet: salió de la laptop por cable**, y acá figuraba como si fuera del mismo aparato — dos estadísticos de una corrida y el tercero de otra, cosidos en una línea. Lo marcó una auditoría. Se mide sobre `RTA` y nunca sobre `VU2`, que la consola calla en silencio | ✅ |
| P0.1 | La consola devuelve eco de las escrituras propias | informativo | sí o no | **No.** Seis segundos escuchando, cero líneas para la ruta escrita, en dos parámetros distintos. La escritura sí se aplica y sí se difunde a los demás clientes | ✅ |
| ACK-POLICY | Tabla de confirmación por parámetro completa | bloqueante | 100 % de las filas | **Medido en vez de redactado, y el criterio pide más de lo que se midió.** La matriz tiene **21 filas** y el barrido recorrió **18 rutas**: «100 %» es la meta, no el resultado, y las dos filas que nadie barrió quedan marcadas *Inferido*. De las 18: **18 de 18 difundidas**, las dos veces. Restauradas y comprobadas desde fuera: 11 de 18 el 2026-09-10, **18 de 18 el 2026-09-11**, y esto último con la comparación de las 6732 claves **dentro del archivo** y no en la terminal de quien la corrió. La latencia **no reprodujo** —mediana 17 ms entonces, 0 ahora— y **por qué no está medido**. Con esto queda escrito también el texto normativo de INV-011 | ✅ |
| P0.2a | Subconjunto del primer entregable confirmado en hardware | bloqueante | 100 % de la lista | **16 de 16, cerrado el 2026-09-10.** Las seis que faltaban —fantasma en lectura, silencio de auxiliar, los dos puntos de derivación, matriz y retardos— se midieron en una corrida: 9 escrituras, 9 difundidas, 9 restauradas, la restauración comprobada por HTTP. Con tres hallazgos que el charter no anticipaba: `i.N.phantom` existe y contradice a `hw.N.phantom`; la matriz solo la alcanzan dos de los veinticuatro canales; y la unidad de los retardos **sigue sin medirse** | ✅ |
| P0.2a | Especificación del protocolo versión 1 generada | bloqueante | sí | **Sí, y estaba desde el 2026-09-08 sin marcar acá.** `docs/protocol-spec.md`, versión 1; `docs/capability-matrix.md`, 78 filas con estado, versión 1 | ✅ |
| P0.9 | Sobrescrituras de cambios ajenos | bloqueante | 0 | **0, medido contra la consola el 2026-09-10.** Un segundo cliente hizo de otro operador, cambió la ruta, y la aplicación intentó escribir con el valor esperado viejo: `CONFLICT` y **no escribió**. En la misma corrida, 100 de 100 cambios ajenos etiquetados | ✅ |
| P0.9 | Avalancha detectada | bloqueante | 10 de 10 | **Vuelto atrás el 2026-09-10 por una auditoría.** Lo que sí está medido contra la consola: una ráfaga de 16 rutas detectada 10 de 10, y diez `LOADSNAPSHOT` reales detectados 10 de 10 con causa `SNAPSHOT_RECALL`. Ya no depende del simulador. Lo que **no** se cumple del umbral escrito —«más de 10 rutas en menos de 1 s»—: el aviso de un recall informa **1 ruta** cuando cambiaron 45, y el tiempo **nunca se midió**, porque la columna `ms` de esa corrida es una espera fija del propio guion | 🟡 |
| P0.9 | Escrituras propias etiquetadas | bloqueante | 98 % o más | **100 de 100 el 2026-09-10.** Por correlación de mensajes entrantes era imposible —no hay eco—; se cumple porque no hace falta deducir: lo que entra por la principal es ajeno sin excepción, y lo propio se marca al verificarse | ✅ |
| P0.9 | Mecanismo de presencia elegido | bloqueante | uno, verificado | **Elegido y verificado el 2026-09-10.** Primero se midió que la consola **no publica ninguna**: cero líneas difundidas al entrar o salir un cliente, en tres ciclos, y ninguna de las seis claves candidatas se movió. Con eso el criterio dejó de esperar datos y pasó a ser una decisión, que el usuario tomó: **se infiere del tráfico ajeno**. Prueba de dos clientes contra el aparato: el volcado no inventa un operador, una escritura propia `APPLIED` no se ve a sí misma, y una ajena se detecta a los 1467 ms. El requisito de distinguir nuestro testigo se cumple por construcción — escucha y nunca escribe. **El verde es del mecanismo, no del producto: `otroOperador()` no lo llama nadie todavía.** Está medido y expuesto en la API, y ninguna pantalla lo muestra; que la aplicación avise de un segundo operador es una decisión de producto que falta tomar | ✅ |
| P0.8 | Instantáneas manuales intactas | bloqueante | hash idéntico tras 50 ciclos | Sin los 50 ciclos. Lo que sí está medido es que **la aplicación no puede tocarlas**: guarda y borra solo en su show `VSE` y solo nombres que puede fechar, y el borrado quedó ejecutado contra el aparato el 2026-09-10 dejando los shows del usuario intactos | ⬜ |
| P0.8 | Alcance de la recuperación documentado | bloqueante | campo por campo | **Contestado el 2026-09-10: de 45 campos vuelven 44, y el que no es `m.afs.enabled`**, la supresión de realimentación — que le mete filtros de −18 dB al audio por su cuenta. Dos asteriscos que puso una auditoría el mismo día: la **alimentación fantasma vuelve a estar sin medir** (se había medido cruzando INV-007, que no correspondía) y los retardos cubiertos son los de canal, no los de salida. **La clave de 46 quedó identificada el 2026-09-11**: el guion contaba las claves y no las nombraba, y contar no es identificar. La cuenta cierra exacta: **45 = 44 escritas + una que se movió sola, y esa una es `var.currentSnapshot`** — no queda ninguna sin identificar. Acá decía «ninguna se movió sola», que contradice el archivo; lo marcó una auditoría. La hipótesis del par estéreo **se descartó midiendo**: los 24 canales tienen `stereoIndex` en −1 | 🟡 |
| P0.7a | Grabación de 22 pistas sin fallos | bloqueante | 3 de 3 | | ⬜ |
| P0.7a | Existe posicionamiento por protocolo | informativo | sí o no | | ⬜ |

## Decisiones derivadas

Se van anotando a medida que salen, no al cerrar: una decisión escrita el día que se toma es la que se puede rastrear después.

| Decisión | Qué se decidió | De dónde sale |
|---|---|---|
| **Umbral de inestabilidad de la conexión** | **99 ms**, tres veces el intervalo medio de `RTA` medido desde la tablet. Se vigila `RTA` y **nunca** `VU2` | SPK-P0.1, criterio 4 | **Ojo: 99 ms es lo que da la fórmula, no lo que el código usa.** El adaptador vigila con **300 ms** —ocho tramas perdidas del analizador— por decisión explícita: sobre `RTA`, que no se apaga en silencio, 99 ms serían tres tramas y quedaría sensible a cualquier hipo de la wifi. Los dos números son correctos y describen cosas distintas: 99 es el resultado del criterio del charter, 300 el margen que se eligió sobre él.
| **Política de confirmación de escrituras** | **Segunda conexión testigo**, mediana **11,5 ms** sobre ocho muestras. **Decía 27 ms, que ADR-024 retiró el 2026-09-09 por ser una sola muestra con el calentamiento adentro**, y seguía circulando acá. Costo: el testigo recibe el volcado completo y los flujos de medidores. La ADR está en redacción | SPK-ACK-POLICY |
| **Mecanismo de presencia** | **Inferido del tráfico ajeno**, ventana de 30 s elegida y no medida. La consola no publica presencia: está medido. No ve al operador que solo mira, y eso está dicho en el tipo `PresenciaAjena` | SPK-P0.9, criterio 6 |
| **Plan del soundcheck virtual** | Sin elegir | SPK-P0.7a |

## Repaso contra la realidad — 2026-09-10

Se revisó criterio por criterio, buscando la evidencia de cada uno en vez de
confiar en la marca. Salieron cuatro cosas, y **dos no eran las esperadas**.

**Un criterio estaba cumplido desde hacía dos días y sin marcar.** La
especificación del protocolo versión 1 y la matriz de capacidades versión 1
existían desde el 2026-09-08. El acta las daba por pendientes. Nadie mintió:
simplemente el acta no se toca cuando se termina el trabajo, y por eso el
repaso hay que hacerlo mirando los archivos y no la tabla.

**Le estábamos mandando a la consola un comando que nunca vimos funcionar.**
La retención de INV-003 se implementó el 2026-09-09 y manda `DELETESNAPSHOT`.
La prueba que la acompañó corrió con cuatro automáticas, o sea **por debajo del
máximo de veinte**, así que no borró nada: el comando quedó probado contra un
transporte falso y jamás ejecutado contra el aparato. Un borrado que no
funciona falla hacia el lado silencioso —el show crece igual y nada avisa—; uno
que funciona distinto de lo que creemos falla hacia el peor. Se midió el
2026-09-10 y funciona: `SPK-P0.8/evidence/borrado-instantanea-2026-09-10.txt` — **transcripción sin archivar**, no pasó por `medir.mjs`.

**Un archivo de evidencia afirmaba algo que había dejado de ser cierto.**
`SPK-P0.1/evidence/lazo-cerrado-2026-09-09.txt` dice que el módulo «no sabe
borrar». Era verdad el día que se escribió y dejó de serlo al día siguiente. La
evidencia no se reescribe —es el registro de lo que pasó ese día— pero lleva
ahora una nota al pie que dice qué cambió y dónde mirar.

**Y una trampa que conviene tener a la vista.** La avalancha y las
sobrescrituras de P0.9 están probadas contra el simulador y se ven perfectas en
las capturas. El simulador dispara la avalancha porque nosotros le dijimos que
la dispare: esa imagen no puede distinguir entre que el protocolo sea así y que
nuestra hipótesis del protocolo esté equivocada. Siguen en ⬜ a propósito.

> **Este control no cierra todavía, y lo que falta no es medición sino acceso físico.** Los dos criterios que quedan de SPK-P0.1 —los otros dos modos de corte y los diez minutos de tres clientes— y buena parte de SPK-P0.8 y SPK-P0.7a necesitan a alguien delante del aparato. Es el R-18 en concreto: el carril de hardware no se paraleliza.
