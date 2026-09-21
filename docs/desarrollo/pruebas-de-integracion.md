# Probar conexiones reales de software

```bash
npm run test:integration --workspace mobile
```

También corre dentro de `npm test` y, por lo tanto, de la verificación completa
y del grupo unit de la selección por impacto. Requiere Node 22 o posterior.

El runner compila los decoradores con esbuild y carga Angular. Importa las
clases de producción de escucha, mediciones, diario, envío y pantalla. No copia
la cancelación en un objeto de mentira ni busca el texto exacto de una condición.
Cambiar llaves o espacios sin cambiar comportamiento no debe romper estos tests.

## Alcance concreto

- Inyección real de servicios; transporte de medidores simulado y reloj controlado.
- `MedicionesService` y `DiarioService` ejecutan su SQL sobre SQLite real de
  prueba. Un caso reabre un archivo para comprobar la operación interrumpida.
- Cancelación en ambas fases, nueva escucha después de cancelar la cuenta,
  guardado/anotación, conexión caída, auxiliar ausente y error de persistencia.
- Métodos reales de la pantalla para subir, escuchar, anotar y marcar, con
  colaboradores controlados. Se comprueba exclusión de pasos simultáneos y corte
  de la cadena al cancelar.
- El servicio de envío registra qué ruta movió, permite marcarla y retira la
  marca al moverla otra vez. En ese caso el ejecutor es un doble, no el motor.

## Lo que no demuestra

No renderiza la pantalla ni ejercita su constructor, effect y enlace de
plantillas: los métodos de orquestación se invocan sobre su prototipo con
dependencias de prueba. No ejecuta el plugin SQLite de Capacitor, la compilación
Android ni la red real. Las claves foráneas se desactivan explícitamente para
reproducir la configuración actual de producción, sin atribuirle una protección
que no activa. Las pruebas del motor y las pruebas de campo conservan su papel.

No se habilitan escrituras desde navegador ni se sustituye el diario durable
por memoria en la aplicación. Las guardas de fuente existentes para otras rutas
siguen siendo comprobaciones parciales; no equivalen a pruebas de comportamiento.
Al migrar otro caso, importar su producción y sustituir sólo las guardas cuya
cobertura se haya reemplazado; no agregar otro simulacro de la implementación.

Para una regresión relevante, reintroducir el defecto en un worktree aislado y
comprobar que el caso falla. Probar también una transformación equivalente. No
modificar el árbol principal mientras corre una verificación ni tocar hardware.
