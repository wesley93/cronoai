using System.Text.RegularExpressions;
using CronoAI.Api.Testes.Infra;
using Npgsql;

namespace CronoAI.Api.Testes.Dados;

/// <summary>Testes de catálogo (pg_catalog), lidos como <c>cronoai_app</c>: FKs, nomes, RLS e políticas.</summary>
[Collection(ColecaoBanco.Nome)]
[Trait("Categoria", "Integracao")]
public sealed partial class CatalogoTestes
{
    #region Campos

    // Tabelas do schema fora do RLS por decisão (ADR 00006): usuario (aceito com condições), o histórico de migrações e as
    // listas nacionais (UF e município: globais, sem empresa, só leitura para a aplicação; ciclo 00013).
    private static readonly string[] _tabelasForaDoRls = ["usuario", "__ef_migrations_history", "uf_referencia", "municipio_referencia"];

    // Tabela, comando, USING e WITH CHECK normalizados em espaços ("<nulo>" quando a política não tem a cláusula).
    private const string ConsultaDePredicados = @"SELECT tablename || '|' || cmd || '|' ||
                     regexp_replace(coalesce(qual, '<nulo>'), '[[:space:]]+', ' ', 'g') || '|' ||
                     regexp_replace(coalesce(with_check, '<nulo>'), '[[:space:]]+', ' ', 'g')
                FROM pg_policies WHERE schemaname = 'cronoai'";

    private readonly BancoPostgresFixture _banco;

    #endregion

    #region Construtor

    public CatalogoTestes(BancoPostgresFixture banco)
    {
        _banco = banco;
    }

    #endregion

    #region Métodos públicos

    [Fact]
    public async Task Fks_do_schema_sao_restrict()
    {
        // confdeltype 'r' = RESTRICT. Qualquer outra coisa (cascata, set null, no action) reprova.
        var fora = await ListarAsync(
            "SELECT k.conname FROM pg_constraint k JOIN pg_namespace n ON n.oid = k.connamespace WHERE n.nspname = 'cronoai' AND k.contype = 'f' AND k.confdeltype <> 'r'");

        Assert.Empty(fora);
        Assert.NotEmpty(await ListarAsync(
            "SELECT k.conname FROM pg_constraint k JOIN pg_namespace n ON n.oid = k.connamespace WHERE n.nspname = 'cronoai' AND k.contype = 'f'"));
    }

    [Fact]
    public async Task Identificadores_cabem_em_63_bytes()
    {
        // 63 bytes é o limite do PostgreSQL: nome com exatamente 63 é sinal de truncamento silencioso.
        var suspeitos = await ListarAsync(
            """
            SELECT c.relname
              FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
             WHERE n.nspname = 'cronoai' AND octet_length(c.relname) >= 63
            UNION ALL
            SELECT k.conname
              FROM pg_constraint k JOIN pg_namespace n ON n.oid = k.connamespace
             WHERE n.nspname = 'cronoai' AND octet_length(k.conname) >= 63
            UNION ALL
            SELECT p.policyname
              FROM pg_policies p
             WHERE p.schemaname = 'cronoai' AND octet_length(p.policyname) >= 63
            UNION ALL
            SELECT c.relname
              FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
             WHERE n.nspname = 'cronoai'
             GROUP BY c.relname HAVING count(*) > 1
            """);

        Assert.Empty(suspeitos);
    }

    [Fact]
    public async Task Toda_tabela_tem_rls_forcado_ou_esta_na_lista_global()
    {
        var tabelas = await ListarAsync(
            "SELECT c.relname || '|' || c.relrowsecurity::text || '|' || c.relforcerowsecurity::text FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'cronoai' AND c.relkind = 'r'");

        Assert.NotEmpty(tabelas);
        foreach (var linha in tabelas)
        {
            var partes = linha.Split('|');
            if (_tabelasForaDoRls.Contains(partes[0]))
            {
                continue;
            }

            Assert.True(partes[1] == "true" && partes[2] == "true", $"RLS forçado ausente em {partes[0]}");
        }

        // As tabelas de dado do ciclo estão de fato presentes e protegidas.
        foreach (var esperada in new[] { "empresa", "membro_empresa", "sessao", "obra", "auditoria", "acesso_obra", "frente", "acesso_frente", "carteira", "carteira_obra", "acesso_carteira" })
        {
            Assert.Contains($"{esperada}|true|true", tabelas);
        }
    }

    [Fact]
    public async Task Politicas_sao_por_comando_e_so_para_cronoai_app()
    {
        var politicas = await ListarAsync(
            "SELECT tablename || '|' || cmd || '|' || roles::text || '|' || permissive FROM pg_policies WHERE schemaname = 'cronoai' ORDER BY 1");

        // Nenhum "ALL", nenhum papel além do cronoai_app, e exatamente os comandos do plano: membro_empresa SEM INSERT (escalada
        // fechada) e com UPDATE; obra sem DELETE; frente e carteira sem DELETE; os 4 vínculos sem UPDATE e com DELETE; auditoria SÓ com
        // SELECT e INSERT (nenhuma política de UPDATE ou DELETE).
        var esperadas = new[]
        {
            "empresa|INSERT|{cronoai_app}|PERMISSIVE",
            "empresa|SELECT|{cronoai_app}|PERMISSIVE",
            "membro_empresa|SELECT|{cronoai_app}|PERMISSIVE",
            "membro_empresa|UPDATE|{cronoai_app}|PERMISSIVE",
            "obra|INSERT|{cronoai_app}|PERMISSIVE",
            "obra|SELECT|{cronoai_app}|PERMISSIVE",
            "obra|UPDATE|{cronoai_app}|PERMISSIVE",
            "acesso_obra|DELETE|{cronoai_app}|PERMISSIVE",
            "acesso_obra|INSERT|{cronoai_app}|PERMISSIVE",
            "acesso_obra|SELECT|{cronoai_app}|PERMISSIVE",
            "frente|INSERT|{cronoai_app}|PERMISSIVE",
            "frente|SELECT|{cronoai_app}|PERMISSIVE",
            "frente|UPDATE|{cronoai_app}|PERMISSIVE",
            "acesso_frente|DELETE|{cronoai_app}|PERMISSIVE",
            "acesso_frente|INSERT|{cronoai_app}|PERMISSIVE",
            "acesso_frente|SELECT|{cronoai_app}|PERMISSIVE",
            "carteira|INSERT|{cronoai_app}|PERMISSIVE",
            "carteira|SELECT|{cronoai_app}|PERMISSIVE",
            "carteira|UPDATE|{cronoai_app}|PERMISSIVE",
            "carteira_obra|DELETE|{cronoai_app}|PERMISSIVE",
            "carteira_obra|INSERT|{cronoai_app}|PERMISSIVE",
            "carteira_obra|SELECT|{cronoai_app}|PERMISSIVE",
            "acesso_carteira|DELETE|{cronoai_app}|PERMISSIVE",
            "acesso_carteira|INSERT|{cronoai_app}|PERMISSIVE",
            "acesso_carteira|SELECT|{cronoai_app}|PERMISSIVE",
            "auditoria|INSERT|{cronoai_app}|PERMISSIVE",
            "auditoria|SELECT|{cronoai_app}|PERMISSIVE",
            "sessao|DELETE|{cronoai_app}|PERMISSIVE",
            "sessao|INSERT|{cronoai_app}|PERMISSIVE",
            "sessao|SELECT|{cronoai_app}|PERMISSIVE",
            "sessao|UPDATE|{cronoai_app}|PERMISSIVE",
        };
        Assert.Equal(esperadas.OrderBy(x => x, StringComparer.Ordinal), politicas.OrderBy(x => x, StringComparer.Ordinal));
    }

    [Fact]
    public async Task Predicados_das_politicas_sao_os_do_plano()
    {
        // Texto EXATO (normalizado em espaços) de USING e WITH CHECK em pg_policies, de TODAS as políticas. O golden
        // (predicados-esperados.txt) foi COPIADO da saída real do PostgreSQL, nunca escrito à mão: sem isto, um WITH CHECK (true)
        // num INSERT deixaria a suíte verde. Mudar uma política exige regerar o arquivo DE PROPÓSITO e revisar o diff.
        // Formato de cada linha: tabela|comando|USING|WITH CHECK ("<nulo>" quando não há).
        var atuais = await ListarAsync(ConsultaDePredicados);

        var esperados = (await File.ReadAllLinesAsync(Path.Combine(AppContext.BaseDirectory, "Dados", "predicados-esperados.txt"), TestContext.Current.CancellationToken))
            .Where(l => l.Length > 0)
            .ToList();

        Assert.Empty(Diferencas(atuais, esperados));
        Assert.Equal(esperados.OrderBy(x => x, StringComparer.Ordinal), atuais.OrderBy(x => x, StringComparer.Ordinal));
    }

    [Fact]
    public async Task Comparador_de_predicados_detecta_afrouxamento()
    {
        // T11: prova que o comparador do teste anterior ENXERGA um predicado afrouxado. Numa transação do superusuário (nunca
        // confirmada) afrouxa duas políticas e roda a MESMA consulta do catálogo; o comparador deve apontar exatamente as duas.
        var esperados = (await File.ReadAllLinesAsync(Path.Combine(AppContext.BaseDirectory, "Dados", "predicados-esperados.txt"), TestContext.Current.CancellationToken))
            .Where(l => l.Length > 0)
            .ToList();

        var (codigo, saida, erro) = await _banco.ExecutarScriptComoSuperusuarioAsync(
            ("SET search_path = cronoai; " + ConsultaDePredicados).Replace("SELECT", "BEGIN; ALTER POLICY pol_obra_select ON cronoai.obra USING (true); ALTER POLICY pol_auditoria_insert ON cronoai.auditoria WITH CHECK (true); SELECT", StringComparison.Ordinal));
        Assert.True(codigo == 0, erro);
        var mutadas = LinhasDePolitica(saida);
        Assert.Equal(esperados.Count, mutadas.Count);

        // A mutação é detectada, e SÓ ela.
        var apontadas = Diferencas(mutadas, esperados).Order(StringComparer.Ordinal).ToList();
        var primeira = mutadas.Except(esperados, StringComparer.Ordinal).FirstOrDefault(l => !l.StartsWith("obra|SELECT", StringComparison.Ordinal) && !l.StartsWith("auditoria|INSERT", StringComparison.Ordinal)) ?? "";
        Assert.True(apontadas.SequenceEqual(["auditoria|INSERT", "obra|SELECT"]), string.Join(";", apontadas) + " :: " + primeira[^Math.Min(primeira.Length, 120)..]);

        // (O superusuário não tem o search_path do papel da aplicação: sem o SET o deparse qualificaria as tabelas com "cronoai.".)
        // Controle negativo: sem a mutação o comparador não aponta nada.
        var (codigoLimpo, saidaLimpa, erroLimpo) = await _banco.ExecutarScriptComoSuperusuarioAsync("SET search_path = cronoai; " + ConsultaDePredicados);
        Assert.True(codigoLimpo == 0, erroLimpo);
        Assert.Empty(Diferencas(LinhasDePolitica(saidaLimpa), esperados));
    }

    [Fact]
    public async Task Auditoria_tem_o_indice_da_exportacao_e_a_fk_da_empresa()
    {
        // Índice da exportação (empresa + id > cursor, ordem por id) e FK da empresa, Restrict (confdeltype 'r').
        var indices = await ListarAsync("SELECT indexdef FROM pg_indexes WHERE schemaname = 'cronoai' AND indexname = 'ix_auditoria_empresa_id'");
        var definicao = Assert.Single(indices);
        Assert.Contains("(empresa_id, id)", definicao, StringComparison.Ordinal);

        var fks = await ListarAsync(
            "SELECT k.conname || '|' || k.confdeltype::text || '|' || cl.relname FROM pg_constraint k JOIN pg_class cl ON cl.oid = k.confrelid WHERE k.conname = 'fk_auditoria_empresa'");
        Assert.Equal(["fk_auditoria_empresa|r|empresa"], fks);
    }

    #endregion

    #region Métodos privados

    // Diferença simétrica entre o catálogo e o golden, devolvida como "tabela|comando" de cada política que mudou.
    private static List<string> Diferencas(IEnumerable<string> atuais, IEnumerable<string> esperados)
    {
        var listaAtual = atuais.ToList();
        var listaEsperada = esperados.ToList();
        return listaAtual.Except(listaEsperada, StringComparer.Ordinal)
            .Concat(listaEsperada.Except(listaAtual, StringComparer.Ordinal))
            .Select(linha => string.Join('|', linha.Split('|').Take(2)))
            .Distinct(StringComparer.Ordinal)
            .ToList();
    }

    // O psql imprime o resultado de CADA comando do script ("BEGIN", "ALTER POLICY"...): fica só a linha de política.
    private static List<string> LinhasDePolitica(string saida) =>
        saida.Split('\n').Select(l => l.TrimEnd('\r')).Where(l => PoliticaRegex().IsMatch(l)).ToList();

    [GeneratedRegex(@"^[a-z_]+\|(SELECT|INSERT|UPDATE|DELETE)\|")]
    private static partial Regex PoliticaRegex();

    private async Task<List<string>> ListarAsync(string sql)
    {
        await using var conexao = new NpgsqlConnection(_banco.StringConexaoApp);
        await conexao.OpenAsync(TestContext.Current.CancellationToken);
        await using var comando = new NpgsqlCommand(sql, conexao);
        var itens = new List<string>();
        await using var leitor = await comando.ExecuteReaderAsync(TestContext.Current.CancellationToken);
        while (await leitor.ReadAsync(TestContext.Current.CancellationToken))
        {
            itens.Add(leitor.GetString(0));
        }

        return itens;
    }

    #endregion
}
