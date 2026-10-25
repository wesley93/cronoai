using CronoAI.Api.Testes.Infra;
using CronoAI.Api.Testes.Infra.IdpTeste;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;

namespace CronoAI.Api.Testes.Autenticacao;

[Collection(ColecaoBanco.Nome)]
[Trait("Categoria", "Integracao")]
public sealed class DataProtectionTestes
{
    #region Campos

    private readonly BancoPostgresFixture _banco;

    #endregion

    #region Construtor

    public DataProtectionTestes(BancoPostgresFixture banco)
    {
        _banco = banco;
    }

    #endregion

    #region Métodos públicos

    [Theory]
    [InlineData("Production")]
    [InlineData("Staging")]
    public void Fora_de_Development_sem_anel_configurado_api_nao_sobe(string ambiente)
    {
        using var fabrica = new ApiFactory(ApiFactory.ConexaoSemBanco, ambiente) { SemAnelDeChaves = true };

        var erro = Record.Exception(() => fabrica.CreateClient());

        var validacao = Excecoes.Procurar<OptionsValidationException>(erro);
        Assert.NotNull(validacao);
        Assert.Contains("CaminhoAnel", string.Join(' ', validacao.Failures), StringComparison.Ordinal);
    }

    [Fact]
    public async Task Anel_fica_fora_do_repositorio_e_o_nome_do_aplicativo_e_fixo()
    {
        using var idp = new IdpEmMemoria();
        await using var fabrica = new ApiFactory(_banco.StringConexaoApp) { Idp = idp };
        using var navegador = fabrica.CriarNavegador();
        (await ClienteAutenticado.LoginOidcAsync(navegador, idp)).Dispose();

        var opcoes = fabrica.Services.GetRequiredService<IOptions<DataProtectionOptions>>().Value;

        Assert.Equal("CronoAI", opcoes.ApplicationDiscriminator);
        Assert.NotEmpty(Directory.GetFiles(fabrica.PastaAnel, "key-*.xml"));
        Assert.StartsWith(Path.GetTempPath(), fabrica.PastaAnel, StringComparison.OrdinalIgnoreCase);
    }

    #endregion
}
