<?php
/**
 * GET /api/pokemon.php?id=25
 * Ficha de un Pokémon: stats, EVs que da, habilidades, cadena evolutiva, movimientos que aprende
 * y sets competitivos de Smogon de cada generación.
 * Los tipos, formas y nombre ya los tiene el frontend en el catálogo.
 */
require __DIR__ . '/../../src/lib.php';

$id = filter_var($_GET['id'] ?? null, FILTER_VALIDATE_INT);
if (!$id) error_api('Falta el id del Pokémon');

$p = consulta('SELECT * FROM pokemon WHERE id = ?', [$id])[0] ?? null;
if (!$p) error_api('Pokémon no encontrado', 404);

$num = fn(array $campos) => array_map(fn($c) => (int) $p[$c], $campos);

// Cadena evolutiva con una consulta recursiva: sube hasta la especie raíz y baja recogiendo todas sus evoluciones
$evolucion = consulta(
    'WITH RECURSIVE
       subir AS (
         SELECT CAST(? AS UNSIGNED) AS especie_id
         UNION ALL
         SELECT ev.especie_origen_id FROM evolucion ev JOIN subir s ON ev.especie_destino_id = s.especie_id
       ),
       raiz AS (
         SELECT especie_id FROM subir s
          WHERE NOT EXISTS (SELECT 1 FROM evolucion ev WHERE ev.especie_destino_id = s.especie_id) LIMIT 1
       ),
       bajar AS (
         SELECT especie_id, CAST(NULL AS UNSIGNED) AS desde, 0 AS nivel FROM raiz
         UNION ALL
         SELECT DISTINCT ev.especie_destino_id, ev.especie_origen_id, b.nivel + 1
           FROM evolucion ev JOIN bajar b ON ev.especie_origen_id = b.especie_id
       )
     SELECT DISTINCT b.especie_id, b.desde, b.nivel,
            (SELECT id FROM pokemon WHERE especie_id = b.especie_id AND predeterminado = 1 LIMIT 1) AS pokemon_id
       FROM bajar b
      ORDER BY b.nivel, b.especie_id',
    [$p['especie_id']],
);

// Cómo se llega a cada eslabón: nivel, objeto (con su icono), amistad, intercambio…
$especies = array_column($evolucion, 'especie_id');
$como = [];
if ($especies) {
    $huecos = implode(',', array_fill(0, count($especies), '?'));
    foreach (consulta(
        "SELECT ev.especie_destino_id, ev.metodo, ev.nivel, ev.detalle, ev.objeto_id, o.nombre AS objeto
           FROM evolucion ev LEFT JOIN objeto o ON o.id = ev.objeto_id
          WHERE ev.especie_destino_id IN ($huecos)", $especies) as $m) {
        $como[$m['especie_destino_id']][] = $m;
    }
}
foreach ($evolucion as &$n) {
    $n['metodos'] = array_map(fn($m) => [
        'metodo'  => $m['metodo'],
        'nivel'   => $m['nivel'] === null ? null : (int) $m['nivel'],
        'detalle' => $m['detalle'],
        'objeto_id' => $m['objeto_id'] === null ? null : (int) $m['objeto_id'],
        'objeto'  => $m['objeto'],
    ], $como[$n['especie_id']] ?? []);
}
unset($n);

// Son datos del juego (solo cambian al importar): el navegador los guarda 1 hora.
// Si algo falla, la respuesta de error cambia esta cabecera por no-store.
header('Cache-Control: public, max-age=3600');
responder([
    'id'          => (int) $p['id'],
    'stats'       => $num(['ps', 'ataque', 'defensa', 'at_esp', 'def_esp', 'velocidad']),
    'evs'         => $num(['ev_ps', 'ev_ataque', 'ev_defensa', 'ev_at_esp', 'ev_def_esp', 'ev_velocidad']),
    'habilidades' => consulta(
        'SELECT h.id, h.nombre, h.descripcion, ph.oculta
           FROM pokemon_habilidad ph JOIN habilidad h ON h.id = ph.habilidad_id
          WHERE ph.pokemon_id = ? ORDER BY ph.slot', [$id]),
    'evolucion'   => $evolucion,
    'sets'        => array_map(fn($s) => ['generacion' => (int) $s['generacion'], 'formato' => $s['formato'],
                                         'nombre' => $s['nombre']] + json_decode($s['datos'], true),
        consulta('SELECT generacion, formato, nombre, datos FROM set_competitivo WHERE pokemon_id = ? ORDER BY generacion DESC, id', [$id])),
    'movimientos' => consulta(
        'SELECT movimiento_id AS id, metodo, nivel FROM pokemon_movimiento
          WHERE pokemon_id = ? ORDER BY metodo, nivel, movimiento_id', [$id]),
]);
