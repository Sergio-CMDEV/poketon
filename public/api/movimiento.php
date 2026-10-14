<?php
/**
 * Pantalla "Movimientos".
 *   GET /api/movimiento.php          → los movimientos más usados en los sets de Smogon de la Gen 9
 *   GET /api/movimiento.php?id=89    → qué hace, Pokémon que lo usan en sus sets y quién lo aprende (y cómo)
 * El nombre, el tipo, la categoría, la potencia, la precisión y los PP ya los tiene el frontend en el catálogo.
 */
require __DIR__ . '/../../src/lib.php';

$id = filter_var($_GET['id'] ?? null, FILTER_VALIDATE_INT);

// En los sets, "movimientos" es una lista de huecos y cada hueco una lista de opciones: [[89], [282, 369], …]
const MOVS_DE_LOS_SETS = "JSON_TABLE(s.datos, '$.movimientos[*]' COLUMNS (NESTED PATH '$[*]' COLUMNS (id INT PATH '$'))) AS j";

// Son datos del juego (solo cambian al importar): el navegador los guarda 1 hora
header('Cache-Control: public, max-age=3600');

if (!$id) {
    responder(['populares' => consulta(
        'SELECT j.id, COUNT(DISTINCT s.id) AS sets FROM set_competitivo s, ' . MOVS_DE_LOS_SETS . '
          WHERE s.generacion = 9 GROUP BY j.id ORDER BY sets DESC LIMIT 30')]);
}

$m = consulta('SELECT id, descripcion FROM movimiento WHERE id = ?', [$id])[0] ?? null;
if (!$m) error_api('Movimiento no encontrado', 404);

responder([
    'id'          => (int) $m['id'],
    'descripcion' => $m['descripcion'],
    // Pokémon cuyos sets de Smogon lo llevan (los de la generación más reciente primero)
    'recomendados' => consulta(
        'SELECT s.pokemon_id, MAX(s.generacion) AS generacion, COUNT(DISTINCT s.id) AS sets,
                GROUP_CONCAT(DISTINCT s.formato ORDER BY s.formato SEPARATOR \',\') AS formatos
           FROM set_competitivo s, ' . MOVS_DE_LOS_SETS . '
          WHERE j.id = ? GROUP BY s.pokemon_id ORDER BY generacion DESC, sets DESC LIMIT 12', [$id]),
    // Quién lo aprende y cómo (en algún juego). El frontend los agrupa por forma de aprenderlo
    'aprenden' => array_map(fn($a) => ['id' => (int) $a['pokemon_id'], 'metodo' => $a['metodo'],
                                       'nivel' => $a['nivel'] === null ? null : (int) $a['nivel']],
        consulta('SELECT pokemon_id, metodo, nivel FROM pokemon_movimiento WHERE movimiento_id = ? ORDER BY pokemon_id', [$id])),
]);
