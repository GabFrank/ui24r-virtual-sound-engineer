/**
 * Almacén de documentos.
 *
 * Es el puerto que separa «qué se guarda» de «dónde se guarda». Existe porque
 * hay dos sitios reales y distintos: SQLite en la tablet, que es el del
 * producto, y el navegador, donde corren el desarrollo diario y las pruebas
 * del camino de usuario.
 *
 * La forma es de documentos y no de tablas porque el esquema ya guarda cada
 * entidad como JSON en una columna `datos`, con unas pocas columnas más para
 * poder filtrar. Fingir un modelo relacional encima de eso sería inventar una
 * capa que no existe.
 */

export type Coleccion =
  | 'band_profile'
  | 'venue_profile'
  | 'pa_profile'
  | 'sound_session'
  | 'measurement'
  | 'finding'
  | 'recommendation';

export type ValorIndice = string | number | null;

export interface Documento {
  readonly id: string;
  /** Columnas indexadas de la tabla. El resto del documento va en `datos`. */
  readonly indices: Readonly<Record<string, ValorIndice>>;
  readonly datos: unknown;
}

export interface Filtro {
  /** Igualdad exacta sobre una columna indexada. `null` compara con ausencia. */
  readonly donde?: Readonly<Record<string, ValorIndice>>;
  readonly ordenarPor?: string;
  readonly descendente?: boolean;
  readonly limite?: number;
}

export interface Almacen {
  abrir(): Promise<void>;
  guardar(coleccion: Coleccion, doc: Documento): Promise<void>;
  obtener(coleccion: Coleccion, id: string): Promise<Documento | null>;
  listar(coleccion: Coleccion, filtro?: Filtro): Promise<readonly Documento[]>;
  borrar(coleccion: Coleccion, id: string): Promise<void>;
  /** Vuelca todo, para adjuntar a un informe de campo. Sin audio. */
  exportar(): Promise<string>;
  /** Nombre de la implementación, para que el registro diga dónde se guardó. */
  readonly descripcion: string;
}
