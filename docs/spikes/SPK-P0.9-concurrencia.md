# SPK-P0.9 — Concurrencia y presencia

**Estado:** Parcial — **criterios 1 y 2 cerrados contra la consola el 2026-09-10**; el 5 quedó falsado y el 3 también, cada uno por su motivo; el 6 tiene un requisito nuevo · **Timebox:** 3 días · **Control:** G-A
**Depende de:** SPK-P0.1 · **Bloquea a:** S-02.5b
**Montaje:** Ui24R, router, laptop con Node, navegador oficial abierto en otro equipo, teléfono con la aplicación oficial.

## Pregunta que responde

¿Se puede detectar de forma fiable que otro cliente cambió un parámetro, sin sobrescribir su cambio, y cómo se detecta que hay otra instancia de esta aplicación conectada?

## Pasos

1. Implementar un prototipo del almacén de estado confirmado alimentado solo por mensajes entrantes, con correlación por ventana temporal.
2. Ejecutar cien escrituras propias mientras un operador hace cien cambios desde el navegador oficial.
3. Recuperar una instantánea desde el navegador durante una escritura.
4. Arrastrar un fader en el navegador y observar la ráfaga.
5. Probar los dos mecanismos candidatos de presencia: el mensaje de sincronización con identificador propio, y una instantánea con nombre reservado renovada cada sesenta segundos.

## Criterios

| # | Criterio | Tipo | Umbral | Medido | Resultado |
|---|---|---|---|---|---|
| 1 | Cambios externos etiquetados correctamente | bloqueante | 100 de 100 | **100 de 100, contra la consola el 2026-09-10.** Un segundo cliente hizo de otro operador y escribió 100 veces espaciado 120 ms; la aplicación etiquetó las 100 como ajenas, el último valor coincide, y no disparó ninguna avalancha por error. `evidence/concurrencia-2026-09-10.txt` | ✅ |
| 2 | Sobrescrituras de cambios ajenos | bloqueante | 0 | **0, contra la consola el 2026-09-10.** El otro operador cambió la ruta y la aplicación intentó escribir con el valor esperado viejo: devolvió `CONFLICT` con «se esperaba 0.256 y hay 0.3, cambiado desde otro cliente» y **no escribió**. La ruta quedó con el valor ajeno | ✅ |
| 3 | Escrituras propias etiquetadas como propias | bloqueante | 98 % o más | **Imposible por correlación de mensajes entrantes, y está medido.** La consola no le devuelve la escritura a quien la hizo, así que no hay nada que correlacionar: el 2026-09-09, con tres clientes conectados, **el que escribe ve 0 líneas de su propia escritura mientras los otros dos ven 1 cada uno**. El criterio se cumple por otra vía o no se cumple | ⬜ |
| 4 | Recuperación de instantánea detectada como avalancha | bloqueante | 10 de 10, con más de 10 rutas en menos de 1 s | | ⬜ |
| 5 | Arrastre de fader agrupado como un único cambio externo | bloqueante | sí | **No, y es imposible por construcción.** `causaProbable()` clasifica `FADER_DRAG` con `sufijos.size === 1 && rutas.size > 1`: pide **varias rutas distintas**. Un arrastre de un fader es **una sola ruta** escrita muchas veces, así que nunca entra por ahí. La aplicación recibe 19 o 20 avisos separados. Lo que ese código sí detecta —varios canales moviéndose juntos— está bien detectado y no es lo que dice la etiqueta | ⬜ |
| 6 | Mecanismo de presencia elegido y verificado | bloqueante | uno de los dos, con prueba de dos clientes | Sin elegir, y ahora con un requisito más: tiene que distinguir **nuestra propia conexión testigo** de un segundo operador. Ver R-27 | ⬜ |

## Lo que ya se midió, y a qué obliga — 2026-09-09

**Tres clientes simultáneos, con uno escribiendo.** Los tres recibieron **6 087 claves** y la **misma huella exacta**. La difusión llega **una sola vez a cada uno menos al origen**: 0 líneas para el que escribe, 1 para cada uno de los otros dos. La prueba duró minutos, no los diez que pide el criterio 5 de SPK-P0.1, así que allá sigue abierta; para este spike lo que importa es otra cosa.

**El criterio 3 no se puede cumplir como está planteado.** El paso 1 de este spike dice «almacén de estado confirmado alimentado solo por mensajes entrantes, con correlación por ventana temporal», y el criterio 3 pide que el 98 % de las escrituras propias se etiqueten como propias. Con esta consola, **el mensaje con el que se correlacionaría no llega jamás**. La ventana de 300 ms del `ConfirmedStateStore` espera algo que no existe, y ADR-005 ya lo tenía anotado como cabo suelto.

Quedan dos salidas, y elegir es parte de cerrar este spike:

1. **Etiquetar por lo que la aplicación ya sabe**: si acaba de enviar esa ruta con ese valor, es propia, sin esperar confirmación de nadie. Es local y no depende del protocolo.
2. **Etiquetar contra el testigo** de SPK-ACK-POLICY: la línea que llega por la conexión testigo y coincide con lo que la principal acaba de enviar es propia; cualquier otra es ajena. Cuesta lo que cuesta el testigo, que ya se paga igual para confirmar escrituras.

La segunda es la que además contesta el criterio 2 —no sobrescribir cambios ajenos— con un dato y no con una suposición, porque distingue propio de ajeno **en el mismo flujo** en vez de en dos relojes distintos.

**Y el mecanismo de presencia hereda un problema.** La aplicación pasa a tener **dos sesiones abiertas** contra la consola, la principal y el testigo. Cualquier mecanismo de presencia que cuente clientes o mire sesiones va a ver dos donde hay un operador. Si no las distingue, la aplicación se avisa a sí misma de un segundo operador que no existe y ensucia justamente la señal que protege contra pisar cambios ajenos. Está en el registro como R-27.

## Evidencia a entregar

- `evidence/concurrency-run.jsonl`, `evidence/bulk-detection.log`, `evidence/presence.md`.
- **Falta archivar** la corrida de tres clientes del 2026-09-09, con las claves, la huella compartida y el reparto 0/1/1 de líneas vistas.

## Acción ante fallo

Si no se puede detectar la ráfaga de forma fiable, la aplicación asistida queda condicionada: cada escritura exige confirmación humana del valor actual leído en pantalla, y el modo automático controlado no se habilita.
