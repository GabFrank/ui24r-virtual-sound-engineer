import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * **El texto de una opcion tiene que entrar en su desplegable.**
 *
 * Visto en la tablet el 2026-09-10: la columna «Quién» de Canales mostraba
 * «Sin integrant». No rompe nada, y ese es el problema — le dice al usuario que
 * nadie miró, justo antes de que la aplicación le pida confiar en números que
 * él no puede comprobar.
 *
 * **La causa no es el texto: es que el ancho estaba elegido y el texto también,
 * cada uno por su lado.** `select.quien` vale 130 px porque son tres
 * desplegables en la misma fila y sin ese recorte la tabla obliga a desplazarse
 * de lado en una tablet entera. Ese ancho le pone un techo a las letras que
 * caben, y nadie lo habia escrito en ningun lado.
 *
 * De donde sale el ocho, para que se pueda discutir:
 *
 *     130 px de ancho
 *   -  24 px de relleno (12 a cada lado, `--sp-3`)
 *   -   2 px de borde
 *   -  ~20 px de la flecha del desplegable
 *   = ~84 px para el texto
 *
 * A 15 px (`--txt-md`) el avance medio de una minuscula latina ronda medio eme,
 * o sea ~7,5 px, asi que entran unas once letras. **El ~20 de la flecha es lo
 * unico que no esta medido acá** --lo pone cada navegador-- y por eso el limite
 * se fija en OCHO y no en once: el margen cubre esa incertidumbre y las letras
 * anchas. «Sin integrante» son catorce. Ahora dice «Nadie», que son cinco.
 *
 * **Rompe la familia «Sin …» de las columnas vecinas a proposito.** Esas dos
 * viven en desplegables de 190 px, donde «Sin elegir» y «Sin asignar» entran
 * holgadas. Acá no entra ninguna variante de esa forma con margen suficiente, y
 * bajo el rotulo «Quién» la respuesta natural es «Nadie».
 */

const PLANTILLA = join(
  import.meta.dirname, '..', 'src', 'app', 'channels', 'channels.component.ts',
);

/** Lo que cabe en `select.quien`. Ver el calculo de arriba. */
const LETRAS_QUE_ENTRAN = 8;

test('la opcion fija del desplegable estrecho entra en su ancho', () => {
  const fuente = readFileSync(PLANTILLA, 'utf8');

  // El desplegable estrecho es el de la columna «Quién», el unico con la clase.
  // Se localiza cada `<select class="quien" …>` y se mira su opcion fija: la que
  // tiene `value=""`, que es la unica cuyo texto escribimos nosotros. Los
  // nombres de persona los escribe el usuario y se recortan, que es lo normal
  // en un desplegable y no una promesa rota.
  const estrechos = [...fuente.matchAll(/<select class="quien"[\s\S]*?<\/select>/g)]
    .map((m) => m[0]);
  // **Centinela.** Sin esto, un cambio de clase dejaria este test celebrando el
  // conjunto vacio: ya paso dos veces en este repositorio.
  assert.equal(estrechos.length, 1, 'el desplegable estrecho tiene que estar y ser uno');

  const fijas = estrechos.flatMap((s) =>
    [...s.matchAll(/<option value="">([^<]*)<\/option>/g)].map((m) => m[1]!.trim()));
  assert.equal(fijas.length, 1, 'una sola opcion fija');

  for (const texto of fijas) {
    assert.ok(
      texto.length <= LETRAS_QUE_ENTRAN,
      `«${texto}» son ${texto.length} letras y en 130 px entran unas ${LETRAS_QUE_ENTRAN}: `
      + 'en la tablet se va a leer cortado',
    );
  }
});

/**
 * **Control positivo.** El test de arriba afirma que un texto es corto, y una
 * asercion asi no distingue «se acorto» de «no encontro nada que medir». Acá se
 * comprueba que el limite RECHAZA lo que estaba antes.
 */
test('control positivo: el texto que estaba antes no pasaria', () => {
  assert.ok(
    'Sin integrante'.length > LETRAS_QUE_ENTRAN,
    'si esto no fallara, el limite no estaria separando nada',
  );
  assert.equal('Sin integrante'.length, 14);
  assert.equal('Nadie'.length, 5);
});

/**
 * Los desplegables anchos no tienen este problema, y conviene que quede
 * escrito: si alguien mueve el limite pensando que aplica a todos, este test
 * dice que no.
 */
test('los desplegables anchos admiten los textos que ya tienen', () => {
  const fuente = readFileSync(PLANTILLA, 'utf8');
  for (const texto of ['Sin elegir', 'Sin asignar']) {
    assert.ok(fuente.includes(`<option value="">${texto}</option>`), `${texto} sigue ahi`);
    // Viven en desplegables de 190 px: ~144 px de texto, unas diecinueve letras.
    assert.ok(texto.length <= 19, `${texto} entra en 190 px`);
  }
});
