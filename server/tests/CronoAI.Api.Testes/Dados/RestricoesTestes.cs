using CronoAI.Api.Testes.Infra;
using CronoAI.Dados;
using Microsoft.EntityFrameworkCore;
using Npgsql;

namespace CronoAI.Api.Testes.Dados;

/// <summary>CHECKs de tamanho e de datas (SQLSTATE 23514), exercitados por SQL direto como <c>cronoai_app</c>.</summary>
[Collection(ColecaoBanco.Nome)]
[Trait("Categoria", "Integracao")]
public sealed class RestricoesTestes
{
    #region Campos

    private readonly DadosTeste _dados;

    #endregion

    #region Construtor

    public RestricoesTestes(BancoPostgresFixture banco)
    {
        _dados = new DadosTeste(banco);
    }

    #endregion

    #region Métodos públicos

    [Theory]
    [InlineData("emissor_vazio")]
    [InlineData("sujeito_com_256_caracteres")]
    [InlineData("expira_em_nao_posterior_a_criada_em")]
    [InlineData("encerrada_em_anterior_a_criada_em")]
    public async Task Checks_de_tamanho_e_datas(string caso)
    {
        var agora = DateTime.UtcNow;
        var usuarioId = await _dados.CriarUsuarioAsync();
        var sujeitoNovo = "s-" + Guid.NewGuid().ToString("N");

        // Usuário e sessão: cada INSERT com o contexto exigido (sessão exige usuário no contexto).
        await using var contexto = _dados.Fabrica.Criar(ContextoSessaoBanco.DoUsuario(usuarioId));
        Task<int> inserir = caso switch
        {
            "emissor_vazio" => contexto.Database.ExecuteSqlAsync(
                $"INSERT INTO cronoai.usuario (id, emissor, sujeito, criado_em, ultimo_acesso_em) VALUES ({Guid.CreateVersion7()}, {""}, {sujeitoNovo}, {agora}, {agora})",
                TestContext.Current.CancellationToken),
            "sujeito_com_256_caracteres" => contexto.Database.ExecuteSqlAsync(
                $"INSERT INTO cronoai.usuario (id, emissor, sujeito, criado_em, ultimo_acesso_em) VALUES ({Guid.CreateVersion7()}, {"https://idp.teste"}, {new string('x', 256)}, {agora}, {agora})",
                TestContext.Current.CancellationToken),
            "expira_em_nao_posterior_a_criada_em" => contexto.Database.ExecuteSqlAsync(
                $"INSERT INTO cronoai.sessao (id, usuario_id, criada_em, expira_em) VALUES ({Guid.NewGuid()}, {usuarioId}, {agora}, {agora})",
                TestContext.Current.CancellationToken),
            "encerrada_em_anterior_a_criada_em" => contexto.Database.ExecuteSqlAsync(
                $"INSERT INTO cronoai.sessao (id, usuario_id, criada_em, expira_em, encerrada_em) VALUES ({Guid.NewGuid()}, {usuarioId}, {agora}, {agora.AddHours(1)}, {agora.AddMinutes(-1)})",
                TestContext.Current.CancellationToken),
            _ => throw new InvalidOperationException(caso),
        };

        var erro = await Assert.ThrowsAsync<PostgresException>(() => inserir);

        Assert.Equal(PostgresErrorCodes.CheckViolation, erro.SqlState);
    }

    #endregion
}
