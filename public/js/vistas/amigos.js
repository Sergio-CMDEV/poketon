// Pantallas 10, 10d y 10e · Amigos (código, añadir, solicitudes y lista), perfil de un amigo y enlace de amigo.

import { peticion, sesion } from '../api.js';
import { el, poner, aviso, avatarUsuario, confirmar } from '../ui.js';
import { actualizarResumen, alSalirDeVista, turnoVista, formatoCodigo, estadoConexion, horaCorta, haceTexto, insignia, copiar, compartirEnlace } from '../online.js';
import { tarjetaCompartido } from '../compartidos.js';

const sinSesion = (raiz, texto) => poner(raiz,
  el('h1', {}, 'Amigos'),
  el('p', { class: 'msg info' }, texto),
  el('div', { class: 'dos-botones' }, el('a', { class: 'btn', href: '#/registro' }, 'Crear cuenta'), el('a', { class: 'btn sec', href: '#/login' }, 'Iniciar sesión')));

/* ---------- 10 · Amigos ---------- */

export async function vistaAmigos(raiz) {
  if (!sesion()) { sinSesion(raiz, 'Entra para añadir amigos, chatear y pasaros equipos.'); return; }
  poner(raiz, el('p', { class: 'nota' }, 'Cargando…'));

  const titulo = el('div', { class: 'fila-base' }, el('h1', {}, 'Amigos'));
  const codigo = el('section', { class: 'tarjeta' });
  const listas = el('div', { class: 'listas-amigos' });

  // "Añadir amigo" no se repinta al recargar la lista, para no perder lo que se está escribiendo
  const entrada = el('input', { name: 'destino', placeholder: 'PKT-XXXX-XXXX o @usuario', autocomplete: 'off', 'aria-label': 'Código de amigo o nombre de usuario', required: true });
  const error = el('p', { class: 'msg error', hidden: true, role: 'alert' });
  const enviar = el('button', { class: 'btn', type: 'submit' }, 'Enviar');
  const añadir = el('form', { class: 'tarjeta', onsubmit: async e => {
    e.preventDefault();
    error.hidden = true;
    enviar.disabled = true;
    try {
      const r = await peticion('amigos.php?accion=solicitar', { method: 'POST', body: { destino: entrada.value } });
      aviso(r.estado === 'aceptada' ? 'Os habíais mandado solicitud los dos: ya sois amigos' : 'Solicitud enviada');
      entrada.value = '';
      await cargar();
      actualizarResumen();
    } catch (err) { error.textContent = err.message; error.hidden = false; }
    finally { enviar.disabled = false; }
  } }, el('b', { class: 'tarjeta-titulo' }, 'Añadir amigo'), el('div', { class: 'fila-entrada' }, entrada, enviar), error);

  let datos;
  async function cargar() {
    datos = await peticion('amigos.php');
    pintar();
  }

  // Botones de una solicitud o de la lista: llaman a la API y repintan con la lista que devuelve
  const accion = (texto, nombre, otro, clase) => el('button', { class: clase, type: 'button', onclick: async e => {
    const boton = e.currentTarget;
    boton.disabled = true;
    try {
      datos = await peticion(`amigos.php?accion=${nombre}`, { method: 'POST', body: { usuario_id: otro.id } });
      if (nombre === 'aceptar') aviso(`${otro.nombre} y tú ya sois amigos`);
      pintar();
      actualizarResumen();
    } catch (err) { aviso(err.message, 'error'); boton.disabled = false; }
  } }, texto);

  function pintar() {
    const { amigos, recibidas, enviadas } = datos;
    poner(titulo, el('h1', {}, 'Amigos'), amigos.length > 0 && el('span', { class: 'tenue' }, amigos.length));
    poner(codigo,
      el('span', { class: 'lbl' }, 'Tu código de amigo'),
      el('b', { class: 'codigo-amigo' }, formatoCodigo(datos.codigo)),
      el('p', { class: 'nota' }, 'Pásaselo a quien quieras añadir, o comparte el enlace: al abrirlo le sale el botón para mandarte la solicitud.'),
      el('div', { class: 'dos-botones' },
        el('button', { class: 'btn-contorno', type: 'button', onclick: () => copiar(formatoCodigo(datos.codigo), 'Código copiado') }, 'Copiar código'),
        el('button', { class: 'btn-contorno', type: 'button', onclick: () => compartirEnlace(datos.codigo) }, 'Compartir enlace')));

    const solicitudes = recibidas.length + enviadas.length;
    poner(listas,
      solicitudes > 0 && [
        el('div', { class: 'fila' }, el('span', { class: 'lbl' }, 'Solicitudes'), recibidas.length > 0 && insignia(recibidas.length)),
        el('section', { class: 'lista-filas' },
          recibidas.map(s => el('div', { class: 'fila-persona' }, avatarUsuario(s, 40),
            el('div', { class: 'quien' }, el('b', {}, s.nombre, ' ', el('span', { class: 'arroba' }, `@${s.usuario}`)),
              el('small', {}, `Quiere ser tu amigo · ${haceTexto(s.fecha)}`)),
            accion('Aceptar', 'aceptar', s, 'btn-mini'),
            el('span', { title: 'Rechazar (no se le avisa)' }, accion('✕', 'rechazar', s, 'btn-mini sec')))),
          enviadas.map(s => el('div', { class: 'fila-persona' }, avatarUsuario(s, 40),
            el('div', { class: 'quien' }, el('b', {}, s.nombre, ' ', el('span', { class: 'arroba' }, `@${s.usuario}`)),
              el('small', {}, `Solicitud enviada · ${haceTexto(s.fecha)}`)),
            accion('Cancelar', 'cancelar', s, 'enlace-btn')))),
      ],
      el('span', { class: 'lbl' }, 'Tus amigos'),
      amigos.length === 0
        ? el('p', { class: 'msg info' }, 'Todavía no tienes amigos. Pásale tu código a alguien o escribe el suyo arriba.')
        : el('section', { class: 'lista-filas' }, amigos.map(filaAmigo)),
      el('p', { class: 'nota' }, 'Solo tus amigos pueden escribirte. Para quitar o bloquear a alguien, entra en su perfil.'));
  }

  const mio = turnoVista();
  try { await cargar(); }
  catch (e) { poner(raiz, el('p', { class: 'msg error' }, e.message)); return; }
  if (mio !== turnoVista()) return;   // ya se ha ido a otra pantalla mientras cargaba
  poner(raiz, titulo, codigo, añadir, listas);

  // Si llega una solicitud o un mensaje (el sondeo de 30 s lo avisa), se recarga la lista
  const alResumen = () => cargar().catch(() => {});
  window.addEventListener('resumen', alResumen);
  alSalirDeVista(() => window.removeEventListener('resumen', alResumen));
}

function filaAmigo(a) {
  const u = a.ultimo;
  const ultimo = !u ? 'Sin mensajes'
    : u.equipo !== null ? (u.mio ? `Has compartido "${u.equipo}"` : `Ha compartido "${u.equipo}"`)
    : (u.mio ? 'Tú: ' : '') + u.texto;
  return el('a', { class: `fila-persona${a.sin_leer ? ' sin-leer' : ''}`, href: `#/chat/${a.usuario}` },
    avatarUsuario(a, 44, { enLinea: a.en_linea }),
    el('div', { class: 'quien' }, el('b', {}, a.nombre, ' ', el('span', { class: 'arroba' }, `@${a.usuario}`)), el('small', { class: 'ultimo' }, ultimo)),
    el('div', { class: 'cuando' }, el('small', {}, u ? horaCorta(u.fecha) : ''), a.sin_leer > 0 && insignia(a.sin_leer)));
}

/* ---------- 10d · Perfil de un amigo ---------- */

export async function vistaPerfilAmigo(raiz, usuario) {
  if (!sesion()) { location.hash = '#/login'; return; }
  poner(raiz, el('p', { class: 'nota' }, 'Cargando…'));
  let a;
  try { a = await peticion(`amigos.php?usuario=${encodeURIComponent(usuario)}`); }
  catch (e) { poner(raiz, el('p', { class: 'msg error' }, e.message), el('a', { href: '#/amigos' }, 'Volver a Amigos')); return; }

  const desde = new Date(a.desde * 1000).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' });
  const quitar = async () => {
    if (!await confirmar(`¿Quitar a ${a.nombre} de tus amigos?`, 'No se le avisa. El chat se queda para leer, pero no podréis escribiros.', 'Quitar')) return;
    try { await peticion('amigos.php?accion=quitar', { method: 'POST', body: { usuario_id: a.id } }); aviso(`${a.nombre} ya no es tu amigo`); location.hash = '#/amigos'; }
    catch (e) { aviso(e.message, 'error'); }
  };
  const bloquear = async () => {
    if (!await confirmar(`¿Bloquear a ${a.nombre}?`, 'Deja de ser tu amigo y no podrá encontrarte, mandarte solicitudes ni escribirte. No recibe ningún aviso. Puedes desbloquearlo en Editar perfil.', 'Bloquear')) return;
    try { await peticion('amigos.php?accion=bloquear', { method: 'POST', body: { usuario_id: a.id } }); aviso(`Has bloqueado a ${a.nombre}`); location.hash = '#/amigos'; }
    catch (e) { aviso(e.message, 'error'); }
  };

  poner(raiz,
    el('section', { class: 'tarjeta perfil-amigo' },
      avatarUsuario(a, 88, { enLinea: a.en_linea }),
      el('b', { class: 'grande' }, a.nombre),
      el('span', { class: 'tenue' }, `@${a.usuario}`, estadoConexion(a) && ` · ${estadoConexion(a)}`),
      el('small', { class: 'tenue' }, `Amigos desde el ${desde}`),
      el('a', { class: 'btn', href: `#/chat/${a.usuario}` }, 'Enviar mensaje')),
    el('span', { class: 'lbl' }, 'Equipos que te ha compartido'),
    a.equipos.length === 0
      ? el('p', { class: 'nota' }, 'Todavía no te ha pasado ningún equipo.')
      : a.equipos.map(e => tarjetaCompartido(e.equipo, { etiqueta: '', detalle: horaCorta(e.fecha) })),
    el('section', { class: 'tarjeta peligro' },
      el('div', { class: 'dos-botones' },
        el('button', { class: 'btn sec', type: 'button', onclick: quitar }, 'Quitar de amigos'),
        el('button', { class: 'btn peligro', type: 'button', onclick: bloquear }, 'Bloquear')),
      el('p', { class: 'nota' }, 'Si le bloqueas, deja de ser tu amigo y no podrá encontrarte ni escribirte. No recibe ningún aviso.')));
}

/* ---------- 10e · Enlace de amigo (#/amigo/PKT-XXXX-XXXX) ---------- */

export async function vistaEnlaceAmigo(raiz, codigo) {
  poner(raiz, el('p', { class: 'nota centro' }, 'Cargando…'));
  let u;
  try { u = await peticion(`amigos.php?codigo=${encodeURIComponent(codigo)}`); }
  catch (e) {
    poner(raiz, el('section', { class: 'tarjeta centrada' }, el('b', { class: 'grande' }, 'Enlace no válido'), el('p', { class: 'sub' }, e.message),
      el('a', { class: 'btn sec', href: '#/' }, 'Ir a Poketon')));
    return;
  }

  const solicitar = async boton => {
    boton.disabled = true;
    try {
      const r = await peticion('amigos.php?accion=solicitar', { method: 'POST', body: { destino: u.codigo } });
      aviso(r.estado === 'aceptada' ? `${u.nombre} y tú ya sois amigos` : 'Solicitud enviada');
      actualizarResumen();
      location.hash = '#/amigos';
    } catch (e) { aviso(e.message, 'error'); boton.disabled = false; }
  };
  // Sin sesión: se guarda el código y la solicitud se manda sola al entrar (ver entrar() en cuenta.js)
  const entrarYSolicitar = destino => { sessionStorage.setItem('amigo-pendiente', u.codigo); location.hash = destino; };

  let accion;
  if (!sesion()) {
    accion = [
      el('button', { class: 'btn', type: 'button', onclick: () => entrarYSolicitar(localStorage.getItem('ha-entrado') ? '#/login' : '#/registro') }, 'Regístrate o inicia sesión'),
      el('p', { class: 'nota' }, 'Al entrar, la solicitud se envía sola.'),
    ];
  } else if (u.relacion === 'tu') {
    accion = [el('p', { class: 'msg info' }, 'Este es tu enlace de amigo. Pásaselo a quien quieras añadir.'), el('a', { class: 'btn sec', href: '#/amigos' }, 'Ir a Amigos')];
  } else if (u.relacion === 'amigos') {
    accion = [el('p', { class: 'msg ok' }, 'Ya sois amigos.'), el('a', { class: 'btn', href: `#/chat/${u.usuario}` }, 'Enviar mensaje')];
  } else if (u.relacion === 'enviada') {
    accion = [el('p', { class: 'msg info' }, 'Ya le has mandado una solicitud.'), el('a', { class: 'btn sec', href: '#/amigos' }, 'Ir a Amigos')];
  } else if (u.relacion === 'recibida') {
    accion = el('button', { class: 'btn', type: 'button', onclick: e => solicitar(e.currentTarget) }, 'Aceptar su solicitud');
  } else if (!u.acepta) {
    accion = el('p', { class: 'msg info' }, 'Ahora mismo no acepta solicitudes de amistad.');
  } else {
    accion = el('button', { class: 'btn', type: 'button', onclick: e => solicitar(e.currentTarget) }, 'Enviar solicitud de amistad');
  }

  poner(raiz,
    el('section', { class: 'tarjeta centrada' },
      avatarUsuario(u, 76),
      el('b', { class: 'grande' }, u.relacion === 'tu' ? 'Tu enlace de amigo' : `${u.nombre} te invita a ser su amigo`),
      el('span', { class: 'tenue' }, `@${u.usuario} · `, el('span', { class: 'mono' }, formatoCodigo(u.codigo))),
      el('p', { class: 'sub' }, 'Podréis chatear y pasaros equipos dentro de Poketon.'),
      accion));
}
