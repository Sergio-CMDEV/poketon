<?php
/**
 * Datos de Pokémon Añil para la app de escritorio.
 *   GET /api/anil.php → el mismo public/anil/datos.json, pero con CORS (la app llama desde otro origen).
 * La web los lee directamente de anil/datos.json. Si no están (no se ha lanzado scripts/anil.mjs o no se han
 * copiado al servidor), responde 404 y la opción "Pokémon Añil" no aparece.
 */
require __DIR__ . '/../../src/lib.php';

$archivo = __DIR__ . '/../anil/datos.json';
if (!is_file($archivo)) responder(['error' => 'No hay datos de Pokémon Añil'], 404);
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-cache');
readfile($archivo);
