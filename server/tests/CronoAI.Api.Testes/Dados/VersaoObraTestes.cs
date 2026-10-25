using CronoAI.Api.Testes.Infra;
using CronoAI.Dados;
using CronoAI.Dados.Auditoria;
using CronoAI.Dominio;
using Microsoft.EntityFrameworkCore;

namespace CronoAI.Api.Testes.Dados;

/// <summary>Versão da obra por gatilho: nasce 1, soma 1 em todo UPDATE (ignorando o valor enviado) e vira token de concorrência no EF.</summary>
[Collection(ColecaoBanco.Nome)]
[Trait("Categoria", "Integracao")]
public sealed class VersaoObraTestes
{
    #region Campos

    private readonly DadosTeste _dados;

    #endregion

    #region Construtor

    public VersaoObraTestes(BancoPostgresFixture banco)
    {
        _dados = new DadosTeste(banco);
    }

    #endregion

    #region Métodos públicos

    [Fact]
    public async Task Obra_versao_nasce_1_e_gatilho_ignora_valor_enviado()
    {
        var empresa = await _dados.CriarEmpresaAsync();
        var id = await _dados.CriarObraSemAuditoriaAsync(empresa);
        Assert.Equal(1L, await _dados.LerVersaoAsync(empresa, id));

        // O cliente tenta impor a versão 999: o gatilho soma 1 à versão ANTIGA.
        await using var contexto = _dados.Fabrica.Criar(ContextoSessaoBanco.DaEmpresa(empresa));
        await contexto.Database.ExecuteSqlAsync($"UPDATE cronoai.obra SET versao = 999, nome = {"Renomeada"} WHERE id = {id}", TestContext.Current.CancellationToken);
        Assert.Equal(2L, await _dados.LerVersaoAsync(empresa, id));

        // Também sem mexer na coluna e com um valor menor: continua somando.
        await contexto.Database.ExecuteSqlAsync($"UPDATE cronoai.obra SET versao = 1 WHERE id = {id}", TestContext.Current.CancellationToken);
        Assert.Equal(3L, await _dados.LerVersaoAsync(empresa, id));
    }

    [Fact]
    public async Task Obra_versao_lida_de_volta_pelo_ef()
    {
        var usuario = await _dados.CriarUsuarioAsync();
        var empresa = await _dados.CriarEmpresaComMembrosAsync(usuario);

        // Criação: a entidade sai do SaveChanges com a versão do banco (default 1).
        var obra = await _dados.CriarObraAsync(empresa, usuario);
        Assert.Equal(1L, obra.Versao);

        // Atualização: a versão gerada pelo gatilho volta por RETURNING.
        await using var contexto = _dados.Fabrica.Criar(new ContextoSessaoBanco(usuario, empresa));
        var carregada = await contexto.Obras.SingleAsync(o => o.Id == obra.Id, TestContext.Current.CancellationToken);
        Assert.True(carregada.Alterar(DadosTeste.DadosObraValidos("Obra Renomeada " + Guid.NewGuid().ToString("N")[..8]), DateTime.UtcNow));
        await contexto.SalvarAuditadoAsync(Metadados(), TestContext.Current.CancellationToken);

        Assert.Equal(2L, carregada.Versao);
        Assert.Equal(2L, await _dados.LerVersaoAsync(empresa, obra.Id));
    }

    [Fact]
    public async Task Obra_versao_velha_lanca_concorrencia_no_ef()
    {
        var usuario = await _dados.CriarUsuarioAsync();
        var empresa = await _dados.CriarEmpresaComMembrosAsync(usuario);
        var obra = await _dados.CriarObraAsync(empresa, usuario);
        var contexto = new ContextoSessaoBanco(usuario, empresa);
        var nomeDeA = "Gravado por A " + Guid.NewGuid().ToString("N")[..8];

        await using var contextoA = _dados.Fabrica.Criar(contexto);
        await using var contextoB = _dados.Fabrica.Criar(contexto);
        var daA = await contextoA.Obras.SingleAsync(o => o.Id == obra.Id, TestContext.Current.CancellationToken);
        var daB = await contextoB.Obras.SingleAsync(o => o.Id == obra.Id, TestContext.Current.CancellationToken);
        Assert.Equal(daA.Versao, daB.Versao);

        // A grava (versão n+1); B ainda tem a versão n e é recusada, sem gravar nada.
        daA.Alterar(DadosTeste.DadosObraValidos(nomeDeA), DateTime.UtcNow);
        await contextoA.SalvarAuditadoAsync(Metadados(), TestContext.Current.CancellationToken);
        daB.Alterar(DadosTeste.DadosObraValidos("Gravado por B " + Guid.NewGuid().ToString("N")[..8]), DateTime.UtcNow);
        await Assert.ThrowsAsync<DbUpdateConcurrencyException>(() => contextoB.SalvarAuditadoAsync(Metadados(), TestContext.Current.CancellationToken));

        await using var leitura = _dados.Fabrica.Criar(contexto);
        var gravada = await leitura.Obras.AsNoTracking().SingleAsync(o => o.Id == obra.Id, TestContext.Current.CancellationToken);
        Assert.Equal(nomeDeA, gravada.Nome);
        Assert.Equal(2L, gravada.Versao);
        Assert.Equal(2, (await _dados.LerAuditoriaAsync(empresa, obra.Id)).Count);

        // Controle negativo: B relê e grava com a versão certa: sucesso, versão n+2.
        await using var contextoB2 = _dados.Fabrica.Criar(contexto);
        var relida = await contextoB2.Obras.SingleAsync(o => o.Id == obra.Id, TestContext.Current.CancellationToken);
        relida.Alterar(DadosTeste.DadosObraValidos("Gravado por B " + Guid.NewGuid().ToString("N")[..8]), DateTime.UtcNow);
        await contextoB2.SalvarAuditadoAsync(Metadados(), TestContext.Current.CancellationToken);
        Assert.Equal(3L, relida.Versao);
    }

    #endregion

    #region Métodos privados

    private static MetadadosEscrita Metadados() => new(OrigensAuditoria.Ui, null, null, DateTime.UtcNow);

    #endregion
}
