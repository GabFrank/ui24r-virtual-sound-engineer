# Acta de control G-A

**Estado:** ⬜ Pendiente · **9 de 13 criterios contestados** · repasado contra la realidad el 2026-09-10

> **Qué cuenta como «contestado»:** que la celda *Medido* tenga un resultado, aunque sea parcial o negativo. Un criterio que dice «un modo de tres» está contestado y no cumplido; uno que dice «sin medir» o «solo contra el simulador» no está contestado. Con esa definición son **9**: los **seis en ✅** más reconexión —un modo de tres—, el subconjunto de P0.2a —10 de 16— e instantáneas manuales —sin los 50 ciclos, pero con lo que sí está medido—. **La avalancha no cuenta**: está probada solo contra el simulador, que es la trampa que este mismo repaso vino a marcar. Se aclara porque la palabra admite 5, 8 o 9 según cómo se lea, y el commit que escribió este encabezado dijo 6 mientras la línea decía 7.
**Responsable:** desarrollador principal

## Qué desbloquea

El adaptador de la consola, la máquina de estados de conexión, y con ellos el primer entregable completo.

## Criterios

| Spike | Criterio | Tipo | Umbral | Medido | Resultado |
|---|---|---|---|---|---|
| P0.1 | Reconexión automática por cada modo de corte | bloqueante | 20 de 20 en 10 s o menos | **Un modo de tres.** Wifi cortada: 20 de 20 desde la tablet, mediana 3,7 s, máximo 5,0. Faltan router apagado y cambio de IP, que necesitan a alguien físicamente ahí | ⬜ |
| P0.1 | Cadencia de medidores registrada y umbral de inestabilidad fijado | bloqueante | tres estadísticos | `RTA` desde la tablet: media 33 ms, p95 40 ms, mediana 33 ms, idéntico en silencio y con señal → **umbral de inestabilidad 99 ms**. Se mide sobre `RTA` y nunca sobre `VU2`, que la consola calla en silencio | ✅ |
| P0.1 | La consola devuelve eco de las escrituras propias | informativo | sí o no | **No.** Seis segundos escuchando, cero líneas para la ruta escrita, en dos parámetros distintos. La escritura sí se aplica y sí se difunde a los demás clientes | ✅ |
| ACK-POLICY | Tabla de confirmación por parámetro completa | bloqueante | 100 % de las filas | **Cerrado el 2026-09-10, y medido en vez de redactado.** 18 rutas barridas contra la consola: **18 de 18 difundidas**, mediana 17 ms, todas restauradas. Las familias no barridas quedan marcadas *Inferido*, diciendo que lo son. Con esto queda escrito también el texto normativo de INV-011 | ✅ |
| P0.2a | Subconjunto del primer entregable confirmado en hardware | bloqueante | 100 % de la lista | **10 de los 16 de la lista al 2026-09-10.** Se sumaron instantáneas y shows —`CREATESHOW`, `SAVESNAPSHOT`, `SNAPSHOTLIST`, `DELETESNAPSHOT`, los cuatro ejecutados— y la información del dispositivo. Faltan fantasma en lectura, silencio de auxiliar, los dos puntos de derivación, matriz y retardos | ⬜ |
| P0.2a | Especificación del protocolo versión 1 generada | bloqueante | sí | **Sí, y estaba desde el 2026-09-08 sin marcar acá.** `docs/protocol-spec.md`, 554 líneas, versión 1; `docs/capability-matrix.md`, 77 filas con estado, versión 1 | ✅ |
| P0.9 | Sobrescrituras de cambios ajenos | bloqueante | 0 | **0, medido contra la consola el 2026-09-10.** Un segundo cliente hizo de otro operador, cambió la ruta, y la aplicación intentó escribir con el valor esperado viejo: `CONFLICT` y **no escribió**. En la misma corrida, 100 de 100 cambios ajenos etiquetados | ✅ |
| P0.9 | Avalancha detectada | bloqueante | 10 de 10 | **Solo contra el simulador**, y conviene no confundirse: la captura `06-cambio-masivo.png` la muestra funcionando, pero el simulador dispara la avalancha porque nosotros le dijimos que la dispare. Lo que **sí** está medido contra la consola es lo contrario —que un arrastre de un fader **no** dispara avalancha, porque es una ruta y no muchas— y que se agrupa en un solo aviso | ⬜ |
| P0.9 | Escrituras propias etiquetadas | bloqueante | 98 % o más | **100 de 100 el 2026-09-10.** Por correlación de mensajes entrantes era imposible —no hay eco—; se cumple porque no hace falta deducir: lo que entra por la principal es ajeno sin excepción, y lo propio se marca al verificarse | ✅ |
| P0.9 | Mecanismo de presencia elegido | bloqueante | uno, verificado | Sin elegir, y ahora tiene un requisito más: la política de confirmación usa una **segunda conexión propia**, así que el mecanismo de presencia tiene que distinguir nuestro testigo de un segundo operador | ⬜ |
| P0.8 | Instantáneas manuales intactas | bloqueante | hash idéntico tras 50 ciclos | Sin los 50 ciclos. Lo que sí está medido es que **la aplicación no puede tocarlas**: guarda y borra solo en su show `VSE` y solo nombres que puede fechar, y el borrado quedó ejecutado contra el aparato el 2026-09-10 dejando los shows del usuario intactos | ⬜ |
| P0.8 | Alcance de la recuperación documentado | bloqueante | campo por campo | | ⬜ |
| P0.7a | Grabación de 22 pistas sin fallos | bloqueante | 3 de 3 | | ⬜ |
| P0.7a | Existe posicionamiento por protocolo | informativo | sí o no | | ⬜ |

## Decisiones derivadas

Se van anotando a medida que salen, no al cerrar: una decisión escrita el día que se toma es la que se puede rastrear después.

| Decisión | Qué se decidió | De dónde sale |
|---|---|---|
| **Umbral de inestabilidad de la conexión** | **99 ms**, tres veces el intervalo medio de `RTA` medido desde la tablet. Se vigila `RTA` y **nunca** `VU2` | SPK-P0.1, criterio 4 | **Ojo: 99 ms es lo que da la fórmula, no lo que el código usa.** El adaptador vigila con **300 ms** —ocho tramas perdidas del analizador— por decisión explícita: sobre `RTA`, que no se apaga en silencio, 99 ms serían tres tramas y quedaría sensible a cualquier hipo de la wifi. Los dos números son correctos y describen cosas distintas: 99 es el resultado del criterio del charter, 300 el margen que se eligió sobre él.
| **Política de confirmación de escrituras** | **Segunda conexión testigo**, medida en 27 ms. Costo: el testigo recibe el volcado completo y los flujos de medidores. La ADR está en redacción | SPK-ACK-POLICY |
| **Mecanismo de presencia** | Sin elegir | SPK-P0.9, criterio 6 |
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
2026-09-10 y funciona: `SPK-P0.8/evidence/borrado-instantanea-2026-09-10.txt`.

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
