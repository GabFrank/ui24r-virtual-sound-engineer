# Pedido del usuario: el recorrido guiado

Registrado el 2026-09-11, en respuesta a dos preguntas sobre el recorrido.

**Por qué existe este archivo.** El proyecto tiene una regla: no se entrecomilla
nada que no esté en un archivo. El contrato de compromisos citaba el pedido del
usuario, y ese pedido vivía sólo en la conversación. Un auditor lo marcó como no
verificable contra el repositorio, y tenía razón.

## Sobre el orden de los instrumentos

> El sistema propone un orden de inicio pero el usuario puede cambiar, imagina
> una pantalla con una lista de items y drag and drop para ordenar. La propuesta
> del sistema no puede ser al azar, tenemos que verificar en internet o en algun
> lugar cual es el orden que mejor nos vendria

Tres obligaciones salen de ahí:

1. El sistema **propone** un orden de inicio.
2. El usuario **puede cambiarlo**, con una lista y arrastre.
3. La propuesta **no puede ser al azar**: hay que verificarla en fuentes.

## Sobre las cinco etapas cuya ley no está medida

La pregunta ofrecía tres caminos: mostrarlas bloqueadas y que el usuario las
ajuste a mano, cubrir sólo la ganancia, o estimarlas con supuestos. El usuario
contestó:

> Que te parece si antes del MVP hacemos estas mediciones? en el mvp ya tiene
> que estar funcional (minimamente)

O sea: **las cinco leyes se miden antes de la primera entrega**. Eso las convierte
en trabajo presencial de la ruta crítica, y cambia qué es el recorrido guiado: no
está pensado para convivir con etapas bloqueadas para siempre.

## Cuatro decisiones tomadas el 2026-09-11

Un auditor de expectativas listó nueve decisiones de producto sin tomar y no
supuso ninguna. Cuatro se le preguntaron al usuario; las respuestas:

| Pregunta | Respuesta |
|---|---|
| ¿Cuándo se guarda el orden? | **Al soltar, sin botón.** Un arrastre es un gesto completo y deliberado, no una tecla; en soundcheck, perder el orden por no haber apretado nada es peor que una escritura de más |
| ¿Qué canales entran al recorrido? | **Todo lo asignado, y el usuario puede sacar a mano** lo que no corresponda recorrer. La aplicación no adivina cuál sobra: no hay ningún dato que lo diga |
| ¿De dónde se agarra una fila? | **De un asidero al costado.** Deja la fila entera libre para desplazar la lista, que es lo que permite llegar a la fila 20 de 24 |
| ¿Qué hace «restaurar el orden propuesto»? | **Olvida el orden guardado**, no lo congela. Así la propuesta sigue acompañando: si mañana el catálogo aprende a clasificar los toms, el recorrido mejora solo |

Las otras cinco se deciden en el proyecto y quedan declaradas como decisión
propia en el contrato.
