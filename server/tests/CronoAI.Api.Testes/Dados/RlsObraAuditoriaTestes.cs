using CronoAI.Api.Testes.Infra;
using CronoAI.Dados;
using Microsoft.EntityFrameworkCore;
using Npgsql;

namespace CronoAI.Api.Testes.Dados;

/// <summary>
/// RLS de <c>obra</c> e <c>auditoria</c>, como <c>cronoai_app</c> e com SQL direto (sem o filtro do EF). Os negativos de
/// UPDATE (WITH CHECK) rodam SEM WHERE e SEM RETURNING: com eles a política de SELECT também se aplica à linha nova e
/// mascararia um WITH CHECK (true). A prova de que cada teste enxerga o afrouxamento é a mutação da política (relatório do ciclo).
/// </summary>
[Collection(ColecaoBanco.Nome)]
[Trait("Categoria", "Integracao")]
public sealed class RlsObraAuditoriaTestes
{
    #region Campos

    private readonly BancoPostgresFixture _banco;
    private readonly DadosTeste _dados;

    #endregion

    #region Construtor

    public RlsObraAuditoriaTestes(BancoPostgresFixture banco)
    {
        _banco = banco;
        _dados = new DadosTeste(banco);
    }

    #endregion

    #region Métodos públicos

    [Fact]
    public async Task Rls_obra_isola_empresas()
    {
        var (empresaA, empresaB, usuarioA, usuarioB) = await CriarDuasEmpresasAsync();
        var obraA1 = await _dados.CriarObraAsync(empresaA, usuarioA);
        var obraA2 = await _dados.CriarObraAsync(empresaA, usuarioA);
        var obraB = await _dados.CriarObraAsync(empresaB, usuarioB);

        // Sem contexto: nada. Com o contexto de A: só as de A.
        await using (var semContexto = _dados.Fabrica.Criar(ContextoSessaoBanco.Vazio))
        {
            Assert.Empty(await DadosTeste.LerIdsAsync(semContexto, $"SELECT id AS \"Value\" FROM cronoai.obra WHERE id IN ({obraA1.Id}, {obraB.Id})"));
        }

        await using var comoA = _dados.Fabrica.Criar(DadosTeste.ComoAdministrador(empresaA));
        var visiveis = await DadosTeste.LerIdsAsync(comoA, $"SELECT id AS \"Value\" FROM cronoai.obra WHERE id IN ({obraA1.Id}, {obraA2.Id}, {obraB.Id})");
        Assert.Equal(new[] { obraA1.Id, obraA2.Id }.Order(), visiveis.Order());

        // INSERT de linha da empresa B no contexto de A: WITH CHECK da política de INSERT.
        var intrusa = await Assert.ThrowsAsync<PostgresException>(() => _dados.InserirObraBrutaAsync(empresaA, empresaB, "Obra Intrusa " + Guid.NewGuid().ToString("N")));
        Assert.Equal(PostgresErrorCodes.InsufficientPrivilege, intrusa.SqlState);

        // UPDATE da obra de B no contexto de A: o USING não a enxerga (0 linhas, sem erro).
        var alheia = await comoA.Database.ExecuteSqlAsync($"UPDATE cronoai.obra SET nome = {"Invadida"} WHERE id = {obraB.Id}", TestContext.Current.CancellationToken);
        Assert.Equal(0, alheia);

        // UPDATE SEM WHERE e SEM ler coluna no SET (constante): com WHERE ou com SET que lê coluna o PostgreSQL aplica também a
        // política de SELECT, que mascararia um USING (true). Só as 2 obras de A (com USING "true", seriam todas as do banco).
        await using var comoA2 = _dados.Fabrica.Criar(DadosTeste.ComoAdministrador(empresaA));
        var proprias = await comoA2.Database.ExecuteSqlAsync($"UPDATE cronoai.obra SET responsavel_id = NULL", TestContext.Current.CancellationToken);
        Assert.Equal(2, proprias);
        Assert.Equal(1, await _dados.LerVersaoAsync(empresaB, obraB.Id));

        // Controle negativo (bootstrap, só na fixture): os dados das DUAS empresas existem; a invisibilidade acima é do RLS.
        var existentes = await _banco.ConsultarComoSuperusuarioAsync($"SELECT count(*) FROM cronoai.obra WHERE id IN ('{obraA1.Id}', '{obraA2.Id}', '{obraB.Id}')");
        Assert.Equal("3", existentes);
    }

    [Fact]
    public async Task Rls_auditoria_isola_empresas()
    {
        var (empresaA, empresaB, usuarioA, usuarioB) = await CriarDuasEmpresasAsync();
        var obraA = await _dados.CriarObraAsync(empresaA, usuarioA);
        var obraB = await _dados.CriarObraAsync(empresaB, usuarioB);

        await using var comoA = _dados.Fabrica.Criar(DadosTeste.ComoAdministrador(empresaA));
        var daEmpresa = await DadosTeste.LerIdsAsync(comoA, $"SELECT entidade_id AS \"Value\" FROM cronoai.auditoria WHERE entidade_id IN ({obraA.Id}, {obraB.Id})");
        Assert.Equal([obraA.Id], daEmpresa);

        await using (var semContexto = _dados.Fabrica.Criar(ContextoSessaoBanco.Vazio))
        {
            Assert.Empty(await DadosTeste.LerIdsAsync(semContexto, $"SELECT entidade_id AS \"Value\" FROM cronoai.auditoria WHERE entidade_id IN ({obraA.Id}, {obraB.Id})"));
        }

        // INSERT da própria empresa funciona como app (inclusive o identity, sem USAGE extra na sequência).
        await _dados.InserirAuditoriaBrutaAsync(empresaA, empresaA, usuarioA);

        // INSERT com a empresa de B no contexto de A: WITH CHECK da política de INSERT.
        var intrusa = await Assert.ThrowsAsync<PostgresException>(() => _dados.InserirAuditoriaBrutaAsync(empresaA, empresaB, usuarioA));
        Assert.Equal(PostgresErrorCodes.InsufficientPrivilege, intrusa.SqlState);

        // Controle negativo (bootstrap): as duas trilhas existem.
        var existentes = await _banco.ConsultarComoSuperusuarioAsync($"SELECT count(DISTINCT empresa_id) FROM cronoai.auditoria WHERE entidade_id IN ('{obraA.Id}', '{obraB.Id}')");
        Assert.Equal("2", existentes);
    }

    [Fact]
    public async Task Auditoria_de_empresa_inexistente_recusada_pela_fk_da_empresa()
    {
        var usuario = await _dados.CriarUsuarioAsync();
        var inexistente = Guid.NewGuid();

        // Como app: a linha sem obra exige administrador (rodada 02) e uma empresa inexistente não tem nenhum, então a POLÍTICA recusa
        // (42501) antes de a FK ser avaliada.
        var erro = await Assert.ThrowsAsync<PostgresException>(() => _dados.InserirAuditoriaBrutaAsync(inexistente, inexistente, usuario));
        Assert.Equal(PostgresErrorCodes.InsufficientPrivilege, erro.SqlState);

        // A FK da empresa, por si, recusa (superusuário: o RLS não se aplica). Prova que ela existe independente da política.
        var (codigo, _, erroDaFk) = await _banco.ExecutarScriptComoSuperusuarioAsync(
            $"INSERT INTO cronoai.auditoria (empresa_id, usuario_id, entidade, entidade_id, acao, origem, em) VALUES ('{inexistente}', '{usuario}', 'obra', '{Guid.NewGuid()}', 'criar', 'ui', now())");
        Assert.NotEqual(0, codigo);
        Assert.Contains("23503", erroDaFk, StringComparison.Ordinal);
        Assert.Contains("fk_auditoria_empresa", erroDaFk, StringComparison.Ordinal);

        // Controle negativo: com empresa existente (e o usuário administrador dela), o mesmo INSERT passa.
        var empresa = await _dados.CriarEmpresaComMembrosAsync(usuario);
        await _dados.InserirAuditoriaBrutaAsync(empresa, empresa, usuario);
    }

    [Fact]
    public async Task Obra_nao_muda_de_empresa()
    {
        var (empresaA, empresaB, usuarioA, _) = await CriarDuasEmpresasAsync();
        var obraA = await _dados.CriarObraAsync(empresaA, usuarioA);

        // Sem WHERE e sem RETURNING (ver o resumo da classe): só o WITH CHECK da política de UPDATE decide.
        await using var comoA = _dados.Fabrica.Criar(DadosTeste.ComoAdministrador(empresaA));
        var erro = await Assert.ThrowsAsync<PostgresException>(() => comoA.Database.ExecuteSqlAsync(
            $"UPDATE cronoai.obra SET empresa_id = {empresaB}",
            TestContext.Current.CancellationToken));
        Assert.Equal(PostgresErrorCodes.InsufficientPrivilege, erro.SqlState);
        Assert.Equal(empresaA.ToString("D"), await _banco.ConsultarComoSuperusuarioAsync($"SELECT empresa_id FROM cronoai.obra WHERE id = '{obraA.Id}'"));

        // Controle negativo: UPDATE de outra coluna, no mesmo contexto, passa (o harness consegue escrever).
        await using var comoA2 = _dados.Fabrica.Criar(DadosTeste.ComoAdministrador(empresaA));
        Assert.True(await comoA2.Database.ExecuteSqlAsync($"UPDATE cronoai.obra SET nome = {"Renomeada " + Guid.NewGuid().ToString("N")}", TestContext.Current.CancellationToken) >= 1);
    }

    #endregion

    #region Métodos privados

    private async Task<(Guid EmpresaA, Guid EmpresaB, Guid UsuarioA, Guid UsuarioB)> CriarDuasEmpresasAsync()
    {
        var usuarioA = await _dados.CriarUsuarioAsync();
        var usuarioB = await _dados.CriarUsuarioAsync();
        var empresaA = await _dados.CriarEmpresaComMembrosAsync(usuarioA);
        var empresaB = await _dados.CriarEmpresaComMembrosAsync(usuarioB);
        return (empresaA, empresaB, usuarioA, usuarioB);
    }

    #endregion
}
