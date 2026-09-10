import type { Transport } from '../src/transport.ts';

/**
 * Un transporte que no habla con nadie: las líneas las inyecta el test.
 *
 * Alcanza para probar el despacho del adaptador —a quién le avisa cada tipo de
 * trama, y qué ruta lee para cada canal— sin consola ni simulador. Contra el
 * simulador estas pruebas no servirían: el simulador cargaba la misma
 * suposición equivocada sobre los índices, y los dos errores se cancelaban.
 */
export class TransporteFalso implements Transport {
  private recibir: ((linea: string) => void) | null = null;
  private cerrar: ((motivo: string) => void) | null = null;
  private debeFallar = false;
  conectado = false;

  /** Todo lo que el adaptador mandó por este transporte. */
  readonly enviadas: string[] = [];

  /**
   * Las sesiones que este transporte tuvo que abrir.
   *
   * Es lo que hace comprobable la pereza del testigo (ADR-024): si nadie
   * escribió, esta lista tiene que estar vacía. Un contador no alcanzaría,
   * porque el test también necesita meterle líneas al testigo.
   */
  readonly sesiones: TransporteFalso[] = [];

  /** Hace fallar la apertura de las sesiones nuevas, no la de esta. */
  fallaLaSesionNueva = false;

  /**
   * Qué hace «la consola» cuando el adaptador escribe.
   *
   * Existe para poder probar el respaldo por medidor, que necesita que el nivel
   * cambie **como consecuencia** de la escritura y no antes: si el test inyecta
   * el nivel nuevo de entrada, el adaptador lo leería como nivel de partida y
   * la prueba pasaría sin haber probado nada.
   */
  alEnviar: ((linea: string) => void) | null = null;

  async conectar(): Promise<void> {
    if (this.debeFallar) throw new Error('no se pudo abrir la sesión');
    this.conectado = true;
  }
  async desconectar(): Promise<void> { this.conectado = false; }
  enviar(linea: string): void { this.enviadas.push(linea); this.alEnviar?.(linea); }
  alRecibir(cb: (linea: string) => void): () => void {
    this.recibir = cb;
    return () => { this.recibir = null; };
  }
  alAbrir(): () => void { return () => {}; }
  alCerrar(cb: (motivo: string) => void): () => void {
    this.cerrar = cb;
    return () => { this.cerrar = null; };
  }

  nuevaSesion(): TransporteFalso {
    const sesion = new TransporteFalso();
    sesion.debeFallar = this.fallaLaSesionNueva;
    this.sesiones.push(sesion);
    return sesion;
  }

  /** Mete una línea como si viniera de la consola. */
  entra(linea: string): void { this.recibir?.(linea); }

  /** Tira la conexión como si el socket se hubiera cerrado solo. */
  cae(motivo = 'cerrado'): void {
    this.conectado = false;
    this.cerrar?.(motivo);
  }
}
