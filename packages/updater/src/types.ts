import type { Version } from './version.ts';

/** Una publicación de GitHub ya validada y reducida a lo que hace falta. */
export interface Publicacion {
  readonly version: Version;
  readonly etiqueta: string;
  readonly notas: string;
  readonly publicadaEl: string;
  readonly apk: Recurso;
  /** Fichero de texto con el SHA-256 del APK. Sin él la publicación se descarta. */
  readonly suma: Recurso;
}

export interface Recurso {
  readonly nombre: string;
  readonly url: string;
  readonly bytes: number;
}

export interface ContextoDeActualizacion {
  /** `versionName` del paquete instalado, tal como lo informa Android. */
  readonly versionInstalada: string;
  /** Hay una sesión de sonido abierta, en cualquier estado que no sea CLOSED. */
  readonly sesionActiva: boolean;
  /** Hay una transacción escribiendo en la consola en este momento. */
  readonly transaccionEnCurso: boolean;
  /**
   * La aplicación está conectada a la consola.
   *
   * Es el suplente de `sesionActiva` mientras el modelo de sesión no esté
   * cableado a la interfaz: en MVP0 no hay forma de abrir una sesión, así que
   * sin esto la invariante no se dispararía nunca y el usuario podría
   * actualizar en pleno ensayo. Cuando exista la sesión, este campo sigue
   * valiendo: estar conectado a la consola es siempre estar en medio de algo.
   */
  readonly conectadoAConsola: boolean;
  readonly redDisponible: boolean;
  /** `null` cuando el dispositivo no informa el nivel. */
  readonly bateriaPorcentaje: number | null;
  readonly enCargador: boolean;
}

export type MotivoBloqueo =
  | 'SESION_ACTIVA'
  | 'CONECTADO_A_CONSOLA'
  | 'TRANSACCION_EN_CURSO'
  | 'SIN_RED'
  | 'BATERIA_BAJA';

export interface Bloqueo {
  readonly motivo: MotivoBloqueo;
  readonly invariante: string | null;
  readonly explicacion: string;
}

export type Decision =
  | { readonly tipo: 'AL_DIA' }
  | { readonly tipo: 'VERSION_INSTALADA_ILEGIBLE'; readonly texto: string }
  | { readonly tipo: 'DISPONIBLE'; readonly publicacion: Publicacion }
  | {
      readonly tipo: 'BLOQUEADA';
      readonly publicacion: Publicacion;
      readonly bloqueos: readonly Bloqueo[];
    };

/** Fases del proceso, para que la pantalla no tenga que inventarlas. */
export type FaseDeActualizacion =
  | 'INACTIVA'
  | 'CONSULTANDO'
  | 'DESCARGANDO'
  | 'VERIFICANDO'
  | 'LISTA_PARA_INSTALAR'
  | 'PIDIENDO_PERMISO'
  | 'INSTALANDO'
  | 'FALLIDA';
