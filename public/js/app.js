// Arranque y navegación. Cada pantalla es una ruta después de la # (#/equipos, #/pokemon/25…).
// La cabecera cambia según la pantalla, como en los bocetos: con menú, solo el logo, o "← volver".

import { sesion, esEscritorio } from './api.js';
import { cargarCatalogo } from './datos.js';
import { cargarAnil } from './anil.js';
import { el, poner, botonTema, avatarUsuario } from './ui.js';
import { botonEncima, aplicarEncima, comprobarActualizacion } from './escritorio.js';
import { vistaBuscar } from './vistas/buscar.js';
import { vistaObjetos } from './vistas/objetos.js';
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

function pintarCabecera(c) {
  cabeceraActual = c;
  if (c.volver) {
    // extra: hueco que rellena la pantalla (en el chat, la foto y el nombre del amigo)
    poner(cabecera, el('a', { href: c.volver, class: 'volver', 'aria-label': c.texto === '←' ? 'Volver' : null }, c.texto),
      c.extra && el('div', { id: 'cabecera-extra', class: 'cabecera-extra' }),
      el('span', { id: 'estado-cabecera', class: 'estado-guardado', hidden: true }), botonEncima(), botonTema());
    return;
  }
  if (c.logo) { poner(cabecera, marca(), botonEncima(), botonTema()); return; }
  poner(cabecera,
    marca(),
    el('nav', { class: 'nav' },
      el('a', { href: '#/', class: c.menu === 'buscar' ? 'on' : '' }, 'Buscar'),
      el('a', { href: '#/objetos', class: c.menu === 'objetos' ? 'on' : '' }, 'Objetos'),
      el('a', { href: '#/equipos', class: c.menu === 'equipos' ? 'on' : '' }, 'Equipos'),
      el('a', { href: '#/amigos', class: c.menu === 'amigos' ? 'on' : '' }, 'Amigos', totalAvisos() > 0 && insignia(totalAvisos()))),
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
} catch (e) {
  poner(vista, el('h1', {}, 'No se pudo cargar'), el('p', { class: 'msg error' }, e.message),
    el('p', { class: 'nota' }, 'Comprueba que la API está arrancada y que config.php apunta a la base de datos.'));
}
