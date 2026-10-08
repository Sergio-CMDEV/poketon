<?php
/**
 * Poketon · Importador de datos
 *
 * Descarga los CSV de PokeAPI (https://github.com/PokeAPI/pokeapi) y llena las tablas
 * de datos del juego. No toca las tablas de usuarios ni equipos.
 *
 * Uso:  php import.php
 * Requiere: PHP 8.1+, extensión pdo_mysql y config.php en la raíz (copia de config.example.php).
 */

declare(strict_types=1);

const CSV_URL  = 'https://raw.githubusercontent.com/PokeAPI/pokeapi/master/data/v2/csv/';
const SETS_URL = 'https://raw.githubusercontent.com/pkmn/smogon/main/data/sets/';   // sets de Smogon por generación
const CACHE    = __DIR__ . '/cache';   // los CSV se guardan aquí para no descargarlos cada vez
const ES       = '7';                  // id del idioma español en PokeAPI
const EN       = '9';
const LOTE     = 500;                  // filas por INSERT

$config = require __DIR__ . '/../config.php';   // configuración compartida en la raíz del proyecto
foreach (['pdo_mysql', 'mbstring', 'openssl'] as $ext) {
    if (!extension_loaded($ext)) exit("Falta activar la extensión $ext en php.ini (quita el ; de la línea extension=$ext)\n");
}

$pdo = new PDO(
    "mysql:host={$config['host']};port={$config['port']};dbname={$config['database']};charset=utf8mb4",
    $config['user'],
    $config['password'],
    [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION],
);

$inicio = microtime(true);

/* ======================================================================
   Utilidades
   ====================================================================== */

/** Descarga un CSV de PokeAPI (o lo lee de la caché) y devuelve sus filas como arrays asociativos. */
function csv(string $nombre): Generator
{
    if (!is_dir(CACHE)) mkdir(CACHE, 0775, true);
    $ruta = CACHE . "/$nombre.csv";
    if (!is_file($ruta)) {
        echo "  descargando $nombre.csv\n";
        $datos = file_get_contents(CSV_URL . "$nombre.csv");
        if ($datos === false) throw new RuntimeException("No se pudo descargar $nombre.csv");
        file_put_contents($ruta, $datos);
    }
    $f = fopen($ruta, 'r');
    $cabecera = fgetcsv($f, escape: '');
    while (($fila = fgetcsv($f, escape: '')) !== false) {
        if (count($fila) === count($cabecera)) yield array_combine($cabecera, $fila);
    }
    fclose($f);
}

/** Tabla id → nombre en un idioma (p. ej. type_names, item_names). */
function nombres(string $tabla, string $campoId, string $idioma = ES): array
{
    $out = [];
    foreach (csv($tabla) as $r) if ($r['local_language_id'] === $idioma) $out[$r[$campoId]] = $r['name'];
    return $out;
}

/** Último texto de descripción en español de cada id (el de la versión más reciente). */
function descripciones(string $tabla, string $campoId, string $campoTexto = 'flavor_text', string $idioma = ES): array
{
    $out = [];
    $version = [];
    foreach (csv($tabla) as $r) {
        if ($r['language_id'] !== $idioma) continue;
        $v = (int) $r['version_group_id'];
        if (!isset($version[$r[$campoId]]) || $v > $version[$r[$campoId]]) {
            $version[$r[$campoId]] = $v;
            $out[$r[$campoId]] = preg_replace('/\s+/u', ' ', $r[$campoTexto]);
        }
    }
    return $out;
}

/** Descarga un archivo de datos de Pokémon Showdown (o lo lee de la caché). */
/** Descarga un archivo una vez y lo guarda en db/cache. Si no se puede, devuelve '' (el importador sigue). */
function descargar(string $nombre, string $url): string
{
    $cache = CACHE . "/$nombre";
    if (!is_file($cache)) {
        echo "  descargando $nombre\n";
        $datos = @file_get_contents($url);
        if ($datos === false) { echo "  aviso: no se pudo descargar $nombre\n"; return ''; }
        file_put_contents($cache, $datos);
    }
    return file_get_contents($cache);
}

function showdown(string $ruta): string
{
    $cache = CACHE . '/showdown-' . str_replace('/', '-', $ruta);
    if (!is_file($cache)) {
        echo "  descargando $ruta de Pokémon Showdown\n";
        $datos = file_get_contents('https://raw.githubusercontent.com/smogon/pokemon-showdown/master/data/' . $ruta);
        if ($datos === false) throw new RuntimeException("No se pudo descargar $ruta");
        file_put_contents($cache, $datos);
    }
    return file_get_contents($cache);
}

/** Inserta muchas filas por lotes con sentencias preparadas. */
function insertar(PDO $pdo, string $tabla, array $columnas, iterable $filas): int
{
    $total = 0;
    $lote = [];
    $hueco = '(' . implode(',', array_fill(0, count($columnas), '?')) . ')';
    $flush = function () use ($pdo, $tabla, $columnas, $hueco, &$lote, &$total) {
        if (!$lote) return;
        $sql = "INSERT INTO $tabla (" . implode(',', $columnas) . ') VALUES '
             . implode(',', array_fill(0, count($lote), $hueco));
        $pdo->prepare($sql)->execute(array_merge(...$lote));
        $total += count($lote);
        $lote = [];
    };
    foreach ($filas as $fila) {
        $lote[] = $fila;
        if (count($lote) >= LOTE) $flush();
    }
    $flush();
    printf("  %-20s %6d filas\n", $tabla, $total);
    return $total;
}

$nulo = fn($v) => ($v === '' ? null : $v);

/* ======================================================================
   Vaciar las tablas de datos del juego
   ====================================================================== */

echo "Vaciando tablas de datos…\n";
$pdo->exec('SET FOREIGN_KEY_CHECKS = 0');
foreach (['set_competitivo', 'evolucion', 'pokemon_movimiento', 'pokemon_habilidad', 'pokemon_tipo', 'pokemon', 'especie',
          'movimiento', 'habilidad', 'objeto', 'naturaleza', 'eficacia', 'tipo'] as $t) {
    $pdo->exec("TRUNCATE TABLE $t");
}
$pdo->exec('SET FOREIGN_KEY_CHECKS = 1');

$pdo->beginTransaction();
echo "Importando…\n";

/* ======================================================================
   Tipos y eficacias
   ====================================================================== */

$nombreTipo = nombres('type_names', 'type_id');
$genTipo = [];   // generación en la que aparece cada tipo (Siniestro y Acero: 2, Hada: 6)
$identTipo = []; // id → 'fire', 'water'… (para el icono de las MT)
$tipos = [];
foreach (csv('types') as $r) {
    if ((int) $r['id'] > 18) continue;   // fuera ??? , Sombra, Astral
    $genTipo[$r['id']] = (int) $r['generation_id'];
    $identTipo[$r['id']] = $r['identifier'];
    $tipos[] = [$r['id'], strtoupper($r['identifier']), $nombreTipo[$r['id']] ?? $r['identifier']];
}
insertar($pdo, 'tipo', ['id', 'clave', 'nombre'], $tipos);

// type_efficacy_past dice "hasta la generación N el multiplicador era X".
$pasado = [];
foreach (csv('type_efficacy_past') as $r) {
    $pasado["{$r['damage_type_id']}-{$r['target_type_id']}"][] = [(int) $r['generation_id'], (int) $r['damage_factor']];
}

$eficacias = function () use ($genTipo, $pasado) {
    foreach (csv('type_efficacy') as $r) {
        $a = $r['damage_type_id'];
        $d = $r['target_type_id'];
        if (!isset($genTipo[$a], $genTipo[$d])) continue;
        $desde = max($genTipo[$a], $genTipo[$d]);   // el cruce no existe antes que sus tipos
        $tramos = $pasado["$a-$d"] ?? [];
        usort($tramos, fn($x, $y) => $x[0] <=> $y[0]);
        foreach ($tramos as [$hasta, $factor]) {
            if ($hasta >= $desde && $factor !== 100) yield [$a, $d, $desde, $hasta, $factor / 100];
            $desde = max($desde, $hasta + 1);
        }
        if ((int) $r['damage_factor'] !== 100) yield [$a, $d, $desde, null, $r['damage_factor'] / 100];
    }
};
insertar($pdo, 'eficacia', ['tipo_atacante_id', 'tipo_defensor_id', 'gen_desde', 'gen_hasta', 'multiplicador'], $eficacias());

/* ======================================================================
   Especies y Pokémon
   ====================================================================== */

$nombreEspecie = nombres('pokemon_species_names', 'pokemon_species_id');
$especies = [];
foreach (csv('pokemon_species') as $r) {
    $especies[$r['id']] = $r;
}
$nombreEspecieEn = nombres('pokemon_species_names', 'pokemon_species_id', EN);
insertar($pdo, 'especie', ['id', 'nombre', 'nombre_en', 'generacion', 'rareza'], (function () use ($especies, $nombreEspecie, $nombreEspecieEn) {
    foreach ($especies as $id => $r) yield [$id, $nombreEspecie[$id] ?? $r['identifier'], $nombreEspecieEn[$id] ?? $r['identifier'], $r['generation_id'],
        $r['is_legendary'] === '1' ? 'legendario' : ($r['is_mythical'] === '1' ? 'singular' : null)];
})());

// Stats: stat_id 1-6 = PS, Ataque, Defensa, At. Esp., Def. Esp., Velocidad
$stats = [];
foreach (csv('pokemon_stats') as $r) {
    $i = (int) $r['stat_id'];
    if ($i >= 1 && $i <= 6) {
        $stats[$r['pokemon_id']]['base'][$i] = (int) $r['base_stat'];
        $stats[$r['pokemon_id']]['ev'][$i] = (int) $r['effort'];
    }
}

const ETIQUETAS_FORMA = ['mega' => 'Mega', 'mega-x' => 'Mega X', 'mega-y' => 'Mega Y', 'alola' => 'Alola',
                         'galar' => 'Galar', 'hisui' => 'Hisui', 'paldea' => 'Paldea', 'primal' => 'Primigenio'];
const FORMAS_IGNORADAS = ['gmax', 'totem', 'cap', 'starter'];

$pokemonIds = [];
insertar($pdo, 'pokemon', ['id', 'especie_id', 'identificador', 'forma', 'predeterminado', 'ps', 'ataque', 'defensa', 'at_esp',
    'def_esp', 'velocidad', 'ev_ps', 'ev_ataque', 'ev_defensa', 'ev_at_esp', 'ev_def_esp', 'ev_velocidad'],
    (function () use ($especies, $stats, &$pokemonIds) {
        foreach (csv('pokemon') as $r) {
            $esp = $especies[$r['species_id']] ?? null;
            $s = $stats[$r['id']] ?? null;
            if (!$esp || !$s) continue;
            $forma = null;
            if ($r['is_default'] !== '1') {
                foreach (FORMAS_IGNORADAS as $x) if (str_contains($r['identifier'], $x)) continue 2;
                $sufijo = str_starts_with($r['identifier'], $esp['identifier'] . '-')
                    ? substr($r['identifier'], strlen($esp['identifier']) + 1) : $r['identifier'];
                $forma = ETIQUETAS_FORMA[$sufijo] ?? ucwords(str_replace('-', ' ', $sufijo));
            }
            $pokemonIds[$r['id']] = true;
            yield [$r['id'], $r['species_id'], $r['identifier'], $forma, $r['is_default'] === '1' ? 1 : 0,
                   ...array_values($s['base']), ...array_values($s['ev'])];
        }
    })());

// Tipos de cada Pokémon. pokemon_types_past dice "hasta la generación N tenía estos tipos".
$tiposPasados = [];
foreach (csv('pokemon_types_past') as $r) $tiposPasados[$r['pokemon_id']][(int) $r['generation_id']][] = $r;

insertar($pdo, 'pokemon_tipo', ['pokemon_id', 'slot', 'gen_desde', 'gen_hasta', 'tipo_id'],
    (function () use ($pokemonIds, $tiposPasados) {
        foreach (csv('pokemon_types') as $r) {
            if (!isset($pokemonIds[$r['pokemon_id']])) continue;
            $desde = 1;
            $historial = $tiposPasados[$r['pokemon_id']] ?? [];
            ksort($historial);
            foreach ($historial as $hasta => $antiguos) {
                foreach ($antiguos as $a) if ($a['slot'] === $r['slot']) yield [$r['pokemon_id'], $a['slot'], $desde, $hasta, $a['type_id']];
                $desde = $hasta + 1;
            }
            yield [$r['pokemon_id'], $r['slot'], $desde, null, $r['type_id']];
        }
    })());

/* ======================================================================
   Habilidades
   ====================================================================== */

$nombreHabilidad = nombres('ability_names', 'ability_id');
$nombreHabilidadEn = nombres('ability_names', 'ability_id', EN);
$descHabilidad = descripciones('ability_flavor_text', 'ability_id');
$habilidades = [];
foreach (csv('abilities') as $r) {
    if ($r['is_main_series'] !== '1') continue;
    $habilidades[$r['id']] = [$r['id'], $nombreHabilidad[$r['id']] ?? $nombreHabilidadEn[$r['id']] ?? $r['identifier'],
                              $nombreHabilidadEn[$r['id']] ?? $r['identifier'], $descHabilidad[$r['id']] ?? null];
}
insertar($pdo, 'habilidad', ['id', 'nombre', 'nombre_en', 'descripcion'], $habilidades);

insertar($pdo, 'pokemon_habilidad', ['pokemon_id', 'slot', 'habilidad_id', 'oculta'],
    (function () use ($pokemonIds, $habilidades) {
        foreach (csv('pokemon_abilities') as $r) {
            if (isset($pokemonIds[$r['pokemon_id']], $habilidades[$r['ability_id']])) {
                yield [$r['pokemon_id'], $r['slot'], $r['ability_id'], $r['is_hidden'] === '1' ? 1 : 0];
            }
        }
    })());

/* ======================================================================
   Movimientos
   ====================================================================== */

$nombreMov = nombres('move_names', 'move_id');
$nombreMovEn = nombres('move_names', 'move_id', EN);
$descMov = descripciones('move_flavor_text', 'move_id');
$categoria = ['1' => 'estado', '2' => 'fisico', '3' => 'especial'];
$movIds = [];
insertar($pdo, 'movimiento', ['id', 'nombre', 'nombre_en', 'tipo_id', 'categoria', 'potencia', 'precision_pct', 'pp', 'descripcion'],
    (function () use ($nombreMov, $nombreMovEn, $descMov, $categoria, $genTipo, $nulo, &$movIds) {
        foreach (csv('moves') as $r) {
            if ((int) $r['id'] >= 10000 || !isset($genTipo[$r['type_id']], $categoria[$r['damage_class_id']])) continue;
            $movIds[$r['id']] = true;
            yield [$r['id'], $nombreMov[$r['id']] ?? $r['identifier'], $nombreMovEn[$r['id']] ?? $r['identifier'], $r['type_id'], $categoria[$r['damage_class_id']],
                   $nulo($r['power']), $nulo($r['accuracy']), $r['pp'] === '' ? 0 : $r['pp'], $descMov[$r['id']] ?? null];
        }
    })());

// Qué puede aprender cada Pokémon en algún juego. Se queda con el nivel más reciente.
$metodo = ['1' => 'nivel', '2' => 'huevo', '3' => 'tutor', '4' => 'mt'];
$aprende = [];
foreach (csv('pokemon_moves') as $r) {
    if (!isset($pokemonIds[$r['pokemon_id']], $movIds[$r['move_id']])) continue;
    $m = $metodo[$r['pokemon_move_method_id']] ?? 'otro';
    $k = "{$r['pokemon_id']}-{$r['move_id']}-$m";
    $vg = (int) $r['version_group_id'];
    if (!isset($aprende[$k]) || $vg > $aprende[$k][4]) {
        $aprende[$k] = [$r['pokemon_id'], $r['move_id'], $m, $m === 'nivel' ? (int) $r['level'] : null, $vg];
    }
}
insertar($pdo, 'pokemon_movimiento', ['pokemon_id', 'movimiento_id', 'metodo', 'nivel'],
    (function () use (&$aprende) { foreach ($aprende as $a) yield array_slice($a, 0, 4); })());
unset($aprende);

/* ======================================================================
   Objetos y naturalezas
   ====================================================================== */

$nombreObjeto = nombres('item_names', 'item_id');
$nombreObjetoEn = nombres('item_names', 'item_id', EN);
$descObjeto = descripciones('item_flavor_text', 'item_id', 'flavor_text');
$descObjetoEn = descripciones('item_flavor_text', 'item_id', 'flavor_text', EN);

// Categoría para la pantalla de objetos, a partir de la categoría y el bolsillo de PokeAPI
const CATEGORIA_OBJETO = [
    'held-items' => 'Equipables', 'choice' => 'Equipables', 'type-enhancement' => 'Equipables', 'bad-held-items' => 'Equipables',
    'plates' => 'Equipables', 'species-specific' => 'Equipables', 'jewels' => 'Equipables', 'scarves' => 'Equipables',
    'memories' => 'Equipables', 'effort-training' => 'Equipables', 'training' => 'Equipables',
    'mega-stones' => 'Megapiedras', 'z-crystals' => 'Cristales Z', 'evolution' => 'Evolución',
    'standard-balls' => 'Poké Balls', 'special-balls' => 'Poké Balls', 'apricorn-balls' => 'Poké Balls',
    'all-machines' => 'MT', 'stat-boosts' => 'Combate', 'flutes' => 'Combate',
];
const CATEGORIA_BOLSILLO = ['2' => 'Medicinas', '5' => 'Bayas'];   // bolsillos de PokeAPI: 2 = medicinas, 5 = bayas
// Descripción para objetos que PokeAPI no tiene en español y que solo sirven para una cosa
const DESC_CATEGORIA = [
    'tm-materials' => 'Material que sueltan los Pokémon salvajes. Sirve para fabricar MT (Escarlata y Púrpura).',
    'tera-shard' => 'Teralito. Con 50 del mismo tipo se puede cambiar el teratipo de un Pokémon (Escarlata y Púrpura).',
    'sandwich-ingredients' => 'Ingrediente para preparar bocadillos en los picnics (Escarlata y Púrpura).',
    'picnic' => 'Objeto para los picnics (Escarlata y Púrpura).',
    'curry-ingredients' => 'Ingrediente para cocinar curris en el campamento (Espada y Escudo).',
];
// Objetos nuevos que PokeAPI aún no tiene en español: descripción propia (por nombre en inglés)
const DESC_PROPIA = [
    'Malicious Armor' => 'Armadura impregnada de malicia. Hace evolucionar a Charcadet en Ceruledge.',
    'Booster Energy' => 'Activa las habilidades Paleosíntesis o Carga Cuark del Pokémon que la lleva. Se gasta al usarse.',
    'Ability Shield' => 'Impide que la habilidad del Pokémon que lo lleva se cambie, se anule o se ignore.',
    'Clear Amulet' => 'Impide que otros Pokémon reduzcan las características del Pokémon que lo lleva.',
    'Mirror Herb' => 'Si un rival sube alguna característica, el Pokémon que la lleva copia esa subida. Se gasta al usarse.',
    'Punching Glove' => 'Potencia un 10 % los movimientos de puño del Pokémon que lo lleva y hace que no sean de contacto.',
    'Covert Cloak' => 'Protege al Pokémon que la lleva de los efectos secundarios de los movimientos rivales.',
    'Loaded Dice' => 'Los movimientos que golpean de 2 a 5 veces aciertan casi siempre 4 o 5 veces.',
    'Fairy Feather' => 'Potencia un 20 % los movimientos de tipo Hada del Pokémon que la lleva.',
    'Wellspring Mask' => 'Máscara de Ogerpon. Lo convierte en Ogerpon Fuente (Planta/Agua) y potencia sus movimientos un 20 %.',
    'Hearthflame Mask' => 'Máscara de Ogerpon. Lo convierte en Ogerpon Horno (Planta/Fuego) y potencia sus movimientos un 20 %.',
    'Cornerstone Mask' => 'Máscara de Ogerpon. Lo convierte en Ogerpon Cimiento (Planta/Roca) y potencia sus movimientos un 20 %.',
    'Teal Mask' => 'Máscara turquesa de Ogerpon. Con ella es de tipo Planta.',
    'Syrupy Apple' => 'Manzana bañada en almíbar. Hace evolucionar a Applin en Dipplin.',
    'Unremarkable Teacup' => 'Cuenco corriente. Hace evolucionar a Poltchageist (forma Fraudulenta) en Sinistcha.',
    'Masterpiece Teacup' => 'Cuenco de gran valor. Hace evolucionar a Poltchageist (forma Opulenta) en Sinistcha.',
    'Metal Alloy' => 'Metal hecho de varias aleaciones. Hace evolucionar a Duraludon en Archaludon.',
    'Black Augurite' => 'Piedra negra y cristalina. Hace evolucionar a Scyther en Kleavor.',
    'Peat Block' => 'Bloque de turba. Hace evolucionar a Ursaring en Ursaluna en las noches de luna llena.',
    'Linking Cord' => 'Hace evolucionar a los Pokémon que evolucionan por intercambio, sin tener que intercambiarlos.',
    'Scroll of Darkness' => 'Pergamino que hace evolucionar a Kubfu en Urshifu Estilo Brusco.',
    'Scroll of Waters' => 'Pergamino que hace evolucionar a Kubfu en Urshifu Estilo Fluido.',
    'Blank Plate' => 'Tabla sin grabados, relacionada con el tipo Normal (Leyendas: Arceus).',
    'Legend Plate' => 'Si la lleva Arceus, Sentencia cambia al tipo que más daño haga al rival (Leyendas: Arceus).',
    'Tera Orb' => 'Orbe que permite teracristalizar a un Pokémon. Se recarga en los Centros Pokémon.',
    'Glimmering Charm' => 'Amuleto que hace conseguir más teralitos en las teraincursiones.',
    'Health Mochi' => 'Mochi que sube los puntos de esfuerzo (EVs) de PS de un Pokémon.',
    'Muscle Mochi' => 'Mochi que sube los puntos de esfuerzo (EVs) de Ataque de un Pokémon.',
    'Resist Mochi' => 'Mochi que sube los puntos de esfuerzo (EVs) de Defensa de un Pokémon.',
    'Genius Mochi' => 'Mochi que sube los puntos de esfuerzo (EVs) de Ataque Especial de un Pokémon.',
    'Clever Mochi' => 'Mochi que sube los puntos de esfuerzo (EVs) de Defensa Especial de un Pokémon.',
    'Swift Mochi' => 'Mochi que sube los puntos de esfuerzo (EVs) de Velocidad de un Pokémon.',
    'Strange Ball' => 'Ball que aparece cuando el Pokémon se atrapó con una Ball que no existe en el juego actual.',
    'Poké Ball' => 'Ball para atrapar Pokémon salvajes (Leyendas: Arceus).',
    'Great Ball' => 'Ball de buen rendimiento: atrapa mejor que la Poké Ball (Leyendas: Arceus).',
    'Ultra Ball' => 'Ball de alto rendimiento: atrapa mejor que la Super Ball (Leyendas: Arceus).',
    'Heavy Ball' => 'Llega menos lejos, pero funciona mejor si el Pokémon no ha visto al jugador (Leyendas: Arceus).',
    'Leaden Ball' => 'Versión mejorada de la Peso Ball (Leyendas: Arceus).',
    'Gigaton Ball' => 'Versión mejorada de la Kilo Ball (Leyendas: Arceus).',
    'Feather Ball' => 'Se lanza más lejos y funciona mejor con Pokémon que vuelan alto (Leyendas: Arceus).',
    'Wing Ball' => 'Versión mejorada de la Pluma Ball (Leyendas: Arceus).',
    'Jet Ball' => 'Versión mejorada de la Ala Ball (Leyendas: Arceus).',
    'Origin Ball' => 'Ball especial con la que se atrapa a Dialga y Palkia (Leyendas: Arceus).',
];
// Objetos que no pintan nada en una app de combates y equipos: no salen en la pantalla de Objetos (categoría NULL)
const CATEGORIA_OCULTA = ['species-candies', 'unused', 'data-cards', 'sandwich-ingredients', 'picnic', 'curry-ingredients',
    'tm-materials', 'all-mail', 'tera-shard', 'dynamax-crystals'];
$categoria = [];
$idCategoria = [];
foreach (csv('item_categories') as $r) {
    $categoria[$r['id']] = in_array($r['identifier'], CATEGORIA_OCULTA, true) ? null
        : CATEGORIA_OBJETO[$r['identifier']] ?? CATEGORIA_BOLSILLO[$r['pocket_id']] ?? 'Otros';
    $idCategoria[$r['id']] = $r['identifier'];
}

// MT: qué movimiento enseña cada una (la versión más reciente)
$mtMovimiento = [];
foreach (csv('machines') as $r) {
    if (($mtMovimiento[$r['item_id']][0] ?? 0) < (int) $r['version_group_id']) $mtMovimiento[$r['item_id']] = [(int) $r['version_group_id'], $r['move_id']];
}

// Pokémon Showdown: icono de cada objeto (posición en su hoja de iconos), megapiedras y descripción en inglés
$clave = fn(string $s): string => preg_replace('/[^a-z0-9]/', '', strtolower(str_replace(['é', 'É'], 'e', $s)));   // "Poké Ball" = "Poke Ball"
$sdObjeto = [];   // clave del nombre en inglés → [icono, especie que megaevoluciona]
foreach (preg_split('/\n\t(?=[a-z0-9]+: \{)/', showdown('items.ts')) as $bloque) {
    if (!preg_match('/name: "([^"]+)"/', $bloque, $n) || !preg_match('/spritenum: (\d+)/', $bloque, $sp)) continue;
    preg_match('/megaStone: \{ "([^"]+)"/', $bloque, $mega);
    $sdObjeto[$clave($n[1])] = [(int) $sp[1], $mega[1] ?? null];
}
$sdTexto = [];    // clave → descripción corta en inglés
foreach (preg_split('/\n\t(?=[a-z0-9]+: \{)/', showdown('text/items.ts')) as $bloque) {
    if (preg_match('/name: "([^"]+)"/', $bloque, $n)
        && (preg_match('/shortDesc: "((?:[^"\\\\]|\\\\.)*)"/', $bloque, $d) || preg_match('/\\bdesc: "((?:[^"\\\\]|\\\\.)*)"/', $bloque, $d))) {
        $sdTexto[$clave($n[1])] = stripcslashes($d[1]);
    }
}
$especieEs = $pdo->query('SELECT nombre_en, nombre FROM especie')->fetchAll(PDO::FETCH_KEY_PAIR);
$tipoMovimiento = [];   // movimiento → tipo, para pintar cada MT con el disco de su color
foreach (csv('moves') as $r) $tipoMovimiento[$r['id']] = $r['type_id'];

// PokéSprite: iconos de objetos hasta la Gen 8 (los que no están en la hoja de Showdown, como medicinas o mentas)
$pokesprite = [];   // identificador → carpeta/nombre dentro de su repositorio ("hold-item/choice-scarf")
foreach (json_decode(descargar('pokesprite-items.json', 'https://raw.githubusercontent.com/msikma/pokesprite/master/data/item-map.json'), true) ?: [] as $ruta) {
    $pokesprite[basename($ruta)] ??= $ruta;
}
// Algunos tienen otro nombre allí: caramelos de PS/EV, caramelos Exp. y mentas (por la característica que suben)
$MENTA = ['lonely' => 'attack', 'adamant' => 'attack', 'naughty' => 'attack', 'brave' => 'attack',
    'bold' => 'defense', 'impish' => 'defense', 'lax' => 'defense', 'relaxed' => 'defense',
    'modest' => 'special-attack', 'mild' => 'special-attack', 'rash' => 'special-attack', 'quiet' => 'special-attack',
    'calm' => 'special-defense', 'gentle' => 'special-defense', 'careful' => 'special-defense', 'sassy' => 'special-defense',
    'timid' => 'speed', 'hasty' => 'speed', 'jolly' => 'speed', 'naive' => 'speed', 'serious' => 'neutral'];
$rutaPokesprite = function (string $ident) use ($pokesprite, $MENTA): ?string {
    if (isset($pokesprite[$ident])) return $pokesprite[$ident];
    if (preg_match('/^(health|mighty|tough|smart|courage|quick)-candy(-l|-xl)?$/', $ident, $m)) return "av-candy/$m[1]" . ($m[2] ?? '');
    if (preg_match('/^exp-candy-(xs|s|m|l|xl)$/', $ident, $m)) return "exp-candy/$m[1]";
    if (preg_match('/^(\w+)-mint$/', $ident, $m) && isset($MENTA[$m[1]])) return 'mint/' . $MENTA[$m[1]];
    if (preg_match('/^(silver|golden)-(razz|nanab|pinap)-berry$/', $ident, $m)) return "berry/$m[1]-$m[2]";
    if (preg_match('/^legendary-clue/', $ident)) return 'key-item/legendary-clue';
    if ($ident === 'rotom-bike') return 'key-item/rotom-bike-1';
    // Variantes de Let's Go y Galar ("leaf-letter--pikachu", "ss-ticket--letsgo"): con su sufijo o sin él
    if (str_contains($ident, '--')) return $pokesprite[str_replace('--', '-', $ident)] ?? $pokesprite[explode('--', $ident)[0]] ?? null;
    return null;
};

$objetos = [];
foreach (csv('items') as $r) {
    $id = $r['id'];
    if (!isset($nombreObjeto[$id])) continue;   // solo objetos con nombre en español
    $en = $nombreObjetoEn[$id] ?? $r['identifier'];
    [$icono, $megaDe] = $sdObjeto[$clave($en)] ?? [null, null];
    // Descripción: MT → el movimiento que enseña; si no, español de PokeAPI → una hecha con los datos → inglés
    $desc = (isset($mtMovimiento[$id]) ? 'Enseña el movimiento ' . ($nombreMov[$mtMovimiento[$id][1]] ?? '?') . ' a los Pokémon compatibles.' : null)
        ?? $descObjeto[$id]
        ?? DESC_PROPIA[$en] ?? null
        ?? ($megaDe ? 'Megapiedra. Si la lleva ' . ($especieEs[$megaDe] ?? $megaDe) . ', puede megaevolucionar durante el combate.' : null)
        ?? (($idCategoria[$r['category_id']] ?? '') === 'mega-stones'
            && preg_match('/held by an? (.+?), this item/', $descObjetoEn[$id] ?? $sdTexto[$clave($en)] ?? '', $m)
            ? 'Megapiedra. Si la lleva ' . ($especieEs[$m[1]] ?? $m[1]) . ', puede megaevolucionar durante el combate.' : null)
        ?? DESC_CATEGORIA[$idCategoria[$r['category_id']] ?? ''] ?? null
        ?? (isset($descObjetoEn[$id]) ? $descObjetoEn[$id] . ' (en inglés)' : null)
        ?? (isset($sdTexto[$clave($en)]) ? $sdTexto[$clave($en)] . ' (en inglés)' : null);
    // Las MT no tienen icono propio en PokeAPI: se usa el disco del tipo del movimiento (tm-fire, tm-water…)
    $ident = isset($mtMovimiento[$id]) ? 'tm-' . ($identTipo[$tipoMovimiento[$mtMovimiento[$id][1]] ?? 0] ?? 'normal') : $r['identifier'];
    $objetos[$id] = [$id, $nombreObjeto[$id], $en, $ident, $icono, $icono === null ? $rutaPokesprite($r['identifier']) : null,
                     array_key_exists($r['category_id'], $categoria) ? $categoria[$r['category_id']] : 'Otros', $desc];
}
insertar($pdo, 'objeto', ['id', 'nombre', 'nombre_en', 'identificador', 'icono', 'imagen', 'categoria', 'descripcion'], $objetos);

// Hoja de iconos de objetos de Showdown: se guarda en public/img/ para no depender de su web (si falla, la web la pide a Showdown)
$hoja = __DIR__ . '/../public/img/objetos.png';
if (!is_file($hoja)) {
    @mkdir(dirname($hoja), 0775, true);
    $png = @file_get_contents('https://play.pokemonshowdown.com/sprites/itemicons-sheet.png', false,
        stream_context_create(['http' => ['header' => "User-Agent: Poketon (proyecto de clase)\r\n"]]));
    if ($png) file_put_contents($hoja, $png);
    else echo "  aviso: no se pudo descargar la hoja de iconos de Showdown (la web la cargará de su servidor)\n";
}

$nombreNaturaleza = nombres('nature_names', 'nature_id');
$nombreNaturalezaEn = nombres('nature_names', 'nature_id', EN);
$stat = ['2' => 'ataque', '3' => 'defensa', '4' => 'at_esp', '5' => 'def_esp', '6' => 'velocidad'];
insertar($pdo, 'naturaleza', ['id', 'nombre', 'nombre_en', 'stat_sube', 'stat_baja'], (function () use ($nombreNaturaleza, $nombreNaturalezaEn, $stat) {
    foreach (csv('natures') as $r) {
        $neutra = $r['increased_stat_id'] === $r['decreased_stat_id'];
        yield [$r['id'], $nombreNaturaleza[$r['id']] ?? $r['identifier'], $nombreNaturalezaEn[$r['id']] ?? $r['identifier'],
               $neutra ? null : $stat[$r['increased_stat_id']], $neutra ? null : $stat[$r['decreased_stat_id']]];
    }
})());

/* ======================================================================
   Evoluciones
   ====================================================================== */

$momento = ['day' => 'de día', 'night' => 'de noche', 'dusk' => 'al atardecer'];

/** Convierte una fila de pokemon_evolution en [metodo, nivel, objeto_id, detalle legible]. */
$describir = function (array $r) use ($objetos, $nombreMov, $nombreTipo, $momento): array {
    $obj = fn($id) => $objetos[$id][1] ?? 'un objeto';
    $partes = [];
    $nivel = $r['minimum_level'] === '' ? null : (int) $r['minimum_level'];
    $objetoId = null;
    switch ($r['evolution_trigger_id']) {
        case '1':
            if ($nivel)                      { $metodo = 'nivel';   $partes[] = "Nivel $nivel"; }
            elseif ($r['minimum_happiness']) { $metodo = 'amistad'; $partes[] = 'Amistad alta'; }
            elseif (($r['minimum_affection'] ?? '') !== '') { $metodo = 'amistad'; $partes[] = 'Mucho cariño'; }
            else                             { $metodo = 'otro';    $partes[] = 'Subir de nivel'; }
            break;
        case '2': $metodo = 'intercambio'; $partes[] = 'Intercambio'; break;
        case '3':
            $metodo = 'objeto';
            $objetoId = isset($objetos[$r['trigger_item_id']]) ? (int) $r['trigger_item_id'] : null;
            $partes[] = $obj($r['trigger_item_id']);
            break;
        default: $metodo = 'otro'; $partes[] = 'Método especial';
    }
    if ($r['held_item_id']) {
        $partes[] = 'con ' . $obj($r['held_item_id']) . ' equipado';
        $objetoId ??= isset($objetos[$r['held_item_id']]) ? (int) $r['held_item_id'] : null;
    }
    if ($r['known_move_id'])       $partes[] = 'sabiendo ' . ($nombreMov[$r['known_move_id']] ?? 'un movimiento');
    if ($r['known_move_type_id'])  $partes[] = 'sabiendo un movimiento de tipo ' . ($nombreTipo[$r['known_move_type_id']] ?? '');
    if (isset($momento[$r['time_of_day']])) $partes[] = $momento[$r['time_of_day']];
    if ($r['relative_physical_stats'] === '1')  $partes[] = '(Ataque > Defensa)';
    if ($r['relative_physical_stats'] === '-1') $partes[] = '(Ataque < Defensa)';
    if ($r['relative_physical_stats'] === '0')  $partes[] = '(Ataque = Defensa)';
    if ($r['gender_id'] === '1')   $partes[] = '(hembra)';
    if ($r['gender_id'] === '2')   $partes[] = '(macho)';
    // El lugar cambia en cada juego (Ruta 20, Gruta Helada…): se resume para no repetir filas
    if ($r['location_id'] || $r['near_special_rock'] === '1') $partes[] = 'en un lugar especial (según el juego)';
    return [$metodo, $nivel, $objetoId, implode(' ', $partes)];
};

insertar($pdo, 'evolucion', ['especie_origen_id', 'especie_destino_id', 'metodo', 'nivel', 'objeto_id', 'detalle'],
    (function () use ($especies, $describir) {
        $vistas = [];
        foreach (csv('pokemon_evolution') as $r) {
            $origen = $especies[$r['evolved_species_id']]['evolves_from_species_id'] ?? '';
            if ($origen === '') continue;
            $fila = [$origen, $r['evolved_species_id'], ...$describir($r)];
            $k = "$origen-{$r['evolved_species_id']}-{$fila[5]}";
            if (isset($vistas[$k])) continue;   // la misma evolución repetida en varios juegos
            $vistas[$k] = true;
            yield $fila;
        }
    })());

/* ======================================================================
   Sets competitivos (Smogon)
   ====================================================================== */

/** Descarga (o lee de la caché) el JSON de sets de Smogon de una generación. */
function sets_smogon(int $gen): array
{
    $ruta = CACHE . "/smogon-gen$gen.json";
    if (!is_file($ruta)) {
        echo "  descargando sets de Smogon (gen $gen)\n";
        $datos = @file_get_contents(SETS_URL . "gen$gen.json");
        if ($datos === false) return [];
        file_put_contents($ruta, $datos);
    }
    return json_decode(file_get_contents($ruta), true) ?: [];
}

// Para casar los nombres en inglés de Smogon con los ids de la BD: solo letras y números
$clave = fn(string $s) => preg_replace('/[^a-z0-9]/', '', strtolower($s));
$indice = function (string $sql) use ($pdo, $clave) {
    $m = [];
    foreach ($pdo->query($sql) as [$id, $nombre]) $m[$clave($nombre)] ??= (int) $id;
    return $m;
};
$idPokemon   = $indice('SELECT id, identificador FROM pokemon')
             + $indice('SELECT p.id, e.nombre_en FROM pokemon p JOIN especie e ON e.id = p.especie_id WHERE p.predeterminado = 1');
$idObjeto    = $indice('SELECT id, nombre_en FROM objeto');
$idHabilidad = $indice('SELECT id, nombre_en FROM habilidad');
$idNatur     = $indice('SELECT id, nombre_en FROM naturaleza');
$idMov       = $indice('SELECT id, nombre_en FROM movimiento');

// Formatos de más a menos representativos; de cada Pokémon se guardan 2 sets del primero que tenga
const FORMATOS = ['ou', 'ubers', 'uu', 'ru', 'nu', 'pu', 'zu', 'lc', 'nfe', 'nationaldex', 'nationaldexuu',
                  'nationaldexubers', 'monotype', 'doublesou', 'battlestadiumsingles', 'vgc2025', 'vgc2024', 'vgc2023'];
const STATS_SMOGON = ['hp', 'atk', 'def', 'spa', 'spd', 'spe'];

$lista = fn($v) => $v === null ? [] : (is_array($v) ? $v : [$v]);
$ids = fn(array $mapa, $v) => array_values(array_filter(array_map(fn($x) => $mapa[$clave((string) $x)] ?? null, $lista($v))));

insertar($pdo, 'set_competitivo', ['pokemon_id', 'generacion', 'formato', 'nombre', 'datos'],
    (function () use ($idPokemon, $idObjeto, $idHabilidad, $idNatur, $idMov, $clave, $lista, $ids) {
        for ($gen = 1; $gen <= 9; $gen++) {
            foreach (sets_smogon($gen) as $especie => $formatos) {
                $pid = $idPokemon[$clave($especie)] ?? null;
                if (!$pid) continue;
                $formato = current(array_filter(FORMATOS, fn($f) => isset($formatos[$f]))) ?: array_key_first($formatos);
                if (!$formato) continue;
                foreach (array_slice($formatos[$formato], 0, 2, true) as $nombre => $s) {
                    $evs = array_fill(0, 6, 0);
                    $spread = $s['evs'] ?? [];
                    if (array_is_list($spread)) $spread = $spread[0] ?? [];   // a veces trae varias opciones
                    foreach ($spread as $stat => $v) {
                        $i = array_search($stat, STATS_SMOGON, true);
                        if ($i !== false) $evs[$i] = (int) $v;
                    }
                    yield [$pid, $gen, strtoupper($formato), mb_substr((string) $nombre, 0, 80), json_encode([
                        'objetos'     => $ids($idObjeto, $s['item'] ?? null),
                        'habilidades' => $ids($idHabilidad, $s['ability'] ?? null),
                        'naturalezas' => $ids($idNatur, $s['nature'] ?? null),
                        'teratipos'   => array_map('strtoupper', $lista($s['teratypes'] ?? null)),
                        'evs'         => $evs,
                        'movimientos' => array_map(fn($m) => $ids($idMov, $m), $lista($s['moves'] ?? [])),
                    ])];
                }
            }
        }
    })());

$pdo->commit();
printf("Hecho en %.1f s\n", microtime(true) - $inicio);
