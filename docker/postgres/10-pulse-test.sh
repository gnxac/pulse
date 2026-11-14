#!/bin/sh
# Banco separado para os testes (php artisan test). Só roda quando o volume do Postgres é criado.
set -e
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" -c "CREATE DATABASE pulse_test OWNER $POSTGRES_USER;"
