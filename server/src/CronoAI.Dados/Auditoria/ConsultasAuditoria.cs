using CronoAI.Dominio;
using Microsoft.EntityFrameworkCore;

namespace CronoAI.Dados.Auditoria;

/// <summary>
/// ÚNICO ponto de leitura do <c>DbSet</c> da trilha (teste de arquitetura): consultas paginadas por keyset, sempre
/// <c>AsNoTracking</c>. Scoped: usa o <see cref="CronoDbContext"/> da requisição, então o filtro "Empresa" e o RLS valem.
/// Não faz <c>JOIN</c> com <c>usuario</c>: o nome é dado pessoal e o acesso a essa tabela é restrito (ADR 00006).
/// </summary>
public sealed class ConsultasAuditoria
{
    #region Campos

    private readonly CronoDbContext _banco;

    #endregion

    #region Construtor

    public ConsultasAuditoria(CronoDbContext banco)
    {
        _banco = banco;
    }

    #endregion

    #region Métodos públicos

    /// <summary>A obra existe e é da empresa ativa? (Inexistente e de outra empresa dão o mesmo <c>false</c>.)</summary>
    public Task<bool> ObraVisivelAsync(Guid obraId, CancellationToken cancelamento) =>
        _banco.Obras.AsNoTracking().AnyAsync(o => o.Id == obraId, cancelamento);

    /// <summary>
    /// Trilha da obra, do mais novo para o mais antigo: ordem (em DESC, id DESC), a partir do cursor (exclusive). Devolve até
    /// <paramref name="quantidade"/> itens; peça um a mais que a página para saber se há próxima.
    /// </summary>
    public async Task<IReadOnlyList<RegistroAuditoria>> TrilhaDaObraAsync(Guid obraId, CursorAuditoria? cursor, int quantidade, CancellationToken cancelamento)
    {
        var consulta = _banco.Auditorias.AsNoTracking().Where(a => a.ObraId == obraId);
        if (cursor is not null)
        {
            var em = cursor.Em;
            var id = cursor.Id;
            consulta = consulta.Where(a => a.Em < em || (a.Em == em && a.Id < id));
        }

        return await consulta
            .OrderByDescending(a => a.Em)
            .ThenByDescending(a => a.Id)
            .Take(quantidade)
            .ToListAsync(cancelamento);
    }

    /// <summary>
    /// Página da exportação: registros da empresa em [<paramref name="deUtc"/>, <paramref name="ateExclusivoUtc"/>), da obra
    /// informada (ou de todas), em ordem crescente de <c>id</c> e depois do id recebido. Keyset de <c>id</c>, nunca OFFSET.
    /// </summary>
    public async Task<IReadOnlyList<RegistroAuditoria>> PaginaDaExportacaoAsync(
        DateTime deUtc,
        DateTime ateExclusivoUtc,
        Guid? obraId,
        long depoisDoId,
        int quantidade,
        CancellationToken cancelamento)
    {
        var consulta = _banco.Auditorias.AsNoTracking()
            .Where(a => a.Em >= deUtc && a.Em < ateExclusivoUtc && a.Id > depoisDoId);
        if (obraId is { } obra)
        {
            consulta = consulta.Where(a => a.ObraId == obra);
        }

        return await consulta.OrderBy(a => a.Id).Take(quantidade).ToListAsync(cancelamento);
    }

    #endregion
}
