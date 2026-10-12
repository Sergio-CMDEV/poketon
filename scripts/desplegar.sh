#!/bin/sh
# Pone en marcha (o actualiza) Poketon en la máquina web del Proxmox (LXC con Docker).
#   ./scripts/desplegar.sh              → construye y arranca (o reinicia tras un git pull)
#   ./scripts/desplegar.sh --importar   → además llena la BD con los datos de PokeAPI y Smogon (la primera vez)
set -e
cd "$(dirname "$0")/.."

[ -f config.php ] || { echo "Falta config.php: cp config.example.php config.php y rellénalo (ver Despliegue)"; exit 1; }
grep -q "cambia-esto" config.php && { echo "config.php tiene todavía valores de ejemplo ('cambia-esto')"; exit 1; }

# Fotos de perfil: la única carpeta donde escribe PHP (82 = www-data en Alpine)
mkdir -p public/fotos
chown 82:82 public/fotos

docker compose up -d --build

if [ "$1" = "--importar" ]; then
    echo "Llenando la base de datos (tarda menos de un minuto)…"
    # public/img con escritura solo para esto: el importador guarda ahí la hoja de iconos de objetos
    docker compose run --rm -v "$PWD/public/img:/var/www/public/img" php php /var/www/db/import.php
fi

docker compose ps
echo "Listo: http://$(hostname -I | awk '{print $1}'):8080"
