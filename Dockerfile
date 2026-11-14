# Pulse: nginx + php-fpm prontos para produção (usuário sem root, porta 8080).
# Destinos: "dev" (docker-compose, com PHPUnit) e "prod" (último estágio, o padrão; o Render usa este).

FROM serversideup/php:8.4-fpm-nginx AS base
# A pasta pública é www/ (o site) e não public/.
ENV NGINX_WEBROOT=/var/www/html/www
WORKDIR /var/www/html

COPY docker/nginx/pulse.conf /etc/nginx/server-opts.d/pulse.conf
COPY --chown=www-data:www-data composer.json composer.lock ./

# ---------- dev ----------
FROM base AS dev
USER www-data
RUN composer install --no-interaction --no-scripts --no-autoloader --prefer-dist
COPY --chown=www-data:www-data . .
RUN composer dump-autoload --no-interaction

# ---------- prod ----------
FROM base AS prod
USER www-data
RUN composer install --no-dev --no-interaction --no-scripts --no-autoloader --prefer-dist
COPY --chown=www-data:www-data . .
RUN composer dump-autoload --no-dev --optimize --no-interaction
# Na partida: config:cache, route:cache etc. (precisam das variáveis do ambiente, por isso não rodam no build).
# Migrações rodam no preDeployCommand do Render, não aqui.
ENV AUTORUN_ENABLED=true \
    AUTORUN_LARAVEL_MIGRATION=false \
    AUTORUN_LARAVEL_STORAGE_LINK=false
