import type { MixerDomainAPI } from '@vse/mixer-adapter';
import { pacingMs, type ParameterKind } from '@vse/domain';
import { clasificarRuta } from '@vse/mixer-adapter';
import { SafetyEngine } from './engine.ts';
import { entradaDesdeCambios, type Diario, type CambioRegistrado } from './journal.ts';
import type { CambioPropuesto, ContextoSeguridad } from './types.ts';

export interface OpcionesEjecutor {
  /**
   * Milisegundos entre escrituras consecutivas (INV-005).
   *
   * Si no se da, sale de `pacingMs()` del dominio, que distingue una
   * transacción de sistema —veinte milisegundos— de una normal —cien—. Estaba
   * escrito a mano como 100 y nunca bajaba a 20, así que la exención de la
   * invariante no existía en el código.
   */
  readonly pacingMs?: number;
  /** Espera para reintentar la lectura del valor previo. */
  readonly ahora?: () => number;
  readonly dormir?: (ms: number) => Promise<void>;
  /**
   * Aviso de que hay una transacción en curso.
   *
   * Lo consulta INV-034 para no actualizar la aplicación en medio de una
   * escritura. Estaba escrito como una señal en la aplicación que **nadie
   * ponía nunca en `true`**: la cláusula existía, se probaba, y en producción
   * no se disparaba jamás. Ahora lo avisa quien de verdad sabe cuándo hay una
   * transacción, que es esta clase.
   */
  readonly alCambiarActividad?: (enCurso: boolean) => void;
}

export type ResultadoTransaccion =
  | { readonly estado: 'RECHAZADA'; readonly motivos: readonly string[] }
  | { readonly estado: 'APLICADA'; readonly id: string }
  | { readonly estado: 'PARCIAL'; readonly id: string; readonly aplicados: number; readonly total: number; readonly motivo: string }
  | { readonly estado: 'CONFLICTO'; readonly id: string; readonly path: string; readonly motivo: string }
  | { readonly estado: 'SUSPENDIDA'; readonly id: string; readonly motivo: string };

/**
 * Ejecuta una transacción de principio a fin.
 *
 * El orden no es negociable, y cada paso existe por un caso concreto:
 *
 *  1. **Leer los valores previos de la consola.** No se calculan ni se
 *     suponen: son lo que hay que restaurar si algo sale mal (INV-002).
 *  2. **Pasar por el Safety Engine.** Si rechaza, no se escribe nada.
 *  3. **Escribir el diario antes de tocar la consola** (INV-020).
 *  4. **Escribir de a uno, con espera entre medio**, verificando cada uno
 *     antes del siguiente. Una ráfaga de escrituras sin verificar es cómo se
 *     llega a un estado que nadie sabe reconstruir.
 *  5. **Si algo falla a mitad, no se sigue.** La transacción queda parcial y
 *     el usuario ve exactamente qué se aplicó y qué no.
 */
export class EjecutorDeTransacciones {
  private readonly mixer: MixerDomainAPI;
  private readonly safety: SafetyEngine;
  private readonly diario: Diario;
  private readonly pacingOverride: number | null;
  private readonly dormir: (ms: number) => Promise<void>;
  private readonly avisarActividad: (enCurso: boolean) => void;
  /** Transacciones abiertas ahora mismo. El aviso mira el paso por cero. */
  private enCurso = 0;

  constructor(
    mixer: MixerDomainAPI,
    safety: SafetyEngine,
    diario: Diario,
    opciones: OpcionesEjecutor = {},
  ) {
    this.mixer = mixer;
    this.safety = safety;
    this.diario = diario;
    this.pacingOverride = opciones.pacingMs ?? null;
    this.dormir = opciones.dormir ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
    this.avisarActividad = opciones.alCambiarActividad ?? (() => { /* nadie mira */ });
  }

  /**
   * Marca la transacción como en curso mientras corre `cuerpo`.
   *
   * Cuenta en vez de encender y apagar, y las dos mitades importan por razones
   * distintas:
   *
   * El `finally` evita que la marca quede **pegada**: si se avisara el fin solo
   * en el camino feliz, una excepción la dejaría encendida para siempre y la
   * aplicación no volvería a poder actualizarse nunca, sin que nadie se entere.
   *
   * El contador evita que se apague **antes de tiempo**. Con un booleano, dos
   * transacciones solapadas —o una que revierte mientras otra aplica— dejaban
   * la marca en `false` al terminar la primera, con la segunda todavía
   * escribiendo. En esa ventana la invariante deja empezar una descarga en
   * mitad de una escritura, que es exactamente lo que existe para impedir.
   */
  private async conActividad<T>(cuerpo: () => Promise<T>): Promise<T> {
    // El incremento va dentro del `try`: si `avisarActividad` lanzara, con el
    // incremento afuera el `finally` no correría y el contador quedaría en uno
    // para siempre — el aviso pegado que este método existe para evitar, movido
    // dos líneas más arriba.
    try {
      this.enCurso += 1;
      if (this.enCurso === 1) this.avisarActividad(true);
      return await cuerpo();
    } finally {
      this.enCurso -= 1;
      if (this.enCurso === 0) this.avisarActividad(false);
    }
  }

  /**
   * Devuelve si la instantánea referenciada existe de verdad en la consola.
   *
   * Si la consulta falla —la conexión se cayó justo ahora— se responde que no
   * está verificada. Es la respuesta segura: sin poder comprobar que existe la
   * red de la que depende el retroceso, no se escribe.
   */
  private async verificarSnapshot(ref: string | null): Promise<boolean> {
    if (ref === null) return false;
    try {
      return (await this.mixer.listarSnapshots()).includes(ref);
    } catch {
      return false;
    }
  }

  async ejecutar(
    id: string,
    sessionId: string,
    razon: string,
    cambios: readonly CambioPropuesto[],
    ctx: ContextoSeguridad,
    opciones: {
      readonly conexionPermiteEscribir: boolean;
      readonly snapshotRef: string | null;
      readonly tipoDeOperacion?: string;
    },
  ): Promise<ResultadoTransaccion> {
    return this.conActividad(() => this.ejecutarAhora(
      id, sessionId, razon, cambios, ctx, opciones,
    ));
  }

  private async ejecutarAhora(
    id: string,
    sessionId: string,
    razon: string,
    cambios: readonly CambioPropuesto[],
    ctx: ContextoSeguridad,
    opciones: {
      readonly conexionPermiteEscribir: boolean;
      readonly snapshotRef: string | null;
      readonly tipoDeOperacion?: string;
    },
  ): Promise<ResultadoTransaccion> {
    // INV-001: la instantánea se verifica releyendo la lista de la consola,
    // no comprobando que la referencia no sea nula. Alguien pudo borrarla
    // desde el navegador de la consola entre que se guardó y ahora, y ese es
    // exactamente el escenario que la invariante describe.
    const snapshotVerificado = await this.verificarSnapshot(opciones.snapshotRef);

    const veredicto = this.safety.evaluar(cambios, ctx, {
      conexionPermiteEscribir: opciones.conexionPermiteEscribir,
      snapshotVerificado,
      ...(opciones.tipoDeOperacion === undefined
        ? {}
        : { tipoDeOperacion: opciones.tipoDeOperacion }),
    });

    if (!veredicto.permitido) {
      return {
        estado: 'RECHAZADA',
        motivos: veredicto.rechazos.map((r) => `${r.invariante}: ${r.mensaje}`),
      };
    }

    // Los valores previos salen del estado confirmado, que se alimenta solo de
    // mensajes entrantes. Si un parámetro no está ahí, no se escribe: no
    // sabríamos a qué revertir.
    // Igual que el motor: la exención del ritmo se decide por lo que la
    // transacción toca, no por cómo se declara.
    const clasesReales = cambios
      .map((c) => clasificarRuta(c.path))
      .filter((k): k is ParameterKind => k !== null);

    const previos = new Map<string, number>();
    for (const c of cambios) {
      const lectura = this.mixer.leer(c.path);
      if (lectura.storeState !== 'VALID' || lectura.confirmedAt === null) {
        return {
          estado: 'RECHAZADA',
          motivos: [
            `INV-002: ${c.path} no tiene valor confirmado. Sin valor previo leído de la ` +
            'consola no habría a qué revertir, así que no se escribe.',
          ],
        };
      }
      previos.set(c.path, lectura.value);
    }

    const entrada = entradaDesdeCambios(
      id, sessionId, razon, ctx.nivelAutonomia, opciones.snapshotRef, cambios, previos,
    );
    await this.diario.abrir(entrada);
    await this.diario.actualizar(id, { estado: 'APLICANDO' });

    let aplicados = 0;
    for (let i = 0; i < cambios.length; i++) {
      const c = cambios[i]!;
      if (i > 0) {
        await this.dormir(this.pacingOverride
          ?? pacingMs(ctx.nivelAutonomia, opciones.tipoDeOperacion, clasesReales));
      }

      const resultado = await this.mixer.escribir(c.path, c.valorPropuesto, c.valorEsperado);

      const registrado: CambioRegistrado = {
        path: c.path,
        unidad: c.unidad,
        valorPrevio: previos.get(c.path)!,
        valorEsperado: c.valorEsperado,
        valorEnviado: c.valorPropuesto,
        enviadoEl: new Date().toISOString(),
        confirmadoPor: resultado.confirmedBy,
        verificado: resultado.status === 'APPLIED',
      };
      await this.diario.registrarCambio(id, i, registrado);

      if (resultado.status === 'CONFLICT') {
        await this.diario.actualizar(id, {
          estado: 'CONFLICTO',
          cerradoEl: new Date().toISOString(),
        });
        return {
          estado: 'CONFLICTO',
          id,
          path: c.path,
          motivo: resultado.motivo ?? 'el valor actual no es el esperado',
        };
      }

      if (resultado.status !== 'APPLIED') {
        await this.diario.actualizar(id, {
          estado: 'PARCIAL',
          cerradoEl: new Date().toISOString(),
        });
        return {
          estado: 'PARCIAL',
          id,
          aplicados,
          total: cambios.length,
          motivo: resultado.motivo ?? `escritura en estado ${resultado.status}`,
        };
      }

      aplicados++;
    }

    await this.diario.actualizar(id, {
      estado: 'APLICADA',
      cerradoEl: new Date().toISOString(),
    });
    return { estado: 'APLICADA', id };
  }

  /**
   * Revierte una transacción, cambio por cambio y en orden inverso.
   *
   * Restaura el valor previo **leído de la consola**, no el calculado, y lo
   * verifica por lectura (INV-002). Va en orden inverso porque si dos cambios
   * de la misma transacción se afectan entre sí, deshacerlos en el mismo orden
   * en que se hicieron puede dejar un estado intermedio distinto del original.
   */
  async revertir(id: string): Promise<{ revertidos: number; fallidos: readonly string[] }> {
    // Revertir escribe en la consola igual que aplicar, así que cuenta como
    // transacción en curso: actualizar la aplicación a mitad de un retroceso
    // es exactamente lo que INV-034 evita.
    return this.conActividad(() => this.revertirAhora(id));
  }

  private async revertirAhora(
    id: string,
  ): Promise<{ revertidos: number; fallidos: readonly string[] }> {
    const entrada = await this.diario.leer(id);
    if (!entrada) throw new Error(`transacción desconocida: ${id}`);

    const fallidos: string[] = [];
    let revertidos = 0;

    const aplicados = entrada.cambios.filter((c) => c.enviadoEl !== null).reverse();
    for (const c of aplicados) {
      const r = await this.mixer.escribir(c.path, c.valorPrevio, c.valorEnviado);
      if (r.status === 'APPLIED') revertidos++;
      else fallidos.push(`${c.path}: ${r.motivo ?? r.status}`);
    }

    await this.diario.actualizar(id, {
      estado: fallidos.length === 0 ? 'REVERTIDA' : 'PARCIAL',
      cerradoEl: new Date().toISOString(),
    });
    return { revertidos, fallidos };
  }

  /**
   * Al arrancar la aplicación: qué quedó a medio aplicar.
   *
   * **No reaplica nada.** Devuelve la diferencia entre lo que el diario dice
   * que se envió y lo que la consola tiene ahora, para que decida una persona.
   */
  async recuperarTrasCaida(): Promise<readonly {
    id: string;
    razon: string;
    diferencias: readonly { path: string; enviado: number; enConsola: number | null; previo: number }[];
  }[]> {
    const interrumpidas = await this.diario.interrumpidas();
    return interrumpidas.map((e) => ({
      id: e.id,
      razon: e.razon,
      diferencias: e.cambios
        .filter((c) => c.enviadoEl !== null)
        .map((c) => {
          const lectura = this.mixer.leer(c.path);
          return {
            path: c.path,
            enviado: c.valorEnviado,
            enConsola: lectura.confirmedAt === null ? null : lectura.value,
            previo: c.valorPrevio,
          };
        }),
    }));
  }

  /** Una avalancha externa invalida la base de toda transacción abierta (INV-021). */
  async suspenderPorCambioMasivo(motivo: string): Promise<readonly string[]> {
    const abiertas = await this.diario.interrumpidas();
    for (const e of abiertas) {
      await this.diario.actualizar(e.id, { estado: 'SUSPENDIDA' });
    }
    return abiertas.map((e) => e.id);
  }
}
