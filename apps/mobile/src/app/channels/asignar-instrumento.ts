import {
  etiquetaDeInstrumento, instrumentoDeAsignacion, motivoSinPerfilDeInstrumento,
  perfilDeInstrumento,
  type BandMember, type BandMemberId, type ChannelAssignment, type ChannelProfileType,
  type Instrumento,
} from '@vse/domain';

/**
 * Elegir, al asignar un canal, **el instrumento entre los que toca quien lo
 * usa**, y traer de ahí el perfil de canal.
 *
 * Es el otro extremo del catálogo. En Perfiles → Banda el usuario dice quién
 * toca qué; acá esa carga sirve para algo: en vez de buscar «Guitarra
 * acústica» en una lista de trece perfiles —vocabulario nuestro, no suyo— elige
 * «Ana» y después «guitarra de nylon, base», que es lo que él dice, y el perfil
 * sale solo.
 *
 * **Vive fuera del componente** por la misma razón que
 * `perfiles/elegir-instrumentos.ts` y `telemetry/escala-medidor.ts`: es
 * transformación pura sobre datos del dominio, se prueba con `node --test` sin
 * montar Angular, y el componente solo consulta y emite.
 *
 * **Qué decide este fichero.** Qué se le ofrece a cada canal, qué se guarda
 * cuando se elige, y qué se dice cuando no se puede ofrecer nada. Lo que no
 * decide: qué instrumentos existen ni qué perfil les corresponde —eso es
 * `packages/domain`— ni cómo se dibuja.
 *
 * Los cuatro caminos que no son el feliz, y que la pantalla tiene que
 * sobrevivir, están todos acá y todos con un texto que dice qué hacer:
 * la banda sin integrantes, el canal sin integrante elegido, el integrante sin
 * instrumentos cargados y el integrante que ya no está en la banda.
 */

/** Un integrante tal como se ofrece en el desplegable de «Quién». */
export interface OpcionDeIntegrante {
  readonly id: BandMemberId;
  readonly nombre: string;
}

/**
 * Un instrumento de ese integrante, tal como se ofrece.
 *
 * `valor` es la posición en la lista del integrante, en texto, porque es lo que
 * un `<select>` puede llevar. Es la posición y no la etiqueta por el mismo
 * motivo que en la elección de instrumentos: dos congas son dos instrumentos
 * distintos y arrancan con la misma etiqueta hasta que se les elige el tamaño.
 */
export interface OpcionDeInstrumento {
  readonly valor: string;
  /** El instrumento tal como lo nombra el catálogo, o su texto original. */
  readonly etiqueta: string;
  /**
   * Lo que muestra la opción del desplegable, ya armado.
   *
   * Avisa ahí mismo cuando esa fuente no tiene perfil, y no solo después de
   * elegirla: quien arma la asignación tres minutos antes de empezar merece
   * saberlo antes de tocar, no descubrirlo cuando el margen objetivo salga de
   * «Personalizado».
   */
  readonly texto: string;
  /** Si elegirlo va a traer un perfil de canal. */
  readonly conPerfil: boolean;
}

/** Lo que se le ofrece a un canal, con el motivo cuando no hay nada que ofrecer. */
export interface InstrumentosDeIntegrante {
  readonly opciones: readonly OpcionDeInstrumento[];
  /**
   * Por qué la lista está vacía, o `null` cuando tiene algo.
   *
   * Nunca es solo «no hay»: cada caso dice qué hacer, porque los cuatro se
   * arreglan en sitios distintos y ninguno es evidente desde esta pantalla.
   */
  readonly porQueVacio: string | null;
}

/** Lo que se guarda al elegir un instrumento para un canal. */
export interface InstrumentoElegido {
  readonly instrumento: Instrumento;
  /** La etiqueta: lo que se muestra y lo que se sincroniza con el nombre del canal. */
  readonly etiqueta: string;
  /**
   * El perfil que se guarda.
   *
   * `CUSTOM` cuando la fuente no tiene perfil propio. No es rellenar: el
   * usuario acaba de elegir djembe, `sinPerfilPorque` explica en la misma fila
   * por qué no hay uno, y «Personalizado» existe exactamente para eso. Lo que
   * sí sería rellenar —y no se hace— es dejar puesto el perfil anterior, que
   * describía otro instrumento.
   */
  readonly tipo: ChannelProfileType;
  /** Por qué el perfil no salió del instrumento, o `null` si salió. */
  readonly sinPerfilPorque: string | null;
}

const SIN_INTEGRANTES =
  'Esta banda no tiene integrantes cargados. Cargalos en Perfiles → Banda y sus '
  + 'instrumentos aparecen acá; mientras tanto, elegí el perfil de canal a mano.';

const SIN_INTEGRANTE_ELEGIDO =
  'Elegí primero quién toca en este canal y acá van a aparecer sus instrumentos.';

const INTEGRANTE_QUE_YA_NO_ESTA =
  'El integrante que tenía este canal ya no está en la banda. Elegí a otro, o dejá '
  + 'el perfil que ya tiene.';

function sinInstrumentos(nombre: string): string {
  return `${nombre} no tiene instrumentos cargados. Cargáselos en Perfiles → Banda, `
    + 'o elegí el perfil de canal a mano.';
}

/** Los integrantes de la banda, en el orden en que están cargados. */
export function opcionesDeIntegrantes(
  integrantes: readonly BandMember[],
): readonly OpcionDeIntegrante[] {
  return integrantes.map((m) => ({ id: m.id, nombre: m.nombre }));
}

function integrantePorId(
  integrantes: readonly BandMember[],
  id: BandMemberId | null,
): BandMember | undefined {
  return id === null ? undefined : integrantes.find((m) => m.id === id);
}

/**
 * Los instrumentos que se le pueden asignar a un canal, dado quién lo toca.
 *
 * No se ofrece el catálogo entero a propósito. La lista corta es la que hace
 * que esto sea más rápido que elegir el perfil a mano: si ofreciéramos las
 * trece fuentes, habríamos cambiado una lista de trece por otra de trece y
 * además habríamos perdido el enlace con la persona.
 */
export function instrumentosDeIntegrante(
  integrantes: readonly BandMember[],
  bandMemberId: BandMemberId | null,
): InstrumentosDeIntegrante {
  if (integrantes.length === 0) return { opciones: [], porQueVacio: SIN_INTEGRANTES };
  if (bandMemberId === null) return { opciones: [], porQueVacio: SIN_INTEGRANTE_ELEGIDO };

  const m = integrantePorId(integrantes, bandMemberId);
  if (m === undefined) return { opciones: [], porQueVacio: INTEGRANTE_QUE_YA_NO_ESTA };
  if (m.instrumentos.length === 0) {
    return { opciones: [], porQueVacio: sinInstrumentos(m.nombre) };
  }

  return {
    opciones: m.instrumentos.map((i, indice) => {
      const etiqueta = etiquetaDeInstrumento(i);
      const conPerfil = perfilDeInstrumento(i) !== null;
      return {
        valor: String(indice),
        etiqueta,
        texto: conPerfil ? etiqueta : `${etiqueta} — sin perfil de canal`,
        conPerfil,
      };
    }),
    porQueVacio: null,
  };
}

/**
 * Lo que hay que guardar cuando se elige uno de esos instrumentos.
 *
 * Devuelve `null` si el valor no corresponde a ningún instrumento de ese
 * integrante —una lista que cambió mientras la pantalla estaba abierta—. La
 * pantalla no ofrece esos valores, pero la regla no puede depender de que la
 * pantalla no se equivoque.
 */
export function instrumentoElegido(
  integrantes: readonly BandMember[],
  bandMemberId: BandMemberId | null,
  valor: string,
): InstrumentoElegido | null {
  const m = integrantePorId(integrantes, bandMemberId);
  if (m === undefined) return null;
  // Solo dígitos, y no `Number(valor)`: la opción «Sin elegir» vale cadena
  // vacía, y `Number('')` es cero. Con eso, vaciar el desplegable elegía el
  // primer instrumento de la persona en vez de no elegir ninguno.
  if (!/^\d+$/.test(valor)) return null;
  const instrumento = m.instrumentos[Number(valor)];
  if (instrumento === undefined) return null;

  const tipo = perfilDeInstrumento(instrumento);
  return {
    instrumento,
    etiqueta: etiquetaDeInstrumento(instrumento),
    tipo: tipo ?? 'CUSTOM',
    sinPerfilPorque: motivoSinPerfilDeInstrumento(instrumento),
  };
}

/**
 * Qué opción del desplegable de instrumento corresponde a lo ya asignado.
 *
 * Se busca por la etiqueta guardada, que es lo que la asignación conserva, y no
 * por posición: los instrumentos del integrante se pueden reordenar en Perfiles
 * → Banda, y una posición guardada empezaría a señalar a otro instrumento sin
 * que nadie tocara la asignación.
 *
 * Con dos instrumentos de igual etiqueta —dos congas sin tamaño elegido— gana
 * el primero. Son indistinguibles por definición: mientras lo sean, cuál de los
 * dos se marque no cambia nada, y en cuanto se les elija el tamaño dejan de
 * serlo.
 *
 * Devuelve `''` —«ninguno»— cuando la asignación no tiene integrante, cuando su
 * instrumento ya no está entre los de esa persona, o cuando no hay asignación.
 * Ninguno de los tres es un error: son la asignación vieja, la lista corregida
 * y el canal libre.
 */
export function valorDelInstrumento(
  integrantes: readonly BandMember[],
  asignacion: ChannelAssignment | undefined,
  bandMemberId: BandMemberId | null,
): string {
  if (asignacion === undefined) return '';
  const m = integrantePorId(integrantes, bandMemberId);
  if (m === undefined) return '';
  const buscada = etiquetaDeInstrumento(instrumentoDeAsignacion(asignacion));
  const indice = m.instrumentos.findIndex((i) => etiquetaDeInstrumento(i) === buscada);
  return indice === -1 ? '' : String(indice);
}

/**
 * Por qué el canal ya asignado no tiene un perfil traído del instrumento, o
 * `null` cuando no hay nada que avisar.
 *
 * Se recalcula al leer y no se guarda con la asignación: si mañana se mide un
 * perfil de djembe, el aviso desaparece solo de todas las asignaciones que lo
 * llevaban. Un texto guardado seguiría diciendo que no hay perfil.
 *
 * Deja de avisar en cuanto el canal lleva un perfil distinto de
 * «Personalizado». Ese es el momento en que el usuario resolvió el caso a mano,
 * que es exactamente lo que el aviso le pedía; seguir mostrándolo convertiría
 * la explicación en ruido permanente sobre un canal que ya está bien.
 */
export function avisoDePerfilDeAsignacion(
  asignacion: ChannelAssignment,
  tipo: ChannelProfileType,
): string | null {
  // Solo cuando la asignación trae clasificación. Una asignación vieja lleva
  // texto libre sincronizado de la consola, y ahí «no hay perfil» no diría nada
  // del instrumento: diría que nadie lo eligió todavía.
  if (asignacion.instrumentoDetalle == null) return null;
  if (tipo !== 'CUSTOM') return null;
  return motivoSinPerfilDeInstrumento(asignacion.instrumentoDetalle);
}
