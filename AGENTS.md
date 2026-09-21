# Entrada para agentes

1. `git status --short --branch` y `git log -3 --oneline`: ubicarse sin alterar trabajo ajeno.
2. Leer [estado actual](docs/estado-actual.md) y las dos skills breves:
   [vse-experto](.claude/skills/vse-experto/SKILL.md) y
   [vse-disciplina](.claude/skills/vse-disciplina/SKILL.md).
3. Abrir sólo las fuentes necesarias para la tarea elegida. Los cierres fechados
   son historia: no se heredan ni se leen en cadena. El backlog no es una orden.

El pedido actual del usuario manda sobre un prompt de una sesión anterior.
Un conflicto sobre límites de audio, autonomía o equipo necesita decisión
interactiva del usuario; no se resuelve tomando el documento más conveniente.
Para saber qué está implementado, contrastar el estado con el código y el diff.

El flujo y la selección de comprobaciones están en [CONTRIBUTING](CONTRIBUTING.md).
No correr la suite completa por abrir sesión: se elige por el cambio.
Antes de operar equipo real, leer [el procedimiento de hardware](docs/desarrollo/hardware.md).
Para cerrar, actualizar el estado y entregar en el chat el
[prompt de continuidad](docs/templates/prompt-continuidad.md) completado.
