using CronoAI.Dados;

namespace CronoAI.Api.Sessao;

/// <summary>
/// Quem chama e de qual empresa, para a requisição atual (scoped). Preenchido UMA vez pelo validador de sessão
/// (<see cref="ValidadorSessao"/>); uma segunda atribuição lança exceção. O <c>CronoDbContext</c> scoped dos
/// endpoints é criado pela fábrica a partir daqui, portanto o contexto do banco nunca muda depois de aberto.
/// Se algo o resolver antes da validação, ele nasce vazio: zero linhas, nunca vazamento.
/// </summary>
public sealed class ContextoSessao
{
    #region Campos

    private bool _preenchido;

    #endregion

    #region Propriedades

    public Guid? SessaoId { get; private set; }

    public Guid? UsuarioId { get; private set; }

    public Guid? EmpresaId { get; private set; }

    #endregion

    #region Métodos públicos

    public void Preencher(Guid sessaoId, Guid usuarioId, Guid? empresaId)
    {
        if (_preenchido)
        {
            throw new InvalidOperationException("O contexto da sessão só pode ser preenchido uma vez por requisição.");
        }

        _preenchido = true;
        SessaoId = sessaoId;
        UsuarioId = usuarioId;
        EmpresaId = empresaId;
    }

    /// <summary>Contexto imutável entregue ao <c>CronoDbContext</c> (vazio se a requisição não está autenticada).</summary>
    public ContextoSessaoBanco ParaBanco() => new(UsuarioId, EmpresaId);

    #endregion
}
