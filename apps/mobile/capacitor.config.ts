import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'ar.frc.vse',
  appName: 'Virtual Sound Engineer',
  webDir: 'dist/mobile/browser',
  /*
   * La aplicación se sirve por http, no por https, y no es un descuido.
   *
   * Capacitor sirve el paquete web desde `https://localhost` por defecto, y
   * desde un origen https **el navegador prohíbe abrir un `ws://`**:
   *
   *   SecurityError: Failed to construct 'WebSocket': An insecure WebSocket
   *   connection may not be initiated from a page loaded over HTTPS.
   *
   * La Ui24R habla `ws://` y `http://` pelados: no tiene TLS ni forma de
   * tenerlo. Mientras el origen sea https, la aplicación **no puede conectarse
   * a la consola**, y da igual qué diga el resto del código. Comprobado en el
   * WebView del teléfono el 2026-09-08.
   *
   * `allowMixedContent: true` no alcanza: destraba la construcción del socket
   * pero `fetch()` es contenido mixto activo y Blink lo bloquea igual, y el
   * apretón de manos de socket.io es un `fetch`. También se probó.
   *
   * Con `http`, el origen pasa a `http://localhost`, que Chromium trata como
   * origen confiable —`isSecureContext` sigue siendo verdadero— así que no se
   * pierde ninguna API que necesite contexto seguro.
   *
   * El costo, que es real: **cambia el origen, y con él se vacía el
   * almacenamiento web**. Las preferencias guardadas en `localStorage` se
   * pierden una vez, al actualizar a la primera versión con este cambio. La
   * base de datos no: es SQLite nativa y vive fuera del origen.
   */
  server: {
    androidScheme: 'http',
  },
  android: {
    // La aplicación se usa en escenario, con poca luz. Nunca fondo claro.
    backgroundColor: '#0D1113',
    // Se mantiene en falso: con el origen en http ya no hay contenido mixto que
    // permitir, y relajarlo abriría la puerta a subrecursos inseguros sin
    // ninguna necesidad.
    allowMixedContent: false,
  },
  plugins: {
    CapacitorSQLite: {
      androidIsEncryption: false,
    },
  },
};

export default config;
