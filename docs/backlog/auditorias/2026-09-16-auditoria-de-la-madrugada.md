# Auditoría de la madrugada del 2026-09-16

**La pidió el usuario**, al volver: *«lanza una auditoria grande sobre lo que fue
trabajado a la madrugada hasta ahora»*. Cubre los 47 commits de la rama
`claude/soundcraft-ui24-assistant-kh8ezj`, del 2026-09-15 a la tarde al
2026-09-16 al mediodía, y **todo lo que la madrugada le hizo a la consola del
usuario**.

Se hizo con el aparato a mano, así que buena parte no es lectura de documentos
sino medición.

---

## 1. La consola: intacta fuera del canal 10

**Es el resultado que más importa, y se pudo comprobar de verdad** porque quedó
archivado un volcado completo del estado **anterior** a la primera medición, del
2026-09-15 a las 21:50. Comparado clave por clave contra el estado de hoy al
mediodía:

| | |
|---|---|
| Líneas con forma `clave^valor`, antes y ahora | **6665 y 6665** |
| Claves que desaparecieron | **0** |
| Claves nuevas | **0** |
| Valores distintos | **17** |
| De esos 17, fuera del canal 10 | **0** |

Los 17 son el compresor y el ecualizador del **canal 10**, que el usuario
autorizó explícitamente a resetear —*«lo ideal es resetear el canal, te doy
permiso de hacerlo, pues toque compresor tambien»*—.

Y lo que **no** cambió, nombrado porque es lo que estaba en riesgo:

- **La instantánea «alma caninde» sigue ahí.** Es la única prohibición absoluta
  del repositorio.
- **El supresor de realimentación quedó como estaba**: encendido, en LIVE, con
  **12 filtros** de los cuales 6 fijos. Los mismos doce que tenía al empezar, en
  las cuatro corridas del ítem 108, las dos del 109, las cuatro del 110 y las dos
  del 112.
- **El fader del general no se tocó nunca.** Cuando la medición del general
  necesitó más nivel, se subió la fuente —que es software— y no ese fader.

**Ninguna lista de excepciones de seguridad creció.** Los tres trinquetes
—`supresor-con-sonido`, `escribir-sin-leer`, `restauracion-garantizada`— tienen
exactamente los mismos nombres que tenían. Y todo guion de la rama que escribe en
la consola pasa por `conRestauracion`: se comprobó archivo por archivo, no de
memoria.

---

## 2. Lo que la auditoría encontró mal

### 2.1 La matriz de capacidades venía atrasada respecto del código

**El hallazgo más serio, y no es de la madrugada: la madrugada lo destapó.**

El primer principio del repositorio dice que ninguna función se implementa sobre
un parámetro que no esté probado en `docs/capability-matrix.md`. Ese documento es
la puerta. De las **ocho** rutas que `raw-map.ts` declara `PROBADO`, **cuatro
estaban mal ahí**:

| Ruta | Qué decía la matriz | Desde cuándo estaba medida |
|---|---|---|
| `i.N.eq.hpf.freq` | «desconocida / INFERIDO» | ítem 103 |
| `i.N.eq.b1.{gain,q,freq}` | «desconocida / INFERIDO» | ítems 101 y 108 |
| `i.N.eq.lpf.freq` | **no tenía fila** | ítem 103 |
| `i.N.aux.M.value` | **no tenía fila** | ítem 104 |

Y la fila del ecualizador de salida decía, **en la misma línea**, «MEDIDO en las
dos superficies» y «la unidad es INFERIDO».

**Por qué no lo vio ningún validador**, que es la parte instructiva: los que hay
comparan **cuentas**. `validate-numeros` comprueba que el README diga cuántas
rutas medidas hay, y una cuenta igual con una lista distinta pasa en verde. Era
exactamente lo que pasaba.

**Resuelto** en `86f565b` con `tools/docs/validate-rutas-medidas.mjs`, que exige
que la matriz nombre una por una las rutas que el código declara. Probado contra
su caso motivador en los tres sentidos: falta una fila, sobra una fila, y
desaparece la sección.

### 2.2 Dos afirmaciones falsas sobre los proyectos de terceros

El usuario había dejado una instrucción permanente sobre esto: *«necesito que me
digas explícitamente que lo hiciste porque veo que de alguna forma este paso
siempre se "les olvida"»*. **Tenía razón.**

Dos frases, repetidas en cuatro documentos:

- **«`ndikanov/ui24` y `NaturalDevCR/MyUiPro` no tocan parámetros de mezcla».**
  Falsa para MyUiPro: escribe `SETD^i.N.gain` y `SETD^i.N.hiz`.
- **«`Dennion/ioBroker.soundcraft`: igual, sólo estado».** Falsa: escribe fader,
  panorama, silencio y la ganancia del previo.

Las conclusiones que esos documentos sacaban **siguen en pie** —ninguno de los
cuatro toca el ecualizador, el compresor, la puerta ni el supresor—. Lo que
estaba mal es el alcance: un `grep` del parámetro del día, ampliado en silencio a
una afirmación sobre todo el proyecto ajeno. **Es la tercera vez** que este
repositorio corrige esa forma exacta: ya pasó con `afs.*` y con `eq.peak`.

**Y lo que se perdió por no mirar tiene valor.** MyUiPro publica una ley de la
ganancia de entrada, `63·V − 6`, y `fmalcher` publica **la misma recta** por otro
camino. El cliente del fabricante **no** usa una recta: usa una tabla de 64
entradas, escalonada, que se aparta de esa recta hasta casi un decibel en el
medio. Y la medición propia del 2026-09-09 dice algo más fuerte: el audio real se
aparta **incluso de la tabla**, hasta 1,33 dB por encima de los 24 dB.

O sea que las tres fuentes escritas describen la pantalla, y **la única que
describe el aparato es la medición de este repositorio**. Ese contraste estaba
disponible desde el principio y no se hizo.

**Resuelto** en `752d93b`: las cuatro frases quedan corregidas donde estaban
—tachadas, no borradas— y el inventario comprobado vive en
[`trabajo-previo-de-terceros.md`](../../referencia/trabajo-previo-de-terceros.md),
con el commit exacto que se miró de cada repositorio.

### 2.3 Documentos que se quedaron atrás de su propia medición

`hallazgo-el-ecualizador-de-salida-es-otra-cosa.md` seguía declarando la ley del
gráfico como `INFERIDO` para las dos superficies, con las dos ya medidas.
Corregido tachando el párrafo, no borrándolo: era cierto cuando se escribió y
muestra qué hacía falta para cerrarlo.

---

## 3. Lo que la auditoría NO encontró

Se dice explícitamente, porque un informe que sólo lista hallazgos no permite
distinguir «no había» de «no miré».

- **Ninguna medición publicada sin evidencia archivada.** La rama agrega **21
  archivos de evidencia**, uno por corrida —las que salieron y las que fallaron—,
  y la huella de cada una cubre el guion y sus instrumentos tal como estaban al
  correr. `validate-huella-de-evidencia` las comprueba.
- **Ninguna cifra con unidad citada que no esté en su evidencia.**
  `validate-cifras-medidas` comprueba 22 afirmaciones y las 22 cuadran.
- **Ningún documento huérfano**, ninguna evidencia sin citar, ningún
  identificador colgado.
- **Ningún commit en rojo.** `npm run verificar` está en verde en todos.
- **Ninguna ley publicada con un control en rojo.** Al revés: tres corridas se
  negaron a publicar —el C2 del 109, el C2 y el C3 del 110— y ese fue el
  mecanismo funcionando.

---

## 4. Lo autorizado que sigue sin hacer

**Una sola cosa, y es del usuario decidir cuándo.** El
[ítem 111](../../compromisos/111-que-modo-del-supresor-es-seguro.md) —averiguar
si el modo LOCK del supresor es seguro para meter un tono— está autorizado,
escrito y **sin correr**, porque correrlo exige hacer crecer, por primera vez, el
trinquete que existe porque esta consola perdió filtros dos veces. El usuario ya
dijo que sí. El guion está escrito y **vive fuera del árbol**, que es frágil.

Y quedan dos tareas que **necesitan manos**, no permiso:

- **Medir el lado derecho del gráfico del general** (`m.eq.peak.r.K`): la salida
  que vuelve al banco es la master 1, así que hace falta cambiar un cable.
- **Las bandas 2 a 5 del ecualizador de canal**, que comparten ley con la 1 por
  suposición y no por medición — la misma deuda que el 112 acaba de pagar para el
  general.
