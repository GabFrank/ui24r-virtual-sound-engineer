/**
 * Publicación automática.
 *
 * Cada fusión en `main` pasa por acá. semantic-release lee los commits desde la
 * última etiqueta, decide si corresponde una versión nueva y cuál, compila y
 * firma el APK, y crea la publicación con sus dos adjuntos. Si ningún commit
 * libera -- `docs:`, `chore:`, `ci:`, `refactor:`, `test:` -- termina sin
 * publicar nada y sin fallar.
 *
 * Lo que NO hace, a propósito:
 *
 * - **No escribe en el repositorio.** Nada de `@semantic-release/git`. `main`
 *   exige revisión por pull request, así que un empuje desde la publicación
 *   fallaría; y aunque no fallara, un commit automático sobre la rama que acaba
 *   de fusionarse es la forma más fácil de que el CHANGELOG escrito a mano se
 *   pierda en un conflicto.
 * - **No toca el CHANGELOG.** El de este repositorio está escrito para leerse,
 *   con el porqué de cada cambio; una lista generada de asuntos de commit sería
 *   peor. Esa lista igual existe: son las notas de la publicación en GitHub,
 *   que genera `release-notes-generator`. Dos cosas distintas para dos lectores
 *   distintos.
 * - **No publica en npm.** No hay paquete que publicar; al declarar los
 *   complementos de forma explícita, `@semantic-release/npm` queda fuera.
 *
 * La versión del APK sale de acá y no de `package.json`: sin escritura en el
 * repositorio no hay forma de mantener ese número al día, y un número viejo en
 * un fichero que se lee es peor que ninguno. `package.json` dice
 * `0.0.0-semantic-release` por eso.
 */
module.exports = {
  branches: ['main'],
  // ADR-020: la aplicación busca etiquetas `vX.Y.Z` y descarta cualquier cosa
  // con sufijo. El formato de etiqueta no es cosmético.
  tagFormat: 'v${version}',
  plugins: [
    ['@semantic-release/commit-analyzer', { preset: 'conventionalcommits' }],
    ['@semantic-release/release-notes-generator', { preset: 'conventionalcommits' }],
    [
      '@semantic-release/exec',
      {
        // Se compila y se firma DESPUÉS de saber la versión y ANTES de crear la
        // publicación: si la compilación o la comprobación de la firma fallan,
        // no queda una publicación vacía que la aplicación tenga que descartar.
        prepareCmd: 'tools/release/construir-apk.sh ${nextRelease.version}',
      },
    ],
    [
      '@semantic-release/github',
      {
        // Sin los DOS adjuntos la aplicación descarta la publicación: la suma
        // es obligatoria y no hay actualización sin verificar.
        assets: [
          { path: 'vse-*.apk', label: 'APK' },
          { path: 'vse-*.apk.sha256', label: 'SHA-256' },
        ],
        // Un comentario en cada incidencia y en cada pull request de la versión
        // es ruido en un repositorio de dos manos. El fallo sí abre incidencia:
        // una publicación rota que nadie mira es una tablet que se queda vieja.
        successComment: false,
      },
    ],
  ],
};
