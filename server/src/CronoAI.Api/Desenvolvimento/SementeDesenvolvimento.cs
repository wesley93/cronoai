using CronoAI.Api.Autenticacao;
using CronoAI.Dados;
using CronoAI.Dados.Identidade;
using Microsoft.EntityFrameworkCore;

namespace CronoAI.Api.Desenvolvimento;

/// <summary>
/// Semente de desenvolvimento (<c>dotnet run --project server/src/CronoAI.Api -- semear-desenvolvimento</c>).
/// Recusa fora de <c>Development</c>; conecta como <c>cronoai_app</c> (nunca superusuário); cria os usuários pelo
/// MESMO upsert do login (emissor reservado) antes dos vínculos; três empresas com ids fixos fictícios;
/// <c>ON CONFLICT DO NOTHING</c> (idempotente sem ler sob RLS) e UM contexto de banco por empresa.
/// </summary>
public sealed class SementeDesenvolvimento
{
    #region Campos

    private readonly IFabricaCronoDbContext _fabrica;
    private readonly ConsultasIdentidade _consultas;
    private readonly IHostEnvironment _ambiente;
    private readonly TimeProvider _relogio;

    #endregion

    #region Construtor

    public SementeDesenvolvimento(IFabricaCronoDbContext fabrica, ConsultasIdentidade consultas, IHostEnvironment ambiente, TimeProvider relogio)
    {
        _fabrica = fabrica;
        _consultas = consultas;
        _ambiente = ambiente;
        _relogio = relogio;
    }

    #endregion

    #region Métodos públicos

    public async Task ExecutarAsync(CancellationToken cancelamento = default)
    {
        if (!_ambiente.IsDevelopment())
        {
            throw new InvalidOperationException("A semente de desenvolvimento só roda em Development.");
        }

        var agora = _relogio.GetUtcNow().UtcDateTime;
        var emissor = EsquemasAutenticacao.EmissorDesenvolvimento;
        var devA = await _consultas.UpsertUsuarioAsync(emissor, IdsDesenvolvimento.SujeitoDevA, IdsDesenvolvimento.NomeDevA, agora, cancelamento);
        var devB = await _consultas.UpsertUsuarioAsync(emissor, IdsDesenvolvimento.SujeitoDevB, IdsDesenvolvimento.NomeDevB, agora, cancelamento);

        await SemearEmpresaAsync(IdsDesenvolvimento.EmpresaA, IdsDesenvolvimento.NomeEmpresaA, [devA], agora, cancelamento);
        await SemearEmpresaAsync(IdsDesenvolvimento.EmpresaB, IdsDesenvolvimento.NomeEmpresaB, [devB], agora, cancelamento);
        await SemearEmpresaAsync(IdsDesenvolvimento.EmpresaCompartilhada, IdsDesenvolvimento.NomeEmpresaCompartilhada, [devA, devB], agora, cancelamento);
    }

    #endregion

    #region Métodos privados

    // Contexto de banco = a própria empresa: as políticas de INSERT exigem empresa_id = empresa do contexto.
    private async Task SemearEmpresaAsync(Guid empresaId, string nome, Guid[] usuarios, DateTime agora, CancellationToken cancelamento)
    {
        await using var contexto = _fabrica.Criar(ContextoSessaoBanco.DaEmpresa(empresaId));

        await contexto.Database.ExecuteSqlAsync(
            $"INSERT INTO cronoai.empresa (id, nome, criada_em) VALUES ({empresaId}, {nome}, {agora}) ON CONFLICT (id) DO NOTHING",
            cancelamento);

        foreach (var usuarioId in usuarios)
        {
            await contexto.Database.ExecuteSqlAsync(
                $"INSERT INTO cronoai.membro_empresa (empresa_id, usuario_id, criado_em) VALUES ({empresaId}, {usuarioId}, {agora}) ON CONFLICT (empresa_id, usuario_id) DO NOTHING",
                cancelamento);
        }
    }

    #endregion
}
