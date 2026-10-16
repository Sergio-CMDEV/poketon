// Pokémon Añil (fangame) en Poketon. public/anil/ no va a GitHub (.gitignore): se copia a mano al servidor (ver Despliegue).
//
// Uso:  node scripts/anil.mjs "C:\Users\Sergio\Downloads\Pokemon Anil V4.13"
//
// Lee los PBS del juego (formato Pokémon Essentials) y genera:
//   public/anil/datos.json     tabla de tipos, Pokémon y formas, habilidades, evoluciones y objetos
//   public/anil/sprites/       sprites del juego (tiras con la animación)
//   public/anil/shiny/         sprites shiny
//   public/anil/objetos/       iconos de los objetos del juego (evoluciones y objetos sin icono en ninguna web)
// Si public/anil/ no existe, la web funciona igual y la opción "Pokémon Añil" no aparece.

import { readFile, writeFile, mkdir, readdir, copyFile, rm } from 'node:fs/promises';
import { join } from 'node:path';

const juego = process.argv[2];
if (!juego) {
  console.error('Uso: node scripts/anil.mjs "carpeta de Pokémon Añil"');
  process.exit(1);
}
const SALIDA = 'public/anil';

/* ---------- PBS: secciones [ID] con líneas "Clave = Valor" ---------- */

function leerPBS(texto) {
  const secciones = [];
  let actual = null;
  for (const bruta of texto.replace(/^\uFEFF/, '').split(/\r?\n/)) {
    const linea = bruta.trim();
    if (!linea || linea.startsWith('#')) continue;
    const cab = linea.match(/^\[(.+)\]$/);
    if (cab) { actual = { id: cab[1] }; secciones.push(actual); continue; }
    const igual = linea.indexOf('=');
    if (actual && igual > 0) actual[linea.slice(0, igual).trim()] = linea.slice(igual + 1).trim();
  }
  return secciones;
}

const lista = v => (v ? v.split(',').map(s => s.trim()).filter(Boolean) : []);
const pbs = f => readFile(join(juego, 'PBS', f), 'utf8').catch(() => '');

const [tiposTxt, pokemonTxt, formasTxt, habilidadesTxt, objetosTxt, movimientosTxt] = await Promise.all(
  ['types.txt', 'pokemon.txt', 'pokemon_forms.txt', 'abilities.txt', 'items.txt', 'moves.txt'].map(pbs));
if (!tiposTxt || !pokemonTxt) {
  console.error(`No encuentro PBS/types.txt o PBS/pokemon.txt en: ${juego}`);
  process.exit(1);
}

const nombres = texto => Object.fromEntries(leerPBS(texto).map(s => [s.id, s.Name || s.id]));
const NOMBRE = { objeto: nombres(objetosTxt), movimiento: nombres(movimientosTxt), especie: nombres(pokemonTxt) };

/* ---------- Tabla de tipos (desde el punto de vista del defensor) ---------- */

const tipos = {};
for (const t of leerPBS(tiposTxt)) {
  if (t.IsPseudoType === 'true' || t.id === 'QMARKS') continue;
  tipos[t.id] = { nombre: t.Name || t.id, debil: lista(t.Weaknesses), resiste: lista(t.Resistances), inmune: lista(t.Immunities) };
}

/* ---------- Habilidades ---------- */

const habilidades = {};
for (const h of leerPBS(habilidadesTxt)) habilidades[h.id] = [h.Name || h.id, h.Description || ''];

/* ---------- Stats y EVs ---------- */

// Essentials guarda PS, Atq, Def, Vel, AtEsp, DefEsp → en Poketon van PS, Atq, Def, AtEsp, DefEsp, Vel
function stats(v) {
  const n = (v || '').split(',').map(Number);
  return n.length === 6 ? [n[0], n[1], n[2], n[4], n[5], n[3]] : [0, 0, 0, 0, 0, 0];
}
const POS_EV = { HP: 0, ATTACK: 1, DEFENSE: 2, SPECIAL_ATTACK: 3, SPECIAL_DEFENSE: 4, SPEED: 5 };
function evs(v) {
  const e = [0, 0, 0, 0, 0, 0];
  const p = lista(v);
  for (let i = 0; i + 1 < p.length; i += 2) if (p[i] in POS_EV) e[POS_EV[p[i]]] = +p[i + 1];
  return e;
}

/* ---------- Evoluciones: método, texto y objeto ---------- */

function metodoEvo(metodo, param) {
  const obj = NOMBRE.objeto[param] || param;
  const mov = NOMBRE.movimiento[param] || param;
  const esp = NOMBRE.especie[param] || param;
  const t = {
    Level: ['nivel', `Nivel ${param}`], LevelMale: ['nivel', `Nivel ${param} (macho)`], LevelFemale: ['nivel', `Nivel ${param} (hembra)`],
    LevelDay: ['nivel', `Nivel ${param} de día`], LevelNight: ['nivel', `Nivel ${param} de noche`],
    AttackGreater: ['nivel', `Nivel ${param} (Ataque > Defensa)`], DefenseGreater: ['nivel', `Nivel ${param} (Ataque < Defensa)`],
    AtkDefEqual: ['nivel', `Nivel ${param} (Ataque = Defensa)`],
    Silcoon: ['nivel', `Nivel ${param} (al azar)`], Cascoon: ['nivel', `Nivel ${param} (al azar)`], Ninjask: ['nivel', `Nivel ${param}`],
    Shedinja: ['otro', 'Hueco libre en el equipo al evolucionar Nincada'],
    Happiness: ['amistad', 'Amistad alta'], HappinessDay: ['amistad', 'Amistad alta de día'], HappinessNight: ['amistad', 'Amistad alta de noche'],
    Item: ['objeto', obj, param], ItemMale: ['objeto', `${obj} (macho)`, param], ItemFemale: ['objeto', `${obj} (hembra)`, param],
    Trade: ['intercambio', 'Intercambio'], TradeItem: ['intercambio', `Intercambio con ${obj} equipado`, param],
    TradeSpecies: ['intercambio', `Intercambio por ${esp}`],
    DayHoldItem: ['objeto', `Subir de nivel de día con ${obj} equipado`, param],
    NightHoldItem: ['objeto', `Subir de nivel de noche con ${obj} equipado`, param],
    HasMove: ['otro', `Subir de nivel sabiendo ${mov}`],
  }[metodo];
  return t || ['otro', param ? `${metodo} ${param}` : 'Método especial'];
}

const especies = leerPBS(pokemonTxt);
const porId = new Map(especies.map(e => [e.id, e]));

// evoluciones.get(destino) = { desde, metodos: [[metodo, texto, objeto?]] }
const evoluciones = new Map();
for (const e of especies) {
  const p = (e.Evolutions || '').split(',').map(x => x.trim());
  for (let i = 0; i + 1 < p.length; i += 3) {
    const [destino, metodo, param] = [p[i], p[i + 1], p[i + 2]];
    if (!porId.has(destino) || metodo === 'None') continue;
    const evo = evoluciones.get(destino) ?? { desde: e.id, metodos: [] };
    if (evo.desde !== e.id) continue;                     // solo la primera preevolución
    evo.metodos.push(metodoEvo(metodo, param));
    evoluciones.set(destino, evo);
  }
}
const raizDe = id => { let r = id, n = 0; while (evoluciones.has(r) && n++ < 10) r = evoluciones.get(r).desde; return r; };

/* ---------- Sprites ---------- */

async function carpeta(...ruta) {
  const archivos = await readdir(join(juego, ...ruta)).catch(() => []);
  return new Map(archivos.filter(f => /\.png$/i.test(f)).map(f => [f.replace(/\.png$/i, '').toUpperCase(), f]));
}
const frente = await carpeta('Graphics', 'Pokemon', 'Front');
const frenteShiny = await carpeta('Graphics', 'Pokemon', 'Front shiny');
const iconosObjeto = await carpeta('Graphics', 'Items');
const buscarSprite = (mapa, id) => mapa.get(id.toUpperCase()) || mapa.get(id.split('_')[0].toUpperCase()) || null;

/* ---------- Velocidad de la animación ---------- */
// En pokemon_metrics*.txt, "AnimationSpeed = trasero,frontal" (o un solo valor para los dos). Por defecto 2.
// El juego espera (velocidad / 2) × 60 ms entre fotograma y fotograma; 0 = sin animación.
const velocidades = new Map();
const tonosSuper = new Map();   // SuperShinyHue de pokemon_metrics (si el juego le pone uno a mano)
for (const f of (await readdir(join(juego, 'PBS')).catch(() => [])).filter(f => /^pokemon_metrics(?!_female).*\.txt$/i.test(f))) {
  for (const s of leerPBS(await pbs(f))) {
    const id = s.id.replace(/\s*,\s*/, '_').replace(/_0$/, '');
    velocidades.set(id, lista(s.AnimationSpeed).map(Number));
    if (+s.SuperShinyHue) tonosSuper.set(id, +s.SuperShinyHue);
  }
}
/** Super shiny: el sprite shiny con el tono girado tantos grados. Como el plugin del juego (Pokémon Animados para DBK):
 *  el de pokemon_metrics si lo tiene y, si no, ((suma de los códigos de las letras del id) % 7 + 1) × 45. */
function tonoSuperShiny(id) {
  const propio = tonosSuper.get(id) ?? tonosSuper.get(id.split('_')[0]);   // las formas sin datos usan los de la especie
  if (propio) return propio;
  const suma = [...Buffer.from(id, 'utf8')].reduce((a, b) => a + b, 0) % 65536;   // String#sum de Ruby
  return ((suma % 7) + 1) * 45;
}
function msPorFotograma(id) {
  const v = velocidades.get(id) ?? velocidades.get(id.split('_')[0]) ?? [];   // las formas sin datos usan los de la especie
  return Math.round(((v[1] ?? v[0] ?? 2) / 2) * 60);
}
/** Fotogramas de una tira PNG: ancho / alto (en la cabecera del PNG están el ancho y el alto). */
async function fotogramas(dir, archivo) {
  if (!archivo) return 0;
  const b = await readFile(join(juego, 'Graphics', 'Pokemon', dir, archivo)).catch(() => null);
  if (!b || b.length < 24) return 0;
  const ancho = b.readUInt32BE(16), alto = b.readUInt32BE(20);
  return ancho > alto * 2 ? Math.ceil(ancho / alto) : 1;
}

/* ---------- Peso, altura, sexo y captura ---------- */
// GenderRatio de Essentials → % de hembras ('sin_sexo' si no tiene)
const HEMBRAS = { AlwaysMale: 0, FemaleOneEighth: 12.5, Female25Percent: 25, Female50Percent: 50, Female75Percent: 75,
  FemaleSevenEighths: 87.5, AlwaysFemale: 100, Genderless: 'sin_sexo' };
const numero = v => (v === undefined || v === '' || isNaN(+v) ? null : +v);

/* ---------- Pokémon y formas ---------- */

/** "Forma Alola" → "Alola", "Mega Venusaur X" → "Mega X", "Mega Raichu x" → "Mega X" */
function nombreForma(nombreForma, especie) {
  const esp = especie.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  let f = nombreForma.replace(/^Forma\s+/i, '').replace(new RegExp(esp, 'i'), '').replace(/\s+/g, ' ').trim();
  f = f.replace(/\b([xy])$/, m => m.toUpperCase());
  return f || nombreForma;
}

function ficha(id, base, cambios, forma) {
  const d = { ...base, ...cambios };
  return {
    id,
    nombre: base.Name || base.id,
    forma,                                                   // null = forma normal
    base: base.id,
    gen: +base.Generation || 0,
    tipos: lista(d.Types),
    stats: stats(d.BaseStats),
    evs: evs(d.EVs),
    peso: numero(d.Weight),                                  // kg
    altura: numero(d.Height),                                // m
    sexo: HEMBRAS[d.GenderRatio] ?? null,
    captura: numero(d.CatchRate),
    habilidades: [...lista(d.Abilities).map(h => [h, 0]), ...lista(d.HiddenAbilities).map(h => [h, 1])],
    cadena: raizDe(base.id),
    region: cambios.Region || null,                          // para enlazar con el Pokémon oficial
    mega: /^Mega\b/i.test(cambios.FormName || '') ? ((cambios.FormName.match(/\s([XY])$/i) || [])[1] || '').toUpperCase() || 'MEGA' : null,
    piedra: cambios.MegaStone || null,                       // objeto con el que megaevoluciona
    rareza: lista(base.Flags).includes('Legendary') ? 'legendario' : lista(base.Flags).includes('Mythical') ? 'singular' : null,
    sprite: buscarSprite(frente, id),
    shiny: spriteShiny(id),
  };
}

/** Shiny de la propia forma. Si la forma no tiene sprite propio (usa el de la normal), también el shiny de la normal;
 *  si tiene sprite propio pero no shiny, ninguno: así no sale el shiny de otra forma. */
function spriteShiny(id) {
  const propio = frenteShiny.get(id.toUpperCase());
  if (propio || !id.includes('_')) return propio || buscarSprite(frenteShiny, id);
  return frente.has(id.toUpperCase()) ? null : buscarSprite(frenteShiny, id);
}

const pokemon = especies.map(e => ficha(e.id, e, {}, null));
for (const f of leerPBS(formasTxt)) {
  const [baseId, n] = f.id.split(',').map(x => x.trim());
  const base = porId.get(baseId);
  if (!base || !n || n === '0') continue;
  const tiposForma = f.Types ? lista(f.Types) : lista(base.Types);
  // Formas sin nombre y con los mismos tipos que la normal no aportan nada
  if (!f.FormName && tiposForma.join() === lista(base.Types).join()) continue;
  pokemon.push(ficha(`${baseId}_${n}`, base, { ...f, Types: tiposForma.join(',') },
    f.FormName ? nombreForma(f.FormName, base.Name || base.id) : `Forma ${n}`));
}

// Velocidad: la del juego. Muchas tiras shiny tienen la mitad de fotogramas que la normal (la misma animación
// con un fotograma de cada dos), así que el shiny dura lo mismo que la normal en vez de ir el doble de rápido.
for (const p of pokemon) {
  p.ms = msPorFotograma(p.id);
  if (p.shiny) p.superShiny = tonoSuperShiny(p.id);
  const [normal, shiny] = [await fotogramas('Front', p.sprite), await fotogramas('Front shiny', p.shiny)];
  if (p.shiny) p.msShiny = normal > 1 && shiny > 1 ? Math.round((p.ms * normal) / shiny) : p.ms;
}

/* ---------- Objetos (pantalla de Objetos con "Pokémon Añil" elegido) ---------- */
// Categoría como en los juegos oficiales: primero por sus etiquetas (Flags) y si no, por el bolsillo de la mochila
const BOLSILLO = { 2: 'Medicinas', 3: 'Poké Balls', 4: 'MT', 5: 'Bayas', 7: 'Combate', 8: 'Otros' };
function categoriaObjeto(o) {
  const f = lista(o.Flags).map(x => x.replace(/_.*/, ''));
  if (f.includes('MegaStone')) return 'Megapiedras';
  if (f.includes('EvolutionStone')) return 'Evolución';
  if (f.includes('Berry')) return 'Bayas';
  if (f.includes('PokeBall')) return 'Poké Balls';
  if (f.includes('KeyItem')) return 'Otros';
  if (o.Move) return 'MT';
  if (f.includes('Healing') || f.includes('Vitamin')) return 'Medicinas';
  if (f.includes('TypeGem')) return 'Equipables';
  return BOLSILLO[o.Pocket] || null;   // null: se decide en la web (si existe en los juegos oficiales, su categoría)
}
const objetos = leerPBS(objetosTxt).filter(o => o.Name && o.Description).map(o => ({
  id: o.id,
  nombre: o.Name,
  descripcion: o.Description,
  categoria: categoriaObjeto(o),
  movimiento: o.Move ? NOMBRE.movimiento[o.Move] || o.Move : null,   // MT: el movimiento que enseña
}));

// Cadenas: raíz → [[especie, nombre, desde, metodos]]
const cadenas = {};
for (const e of especies) {
  const evo = evoluciones.get(e.id);
  (cadenas[raizDe(e.id)] ||= []).push([e.id, e.Name || e.id, evo?.desde ?? null, evo?.metodos ?? []]);
}

/* ---------- Escribir ---------- */

await rm(SALIDA, { recursive: true, force: true });
let copiados = 0;
const copiar = async (origen, destino) => copyFile(origen, destino).then(() => copiados++, () => {});
for (const [dir, sub, campo] of [['Front', 'sprites', 'sprite'], ['Front shiny', 'shiny', 'shiny']]) {
  await mkdir(join(SALIDA, sub), { recursive: true });
  for (const archivo of new Set(pokemon.map(p => p[campo]).filter(Boolean))) {
    await copiar(join(juego, 'Graphics', 'Pokemon', dir, archivo), join(SALIDA, sub, archivo));
  }
}
// Iconos de todos los objetos del juego: los de evolución y, en la pantalla de Objetos, los pocos que no tienen
// icono en ninguna web (se buscan por su ID: "Health Mochi" → HEALTHMOCHI)
await mkdir(join(SALIDA, 'objetos'), { recursive: true });
for (const [id, archivo] of iconosObjeto) await copiar(join(juego, 'Graphics', 'Items', archivo), join(SALIDA, 'objetos', `${id}.png`));

await writeFile(join(SALIDA, 'datos.json'), JSON.stringify({ tipos, pokemon, habilidades, cadenas, objetos, iconosObjeto: [...iconosObjeto.keys()] }));
console.log(`Pokémon Añil: ${pokemon.length} Pokémon y formas, ${objetos.length} objetos, ${Object.keys(tipos).length} tipos, ${copiados} imágenes copiadas en ${SALIDA}/`);
