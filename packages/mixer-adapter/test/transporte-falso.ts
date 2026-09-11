import type { Transport } from '../src/transport.ts';
import { despojarSocketIo, MENSAJE_ALIVE } from '../src/protocol.ts';

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

  /**
   * Abre, y **avisa a quien se haya suscrito a la apertura**, igual que el real.
   *
   * `WebSocketTransport.conectar()` llama a los callbacks de `alAbrir` en su
   * `onopen`. El doble los guardaba y no los llamaba nunca: `abre()` era el
   * único camino y no lo usaba nadie, así que `alAbrir` era código muerto **de
   * los dos lados** y nadie podía notarlo.
   */
  async conectar(): Promise<void> {
    if (this.debeFallar) {
      // **Un intento fallido deja el transporte CERRADO, y avisa.** En el real,
      // el corte de tiempo llama a `ws.close()` **antes** de rechazar, así que
      // el aviso de cierre corre mientras `conectar()` todavía está en vuelo y
      // la promesa rechaza después. El doble antes lanzaba a secas: ni cerraba
      // ni avisaba, y encima dejaba `conectado` como estuviera --o sea que
      // mentía justo al revés que el real--.
      this.conectado = false;
      for (const cb of [...this.cerrar]) cb('no se pudo abrir');
      throw new Error('no se pudo abrir la sesión');
    }
    this.conectado = true;
    for (const cb of [...this.abrir]) cb();
  }

  /**
   * Cierra, y **avisa**, igual que el real.
   *
   * `WebSocketTransport.desconectar()` llama a `ws.close()`, y el `onclose`
   * corre después llamando a los callbacks de cierre. El doble solo bajaba la
   * bandera: el escenario «el usuario toca Desconectar y el aviso llega
   * después» no se podía montar.
   */
  async desconectar(): Promise<void> {
    const estaba = this.conectado;
    this.conectado = false;
    if (estaba) for (const cb of [...this.cerrar]) cb('cerrado');
  }

  /**
   * Envía, y **lanza con el socket cerrado, igual que el real.**
   *
   * `WebSocketTransport.enviar()` arranca con
   * `if (!this.conectado) throw new Error('transporte no conectado')`. El doble
   * aceptaba cualquier cosa en cualquier momento, así que el escenario más
   * probable de una noche de show --el socket a medio morir con la wifi
   * cargada, que la aplicación todavía cree CONECTADO-- era **irrepresentable**:
   * contra la consola `escribir()` tiraba una excepción en vez de devolver un
   * `WriteResult`, y ningún test podía verlo.
   */
  enviar(linea: string): void {
    if (!this.conectado) throw new Error('transporte no conectado');
    this.enviadas.push(linea);
    this.alEnviar?.(linea);
  }

  /**
   * Un latido, como el que el real manda solo cada segundo.
   *
   * **El doble no lo manda solo a propósito.** Un temporizador de verdad metería
   * el reloj en cada test de esta carpeta y los volvería dependientes de cuánto
   * tardan. Lo que sí hace falta es que el latido **se pueda meter**, porque
   * sin eso siete aserciones de la suite decían `enviadas` vacío --algo que
   * contra la consola no es cierto ni un segundo-- y nadie podía comprobar que
   * siguieran significando lo mismo con los latidos puestos.
   */
  latir(): void {
    // **Se saltea el tick en silencio si no hay socket, igual que el real**:
    // `if (this.conectado) this.enviar(MENSAJE_ALIVE)`. La primera versión de
    // este método llamaba a `enviar()` pelado, así que lanzaba donde el real no
    // puede — un apartamiento nuevo, introducido por el mismo cambio que vino a
    // quitar apartamientos.
    if (this.conectado) this.enviar(MENSAJE_ALIVE);
  }

  /**
   * Lo enviado **sin los latidos**, que es lo que casi todos los tests quieren.
   *
   * «No mandó nada» casi siempre significa «no mandó ninguna orden», no «el
   * socket estuvo mudo»: contra la consola el socket nunca está mudo.
   */
  get enviadasSinLatido(): readonly string[] {
    return this.enviadas.filter((l) => l !== MENSAJE_ALIVE);
  }
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
    // **La nieta también.** Sin esto no se podía montar «se cayó la red, así
    // que NINGUNA sesión abre»: la hija fallaba y la nieta conectaba tan
    // contenta. Es el escenario de una wifi caída, no el de un socket con mala
    // suerte.
    sesion.fallaLaSesionNueva = this.fallaLaSesionNueva;
    this.sesiones.push(sesion);
    return sesion;
  }

  /**
   * Mete una línea **ya pelada**, como si el envoltorio ya se hubiera quitado.
   *
   * Es la forma cómoda y la usan casi todos los tests. Lo que no puede probar
   * está en `llega()`: acá una llamada es siempre una línea, y contra la consola
   * eso no es cierto.
   *
   * Se copia la lista antes de recorrerla: un oyente que se desuscribe mientras
   * se le avisa no tiene por qué saltearle el turno al siguiente.
   */
  entra(linea: string): void {
    for (const cb of [...this.recibir]) cb(linea);
  }

  /**
   * Mete una **trama cruda de socket.io**, como la que llega por el cable.
   *
   * El real recibe `3:::SETD^i.0.mix^0.5` y pasa por `despojarSocketIo`, que
   * puede devolver **varias líneas de una sola trama** --van separadas por
   * `\n`-- o **ninguna**: el latido `2::` y la confirmación de conexión `1::`
   * no son protocolo y no tienen que llegarle a nadie.
   *
   * `entra()` no podía representar ni una cosa ni la otra, así que el reparto
   * de una trama múltiple --que es lo que hace la consola en cada volcado--
   * nunca se ejercitó desde acá.
   */
  llega(trama: string): void {
    for (const linea of despojarSocketIo(trama).lineas) this.entra(linea);
  }

  /** Cuántos oyentes hay ahora. Para poder probar que nadie quedó mudo. */
  get oyentes(): number { return this.recibir.length; }

  /** Abre la conexión como si el socket hubiera conectado solo, sin `conectar()`. */
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
