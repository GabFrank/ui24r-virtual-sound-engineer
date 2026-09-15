import { AlmacenEnMemoria, VERSION_ESQUEMA, type Coleccion, type Documento } from '@vse/store';

/**
 * Almacén del navegador: la semántica de memoria, más persistencia.
 *
 * **No es el almacén del producto.** Existe para que la aplicación se pueda
 * recorrer entera en un navegador de escritorio: desarrollo diario y pruebas
 * del camino de usuario. En la tablet manda SQLite.
 *
 * Extiende la implementación de referencia en vez de reimplementarla, para que
 * el filtrado y el orden sean literalmente el mismo código que se prueba.
 *
 * Se eligió `localStorage` sobre IndexedDB porque es síncrono y los volúmenes
 * acá son de perfiles y sesiones, no de mediciones — las mediciones necesitan
 * hardware, y para entonces el camino es el nativo. Si algún día esto guarda
 * espectros, hay que cambiarlo.
 *
 * **Acá no corren las migraciones, y eso tenía una consecuencia.** Las
 * migraciones del esquema son SQL: no hay forma de aplicarlas sobre
 * `localStorage` sin reimplementarlas en otro lenguaje, y dos versiones de la
 * misma conversión son dos verdades que se separan. Así que no corren.
 *
 * Lo que eso dejaba abierto lo encontró una auditoría: un perfil guardado acá
 * antes de una migración se lee después con el código nuevo, que espera la
 * forma nueva. Un perfil de amplificación de antes de la migración 6 no tiene
 * identificador en sus componentes, y el escenario los referencia por ahí — o
 * sea que el plano queda mudo sin que nada falle.
 *
 * **La salida es descartar, no migrar.** Este almacén se declara desechable
 * desde la primera línea de este docblock: al abrir se compara la versión
 * guardada con la del esquema y, si no coinciden, se borra todo y se avisa
 * fuerte. Se pierden datos de prueba del navegador, que es exactamente lo que
 * el documento dice que son; lo que no se pierde es la coherencia entre lo
 * guardado y el código que lo lee.
 */
export class AlmacenEnNavegador extends AlmacenEnMemoria {
  private readonly prefijo = 'vse.almacen.';

  override get descripcion(): string { return 'navegador (localStorage)'; }

  override async abrir(): Promise<void> {
    // Se comprueba que se pueda escribir: en una ventana privada
    // `localStorage` existe pero lanza al escribir, y es mejor enterarse al
    // arrancar que al guardar la primera sesión.
    const prueba = `${this.prefijo}__prueba`;
    try {
      localStorage.setItem(prueba, '1');
      localStorage.removeItem(prueba);
    } catch {
      throw new Error('El navegador no deja guardar datos. ¿Ventana privada?');
    }
    this.descartarSiEsDeOtraVersion();
  }

  /** Dónde se guarda la versión del esquema con que se escribieron los datos. */
  private get claveDeVersion(): string { return `${this.prefijo}__version`; }

  /**
   * Descarta todo si lo guardado es de otra versión del esquema.
   *
   * **Se avisa por consola y no en silencio.** Perder datos de prueba del
   * navegador no tiene consecuencias; perderlos sin enterarse convierte un
   * «desapareció mi banda» en media hora de búsqueda.
   *
   * Sin marca de versión también se descarta: son los datos de antes de que
   * esto existiera, y de ésos no se sabe con qué forma se escribieron.
   */
  private descartarSiEsDeOtraVersion(): void {
    const guardada = localStorage.getItem(this.claveDeVersion);
    const actual = String(VERSION_ESQUEMA);
    if (guardada === actual) return;

    const claves: string[] = [];
    for (let i = 0; i < localStorage.length; i += 1) {
      const k = localStorage.key(i);
      if (k !== null && k.startsWith(this.prefijo)) claves.push(k);
    }
    for (const k of claves) localStorage.removeItem(k);
    this.datos.clear();
    localStorage.setItem(this.claveDeVersion, actual);

    if (claves.length > 0) {
      console.warn(
        `[almacén del navegador] Los datos guardados eran del esquema `
        + `${guardada ?? 'sin marcar'} y el código espera el ${actual}. Acá no corren las `
        + `migraciones --son SQL--, así que se descartaron ${claves.length} claves. `
        + `En la tablet no pasa: ahí manda SQLite y las migraciones sí corren.`,
      );
    }
  }

  protected override leer(coleccion: Coleccion): Documento[] {
    const cacheado = this.datos.get(coleccion);
    if (cacheado !== undefined) return cacheado;
    const crudo = localStorage.getItem(this.prefijo + coleccion);
    let docs: Documento[] = [];
    if (crudo !== null) {
      try {
        const v: unknown = JSON.parse(crudo);
        if (Array.isArray(v)) docs = v as Documento[];
      } catch {
        // Un almacén corrupto no debe impedir arrancar: se descarta la
        // colección y se sigue. Perder datos de prueba en el navegador no
        // tiene consecuencias; no arrancar antes de un ensayo, sí.
      }
    }
    this.datos.set(coleccion, docs);
    return docs;
  }

  protected override escribir(coleccion: Coleccion, docs: Documento[]): void {
    this.datos.set(coleccion, docs);
    try {
      localStorage.setItem(this.prefijo + coleccion, JSON.stringify(docs));
    } catch {
      // Sin espacio o sin permiso: se conserva en memoria y la sesión sigue.
    }
  }
}
