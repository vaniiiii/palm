#!/usr/bin/env bash
set -e

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
    CREATE DATABASE ponder_anvil;
    CREATE DATABASE ponder_base;
    CREATE DATABASE ponder_arb;
EOSQL
