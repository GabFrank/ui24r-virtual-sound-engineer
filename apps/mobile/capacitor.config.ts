import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'ar.frc.vse',
  appName: 'Virtual Sound Engineer',
  webDir: 'dist/mobile/browser',
  android: {
    // La aplicación se usa en escenario, con poca luz. Nunca fondo claro.
    backgroundColor: '#0D1113',
    // Sin esto, un gesto accidental navega hacia atrás en mitad de un asistente.
    allowMixedContent: false,
  },
  plugins: {
    CapacitorSQLite: {
      androidIsEncryption: false,
    },
  },
};

export default config;
