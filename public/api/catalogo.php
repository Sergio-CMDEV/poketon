<?php
/**
 * GET /api/catalogo.php
 * Todo lo que el frontend necesita cargar una vez: tipos, tabla de eficacias, lista de Pokémon
 * (para el buscador) y catálogos del editor (objetos, habilidades, naturalezas, movimientos).
 * El filtrado por generación, la búsqueda y los cálculos los hace JavaScript.
 */
require __DIR__ . '/../../src/lib.php';

$datos = [
    'tipos' => consulta('SELECT id, clave, nombre FROM tipo ORDER BY id'),

    // [atacante, defensor, gen_desde, gen_hasta, multiplicador] — solo los cruces distintos de ×1
    'eficacia' => array_map(fn($r) => [$r['a'], $r['d'], (int) $r['gen_desde'], $r['gen_hasta'] === null ? null : (int) $r['gen_hasta'], (float) $r['multiplicador']],
        consulta('SELECT a.clave a, d.clave d, e.gen_desde, e.gen_hasta, e.multiplicador
                    FROM eficacia e JOIN tipo a ON a.id = e.tipo_atacante_id JOIN tipo d ON d.id = e.tipo_defensor_id')),

    'pokemon' => consulta(
        "SELECT p.id, p.especie_id, e.nombre, e.nombre_en, p.identificador, p.forma, p.predeterminado, e.generacion, e.rareza,
                GROUP_CONCAT(CONCAT_WS(':', t.clave, pt.slot, pt.gen_desde, IFNULL(pt.gen_hasta, '')) ORDER BY pt.slot, pt.gen_desde) AS tipos
           FROM pokemon p
           JOIN especie e ON e.id = p.especie_id
           JOIN pokemon_tipo pt ON pt.pokemon_id = p.id
           JOIN tipo t ON t.id = pt.tipo_id
          GROUP BY p.id
          ORDER BY e.id, p.predeterminado DESC, p.id"),

    'objetos'     => consulta('SELECT id, nombre, nombre_en, identificador, icono, imagen, categoria, descripcion IS NOT NULL AS con_info FROM objeto ORDER BY nombre'),
    'habilidades' => consulta('SELECT id, nombre, nombre_en FROM habilidad ORDER BY nombre'),
    'naturalezas' => consulta('SELECT id, nombre, nombre_en, stat_sube, stat_baja FROM naturaleza ORDER BY nombre'),
    'movimientos' => consulta('SELECT m.id, m.nombre, m.nombre_en, t.clave AS tipo, m.categoria, m.potencia, m.precision_pct AS `precision`, m.pp
                                 FROM movimiento m JOIN tipo t ON t.id = m.tipo_id ORDER BY m.nombre'),

    'google_client_id' => $CONFIG['google_client_id'] ?? '',
];

// El navegador (y la app de escritorio) guarda una copia, pero pregunta siempre si ha cambiado (ETag): si no, la
// respuesta es un 304 sin datos. Antes se guardaba 1 hora sin preguntar y, al cambiar config.php (p. ej. al poner
// el google_client_id), la app seguía hasta una hora con el botón de Google desactivado.
$json = json_encode($datos, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
$etag = '"' . md5($json) . '"';
header('Cache-Control: no-cache');
header("ETag: $etag");
// nginx, al comprimir, la cambia por W/"…" (débil): se aceptan las dos
$recibidas = array_map(fn($e) => preg_replace('#^W/#', '', trim($e)), explode(',', $_SERVER['HTTP_IF_NONE_MATCH'] ?? ''));
if (in_array($etag, $recibidas, true)) { http_response_code(304); exit; }
header('Content-Type: application/json; charset=utf-8');
echo $json;
