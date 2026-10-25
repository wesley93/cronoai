using System.Text.RegularExpressions;

namespace CronoAI.Dominio;

/// <summary>
/// Linha da trilha de auditoria (append-only: o banco recusa <c>UPDATE</c>, <c>DELETE</c> e <c>TRUNCATE</c>, ADR 00009).
/// Só o interceptor do <c>CronoDbContext</c> a cria, na mesma transação da mudança. Guarda o pseudônimo do usuário
/// (<see cref="UsuarioId"/>), nunca nome, e-mail, emissor, sujeito nem IP (ciclo 00013, Q6).
/// </summary>
public sealed partial class RegistroAuditoria : IDadoDeEmpresa
{
    #region Campos

    public const int TamanhoMaximoMotivo = 500;

    #endregion

    #region Construtor

    // Usado pelo EF Core na materialização.
    private RegistroAuditoria()
    {
    }

    #endregion

    #region Propriedades

    /// <summary>Identity do banco (<c>bigint generated always</c>): não é monotônico por commit e tem buracos.</summary>
    public long Id { get; private set; }

    public Guid EmpresaId { get; private set; }

    /// <summary>Obra a que o registro pertence (nulo para entidade sem obra).</summary>
    public Guid? ObraId { get; private set; }

    /// <summary>Quem escreveu: sempre o usuário da sessão, nunca o corpo da requisição.</summary>
    public Guid UsuarioId { get; private set; }

    public string Entidade { get; private set; } = "";

    public Guid EntidadeId { get; private set; }

    public string Acao { get; private set; } = "";

    /// <summary>Objeto JSON só com os campos ALTERADOS da lista branca, antes da escrita (nulo em <c>criar</c>).</summary>
    public string? Antes { get; private set; }

    /// <summary>Objeto JSON com os mesmos campos depois da escrita.</summary>
    public string? Depois { get; private set; }

    /// <summary>Versão da entidade depois da escrita (original + 1; 1 na criação).</summary>
    public long? VersaoDepois { get; private set; }

    public string Origem { get; private set; } = "";

    public string? Motivo { get; private set; }

    /// <summary>TraceId W3C da requisição, para juntar a trilha aos logs sem dado pessoal.</summary>
    public Guid? CorrelacaoId { get; private set; }

    public DateTime Em { get; private set; }

    #endregion

    #region Métodos públicos

    public static RegistroAuditoria Criar(
        Guid empresaId,
        Guid? obraId,
        Guid usuarioId,
        string entidade,
        Guid entidadeId,
        string acao,
        string? antes,
        string? depois,
        long? versaoDepois,
        string origem,
        string? motivo,
        Guid? correlacaoId,
        DateTime emUtc)
    {
        if (empresaId == Guid.Empty || usuarioId == Guid.Empty || entidadeId == Guid.Empty)
        {
            throw new ArgumentException("Empresa, usuário e entidade são obrigatórios.");
        }

        if (entidade is null || !NomeDeEntidade().IsMatch(entidade))
        {
            throw new ArgumentException("Nome de entidade inválido.", nameof(entidade));
        }

        if (!AcoesAuditoria.EhValida(acao))
        {
            throw new ArgumentException("Ação de auditoria inválida.", nameof(acao));
        }

        if (!OrigensAuditoria.EhValida(origem))
        {
            throw new ArgumentException("Origem de auditoria inválida.", nameof(origem));
        }

        if (motivo is not null && (motivo.Length > TamanhoMaximoMotivo || motivo.Contains('\0', StringComparison.Ordinal)))
        {
            throw new ArgumentException("Motivo inválido.", nameof(motivo));
        }

        Validacao.Utc(emUtc, nameof(emUtc));

        return new RegistroAuditoria
        {
            EmpresaId = empresaId,
            ObraId = obraId,
            UsuarioId = usuarioId,
            Entidade = entidade,
            EntidadeId = entidadeId,
            Acao = acao,
            Antes = antes,
            Depois = depois,
            VersaoDepois = versaoDepois,
            Origem = origem,
            Motivo = motivo,
            CorrelacaoId = correlacaoId,
            Em = emUtc,
        };
    }

    #endregion

    #region Métodos privados

    [GeneratedRegex("^[a-z_]{1,64}$")]
    private static partial Regex NomeDeEntidade();

    #endregion
}
