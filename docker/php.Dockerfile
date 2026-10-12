# PHP-FPM con la extensión para MariaDB/MySQL y GD con JPG y WebP (fotos de perfil del online)
FROM php:8.3-fpm-alpine
RUN apk add --no-cache libpng libjpeg-turbo libwebp \
 && apk add --no-cache --virtual .compilar libpng-dev libjpeg-turbo-dev libwebp-dev \
 && docker-php-ext-configure gd --with-jpeg --with-webp \
 && docker-php-ext-install pdo_mysql gd \
 && apk del .compilar
# php.ini de producción: los avisos van al log, nunca a la respuesta (no se ven rutas del servidor delante del JSON)
RUN cp "$PHP_INI_DIR/php.ini-production" "$PHP_INI_DIR/php.ini" \
 && printf 'expose_php = Off\nupload_max_filesize = 2M\npost_max_size = 4M\n' > "$PHP_INI_DIR/conf.d/poketon.ini"
# El proyecto se monta en /var/www en solo lectura: la carpeta de trabajo de la imagen (/var/www/html) no existe
# ahí y Docker no puede crearla ("mkdir /var/www/html: read-only file system")
WORKDIR /var/www
