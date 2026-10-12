// Pantalla 8c · "Editar imagen", como la de Discord: la foto con un círculo encima; se arrastra para colocarla
// y se hace zoom (barra, rueda, pellizcando o con + y −). Al aplicar, lo que hay dentro del círculo se dibuja
// en un canvas de 512 × 512 y se devuelve como WebP: el archivo original no sale del dispositivo.

import { el, ventana } from './ui.js';

export const TIPOS_FOTO = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
export const MAX_FOTO = 8 * 1024 * 1024;   // el archivo elegido; al servidor llega el recorte (≤ 1 MB)
const SALIDA = 512;
const ZOOM_MAX = 3;
const CIRCULO = 0.82;   // diámetro del círculo respecto al lado del recuadro

/** Abre la ventana de recorte. Devuelve un Blob (WebP o JPG) o null si se cancela. */
export async function recortarFoto(archivo) {
  if (!TIPOS_FOTO.includes(archivo.type)) throw new Error('Elige una imagen JPG, PNG, WebP o GIF');
  if (archivo.size > MAX_FOTO) throw new Error('La imagen pesa más de 8 MB');
  const img = await cargarImagen(archivo);
  const iw = img.width, ih = img.height;
  if (iw < 64 || ih < 64) throw new Error('La imagen es demasiado pequeña');

  return new Promise(resolver => {
    let resultado = null;
    let z = 1, x = 0, y = 0;     // zoom y desplazamiento del centro de la foto respecto al del círculo (px del recuadro)
    let lado = 0, diam = 0, base = 1;

    const lienzo = el('canvas', { class: 'recorte-lienzo', tabindex: '0', role: 'img',
      'aria-label': 'Foto. Arrástrala para colocarla; flechas para moverla, + y − para el zoom' });
    const zoom = el('input', { type: 'range', min: '1', max: String(ZOOM_MAX), step: '0.01', value: '1', 'aria-label': 'Zoom',
      oninput: () => zoomA(+zoom.value) });
    const previas = [88, 44, 32].map(t => el('canvas', { class: 'previa', width: t * 2, height: t * 2, style: { width: `${t}px`, height: `${t}px` } }));

    const medir = () => {
      const r = lienzo.getBoundingClientRect();
      lado = r.width;
      const dpr = window.devicePixelRatio || 1;
      lienzo.width = Math.round(lado * dpr);
      lienzo.height = Math.round(lado * dpr);
      diam = lado * CIRCULO;
      base = diam / Math.min(iw, ih);   // con zoom 1 el lado corto de la foto llena el círculo
      ajustar();
      pintar();
    };
    // Que el círculo quede siempre lleno de foto
    const ajustar = () => {
      const mx = (iw * base * z - diam) / 2, my = (ih * base * z - diam) / 2;
      x = Math.max(-mx, Math.min(mx, x));
      y = Math.max(-my, Math.min(my, y));
    };
    const zoomA = nuevo => {
      const n = Math.max(1, Math.min(ZOOM_MAX, nuevo));
      x *= n / z; y *= n / z;   // el punto del centro del círculo se queda en su sitio
      z = n;
      zoom.value = String(z);
      ajustar();
      pintar();
    };
    // Trozo de la foto (en px de la foto) que cae dentro del círculo
    const recorte = () => {
      const s = base * z;
      return [(iw * s / 2 - x - diam / 2) / s, (ih * s / 2 - y - diam / 2) / s, diam / s];
    };

    function pintar() {
      if (!lado) return;
      const c = lienzo.getContext('2d');
      const dpr = lienzo.width / lado;
      c.setTransform(dpr, 0, 0, dpr, 0, 0);
      c.fillStyle = '#1b2230';
      c.fillRect(0, 0, lado, lado);
      const s = base * z;
      c.imageSmoothingQuality = 'high';
      c.drawImage(img, lado / 2 + x - iw * s / 2, lado / 2 + y - ih * s / 2, iw * s, ih * s);
      // Fuera del círculo, oscurecido
      c.fillStyle = 'rgba(12, 16, 26, .62)';
      c.beginPath();
      c.rect(0, 0, lado, lado);
      c.arc(lado / 2, lado / 2, diam / 2, 0, Math.PI * 2, true);
      c.fill('evenodd');
      c.strokeStyle = '#ffffff';
      c.lineWidth = 2;
      c.beginPath();
      c.arc(lado / 2, lado / 2, diam / 2, 0, Math.PI * 2);
      c.stroke();
      const [sx, sy, sl] = recorte();
      for (const p of previas) {
        const pc = p.getContext('2d');
        pc.imageSmoothingQuality = 'high';
        pc.clearRect(0, 0, p.width, p.height);
        pc.drawImage(img, sx, sy, sl, sl, 0, 0, p.width, p.height);
      }
    }

    // Arrastrar (ratón o dedo) y pellizcar (dos dedos)
    const punteros = new Map();
    let distancia = 0;
    const dist = () => { const [a, b] = [...punteros.values()]; return Math.hypot(a.x - b.x, a.y - b.y); };
    lienzo.addEventListener('pointerdown', e => {
      lienzo.setPointerCapture(e.pointerId);
      punteros.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (punteros.size === 2) distancia = dist();
      lienzo.classList.add('arrastrando');
    });
    lienzo.addEventListener('pointermove', e => {
      const p = punteros.get(e.pointerId);
      if (!p) return;
      if (punteros.size === 1) {
        x += e.clientX - p.x; y += e.clientY - p.y;
        ajustar();
        pintar();
      }
      p.x = e.clientX; p.y = e.clientY;
      if (punteros.size === 2) {
        const d = dist();
        if (distancia) zoomA(z * d / distancia);
        distancia = d;
      }
    });
    const soltar = e => { punteros.delete(e.pointerId); distancia = 0; if (!punteros.size) lienzo.classList.remove('arrastrando'); };
    lienzo.addEventListener('pointerup', soltar);
    lienzo.addEventListener('pointercancel', soltar);
    lienzo.addEventListener('wheel', e => { e.preventDefault(); zoomA(z * Math.exp(-e.deltaY * 0.0015)); }, { passive: false });
    lienzo.addEventListener('keydown', e => {
      const paso = e.shiftKey ? 30 : 10;
      const mov = { ArrowLeft: [paso, 0], ArrowRight: [-paso, 0], ArrowUp: [0, paso], ArrowDown: [0, -paso] }[e.key];
      if (mov) { e.preventDefault(); x += mov[0]; y += mov[1]; ajustar(); pintar(); }
      else if (e.key === '+' || e.key === '=') { e.preventDefault(); zoomA(z + 0.1); }
      else if (e.key === '-') { e.preventDefault(); zoomA(z - 0.1); }
      else if (e.key === '0') { e.preventDefault(); restablecer(); }
    });
    const restablecer = () => { x = 0; y = 0; zoomA(1); };

    async function aplicar(cerrar, boton) {
      boton.disabled = true;
      const salida = el('canvas', { width: SALIDA, height: SALIDA });
      const c = salida.getContext('2d');
      c.fillStyle = '#ffffff';
      c.fillRect(0, 0, SALIDA, SALIDA);
      c.imageSmoothingQuality = 'high';
      const [sx, sy, sl] = recorte();
      c.drawImage(img, sx, sy, sl, sl, 0, 0, SALIDA, SALIDA);
      let blob = await new Promise(ok => salida.toBlob(ok, 'image/webp', 0.9));
      if (!blob || blob.type !== 'image/webp') blob = await new Promise(ok => salida.toBlob(ok, 'image/jpeg', 0.9));   // navegadores sin WebP
      resultado = blob;
      cerrar();
    }

    const icono = (t, grande) => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('width', t); svg.setAttribute('height', t); svg.setAttribute('viewBox', '0 0 24 24');
      svg.setAttribute('fill', 'none'); svg.setAttribute('stroke', 'currentColor'); svg.setAttribute('stroke-width', '2');
      svg.innerHTML = grande ? '<rect x="2" y="2" width="20" height="20" rx="3"/><path d="M2 17l6-6 4 4 3-3 7 7"/>'
        : '<rect x="5" y="5" width="14" height="14" rx="2"/><path d="M5 16l4-4 3 3 2-2 5 5"/>';
      return svg;
    };

    ventana(cerrar => [
      el('div', { class: 'recorte-caja' }, lienzo, el('span', { class: 'pista' }, '✥ Arrastra para colocarla')),
      el('div', { class: 'recorte-zoom' }, icono(16, false), zoom, icono(24, true)),
      el('div', { class: 'recorte-previas' }, el('span', { class: 'tenue' }, 'Así se verá:'), previas),
      el('p', { class: 'nota' }, 'Ratón: arrastra y usa la rueda para el zoom. Móvil: arrastra y pellizca. Teclado: flechas para mover, + y − para el zoom.'),
      el('div', { class: 'recorte-botones' },
        el('button', { class: 'enlace-btn', type: 'button', onclick: restablecer }, 'Restablecer'),
        el('button', { class: 'btn sec', type: 'button', onclick: cerrar }, 'Cancelar'),
        el('button', { class: 'btn', type: 'button', onclick: e => aplicar(cerrar, e.currentTarget) }, 'Aplicar')),
    ], { titulo: 'Editar imagen', clase: 'recorte', alCerrar: () => { window.removeEventListener('resize', medir); img.close?.(); resolver(resultado); } });

    window.addEventListener('resize', medir);
    requestAnimationFrame(() => { medir(); lienzo.focus(); });
  });
}

/** La imagen ya decodificada (de un GIF, el primer fotograma). */
async function cargarImagen(archivo) {
  if (window.createImageBitmap) {
    try { return await createImageBitmap(archivo); } catch { /* se prueba con <img> */ }
  }
  const url = URL.createObjectURL(archivo);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return img;
  } catch {
    throw new Error('No se pudo abrir la imagen');
  } finally {
    URL.revokeObjectURL(url);
  }
}
