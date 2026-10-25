using CronoAI.Api.Testes.Infra;
using CronoAI.Api.Testes.Infra.IdpTeste;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.AspNetCore.DataProtection.KeyManagement;
using Microsoft.AspNetCore.DataProtection.Repositories;
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
        using var fabrica = new ApiFactory(ApiFactory.ConexaoSemBanco, ambiente) { SemAnelDeChaves = true, Logs = new LogsEmMemoria() };

        var texto = PartidaDoHost.ExigirFalha(fabrica, "CaminhoAnel");

        Assert.Contains("OptionsValidationException", texto, StringComparison.Ordinal);
        Assert.Contains("CaminhoAnel", texto, StringComparison.Ordinal);
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

    [Fact]
    public void Em_Development_sem_caminho_o_anel_padrao_fica_fora_do_repositorio()
    {
        // Caminho PADRÃO (BordaExtensoes): sem DataProtection:CaminhoAnel, em Development vale %LOCALAPPDATA%/CronoAI/chaves.
        // Só se monta o host (nenhuma requisição): nenhuma chave é criada no disco do desenvolvedor.
        using var fabrica = new ApiFactory(ApiFactory.ConexaoSemBanco, "Development") { SemAnelDeChaves = true };

        var repositorio = fabrica.Services.GetRequiredService<IOptions<KeyManagementOptions>>().Value.XmlRepository as FileSystemXmlRepository;

        Assert.NotNull(repositorio);
        var caminho = Path.GetFullPath(repositorio.Directory.FullName);
        var esperado = Path.GetFullPath(Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "CronoAI", "chaves"));
        Assert.Equal(esperado.TrimEnd(Path.DirectorySeparatorChar), caminho.TrimEnd(Path.DirectorySeparatorChar), ignoreCase: OperatingSystem.IsWindows());

        // Fora da raiz do git (repositório ou worktree): a pasta do anel nunca entra no controle de versão.
        var raiz = RaizDoGit();
        Assert.False(caminho.StartsWith(raiz, OperatingSystem.IsWindows() ? StringComparison.OrdinalIgnoreCase : StringComparison.Ordinal), $"anel dentro do repositório: {caminho}");
    }

    #endregion

    #region Métodos privados

    // Raiz do git: pasta com ".git" (diretório, ou arquivo no caso de worktree), subindo a partir do binário de teste.
    private static string RaizDoGit()
    {
        var pasta = new DirectoryInfo(AppContext.BaseDirectory);
        while (pasta is not null && !Directory.Exists(Path.Combine(pasta.FullName, ".git")) && !File.Exists(Path.Combine(pasta.FullName, ".git")))
        {
            pasta = pasta.Parent;
        }

        return pasta?.FullName ?? throw new InvalidOperationException(".git não encontrado acima do binário de teste.");
    }

    #endregion
}
