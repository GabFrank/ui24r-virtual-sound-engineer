import type { ChannelAssignment } from '../entities/musical.ts';
import type {
  ElementoCaptacion, ElementoFuente, Escenario,
} from '../entities/escenario.ts';

/**
 * A qué canal de la consola entra un micrófono, siguiendo la cadena.
 *
 * **Por qué esto existe, y por qué el bloqueo que estaba registrado era otro.**
 * El backlog decía que `compararCaminos` —el asistente que contrasta el canal
 * que sospecha el analizador contra el que señala la geometría— estaba bloqueado
 * «porque `ElementoCaptacion.asignacionId` nunca se escribe». Es cierto que
 * nunca se escribe, y **no es el bloqueo**: `compararCaminos` no lee ese campo.
 * Recibe un resolvedor, `canalDeLaPareja`, y lo único que faltaba era
 * escribirlo. Un mandato de auditoría lo hizo mirar.
 *
 * **Y `asignacionId` no habría que escribirlo, aunque se pudiera.** El escenario
 * es del **local**: se carga una vez y se reusa con cada banda que toca ahí. La
 * asignación de canal es de la **sesión**, que empareja una banda con un local.
 * Guardar el canal en el elemento del escenario lo dejaría viejo la primera vez
 * que toque otra banda, y nadie se enteraría — el dato seguiría ahí, plausible y
 * falso. Es la misma forma de defecto que este proyecto viene encontrando en la
 * documentación: una copia que envejece sola.
 *
 * **La cadena, que ya existía entera y nadie había recorrido:**
 *
 *     micrófono --fuenteId--> fuente --bandMemberId--> integrante
 *                                                          |
 *                                          asignación --bandMemberId
 *
 * O sea: el micrófono dice qué fuente viene a tomar, la fuente dice quién la
 * produce, y la asignación dice en qué canal entra ese integrante.
 *
 * **Devuelve `null` cuando no puede saber, y eso es la mitad del valor.** Hay
 * cuatro caminos a `null` y los cuatro son distintos:
 *
 * 1. El micrófono no declara qué fuente toma. Nadie lo emparejó todavía.
 * 2. La fuente que declara no está en el escenario. Dato roto.
 * 3. La fuente no dice quién la produce. Un amplificador de guitarra sin dueño.
 * 4. **El integrante tiene más de un canal.** Toca dos instrumentos, y el
 *    micrófono no dice cuál de los dos viene a tomar. Éste es el interesante:
 *    la cadena existe y no alcanza, y devolver el primero sería inventar.
 *
 * `compararCaminos` trata bien el `null`: lo filtra, y si no le queda ningún
 * canal contesta `SIN_GEOMETRIA` en vez de adivinar. Así que las cuatro
 * ambigüedades terminan diciendo «la geometría no puede decidir esto», que es lo
 * correcto.
 */
export function canalDeLaCaptacion(
  escenario: Escenario,
  asignaciones: readonly ChannelAssignment[],
): (c: ElementoCaptacion) => number | null {
  // Los índices se arman una vez y no por llamada: el asistente recorre todas
  // las parejas expuestas, que son n × m.
  const fuentes = new Map<string, ElementoFuente>();
  for (const el of escenario.elementos) {
    if (el.tipo === 'FUENTE') fuentes.set(el.id, el);
  }
  const canalesPorIntegrante = new Map<string, number[]>();
  for (const a of asignaciones) {
    if (a.bandMemberId === null) continue;
    const xs = canalesPorIntegrante.get(a.bandMemberId) ?? [];
    xs.push(a.ui24rInputIndex as number);
    canalesPorIntegrante.set(a.bandMemberId, xs);
  }

  return (c) => {
    if (c.fuenteId === null) return null;
    const fuente = fuentes.get(c.fuenteId);
    if (fuente === undefined || fuente.bandMemberId === null) return null;
    const canales = canalesPorIntegrante.get(fuente.bandMemberId);
    // **Exactamente uno.** Con dos o más, el micrófono no dice cuál toma.
    if (canales === undefined || canales.length !== 1) return null;
    return canales[0]!;
  };
}

/**
 * Por qué un micrófono no se pudo emparejar con un canal, en castellano.
 *
 * Existe porque `canalDeLaCaptacion` devuelve `null` para cuatro cosas
 * distintas, y una pantalla que diga «no se pudo» sin decir cuál de las cuatro
 * deja al usuario sin nada que hacer. Con esto puede decir «falta emparejar el
 * micrófono con un instrumento» o «este integrante tiene dos canales, decí
 * cuál», que son acciones distintas.
 *
 * Devuelve `null` cuando **sí** se pudo, o sea que no hay nada que explicar.
 */
export function porQueNoHayCanal(
  escenario: Escenario,
  asignaciones: readonly ChannelAssignment[],
  c: ElementoCaptacion,
): string | null {
  if (c.fuenteId === null) {
    return `«${c.nombre}» no dice qué instrumento viene a tomar`;
  }
  const fuente = escenario.elementos.find(
    (el): el is ElementoFuente => el.tipo === 'FUENTE' && el.id === c.fuenteId,
  );
  if (fuente === undefined) {
    return `«${c.nombre}» apunta a un instrumento que no está en el escenario`;
  }
  if (fuente.bandMemberId === null) {
    return `«${fuente.nombre}» no dice quién lo toca`;
  }
  const canales = asignaciones
    .filter((a) => a.bandMemberId === fuente.bandMemberId)
    .map((a) => a.ui24rInputIndex as number);
  if (canales.length === 0) {
    return `quien toca «${fuente.nombre}» no tiene ningún canal asignado`;
  }
  if (canales.length > 1) {
    return `quien toca «${fuente.nombre}» tiene ${canales.length} canales `
      + `(${canales.join(', ')}) y «${c.nombre}» no dice cuál toma`;
  }
  return null;
}
