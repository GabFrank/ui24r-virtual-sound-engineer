import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  crearInstrumento, errorDeInstrumento, etiquetaCanonicaDeInstrumento, etiquetaDeInstrumento,
  fuentePorId, fuentesConRol, FUENTES, FUENTES_IDS, instrumentoDeAsignacion,
  interpretarInstrumento, motivoSinPerfilDeInstrumento, NOMBRE_DE_ROL,
  perfilDeCanalDeInstrumento, perfilDeInstrumento,
  reinterpretarInstrumento, ROLES_DE_INSTRUMENTO, SINONIMOS_DE_FUENTE, SINONIMOS_DE_ROL,
  SINONIMOS_DE_VARIANTE, VARIANTES_IDS, type Instrumento,
} from '../src/data/instrumentos.ts';
import { PERFILES_DE_CANAL } from '../src/data/channel-profiles.ts';
import { crearIntegrante } from '../src/entities/factories.ts';
import { normalizarInstrumentos, textoDeInstrumentos } from '../src/entities/integrantes.ts';
import { ui24rInput } from '../src/ids.ts';
import type { ChannelAssignment } from '../src/entities/musical.ts';
import type { ChannelAssignmentId, ChannelProfileId } from '../src/ids.ts';

/**
 * El catálogo de instrumentos: que sea coherente, que enlace con perfiles que
 * existen y que la conversión desde el texto viejo no pierda nada.
 *
 * El tercero es el que importa de verdad: hay perfiles de banda guardados en
 * SQLite con instrumentos escritos a mano, y si la conversión se come uno, el
 * usuario abre su banda y le falta gente tocando.
 */

// --- Coherencia del catálogo -------------------------------------------------

test('el catálogo tiene una entrada por fuente, sin faltar ni sobrar ninguna', () => {
  assert.deepEqual([...FUENTES.map((f) => f.id)].sort(), [...FUENTES_IDS].sort());
  assert.equal(FUENTES.length, new Set(FUENTES.map((f) => f.id)).size, 'hay una fuente repetida');
});

test('no hay variantes huérfanas: cada una la usa al menos una fuente', () => {
  const usadas = new Set(FUENTES.flatMap((f) => f.variantes.map((v) => v.id)));
  const huerfanas = VARIANTES_IDS.filter((v) => !usadas.has(v));
  assert.deepEqual(huerfanas, [],
    'una variante que ninguna fuente admite no se puede elegir desde ninguna pantalla');
});

test('no hay roles huérfanos: cada uno lo usa al menos una fuente', () => {
  const usados = new Set(FUENTES.flatMap((f) => f.roles));
  assert.deepEqual(ROLES_DE_INSTRUMENTO.filter((r) => !usados.has(r)), []);
});

test('cada variante y cada rol del catálogo tienen sinónimos declarados', () => {
  // Sin sinónimos, el lector de texto libre nunca puede llegar a esa faceta:
  // quedaría en el catálogo, elegible a mano, e invisible para la conversión.
  for (const v of VARIANTES_IDS) {
    assert.ok((SINONIMOS_DE_VARIANTE[v] ?? []).length > 0, `la variante ${v} no tiene sinónimos`);
  }
  for (const r of ROLES_DE_INSTRUMENTO) {
    assert.ok((SINONIMOS_DE_ROL[r] ?? []).length > 0, `el rol ${r} no tiene sinónimos`);
    assert.ok(NOMBRE_DE_ROL[r].length > 0, `el rol ${r} no tiene nombre`);
  }
  for (const f of FUENTES_IDS) {
    assert.ok((SINONIMOS_DE_FUENTE[f] ?? []).length > 0, `la fuente ${f} no tiene sinónimos`);
  }
});

test('dentro de una fuente no se repiten variantes, roles ni sinónimos', () => {
  for (const f of FUENTES) {
    assert.equal(f.variantes.length, new Set(f.variantes.map((v) => v.id)).size,
      `${f.id} declara dos veces la misma variante`);
    assert.equal(f.roles.length, new Set(f.roles).size,
      `${f.id} declara dos veces el mismo rol`);

    // Dos variantes de la misma fuente que compartan una palabra harían que el
    // lector dependa del orden del catálogo, que es exactamente lo que no
    // puede pasar: el mismo texto tiene que dar siempre el mismo instrumento.
    const vistas = new Map<string, string>();
    for (const v of f.variantes) {
      for (const s of SINONIMOS_DE_VARIANTE[v.id] ?? []) {
        const previa = vistas.get(s);
        assert.equal(previa, undefined,
          `en ${f.id}, «${s}» es sinónimo de ${previa} y de ${v.id} a la vez`);
        vistas.set(s, v.id);
      }
    }
  }
});

test('una fuente tiene perfil o dice por qué no lo tiene, nunca las dos ni ninguna', () => {
  for (const f of FUENTES) {
    assert.equal(f.perfil === null, f.sinPerfilPorque !== null,
      `${f.id}: forzar el perfil más parecido o callar que no hay son las dos formas `
      + 'de que la aplicación presente rangos que nadie pensó para esta fuente');
  }
});

test('las tablas por variante y por rol solo mencionan lo que la fuente admite', () => {
  for (const f of FUENTES) {
    for (const v of Object.keys(f.perfilPorVariante ?? {})) {
      assert.ok(f.variantes.some((x) => x.id === v),
        `${f.id} tiene perfil para la variante ${v}, que no admite`);
    }
    for (const r of Object.keys(f.perfilPorRol ?? {})) {
      assert.ok(f.roles.includes(r as never),
        `${f.id} tiene perfil para el rol ${r}, que no admite`);
    }
  }
});

test('ninguna fuente declara a la vez perfil por variante y perfil por rol', () => {
  // La precedencia está escrita en `perfilDeInstrumento` --manda la variante,
  // porque describe el aparato-- pero hoy no la ejercita nadie. Si alguna
  // fuente declarara las dos, esta regla dejaría de ser teórica y habría que
  // probarla con un caso real antes de confiar en ella.
  for (const f of FUENTES) {
    assert.ok(f.perfilPorVariante === null || f.perfilPorRol === null,
      `${f.id} declara las dos tablas y la precedencia no está probada con un caso real`);
  }
});

// --- El enlace con los perfiles de canal -------------------------------------

test('cada fuente con perfil apunta a un perfil que existe', () => {
  const tipos = new Set(PERFILES_DE_CANAL.map((p) => p.type));
  for (const f of FUENTES) {
    if (f.perfil !== null) assert.ok(tipos.has(f.perfil), `${f.id} apunta a ${f.perfil}`);
    for (const t of Object.values(f.perfilPorVariante ?? {})) {
      assert.ok(tipos.has(t), `${f.id} apunta por variante a ${t}`);
    }
    for (const t of Object.values(f.perfilPorRol ?? {})) {
      assert.ok(tipos.has(t), `${f.id} apunta por rol a ${t}`);
    }
  }
});

test('elegir una fuente trae el perfil de canal entero, con su banda útil', () => {
  const perfil = perfilDeCanalDeInstrumento(crearInstrumento('CAJON'));
  assert.ok(perfil !== null);
  assert.deepEqual([...perfil.bandaUtilHz], [45, 12000]);
});

test('la variante manda sobre el perfil por defecto de la fuente', () => {
  assert.equal(perfilDeInstrumento(crearInstrumento('GUITARRA')), 'ACOUSTIC_GUITAR');
  assert.equal(perfilDeInstrumento(crearInstrumento('GUITARRA', 'ELECTRICO')), 'ELECTRIC_GUITAR');
  assert.equal(perfilDeInstrumento(crearInstrumento('GUITARRA', 'NYLON')), 'ACOUSTIC_GUITAR');
});

test('el rol de la voz cambia el perfil: el coro no es la voz principal', () => {
  assert.equal(perfilDeInstrumento(crearInstrumento('VOZ', null, 'PRINCIPAL')), 'LEAD_VOCAL');
  assert.equal(perfilDeInstrumento(crearInstrumento('VOZ', null, 'CORO')), 'BACKING_VOCAL');
  assert.equal(perfilDeInstrumento(crearInstrumento('VOZ', null, 'SEGUNDA_VOZ')), 'BACKING_VOCAL');
});

test('djembe y bombo quedan sin perfil, y dicen por qué', () => {
  // No es una omisión: el perfil de conga corta el pasa altos donde vive el
  // golpe grave del djembe. Forzarlo daría un rango que nadie midió.
  for (const id of ['DJEMBE', 'BOMBO'] as const) {
    assert.equal(perfilDeInstrumento(crearInstrumento(id)), null);
    assert.equal(perfilDeCanalDeInstrumento(crearInstrumento(id)), null);
    assert.ok((fuentePorId(id).sinPerfilPorque ?? '').length > 20);
  }
});

test('el motivo de que no haya perfil sale del catálogo, no de la pantalla', () => {
  // La pantalla de canales tiene que poder decir por qué un djembe no trae
  // perfil. Si el texto se escribiera allá habría dos explicaciones que pueden
  // divergir, y la del catálogo es la que se revisa al agregar una fuente.
  for (const id of ['DJEMBE', 'BOMBO'] as const) {
    assert.equal(
      motivoSinPerfilDeInstrumento(crearInstrumento(id)),
      fuentePorId(id).sinPerfilPorque,
    );
  }
});

test('una fuente que sí tiene perfil no tiene nada que explicar', () => {
  assert.equal(motivoSinPerfilDeInstrumento(crearInstrumento('CONGA')), null);
  // También cuando el perfil sale de la variante o del rol, y no del defecto.
  assert.equal(motivoSinPerfilDeInstrumento(crearInstrumento('GUITARRA', 'ELECTRICO')), null);
  assert.equal(motivoSinPerfilDeInstrumento(crearInstrumento('VOZ', null, 'CORO')), null);
});

test('un instrumento que el catálogo no reconoce también dice por qué no hay perfil', () => {
  // Es el caso de un perfil viejo escrito a mano. Quedarse callado ahí es lo
  // mismo que en el djembe: un canal sin perfil y sin explicación.
  const motivo = motivoSinPerfilDeInstrumento(interpretarInstrumento('serrucho'));
  assert.ok(motivo !== null);
  assert.match(motivo, /serrucho/);
});

// --- La estructura impide las combinaciones absurdas -------------------------

test('una fuente no acepta la variante de otra', () => {
  assert.throws(() => crearInstrumento('DJEMBE', 'TESITURA_GRAVE'), /no admite la variante/);
  assert.throws(() => crearInstrumento('VOZ', 'NYLON'), /no admite la variante/);
  assert.throws(() => crearInstrumento('SHAKER', 'TAMANO_GRANDE'), /Se esperaba ninguna variante/);
});

test('una fuente no acepta el rol de otra', () => {
  assert.throws(() => crearInstrumento('DJEMBE', null, 'CORO'), /no admite el rol/);
  assert.throws(() => crearInstrumento('LINEA', null, 'BASE'), /Se esperaba ningún rol/);
});

test('el mensaje del error dice qué se esperaba, no que el valor es inválido', () => {
  const error = errorDeInstrumento({
    fuente: 'CONGA', variante: 'NYLON', rol: null, textoOriginal: null,
  });
  assert.match(error ?? '', /Se esperaba una de: TAMANO_GRANDE, TAMANO_MEDIANO, TAMANO_PEQUENO/);
});

test('un instrumento sin fuente y sin texto no dice nada, y se rechaza', () => {
  const vacio: Instrumento = { fuente: null, variante: null, rol: null, textoOriginal: null };
  assert.match(errorDeInstrumento(vacio) ?? '', /conservar el texto original/);
  assert.equal(errorDeInstrumento(
    { fuente: null, variante: null, rol: null, textoOriginal: 'bandoneón' },
  ), null);
});

// --- La conversión desde el texto libre --------------------------------------

/** Los nombres de canal que ya usa el proyecto, en `tools/mixer-sim/src/state.mjs`. */
const NOMBRES_DEL_SIMULADOR: readonly (readonly [string, string | null, string | null])[] = [
  ['VOZ PRINCIPAL', 'VOZ', 'LEAD_VOCAL'],
  ['CORO 1', 'VOZ', 'BACKING_VOCAL'],
  ['CORO 2', 'VOZ', 'BACKING_VOCAL'],
  ['GUITARRA AC', 'GUITARRA', 'ACOUSTIC_GUITAR'],
  ['GUITARRA EL', 'GUITARRA', 'ELECTRIC_GUITAR'],
  ['BAJO', 'BAJO', 'BASS'],
  ['CAJON', 'CAJON', 'CAJON'],
  ['CONGA', 'CONGA', 'CONGA'],
  ['SHAKER', 'SHAKER', 'SHAKER'],
  ['FLAUTA', 'FLAUTA', 'FLUTE'],
  ['TECLADO L', 'TECLADO', 'KEYBOARD'],
  ['TECLADO R', 'TECLADO', 'KEYBOARD'],
  ['MARACA', 'MARACA', 'SHAKER'],
  ['DJEMBE', 'DJEMBE', null],
  ['RCA L', 'LINEA', 'PLAYBACK'],
  ['RCA R', 'LINEA', 'PLAYBACK'],
];

test('se reconocen los nombres de canal que el proyecto ya usa', () => {
  for (const [nombre, fuente, perfil] of NOMBRES_DEL_SIMULADOR) {
    const i = interpretarInstrumento(nombre);
    assert.equal(i.fuente, fuente, `«${nombre}» se leyó como ${i.fuente}`);
    assert.equal(perfilDeInstrumento(i), perfil, `«${nombre}» trajo el perfil ${perfilDeInstrumento(i)}`);
  }
});

test('la conversión conserva el texto tal cual, se haya clasificado o no', () => {
  const textos = [
    'voz', 'Voz principal', 'GUITARRA CRIOLLA', 'cajón peruano', 'djembe mediano',
    'bandoneón', 'lo que sea', 'Conga (la de Nico)', '  bajo  ',
  ];
  for (const t of textos) {
    assert.equal(interpretarInstrumento(t).textoOriginal, t.trim(),
      'el texto original es lo único que queda cuando el catálogo no reconoce nada');
  }
});

test('lo que el catálogo no reconoce se guarda igual, sin fuente pero con su texto', () => {
  const i = interpretarInstrumento('bandoneón');
  assert.equal(i.fuente, null);
  assert.equal(i.variante, null);
  assert.equal(i.rol, null);
  assert.equal(i.textoOriginal, 'bandoneón');
  assert.equal(etiquetaDeInstrumento(i), 'bandoneón');
});

test('la pantalla sigue mostrando lo que el usuario escribió, no nuestro nombre', () => {
  const i = interpretarInstrumento('GUITARRA CRIOLLA');
  assert.equal(i.fuente, 'GUITARRA');
  assert.equal(i.variante, 'NYLON');
  assert.equal(etiquetaDeInstrumento(i), 'GUITARRA CRIOLLA');
  assert.equal(etiquetaCanonicaDeInstrumento(i), 'guitarra de nylon');
});

test('lo elegido de la lista no tiene texto original y se muestra con el nombre del catálogo', () => {
  const i = crearInstrumento('CONGA', 'TAMANO_PEQUENO', 'REPIQUE');
  assert.equal(i.textoOriginal, null);
  assert.equal(etiquetaDeInstrumento(i), 'conga quinto, repique');
});

test('las variantes y los roles se buscan solo entre los que la fuente admite', () => {
  // Sin ese acotado, «conga mediana» quedaría con tesitura de voz, que es la
  // otra faceta que usa la palabra «media».
  const conga = interpretarInstrumento('conga mediana');
  assert.equal(conga.fuente, 'CONGA');
  assert.equal(conga.variante, 'TAMANO_MEDIANO');

  const voz = interpretarInstrumento('voz media');
  assert.equal(voz.variante, 'TESITURA_MEDIA');
});

test('gana el sinónimo más largo, para que «sin bordonas» no se lea como «con bordonas»', () => {
  assert.equal(interpretarInstrumento('cajón sin bordonas').variante, 'SIN_BORDONAS');
  assert.equal(interpretarInstrumento('cajón con bordonas').variante, 'CON_BORDONAS');
});

test('las tildes y las mayúsculas no cambian lo que se reconoce', () => {
  assert.deepEqual(
    interpretarInstrumento('CAJÓN').fuente,
    interpretarInstrumento('cajon').fuente,
  );
  assert.equal(interpretarInstrumento('DJEMBE PEQUEÑO').variante, 'TAMANO_PEQUENO');
  assert.equal(interpretarInstrumento('djembe pequeno').variante, 'TAMANO_PEQUENO');
});

test('la lista de un integrante no pierde ningún instrumento al convertirse', () => {
  const escritos = ['voz', 'GUITARRA CRIOLLA', 'bandoneón', 'djembe grande'];
  const m = crearIntegrante('Ana', escritos);
  assert.equal(m.instrumentos.length, escritos.length);
  assert.deepEqual(m.instrumentos.map((i) => i.textoOriginal), escritos);
  assert.equal(textoDeInstrumentos(m.instrumentos), escritos.join(', '));
});

test('se siguen descartando las entradas vacías, y solo esas', () => {
  const m = crearIntegrante('  Ana  ', ['guitarra', '', '  ']);
  assert.equal(m.nombre, 'Ana');
  assert.equal(m.instrumentos.length, 1);
});

// --- Lo que deja la migración de la base -------------------------------------

test('lo que la migración dejó sin clasificar se clasifica al pasar por el dominio', () => {
  // La migración 4 del almacén solo le da forma al documento: deja las tres
  // facetas en nulo y el texto en `textoOriginal`, porque SQL no sabe qué es
  // un djembe. Esto es lo que completa la clasificación.
  const comoLoDejaLaMigracion: Instrumento = {
    fuente: null, variante: null, rol: null, textoOriginal: 'GUITARRA CRIOLLA',
  };
  const clasificado = reinterpretarInstrumento(comoLoDejaLaMigracion);
  assert.equal(clasificado.fuente, 'GUITARRA');
  assert.equal(clasificado.variante, 'NYLON');
  assert.equal(clasificado.textoOriginal, 'GUITARRA CRIOLLA');
});

test('reinterpretar es idempotente y nunca borra el texto', () => {
  const raro: Instrumento = {
    fuente: null, variante: null, rol: null, textoOriginal: 'bandoneón',
  };
  assert.deepEqual(reinterpretarInstrumento(reinterpretarInstrumento(raro)), raro);

  const elegido = crearInstrumento('DJEMBE', 'TAMANO_GRANDE', 'BASE');
  assert.deepEqual(reinterpretarInstrumento(elegido), elegido);
});

test('una lista todavía con cadenas crudas se muestra igual', () => {
  // Defensa por si la migración no llegó a correr --una base restaurada, una
  // versión de SQLite sin funciones JSON--. El tipo dice `Instrumento[]`, pero
  // lo que hay en el disco puede seguir siendo texto, y la pantalla no puede
  // quedarse mostrando «[object Object]» por eso.
  assert.equal(textoDeInstrumentos(['voz', 'bajo']), 'voz, bajo');
  assert.equal(normalizarInstrumentos(['voz', 'bajo']).length, 2);
});

// --- La asignación de canal --------------------------------------------------

const asignacionVieja: ChannelAssignment = {
  id: 'ch_1' as ChannelAssignmentId,
  ui24rInputIndex: ui24rInput(3),
  bandMemberId: null,
  instrumento: 'FLAUTA',
  // Sin clasificar: es lo que hay guardado de antes del catálogo.
  instrumentoDetalle: null,
  channelProfileId: 'perfil_flute' as ChannelProfileId,
  defaultRole: 'SUPPORT',
  micModelo: null,
  nombreEnConsola: 'FLAUTA',
  isLive: true,
};

test('una asignación guardada sin clasificar se lee interpretando su etiqueta', () => {
  assert.equal(instrumentoDeAsignacion(asignacionVieja).fuente, 'FLAUTA');
});

test('cuando la asignación trae clasificación, manda la clasificación', () => {
  const elegido = crearInstrumento('CONGA', 'TAMANO_GRANDE');
  const asignacion: ChannelAssignment = { ...asignacionVieja, instrumentoDetalle: elegido };
  assert.deepEqual(instrumentoDeAsignacion(asignacion), elegido);
});

// --- Para qué sirven las facetas ---------------------------------------------

test('preguntar por un rol es un filtro, no un recorrido de ramas', () => {
  const repiques = fuentesConRol('REPIQUE').map((f) => f.id);
  assert.deepEqual(repiques, ['DJEMBE', 'BOMBO', 'CAJON', 'CONGA']);
  assert.deepEqual(fuentesConRol('CORO').map((f) => f.id), ['VOZ']);
});
