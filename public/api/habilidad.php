<?php
/**
 * Pantalla "Habilidades".
 *   GET /api/habilidad.php          → las habilidades más usadas en los sets de Smogon de la Gen 9
 *   GET /api/habilidad.php?id=26    → qué hace, qué Pokémon la pueden tener (normal u oculta) y quién la lleva en sus sets
 * El nombre (en español y en inglés) ya lo tiene el frontend en el catálogo.
 */
require __DIR__ . '/../../src/lib.php';

$id = filter_var($_GET['id'] ?? null, FILTER_VALIDATE_INT);

// Son datos del juego (solo cambian al importar): el navegador los guarda 1 hora
header('Cache-Control: public, max-age=3600');

if (!$id) {
    responder(['populares' => consulta(
        "SELECT j.id, COUNT(*) AS sets
           FROM set_competitivo s, JSON_TABLE(s.datos, '$.habilidades[*]' COLUMNS (id INT PATH '$')) AS j
          WHERE s.generacion = 9
          GROUP BY j.id ORDER BY sets DESC LIMIT 30")]);
}

$h = consulta('SELECT id, descripcion FROM habilidad WHERE id = ?', [$id])[0] ?? null;
if (!$h) error_api('Habilidad no encontrada', 404);

responder([
    'id'          => (int) $h['id'],
    'descripcion' => $h['descripcion'],
    // Quién la puede tener y si es su habilidad oculta (un Pokémon puede tenerla de las dos formas en formas distintas)
    'pokemon'     => array_map(fn($p) => ['id' => (int) $p['pokemon_id'], 'oculta' => (bool) $p['oculta']],
        consulta('SELECT pokemon_id, oculta FROM pokemon_habilidad WHERE habilidad_id = ? ORDER BY pokemon_id', [$id])),
    // Pokémon cuyos sets de Smogon la llevan (los de la generación más reciente primero)
    'recomendados' => consulta(
        "SELECT pokemon_id, MAX(generacion) AS generacion, COUNT(*) AS sets,
                GROUP_CONCAT(DISTINCT formato ORDER BY formato SEPARATOR ',') AS formatos
           FROM set_competitivo
          WHERE JSON_CONTAINS(datos, ?, '$.habilidades')
          GROUP BY pokemon_id ORDER BY generacion DESC, sets DESC LIMIT 12", [(string) $id]),
]);
