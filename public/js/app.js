// Arranque y navegación. Cada pantalla es una ruta después de la # (#/equipos, #/pokemon/25…).
// La cabecera cambia según la pantalla, como en los bocetos: con menú, solo el logo, o "← volver".

import { sesion } from './api.js';
import { cargarCatalogo } from './datos.js';
import { cargarAnil } from './anil.js';
import { el, poner, botonTema } from './ui.js';
import { vistaBuscar } from './vistas/buscar.js';
import { vistaObjetos } from './vistas/objetos.js';
import { vistaEquipos } from './vistas/equipos.js';
import { vistaEditor } from './vistas/editor.js';
import { vistaShowdown } from './vistas/showdown.js';
import { vistaLogin, vistaRegistro, vistaRecuperar, vistaRestablecer, vistaCuenta, vistaPrivacidad, vistaEscritorio } from './vistas/cuenta.js';

const cabecera = document.getElementById('cabecera');
const vista = document.getElementById('vista');

// [ruta, cabecera, clase del contenido, pantalla]
const RUTAS = [
  [/^#?\/?$/,                         { menu: 'buscar' },                      '',          () => vistaBuscar(vista)],
  [/^#\/pokemon\/(\d+)$/,             { menu: 'buscar' },                      '',          id => vistaBuscar(vista, +id)],
  [/^#\/anil\/(\w+)$/,                { menu: 'buscar' },                      '',          id => vistaBuscar(vista, null, id)],
  [/^#\/objetos$/,                    { menu: 'objetos' },                     '',          () => vistaObjetos(vista)],
  [/^#\/objetos\/(\d+)$/,            { menu: 'objetos' },                     '',          id => vistaObjetos(vista, +id)],
  [/^#\/objetos\/anil\/(\w+)$/,       { menu: 'objetos' },                     '',          id => vistaObjetos(vista, null, id)],
  [/^#\/equipos$/,                    { menu: 'equipos' },                     'estrecha',  () => vistaEquipos(vista)],
  [/^#\/editor$/,                     { volver: '#/equipos', texto: '← Mis equipos' }, '',  () => vistaEditor(vista)],
  [/^#\/showdown(?:\/(importar|exportar))?$/, { volver: '#/equipos', texto: '← Mis equipos' }, 'estrecha', modo => vistaShowdown(vista, modo || 'importar')],
  [/^#\/login$/,                      { logo: true },                          'auth',      () => vistaLogin(vista)],
  [/^#\/registro$/,                   { logo: true },                          'auth',      () => vistaRegistro(vista)],
  [/^#\/recuperar$/,                  { logo: true },                          'auth',      () => vistaRecuperar(vista)],
  [/^#\/restablecer\/([a-f0-9]+)$/,   { logo: true },                          'auth',      token => vistaRestablecer(vista, token)],
  [/^#\/cuenta$/,                     { volver: '#/equipos', texto: '← Volver' }, 'estrecha cuenta', () => vistaCuenta(vista)],
  [/^#\/escritorio\/(\d+)\/([\w-]+)$/,  { logo: true },                         'auth',      (puerto, estado) => vistaEscritorio(vista, puerto, estado)],
  [/^#\/privacidad$/,                 { logo: true },                          'auth',      () => vistaPrivacidad(vista)],
];

function marca() {
  return el('a', { href: '#/', class: 'marca' }, 'Poke', el('span', {}, 'ton'));
}

/** Sin sesión: "Login" si en este navegador ya se ha entrado alguna vez; si no, "Registrarse". */
function botonCuenta() {
  const s = sesion();
  if (s) return el('a', { href: '#/cuenta', class: 'avatar', 'aria-label': 'Mi cuenta', title: s.usuario.nombre }, s.usuario.nombre[0].toUpperCase());
  return localStorage.getItem('ha-entrado')
    ? el('a', { href: '#/login', class: 'entrar' }, 'Login')
    : el('a', { href: '#/registro', class: 'entrar' }, 'Registrarse');
}

function pintarCabecera(c) {
  if (c.volver) {
    poner(cabecera, el('a', { href: c.volver, class: 'volver' }, c.texto),
      el('span', { id: 'estado-cabecera', class: 'estado-guardado', hidden: true }), botonTema());
    return;
  }
  if (c.logo) { poner(cabecera, marca(), botonTema()); return; }
  poner(cabecera,
    marca(),
    el('nav', { class: 'nav' },
      el('a', { href: '#/', class: c.menu === 'buscar' ? 'on' : '' }, 'Buscar'),
      el('a', { href: '#/objetos', class: c.menu === 'objetos' ? 'on' : '' }, 'Objetos'),
      el('a', { href: '#/equipos', class: c.menu === 'equipos' ? 'on' : '' }, 'Equipos')),
    botonTema(),
    botonCuenta());
}

function navegar() {
  const hash = location.hash || '#/';
  for (const [patron, cab, clase, mostrar] of RUTAS) {
    const m = hash.match(patron);
    if (!m) continue;
    pintarCabecera(cab);
    vista.className = `vista ${clase}`;
    mostrar(...m.slice(1));
    window.scrollTo(0, 0);
    return;
  }
  pintarCabecera({ menu: '' });
  poner(vista, el('h1', {}, 'Página no encontrada'), el('a', { href: '#/' }, 'Volver al inicio'));
}

window.addEventListener('hashchange', navegar);
window.addEventListener('sesion', navegar);   // al entrar o salir se repinta la cabecera

try {
  await cargarCatalogo();
  await cargarAnil();   // Pokémon Añil: solo si existen sus datos en public/anil/
  navegar();
} catch (e) {
  poner(vista, el('h1', {}, 'No se pudo cargar'), el('p', { class: 'msg error' }, e.message),
    el('p', { class: 'nota' }, 'Comprueba que la API está arrancada y que config.php apunta a la base de datos.'));
}
