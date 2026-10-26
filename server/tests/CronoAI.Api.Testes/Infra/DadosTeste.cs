using CronoAI.Dados;
using CronoAI.Dados.Auditoria;
using CronoAI.Dados.Identidade;
using CronoAI.Dominio;
using Microsoft.EntityFrameworkCore;
using SessaoDominio = CronoAI.Dominio.Sessao;

namespace CronoAI.Api.Testes.Infra;

/// <summary>
/// Cria dados de teste COMO <c>cronoai_app</c>, pela fábrica e com o contexto de banco exigido pelo RLS (nunca
/// como superusuário: o teste passaria por engano). Todo dado leva ids novos; nada é apagado entre testes.
/// </summary>
public sealed class DadosTeste
{
    #region Campos

    // Administrador de cada empresa criada pelo helper: o RLS por obra exige um USUÁRIO no contexto, e os testes antigos só
    // tinham a empresa. Ids de empresa são únicos por teste, então o dicionário estático não vaza entre eles.
    private static readonly System.Collections.Concurrent.ConcurrentDictionary<Guid, Guid> _administradores = new();

    private readonly BancoPostgresFixture _banco;
    private readonly IFabricaCronoDbContext _fabrica;
    private readonly ConsultasIdentidade _consultas;

    #endregion

    #region Construtor

    public DadosTeste(BancoPostgresFixture banco)
    {
        _banco = banco;
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

    /// <summary>
    /// Cria a empresa com contexto de empresa = ela própria (política de INSERT: id = empresa do contexto). Por padrão também cria
    /// um administrador "técnico" fictício: o RLS por obra exige um usuário no contexto e o gatilho diferido exige um
    /// administrador por empresa. Cenários que montam os próprios membros passam <paramref name="comAdministradorTecnico"/> falso.
    /// </summary>
    public async Task<Guid> CriarEmpresaAsync(string? nome = null, bool comAdministradorTecnico = true)
    {
        var empresa = Empresa.Criar(nome ?? "Empresa Ficticia " + Guid.NewGuid().ToString("N")[..8], DateTime.UtcNow);
        await using (var contexto = _fabrica.Criar(ContextoSessaoBanco.DaEmpresa(empresa.Id)))
        {
            contexto.Empresas.Add(empresa);
            await contexto.SaveChangesAsync();
        }

        if (comAdministradorTecnico)
        {
            await VincularAsync(empresa.Id, await CriarUsuarioAsync(nome: "Administrador Tecnico"));
        }

        return empresa.Id;
    }

    /// <summary>
    /// Vincula o usuário à empresa COMO SUPERUSUÁRIO da fixture (só para produzir estado: o papel da aplicação não tem INSERT em
    /// membro_empresa). Por padrão o vínculo é de administrador, o que mantém os testes antigos válidos; o gatilho diferido
    /// exige um administrador por empresa, então um perfil que não é administrador só entra numa empresa que já tem um.
    /// </summary>
    public async Task VincularAsync(Guid empresaId, Guid usuarioId, string perfil = Perfis.Administrador, string? escopoObras = null)
    {
        var escopo = escopoObras ?? Perfis.EscopoUnico(perfil) ?? EscoposObras.Todas;
        var agora = DateTime.UtcNow.ToString("O", System.Globalization.CultureInfo.InvariantCulture);
        await _banco.ProduzirEstadoComoSuperusuarioAsync(
            $"INSERT INTO cronoai.membro_empresa (empresa_id, usuario_id, perfil, escopo_obras, criado_em, atualizado_em) VALUES ('{empresaId}', '{usuarioId}', '{perfil}', '{escopo}', '{agora}', '{agora}')");
        if (perfil == Perfis.Administrador)
        {
            _administradores.TryAdd(empresaId, usuarioId);
        }
    }

    /// <summary>Empresa nova com um vínculo de ADMINISTRADOR para cada usuário informado.</summary>
    public async Task<Guid> CriarEmpresaComMembrosAsync(params Guid[] usuarios)
    {
        var empresaId = await CriarEmpresaAsync();
        foreach (var usuario in usuarios)
        {
            await VincularAsync(empresaId, usuario);
        }

        return empresaId;
    }

    /// <summary>Administrador conhecido da empresa criada por este helper (lança se não houver).</summary>
    public static Guid AdministradorDe(Guid empresaId) =>
        _administradores.TryGetValue(empresaId, out var id) ? id : throw new InvalidOperationException("Empresa sem administrador conhecido no helper.");

    /// <summary>Contexto (administrador, empresa): o RLS por obra exige um usuário. Sem administrador conhecido, só a empresa.</summary>
    public static ContextoSessaoBanco ComoAdministrador(Guid empresaId) =>
        _administradores.TryGetValue(empresaId, out var id) ? new ContextoSessaoBanco(id, empresaId) : ContextoSessaoBanco.DaEmpresa(empresaId);

    /// <summary>Vínculo membro × obra, como superusuário da fixture (produz estado; a API de acessos é o que se testa noutro lugar).</summary>
    public async Task<Guid> CriarAcessoObraAsync(Guid empresaId, Guid obraId, Guid usuarioId)
    {
        var id = Guid.CreateVersion7();
        await _banco.ProduzirEstadoComoSuperusuarioAsync(
            $"INSERT INTO cronoai.acesso_obra (id, empresa_id, obra_id, usuario_id, criado_em) VALUES ('{id}', '{empresaId}', '{obraId}', '{usuarioId}', '{Agora()}')");
        return id;
    }

    /// <summary>Carteira (opcionalmente já arquivada), como superusuário da fixture.</summary>
    public async Task<Guid> CriarCarteiraAsync(Guid empresaId, string? nome = null, string tipo = TiposCarteira.Regional, bool arquivada = false)
    {
        var id = Guid.CreateVersion7();
        var agora = Agora();
        var arquivadaEm = arquivada ? $"'{agora}'" : "NULL";
        await _banco.ProduzirEstadoComoSuperusuarioAsync(
            $"INSERT INTO cronoai.carteira (id, empresa_id, nome, tipo, criada_em, atualizada_em, arquivada_em) VALUES ('{id}', '{empresaId}', '{nome ?? "Carteira " + Guid.NewGuid().ToString("N")[..8]}', '{tipo}', '{agora}', '{agora}', {arquivadaEm})");
        return id;
    }

    /// <summary>Obra dentro da carteira e carteira atribuída ao usuário, como superusuário da fixture.</summary>
    public async Task IncluirObraNaCarteiraAsync(Guid empresaId, Guid carteiraId, Guid obraId)
    {
        await _banco.ProduzirEstadoComoSuperusuarioAsync(
            $"INSERT INTO cronoai.carteira_obra (id, empresa_id, carteira_id, obra_id, criado_em) VALUES ('{Guid.CreateVersion7()}', '{empresaId}', '{carteiraId}', '{obraId}', '{Agora()}')");
    }

    public async Task AtribuirCarteiraAsync(Guid empresaId, Guid carteiraId, Guid usuarioId)
    {
        await _banco.ProduzirEstadoComoSuperusuarioAsync(
            $"INSERT INTO cronoai.acesso_carteira (id, empresa_id, carteira_id, usuario_id, criado_em) VALUES ('{Guid.CreateVersion7()}', '{empresaId}', '{carteiraId}', '{usuarioId}', '{Agora()}')");
    }

    /// <summary>Frente de obra, como superusuário da fixture.</summary>
    public async Task<Guid> CriarFrenteAsync(Guid empresaId, Guid obraId, string? nome = null)
    {
        var id = Guid.CreateVersion7();
        var agora = Agora();
        await _banco.ProduzirEstadoComoSuperusuarioAsync(
            $"INSERT INTO cronoai.frente (id, empresa_id, obra_id, nome, criada_em, atualizada_em) VALUES ('{id}', '{empresaId}', '{obraId}', '{nome ?? "Frente " + Guid.NewGuid().ToString("N")[..8]}', '{agora}', '{agora}')");
        return id;
    }

    public async Task CriarAcessoFrenteAsync(Guid empresaId, Guid obraId, Guid frenteId, Guid usuarioId)
    {
        await _banco.ProduzirEstadoComoSuperusuarioAsync(
            $"INSERT INTO cronoai.acesso_frente (id, empresa_id, obra_id, frente_id, usuario_id, criado_em) VALUES ('{Guid.CreateVersion7()}', '{empresaId}', '{obraId}', '{frenteId}', '{usuarioId}', '{Agora()}')");
    }

    /// <summary>
    /// Remove (logicamente) o membro como superusuário, com o contexto do administrador da empresa na MESMA transação: o gatilho
    /// de administrador exige um usuário administrador no contexto, até para o superusuário.
    /// </summary>
    public async Task RemoverMembroAsync(Guid empresaId, Guid usuarioId)
    {
        var admin = AdministradorDe(empresaId);
        await _banco.ProduzirEstadoComoSuperusuarioAsync(
            $"SELECT set_config('app.usuario_id', '{admin}', true), set_config('app.empresa_id', '{empresaId}', true); "
            + $"UPDATE cronoai.membro_empresa SET removido_em = greatest(now(), criado_em), atualizado_em = greatest(now(), criado_em) WHERE empresa_id = '{empresaId}' AND usuario_id = '{usuarioId}'");
    }

    /// <summary>Cria uma sessão aberta (8 h) para o usuário, opcionalmente com empresa ativa.</summary>
    public async Task<SessaoDominio> CriarSessaoAsync(Guid usuarioId, Guid? empresaAtivaId = null, DateTime? criadaEm = null, DateTime? expiraEm = null)
    {
        var criada = criadaEm ?? DateTime.UtcNow;
        var sessao = SessaoDominio.Criar(usuarioId, criada, expiraEm ?? criada.AddHours(8), empresaAtivaId);
        await _consultas.CriarSessaoAsync(sessao);
        return sessao;
    }

    /// <summary>Dados válidos e fictícios de obra (UF PE, município fictício 2699999 com DV válido, nome único por chamada).</summary>
    public static DadosObra DadosObraValidos(string? nome = null) =>
        new(nome ?? "Obra Ficticia " + Guid.NewGuid().ToString("N")[..10], "PE", "2699999", null, new DateOnly(2026, 10, 1), null, null, null);

    /// <summary>
    /// Cria a obra AUDITADA, como a API faz (contexto da empresa e do usuário; origem <c>ui</c>), e devolve a entidade já
    /// com a versão lida do banco.
    /// </summary>
    public async Task<Obra> CriarObraAsync(Guid empresaId, Guid usuarioId, DadosObra? dados = null, string? motivo = null)
    {
        var obra = Obra.Criar(empresaId, dados ?? DadosObraValidos(), DateTime.UtcNow);
        await using var contexto = _fabrica.Criar(new ContextoSessaoBanco(usuarioId, empresaId));
        contexto.Obras.Add(obra);
        await contexto.SalvarAuditadoAsync(new MetadadosEscrita(OrigensAuditoria.Ui, motivo, null, DateTime.UtcNow));
        return obra;
    }

    /// <summary>
    /// Cria a obra SEM auditoria, por INSERT direto como <c>cronoai_app</c> (o RLS vale): para os testes que precisam
    /// apagá-la depois com a conexão de bootstrap (a FK da trilha impede apagar obra auditada).
    /// </summary>
    public async Task<Guid> CriarObraSemAuditoriaAsync(Guid empresaId, string? nome = null)
    {
        var id = Guid.CreateVersion7();
        var agora = DateTime.UtcNow;
        await using var contexto = _fabrica.Criar(ComoAdministrador(empresaId));
        await contexto.Database.ExecuteSqlAsync(
            $"INSERT INTO cronoai.obra (id, empresa_id, nome, uf, municipio_ibge, criada_em, atualizada_em) VALUES ({id}, {empresaId}, {nome ?? "Obra Ficticia " + id.ToString("N")[..10]}, {"PE"}, {"2699999"}, {agora}, {agora})");
        return id;
    }

    /// <summary>
    /// INSERT direto em <c>obra</c> como <c>cronoai_app</c>, SEM o domínio, para provar as restrições do BANCO (CHECK, FK,
    /// índice único e RLS). O contexto de banco é o da empresa informada; a linha leva <paramref name="empresaDaLinha"/>.
    /// </summary>
    public async Task InserirObraBrutaAsync(
        Guid empresaDoContexto,
        Guid empresaDaLinha,
        string nome,
        string uf = "PE",
        string municipio = "2699999",
        Guid? responsavel = null,
        string? sinapiUf = null,
        string? sinapiRegime = null,
        DateOnly? sinapiDataBase = null,
        string opcoes = "{}")
    {
        var agora = DateTime.UtcNow;
        await using var contexto = _fabrica.Criar(ComoAdministrador(empresaDoContexto));
        await contexto.Database.ExecuteSqlAsync($"""
            INSERT INTO cronoai.obra (id, empresa_id, nome, uf, municipio_ibge, responsavel_id, sinapi_uf, sinapi_regime, sinapi_data_base, opcoes_cronograma, criada_em, atualizada_em)
            VALUES ({Guid.CreateVersion7()}, {empresaDaLinha}, {nome}, {uf}, {municipio}, {responsavel}, {sinapiUf}, {sinapiRegime}, {sinapiDataBase}, {opcoes}::jsonb, {agora}, {agora})
            """);
    }

    /// <summary>
    /// INSERT direto em <c>auditoria</c> como <c>cronoai_app</c> (contexto da empresa informada), sem obra: prova o RLS e o
    /// INSERT no identity. A linha leva <paramref name="empresaDaLinha"/>.
    /// </summary>
    public async Task InserirAuditoriaBrutaAsync(Guid empresaDoContexto, Guid empresaDaLinha, Guid usuarioId)
    {
        await using var contexto = _fabrica.Criar(new ContextoSessaoBanco(usuarioId, empresaDoContexto));
        await contexto.Database.ExecuteSqlAsync($"""
            INSERT INTO cronoai.auditoria (empresa_id, usuario_id, entidade, entidade_id, acao, origem, em)
            VALUES ({empresaDaLinha}, {usuarioId}, {"obra"}, {Guid.CreateVersion7()}, {"criar"}, {"ui"}, {DateTime.UtcNow})
            """);
    }

    /// <summary>Objeto JSON compacto (sem espaços) com N pares <c>"kNNNN":1</c>: serve às bordas do teto de <c>opcoes_cronograma</c>.</summary>
    public static string ParesCompactos(int quantidade) =>
        "{" + string.Join(",", Enumerable.Range(0, quantidade).Select(i => $"\"k{i:D4}\":1")) + "}";

    /// <summary>Versão da obra lida do banco (como app, contexto da empresa), sem passar pelo ChangeTracker.</summary>
    public async Task<long> LerVersaoAsync(Guid empresaId, Guid obraId)
    {
        await using var contexto = _fabrica.Criar(ComoAdministrador(empresaId));
        var versoes = await contexto.Database
            .SqlQuery<long>($"SELECT versao AS \"Value\" FROM cronoai.obra WHERE id = {obraId}")
            .ToListAsync();
        return versoes.Single();
    }

    /// <summary>Trilha da obra em ordem de gravação (como app, contexto da empresa; o RLS e o filtro valem).</summary>
    public async Task<List<RegistroAuditoria>> LerAuditoriaAsync(Guid empresaId, Guid obraId)
    {
        await using var contexto = _fabrica.Criar(ComoAdministrador(empresaId));
        return await contexto.Auditorias.AsNoTracking()
            .Where(a => a.ObraId == obraId)
            .OrderBy(a => a.Id)
            .ToListAsync();
    }

    /// <summary>Lê um escalar <see cref="Guid"/> ou contagem pelo SQL parametrizado, sem filtro do EF (só o RLS vale).</summary>
    public static async Task<List<Guid>> LerIdsAsync(CronoDbContext contexto, FormattableString sql)
    {
        return await contexto.Database.SqlQuery<Guid>(sql).ToListAsync();
    }

    #endregion

    #region Métodos privados

    private static string Agora() => DateTime.UtcNow.ToString("O", System.Globalization.CultureInfo.InvariantCulture);

    #endregion
}
