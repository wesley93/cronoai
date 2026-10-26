using System.Text.Json;
using CronoAI.Api.Testes.Infra;
using CronoAI.Dados;
using CronoAI.Dados.Auditoria;
using CronoAI.Dominio;
using Microsoft.EntityFrameworkCore;
using Npgsql;

namespace CronoAI.Api.Testes.Dados;

/// <summary>Trilha gravada na MESMA transação da mudança (tudo ou nada), só com a lista branca, e falha fechada sem metadados.</summary>
[Collection(ColecaoBanco.Nome)]
[Trait("Categoria", "Integracao")]
public sealed class AuditoriaInterceptorTestes
{
    #region Campos

    private static readonly string[] _chavesDaCriacao =
    [
        "arquivada_em", "data_status", "municipio_ibge", "nome", "opcoes_cronograma", "responsavel_id", "sinapi_data_base",
        "sinapi_regime", "sinapi_uf", "uf",
    ];

    private readonly BancoPostgresFixture _banco;
    private readonly DadosTeste _dados;

    #endregion

    #region Construtor

    public AuditoriaInterceptorTestes(BancoPostgresFixture banco)
    {
        _banco = banco;
        _dados = new DadosTeste(banco);
    }

    #endregion

    #region Métodos públicos

    [Fact]
    public async Task Auditoria_atomica_quando_a_mudanca_falha()
    {
        var (empresa, usuario) = await CriarContextoAsync();
        var contexto = new ContextoSessaoBanco(usuario, empresa);

        // UF no formato certo, mas fora da lista: a FK do banco recusa a obra e, junto, a auditoria.
        var invalida = Obra.Criar(empresa, DadosTeste.DadosObraValidos() with { Uf = "XX" }, DateTime.UtcNow);
        await using (var banco = _dados.Fabrica.Criar(contexto))
        {
            banco.Obras.Add(invalida);
            await Assert.ThrowsAsync<DbUpdateException>(() => banco.SalvarAuditadoAsync(Metadados(), TestContext.Current.CancellationToken));
        }

        Assert.Equal("0", await _banco.ConsultarComoSuperusuarioAsync($"SELECT count(*) FROM cronoai.obra WHERE id = '{invalida.Id}'"));
        Assert.Equal("0", await _banco.ConsultarComoSuperusuarioAsync($"SELECT count(*) FROM cronoai.auditoria WHERE entidade_id = '{invalida.Id}'"));

        // Controle negativo: com valores válidos existem as duas linhas, e o "depois" é o estado da obra.
        var valida = await _dados.CriarObraAsync(empresa, usuario);
        var trilha = Assert.Single(await _dados.LerAuditoriaAsync(empresa, valida.Id));
        using var depois = JsonDocument.Parse(trilha.Depois!);
        Assert.Equal(valida.Nome, depois.RootElement.GetProperty("nome").GetString());
        Assert.Equal(valida.Uf, depois.RootElement.GetProperty("uf").GetString());
    }

    [Fact]
    public async Task Auditoria_atomica_quando_a_auditoria_falha()
    {
        var (empresa, usuario) = await CriarContextoAsync();
        var obra = await _dados.CriarObraAsync(empresa, usuario);
        var contexto = new ContextoSessaoBanco(usuario, empresa);
        var nomeOriginal = obra.Nome;

        await using (var banco = _dados.Fabrica.Criar(contexto))
        {
            var carregada = await banco.Obras.SingleAsync(o => o.Id == obra.Id, TestContext.Current.CancellationToken);
            carregada.Alterar(DadosTeste.DadosObraValidos("Nao Deve Gravar " + Guid.NewGuid().ToString("N")[..8]), DateTime.UtcNow);

            // Registro de auditoria inválido injetado no MESMO SaveChanges (ação fora do CHECK): derruba o lote inteiro.
            var injetado = RegistroAuditoria.Criar(empresa, obra.Id, usuario, "obra", obra.Id, AcoesAuditoria.Alterar, null, "{}", 2, OrigensAuditoria.Ui, null, null, DateTime.UtcNow);
            banco.Auditorias.Add(injetado);
            banco.Entry(injetado).Property(r => r.Acao).CurrentValue = "invalida";

            var erro = await Assert.ThrowsAsync<DbUpdateException>(() => banco.SalvarAuditadoAsync(Metadados(), TestContext.Current.CancellationToken));
            Assert.Equal("ck_auditoria_acao", Assert.IsType<PostgresException>(erro.InnerException).ConstraintName);
        }

        await using var leitura = _dados.Fabrica.Criar(contexto);
        var gravada = await leitura.Obras.AsNoTracking().SingleAsync(o => o.Id == obra.Id, TestContext.Current.CancellationToken);
        Assert.Equal(nomeOriginal, gravada.Nome);
        Assert.Equal(1L, gravada.Versao);
        Assert.Single(await _dados.LerAuditoriaAsync(empresa, obra.Id));

        // Controle negativo: sem a injeção, a obra muda e a auditoria existe.
        await using var sem = _dados.Fabrica.Criar(contexto);
        var outra = await sem.Obras.SingleAsync(o => o.Id == obra.Id, TestContext.Current.CancellationToken);
        outra.Alterar(DadosTeste.DadosObraValidos("Deve Gravar " + Guid.NewGuid().ToString("N")[..8]), DateTime.UtcNow);
        await sem.SalvarAuditadoAsync(Metadados(), TestContext.Current.CancellationToken);
        Assert.Equal(2, (await _dados.LerAuditoriaAsync(empresa, obra.Id)).Count);
    }

    [Fact]
    public async Task Auditoria_registra_so_campos_alterados_da_lista_branca()
    {
        var (empresa, usuario) = await CriarContextoAsync();
        var obra = await _dados.CriarObraAsync(empresa, usuario, motivo: "criação inicial");
        var nomeAntigo = obra.Nome;
        var nomeNovo = "Obra Renomeada " + Guid.NewGuid().ToString("N")[..8];

        await using (var banco = _dados.Fabrica.Criar(new ContextoSessaoBanco(usuario, empresa)))
        {
            var carregada = await banco.Obras.SingleAsync(o => o.Id == obra.Id, TestContext.Current.CancellationToken);
            carregada.Alterar(DadosTeste.DadosObraValidos(nomeNovo), DateTime.UtcNow);
            await banco.SalvarAuditadoAsync(Metadados("revisão de prazo"), TestContext.Current.CancellationToken);
        }

        var trilha = await _dados.LerAuditoriaAsync(empresa, obra.Id);
        Assert.Equal(2, trilha.Count);

        // criar: antes nulo, depois com os 10 campos da lista branca, em snake_case.
        var criar = trilha[0];
        Assert.Equal(AcoesAuditoria.Criar, criar.Acao);
        Assert.Null(criar.Antes);
        using var depoisCriar = JsonDocument.Parse(criar.Depois!);
        Assert.Equal(_chavesDaCriacao, depoisCriar.RootElement.EnumerateObject().Select(p => p.Name).Order(StringComparer.Ordinal));
        Assert.Equal(nomeAntigo, depoisCriar.RootElement.GetProperty("nome").GetString());
        Assert.Equal("criação inicial", criar.Motivo);

        // alterar: SÓ o nome. atualizada_em também mudou, mas não está na lista branca e é descartada (como a versão).
        var alterar = trilha[1];
        Assert.Equal(AcoesAuditoria.Alterar, alterar.Acao);
        using var antes = JsonDocument.Parse(alterar.Antes!);
        using var depois = JsonDocument.Parse(alterar.Depois!);
        Assert.Equal(["nome"], antes.RootElement.EnumerateObject().Select(p => p.Name).ToArray());
        Assert.Equal(["nome"], depois.RootElement.EnumerateObject().Select(p => p.Name).ToArray());
        Assert.Equal(nomeAntigo, antes.RootElement.GetProperty("nome").GetString());
        Assert.Equal(nomeNovo, depois.RootElement.GetProperty("nome").GetString());
        Assert.Equal("revisão de prazo", alterar.Motivo);
        Assert.DoesNotContain("atualizada_em", alterar.Depois, StringComparison.Ordinal);
        Assert.DoesNotContain("versao", alterar.Depois, StringComparison.Ordinal);
    }

    [Fact]
    public async Task Auditoria_acao_derivada_do_arquivamento()
    {
        var (empresa, usuario) = await CriarContextoAsync();
        var obra = await _dados.CriarObraAsync(empresa, usuario);
        var contexto = new ContextoSessaoBanco(usuario, empresa);

        await using (var banco = _dados.Fabrica.Criar(contexto))
        {
            var carregada = await banco.Obras.SingleAsync(o => o.Id == obra.Id, TestContext.Current.CancellationToken);
            carregada.Arquivar(DateTime.UtcNow);
            await banco.SalvarAuditadoAsync(Metadados(), TestContext.Current.CancellationToken);
        }

        await using (var banco = _dados.Fabrica.Criar(contexto))
        {
            var carregada = await banco.Obras.SingleAsync(o => o.Id == obra.Id, TestContext.Current.CancellationToken);
            carregada.Restaurar(DateTime.UtcNow);
            await banco.SalvarAuditadoAsync(Metadados(), TestContext.Current.CancellationToken);
        }

        var trilha = await _dados.LerAuditoriaAsync(empresa, obra.Id);
        Assert.Equal([AcoesAuditoria.Criar, AcoesAuditoria.Arquivar, AcoesAuditoria.Restaurar], trilha.Select(t => t.Acao).ToArray());

        using var arquivar = JsonDocument.Parse(trilha[1].Depois!);
        using var arquivarAntes = JsonDocument.Parse(trilha[1].Antes!);
        Assert.Equal(["arquivada_em"], arquivar.RootElement.EnumerateObject().Select(p => p.Name).ToArray());
        Assert.Equal(JsonValueKind.Null, arquivarAntes.RootElement.GetProperty("arquivada_em").ValueKind);
        Assert.Equal(JsonValueKind.String, arquivar.RootElement.GetProperty("arquivada_em").ValueKind);

        using var restaurarAntes = JsonDocument.Parse(trilha[2].Antes!);
        using var restaurarDepois = JsonDocument.Parse(trilha[2].Depois!);
        Assert.Equal(JsonValueKind.String, restaurarAntes.RootElement.GetProperty("arquivada_em").ValueKind);
        Assert.Equal(JsonValueKind.Null, restaurarDepois.RootElement.GetProperty("arquivada_em").ValueKind);
    }

    [Fact]
    public async Task Auditoria_versao_depois_confere_com_o_banco()
    {
        var (empresa, usuario) = await CriarContextoAsync();
        var obra = await _dados.CriarObraAsync(empresa, usuario);
        var contexto = new ContextoSessaoBanco(usuario, empresa);

        for (var i = 0; i < 2; i++)
        {
            await using var banco = _dados.Fabrica.Criar(contexto);
            var carregada = await banco.Obras.SingleAsync(o => o.Id == obra.Id, TestContext.Current.CancellationToken);
            carregada.Alterar(DadosTeste.DadosObraValidos("Obra v" + i + " " + Guid.NewGuid().ToString("N")[..8]), DateTime.UtcNow);
            await banco.SalvarAuditadoAsync(Metadados(), TestContext.Current.CancellationToken);
        }

        var trilha = await _dados.LerAuditoriaAsync(empresa, obra.Id);
        Assert.Equal([1L, 2L, 3L], trilha.Select(t => t.VersaoDepois!.Value).ToArray());
        Assert.Equal(3L, await _dados.LerVersaoAsync(empresa, obra.Id));
    }

    [Fact]
    public async Task SaveChanges_com_auditavel_sem_metadados_lanca()
    {
        var (empresa, usuario) = await CriarContextoAsync();
        var obra = await _dados.CriarObraAsync(empresa, usuario);
        var contexto = new ContextoSessaoBanco(usuario, empresa);

        await using (var banco = _dados.Fabrica.Criar(contexto))
        {
            var carregada = await banco.Obras.SingleAsync(o => o.Id == obra.Id, TestContext.Current.CancellationToken);
            carregada.Alterar(DadosTeste.DadosObraValidos("Sem Metadados " + Guid.NewGuid().ToString("N")[..8]), DateTime.UtcNow);

            await Assert.ThrowsAsync<InvalidOperationException>(() => banco.SaveChangesAsync(TestContext.Current.CancellationToken));
            Assert.Throws<InvalidOperationException>(() => banco.SaveChanges());
        }

        // Obra nova sem metadados também lança; nada foi gravado.
        await using (var banco = _dados.Fabrica.Criar(contexto))
        {
            var nova = Obra.Criar(empresa, DadosTeste.DadosObraValidos(), DateTime.UtcNow);
            banco.Obras.Add(nova);
            await Assert.ThrowsAsync<InvalidOperationException>(() => banco.SaveChangesAsync(TestContext.Current.CancellationToken));
            Assert.Equal("0", await _banco.ConsultarComoSuperusuarioAsync($"SELECT count(*) FROM cronoai.obra WHERE id = '{nova.Id}'"));
        }

        await using var leitura = _dados.Fabrica.Criar(contexto);
        Assert.Equal(obra.Nome, (await leitura.Obras.AsNoTracking().SingleAsync(o => o.Id == obra.Id, TestContext.Current.CancellationToken)).Nome);
        Assert.Single(await _dados.LerAuditoriaAsync(empresa, obra.Id));

        // Controle negativo: entidade NÃO auditável (sessão) grava com SaveChanges comum.
        var sessao = await _dados.CriarSessaoAsync(usuario, empresa);
        Assert.NotEqual(Guid.Empty, sessao.Id);
    }

    [Fact]
    public async Task SaveChanges_auditavel_sem_usuario_no_contexto_lanca()
    {
        var (empresa, _) = await CriarContextoAsync();

        // Contexto só com a empresa: a trilha exige o usuário da sessão (nunca do corpo), então não há escrita anônima.
        // (Com o RLS por obra um contexto sem usuário nem enxerga a obra para alterá-la: a escrita testada é uma criação.)
        await using var banco = _dados.Fabrica.Criar(ContextoSessaoBanco.DaEmpresa(empresa));
        banco.Obras.Add(Obra.Criar(empresa, DadosTeste.DadosObraValidos("Sem Usuario " + Guid.NewGuid().ToString("N")[..8]), DateTime.UtcNow));

        await Assert.ThrowsAsync<InvalidOperationException>(() => banco.SalvarAuditadoAsync(Metadados(), TestContext.Current.CancellationToken));
    }

    [Fact]
    public async Task Remover_entidade_auditavel_lanca()
    {
        var (empresa, usuario) = await CriarContextoAsync();
        var obra = await _dados.CriarObraAsync(empresa, usuario);

        await using var banco = _dados.Fabrica.Criar(new ContextoSessaoBanco(usuario, empresa));
        var carregada = await banco.Obras.SingleAsync(o => o.Id == obra.Id, TestContext.Current.CancellationToken);
        banco.Obras.Remove(carregada);

        await Assert.ThrowsAsync<InvalidOperationException>(() => banco.SalvarAuditadoAsync(Metadados(), TestContext.Current.CancellationToken));
        Assert.Equal(1L, await _dados.LerVersaoAsync(empresa, obra.Id));
    }

    [Fact]
    public async Task SalvarAuditado_limpa_os_metadados_ao_terminar()
    {
        var (empresa, usuario) = await CriarContextoAsync();
        var obra = await _dados.CriarObraAsync(empresa, usuario);

        await using var banco = _dados.Fabrica.Criar(new ContextoSessaoBanco(usuario, empresa));
        var carregada = await banco.Obras.SingleAsync(o => o.Id == obra.Id, TestContext.Current.CancellationToken);
        carregada.Alterar(DadosTeste.DadosObraValidos("Primeira " + Guid.NewGuid().ToString("N")[..8]), DateTime.UtcNow);
        await banco.SalvarAuditadoAsync(Metadados(), TestContext.Current.CancellationToken);

        // Depois da chamada os metadados somem: outra escrita auditável com SaveChanges comum volta a lançar.
        carregada.Alterar(DadosTeste.DadosObraValidos("Segunda " + Guid.NewGuid().ToString("N")[..8]), DateTime.UtcNow);
        await Assert.ThrowsAsync<InvalidOperationException>(() => banco.SaveChangesAsync(TestContext.Current.CancellationToken));
    }

    [Fact]
    public async Task Auditoria_colunas_sem_ip_nem_dado_pessoal()
    {
        var (empresa, usuario) = await CriarContextoAsync();
        var obra = await _dados.CriarObraAsync(empresa, usuario);

        // Colunas da trilha = a lista do plano, sem IP (ciclo 00013, Q6).
        await using var conexao = new NpgsqlConnection(_banco.StringConexaoApp);
        await conexao.OpenAsync(TestContext.Current.CancellationToken);
        await using var comando = new NpgsqlCommand(
            "SELECT column_name FROM information_schema.columns WHERE table_schema = 'cronoai' AND table_name = 'auditoria' ORDER BY column_name",
            conexao);
        var colunas = new List<string>();
        await using (var leitor = await comando.ExecuteReaderAsync(TestContext.Current.CancellationToken))
        {
            while (await leitor.ReadAsync(TestContext.Current.CancellationToken))
            {
                colunas.Add(leitor.GetString(0));
            }
        }

        string[] esperadas =
        [
            "acao", "antes", "correlacao_id", "depois", "em", "empresa_id", "entidade", "entidade_id", "id", "motivo", "obra_id",
            "origem", "usuario_id", "versao_depois",
        ];
        Assert.Equal(esperadas, colunas);
        Assert.DoesNotContain("ip", colunas);

        // Nenhum dado pessoal no JSON: só campos da lista branca (nem nome de exibição, emissor, sujeito ou e-mail).
        var trilha = Assert.Single(await _dados.LerAuditoriaAsync(empresa, obra.Id));
        foreach (var proibido in new[] { "nome_exibicao", "emissor", "sujeito", "email", "@" })
        {
            Assert.DoesNotContain(proibido, trilha.Depois!, StringComparison.OrdinalIgnoreCase);
        }
    }

    #endregion

    #region Métodos privados

    private async Task<(Guid Empresa, Guid Usuario)> CriarContextoAsync()
    {
        var usuario = await _dados.CriarUsuarioAsync();
        return (await _dados.CriarEmpresaComMembrosAsync(usuario), usuario);
    }

    private static MetadadosEscrita Metadados(string? motivo = null) => new(OrigensAuditoria.Ui, motivo, null, DateTime.UtcNow);

    #endregion
}
