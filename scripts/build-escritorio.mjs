// Copia el frontend (public/ sin la carpeta api) a dist/ para meterlo en el .exe.
// La app de escritorio llama a la API publicada (API_PUBLICADA en public/js/api.js).
// Para probar el .exe contra otra API (p. ej. el php -S de tu PC), compila con la variable POKETON_API:
//   PowerShell:  $env:POKETON_API = "http://localhost:8000/api"; npm run build
// No se copia public/anil/: la app pide los datos y sprites de Pokémon Añil al servidor (así el .exe pesa poco).
// Ni public/fotos/: son las fotos de perfil subidas al servidor (la app las pide al servidor).
import { rm, cp, readFile, writeFile } from 'node:fs/promises';

// La versión que se ve en la app (public/js/version.js) tiene que ser la del instalador (tauri.conf.json)
const conf = JSON.parse(await readFile('src-tauri/tauri.conf.json', 'utf8'));
const visible = (await readFile('public/js/version.js', 'utf8')).match(/VERSION = '([^']+)'/)?.[1];
if (visible !== conf.version) {
  console.error(`La versión de public/js/version.js (${visible}) no es la de src-tauri/tauri.conf.json (${conf.version}). Pon la misma en los dos.`);
  process.exit(1);
}

await rm('dist', { recursive: true, force: true });
await cp('public', 'dist', { recursive: true, filter: ruta => !/[\\/](api|anil|fotos)([\\/]|$)/.test(ruta) });

const api = process.env.POKETON_API;
if (api) {
  const archivo = 'dist/js/api.js';
  const js = await readFile(archivo, 'utf8');
  await writeFile(archivo, js.replace(/const API_PUBLICADA = '[^']*';/, `const API_PUBLICADA = '${api.replace(/'/g, '')}';`));
  console.log(`dist/ listo (API: ${api})`);
} else console.log('dist/ listo');
