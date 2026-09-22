# Dónde quedamos — 2026-09-20, segunda sesión

**Para quien retome.** Reemplaza a
[`2026-09-20-donde-quedamos.md`](2026-09-20-donde-quedamos.md) en lo que cambió y
lo deja en pie en el resto. Las listas de tareas **siguen viviendo en**
[`2026-09-17b-donde-quedamos.md`](2026-09-17b-donde-quedamos.md), y sigue valiendo
todo lo que los cierres anteriores dicen del banco, del servicio de audio de la
Mac y de cómo el usuario pide que se trabaje.

**Este documento apunta, no repite.**

## Lo más importante: la pieza 1 está cerrada Y probada contra el aparato

La pantalla por músico existe entera —ver, subir escuchando, y marcar «así está
bien»— con lo que [ADR-034](../adr/ADR-034-poner-el-nivel-de-monitor-y-retocarlo.md)
queda implementada de punta a punta. **Y por primera vez la cadena que escribe en
la consola se corrió contra el aparato del usuario**, no contra el simulador.

## Y lo que lo hizo posible, que es la novedad operativa

**La tablet se conduce por red.** Lo preguntó el usuario —*«¿puedes intentar
conectarte al tablet vía adb?»*— y se puede: depuración inalámbrica, `adb pair`
con el código de seis dígitos, `adb install -r` con `-PvseVersionCode` mayor al
instalado, y el puente `tools/tablet/cdp.mjs` que este repositorio **ya tenía
escrito**. Con eso se le aprietan los botones y se leen las pantallas desde la
máquina.

Importa porque el diario y la tabla de mediciones van a SQLite de Capacitor, o
sea **sólo Android**: en el navegador la cadena de escritura se frena antes de
llegar al cable. Sin la tablet no hay forma de ejercitarla. Detalle y daño en
[`hallazgo-el-diario-es-de-android-y-nadie-lo-sabia.md`](../backlog/hallazgo-el-diario-es-de-android-y-nadie-lo-sabia.md).

**Lo que sigue afuera es lo automático:** los tests y el recorrido visual siguen
sin poder tocar el camino de escritura, así que una regresión ahí no la caza
nadie hasta que alguien corra la tablet a mano.

## Los doce commits, en orden

| | Qué |
|---|---|
| `24da093` | La ficha del proyecto y ADR-034 decían que el asistente sólo sabe bajar. Falso desde el 2026-09-19 |
| `7545994` | **La cuña de un músico se ve.** Y el trabajo previo estaba en el manual archivado: la consola ya tiene una pantalla por músico, `MOREME` |
| `4214f49` | **Adjudiqué una fuga que la medición se negó a adjudicar**, y cinco imprecisiones más. La peor estaba en código |
| `962c731` | La pantalla se mostraba congelada y parecía viva: `volcadoDelEstado()` es un método, no una señal |
| `a7d687b` | **A una cuña le entran 32 caminos y se miraban 24.** Faltaban línea, reproductor y los cuatro retornos de efecto |
| `101c086` | Cancelar una escucha no cancelaba nada y guardaba una fila (hallazgo 10) |
| `9837674` | **La cuña se sube escuchando**, y el último paso clava el techo: los 0,138 dB |
| `441731b` | La pantalla decía que no escribe, y desde la noche anterior escribe |
| `0ef0fa6` | **Marcar «así está bien»**, en la fila y por cuña entera. Cierra la pieza 1 |
| `59a66b0` | La aplicación se enteraba de todos menos de sí misma — lo encontró la prueba de campo |
| `d8acb2f` | El registro de la prueba de campo, y una nota de horas antes que ya mentía |
| *(este)* | El cierre, y lo que se encontró al empezar la pieza 2 |

Árbol limpio, `npm run verificar` en verde, **ningún PR abierto**: nadie lo pidió.

## Lo que la prueba de campo demostró

Contra la consola en `192.168.0.78`, sobre auxiliares con el fader en cero para
que no sonara nada. Las siete filas nuevas están en
[`guia-de-pruebas-manuales.md`](../guia-de-pruebas-manuales.md) §4.

Lo que más vale la pena tener presente:

- **el motor niega el segundo paso sin escucha**, con su mensaje, contra el
  aparato. Es el agujero que costó tres tandas de auditoría;
- **salir del silencio es una sola vez por cuña**: la tercera condición que una
  auditoría agregó el 2026-09-19, en su primera prueba contra hardware;
- **cancelar deja `escucha_de_cuna_cancelada` sin `guardada` detrás**, o sea que
  el hallazgo 10 quedó cerrado de verdad;
- y **el defecto que encontró**: la pantalla no se enteraba de sus propias
  escrituras. Arreglado en el embudo por el que pasa toda escritura, no en cada
  pantalla.

**Ninguna clave de la consola quedó tocada**, comprobado por HTTP clave por clave
después. El camino de vuelta se escribió y se probó **antes** de tocar nada.

## Lo que sigue: la pieza 2, el ecualizador de canal

**No existe nada de ella**: ni decisión, ni asistente, ni servicio, ni pantalla.
Empieza por una decisión del usuario, igual que la 1 empezó con ADR-034, y la
pregunta de fondo es **con qué criterio la aplicación decide mover una banda**.

### Lo que el usuario pidió el 2026-09-20, textual en lo esencial

Los instrumentos que el MVP tiene que cubrir:

> Voces: masculina y femenina, principal y coros. Guitarra acústica: cuerdas de
> nylon y acero, guitarra rítmica, guitarra de solos. Bajo eléctrico. Teclado
> eléctrico. Percusión: djembe grande, mediano, pequeño, de repique y base.
> Bombo/kick, **primero el kick del foot case** —un pedal de madera que simula un
> kick—. Flautas nativo americanas. Maracas.

Y las condiciones de diseño:

> No es algo definitivo ni rígido: primero construir una base, después pulir con
> el usuario. **Los valores no pueden ser fijos sino configurables.** Para el MVP
> **no hay configuración manual en la app**: el asistente lo hace todo, pero el
> usuario puede auxiliar tocando directamente el mixer y **avisando que ése es el
> ecualizador preferido**. Puede haber **más de una configuración por tipo de
> instrumento**. Soundcraft permite crear preajustes personalizados y conviene
> aprovechar esa función.

### Lo que se encontró al empezar, mirando primero lo propio

**Sus preajustes ya están en su consola, con sus nombres**, y el censo muestra
cómo trabaja: reúsa la misma curva de voz en varios cantantes. Todo en
[`hallazgo-los-preajustes-del-usuario-ya-estan-en-la-consola.md`](../backlog/hallazgo-los-preajustes-del-usuario-ya-estan-en-la-consola.md),
incluido qué falta averiguar y qué es sospecha y no medición.

**Y una corrección que hay que tener presente antes de prometer nada:** se le
dijo al usuario que la pieza 2 no necesita medir nada, y **es falso**. Del
ecualizador de canal están medidas **las cuatro ganancias** pero **la frecuencia
y el Q de la banda 1 solamente**: la aplicación no sabe en qué frecuencia están
paradas las otras tres. Probablemente compartan la ley, como pasó con las
ganancias —que dieron la misma recta las cuatro— pero probable no es medido.
Anotado en [`capability-matrix.md`](../capability-matrix.md).

## El estado del equipo del usuario

**Esta sesión sí tocó su consola**, y es la primera del proyecto que lo hace
desde la aplicación: cuatro envíos a auxiliar, todos sobre buses con el fader en
cero, anotados antes y restaurados con comprobación por HTTP.

**En la tablet** quedó instalada la compilación `0.3.2-campo.2`. Se quitaron el
monitor de prueba y las dos asignaciones de canal que la prueba agregó; quedó
sólo lo suyo. **No se cerró su sesión** de «Sala de ensayo», que es irreversible.

Del volcado de su consola, para tener presente: el **supresor está encendido** en
los auxiliares 1 y 2 y en el general, con las doce ranuras vacías; **ningún
auxiliar está convertido en matriz**; y el **AUX 2 tiene dos retornos de efecto
abiertos**, uno de ellos el camino que más manda a esa cuña.

Sigue valiendo todo lo del cierre anterior: el servicio de audio de la Mac que se
traba, las cuatro claves del supresor antes de meter tonos, y que **nunca se
borran los snapshots**.

## Cómo arrancar la próxima sesión

El prompt está en
[`2026-09-20b-prompt-para-retomar.md`](2026-09-20b-prompt-para-retomar.md),
**apuntado a la investigación de la pieza 2**, que es lo único que sigue. Va
también escrito en el chat.
