using System.Globalization;
using CronoAI.Dados.Auditoria;
using Microsoft.Extensions.Options;

namespace CronoAI.Api.Auditoria;

/// <summary>
/// Leitura da trilha da empresa ativa (scoped): página da obra por keyset e exportação CSV em fluxo. Valida os parâmetros
/// ANTES de tocar no banco (a validação não depende de a obra existir, então não revela nada) e só então confere a obra:
/// obra inexistente e obra de outra empresa respondem o mesmo 404. Nunca devolve nome de usuário.
/// </summary>
public sealed class ServicoAuditoria
{
    #region Campos

    private const int LimitePadrao = 50;

    private const int LimiteMaximo = 200;

    private const int DiasMaximosDaExportacao = 366;

    private readonly ConsultasAuditoria _consultas;
    private readonly TimeProvider _relogio;
    private readonly OpcoesAuditoria _opcoes;

    #endregion

    #region Construtor

    public ServicoAuditoria(ConsultasAuditoria consultas, TimeProvider relogio, IOptions<OpcoesAuditoria> opcoes)
    {
        _consultas = consultas;
        _relogio = relogio;
        _opcoes = opcoes.Value;
    }

    #endregion

    #region Métodos públicos

    /// <summary>Página da trilha de uma obra, ordem (em DESC, id DESC). <paramref name="limite"/> de 1 a 200 (padrão 50).</summary>
    public async Task<ResultadoLeituraAuditoria> TrilhaDaObraAsync(Guid obraId, string? cursor, int? limite, CancellationToken cancelamento)
    {
        var tamanho = limite ?? LimitePadrao;
        if (tamanho is < 1 or > LimiteMaximo)
        {
            return ResultadoLeituraAuditoria.Invalida("limite", $"O limite deve estar entre 1 e {LimiteMaximo}.");
        }

        CursorAuditoria? posicao = null;
        if (cursor is not null)
        {
            posicao = CodificadorCursorAuditoria.Decodificar(cursor);
            if (posicao is null)
            {
                return ResultadoLeituraAuditoria.Invalida("cursor", "Cursor inválido.");
            }
        }

        if (!await _consultas.ObraVisivelAsync(obraId, cancelamento))
        {
            return ResultadoLeituraAuditoria.NaoEncontrada();
        }

        // Pede um a mais que a página: se vier, há próxima, e o cursor é o do último item ENTREGUE.
        var registros = await _consultas.TrilhaDaObraAsync(obraId, posicao, tamanho + 1, cancelamento);
        var itens = registros.Take(tamanho).ToList();
        var proximo = registros.Count > tamanho
            ? CodificadorCursorAuditoria.Codificar(new CursorAuditoria(itens[^1].Em, itens[^1].Id))
            : null;
        return ResultadoLeituraAuditoria.DePagina(new PaginaAuditoria(itens.Select(RegistroAuditoriaResposta.De).ToList(), proximo));
    }

    /// <summary>
    /// Valida o pedido de exportação: <c>de</c> e <c>ate</c> obrigatórios (datas; intervalo UTC [de 00:00, ate+1 00:00)),
    /// <c>de</c> ≤ <c>ate</c>, no máximo 366 dias e, se houver, obra visível.
    /// </summary>
    public async Task<ResultadoLeituraAuditoria> PrepararExportacaoAsync(DateOnly? de, DateOnly? ate, Guid? obraId, CancellationToken cancelamento)
    {
        if (de is not { } inicio)
        {
            return ResultadoLeituraAuditoria.Invalida("de", "Informe a data inicial (de).");
        }

        if (ate is not { } fim)
        {
            return ResultadoLeituraAuditoria.Invalida("ate", "Informe a data final (ate).");
        }

        if (inicio > fim)
        {
            return ResultadoLeituraAuditoria.Invalida("ate", "A data final não pode ser anterior à inicial.");
        }

        if (fim.DayNumber - inicio.DayNumber + 1 > DiasMaximosDaExportacao)
        {
            return ResultadoLeituraAuditoria.Invalida("ate", $"O período máximo é de {DiasMaximosDaExportacao} dias.");
        }

        if (obraId is { } obra && !await _consultas.ObraVisivelAsync(obra, cancelamento))
        {
            return ResultadoLeituraAuditoria.NaoEncontrada();
        }

        var hoje = DateOnly.FromDateTime(_relogio.GetUtcNow().UtcDateTime);
        return ResultadoLeituraAuditoria.DeExportacao(new ExportacaoAuditoria(
            inicio.ToDateTime(TimeOnly.MinValue, DateTimeKind.Utc),
            fim.AddDays(1).ToDateTime(TimeOnly.MinValue, DateTimeKind.Utc),
            obraId,
            string.Create(CultureInfo.InvariantCulture, $"auditoria-{hoje:yyyyMMdd}.csv")));
    }

    /// <summary>Escreve o CSV em fluxo: BOM e cabeçalho e, depois, uma página por consulta (keyset de id), sem acumular tudo na memória.</summary>
    public async Task EscreverExportacaoAsync(Stream destino, ExportacaoAuditoria exportacao, CancellationToken cancelamento)
    {
        ArgumentNullException.ThrowIfNull(destino);
        ArgumentNullException.ThrowIfNull(exportacao);

        await EscritorCsvAuditoria.EscreverCabecalhoAsync(destino, cancelamento);
        var tamanhoDaPagina = Math.Max(1, _opcoes.TamanhoPaginaExportacao);
        long ultimoId = 0;
        while (true)
        {
            var pagina = await _consultas.PaginaDaExportacaoAsync(exportacao.DeUtc, exportacao.AteExclusivoUtc, exportacao.ObraId, ultimoId, tamanhoDaPagina, cancelamento);
            if (pagina.Count == 0)
            {
                break;
            }

            await EscritorCsvAuditoria.EscreverRegistrosAsync(destino, pagina, cancelamento);
            ultimoId = pagina[^1].Id;
            if (pagina.Count < tamanhoDaPagina)
            {
                break;
            }
        }
    }

    #endregion
}
