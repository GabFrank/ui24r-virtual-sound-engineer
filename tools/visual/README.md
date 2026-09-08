# Pruebas visuales contra el simulador

Levanta el simulador de consola y la aplicación, recorre los escenarios y
captura una imagen de cada uno.

```bash
node tools/visual/capture.mjs
```

Las capturas quedan en `tools/visual/out/`.

## Qué prueban y qué no

**Prueban** que la aplicación reacciona como debe a lo que llega por el
protocolo: que muestra la telemetría, que distingue un cambio ajeno de uno
propio, que detecta una avalancha, que pasa a inestable cuando se cortan los
medidores, y que el paro de emergencia bloquea las escrituras.

**No prueban** que el protocolo sea como el simulador supone. Eso lo miden los
spikes con la consola real. Si nuestra hipótesis es equivocada, el simulador
está equivocado igual y estas capturas se ven perfectas de todos modos.
