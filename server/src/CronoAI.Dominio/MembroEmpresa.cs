namespace CronoAI.Dominio;

/// <summary>
/// Vínculo usuário-empresa (PK composta empresa, usuário) com o PERFIL e o ESCOPO de obras do membro (ciclo 00014).
/// "Remover" é LÓGICO (<see cref="RemovidoEm"/>): a sessão, as políticas e as consultas de identidade só enxergam o membro
/// ativo, e o vínculo físico segue existindo porque <c>sessao</c>, <c>obra</c> e a trilha apontam para ele. O banco nunca
/// aceita <c>INSERT</c> do papel da aplicação nesta tabela (fecha a escalada de privilégio): o vínculo nasce pelo
/// provisionamento de desenvolvimento e, no ciclo 00014c, pelo convite.
/// </summary>
public sealed class MembroEmpresa : IDadoDeEmpresa, IRemovivelLogicamente
{
    #region Construtor

    // Usado pelo EF Core na materialização.
    private MembroEmpresa()
    {
    }

    private MembroEmpresa(Guid empresaId, Guid usuarioId, string perfil, string escopoObras, DateTime criadoEm)
    {
        EmpresaId = empresaId;
        UsuarioId = usuarioId;
        Perfil = perfil;
        EscopoObras = escopoObras;
        CriadoEm = criadoEm;
        AtualizadoEm = criadoEm;
    }

    #endregion

    #region Propriedades

    public Guid EmpresaId { get; private set; }

    public Guid UsuarioId { get; private set; }

    /// <summary>Um dos 7 <see cref="Perfis"/>.</summary>
    public string Perfil { get; private set; } = "";

    /// <summary>Um dos <see cref="EscoposObras"/>; o par com o perfil é validado (<see cref="Perfis.ParValido"/>).</summary>
    public string EscopoObras { get; private set; } = "";

    public DateTime? RemovidoEm { get; private set; }

    public DateTime CriadoEm { get; private set; }

    public DateTime AtualizadoEm { get; private set; }

    /// <summary>
    /// Versão da linha: o <c>xmin</c> do PostgreSQL (ADR 00004, entidade sem filhos). É opaca e só se compara por
    /// igualdade; a API a expõe como inteiro. O domínio nunca a calcula.
    /// </summary>
    public uint Versao { get; private set; }

    public bool EstaRemovido => RemovidoEm is not null;

    // O membro não tem id próprio: o usuário é único dentro da empresa da linha de trilha.
    Guid IAuditavel.EntidadeId => UsuarioId;

    #endregion

    #region Métodos públicos

    public static MembroEmpresa Criar(Guid empresaId, Guid usuarioId, string perfil, string escopoObras, DateTime criadoEmUtc)
    {
        Validacao.IdsObrigatorios(empresaId, usuarioId);
        Validacao.Utc(criadoEmUtc, nameof(criadoEmUtc));
        ValidarPar(perfil, escopoObras);
        return new MembroEmpresa(empresaId, usuarioId, perfil, escopoObras, criadoEmUtc);
    }

    /// <summary>
    /// Valida perfil, escopo e o par. As chaves do erro são as do contrato da API (<c>perfil</c> e <c>escopoObras</c>).
    /// </summary>
    public static void ValidarPar(string? perfil, string? escopoObras)
    {
        if (!Perfis.EhValido(perfil))
        {
            throw Validacao.Campo("perfil", "Perfil inválido.");
        }

        if (!EscoposObras.EhValido(escopoObras))
        {
            throw Validacao.Campo("escopoObras", "Escopo de obras inválido.");
        }

        if (!Perfis.ParValido(perfil, escopoObras))
        {
            throw Validacao.Campo("escopoObras", "O escopo de obras não é válido para o perfil.");
        }
    }

    /// <summary>
    /// Troca perfil e escopo. Devolve <c>false</c> (sem tocar em nada, nem em <see cref="AtualizadoEm"/>) se nada mudou: o
    /// EF não emite <c>UPDATE</c> e nada é auditado. Membro removido é somente leitura.
    /// </summary>
    public bool AlterarPerfil(string perfil, string escopoObras, DateTime instanteUtc)
    {
        ValidarInstante(instanteUtc);
        ValidarPar(perfil, escopoObras);
        if (RemovidoEm is not null)
        {
            throw new InvalidOperationException("O membro removido é somente leitura.");
        }

        if (string.Equals(Perfil, perfil, StringComparison.Ordinal) && string.Equals(EscopoObras, escopoObras, StringComparison.Ordinal))
        {
            return false;
        }

        Perfil = perfil;
        EscopoObras = escopoObras;
        AtualizadoEm = instanteUtc;
        return true;
    }

    /// <summary>Remove (logicamente) o membro: só <see cref="RemovidoEm"/> e <see cref="AtualizadoEm"/> mudam.</summary>
    public void Remover(DateTime instanteUtc)
    {
        ValidarInstante(instanteUtc);
        if (RemovidoEm is not null)
        {
            throw new InvalidOperationException("O membro já está removido.");
        }

        RemovidoEm = instanteUtc;
        AtualizadoEm = instanteUtc;
    }

    /// <summary>Reativa o membro removido: só <see cref="RemovidoEm"/> (volta a nulo) e <see cref="AtualizadoEm"/> mudam.</summary>
    public void Reativar(DateTime instanteUtc)
    {
        ValidarInstante(instanteUtc);
        if (RemovidoEm is null)
        {
            throw new InvalidOperationException("O membro não está removido.");
        }

        RemovidoEm = null;
        AtualizadoEm = instanteUtc;
    }

    #endregion

    #region Métodos privados

    // O instante nunca pode ser anterior à criação (ck_membro_atualizado_apos_criado e ck_membro_removido_apos_criado).
    private void ValidarInstante(DateTime instanteUtc)
    {
        Validacao.Utc(instanteUtc, nameof(instanteUtc));
        if (instanteUtc < CriadoEm)
        {
            throw new ArgumentException("O instante não pode ser anterior à criação do vínculo.", nameof(instanteUtc));
        }
    }

    #endregion
}
