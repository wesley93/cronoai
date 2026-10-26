using System.Reflection;
using CronoAI.Dados.Auditoria;
using CronoAI.Dominio;
using Microsoft.EntityFrameworkCore;

namespace CronoAI.Dados;

/// <summary>
/// Contexto do EF Core do CronoAI. Recebe o <see cref="ContextoSessaoBanco"/> no construtor (imutável por
/// instância): o interceptor de conexão e o filtro global "Empresa" leem dele (ADR 00006).
/// </summary>
public class CronoDbContext : DbContext
{
    #region Campos

    /// <summary>Nome do filtro global aplicado a todo <see cref="IDadoDeEmpresa"/>.</summary>
    public const string FiltroEmpresa = "Empresa";

    private static readonly MethodInfo _configurarFiltroEmpresa =
        typeof(CronoDbContext).GetMethod(nameof(ConfigurarFiltroEmpresa), BindingFlags.Instance | BindingFlags.NonPublic)!;

    #endregion

    #region Construtor

    public CronoDbContext(DbContextOptions<CronoDbContext> options, ContextoSessaoBanco contextoBanco)
        : base(options)
    {
        ContextoBanco = contextoBanco ?? throw new ArgumentNullException(nameof(contextoBanco));
    }

    #endregion

    #region Propriedades

    /// <summary>Usuário e empresa deste contexto: fixados na criação, nunca mudam.</summary>
    public ContextoSessaoBanco ContextoBanco { get; }

    public DbSet<Empresa> Empresas => Set<Empresa>();

    // Acesso restrito por teste de arquitetura: só ConsultasIdentidade e a semente (ADR 00006).
    public DbSet<Usuario> Usuarios => Set<Usuario>();

    public DbSet<MembroEmpresa> Membros => Set<MembroEmpresa>();

    public DbSet<Sessao> Sessoes => Set<Sessao>();

    public DbSet<Obra> Obras => Set<Obra>();

    public DbSet<AcessoObra> AcessosObra => Set<AcessoObra>();

    public DbSet<Frente> Frentes => Set<Frente>();

    public DbSet<AcessoFrente> AcessosFrente => Set<AcessoFrente>();

    public DbSet<Carteira> Carteiras => Set<Carteira>();

    public DbSet<CarteiraObra> CarteirasObras => Set<CarteiraObra>();

    public DbSet<AcessoCarteira> AcessosCarteira => Set<AcessoCarteira>();

    /// <summary>Trilha append-only: só <c>Add</c> (o interceptor) e a leitura de <c>ConsultasAuditoria</c>; teste de arquitetura.</summary>
    public DbSet<RegistroAuditoria> Auditorias => Set<RegistroAuditoria>();

    public DbSet<UfReferencia> Ufs => Set<UfReferencia>();

    public DbSet<MunicipioReferencia> Municipios => Set<MunicipioReferencia>();

    /// <summary>Metadados da escrita auditada em curso; só existem durante <see cref="SalvarAuditadoAsync"/>.</summary>
    internal MetadadosEscrita? MetadadosAtuais { get; private set; }

    #endregion

    #region Métodos públicos

    /// <summary>
    /// ÚNICO caminho para gravar entidade <see cref="IAuditavel"/>: guarda os metadados só durante a chamada, para o
    /// <see cref="AuditoriaInterceptor"/> gravar a trilha na mesma transação (ADR 00009). Um <c>SaveChanges</c> comum
    /// com entidade auditável lança.
    /// </summary>
    public async Task<int> SalvarAuditadoAsync(MetadadosEscrita metadados, CancellationToken cancelamento = default)
    {
        ArgumentNullException.ThrowIfNull(metadados);
        if (MetadadosAtuais is not null)
        {
            throw new InvalidOperationException("SalvarAuditadoAsync não admite chamadas aninhadas no mesmo contexto.");
        }

        MetadadosAtuais = metadados;
        try
        {
            return await SaveChangesAsync(cancelamento);
        }
        finally
        {
            MetadadosAtuais = null;
        }
    }

    #endregion

    #region Métodos protegidos

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        // Schema próprio: alvo exato para GRANT/REVOKE e pg_dump -n; trocar depois reescreve todas as migrações.
        modelBuilder.HasDefaultSchema(PapeisBanco.Schema);

        // 1. Configurações por entidade (uma IEntityTypeConfiguration por tipo).
        modelBuilder.ApplyConfigurationsFromAssembly(typeof(CronoDbContext).Assembly);

        // 2. Filtro global nomeado "Empresa" automático em todo IDadoDeEmpresa.
        foreach (var tipo in modelBuilder.Model.GetEntityTypes().Select(t => t.ClrType).Where(t => typeof(IDadoDeEmpresa).IsAssignableFrom(t)).ToList())
        {
            _configurarFiltroEmpresa.MakeGenericMethod(tipo).Invoke(this, [modelBuilder]);
        }

        // 3. POR ÚLTIMO: exclusão em cascata nunca é efeito colateral (apagar empresa com auditoria é decisão
        //    explícita). Vem depois das configurações por entidade, que a sobrescreveriam.
        foreach (var chaveEstrangeira in modelBuilder.Model.GetEntityTypes().SelectMany(t => t.GetForeignKeys()))
        {
            chaveEstrangeira.DeleteBehavior = DeleteBehavior.Restrict;
        }
    }

    #endregion

    #region Métodos privados

    // Sem empresa no contexto, EmpresaId == null nunca casa: nenhuma linha. O EF lê ContextoBanco da instância
    // do contexto a cada consulta (padrão de multitenancy do EF Core).
    private void ConfigurarFiltroEmpresa<T>(ModelBuilder modelBuilder)
        where T : class, IDadoDeEmpresa
    {
        modelBuilder.Entity<T>().HasQueryFilter(FiltroEmpresa, e => e.EmpresaId == ContextoBanco.EmpresaId);
    }

    #endregion
}
