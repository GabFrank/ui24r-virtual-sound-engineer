# Capturas contra el simulador

Generadas por `node tools/visual/capture.mjs`. Se regeneran en cada cambio de
interfaz, no se editan a mano.

| Captura | Qué muestra |
|---|---|
| `01-sin-conexion.png` | Pantalla inicial, antes de conectar |
| `02-telemetria.png` | Telemetría de doce canales con medidores en vivo |
| `03-saturacion.png` | Un canal saturando: medidor en rojo, margen en cero, contador de clips |
| `04-cambio-externo.png` | Un cambio hecho desde otro dispositivo, detectado como ajeno |
| `05-arrastre-fader.png` | Arrastre de fader: decenas de mensajes sobre una sola ruta, sin alerta |
| `06-cambio-masivo.png` | Recuperación de instantánea: avalancha detectada, estado invalidado |
| `07-conexion-inestable.png` | Medidores cortados: la conexión pasa a inestable |
| `08-paro-emergencia.png` | Paro de emergencia activo, escrituras bloqueadas |
| `09-rearmado.png` | Rearmado tras el paro |
| `10-canales-sin-asignar.png` | Canales de la consola, todavía sin asignar |
| `11-canales-propuestos.png` | Tipos propuestos desde el nombre que ya tiene cada canal |
| `12-ganancia-sin-medir.png` | Asistente de ganancia antes de medir |
| `13-cuenta-regresiva.png` | Cuenta regresiva antes de capturar |
| `14-capturando.png` | Capturando la ventana del canal |
| `15-recomendacion.png` | Recomendación con su porqué, su evidencia y sus límites |
| `16-actualizacion-inicial.png` | Pestaña de actualización antes de consultar |
| `17-actualizacion-bloqueada.png` | INV-034: conectado a la consola, no se actualiza |
| `18-actualizacion-al-dia.png` | No hay ninguna versión más nueva publicada |
| `19-actualizacion-sin-permiso.png` | Versión disponible, falta el ajuste del sistema |
| `20-actualizacion-disponible.png` | Versión disponible, con sus novedades |
| `21-prelanzamiento-descartado.png` | Una etiqueta `rc` no se ofrece como actualización |
| `tel-01-consola.png` | Telemetría en teléfono: tarjetas en vez de tabla |
| `tel-02-canales.png` | Asignación de canales en teléfono |
| `tel-03-ganancia.png` | Asistente de ganancia en teléfono |
| `ds-telefono.png` | Sistema de diseño completo a 390 px |
| `ds-tablet-vertical.png` | Sistema de diseño completo a 834 px |
| `ds-tablet.png` | Sistema de diseño completo a 1280 px |
| `flujo-tablet-*.png` | Los 21 pasos del camino de usuario en tablet |
| `flujo-telefono-*.png` | Los mismos 21 pasos en teléfono |

De la 16 a la 21 el catálogo de GitHub se responde desde la propia prueba en
vez de salir a la red, igual que el simulador responde el protocolo de la
consola. Vale la misma advertencia: prueban la aplicación, no que GitHub
conteste lo que suponemos.

## Lo que estas capturas no demuestran

Que el protocolo sea como el simulador supone. El simulador reproduce
**nuestras hipótesis**: si son equivocadas, está equivocado igual y las
capturas se ven perfectas de todos modos.

Lo que sí demostraron: dos errores reales de la aplicación que ningún test
unitario había encontrado, porque ambos estaban en la costura entre piezas que
por separado funcionaban bien.

1. **El volcado inicial se confundía con una avalancha.** Al conectar, la
   consola manda su estado entero como decenas de mensajes. El detector lo leía
   como "alguien recuperó una instantánea" y abría una alerta en cada conexión.
2. **La regla de conexión inestable estaba implementada dos veces.** El
   adaptador la calculaba bien; la interfaz tenía una segunda copia que estaba
   mal, así que seguía diciendo "conectado" mientras no llegaban medidores.

Los dos están corregidos y cubiertos por tests.

En la tanda siguiente encontraron dos más:

3. **El asistente de ganancia tenía la resta invertida.** Con el pico a −4 dBFS,
   o sea un canal casi saturando, proponía **subir** la ganancia. Lo detectó el
   test que pide bajar cuando el pico está alto, antes de llegar a ninguna
   consola.
4. **Doce botones rellenos competían con los números**, que son lo que hay que
   leer de un vistazo. Se pasaron a acción secundaria.

Las capturas `flujo-*` las genera `tools/visual/flujo.mjs`, que además **falla
si algún paso se atasca o si la consola del navegador registra un error**. No
es solo documentación: es la prueba de que se puede ir de cero a una sesión
cerrada sin quedarse trabado. Ver [docs/flujo-de-usuario.md](../flujo-de-usuario.md).

Las tres capturas `ds-*` contestan otra pregunta que el resto: no si la
aplicación entiende el protocolo, sino si se puede leer y tocar en el ancho de
pantalla que haya. Ver [docs/design-system.md](../design-system.md).

Y en la tanda de la actualización, uno más:

5. **INV-034 estaba escrita, probada y muerta.** La invariante prohíbe
   actualizar durante una sesión, pero en MVP0 no hay forma de abrir una
   sesión: el campo era siempre falso y la pantalla ofrecía actualizar en
   pleno ensayo, con la consola conectada y los medidores en movimiento. Se ve
   en la captura que se hizo para mostrar lo contrario. Ahora la conexión con
   la consola cuenta como suplente declarado hasta que exista el modelo de
   sesión.

Y en la del sistema de diseño, dos más:

6. **La compilación de desarrollo no compilaba**, y con ella `ng serve`
   tampoco. Los mapas de código de scripts, junto con la importación de los
   paquetes por sus fuentes en TypeScript, hacen que el compilador de Angular
   pierda `src/main.ts`. Se apagaron los mapas de scripts, quedaron los de
   estilos, y está explicado en `apps/mobile/README.md`. No se había notado
   porque todo el trabajo hasta ahora se compiló en modo publicación.
7. **El paro de emergencia se montaba sobre el último botón en teléfono.**
   La captura del sistema de diseño lo muestra tapando el «Siguiente» de un
   asistente. De todos los controles de esta aplicación, el paro es el que
   menos puede taparse ni tapar; ahora la página reserva el sitio.

Y el recorrido del camino de usuario, apenas se escribió, encontró tres más:

8. **En teléfono, el botón «Guardar» era inalcanzable.** El paro de emergencia
   lo tapaba y el recorrido se quedó atascado ahí, reintentando el clic. La
   franja inferior ocupada pasó a ser una ficha del sistema de diseño, en vez
   de un margen estimado a ojo en cada pantalla.
9. **Todos los avisos salían en ámbar, incluidos los de éxito.** Uno de los
   tonos se llama «aviso» y la clase base del componente también, así que el
   selector `.aviso.aviso` coincidía con cualquier mensaje. La clase base pasó
   a llamarse `.mensaje`.
10. **El nombre de la aplicación se recortaba a «Virtual Sou…» en teléfono.**
    Un nombre a medias es peor que una sigla entera; en pantallas angostas dice
    «VSE».
