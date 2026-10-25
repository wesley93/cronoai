using CronoAI.Api.Desenvolvimento;
using CronoAI.Api.Testes.Infra;
using CronoAI.Dados;
using Microsoft.EntityFrameworkCore;

namespace CronoAI.Api.Testes.Autenticacao;

[Collection(ColecaoBanco.Nome)]
[Trait("Categoria", "Integracao")]
public sealed class SementeDesenvolvimentoTestes
{
    #region Campos

    private readonly BancoPostgresFixture _banco;

    #endregion

    #region Construtor

    public SementeDesenvolvimentoTestes(BancoPostgresFixture banco)
    {
        _banco = banco;
    }

    #endregion

    #region Métodos públicos

    [Theory]
    [InlineData("Production")]
    [InlineData("Staging")]
    public async Task Semente_recusa_fora_de_Development(string ambiente)
    {
        var semente = CriarSemente(ambiente);

        var erro = await Assert.ThrowsAsync<InvalidOperationException>(() => semente.ExecutarAsync(TestContext.Current.CancellationToken));

        Assert.Contains("Development", erro.Message, StringComparison.Ordinal);
    }

    [Fact]
    public async Task Semente_e_idempotente_com_ids_fixos()
    {
        var semente = CriarSemente("Development");

        await semente.ExecutarAsync(TestContext.Current.CancellationToken);
        await semente.ExecutarAsync(TestContext.Current.CancellationToken);

        // Cada empresa, lida com o contexto dela (o RLS exige): 1 linha de empresa; vínculos 1 + 1 + 2 = 4.
        var vinculos = 0;
        foreach (var (empresaId, nome, esperados) in new[]
        {
            (IdsDesenvolvimento.EmpresaA, IdsDesenvolvimento.NomeEmpresaA, 1),
            (IdsDesenvolvimento.EmpresaB, IdsDesenvolvimento.NomeEmpresaB, 1),
            (IdsDesenvolvimento.EmpresaCompartilhada, IdsDesenvolvimento.NomeEmpresaCompartilhada, 2),
        })
        {
            await using var contexto = _banco.FabricaApp.Criar(ContextoSessaoBanco.DaEmpresa(empresaId));
            var empresas = await contexto.Database.SqlQuery<string>($"SELECT nome AS \"Value\" FROM cronoai.empresa WHERE id = {empresaId}").ToListAsync(TestContext.Current.CancellationToken);
            var membros = await contexto.Database.SqlQuery<int>($"SELECT count(*)::int AS \"Value\" FROM cronoai.membro_empresa WHERE empresa_id = {empresaId}").ToListAsync(TestContext.Current.CancellationToken);

            Assert.Equal([nome], empresas);
            Assert.Equal(esperados, membros.Single());
            vinculos += membros.Single();
        }

        Assert.Equal(4, vinculos);
    }

    [Fact]
    public async Task Semente_usa_o_papel_da_aplicacao_e_emissor_reservado()
    {
        await CriarSemente("Development").ExecutarAsync(TestContext.Current.CancellationToken);

        Assert.Equal(1, await ConsultaBanco.ContarUsuariosAsync(_banco, "urn:cronoai:desenvolvimento", IdsDesenvolvimento.SujeitoDevA));
        Assert.Equal(1, await ConsultaBanco.ContarUsuariosAsync(_banco, "urn:cronoai:desenvolvimento", IdsDesenvolvimento.SujeitoDevB));
    }

    #endregion

    #region Métodos privados

    private SementeDesenvolvimento CriarSemente(string ambiente)
    {
        var fabrica = _banco.FabricaApp;
        return new SementeDesenvolvimento(fabrica, new CronoAI.Dados.Identidade.ConsultasIdentidade(fabrica), new AmbienteFalso(ambiente), TimeProvider.System);
    }

    #endregion
}
