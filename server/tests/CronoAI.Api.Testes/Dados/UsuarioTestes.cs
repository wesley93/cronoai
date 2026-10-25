using CronoAI.Api.Testes.Infra;
using CronoAI.Dados;
using Microsoft.EntityFrameworkCore;
using Npgsql;

namespace CronoAI.Api.Testes.Dados;

[Collection(ColecaoBanco.Nome)]
[Trait("Categoria", "Integracao")]
public sealed class UsuarioTestes
{
    #region Campos

    private readonly DadosTeste _dados;

    #endregion

    #region Construtor

    public UsuarioTestes(BancoPostgresFixture banco)
    {
        _dados = new DadosTeste(banco);
    }

    #endregion

    #region Métodos públicos

    [Fact]
    public async Task Usuario_unico_por_emissor_e_sujeito()
    {
        var sujeito = "sub-" + Guid.NewGuid().ToString("N");
        await _dados.CriarUsuarioAsync(sujeito, "https://idp.teste");

        // Inserção direta com outro id e o mesmo par: a restrição UNIQUE (emissor, sujeito) recusa.
        await using var contexto = _dados.Fabrica.Criar(ContextoSessaoBanco.Vazio);
        var agora = DateTime.UtcNow;
        var erro = await Assert.ThrowsAsync<PostgresException>(() => contexto.Database.ExecuteSqlAsync(
            $"INSERT INTO cronoai.usuario (id, emissor, sujeito, criado_em, ultimo_acesso_em) VALUES ({Guid.CreateVersion7()}, {"https://idp.teste"}, {sujeito}, {agora}, {agora})",
            TestContext.Current.CancellationToken));

        Assert.Equal(PostgresErrorCodes.UniqueViolation, erro.SqlState);
    }

    [Fact]
    public async Task Upsert_devolve_o_mesmo_id_para_o_mesmo_par_e_diferencia_emissores()
    {
        var sujeito = "sub-" + Guid.NewGuid().ToString("N");

        var primeiro = await _dados.CriarUsuarioAsync(sujeito, "https://idp.teste");
        var segundo = await _dados.CriarUsuarioAsync(sujeito, "https://idp.teste");
        var outroEmissor = await _dados.CriarUsuarioAsync(sujeito, "https://outro.teste");

        Assert.Equal(primeiro, segundo);
        Assert.NotEqual(primeiro, outroEmissor);
    }

    #endregion
}
