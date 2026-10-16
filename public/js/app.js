// Arranque y navegación. Cada pantalla es una ruta después de la # (#/equipos, #/pokemon/25…).
// La cabecera cambia según la pantalla, como en los bocetos: con menú, solo el logo, o "← volver".

import { sesion, esEscritorio } from './api.js';
import { cargarCatalogo } from './datos.js';
import { cargarAnil } from './anil.js';
import { el, poner, botonTema, avatarUsuario, aviso } from './ui.js';
import { botonEncima, aplicarEncima, comprobarActualizacion } from './escritorio.js';
import { vistaBuscar } from './vistas/buscar.js';
import { vistaObjetos } from './vistas/objetos.js';
import { vistaMovimientos } from './vistas/movimientos.js';
import { vistaHabilidades } from './vistas/habilidades.js';
import { vistaNovedades, avisoNovedades } from './vistas/novedades.js';
import { vistaEquipos } from './vistas/equipos.js';
import { vistaEditor } from './vistas/editor.js';
import { vistaShowdown } from './vistas/showdown.js';
import { vistaLogin, vistaRegistro, vistaRecuperar, vistaRestablecer, vistaCuenta, vistaPerfil, vistaPrivacidad, vistaEscritorio } from './vistas/cuenta.js';
import { vistaAmigos, vistaPerfilAmigo, vistaEnlaceAmigo } from './vistas/amigos.js';
import { vistaChat } from './vistas/chat.js';
import { iniciarSondeo, salirDeVista, totalAvisos, insignia, pintarInsignia } from './online.js';

const cabecera = document.getElementById('cabecera');
let vista = document.getElementById('vista');

// [ruta, cabecera, clase del contenido, pantalla]
const RUTAS = [
  [/^#?\/?$/,                         { menu: 'buscar' },                      '',          () => vistaBuscar(vista)],
  [/^#\/pokemon\/(\d+)$/,             { menu: 'buscar' },                      '',          id => vistaBuscar(vista, +id)],
  [/^#\/anil\/(\w+)$/,                { menu: 'buscar' },                      '',          id => vistaBuscar(vista, null, id)],
  [/^#\/objetos$/,                    { menu: 'objetos' },                     '',          () => vistaObjetos(vista)],
  [/^#\/objetos\/(\d+)$/,            { menu: 'objetos' },                     '',          id => vistaObjetos(vista, +id)],
  [/^#\/objetos\/anil\/(\w+)$/,       { menu: 'objetos' },                     '',          id => vistaObjetos(vista, null, id)],
  [/^#\/movimientos$/,                { menu: 'movimientos' },                 '',          () => vistaMovimientos(vista)],
  [/^#\/movimientos\/(\d+)$/,        { menu: 'movimientos' },                 '',          id => vistaMovimientos(vista, +id)],
  [/^#\/habilidades$/,                { menu: 'habilidades' },                 '',          () => vistaHabilidades(vista)],
  [/^#\/habilidades\/(\d+)$/,        { menu: 'habilidades' },                 '',          id => vistaHabilidades(vista, +id)],
  [/^#\/habilidades\/anil\/(\w+)$/,   { menu: 'habilidades' },                 '',          id => vistaHabilidades(vista, null, id)],
  [/^#\/novedades$/,                  { volver: '#/', texto: '← Volver', atras: true }, 'estrecha', () => vistaNovedades(vista)],
  [/^#\/equipos$/,                    { menu: 'equipos' },                     'estrecha',  () => vistaEquipos(vista)],
  [/^#\/editor$/,                     { volver: '#/equipos', texto: '← Mis equipos' }, '',  () => vistaEditor(vista)],
  [/^#\/showdown(?:\/(importar|exportar))?$/, { volver: '#/equipos', texto: '← Mis equipos' }, 'estrecha', modo => vistaShowdown(vista, modo || 'importar')],
  [/^#\/login$/,                      { logo: true },                          'auth',      () => vistaLogin(vista)],
  [/^#\/registro$/,                   { logo: true },                          'auth',      () => vistaRegistro(vista)],
  [/^#\/recuperar$/,                  { logo: true },                          'auth',      () => vistaRecuperar(vista)],
  [/^#\/restablecer\/([a-f0-9]+)$/,   { logo: true },                          'auth',      token => vistaRestablecer(vista, token)],
  [/^#\/cuenta$/,                     { volver: '#/equipos', texto: '← Volver' }, 'estrecha cuenta', () => vistaCuenta(vista)],
  [/^#\/perfil$/,                     { volver: '#/cuenta', texto: '← Mi cuenta' }, 'estrecha cuenta', () => vistaPerfil(vista)],
  [/^#\/amigos$/,                     { menu: 'amigos' },                      'estrecha',  () => vistaAmigos(vista)],
  [/^#\/amigos\/([a-z0-9_]{3,20})$/,  { volver: '#/amigos', texto: '← Amigos' }, 'estrecha', u => vistaPerfilAmigo(vista, u)],
  [/^#\/chat\/([a-z0-9_]{3,20})$/,    { volver: '#/amigos', texto: '←', extra: true }, 'chat', u => vistaChat(vista, u)],
  [/^#\/amigo\/([A-Za-z0-9-]{8,16})$/, { logo: true },                         'auth',      c => vistaEnlaceAmigo(vista, c)],
  [/^#\/escritorio\/(\d+)\/([\w-]+)$/,  { logo: true },                         'auth',      (puerto, estado) => vistaEscritorio(vista, puerto, estado)],
  [/^#\/privacidad$/,                 { logo: true },                          'auth',      () => vistaPrivacidad(vista)],
];

function marca() {
  return el('a', { href: '#/', class: 'marca' }, 'Poke', el('span', {}, 'ton'));
}

/** Sin sesión: "Login" si en este navegador ya se ha entrado alguna vez; si no, "Registrarse". */
function botonCuenta() {
  const s = sesion();
  if (s) return el('a', { href: '#/cuenta', class: 'avatar', 'aria-label': 'Mi cuenta', title: s.usuario.nombre }, avatarUsuario(s.usuario, 36, { propio: true }));
  return localStorage.getItem('ha-entrado')
    ? el('a', { href: '#/login', class: 'entrar' }, 'Login')
    : el('a', { href: '#/registro', class: 'entrar' }, 'Registrarse');
}

let cabeceraActual = { menu: '' };

/* Cada sección del menú recuerda lo último que se vio en ella (un Pokémon, un objeto…): al volver a la sección
   desde el menú se abre eso, no la pantalla vacía. Pulsar la sección en la que ya estás lleva a su inicio. */
const INICIO = { buscar: '#/', objetos: '#/objetos', movimientos: '#/movimientos', habilidades: '#/habilidades', equipos: '#/equipos', amigos: '#/amigos' };
function enlaceMenu(seccion, actual) {
  if (seccion === actual) return INICIO[seccion];
  try { return sessionStorage.getItem(`ruta-${seccion}`) || INICIO[seccion]; } catch { return INICIO[seccion]; }
}
function recordarRuta(seccion, hash) {
  if (!INICIO[seccion]) return;
  try { sessionStorage.setItem(`ruta-${seccion}`, hash); } catch { /* sin almacenamiento: siempre al inicio */ }
}

function pintarCabecera(c) {
  cabeceraActual = c;
  if (c.volver) {
    // extra: hueco que rellena la pantalla (en el chat, la foto y el nombre del amigo)
    // atras: vuelve a la pantalla de antes (Novedades se abre desde varios sitios)
    const atras = c.atras && history.length > 1 ? e => { e.preventDefault(); history.back(); } : null;
    poner(cabecera, el('a', { href: c.volver, class: 'volver', 'aria-label': c.texto === '←' ? 'Volver' : null, onclick: atras }, c.texto),
      c.extra && el('div', { id: 'cabecera-extra', class: 'cabecera-extra' }),
      el('span', { id: 'estado-cabecera', class: 'estado-guardado', hidden: true }), botonEncima(), botonTema());
    return;
  }
  if (c.logo) { poner(cabecera, marca(), botonEncima(), botonTema()); return; }
  poner(cabecera,
    marca(),
    el('nav', { class: 'nav' },
      el('a', { href: enlaceMenu('buscar', c.menu), class: c.menu === 'buscar' ? 'on' : '' }, 'Buscar'),
      el('a', { href: enlaceMenu('objetos', c.menu), class: c.menu === 'objetos' ? 'on' : '' }, 'Objetos'),
      // En el móvil no caben las palabras enteras
      el('a', { href: enlaceMenu('movimientos', c.menu), class: c.menu === 'movimientos' ? 'on' : '', 'aria-label': 'Movimientos' },
        el('span', { class: 'largo' }, 'Movimientos'), el('span', { class: 'corto' }, 'Movs.')),
      el('a', { href: enlaceMenu('habilidades', c.menu), class: c.menu === 'habilidades' ? 'on' : '', 'aria-label': 'Habilidades' },
        el('span', { class: 'largo' }, 'Habilidades'), el('span', { class: 'corto' }, 'Habil.')),
      el('a', { href: enlaceMenu('equipos', c.menu), class: c.menu === 'equipos' ? 'on' : '' }, 'Equipos'),
      el('a', { href: enlaceMenu('amigos', c.menu), class: c.menu === 'amigos' ? 'on' : '' }, 'Amigos', totalAvisos() > 0 && insignia(totalAvisos()))),
    botonEncima(),
    botonTema(),
    botonCuenta());
}

function navegar() {
  salirDeVista();   // para el sondeo del chat y lo que haya dejado la pantalla anterior
  // Cada pantalla pinta en un <main> nuevo. Si la anterior termina de cargar tarde (su petición a la API tardó),
  // pinta en el viejo, que ya no está en la página, y no tapa la pantalla a la que se ha ido.
  const nueva = vista.cloneNode(false);
  vista.replaceWith(nueva);
  vista = nueva;
  const hash = location.hash || '#/';
  for (const [patron, cab, clase, mostrar] of RUTAS) {
    const m = hash.match(patron);
    if (!m) continue;
    recordarRuta(cab.menu, hash);
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
window.addEventListener('sesion', () => { navegar(); iniciarSondeo(); });   // al entrar o salir se repinta la cabecera
// Al cambiar la foto o el nombre en Editar perfil: solo la cabecera (si es la del menú)
window.addEventListener('perfil', () => { if (!cabeceraActual.volver && !cabeceraActual.logo) { pintarCabecera(cabeceraActual); pintarInsignia(); } });

try {
  await cargarCatalogo();
  await cargarAnil();   // Pokémon Añil: solo si existen sus datos en public/anil/
  navegar();
  iniciarSondeo();            // número rojo de "Amigos" (mensajes sin leer y solicitudes), cada 30 s
  // Service worker: la web se puede instalar en el móvil (y es lo que usa la app de Android). En el .exe no hace falta.
  if ('serviceWorker' in navigator && !esEscritorio && (location.protocol === 'https:' || ['localhost', '127.0.0.1'].includes(location.hostname))) {
    navigator.serviceWorker.register('sw.js').catch(() => { /* sin service worker la web funciona igual */ });
  }
  aplicarEncima();            // app de escritorio: "siempre encima" si se dejó activado
  comprobarActualizacion();   // app de escritorio: ¿hay versión nueva?
  avisoNovedades(aviso);      // si es una versión nueva para este navegador: enlace a lo que trae
} catch (e) {
  poner(vista, el('h1', {}, 'No se pudo cargar'), el('p', { class: 'msg error' }, e.message),
    el('p', { class: 'nota' }, 'Comprueba que la API está arrancada y que config.php apunta a la base de datos.'));
}
