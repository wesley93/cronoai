using System.Text.RegularExpressions;
using CronoAI.Dados;
using CronoAI.Dominio;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata;

namespace CronoAI.Api.Testes;

public sealed partial class ArquiteturaTestes
{
    #region Campos

    // Únicos arquivos (caminho relativo a server/, com "/") que podem tocar a tabela usuario (ADR 00006): consultas de
    // identidade, a semente e a própria declaração do DbSet no contexto. Compara o caminho COMPLETO, não só o nome.
    private static readonly string[] _arquivosComAcessoAUsuario =
    [
        "src/CronoAI.Dados/Identidade/ConsultasIdentidade.cs",
        "src/CronoAI.Api/Desenvolvimento/SementeDesenvolvimento.cs",
        "src/CronoAI.Dados/CronoDbContext.cs",
    ];

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
            .Select(a => (Caminho: Path.GetRelativePath(raiz, a).Replace('\\', '/'), Conteudo: File.ReadAllText(a)))
            .ToList();
        Assert.NotEmpty(arquivos);

        Assert.Empty(AcessosIndevidosAUsuario(arquivos));
    }

    [Fact]
    public void Detector_de_acesso_a_usuario_acusa_dbset_e_sql_cru_fora_dos_arquivos_permitidos()
    {
        // Meta-teste do detector: trechos que DEVEM ser acusados fora da lista, e nunca nos caminhos completos permitidos.
        var acessos = new[]
        {
            "var u = contexto.Usuarios.ToList();",
            "var u = contexto.Set<Usuario>();",
            "contexto.Database.SqlQuery<int>($\"SELECT count(*)::int AS \\\"Value\\\" FROM cronoai.usuario\");",
            "await db.Database.ExecuteSqlAsync($\"UPDATE usuario SET nome_exibicao = null\");",
            "db.Empresas.FromSql($\"SELECT * FROM x JOIN cronoai.usuario u ON u.id = x.id\");",
            "var sql = \"insert into cronoai.usuario (id) values (1)\";",
        };

        foreach (var trecho in acessos)
        {
            // Fora da lista: acusado.
            Assert.Equal(
                ["src/CronoAI.Api/Empresas/Qualquer.cs"],
                AcessosIndevidosAUsuario([("src/CronoAI.Api/Empresas/Qualquer.cs", trecho)]));

            // Mesmo NOME de arquivo permitido, em outra pasta: acusado (compara o caminho completo).
            Assert.Equal(
                ["src/CronoAI.Api/Outra/ConsultasIdentidade.cs"],
                AcessosIndevidosAUsuario([("src/CronoAI.Api/Outra/ConsultasIdentidade.cs", trecho)]));

            // Caminho completo permitido: não acusado.
            Assert.Empty(AcessosIndevidosAUsuario([("src/CronoAI.Dados/Identidade/ConsultasIdentidade.cs", trecho)]));
        }

        // Código sem acesso a usuario não é acusado (inclui a palavra em comentário ou em outro contexto).
        Assert.Empty(AcessosIndevidosAUsuario([("src/CronoAI.Api/Empresas/Qualquer.cs", "// o usuario do contexto vem da sessão\nvar usuarioId = contexto.UsuarioId;")]));
    }

    #endregion

    #region Métodos privados

    /// <summary>
    /// Arquivos (caminho relativo, com "/") que acessam a tabela usuario fora da lista permitida: DbSet (<c>.Usuarios</c>,
    /// <c>Set&lt;Usuario&gt;</c>) ou SQL cru (<c>cronoai.usuario</c>, <c>FROM/JOIN/INTO/UPDATE usuario</c>).
    /// </summary>
    public static IReadOnlyList<string> AcessosIndevidosAUsuario(IEnumerable<(string Caminho, string Conteudo)> arquivos) =>
        arquivos
            .Where(a => AcessoAUsuarioRegex().IsMatch(a.Conteudo) && !_arquivosComAcessoAUsuario.Contains(a.Caminho, StringComparer.Ordinal))
            .Select(a => a.Caminho)
            .ToList();

    [GeneratedRegex(@"\.Usuarios\b|Set<Usuario>\s*\(|\bcronoai\.""?usuario""?\b|\b(FROM|JOIN|INTO|UPDATE)\s+""?usuario""?\b", RegexOptions.IgnoreCase)]
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
