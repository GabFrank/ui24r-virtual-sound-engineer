# Operar el equipo real

Leer sólo cuando la tarea necesite consola, audio, banco o tablet. Los datos de
esta máquina se registraron el 2026-09-21; comprobarlos antes de usarlos.
Las pruebas de software locales no requieren conectar el equipo.

## Preparar y restaurar

- La consola estaba en `192.168.0.78`. Leer y guardar el estado completo por HTTP
  antes de escribir; `/raw` es un flujo que puede terminar por timeout de curl
  (código 28). Tolerar únicamente ese timeout esperado y comprobar que el
  archivo contiene un volcado completo. Leerlo entero, no sólo unas líneas.
- Registrar cada valor previo. Restaurar con `try/finally` y comprobar por HTTP
  el valor restaurado. Informar qué se tocó y cualquier restauración pendiente.
- Usar una salida que no suene para comprobar escrituras; si la tarea necesita
  sonido, acordar la prueba con el usuario y revisar la ruta audible completa.
  No interpretar «fader en cero» como silencio: **0 dB es nivel nominal**.
- Antes de tonos sostenidos, leer las cuatro claves `*.afs.enabled`. En el
  último estado estaban activos los auxiliares 1 y 2 y el general. El supresor
  aprende del tono y puede plantar filtros. No asumir que sigue igual.
- **Nunca borrar snapshots.** No usar tuberías que corten un proceso de medición
  (`head`, por ejemplo): SIGPIPE puede impedir restaurar.
- Archivar la misma corrida que se observa con `tools/spikes/medir.mjs`, con
  argumentos y parámetros. No repetir para fabricar el archivo de evidencia.
  No commitear volcados privados, credenciales ni audio del usuario.

## Banco

La Scarlett estaba en el canal 10, el bombo con preajuste `Kick Drum`, sin envíos
a auxiliares ni efectos. El instrumento de EQ puentea compresor y puerta; al
quitar el compresor perdía también su ganancia de salida. Consultar el
[diagnóstico medido](../backlog/el-banco-no-estaba-roto-el-instrumento-se-comia-28-db.md)
antes de variar estímulos o culpar al banco. La compensación depende del estado
medido: no copiar el pico de una corrida antigua sin comprobar la cadena.

`tools/spikes/p0-2b-eq/donde-se-pierden-los-db.ts` permite distinguir si sale poco
o vuelve poco mirando las cuatro entradas. Confirmar primero que la fuente
suena. Medir el instrumento, no una cadena que agrega saturación o ganancia.

## Tablet y acceso remoto

El usuario entra a la Mac por SSH/AnyDesk; no tiene acceso físico. Escribir en el
chat lo que deba copiar. Usar Node 22; en esa Mac estaba instalado en
`$HOME/.nvm/versions/node/v22.23.2/bin` (no asumir esa ruta en otra máquina).

Las escrituras de la app se ejercitan en Android con su diario persistente.
Pedir que encienda la tablet con depuración inalámbrica cuando haga falta;
`adb pair` si se perdió la vinculación, luego `adb connect`, instalación con
`adb install -r` y código de versión mayor que el instalado. Control remoto:
`tools/tablet/cdp.mjs`. No registrar puertos de vinculación ni códigos como
configuración permanente. Para pruebas locales de integración, usar dobles de
transporte y SQLite de prueba; eso no autoriza escrituras reales desde navegador.
