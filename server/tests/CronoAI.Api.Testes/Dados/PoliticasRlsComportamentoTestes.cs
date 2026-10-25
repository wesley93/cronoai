using CronoAI.Api.Testes.Infra;
using CronoAI.Dados;
using Microsoft.EntityFrameworkCore;
using Npgsql;

namespace CronoAI.Api.Testes.Dados;

/// <summary>
/// Comportamento das políticas de escrita do RLS, como <c>cronoai_app</c>, com SQL direto (sem o filtro do EF, e SEM
/// filtrar por usuário no DELETE, para o RLS ser a única barreira). Complementa o teste de catálogo, que fixa o texto
/// dos predicados: aqui se prova o efeito.
/// </summary>
[Collection(ColecaoBanco.Nome)]
[Trait("Categoria", "Integracao")]
public sealed class PoliticasRlsComportamentoTestes
{
    #region Campos

    private readonly DadosTeste _dados;

    #endregion

    #region Construtor

    public PoliticasRlsComportamentoTestes(BancoPostgresFixture banco)
    {
        _dados = new DadosTeste(banco);
    }

    #endregion

    #region Métodos públicos

    [Fact]
    public async Task Insert_de_sessao_com_outro_usuario_id_falha_com_42501()
    {
        var usuarioA = await _dados.CriarUsuarioAsync();
        var usuarioB = await _dados.CriarUsuarioAsync();
        var agora = DateTime.UtcNow;

        // Contexto do usuário A tentando gravar uma sessão que pertence a B: WITH CHECK (usuario_id = usuário do contexto).
        await using var comoA = _dados.Fabrica.Criar(ContextoSessaoBanco.DoUsuario(usuarioA));
        var erro = await Assert.ThrowsAsync<PostgresException>(() => comoA.Database.ExecuteSqlAsync(
            $"INSERT INTO cronoai.sessao (id, usuario_id, criada_em, expira_em) VALUES ({Guid.NewGuid()}, {usuarioB}, {agora}, {agora.AddHours(8)})",
            TestContext.Current.CancellationToken));

        Assert.Equal(PostgresErrorCodes.InsufficientPrivilege, erro.SqlState);
    }

    [Fact]
    public async Task Insert_de_vinculo_em_membro_empresa_com_outra_empresa_falha_com_42501()
    {
        var usuario = await _dados.CriarUsuarioAsync();
        var empresaA = await _dados.CriarEmpresaAsync();
        var empresaB = await _dados.CriarEmpresaAsync();
        var agora = DateTime.UtcNow;

        // Contexto da empresa A gravando um vínculo da empresa B (a empresa B existe: a FK não é o motivo da recusa).
        await using var comoA = _dados.Fabrica.Criar(ContextoSessaoBanco.DaEmpresa(empresaA));
        var erro = await Assert.ThrowsAsync<PostgresException>(() => comoA.Database.ExecuteSqlAsync(
            $"INSERT INTO cronoai.membro_empresa (empresa_id, usuario_id, criado_em) VALUES ({empresaB}, {usuario}, {agora})",
            TestContext.Current.CancellationToken));

        Assert.Equal(PostgresErrorCodes.InsufficientPrivilege, erro.SqlState);
    }

    [Fact]
    public async Task Update_de_sessao_trocando_usuario_id_falha_com_42501()
    {
        var usuarioA = await _dados.CriarUsuarioAsync();
        var usuarioB = await _dados.CriarUsuarioAsync();
        var sessaoA = await _dados.CriarSessaoAsync(usuarioA);

        // A enxerga a própria sessão (USING passa), mas o WITH CHECK recusa a linha nova com usuario_id de B. O SQL não tem
        // WHERE: com WHERE (ou RETURNING) o PostgreSQL também aplica a política de SELECT à linha nova, e ela mascararia um
        // WITH CHECK (true) na política de UPDATE (verificado por mutação). Sem WHERE só a política de UPDATE decide.
        await using var comoA = _dados.Fabrica.Criar(ContextoSessaoBanco.DoUsuario(usuarioA));
        var erro = await Assert.ThrowsAsync<PostgresException>(() => comoA.Database.ExecuteSqlAsync(
            $"UPDATE cronoai.sessao SET usuario_id = {usuarioB}",
            TestContext.Current.CancellationToken));

        Assert.Equal(PostgresErrorCodes.InsufficientPrivilege, erro.SqlState);
    }

    [Fact]
    public async Task Delete_sem_filtro_so_apaga_a_sessao_do_proprio_usuario_e_nunca_a_de_outro()
    {
        var usuarioA = await _dados.CriarUsuarioAsync();
        var usuarioB = await _dados.CriarUsuarioAsync();
        var sessaoA = await _dados.CriarSessaoAsync(usuarioA);
        await _dados.CriarSessaoAsync(usuarioB);

        // O SQL NÃO filtra por usuario_id (nem tem WHERE: com WHERE a política de SELECT também esconderia a linha e
        // mascararia um USING (true) na política de DELETE, verificado por mutação). B apaga TUDO o que o RLS deixa:
        // só a própria sessão. A de A não pode ser tocada.
        await using var comoB = _dados.Fabrica.Criar(ContextoSessaoBanco.DoUsuario(usuarioB));
        var apagadas = await comoB.Database.ExecuteSqlAsync(
            $"DELETE FROM cronoai.sessao",
            TestContext.Current.CancellationToken);

        Assert.Equal(1, apagadas);
        await using var comoA = _dados.Fabrica.Criar(ContextoSessaoBanco.DoUsuario(usuarioA));
        var restantes = await comoA.Database
            .SqlQuery<int>($"SELECT count(*)::int AS \"Value\" FROM cronoai.sessao WHERE id = {sessaoA.Id}")
            .ToListAsync(TestContext.Current.CancellationToken);
        Assert.Equal(1, restantes.Single());
    }

    #endregion
}
