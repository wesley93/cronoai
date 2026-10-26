using CronoAI.Api.Autenticacao;
using CronoAI.Dados;
using CronoAI.Dados.Auditoria;
using CronoAI.Dados.Identidade;
using CronoAI.Dados.Rls;
using CronoAI.Dominio;
using Microsoft.EntityFrameworkCore;

namespace CronoAI.Api.Desenvolvimento;

/// <summary>
/// Semente de desenvolvimento (<c>dotnet run --project server/src/CronoAI.Api -- semear-desenvolvimento</c>).
/// Recusa fora de <c>Development</c>; cria os usuários pelo MESMO upsert do login (emissor reservado), como
/// <c>cronoai_app</c>; e cria as empresas e os membros pelo <see cref="ProvisionamentoEmpresa"/>, com a string do MIGRADOR
/// (<c>ConnectionStrings:CronoaiMigracao</c>), porque o papel da aplicação não tem mais INSERT em <c>membro_empresa</c>.
/// Essa string é lida SÓ aqui, depois da checagem de ambiente, e nunca fica em campo. Três empresas com ids fixos fictícios;
/// perfis diferentes (<c>dev-a</c> administrador; <c>dev-b</c> engenheiro de obra vinculado a UMA obra fictícia da empresa
/// compartilhada). Idempotente. A obra e o vínculo saem pelo contexto do administrador, auditados como qualquer escrita.
/// </summary>
public sealed class SementeDesenvolvimento
{
    #region Campos

    private readonly IFabricaCronoDbContext _fabrica;
    private readonly ConsultasIdentidade _consultas;
    private readonly IHostEnvironment _ambiente;
    private readonly TimeProvider _relogio;
    private readonly IConfiguration _configuracao;

    #endregion

    #region Construtor

    public SementeDesenvolvimento(
        IFabricaCronoDbContext fabrica,
        ConsultasIdentidade consultas,
        IHostEnvironment ambiente,
        TimeProvider relogio,
        IConfiguration configuracao)
    {
        _fabrica = fabrica;
        _consultas = consultas;
        _ambiente = ambiente;
        _relogio = relogio;
        _configuracao = configuracao;
    }

    #endregion

    #region Métodos públicos

    public async Task ExecutarAsync(CancellationToken cancelamento = default)
    {
        if (!_ambiente.IsDevelopment())
        {
            throw new InvalidOperationException("A semente de desenvolvimento só roda em Development.");
        }

        // A string do migrador existe só para este comando: lida aqui, passada ao provisionamento e descartada.
        var stringMigrador = _configuracao.GetConnectionString("CronoaiMigracao");
        if (string.IsNullOrWhiteSpace(stringMigrador))
        {
            throw new InvalidOperationException("ConnectionStrings:CronoaiMigracao não configurada: a semente precisa do migrador para criar os membros (veja server/README.md).");
        }

        var provisionamento = new ProvisionamentoEmpresa(new FabricaCronoDbContext(stringMigrador));

        var agora = _relogio.GetUtcNow().UtcDateTime;
        var emissor = EsquemasAutenticacao.EmissorDesenvolvimento;
        var devA = await _consultas.UpsertUsuarioAsync(emissor, IdsDesenvolvimento.SujeitoDevA, IdsDesenvolvimento.NomeDevA, agora, cancelamento);
        var devB = await _consultas.UpsertUsuarioAsync(emissor, IdsDesenvolvimento.SujeitoDevB, IdsDesenvolvimento.NomeDevB, agora, cancelamento);

        await provisionamento.ProvisionarAsync(
            Empresa.Criar(IdsDesenvolvimento.NomeEmpresaA, agora, IdsDesenvolvimento.EmpresaA),
            [MembroEmpresa.Criar(IdsDesenvolvimento.EmpresaA, devA, Perfis.Administrador, EscoposObras.Todas, agora)],
            cancelamento);
        await provisionamento.ProvisionarAsync(
            Empresa.Criar(IdsDesenvolvimento.NomeEmpresaB, agora, IdsDesenvolvimento.EmpresaB),
            [MembroEmpresa.Criar(IdsDesenvolvimento.EmpresaB, devB, Perfis.Administrador, EscoposObras.Todas, agora)],
            cancelamento);
        await provisionamento.ProvisionarAsync(
            Empresa.Criar(IdsDesenvolvimento.NomeEmpresaCompartilhada, agora, IdsDesenvolvimento.EmpresaCompartilhada),
            [
                MembroEmpresa.Criar(IdsDesenvolvimento.EmpresaCompartilhada, devA, Perfis.Administrador, EscoposObras.Todas, agora),
                MembroEmpresa.Criar(IdsDesenvolvimento.EmpresaCompartilhada, devB, Perfis.EngenheiroObra, EscoposObras.Vinculadas, agora),
            ],
            cancelamento);

        await SemearObraVinculadaAsync(devA, devB, agora, cancelamento);
    }

    #endregion

    #region Métodos privados

    // UMA obra fictícia na empresa compartilhada, criada pelo administrador (dev-a) e vinculada ao engenheiro (dev-b). Id fixo e
    // verificação de existência: a semente é idempotente. Auditada pelo SaveChanges auditado (nada de SQL de escrita).
    private async Task SemearObraVinculadaAsync(Guid administrador, Guid engenheiro, DateTime agora, CancellationToken cancelamento)
    {
        var empresaId = IdsDesenvolvimento.EmpresaCompartilhada;
        var metadados = new MetadadosEscrita(OrigensAuditoria.Api, "Semente de desenvolvimento (dado fictício)", null, agora);

        await using var contexto = _fabrica.Criar(new ContextoSessaoBanco(administrador, empresaId));
        if (!await contexto.Obras.AnyAsync(o => o.Id == IdsDesenvolvimento.ObraCompartilhada, cancelamento))
        {
            contexto.Obras.Add(Obra.Criar(
                empresaId,
                new DadosObra(IdsDesenvolvimento.NomeObraCompartilhada, "PE", "2699999", null, null, null, null, null),
                agora,
                IdsDesenvolvimento.ObraCompartilhada));
            await contexto.SalvarAuditadoAsync(metadados, cancelamento);
        }

        if (!await contexto.AcessosObra.AnyAsync(a => a.ObraId == IdsDesenvolvimento.ObraCompartilhada && a.UsuarioId == engenheiro, cancelamento))
        {
            contexto.AcessosObra.Add(AcessoObra.Criar(empresaId, IdsDesenvolvimento.ObraCompartilhada, engenheiro, agora));
            await contexto.SalvarAuditadoAsync(metadados, cancelamento);
        }
    }

    #endregion
}
