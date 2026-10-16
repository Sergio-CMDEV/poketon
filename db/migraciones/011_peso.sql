-- Peso y altura de cada Pokémon, y sexo y ratio de captura de cada especie.
-- Uso: ejecútalo una vez como root y vuelve a lanzar el importador (php db/import.php, o en el servidor
-- sh scripts/desplegar.sh --importar), que es quien los rellena con los datos de PokeAPI.
-- Se puede lanzar dos veces sin error.

ALTER TABLE pokemon
  ADD COLUMN IF NOT EXISTS altura SMALLINT UNSIGNED NULL AFTER predeterminado,   -- en decímetros, como PokeAPI (4 = 0,4 m)
  ADD COLUMN IF NOT EXISTS peso   SMALLINT UNSIGNED NULL AFTER altura;           -- en hectogramos (60 = 6,0 kg)

ALTER TABLE especie
  ADD COLUMN IF NOT EXISTS ratio_genero  TINYINT NULL AFTER rareza,              -- octavos de hembra: 4 = 50 %, 0 = solo macho, 8 = solo hembra, -1 = sin sexo
  ADD COLUMN IF NOT EXISTS ratio_captura TINYINT UNSIGNED NULL AFTER ratio_genero;   -- 3 (legendarios) a 255 (muy fácil)
