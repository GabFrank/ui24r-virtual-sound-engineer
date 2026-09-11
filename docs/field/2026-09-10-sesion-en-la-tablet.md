# Informe de campo — la sesión entera en la tablet, 2026-09-10

**Aparato:** Blackview LINK 8, Android 15 (API 35) · **Consola:** Ui24R `192.168.0.78`,
firmware `3.4.8318-ui24` · **Build:** `0.3.1-pr55`, compilado de `test/capacidades-que-faltan`
· **Sala:** B2 en el puerto 9 con fantasma, Rokit 8 como general, el usuario presente

## Qué se probó y qué pasó

Es la primera vez que la aplicación recorre una sesión sobre el aparato de verdad y no
contra el simulador. Se instaló el build del día —firma comprobada contra
`8db45d3f…5325` **antes** de instalar, como manda el procedimiento— y se recorrieron las
pantallas con la consola en vivo.

| Paso | Resultado |
|---|---|
| Arranque | **Recupera la sesión anterior**: banda, canales y reloj sobrevivieron a reinstalar la aplicación encima |
| Conexión | Automática. En el registro: `conexion_cambio`, `sesion_recuperada` y **`volcado_completo`** |
| Canales | Muestra **los nombres reales de la consola** — `PRUEBA`, `BAJO OKU`, `GRT BRUNO`, `GTR BELTRAN`, `VOZ MARCOS` |
| Medidores | En vivo, con picos y ganancias por canal en decibeles |
| Espectro | **Pide permiso antes de tomar el analizador**, lo toma, dibuja las 122 bandas, y **lo devuelve al salir** |

**La devolución del analizador quedó comprobada por `GET /raw`**, que no es la conexión
que escribió: `var.rta` pasó de vacío a `m` al entrar y volvió a vacío al salir. ADR-025
funciona contra el aparato y no solo contra el simulador.

## El hallazgo que importa: el aviso de realimentación no se apaga

Con la sala en silencio y nada enchufado sonando, la pantalla marcó **105 Hz sostenida**,
y el contador siguió subiendo: 5,4 s, después 63,2 s, sin reiniciarse nunca.

La primera hipótesis fue ruido eléctrico. El usuario avisó que estaba hablando en la
sala, y 105 Hz cae justo en el fundamental de una voz masculina — pero **el canal del
condensador está silenciado**. Si su voz llegaba igual al analizador del general, el
hallazgo habría sido mucho peor: que el detector ve canales que el operador cree
apagados.

Se midió en vez de discutirse. Con el micrófono oyendo de verdad —medidor de −74 a
−39,7 dB mientras hablaba— se correlacionó su medidor contra **las 122 bandas**:

- la banda de 105 Hz dio **0,004**;
- **la que mejor lo siguió, de las 122, fue la 58 (~595 Hz) con 0,251**, que es ruido.

**Ninguna banda sigue al micrófono.** Dos cosas quedan de ahí:

1. **El silencio de un canal sí lo saca del analizador del general.** Si no lo sacara,
   la voz habría aparecido en alguna banda. No aparece en ninguna.
2. **El 105 Hz estaba ahí antes de que nadie hablara**, y es lo que enciende el aviso.

### Por qué no se apaga

La banda de 105 Hz tiene **media 12,7 dB** y oscila entre **3,8 y 18,8**. El piso útil
del detector —`PISO_UTIL_DB`, por debajo del cual ni mira— es **12 dB**.

Esa banda vive **justo encima del umbral**. Cada vez que asoma, la regla de «no cayó como
debía» la cuenta de nuevo, el contador sigue corriendo y el cartel no se apaga más.

Los tres umbrales estaban marcados en la matriz de capacidades como *«elegidos, no
medidos»* y *«sin validar contra una realimentación real»*. Es la primera vez que el
detector se encuentra con una sala, y **la sala le ganó**: un aviso que nunca se apaga es
un aviso que el operador deja de leer, y es el aviso que tiene que salvarle el show.

Lo que **no** se puede concluir todavía es cuál es el arreglo. Subir el piso a ciegas
apagaría también realimentaciones reales de nivel bajo, que son las que conviene cazar
temprano. Hace falta medir una realimentación de verdad para saber dónde vive, y eso
necesita parlantes y a alguien en la sala.

## Un detalle de interfaz

En «Canales», el desplegable de integrante muestra **«Sin integrant»**, cortado. No rompe
nada y le dice al usuario que nadie miró — que es justo lo que la aplicación no puede
permitirse cuando después le pide que confíe en números que él no puede comprobar.

## Lo que este informe NO dice

Que la tablet esté certificada. SPK-P0.3 pide carga como anfitrión USB, captura sin
procesar, cortes en cuatro horas y estabilidad térmica, y **ninguna de las cuatro se
midió acá**. Una sesión que sale bien no certifica un aparato para un show de cuatro
horas.

## Evidencia

- `../spikes/SPK-P0.5/evidence/voz-muteada-en-el-general-2026-09-10d.txt` — el barrido de las 122 bandas contra el medidor del micrófono
- Capturas de pantalla de la sesión, en el directorio de trabajo de la sesión

### Y el instrumento se equivocó tres veces antes de acertar

Vale anotarlo porque es el patrón del día. `bandaDeFrecuencia(105)` devuelve **27,98** y
usarlo como índice de un arreglo da `undefined`: la primera corrida juntó **cero**
muestras útiles. Lo salvó que el guion exigía diez muestras para hablar, así que dijo «no
alcanza» en vez de inventar una correlación de ruido. La segunda descartaba −∞, que es
justo la mitad callada de la prueba. Y la tercera volvía a multiplicar por
`RTA_DB_POR_BYTE` sobre una función que **ya devuelve decibeles**: con eso la banda
parecía estar en 4,8 dB, por debajo del piso de 12, y la conclusión habría sido «el
detector dispara por debajo de su propio piso» — un error que no existe.

Las cuatro corridas quedan archivadas, cada una con el error que la invalidó:

- `../spikes/SPK-P0.5/evidence/voz-muteada-en-el-general-2026-09-10.txt` — índice decimal: **cero** muestras útiles
- `../spikes/SPK-P0.5/evidence/voz-muteada-en-el-general-2026-09-10b.txt` — descartaba el silencio, que es media prueba
- `../spikes/SPK-P0.5/evidence/voz-muteada-en-el-general-2026-09-10c.txt` — doble conversión a decibeles: la banda parecía estar bajo el piso
- `../spikes/SPK-P0.5/evidence/voz-muteada-en-el-general-2026-09-10d.txt` — **la buena**, con el barrido de las 122 bandas
