// Copia el frontend (public/ sin la carpeta api) a dist/ para meterlo en el .exe.
// La app de escritorio llama a la API publicada (API_PUBLICADA en public/js/api.js).
// Para probar el .exe contra otra API (p. ej. el php -S de tu PC), compila con la variable POKETON_API:
//   PowerShell:  $env:POKETON_API = "http://localhost:8000/api"; npm run build
// No se copia public/anil/: son datos del juego Pokémon Añil, solo para uso personal.
// Ni public/fotos/: son las fotos de perfil subidas al servidor (la app las pide al servidor).
import { rm, cp, readFile, writeFile } from 'node:fs/promises';

await rm('dist', { recursive: true, force: true });
await cp('public', 'dist', { recursive: true, filter: ruta => !/[\\/](api|anil|fotos)([\\/]|$)/.test(ruta) });

const api = process.env.POKETON_API;
if (api) {
  const archivo = 'dist/js/api.js';
  const js = await readFile(archivo, 'utf8');
  await writeFile(archivo, js.replace(/const API_PUBLICADA = '[^']*';/, `const API_PUBLICADA = '${api.replace(/'/g, '')}';`));
  console.log(`dist/ listo (API: ${api})`);
} else console.log('dist/ listo');
