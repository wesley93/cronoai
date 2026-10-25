#!/usr/bin/env bash
# Provisionamento LOCAL de papéis e schema do CronoAI (ADR 00004). Não é DDL de tabela:
# toda tabela continua nascendo só em migração.
#
# ATENÇÃO: roda UMA vez, em banco/volume vazio (initdb). NÃO é idempotente: reexecutar falha em
# "role already exists". Para recriar papéis ou trocar senhas: docker compose --profile backend down -v
#
# Mesma fonte para dois usos:
#   - docker-compose.yml: montado somente leitura em /docker-entrypoint-initdb.d (roda só em volume vazio);
#   - testes de integração: copiado para o contêiner descartável e executado pela fixture como superusuário.
#
# Entrada (variáveis de ambiente do contêiner, nunca argumentos nem valores fixos):
#   POSTGRES_USER, POSTGRES_DB, POSTGRES_PASSWORD   superusuário de bootstrap, banco e senha (da imagem)
#   CRONOAI_SENHA_MIGRADOR                          senha do papel cronoai_migrador
#   CRONOAI_SENHA_APP                               senha do papel cronoai_app
#
# Nota: no compose o entrypoint da imagem faz "source" deste arquivo (sem bit de execução no Windows) e
# ignora "set -e" nesse contexto. Por isso não se altera `set` aqui: toda falha chama falhar(), que escreve a
# causa no log e termina com "exit 1" (o contêiner sai e, sem política de restart, não fica healthy).

falhar() {
  echo "bootstrap do CronoAI falhou: $1; rode 'docker compose --profile backend down -v' e corrija o .env" >&2
  exit 1
}

for variavel in POSTGRES_USER POSTGRES_DB POSTGRES_PASSWORD CRONOAI_SENHA_MIGRADOR CRONOAI_SENHA_APP; do
  if [ -z "${!variavel:-}" ]; then
    falhar "variável ${variavel} não definida"
  fi
done

# Senhas fracas ou de exemplo nunca entram, mesmo em ambiente local.
for variavel in POSTGRES_PASSWORD CRONOAI_SENHA_MIGRADOR CRONOAI_SENHA_APP; do
  valor="${!variavel}"
  if [ "${#valor}" -lt 16 ]; then
    falhar "a senha em ${variavel} tem menos de 16 caracteres"
  fi
  case "$valor" in
    *"<defina-localmente>"*) falhar "a senha em ${variavel} ainda é o marcador do .env.example" ;;
  esac
done
if [ "$POSTGRES_PASSWORD" = "$CRONOAI_SENHA_MIGRADOR" ] || [ "$POSTGRES_PASSWORD" = "$CRONOAI_SENHA_APP" ] \
  || [ "$CRONOAI_SENHA_MIGRADOR" = "$CRONOAI_SENHA_APP" ]; then
  falhar "as três senhas (bootstrap, migrador e app) precisam ser diferentes entre si"
fi

# As senhas entram no psql por \getenv (psql 15+): não aparecem na linha de comando do processo. São aplicadas com
# format(%L) + \gexec, que faz o quoting correto do literal. Não se usa bloco DO: o psql não interpola variável
# dentro de dollar-quoting. log_min_error_statement = panic evita que um erro registre o comando com a senha.
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<'SQL' || falhar "erro ao executar o SQL de provisionamento"
SET log_min_error_statement = panic;
\getenv banco POSTGRES_DB
\getenv senha_migrador CRONOAI_SENHA_MIGRADOR
\getenv senha_app CRONOAI_SENHA_APP

-- Dono do schema: roda as migrações (DDL). Nunca é usado pela API.
SELECT format('CREATE ROLE cronoai_migrador LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS PASSWORD %L', :'senha_migrador') \gexec

-- Papel da API: só DML (privilégios padrão concedidos na migração Inicial), sem DDL.
SELECT format('CREATE ROLE cronoai_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS PASSWORD %L', :'senha_app') \gexec

CREATE SCHEMA cronoai AUTHORIZATION cronoai_migrador;
ALTER ROLE cronoai_app SET search_path = cronoai;
ALTER ROLE cronoai_migrador SET search_path = cronoai;

-- Menor privilégio: ninguém herda acesso por PUBLIC (o template1 não é alterado: bancos futuros herdam dele).
REVOKE ALL ON DATABASE :"banco" FROM PUBLIC;
REVOKE CONNECT ON DATABASE postgres FROM PUBLIC;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT CONNECT ON DATABASE :"banco" TO cronoai_migrador, cronoai_app;
SQL
