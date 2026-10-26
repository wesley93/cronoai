using System.Net;
using CronoAI.Api.Testes.Infra;

namespace CronoAI.Api.Testes.Obras;

/// <summary>Nome único por empresa entre as obras não arquivadas (sem diferenciar caixa).</summary>
[Collection(ColecaoBanco.Nome)]
[Trait("Categoria", "Integracao")]
public sealed class NomeObraTestes
{
    #region Campos

    private readonly BancoPostgresFixture _banco;
    private readonly DadosTeste _dados;

    #endregion

    #region Construtor

    public NomeObraTestes(BancoPostgresFixture banco)
    {
        _banco = banco;
        _dados = new DadosTeste(banco);
    }

    #endregion

    #region Métodos públicos

    [Fact]
    public async Task Nome_duplicado_409_em_criar_renomear_e_restaurar()
    {
        await using var api = await AmbienteApi.CriarAsync(_banco, _dados);
        var nome = "Obra Unica " + Guid.NewGuid().ToString("N")[..10];
        var primeira = await api.CriarObraAsync(AmbienteApi.CorpoValido(nome));

        // Criar com o mesmo nome (outra caixa).
        var criarRepetida = await api.EscreverAsync(HttpMethod.Post, "/api/v1/obras", AmbienteApi.CorpoValido(nome.ToUpperInvariant()));
        Assert.Equal(HttpStatusCode.Conflict, criarRepetida.Status);
        Assert.Equal("obra-nome-duplicado", criarRepetida.Corpo.GetProperty("type").GetString());
        Assert.DoesNotContain("constraint", criarRepetida.Texto, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("ux_obra", criarRepetida.Texto, StringComparison.OrdinalIgnoreCase);

        // Renomear outra obra para o nome ocupado.
        var segunda = await api.CriarObraAsync();
        var renomear = await api.EscreverAsync(HttpMethod.Put, $"/api/v1/obras/{segunda.Id}", AmbienteApi.CorpoDeAtualizacao(segunda.Versao, nome.ToLowerInvariant()));
        Assert.Equal(HttpStatusCode.Conflict, renomear.Status);
        Assert.Equal("obra-nome-duplicado", renomear.Corpo.GetProperty("type").GetString());
        Assert.Equal(1L, await _dados.LerVersaoAsync(api.EmpresaId, segunda.Id));

        // Arquivar a primeira libera o nome; recriar o nome passa; restaurar a primeira agora conflita.
        var arquivada = await api.EscreverAsync(HttpMethod.Post, $"/api/v1/obras/{primeira.Id}/arquivar", new { versao = primeira.Versao });
        Assert.Equal(HttpStatusCode.OK, arquivada.Status);
        var recriada = await api.EscreverAsync(HttpMethod.Post, "/api/v1/obras", AmbienteApi.CorpoValido(nome));
        Assert.Equal(HttpStatusCode.Created, recriada.Status);

        var restaurar = await api.EscreverAsync(HttpMethod.Post, $"/api/v1/obras/{primeira.Id}/restaurar", new { versao = arquivada.Versao });
        Assert.Equal(HttpStatusCode.Conflict, restaurar.Status);
        Assert.Equal("obra-nome-duplicado", restaurar.Corpo.GetProperty("type").GetString());

        // A recusa não deixou rastro: a primeira segue arquivada, na mesma versão, sem trilha extra (criar + arquivar).
        Assert.Equal(arquivada.Versao, await _dados.LerVersaoAsync(api.EmpresaId, primeira.Id));
        Assert.Equal(2, (await _dados.LerAuditoriaAsync(api.EmpresaId, primeira.Id)).Count);

        // Controle negativo: outra empresa pode ter uma obra com o mesmo nome.
        var usuarioB = await _dados.CriarUsuarioAsync();
        var empresaB = await _dados.CriarEmpresaComMembrosAsync(usuarioB);
        var daB = await _dados.CriarObraAsync(empresaB, usuarioB, DadosTeste.DadosObraValidos(nome));
        Assert.Equal(nome, daB.Nome);
    }

    [Fact]
    public async Task Criacoes_simultaneas_mesmo_nome_um_201_um_409()
    {
        await using var api = await AmbienteApi.CriarAsync(_banco, _dados);
        var nome = "Obra Simultanea " + Guid.NewGuid().ToString("N")[..10];

        // O token de antiforgery é obtido UMA vez: dois GET concorrentes trocariam o cookie um do outro e o 400 viraria o desfecho.
        var token = await ClienteAutenticado.ObterTokenAntiforgeryAsync(api.Navegador);
        var respostas = await Task.WhenAll(
            Enumerable.Range(0, 2).Select(async _ =>
            {
                await Task.Yield();
                return await api.EscreverAsync(HttpMethod.Post, "/api/v1/obras", AmbienteApi.CorpoValido(nome), token: token);
            }));

        Assert.Equal(1, respostas.Count(r => r.Status == HttpStatusCode.Created));
        Assert.Equal(1, respostas.Count(r => r.Status == HttpStatusCode.Conflict));
        Assert.Equal("obra-nome-duplicado", respostas.Single(r => r.Status == HttpStatusCode.Conflict).Corpo.GetProperty("type").GetString());
    }

    #endregion
}
