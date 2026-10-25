using CronoAI.Api.Testes.Infra;
using CronoAI.Dados;
using Microsoft.EntityFrameworkCore;
using Npgsql;

namespace CronoAI.Api.Testes.Dados;

/// <summary>
/// Eficácia do RLS, como <c>cronoai_app</c>, SEM o filtro do EF (SQL direto): o banco nega a linha mesmo se o
/// filtro for esquecido. O dono também se sujeita (FORCE).
/// </summary>
[Collection(ColecaoBanco.Nome)]
[Trait("Categoria", "Integracao")]
public sealed class RlsTestes
{
    #region Campos

    private readonly BancoPostgresFixture _banco;
    private readonly DadosTeste _dados;

    #endregion

    #region Construtor

    public RlsTestes(BancoPostgresFixture banco)
    {
        _banco = banco;
        _dados = new DadosTeste(banco);
    }

    #endregion

    #region Métodos públicos

    [Fact]
    public async Task Sem_contexto_a_aplicacao_nao_ve_empresa_membro_nem_sessao()
    {
        var usuario = await _dados.CriarUsuarioAsync();
        var empresa = await _dados.CriarEmpresaComMembrosAsync(usuario);
        await _dados.CriarSessaoAsync(usuario, empresa);

        await using var contexto = _dados.Fabrica.Criar(ContextoSessaoBanco.Vazio);

        Assert.Equal(0, await Contar(contexto, "empresa"));
        Assert.Equal(0, await Contar(contexto, "membro_empresa"));
        Assert.Equal(0, await Contar(contexto, "sessao"));
    }

    [Fact]
    public async Task Politica_de_empresa_por_membro_e_por_empresa_ativa()
    {
        var usuario = await _dados.CriarUsuarioAsync();
        var naoMembro = await _dados.CriarUsuarioAsync();
        var empresaA = await _dados.CriarEmpresaComMembrosAsync(usuario);
        var empresaB = await _dados.CriarEmpresaComMembrosAsync(usuario);
        var empresaC = await _dados.CriarEmpresaAsync();

        // Contexto só de usuário, membro de 2 empresas: vê as 2 (e não a C).
        await using (var comoMembro = _dados.Fabrica.Criar(ContextoSessaoBanco.DoUsuario(usuario)))
        {
            var visiveis = await DadosTeste.LerIdsAsync(comoMembro, $"SELECT id AS \"Value\" FROM cronoai.empresa WHERE id IN ({empresaA}, {empresaB}, {empresaC})");
            Assert.Equal(new[] { empresaA, empresaB }.Order(), visiveis.Order());
        }

        // Não membro: zero.
        await using (var comoOutro = _dados.Fabrica.Criar(ContextoSessaoBanco.DoUsuario(naoMembro)))
        {
            Assert.Empty(await DadosTeste.LerIdsAsync(comoOutro, $"SELECT id AS \"Value\" FROM cronoai.empresa WHERE id IN ({empresaA}, {empresaB}, {empresaC})"));
        }

        // Contexto só de empresa: só a ativa.
        await using var comEmpresa = _dados.Fabrica.Criar(ContextoSessaoBanco.DaEmpresa(empresaA));
        var soA = await DadosTeste.LerIdsAsync(comEmpresa, $"SELECT id AS \"Value\" FROM cronoai.empresa WHERE id IN ({empresaA}, {empresaB}, {empresaC})");
        Assert.Equal([empresaA], soA);
    }

    [Fact]
    public async Task Com_contexto_A_FromSql_sem_filtro_do_EF_so_ve_A()
    {
        var usuario = await _dados.CriarUsuarioAsync();
        var empresaA = await _dados.CriarEmpresaComMembrosAsync(usuario);
        var empresaB = await _dados.CriarEmpresaComMembrosAsync(usuario);

        await using var contexto = _dados.Fabrica.Criar(ContextoSessaoBanco.DaEmpresa(empresaA));
        var empresasDosVinculos = await DadosTeste.LerIdsAsync(contexto, $"SELECT empresa_id AS \"Value\" FROM cronoai.membro_empresa WHERE empresa_id IN ({empresaA}, {empresaB})");

        Assert.NotEmpty(empresasDosVinculos);
        Assert.All(empresasDosVinculos, id => Assert.Equal(empresaA, id));
    }

    [Fact]
    public async Task Insert_com_empresa_diferente_do_contexto_falha()
    {
        var empresaA = await _dados.CriarEmpresaAsync();
        var outraEmpresa = Guid.CreateVersion7();
        var agora = DateTime.UtcNow;

        await using var contexto = _dados.Fabrica.Criar(ContextoSessaoBanco.DaEmpresa(empresaA));
        var erro = await Assert.ThrowsAsync<PostgresException>(() => contexto.Database.ExecuteSqlAsync(
            $"INSERT INTO cronoai.empresa (id, nome, criada_em) VALUES ({outraEmpresa}, {"Empresa Ficticia Intrusa"}, {agora})",
            TestContext.Current.CancellationToken));

        Assert.Equal(PostgresErrorCodes.InsufficientPrivilege, erro.SqlState);
    }

    [Fact]
    public async Task Usuario_nao_ve_nem_altera_sessao_de_outro()
    {
        var usuarioA = await _dados.CriarUsuarioAsync();
        var usuarioB = await _dados.CriarUsuarioAsync();
        var sessaoA = await _dados.CriarSessaoAsync(usuarioA);

        await using var comoB = _dados.Fabrica.Criar(ContextoSessaoBanco.DoUsuario(usuarioB));
        var visiveis = await DadosTeste.LerIdsAsync(comoB, $"SELECT id AS \"Value\" FROM cronoai.sessao WHERE id = {sessaoA.Id}");
        var alteradas = await comoB.Database.ExecuteSqlAsync(
            $"UPDATE cronoai.sessao SET encerrada_em = {DateTime.UtcNow.AddMinutes(1)} WHERE id = {sessaoA.Id}",
            TestContext.Current.CancellationToken);

        Assert.Empty(visiveis);
        Assert.Equal(0, alteradas);
    }

    [Fact]
    public async Task Dono_tambem_se_sujeita_ao_rls()
    {
        var usuario = await _dados.CriarUsuarioAsync();
        var empresa = await _dados.CriarEmpresaComMembrosAsync(usuario);
        await _dados.CriarSessaoAsync(usuario, empresa);

        // Migrador (dono) sem contexto E com as variáveis app.* setadas: as políticas são TO cronoai_app,
        // então nenhuma se aplica a ele: zero linhas em ambos os casos.
        foreach (var contextoDoBanco in new[] { ContextoSessaoBanco.Vazio, new ContextoSessaoBanco(usuario, empresa) })
        {
            await using var comoDono = _banco.FabricaMigrador.Criar(contextoDoBanco);
            Assert.Equal(0, await Contar(comoDono, "empresa"));
            Assert.Equal(0, await Contar(comoDono, "membro_empresa"));
            Assert.Equal(0, await Contar(comoDono, "sessao"));
        }
    }

    #endregion

    #region Métodos privados

    // Nome da tabela é constante do teste (nunca entrada); o filtro do EF não participa (SQL direto).
    private static async Task<int> Contar(CronoDbContext contexto, string tabela)
    {
        var sql = tabela switch
        {
            "empresa" => contexto.Database.SqlQuery<int>($"SELECT count(*)::int AS \"Value\" FROM cronoai.empresa"),
            "membro_empresa" => contexto.Database.SqlQuery<int>($"SELECT count(*)::int AS \"Value\" FROM cronoai.membro_empresa"),
            "sessao" => contexto.Database.SqlQuery<int>($"SELECT count(*)::int AS \"Value\" FROM cronoai.sessao"),
            _ => throw new InvalidOperationException(tabela),
        };
        return (await sql.ToListAsync()).Single();
    }

    #endregion
}
