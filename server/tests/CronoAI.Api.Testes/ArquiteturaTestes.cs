using System.Text.RegularExpressions;
using CronoAI.Dados;
using CronoAI.Dados.Auditoria;
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

    // Únicos arquivos que podem usar o DbSet da trilha além de Add/AddRange: a leitura paginada e a declaração no contexto.
    private static readonly string[] _arquivosComLeituraDaTrilha =
    [
        "src/CronoAI.Dados/Auditoria/ConsultasAuditoria.cs",
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

    [Fact]
    public void Auditoria_so_recebe_Add()
    {
        // Varredura de server/src: a trilha só recebe Add/AddRange (o interceptor) e leitura em ConsultasAuditoria.
        Assert.Empty(UsosIndevidosDeAuditoria(ArquivosDeSrc()));
    }

    [Fact]
    public void Detector_de_uso_da_trilha_acusa_escrita_e_leitura_fora_do_lugar()
    {
        var indevidos = new[]
        {
            "var x = db.Auditorias.Where(a => a.Id > 0).ToList();",
            "db.Auditorias.Remove(registro);",
            "db.Auditorias.Update(registro);",
            "await db.Auditorias.ExecuteDeleteAsync();",
            "var y = db.Set<RegistroAuditoria>().ToList();",
        };
        foreach (var trecho in indevidos)
        {
            Assert.Equal(["src/CronoAI.Api/Obras/Qualquer.cs"], UsosIndevidosDeAuditoria([("src/CronoAI.Api/Obras/Qualquer.cs", trecho)]));
            Assert.Empty(UsosIndevidosDeAuditoria([("src/CronoAI.Dados/Auditoria/ConsultasAuditoria.cs", trecho)]));
        }

        Assert.Empty(UsosIndevidosDeAuditoria([("src/CronoAI.Dados/Auditoria/AuditoriaInterceptor.cs", "banco.Auditorias.Add(registro);\nbanco.Auditorias.AddRange(lista);")]));
    }

    [Fact]
    public void Sem_SQL_de_escrita_em_obra_ou_auditoria_fora_de_migracao()
    {
        // Mesmo critério da regra R18 (por LINHA, com ou sem schema, aspas e ONLY), aplicado a todo o server/src sem Migrations.
        Assert.Empty(SqlDeEscritaEmEntidadeAuditada(ArquivosDeSrc()));
    }

    [Theory]
    [InlineData("await db.Database.ExecuteSqlAsync($\"UPDATE cronoai.obra SET nome = {n}\");")]
    [InlineData("    DELETE FROM cronoai.auditoria WHERE id = {id}")]
    [InlineData("    INSERT INTO obra (id) VALUES ({id})")]
    [InlineData("    UPDATE ONLY obra SET nome = {n}")]
    [InlineData("    $\"UPDATE \"cronoai\".\"obra\" SET nome = {n}\"")]
    [InlineData("await db.Database.ExecuteSqlInterpolatedAsync($\"DELETE FROM auditoria\");")]
    public void Detector_de_SQL_de_escrita_acusa_as_formas_que_escapavam(string linha)
    {
        Assert.Equal(["src/CronoAI.Api/Obras/Qualquer.cs"], SqlDeEscritaEmEntidadeAuditada([("src/CronoAI.Api/Obras/Qualquer.cs", linha)]));
    }

    [Theory]
    [InlineData("    SELECT id FROM obra WHERE id = {id}")]
    [InlineData("// UPDATE cronoai.obra SET nome = 1 (comentário)")]
    [InlineData("    UPDATE obra_arquivada SET x = 1")]
    [InlineData("    UPDATE usuario SET nome_exibicao = null")]
    public void Detector_de_SQL_de_escrita_nao_acusa_leitura_comentario_e_outras_tabelas(string linha)
    {
        Assert.Empty(SqlDeEscritaEmEntidadeAuditada([("src/CronoAI.Api/Obras/Qualquer.cs", linha)]));
    }

    [Fact]
    public void Sem_ExecuteUpdate_ExecuteDelete_em_entidade_auditada()
    {
        // Esses métodos não passam pelo ChangeTracker nem pelo interceptor: a trilha ficaria sem registro.
        Assert.Empty(ExecuteEmEntidadeAuditada(ArquivosDeSrc()));
    }

    [Fact]
    public void Detector_de_Execute_em_entidade_auditada_acusa_Obra_e_Auditoria()
    {
        Assert.Equal(["src/X.cs"], ExecuteEmEntidadeAuditada([("src/X.cs", "await db.Obras.Where(o => o.Id == id).ExecuteUpdateAsync(s => s);")]));
        Assert.Equal(["src/X.cs"], ExecuteEmEntidadeAuditada([("src/X.cs", "await db.Auditorias.ExecuteDeleteAsync();")]));
        Assert.Equal(["src/X.cs"], ExecuteEmEntidadeAuditada([("src/X.cs", "var obra = new Obra();\nawait db.Sessoes.ExecuteDeleteAsync();")]));
        Assert.Empty(ExecuteEmEntidadeAuditada([("src/X.cs", "await db.Sessoes.ExecuteDeleteAsync();")]));
        Assert.Empty(ExecuteEmEntidadeAuditada([("src/X.cs", "await db.Obras.ToListAsync();")]));
    }

    [Fact]
    public void Toda_entidade_auditavel_tem_lista_branca()
    {
        using var contexto = CriarContextoDeModelo();
        var auditaveis = contexto.Model.GetEntityTypes().Where(t => typeof(IAuditavel).IsAssignableFrom(t.ClrType)).ToList();

        Assert.NotEmpty(auditaveis);
        foreach (var tipo in auditaveis)
        {
            Assert.True(ListaBrancaAuditoria.Contem(tipo.ClrType), $"{tipo.ClrType.Name} é IAuditavel e não tem lista branca");
            foreach (var campo in ListaBrancaAuditoria.Campos(tipo.ClrType))
            {
                Assert.NotNull(tipo.FindProperty(campo.Propriedade));
                Assert.Matches("^[a-z_]+$", campo.Chave);
            }
        }

        // E o inverso: toda lista é de um tipo auditável do modelo (lista de tipo que sumiu apodrece em silêncio).
        Assert.All(ListaBrancaAuditoria.Tipos, tipo => Assert.Contains(auditaveis, a => a.ClrType == tipo));
    }

    [Fact]
    public void Entidade_gravavel_de_empresa_e_auditavel_ou_excecao_declarada()
    {
        // Exceções declaradas até o ciclo 00014, que as torna auditáveis.
        Type[] excecoes = [typeof(MembroEmpresa), typeof(CronoAI.Dominio.Sessao), typeof(Empresa)];
        using var contexto = CriarContextoDeModelo();
        var tiposDoModelo = contexto.Model.GetEntityTypes().Select(t => t.ClrType).ToList();

        // A lista de exceções não pode apodrecer: cada uma existe no modelo.
        Assert.All(excecoes, e => Assert.Contains(e, tiposDoModelo));

        // RegistroAuditoria é excluída por definição (é a própria trilha).
        var deEmpresa = tiposDoModelo.Where(t => typeof(IDadoDeEmpresa).IsAssignableFrom(t) && t != typeof(RegistroAuditoria)).ToList();
        Assert.NotEmpty(deEmpresa);
        Assert.All(deEmpresa, t => Assert.True(typeof(IAuditavel).IsAssignableFrom(t) || excecoes.Contains(t), $"{t.Name} grava dado de empresa sem auditoria"));
    }

    [Fact]
    public void Obra_id_empresa_e_criacao_imutaveis_no_modelo()
    {
        using var contexto = CriarContextoDeModelo();
        var tipo = contexto.Model.FindEntityType(typeof(Obra))!;

        Assert.Equal(PropertySaveBehavior.Throw, tipo.FindProperty(nameof(Obra.Id))!.GetAfterSaveBehavior());
        Assert.Equal(PropertySaveBehavior.Throw, tipo.FindProperty(nameof(Obra.EmpresaId))!.GetAfterSaveBehavior());
        Assert.Equal(PropertySaveBehavior.Throw, tipo.FindProperty(nameof(Obra.CriadaEm))!.GetAfterSaveBehavior());

        // Controle negativo: um campo editável continua gravável.
        Assert.Equal(PropertySaveBehavior.Save, tipo.FindProperty(nameof(Obra.Nome))!.GetAfterSaveBehavior());
    }
    #endregion

    #region Métodos privados

    /// <summary>Todos os .cs de server/src (caminho relativo com "/"), sem obj, bin nem Migrations.</summary>
    private static List<(string Caminho, string Conteudo)> ArquivosDeSrc()
    {
        var raiz = RaizServidor();
        var arquivos = Directory.GetFiles(Path.Combine(raiz, "src"), "*.cs", SearchOption.AllDirectories)
            .Where(a => !a.Contains($"{Path.DirectorySeparatorChar}obj{Path.DirectorySeparatorChar}", StringComparison.Ordinal)
                     && !a.Contains($"{Path.DirectorySeparatorChar}bin{Path.DirectorySeparatorChar}", StringComparison.Ordinal)
                     && !a.Contains($"{Path.DirectorySeparatorChar}Migrations{Path.DirectorySeparatorChar}", StringComparison.Ordinal))
            .Select(a => (Caminho: Path.GetRelativePath(raiz, a).Replace('\\', '/'), Conteudo: File.ReadAllText(a)))
            .ToList();
        Assert.NotEmpty(arquivos);
        return arquivos;
    }

    /// <summary>Arquivos que usam o DbSet da trilha de outro jeito que Add/AddRange, fora de ConsultasAuditoria e do contexto.</summary>
    public static IReadOnlyList<string> UsosIndevidosDeAuditoria(IEnumerable<(string Caminho, string Conteudo)> arquivos) =>
        arquivos
            .Where(a => UsoDaTrilhaRegex().IsMatch(a.Conteudo) && !_arquivosComLeituraDaTrilha.Contains(a.Caminho, StringComparer.Ordinal))
            .Select(a => a.Caminho)
            .ToList();

    [GeneratedRegex(@"(?:\bAuditorias\b|Set<RegistroAuditoria>\s*\(\s*\))(?!\s*\.\s*(?:Add|AddRange)\s*\()")]
    private static partial Regex UsoDaTrilhaRegex();

    /// <summary>Arquivos que usam ExecuteUpdate/ExecuteDelete E citam Obra ou a trilha.</summary>
    public static IReadOnlyList<string> ExecuteEmEntidadeAuditada(IEnumerable<(string Caminho, string Conteudo)> arquivos) =>
        arquivos
            .Where(a => ExecuteEmMassaRegex().IsMatch(a.Conteudo) && EntidadeAuditadaRegex().IsMatch(a.Conteudo))
            .Select(a => a.Caminho)
            .ToList();

    /// <summary>Arquivos com linha de SQL de escrita (não comentário) em obra ou auditoria, com ou sem schema, aspas e ONLY.</summary>
    public static IReadOnlyList<string> SqlDeEscritaEmEntidadeAuditada(IEnumerable<(string Caminho, string Conteudo)> arquivos) =>
        arquivos
            .Where(a => a.Conteudo.Split('\n').Any(linha => !linha.TrimStart().StartsWith("//", StringComparison.Ordinal) && EscritaEmAuditadaRegex().IsMatch(linha)))
            .Select(a => a.Caminho)
            .ToList();

    [GeneratedRegex(@"\b(INSERT\s+INTO|UPDATE|DELETE\s+FROM)(\s+ONLY)?\s+(""?cronoai""?\s*\.\s*)?""?(obra|auditoria)""?\b", RegexOptions.IgnoreCase)]
    private static partial Regex EscritaEmAuditadaRegex();

    [GeneratedRegex(@"\bExecute(?:Update|Delete)(?:Async)?\s*\(")]
    private static partial Regex ExecuteEmMassaRegex();

    [GeneratedRegex(@"\b(?:Obra|Obras|RegistroAuditoria|Auditorias)\b")]
    private static partial Regex EntidadeAuditadaRegex();

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
