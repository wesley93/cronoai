using CronoAI.Dados;
using CronoAI.Dados.Identidade;
using CronoAI.Dominio;
using Microsoft.EntityFrameworkCore;

namespace CronoAI.Api.Testes.Infra;

/// <summary>
/// Cria dados de teste COMO <c>cronoai_app</c>, pela fábrica e com o contexto de banco exigido pelo RLS (nunca
/// como superusuário: o teste passaria por engano). Todo dado leva ids novos; nada é apagado entre testes.
/// </summary>
public sealed class DadosTeste
{
    #region Campos

    private readonly IFabricaCronoDbContext _fabrica;
    private readonly ConsultasIdentidade _consultas;

    #endregion

    #region Construtor

    public DadosTeste(BancoPostgresFixture banco)
    {
        _fabrica = banco.FabricaApp;
        _consultas = new ConsultasIdentidade(_fabrica);
    }

    #endregion

    #region Propriedades

    public IFabricaCronoDbContext Fabrica => _fabrica;

    public ConsultasIdentidade Consultas => _consultas;

    #endregion

    #region Métodos públicos

    /// <summary>Cria (ou localiza) um usuário pelo mesmo upsert do login. Sujeito aleatório quando omitido.</summary>
    public Task<Guid> CriarUsuarioAsync(string? sujeito = null, string emissor = "https://idp.teste", string? nome = "Pessoa Ficticia")
    {
        return _consultas.UpsertUsuarioAsync(emissor, sujeito ?? "sub-" + Guid.NewGuid().ToString("N"), nome, DateTime.UtcNow);
    }

    /// <summary>Cria a empresa com contexto de empresa = ela própria (política de INSERT: id = empresa do contexto).</summary>
    public async Task<Guid> CriarEmpresaAsync(string? nome = null)
    {
        var empresa = Empresa.Criar(nome ?? "Empresa Ficticia " + Guid.NewGuid().ToString("N")[..8], DateTime.UtcNow);
        await using var contexto = _fabrica.Criar(ContextoSessaoBanco.DaEmpresa(empresa.Id));
        contexto.Empresas.Add(empresa);
        await contexto.SaveChangesAsync();
        return empresa.Id;
    }

    /// <summary>Vincula o usuário à empresa (política de INSERT: empresa_id = empresa do contexto).</summary>
    public async Task VincularAsync(Guid empresaId, Guid usuarioId)
    {
        await using var contexto = _fabrica.Criar(ContextoSessaoBanco.DaEmpresa(empresaId));
        contexto.Membros.Add(MembroEmpresa.Criar(empresaId, usuarioId, DateTime.UtcNow));
        await contexto.SaveChangesAsync();
    }

    /// <summary>Empresa nova com um vínculo para cada usuário informado.</summary>
    public async Task<Guid> CriarEmpresaComMembrosAsync(params Guid[] usuarios)
    {
        var empresaId = await CriarEmpresaAsync();
        foreach (var usuario in usuarios)
        {
            await VincularAsync(empresaId, usuario);
        }

        return empresaId;
    }

    /// <summary>Cria uma sessão aberta (8 h) para o usuário, opcionalmente com empresa ativa.</summary>
    public async Task<Sessao> CriarSessaoAsync(Guid usuarioId, Guid? empresaAtivaId = null, DateTime? criadaEm = null, DateTime? expiraEm = null)
    {
        var criada = criadaEm ?? DateTime.UtcNow;
        var sessao = Sessao.Criar(usuarioId, criada, expiraEm ?? criada.AddHours(8), empresaAtivaId);
        await _consultas.CriarSessaoAsync(sessao);
        return sessao;
    }

    /// <summary>Lê um escalar <see cref="Guid"/> ou contagem pelo SQL parametrizado, sem filtro do EF (só o RLS vale).</summary>
    public static async Task<List<Guid>> LerIdsAsync(CronoDbContext contexto, FormattableString sql)
    {
        return await contexto.Database.SqlQuery<Guid>(sql).ToListAsync();
    }

    #endregion
}
