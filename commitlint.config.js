/**
 * El ámbito nombra el módulo afectado, no el hito ni la versión. `feat(mvp0)`
 * fue rechazado por eso, y con razón: dentro de seis meses "mvp0" no le dice
 * a nadie qué parte del sistema cambió, mientras que "assistants" sí.
 */
module.exports = {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'subject-case': [2, 'never', ['upper-case', 'pascal-case', 'start-case']],
    'header-max-length': [2, 'always', 72],
    'scope-enum': [
      2,
      'always',
      [
        // Documentación y proceso
        'docs', 'adr', 'gate', 'field',
        // Paquetes
        'domain', 'adapter', 'assistants', 'safety', 'dsp', 'updater', 'store', 'logging',
        // Aplicación
        'mobile', 'ui', 'audio', 'android', 'nav', 'datos',
        // Herramientas e infraestructura
        'spike', 'sim', 'visual', 'tools', 'ci', 'deps',
      ],
    ],
  },
};
