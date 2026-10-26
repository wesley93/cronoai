using System.Text.RegularExpressions;
using CronoAI.Api.Testes.Infra;
using CronoAI.Dados;
using CronoAI.Dados.Auditoria;
using CronoAI.Dominio;
using Microsoft.EntityFrameworkCore;
using Npgsql;

namespace CronoAI.Api.Testes.Dados;

/// <summary>
/// <c>membro_empresa</c> no banco (plano 00014, T21 a T25 e T33): CHECKs, escalada de privilégio fechada, UPDATE só por
/// administrador (gatilho), último administrador (inclusive em concorrência), remoção lógica e versão por <c>xmin</c>.
/// </summary>
[Collection(ColecaoBanco.Nome)]
[Trait("Categoria", "Integracao")]
public sealed partial class MembroTestes
{
    #region Campos

    private static readonly DateTime _futuro = new(2030, 1, 1, 0, 0, 0, DateTimeKind.Utc);

    private readonly BancoPostgresFixture _banco;
    private readonly DadosTeste _dados;

    #endregion

    #region Construtor

    public MembroTestes(BancoPostgresFixture banco)
    {
        _banco = banco;
        _dados = new DadosTeste(banco);
    }

    #endregion

    #region Métodos públicos

    [Fact]
    public async Task Membro_checks_e_enum()
    {
        var empresa = await _dados.CriarEmpresaAsync();

        // Todos os 21 pares perfil x escopo: passam exatamente os válidos; os outros violam algum CHECK (23514).
        foreach (var perfil in Perfis.Todos)
        {
            foreach (var escopo in EscoposObras.Todos)
            {
                var usuario = await _dados.CriarUsuarioAsync();
                var (codigo, _, erro) = await InserirComoSuperusuarioAsync(empresa, usuario, perfil, escopo);

                if (Perfis.ParValido(perfil, escopo))
                {
                    Assert.True(codigo == 0, $"{perfil}/{escopo} deveria passar: {erro}");
                }
                else
                {
                    Assert.NotEqual(0, codigo);
                    Assert.Contains("23514", erro, StringComparison.Ordinal);
                }
            }
        }

        // Perfil e escopo desconhecidos: os CHECKs de enum.
        var (codigoPerfil, _, erroPerfil) = await InserirComoSuperusuarioAsync(empresa, await _dados.CriarUsuarioAsync(), "dono", "todas");
        Assert.NotEqual(0, codigoPerfil);
        Assert.Contains("ck_membro_perfil", erroPerfil, StringComparison.Ordinal);
        var (codigoEscopo, _, erroEscopo) = await InserirComoSuperusuarioAsync(empresa, await _dados.CriarUsuarioAsync(), "administrador", "tudo");
        Assert.NotEqual(0, codigoEscopo);
        Assert.Contains("ck_membro_escopo", erroEscopo, StringComparison.Ordinal);

        // Os valores dos CHECKs são EXATAMENTE as constantes do código (valor a mais ou a menos de um lado reprova).
        Assert.Equal(Perfis.Todos.Order(StringComparer.Ordinal), await ValoresDoCheckAsync("ck_membro_perfil"));
        Assert.Equal(EscoposObras.Todos.Order(StringComparer.Ordinal), await ValoresDoCheckAsync("ck_membro_escopo"));
        Assert.Equal(TiposCarteira.Todos.Order(StringComparer.Ordinal), await ValoresDoCheckAsync("ck_carteira_tipo"));
    }

    [Fact]
    public async Task Constante_a_mais_no_codigo_reprova_a_comparacao_com_o_check()
    {
        // Controle do teste anterior: a comparação enxerga uma constante que o CHECK não tem.
        var noBanco = await ValoresDoCheckAsync("ck_membro_perfil");

        Assert.NotEqual(Perfis.Todos.Append("auditor").Order(StringComparer.Ordinal), noBanco);
    }

    [Fact]
    public async Task Membro_update_so_administrador()
    {
        var c = await CenarioPermissoes.CriarAsync(_dados);

        // B (engenheiro), C e G (gestores), todos com E = X: o GATILHO recusa (42501) e nada muda. SET constante, sem WHERE.
        foreach (var usuario in new[] { c.B, c.C, c.G })
        {
            await using var contexto = Como(usuario, c.EmpresaX);
            var erro = await Assert.ThrowsAsync<PostgresException>(() => contexto.Database.ExecuteSqlAsync($"UPDATE cronoai.membro_empresa SET atualizado_em = {_futuro}", TestContext.Current.CancellationToken));
            Assert.Equal(PostgresErrorCodes.InsufficientPrivilege, erro.SqlState);
        }

        Assert.Equal("0", await _banco.ConsultarComoSuperusuarioAsync($"SELECT count(*) FROM cronoai.membro_empresa WHERE empresa_id = '{c.EmpresaX}' AND atualizado_em = '2030-01-01T00:00:00Z'"));

        // Colunas imutáveis por PRIVILÉGIO (o administrador também recebe 42501).
        await using (var comoA = Como(c.A, c.EmpresaX))
        {
            var erro = await Assert.ThrowsAsync<PostgresException>(() => comoA.Database.ExecuteSqlAsync($"UPDATE cronoai.membro_empresa SET usuario_id = {c.D}", TestContext.Current.CancellationToken));
            Assert.Equal(PostgresErrorCodes.InsufficientPrivilege, erro.SqlState);
        }

        await using (var comoA = Como(c.A, c.EmpresaX))
        {
            var erro = await Assert.ThrowsAsync<PostgresException>(() => comoA.Database.ExecuteSqlAsync($"UPDATE cronoai.membro_empresa SET empresa_id = {c.EmpresaY}", TestContext.Current.CancellationToken));
            Assert.Equal(PostgresErrorCodes.InsufficientPrivilege, erro.SqlState);
        }

        // Controle negativo: A (administrador) afeta SÓ os 7 membros de X; a empresa Y fica intacta.
        await using (var comoA = Como(c.A, c.EmpresaX))
        {
            Assert.Equal(7, await comoA.Database.ExecuteSqlAsync($"UPDATE cronoai.membro_empresa SET atualizado_em = {_futuro}", TestContext.Current.CancellationToken));
        }

        Assert.Equal("0", await _banco.ConsultarComoSuperusuarioAsync($"SELECT count(*) FROM cronoai.membro_empresa WHERE empresa_id = '{c.EmpresaY}' AND atualizado_em = '2030-01-01T00:00:00Z'"));
    }

    [Fact]
    public async Task Membro_update_so_administrador_mutacao()
    {
        // Mutação: com o gatilho DESLIGADO (a política só exige empresa_id = E), B passa a atualizar TODOS os 7 membros da empresa.
        var c = await CenarioPermissoes.CriarAsync(_dados);

        var resultado = await ScriptRls.ExecutarAsync(
            _banco,
            c.B,
            c.EmpresaX,
            "UPDATE cronoai.membro_empresa SET atualizado_em = '2030-01-01T00:00:00Z'",
            mutacao: "ALTER TABLE cronoai.membro_empresa DISABLE TRIGGER trg_membro_exige_administrador");

        Assert.True(resultado.Afetadas == 7, resultado.Erro);
    }

    [Fact]
    public async Task Ultimo_administrador()
    {
        var empresa = await _dados.CriarEmpresaAsync(comAdministradorTecnico: false);
        var a = await _dados.CriarUsuarioAsync();
        var b = await _dados.CriarUsuarioAsync();
        await _dados.VincularAsync(empresa, a);
        await _dados.VincularAsync(empresa, b, Perfis.EngenheiroObra);

        // Rebaixar o último administrador falha no COMMIT, com o nome da constraint (a API mapeia para 409).
        await using (var contexto = Como(a, empresa))
        {
            var erro = await Assert.ThrowsAsync<PostgresException>(() => contexto.Database.ExecuteSqlAsync(
                $"UPDATE cronoai.membro_empresa SET perfil = {"engenheiro_obra"}, escopo_obras = {"vinculadas"} WHERE usuario_id = {a}",
                TestContext.Current.CancellationToken));
            Assert.Equal(PostgresErrorCodes.CheckViolation, erro.SqlState);
            Assert.Equal("ck_empresa_tem_administrador", erro.ConstraintName);
        }

        // Remover (logicamente) o último administrador: idem.
        await using (var contexto = Como(a, empresa))
        {
            var erro = await Assert.ThrowsAsync<PostgresException>(() => contexto.Database.ExecuteSqlAsync(
                $"UPDATE cronoai.membro_empresa SET removido_em = {DateTime.UtcNow}, atualizado_em = {DateTime.UtcNow} WHERE usuario_id = {a}",
                TestContext.Current.CancellationToken));
            Assert.Equal("ck_empresa_tem_administrador", erro.ConstraintName);
        }

        Assert.Equal("administrador", await _banco.ConsultarComoSuperusuarioAsync($"SELECT perfil FROM cronoai.membro_empresa WHERE empresa_id = '{empresa}' AND usuario_id = '{a}'"));

        // Promover B e rebaixar A na MESMA transação passa (o gatilho é diferido: confere no COMMIT).
        await using (var contexto = Como(a, empresa))
        {
            await using var transacao = await contexto.Database.BeginTransactionAsync(TestContext.Current.CancellationToken);
            await contexto.Database.ExecuteSqlAsync($"UPDATE cronoai.membro_empresa SET perfil = {"administrador"}, escopo_obras = {"todas"} WHERE usuario_id = {b}", TestContext.Current.CancellationToken);
            await contexto.Database.ExecuteSqlAsync($"UPDATE cronoai.membro_empresa SET perfil = {"engenheiro_obra"}, escopo_obras = {"vinculadas"} WHERE usuario_id = {a}", TestContext.Current.CancellationToken);
            await transacao.CommitAsync(TestContext.Current.CancellationToken);
        }

        Assert.Equal("1", await _banco.ConsultarComoSuperusuarioAsync($"SELECT count(*) FROM cronoai.membro_empresa WHERE empresa_id = '{empresa}' AND perfil = 'administrador'"));

        // Controle negativo: com DOIS administradores, rebaixar um passa.
        var c = await _dados.CriarUsuarioAsync();
        await _dados.VincularAsync(empresa, c);
        await using (var contexto = Como(b, empresa))
        {
            await contexto.Database.ExecuteSqlAsync(
                $"UPDATE cronoai.membro_empresa SET perfil = {"engenheiro_obra"}, escopo_obras = {"vinculadas"} WHERE usuario_id = {c}",
                TestContext.Current.CancellationToken);
        }

        // Os gatilhos estão ENABLE ALWAYS ('A') no catálogo.
        Assert.Equal("A|A", await _banco.ConsultarComoSuperusuarioAsync("SELECT string_agg(tgenabled::text, '|' ORDER BY tgname) FROM pg_trigger WHERE tgname IN ('trg_membro_exige_administrador', 'trg_membro_garante_administrador')"));
    }

    [Fact]
    public async Task Dois_administradores_se_rebaixando_em_paralelo_um_sucesso_e_um_erro()
    {
        // Em READ COMMITTED cada rebaixamento ainda vê o outro como administrador: sem o advisory lock os dois passariam e a empresa
        // ficaria sem administrador. Aqui os dois chegam ao COMMIT juntos (barreira): 1 sucesso, 1 falha e 1 administrador.
        var empresa = await _dados.CriarEmpresaAsync(comAdministradorTecnico: false);
        var a1 = await _dados.CriarUsuarioAsync();
        var a2 = await _dados.CriarUsuarioAsync();
        await _dados.VincularAsync(empresa, a1);
        await _dados.VincularAsync(empresa, a2);

        using var barreira = new Barrier(2);

        async Task<string?> RebaixarAsync(Guid usuario)
        {
            await using var contexto = Como(usuario, empresa);
            await using var transacao = await contexto.Database.BeginTransactionAsync(TestContext.Current.CancellationToken);
            await contexto.Database.ExecuteSqlAsync(
                $"UPDATE cronoai.membro_empresa SET perfil = {"engenheiro_obra"}, escopo_obras = {"vinculadas"} WHERE usuario_id = {usuario}",
                TestContext.Current.CancellationToken);
            barreira.SignalAndWait(TimeSpan.FromSeconds(20), TestContext.Current.CancellationToken);
            try
            {
                await transacao.CommitAsync(TestContext.Current.CancellationToken);
                return null;
            }
            catch (PostgresException erro)
            {
                return erro.ConstraintName;
            }
        }

        var resultados = await Task.WhenAll(Task.Run(() => RebaixarAsync(a1), TestContext.Current.CancellationToken), Task.Run(() => RebaixarAsync(a2), TestContext.Current.CancellationToken));

        Assert.Single(resultados, r => r is null);
        Assert.Single(resultados, r => r == "ck_empresa_tem_administrador");
        Assert.Equal("1", await _banco.ConsultarComoSuperusuarioAsync($"SELECT count(*) FROM cronoai.membro_empresa WHERE empresa_id = '{empresa}' AND perfil = 'administrador' AND removido_em IS NULL"));
    }

    [Fact]
    public async Task Membro_insert_recusado_para_aplicacao()
    {
        // ESCALADA DE PRIVILÉGIO (achado bloqueante): a política antiga (empresa_id = E) deixava o app criar vínculo para QUALQUER
        // usuário. Agora o papel não tem INSERT (42501) e não há política de INSERT: três tentativas, todas recusadas.
        var c = await CenarioPermissoes.CriarAsync(_dados);
        var novo = await _dados.CriarUsuarioAsync();

        foreach (var (empresaDaLinha, usuarioDaLinha) in new[] { (c.EmpresaX, c.B), (c.EmpresaX, novo), (c.EmpresaY, novo) })
        {
            await using var contexto = Como(c.B, c.EmpresaX);
            var erro = await Assert.ThrowsAsync<PostgresException>(() => contexto.Database.ExecuteSqlAsync(
                $"INSERT INTO cronoai.membro_empresa (empresa_id, usuario_id, perfil, escopo_obras, criado_em, atualizado_em) VALUES ({empresaDaLinha}, {usuarioDaLinha}, {"administrador"}, {"todas"}, {DateTime.UtcNow}, {DateTime.UtcNow})",
                TestContext.Current.CancellationToken));
            Assert.Equal(PostgresErrorCodes.InsufficientPrivilege, erro.SqlState);
        }

        Assert.Equal("f", await _banco.ConsultarComoSuperusuarioAsync("SELECT has_table_privilege('cronoai_app', 'cronoai.membro_empresa', 'INSERT')"));
        Assert.Equal("0", await _banco.ConsultarComoSuperusuarioAsync("SELECT count(*) FROM pg_policies WHERE schemaname = 'cronoai' AND tablename = 'membro_empresa' AND cmd = 'INSERT'"));
        Assert.Equal("0", await _banco.ConsultarComoSuperusuarioAsync($"SELECT count(*) FROM cronoai.membro_empresa WHERE usuario_id = '{novo}'"));

        // Controle negativo (boot): a tabela aceita a linha, então a recusa acima é do privilégio e não de outro motivo.
        var (codigo, _, erroBoot) = await InserirComoSuperusuarioAsync(c.EmpresaX, novo, Perfis.EngenheiroObra, EscoposObras.Vinculadas);
        Assert.True(codigo == 0, erroBoot);
        Assert.Equal("1", await _banco.ConsultarComoSuperusuarioAsync($"SELECT count(*) FROM cronoai.membro_empresa WHERE usuario_id = '{novo}'"));
    }

    [Fact]
    public async Task Remocao_logica_no_banco()
    {
        var c = await CenarioPermissoes.CriarAsync(_dados);

        // Um gestor de carteiras gêmeo de C, atribuído à carteira K e depois REMOVIDO (vínculo físico segue existindo, inerte).
        var gestorRemovido = await _dados.CriarUsuarioAsync();
        await _dados.VincularAsync(c.EmpresaX, gestorRemovido, Perfis.GestorPortfolio, EscoposObras.Carteiras);
        await _dados.AtribuirCarteiraAsync(c.EmpresaX, c.CarteiraK, gestorRemovido);
        await _dados.RemoverMembroAsync(c.EmpresaX, gestorRemovido);

        // Obra: R (engenheiro removido, com acesso_obra à obra1) não vê; B (ativo, mesmo vínculo) vê. Uma asserção por ponto.
        Assert.Empty(await IdsAsync(c.R, c.EmpresaX, $"SELECT id AS \"Value\" FROM cronoai.obra"));
        Assert.Equal([c.Obra1], await IdsAsync(c.B, c.EmpresaX, $"SELECT id AS \"Value\" FROM cronoai.obra"));
        Assert.Equal("1", await _banco.ConsultarComoSuperusuarioAsync($"SELECT count(*) FROM cronoai.acesso_obra WHERE obra_id = '{c.Obra1}' AND usuario_id = '{c.R}'"));

        // acesso_carteira inerte: o gestor removido não vê a obra2 da carteira K; C (ativo, mesma carteira) vê.
        Assert.Empty(await IdsAsync(gestorRemovido, c.EmpresaX, $"SELECT id AS \"Value\" FROM cronoai.obra"));
        Assert.Equal([c.Obra2], await IdsAsync(c.C, c.EmpresaX, $"SELECT id AS \"Value\" FROM cronoai.obra"));

        // Empresa invisível para o removido; visível para o ativo (contexto só de usuário: vale o vínculo ativo).
        Assert.Empty(await IdsAsync(c.R, null, $"SELECT id AS \"Value\" FROM cronoai.empresa"));
        Assert.Equal([c.EmpresaX], await IdsAsync(c.B, null, $"SELECT id AS \"Value\" FROM cronoai.empresa"));
    }

    [Fact]
    public async Task Membro_versao_xmin()
    {
        var c = await CenarioPermissoes.CriarAsync(_dados);

        // Dois contextos leem o MESMO membro (mesmo xmin); o primeiro grava; o segundo, com o xmin velho, é recusado.
        await using var primeiro = Como(c.A, c.EmpresaX);
        await using var segundo = Como(c.A, c.EmpresaX);
        var lidoPeloPrimeiro = await primeiro.Membros.SingleAsync(m => m.UsuarioId == c.D, TestContext.Current.CancellationToken);
        var lidoPeloSegundo = await segundo.Membros.SingleAsync(m => m.UsuarioId == c.D, TestContext.Current.CancellationToken);
        Assert.Equal(lidoPeloPrimeiro.Versao, lidoPeloSegundo.Versao);

        lidoPeloPrimeiro.AlterarPerfil(Perfis.Suprimentos, EscoposObras.Vinculadas, DateTime.UtcNow);
        await primeiro.SalvarAuditadoAsync(Metadados(), TestContext.Current.CancellationToken);
        Assert.NotEqual(lidoPeloSegundo.Versao, lidoPeloPrimeiro.Versao);

        lidoPeloSegundo.AlterarPerfil(Perfis.EngenheiroObra, EscoposObras.Vinculadas, DateTime.UtcNow);
        await Assert.ThrowsAsync<DbUpdateConcurrencyException>(() => segundo.SalvarAuditadoAsync(Metadados(), TestContext.Current.CancellationToken));
        Assert.Equal("suprimentos", await _banco.ConsultarComoSuperusuarioAsync($"SELECT perfil FROM cronoai.membro_empresa WHERE empresa_id = '{c.EmpresaX}' AND usuario_id = '{c.D}'"));

        // Controle negativo: recarregado, o segundo grava (o UPDATE com RETURNING xmin funciona com GRANT só por coluna).
        await using var terceiro = Como(c.A, c.EmpresaX);
        var atual = await terceiro.Membros.SingleAsync(m => m.UsuarioId == c.D, TestContext.Current.CancellationToken);
        atual.AlterarPerfil(Perfis.EngenheiroObra, EscoposObras.Vinculadas, DateTime.UtcNow);
        await terceiro.SalvarAuditadoAsync(Metadados(), TestContext.Current.CancellationToken);
        Assert.Equal("engenheiro_obra", await _banco.ConsultarComoSuperusuarioAsync($"SELECT perfil FROM cronoai.membro_empresa WHERE empresa_id = '{c.EmpresaX}' AND usuario_id = '{c.D}'"));
    }

    #endregion

    #region Métodos privados

    private CronoDbContext Como(Guid usuario, Guid empresa) => _dados.Fabrica.Criar(new ContextoSessaoBanco(usuario, empresa));

    private static MetadadosEscrita Metadados() => new(OrigensAuditoria.Ui, null, null, DateTime.UtcNow);

    private async Task<List<Guid>> IdsAsync(Guid usuario, Guid? empresa, FormattableString sql)
    {
        await using var contexto = _dados.Fabrica.Criar(new ContextoSessaoBanco(usuario, empresa));
        return (await DadosTeste.LerIdsAsync(contexto, sql)).Order().ToList();
    }

    private Task<(long? CodigoSaida, string Saida, string Erro)> InserirComoSuperusuarioAsync(Guid empresa, Guid usuario, string perfil, string escopo) =>
        _banco.ExecutarScriptComoSuperusuarioAsync(
            $"INSERT INTO cronoai.membro_empresa (empresa_id, usuario_id, perfil, escopo_obras, criado_em, atualizado_em) VALUES ('{empresa}', '{usuario}', '{perfil}', '{escopo}', now(), now())");

    // Valores citados no CHECK (pg_get_constraintdef): 'a', 'b', ... → conjunto ordenado.
    private async Task<IEnumerable<string>> ValoresDoCheckAsync(string constraint)
    {
        var definicao = await _banco.ConsultarComoSuperusuarioAsync($"SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname = '{constraint}'");
        return ValorCitadoRegex().Matches(definicao).Select(m => m.Groups[1].Value).Distinct(StringComparer.Ordinal).Order(StringComparer.Ordinal).ToList();
    }

    [GeneratedRegex("'([a-z_]+)'")]
    private static partial Regex ValorCitadoRegex();

    #endregion
}
