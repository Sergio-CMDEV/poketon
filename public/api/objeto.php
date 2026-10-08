<?php
/**
 * Pantalla "Objetos".
 *   GET /api/objeto.php          → los objetos más usados en los sets de Smogon de la Gen 9
 *   GET /api/objeto.php?id=197   → qué hace, Pokémon que lo llevan en sus sets y evoluciones que provoca
 * El nombre, la categoría y el icono ya los tiene el frontend en el catálogo.
 */
require __DIR__ . '/../../src/lib.php';

$id = filter_var($_GET['id'] ?? null, FILTER_VALIDATE_INT);

if (!$id) {
    // JSON_TABLE convierte la lista de objetos de cada set en filas para poder contarlas
    responder(['populares' => consulta(
        "SELECT j.id, COUNT(*) AS sets
           FROM set_competitivo s, JSON_TABLE(s.datos, '$.objetos[*]' COLUMNS (id INT PATH '$')) AS j
          WHERE s.generacion = 9
          GROUP BY j.id ORDER BY sets DESC LIMIT 24")]);
}

$o = consulta('SELECT id, descripcion FROM objeto WHERE id = ?', [$id])[0] ?? null;
if (!$o) error_api('Objeto no encontrado', 404);

responder([
    'id'          => (int) $o['id'],
    'descripcion' => $o['descripcion'],
    // Pokémon cuyos sets de Smogon llevan este objeto (los de la generación más reciente primero)
    'recomendados' => consulta(
        "SELECT pokemon_id, MAX(generacion) AS generacion, COUNT(*) AS sets,
                GROUP_CONCAT(DISTINCT formato ORDER BY formato SEPARATOR ',') AS formatos
           FROM set_competitivo
          WHERE JSON_CONTAINS(datos, ?, '$.objetos')
          GROUP BY pokemon_id ORDER BY generacion DESC, sets DESC LIMIT 12", [(string) $id]),
    // Evoluciones que necesitan este objeto (Piedra Trueno, Revestimiento Metálico…)
    'evoluciones' => consulta(
        'SELECT ev.detalle,
                (SELECT id FROM pokemon WHERE especie_id = ev.especie_origen_id AND predeterminado = 1 LIMIT 1) AS desde,
                (SELECT id FROM pokemon WHERE especie_id = ev.especie_destino_id AND predeterminado = 1 LIMIT 1) AS hacia
           FROM evolucion ev WHERE ev.objeto_id = ?', [$id]),
]);
