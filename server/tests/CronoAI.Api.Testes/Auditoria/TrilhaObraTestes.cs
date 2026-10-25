using System.Buffers.Text;
using System.Net;
using System.Text;
using CronoAI.Api.Testes.Infra;

namespace CronoAI.Api.Testes.Auditoria;

/// <summary><c>GET /api/v1/obras/{id}/auditoria</c>: keyset por (em, id) em ordem decrescente, cursor opaco e sem nome de usuário.</summary>
[Collection(ColecaoBanco.Nome)]
[Trait("Categoria", "Integracao")]
public sealed class TrilhaObraTestes
{
    #region Campos

    private readonly BancoPostgresFixture _banco;
    private readonly DadosTeste _dados;

    #endregion

    #region Construtor

    public TrilhaObraTestes(BancoPostgresFixture banco)
    {
        _banco = banco;
        _dados = new DadosTeste(banco);
    }

    #endregion

    #region Métodos públicos

    [Fact]
    public async Task Trilha_da_obra_ordenada_com_cursor_e_limite()
    {
        await using var api = await AmbienteApi.CriarAsync(_banco, _dados);
        var obra = await CriarObraComAlteracoesAsync(api, 4);
        var esperados = (await _dados.LerAuditoriaAsync(api.EmpresaId, obra.Id)).OrderByDescending(r => r.Em).ThenByDescending(r => r.Id).Select(r => r.Id).ToList();
        Assert.Equal(5, esperados.Count);

        var ids = new List<long>();
        var paginas = new List<int>();
        string? cursor = null;
        do
        {
            var url = $"/api/v1/obras/{obra.Id}/auditoria?limite=2" + (cursor is null ? "" : "&cursor=" + Uri.EscapeDataString(cursor));
            var pagina = await api.LerAsync(url);
            Assert.Equal(HttpStatusCode.OK, pagina.Status);
            var itens = pagina.Corpo.GetProperty("itens").EnumerateArray().ToList();
            paginas.Add(itens.Count);
            ids.AddRange(itens.Select(i => i.GetProperty("id").GetInt64()));
            cursor = pagina.Corpo.GetProperty("proximoCursor").GetString();
        }
        while (cursor is not null);

        // 3 páginas (2, 2, 1), na ordem (em DESC, id DESC), sem repetir nem pular.
        Assert.Equal([2, 2, 1], paginas);
        Assert.Equal(esperados, ids);
        Assert.Equal(5, ids.Distinct().Count());

        // A de cima é a alteração mais recente; a última, a criação.
        var tudo = await api.LerAsync($"/api/v1/obras/{obra.Id}/auditoria");
        Assert.Equal(5, tudo.Corpo.GetProperty("itens").GetArrayLength());
        Assert.Equal("criar", tudo.Corpo.GetProperty("itens").EnumerateArray().Last().GetProperty("acao").GetString());
        Assert.Equal(System.Text.Json.JsonValueKind.Null, tudo.Corpo.GetProperty("proximoCursor").ValueKind);
    }

    [Theory]
    [InlineData("cursor-adulterado")]
    [InlineData("cursor-base64-com-lixo")]
    [InlineData("limite-0")]
    [InlineData("limite-201")]
    [InlineData("limite-negativo")]
    public async Task Trilha_cursor_ou_limite_invalidos_400(string caso)
    {
        await using var api = await AmbienteApi.CriarAsync(_banco, _dados);
        var obra = await api.CriarObraAsync();

        var (url, campo) = caso switch
        {
            "cursor-adulterado" => ($"/api/v1/obras/{obra.Id}/auditoria?cursor=" + Base64Url.EncodeToString(Encoding.UTF8.GetBytes("1:2:3")), "cursor"),
            "cursor-base64-com-lixo" => ($"/api/v1/obras/{obra.Id}/auditoria?cursor=%21%21%21", "cursor"),
            "limite-0" => ($"/api/v1/obras/{obra.Id}/auditoria?limite=0", "limite"),
            "limite-201" => ($"/api/v1/obras/{obra.Id}/auditoria?limite=201", "limite"),
            _ => ($"/api/v1/obras/{obra.Id}/auditoria?limite=-1", "limite"),
        };

        var resposta = await api.LerAsync(url);

        Assert.Equal(HttpStatusCode.BadRequest, resposta.Status);
        Assert.Equal(campo, Assert.Single(resposta.Corpo.GetProperty("errors").EnumerateObject()).Name);

        // Controle negativo: o limite máximo é aceito.
        Assert.Equal(HttpStatusCode.OK, (await api.LerAsync($"/api/v1/obras/{obra.Id}/auditoria?limite=200")).Status);
    }

    [Fact]
    public async Task Trilha_expoe_usuario_id_sem_nome()
    {
        await using var api = await AmbienteApi.CriarAsync(_banco, _dados);
        var obra = await api.CriarObraAsync();

        var resposta = await api.LerAsync($"/api/v1/obras/{obra.Id}/auditoria");

        var item = Assert.Single(resposta.Corpo.GetProperty("itens").EnumerateArray());
        Assert.Equal(api.UsuarioId, item.GetProperty("usuarioId").GetGuid());
        Assert.Equal("ui", item.GetProperty("origem").GetString());
        Assert.Equal(1L, item.GetProperty("versaoDepois").GetInt64());

        // O nome de exibição do usuário (dado pessoal) nunca sai; também não há IP.
        foreach (var proibido in new[] { "Pessoa Ficticia", "nomeExibicao", "nome_exibicao", "emissor", "sujeito", "ip\"", "email" })
        {
            Assert.DoesNotContain(proibido, resposta.Texto, StringComparison.OrdinalIgnoreCase);
        }
    }

    [Fact]
    public async Task Trilha_de_obra_de_outra_empresa_ou_inexistente_404_identico()
    {
        await using var api = await AmbienteApi.CriarAsync(_banco, _dados);
        var usuarioB = await _dados.CriarUsuarioAsync();
        var empresaB = await _dados.CriarEmpresaComMembrosAsync(usuarioB);
        var daB = await _dados.CriarObraAsync(empresaB, usuarioB);

        var alheia = await api.LerAsync($"/api/v1/obras/{daB.Id}/auditoria");
        var inexistente = await api.LerAsync($"/api/v1/obras/{Guid.NewGuid()}/auditoria");

        Assert.Equal(HttpStatusCode.NotFound, alheia.Status);
        Assert.Equal(HttpStatusCode.NotFound, inexistente.Status);
        Assert.Equal(alheia.CorpoSemTraceId(), inexistente.CorpoSemTraceId());
        Assert.DoesNotContain(daB.Nome, alheia.Texto, StringComparison.Ordinal);
    }

    #endregion

    #region Métodos privados

    // Obra com 1 + alteracoes linhas de trilha (criar + N alterações).
    private static async Task<AmbienteApi.RespostaJson> CriarObraComAlteracoesAsync(AmbienteApi api, int alteracoes)
    {
        var atual = await api.CriarObraAsync();
        var id = atual.Id;
        for (var i = 0; i < alteracoes; i++)
        {
            atual = await api.EscreverAsync(HttpMethod.Put, $"/api/v1/obras/{id}", AmbienteApi.CorpoDeAtualizacao(atual.Versao, $"Edicao {i} " + Guid.NewGuid().ToString("N")[..8]));
            Assert.Equal(HttpStatusCode.OK, atual.Status);
        }

        return atual;
    }

    #endregion
}
