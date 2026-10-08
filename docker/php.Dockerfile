# PHP-FPM con la extensión para MariaDB/MySQL
FROM php:8.3-fpm-alpine
RUN docker-php-ext-install pdo_mysql
