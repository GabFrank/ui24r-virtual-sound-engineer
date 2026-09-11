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
  /**
   * **Listas, igual que el transporte real, y esto no es un detalle.**
   *
   * Hasta el 2026-09-10 acá había **un solo oyente**: `alRecibir` hacía
   * `this.recibir = cb` y el desuscriptor `this.recibir = null`. El real hace
   * `push` y `filter` sobre una lista.
   *
   * La consecuencia era grande y silenciosa: `pedirLista()` se suscribe encima
   * y **borraba** el `procesar` del adaptador; al terminar, su `quitar()` lo
   * dejaba **mudo**. O sea que durante y después de cada `guardarInstantanea()`
   * el adaptador de los tests no procesaba `SETD`, `SETS`, `VU2` ni `RTA`. Los
   * tests pasaban porque casi todos miran `enviadas`.
   *
   * Y eso hizo **estructuralmente intestable** el defecto más caro del día: la
   * consola le devuelve al que guardó el cambio de `var.currentSnapshot`, y el
   * escenario «llega el eco mientras guardamos» no se podía montar, porque el
   * doble se desenchufaba justo en esa ventana. Hubo que preguntarle al aparato.
   *
   * **Un doble que se aparta del real en el borde crea puntos ciegos con forma
   * de test en verde.**
   */
  private recibir: ((linea: string) => void)[] = [];
  private cerrar: ((motivo: string) => void)[] = [];
  private abrir: (() => void)[] = [];
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
    this.recibir.push(cb);
    return () => { this.recibir = this.recibir.filter((f) => f !== cb); };
  }
  alAbrir(cb: () => void): () => void {
    // Antes esto tiraba el callback a la basura y devolvía un desuscriptor
    // vacío. El real lo registra y lo llama al abrir.
    this.abrir.push(cb);
    return () => { this.abrir = this.abrir.filter((f) => f !== cb); };
  }
  alCerrar(cb: (motivo: string) => void): () => void {
    this.cerrar.push(cb);
    return () => { this.cerrar = this.cerrar.filter((f) => f !== cb); };
  }

  nuevaSesion(): TransporteFalso {
    const sesion = new TransporteFalso();
    sesion.debeFallar = this.fallaLaSesionNueva;
    this.sesiones.push(sesion);
    return sesion;
  }

  /**
   * Mete una línea como si viniera de la consola.
   *
   * Se copia la lista antes de recorrerla: un oyente que se desuscribe mientras
   * se le avisa no tiene por qué saltearle el turno al siguiente.
   */
  entra(linea: string): void {
    for (const cb of [...this.recibir]) cb(linea);
  }

  /** Cuántos oyentes hay ahora. Para poder probar que nadie quedó mudo. */
  get oyentes(): number { return this.recibir.length; }

  /** Abre la conexión como si el socket hubiera conectado. */
  abre(): void {
    this.conectado = true;
    for (const cb of [...this.abrir]) cb();
  }

  /** Tira la conexión como si el socket se hubiera cerrado solo. */
  cae(motivo = 'cerrado'): void {
    this.conectado = false;
    for (const cb of [...this.cerrar]) cb(motivo);
  }
}
