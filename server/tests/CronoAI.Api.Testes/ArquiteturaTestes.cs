using System.Text.RegularExpressions;
using CronoAI.Dados;
using CronoAI.Dominio;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata;

namespace CronoAI.Api.Testes;

public sealed partial class ArquiteturaTestes
{
    #region Campos

    // Único acesso permitido a DbSet<Usuario> em server/src (ADR 00006): consultas de identidade, a semente e a
    // própria declaração do DbSet no contexto.
    private static readonly string[] _arquivosComAcessoAUsuario = ["ConsultasIdentidade.cs", "SementeDesenvolvimento.cs", "CronoDbContext.cs"];

    #endregion

    #region Métodos públicos

    [Fact]
    public void Dados_nao_referencia_Api_e_Api_referencia_Dados()
    {
        // Direção: Api -> Dados -> Dominio. Nenhum projeto referencia a Api.
        var referenciadosPeloDados = typeof(CronoDbContext).Assembly.GetReferencedAssemblies().Select(a => a.Name);
        var referenciadosPelaApi = typeof(Program).Assembly.GetReferencedAssemblies().Select(a => a.Name);

        Assert.DoesNotContain("CronoAI.Api", referenciadosPeloDados);
        Assert.Contains("CronoAI.Dados", referenciadosPelaApi);
    }

    [Fact]
    public void Dominio_nao_referencia_EF_nem_AspNetCore()
    {
        var referenciados = typeof(Empresa).Assembly.GetReferencedAssemblies().Select(a => a.Name ?? "").ToList();

        Assert.DoesNotContain(referenciados, n => n.StartsWith("Microsoft.EntityFrameworkCore", StringComparison.Ordinal));
        Assert.DoesNotContain(referenciados, n => n.StartsWith("Microsoft.AspNetCore", StringComparison.Ordinal));
        Assert.DoesNotContain(referenciados, n => n.StartsWith("Npgsql", StringComparison.Ordinal));
        Assert.DoesNotContain("CronoAI.Dados", referenciados);
        Assert.DoesNotContain("CronoAI.Api", referenciados);
    }

    [Fact]
    public void Modelo_so_tem_fks_restrict()
    {
        using var contexto = CriarContextoDeModelo();
        var chaves = contexto.Model.GetEntityTypes().SelectMany(t => t.GetForeignKeys()).ToList();

        Assert.NotEmpty(chaves);
        Assert.All(chaves, fk => Assert.Equal(DeleteBehavior.Restrict, fk.DeleteBehavior));
    }

    [Fact]
    public void Decimais_tem_precisao_explicita()
    {
        // Nenhuma propriedade decimal hoje; a regra vale a partir do 00013 (numeric com HasPrecision, nunca o padrão do EF).
        using var contexto = CriarContextoDeModelo();
        var decimais = contexto.Model.GetEntityTypes()
            .SelectMany(t => t.GetProperties())
            .Where(p => p.ClrType == typeof(decimal) || p.ClrType == typeof(decimal?))
            .ToList();

        Assert.All(decimais, p => Assert.NotNull(p.GetPrecision()));
    }

    [Fact]
    public void Entidade_com_EmpresaId_implementa_IDadoDeEmpresa_e_tem_filtro_Empresa()
    {
        using var contexto = CriarContextoDeModelo();

        foreach (var tipo in contexto.Model.GetEntityTypes())
        {
            var temEmpresaId = tipo.ClrType.GetProperty("EmpresaId") is not null;
            var implementa = typeof(IDadoDeEmpresa).IsAssignableFrom(tipo.ClrType);

            // Toda entidade com EmpresaId implementa a interface (e vice-versa)...
            Assert.True(temEmpresaId == implementa, $"{tipo.ClrType.Name}: EmpresaId e IDadoDeEmpresa precisam andar juntos");

            // ...e quem implementa tem o filtro nomeado "Empresa".
            if (implementa)
            {
                Assert.Contains(tipo.GetDeclaredQueryFilters(), f => f.Key == CronoDbContext.FiltroEmpresa);
            }
        }
    }

    [Fact]
    public void Usuario_so_e_acessado_em_identidade_e_semente()
    {
        var raiz = RaizServidor();
        var arquivos = Directory.GetFiles(Path.Combine(raiz, "src"), "*.cs", SearchOption.AllDirectories)
            .Where(a => !a.Contains($"{Path.DirectorySeparatorChar}obj{Path.DirectorySeparatorChar}", StringComparison.Ordinal)
                     && !a.Contains($"{Path.DirectorySeparatorChar}bin{Path.DirectorySeparatorChar}", StringComparison.Ordinal)
                     && !a.Contains($"{Path.DirectorySeparatorChar}Migrations{Path.DirectorySeparatorChar}", StringComparison.Ordinal))
            .ToList();
        Assert.NotEmpty(arquivos);

        var infratores = arquivos
            .Where(a => AcessoAUsuarioRegex().IsMatch(File.ReadAllText(a)))
            .Select(Path.GetFileName)
            .Where(nome => !_arquivosComAcessoAUsuario.Contains(nome!))
            .ToList();

        Assert.Empty(infratores);
    }

    #endregion

    #region Métodos privados

    [GeneratedRegex(@"\.Usuarios\b|Set<Usuario>\s*\(")]
    private static partial Regex AcessoAUsuarioRegex();

    // Contexto só para ler o modelo: não abre conexão.
    private static CronoDbContext CriarContextoDeModelo()
    {
        var opcoes = new DbContextOptionsBuilder<CronoDbContext>();
        CronoDbContextConfiguracao.Configurar(opcoes, "Host=localhost;Database=cronoai;Username=ef_design");
        return new CronoDbContext(opcoes.Options, ContextoSessaoBanco.Vazio);
    }

    private static string RaizServidor()
    {
        var pasta = new DirectoryInfo(AppContext.BaseDirectory);
        while (pasta is not null && !File.Exists(Path.Combine(pasta.FullName, "CronoAI.slnx")))
        {
            pasta = pasta.Parent;
        }

        return pasta?.FullName ?? throw new InvalidOperationException("CronoAI.slnx não encontrado acima do binário de teste.");
    }

    #endregion
}
