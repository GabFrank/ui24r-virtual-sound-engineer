# Auditoría de fidelidad del registro de la conversación

**Qué se auditó.** El 2026-09-12 el usuario pidió dos cosas seguidas: registrar
la conversación, y después —textual— «*ledir a un auditor a que revise si
realmente haz tomado nota de todo y con la interpretación correcta*». Este
archivo es el resultado de lo segundo.

El auditor recibió [`00-lo-que-dijo-el-usuario.md`](00-lo-que-dijo-el-usuario.md)
como patrón de medida y contrastó contra él los documentos derivados: los dos
archivos de `docs/pedidos/`, el [ADR-027](../adr/ADR-027-silenciar-para-diagnosticar.md),
`docs/alcance-mvp.md`, `docs/protocolo-de-verificacion.md`, los contratos de
`docs/compromisos/`, el motor de `packages/safety/` y la disciplina en
`.claude/skills/vse-disciplina/SKILL.md`.

**Resultado: 24 hallazgos.** Todos corregidos. Lo que sigue no es el listado
completo —está en el historial— sino las tres familias que importan, porque
describen *cómo* se deforma un registro y no sólo *qué* se deformó.

---

## 1. La cita inventada

En `packages/safety/src/engine.ts` y en el ADR-027 había, entre comillas y
atribuida al usuario, la frase «*total es un soundcheck y eso es normal en estas
condiciones*».

**El usuario nunca dijo eso.** Era una paráfrasis mía del sentido de lo que sí
dijo —«*Este bloqueo solo existe pensando en algun modo live, para un soundcheck
es legitimo tenerlo totalmente abierto*»— que en algún momento se puso entre
comillas y a partir de ahí viajó como si fuera original.

Es el peor hallazgo de los 24 porque una cita falsa no se detecta releyendo: se
lee como evidencia. Sólo se detecta contra el original, y el original no existía
como archivo hasta el 2026-09-12.

## 2. La autoría invertida

El ADR-027 decía «**Origen:** Decisión del usuario» y «El usuario lo planteó
así». Lo que el usuario dijo fue «*tomo tu recomendación*». La decisión la
propuse yo y él la aceptó; el documento la devolvía como si hubiera nacido de él.

Esto no es un detalle de crédito. Un ADR que dice «lo decidió el usuario» es
inmodificable sin consultarlo; uno que dice «lo propuso el agente y el usuario lo
aceptó» se puede revisar cuando aparezca evidencia nueva —que es exactamente la
libertad que el usuario dejó escrita en la misma frase: «*si futuramente aparece
un bloqueo relacionado (pensando ya) al modo live, tienes libertad de retirarlo*».

La misma inversión estaba en tres contratos de `docs/compromisos/` (C11, C12,
C13), que decían «Decisión del usuario» encima de derivaciones mías.

## 3. La restricción más ancha que el permiso

La guarda de silencio de canal bloqueaba `SHOW`, `FULL_BAND` y `RINGOUT`. El
usuario autorizó cerrar **el show**. `FULL_BAND` y `RINGOUT` son etapas del
soundcheck, y `RINGOUT` es literalmente el estado en el que se cazan acoples:
el diagnóstico quedaba rechazado justo donde más se aplica.

Quedó `ctx.sessionState === 'SHOW'`, con un test que verifica que `FULL_BAND`,
`RINGOUT`, `MIX` y `ROOM_OBSERVE` **permiten**.

---

## Las otras familias, en una línea cada una

| Familia | Ejemplo |
|---|---|
| **Actor cambiado** | El documento decía que la app apaga el supresor de acoples; el usuario dijo que lo apaga él. Ídem con el techo de ganancia. |
| **Decisión no propagada** | «Se abre el envío a monitores» escrito como hecho consumado: el usuario lo decidió, el código no lo refleja todavía. |
| **Contradicción interna** | Tres mediciones en un lugar, cuatro en otro. |
| **Higiene de cita** | El derivado corregía en silencio «simpes», «mecesites» y «rockit», y recortaba el arranque de una cita. El original declara que no se corrige la ortografía; corregirla rompe la búsqueda por texto que hace auditable el derivado. |
| **Condición donde había un absoluto** | «*preguntas siempre interactivas*» convertido en «preguntá cuando la respuesta cambia el trabajo», con lista de ejemplos. El «siempre» desapareció. |
| **Original inalcanzable** | Los documentos que citan no enlazaban al archivo que existe para que las citas se puedan verificar. |

---

## Lo que esta auditoría **no** prueba

- **No prueba que el registro esté completo.** Mide fidelidad de lo registrado
  contra el original, no cobertura: si una frase del usuario nunca llegó a
  `00-lo-que-dijo-el-usuario.md`, nada en este proceso la echa de menos.
- **No prueba que la interpretación sea la correcta**, sólo que está marcada
  como interpretación y no disfrazada de cita. Que la lectura sea buena lo
  decide el usuario leyéndola.
- **El original tampoco es incuestionable.** Lo transcribí yo. Es más auditable
  que la glosa, no es la conversación.

## Lo que cambia de acá en adelante

1. Lo que va entre comillas **sale del archivo de originales o no va entre
   comillas**. Si es mi paráfrasis, se escribe sin comillas y se dice que es mía.
2. Todo documento que cite **enlaza** a `00-lo-que-dijo-el-usuario.md`.
3. «Decisión del usuario» se reserva para lo que el usuario decidió. Lo que
   propuse yo y él aceptó se escribe así, con la cita de la aceptación.
4. Una restricción nueva **no puede ser más ancha que el permiso que la motiva**;
   si lo es, hay que decir por qué en el mismo lugar donde se escribe.
