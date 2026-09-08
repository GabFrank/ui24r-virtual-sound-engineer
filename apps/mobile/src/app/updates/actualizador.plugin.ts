import { registerPlugin } from '@capacitor/core';

/** Lo que informa Android sobre el paquete instalado. */
export interface InfoInstalada {
  readonly paquete: string;
  readonly versionNombre: string;
  readonly versionCodigo: number;
  /** Huella SHA-256 del certificado de firma. Vacía si no se pudo leer. */
  readonly firma: string;
}

export interface EstadoDeBateria {
  readonly porcentaje: number | null;
  readonly enCargador: boolean;
}

export interface ResultadoDeDescarga {
  readonly ruta: string;
  readonly bytes: number;
  readonly sha256: string;
}

export interface ProgresoDeDescarga {
  readonly bytesRecibidos: number;
  readonly bytesTotales: number;
}

export interface ActualizadorPlugin {
  infoInstalada(): Promise<InfoInstalada>;
  estadoDeBateria(): Promise<EstadoDeBateria>;
  permisoDeInstalacion(): Promise<{ concedido: boolean }>;
  pedirPermisoDeInstalacion(): Promise<{ concedido: boolean }>;
  descargar(opciones: { url: string; sha256: string; nombre: string }): Promise<ResultadoDeDescarga>;
  instalar(opciones: { ruta: string }): Promise<{ instalada: boolean }>;
  addListener(
    evento: 'progresoDeDescarga',
    oyente: (p: ProgresoDeDescarga) => void,
  ): Promise<{ remove: () => Promise<void> }>;
}

/**
 * Implementación para el navegador.
 *
 * No es un maquillaje: las pruebas visuales corren en un navegador de
 * escritorio y necesitan poder llegar hasta la pantalla de actualización. Todo
 * lo que no se puede simular sin Android falla con un mensaje explícito, en
 * lugar de fingir que funcionó.
 */
class ActualizadorWeb implements ActualizadorPlugin {
  /**
   * Dos valores se pueden fijar desde `localStorage` para poder recorrer la
   * pantalla entera en un navegador: la versión que se hace pasar por
   * instalada y si el permiso está concedido. Sin esto no habría forma de
   * llegar al botón de descargar, porque en el navegador el permiso nunca
   * existe. Este código no se ejecuta nunca en Android.
   */
  private ajuste(clave: string): string | null {
    try {
      return globalThis.localStorage?.getItem(clave) ?? null;
    } catch {
      return null;
    }
  }

  async infoInstalada(): Promise<InfoInstalada> {
    return {
      paquete: 'ar.frc.vse',
      versionNombre: this.ajuste('vse.web.versionInstalada') ?? '0.0.0',
      versionCodigo: 1,
      firma: '',
    };
  }
  async estadoDeBateria(): Promise<EstadoDeBateria> {
    return { porcentaje: null, enCargador: false };
  }
  async permisoDeInstalacion(): Promise<{ concedido: boolean }> {
    return { concedido: this.ajuste('vse.web.permiso') === 'si' };
  }
  async pedirPermisoDeInstalacion(): Promise<{ concedido: boolean }> {
    throw new Error('El permiso de instalación solo existe en Android.');
  }
  async descargar(): Promise<ResultadoDeDescarga> {
    throw new Error('La descarga de la actualización solo funciona en Android.');
  }
  async instalar(): Promise<{ instalada: boolean }> {
    throw new Error('La instalación solo funciona en Android.');
  }
  async addListener(): Promise<{ remove: () => Promise<void> }> {
    return { remove: async () => undefined };
  }
}

export const Actualizador = registerPlugin<ActualizadorPlugin>('Actualizador', {
  web: () => new ActualizadorWeb(),
});
