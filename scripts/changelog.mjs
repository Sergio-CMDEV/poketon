// Genera CHANGELOG.md a partir de public/js/novedades.js (lo mismo que enseña la pantalla Novedades).
//   npm run changelog
import { writeFile } from 'node:fs/promises';
import { NOVEDADES, fechaCorta } from '../public/js/novedades.js';

const md = ['# Novedades de Poketon', '', 'Lo mismo que la pantalla "Novedades" de la app (sale de `public/js/novedades.js`).', '',
  ...NOVEDADES.flatMap(v => [`## ${v.version} · ${fechaCorta(v.fecha)}`, '', ...v.cambios.map(c => `- ${c}`), ''])].join('\n');
await writeFile(new URL('../CHANGELOG.md', import.meta.url), md);
console.log(`CHANGELOG.md: ${NOVEDADES.length} versiones`);
