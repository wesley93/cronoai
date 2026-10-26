using System.Diagnostics;
using CronoAI.Api.Membros;
using CronoAI.Api.Obras;
using CronoAI.Api.Sessao;
using CronoAI.Dados;
using CronoAI.Dados.Auditoria;
using CronoAI.Dominio;
using Microsoft.EntityFrameworkCore;

namespace CronoAI.Api.Acessos;

/// <summary>
/// Acessos de membros a obras (scoped): listar, conceder e revogar. Obra sem vínculo com quem escreve (inexistente, de outra empresa
/// ou da mesma empresa fora do alcance) responde o MESMO 404: o RLS por obra a esconde, e a consulta de visibilidade vem antes de
/// qualquer outra conferência. O destino inválido (membro de outra empresa, inexistente, removido ou de escopo diferente de
/// <c>vinculadas</c>) recebe sempre o mesmo 400 em <c>usuarioId</c>, sem revelar existência. Revogar apaga antes os acessos de frente
/// do usuário na obra, no MESMO salvamento auditado (uma linha de trilha <c>remover</c> por vínculo apagado).
/// </summary>
public sealed class ServicoAcessosObra
{
    #region Campos

    private const string MensagemDeDestinoInvalido = "O usuário informado não pode receber acesso a esta obra.";

    private readonly CronoDbContext _banco;
    private readonly ContextoSessao _contexto;
    private readonly TimeProvider _relogio;
    private readonly ILogger<ServicoAcessosObra> _logger;

    #endregion

    #region Construtor

    public ServicoAcessosObra(CronoDbContext banco, ContextoSessao contexto, TimeProvider relogio, ILogger<ServicoAcessosObra> logger)
    {
        _banco = banco;
        _contexto = contexto;
        _relogio = relogio;
        _logger = logger;
    }

    #endregion

    #region Métodos públicos

    /// <summary>Vínculos da obra, ou <c>null</c> se a obra não é visível a quem pergunta.</summary>
    public async Task<IReadOnlyList<AcessoObraResposta>?> ListarAsync(Guid obraId, CancellationToken cancelamento)
    {
        if (!await ObraVisivelAsync(obraId, cancelamento))
        {
            return null;
        }

        var acessos = await _banco.AcessosObra.AsNoTracking()
            .Where(a => a.ObraId == obraId)
            .OrderBy(a => a.CriadoEm)
            .ThenBy(a => a.UsuarioId)
            .ToListAsync(cancelamento);
        return acessos.Select(AcessoObraResposta.De).ToList();
    }

    public async Task<ResultadoEscritaAcesso> ConcederAsync(Guid obraId, ConcederAcessoRequisicao requisicao, CancellationToken cancelamento)
    {
        ArgumentNullException.ThrowIfNull(requisicao);

        // Validação pura primeiro: não toca no banco e não depende de a obra existir (não revela nada).
        if (requisicao.UsuarioId is not { } usuarioId || usuarioId == Guid.Empty)
        {
            return ResultadoEscritaAcesso.Invalida("usuarioId", MensagemDeDestinoInvalido);
        }

        MetadadosEscrita metadados;
        try
        {
            metadados = MontarMetadados(requisicao.Motivo);
        }
        catch (ArgumentException erro)
        {
            return ResultadoEscritaAcesso.Invalida("motivo", erro.Message);
        }

        if (!await ObraVisivelAsync(obraId, cancelamento))
        {
            return ResultadoEscritaAcesso.NaoEncontrado();
        }

        // Destino: membro ATIVO desta empresa (o filtro de empresa esconde o alheio) e de escopo "vinculadas": os demais escopos
        // enxergam obras por outro caminho e o vínculo seria inerte. Todo destino inválido recebe o MESMO 400.
        var destino = await _banco.Membros.AsNoTracking().SingleOrDefaultAsync(m => m.UsuarioId == usuarioId, cancelamento);
        if (destino is null || destino.EstaRemovido || destino.EscopoObras != EscoposObras.Vinculadas)
        {
            return ResultadoEscritaAcesso.Invalida("usuarioId", MensagemDeDestinoInvalido);
        }

        var empresaId = _contexto.EmpresaId ?? throw new InvalidOperationException("Escrita de acesso sem empresa ativa na sessão.");
        var acesso = AcessoObra.Criar(empresaId, obraId, usuarioId, metadados.InstanteUtc);
        _banco.AcessosObra.Add(acesso);
        try
        {
            await _banco.SalvarAuditadoAsync(metadados, cancelamento);
        }
        catch (DbUpdateException erro) when (MapeadorErrosMembros.Classificar(erro) is DesfechoDeBanco.AcessoExistente)
        {
            return ResultadoEscritaAcesso.Existente();
        }
        catch (DbUpdateException erro) when (MapeadorErrosMembros.Classificar(erro) is DesfechoDeBanco.DestinoInvalido)
        {
            return ResultadoEscritaAcesso.Invalida("usuarioId", MensagemDeDestinoInvalido);
        }
        catch (DbUpdateException erro) when (MapeadorErrosObra.EhRecusaDePolitica(erro))
        {
            // 42501 sem nome de constraint: a política recusou. Confere o estado antes de decidir: obra invisível é obra que sumiu
            // para quem escreve (404); se ela ainda é visível, a recusa é outra coisa e a exceção segue (500 genérico).
            if (await ObraVisivelAsync(obraId, cancelamento))
            {
                throw;
            }

            _logger.ObraInvisivelNoMeioDaEscritaDeAcesso(obraId);
            return ResultadoEscritaAcesso.NaoEncontrado();
        }

        _logger.AcessoDeObraConcedido(obraId, usuarioId);
        return ResultadoEscritaAcesso.Sucesso(AcessoObraResposta.De(acesso));
    }

    public async Task<ResultadoEscritaAcesso> RevogarAsync(Guid obraId, Guid usuarioId, RevogarAcessoRequisicao requisicao, CancellationToken cancelamento)
    {
        ArgumentNullException.ThrowIfNull(requisicao);

        MetadadosEscrita metadados;
        try
        {
            metadados = MontarMetadados(requisicao.Motivo);
        }
        catch (ArgumentException erro)
        {
            return ResultadoEscritaAcesso.Invalida("motivo", erro.Message);
        }

        if (!await ObraVisivelAsync(obraId, cancelamento))
        {
            return ResultadoEscritaAcesso.NaoEncontrado();
        }

        // Carregar ANTES de apagar: vínculo inexistente (ou invisível) é 404, nunca um DELETE que afeta zero linhas.
        var acesso = await _banco.AcessosObra.SingleOrDefaultAsync(a => a.ObraId == obraId && a.UsuarioId == usuarioId, cancelamento);
        if (acesso is null)
        {
            return ResultadoEscritaAcesso.NaoEncontrado();
        }

        // Quem tem frente tem a obra (FK Restrict): os acessos de frente do usuário nesta obra saem JUNTO, no mesmo salvamento.
        var frentes = await _banco.AcessosFrente.Where(a => a.ObraId == obraId && a.UsuarioId == usuarioId).ToListAsync(cancelamento);
        _banco.AcessosFrente.RemoveRange(frentes);
        _banco.AcessosObra.Remove(acesso);
        try
        {
            await _banco.SalvarAuditadoAsync(metadados, cancelamento);
        }
        catch (DbUpdateConcurrencyException)
        {
            // Outra pessoa revogou entre o meu carregamento e a gravação: o vínculo já não existe.
            return ResultadoEscritaAcesso.NaoEncontrado();
        }
        catch (DbUpdateException erro) when (MapeadorErrosObra.EhRecusaDePolitica(erro))
        {
            // 42501 sem nome de constraint: a política recusou. Confere o estado antes de decidir: obra invisível é obra que sumiu
            // para quem escreve (404); se ela ainda é visível, a recusa é outra coisa e a exceção segue (500 genérico).
            if (await ObraVisivelAsync(obraId, cancelamento))
            {
                throw;
            }

            _logger.ObraInvisivelNoMeioDaEscritaDeAcesso(obraId);
            return ResultadoEscritaAcesso.NaoEncontrado();
        }

        _logger.AcessoDeObraRevogado(obraId, usuarioId, frentes.Count);
        return ResultadoEscritaAcesso.Sucesso(null);
    }

    #endregion

    #region Métodos privados

    private Task<bool> ObraVisivelAsync(Guid obraId, CancellationToken cancelamento) =>
        _banco.Obras.AsNoTracking().AnyAsync(o => o.Id == obraId, cancelamento);

    // Origem "ui" (rotas com cookie de sessão), instante do TimeProvider e TraceId da requisição como correlação.
    private MetadadosEscrita MontarMetadados(string? motivo) =>
        new(OrigensAuditoria.Ui, motivo, CorrelacaoDaRequisicao(), _relogio.GetUtcNow().UtcDateTime);

    private static Guid? CorrelacaoDaRequisicao() =>
        Activity.Current is { } atividade && Guid.TryParseExact(atividade.TraceId.ToHexString(), "N", out var id) ? id : null;

    #endregion
}
