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
