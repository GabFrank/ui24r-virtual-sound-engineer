# Simulador de consola Ui24R

Servidor WebSocket que reproduce el comportamiento del protocolo **según lo que
hoy suponemos**, para poder desarrollar y probar la aplicación sin la consola.

## Advertencia que hay que leer antes de usarlo

Este simulador codifica **nuestras hipótesis**. Que la aplicación funcione
contra él demuestra que su lógica es coherente, **no** que el protocolo sea
así. Si nuestra suposición es equivocada, el simulador está equivocado de la
misma manera y los tests pasan igual.

Concretamente, **pasar contra el simulador no cierra ningún spike**:

- Si la consola devuelve o no eco de las escrituras propias, lo dice SPK-P0.1.
- Con qué cadencia llegan los medidores y qué significa su lectura, lo dicen
  SPK-P0.1 y SPK-P0.10b.
- Qué incluye una recuperación de instantánea, lo dice SPK-P0.8.
- El escalado de los parámetros de proceso, lo dicen SPK-P0.2b y P0.2c.

El simulador sirve para otra cosa: llegar al hardware con la lógica de la
aplicación ya depurada, para que el tiempo con la consola se gaste en medir el
protocolo y no en descubrir errores propios.

## Uso

```bash
node src/server.mjs                 # puerto 8765
node src/server.mjs --port 9000 --no-echo   # simula una consola sin eco
```

## Escenarios

El simulador acepta órdenes por su canal de control, para provocar situaciones
que en la consola real son difíciles de reproducir a voluntad:

| Orden | Qué hace |
|---|---|
| `!scenario external-change` | Otro cliente mueve un fader |
| `!scenario snapshot-recall` | Recuperación de instantánea: avalancha de rutas |
| `!scenario fader-drag` | Arrastre de fader: muchos mensajes, una sola ruta |
| `!scenario vu-gap` | Corta los medidores unos segundos: conexión inestable |
| `!scenario clipping` | Un canal empieza a saturar |
| `!scenario drop` | Corta la conexión |
