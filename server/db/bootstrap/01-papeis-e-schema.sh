#!/usr/bin/env bash
# Provisionamento LOCAL de papéis e schema do CronoAI (ADR 00004). Não é DDL de tabela:
# toda tabela continua nascendo só em migração.
#
# Mesma fonte para dois usos:
#   - docker-compose.yml: montado somente leitura em /docker-entrypoint-initdb.d (roda só em volume vazio);
#   - testes de integração: copiado para o contêiner descartável e executado pela fixture como superusuário.
#
# Entrada (variáveis de ambiente, nunca argumentos nem valores fixos):
#   POSTGRES_USER, POSTGRES_DB         superusuário de bootstrap e banco (já definidos pela imagem)
#   CRONOAI_SENHA_MIGRADOR             senha do papel cronoai_migrador
#   CRONOAI_SENHA_APP                  senha do papel cronoai_app
# Nota: no compose o entrypoint da imagem faz "source" deste arquivo (ele não tem bit de execução no
# Windows) e ignora "set -e" nesse contexto. Por isso não se altera `set` aqui e toda falha termina com
# "exit 1" explícito, que derruba o contêiner em vez de deixá-lo "healthy" sem os papéis.
for variavel in POSTGRES_USER POSTGRES_DB CRONOAI_SENHA_MIGRADOR CRONOAI_SENHA_APP; do
  if [ -z "${!variavel:-}" ]; then
    echo "bootstrap do CronoAI: variável ${variavel} não definida" >&2
    exit 1
  fi
done

# As senhas entram como variáveis do psql, referenciadas entre aspas (:'nome') e aplicadas com format(%L) +
# \gexec, que faz o quoting correto do literal. Não se usa bloco DO: o psql não interpola variável dentro de dollar-quoting.
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
  -v banco="$POSTGRES_DB" \
  -v senha_migrador="$CRONOAI_SENHA_MIGRADOR" \
  -v senha_app="$CRONOAI_SENHA_APP" <<'SQL' || exit 1
-- Dono do schema: roda as migrações (DDL). Nunca é usado pela API.
SELECT format('CREATE ROLE cronoai_migrador LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS PASSWORD %L', :'senha_migrador') \gexec

-- Papel da API: só DML (privilégios padrão concedidos na migração Inicial), sem DDL.
SELECT format('CREATE ROLE cronoai_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS PASSWORD %L', :'senha_app') \gexec

CREATE SCHEMA cronoai AUTHORIZATION cronoai_migrador;
ALTER ROLE cronoai_app SET search_path = cronoai;

-- Menor privilégio: ninguém herda acesso por PUBLIC.
REVOKE ALL ON DATABASE :"banco" FROM PUBLIC;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT CONNECT ON DATABASE :"banco" TO cronoai_migrador, cronoai_app;
SQL
