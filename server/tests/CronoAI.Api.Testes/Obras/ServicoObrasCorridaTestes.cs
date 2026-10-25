using CronoAI.Api.Obras;
using CronoAI.Api.Sessao;
using CronoAI.Api.Testes.Infra;
using CronoAI.Dados;
using CronoAI.Dominio;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Microsoft.Extensions.Logging.Abstractions;

namespace CronoAI.Api.Testes.Obras;

/// <summary>
/// Corrida ENTRE a leitura e a gravação da obra, no serviço. Um interceptor de teste (só neste contexto) executa a outra
/// escrita no instante exato em que o <c>SaveChanges</c> começa: depois do carregamento e antes do <c>UPDATE</c>.
/// </summary>
[Collection(ColecaoBanco.Nome)]
[Trait("Categoria", "Integracao")]
public sealed class ServicoObrasCorridaTestes
{
    #region Campos

    private readonly BancoPostgresFixture _banco;
    private readonly DadosTeste _dados;

    #endregion

    #region Construtor

    public ServicoObrasCorridaTestes(BancoPostgresFixture banco)
    {
        _banco = banco;
        _dados = new DadosTeste(banco);
    }

    #endregion

    #region Métodos públicos

    [Fact]
    public async Task Obra_some_entre_leitura_e_gravacao_vira_404()
    {
        var usuario = await _dados.CriarUsuarioAsync();
        var empresa = await _dados.CriarEmpresaComMembrosAsync(usuario);

        // Obra sem trilha (a FK da trilha impediria apagá-la) e removida pela conexão de bootstrap no meio da operação.
        var id = await _dados.CriarObraSemAuditoriaAsync(empresa);
        var gancho = new GanchoAntesDeSalvar(() => _banco.ConsultarComoSuperusuarioAsync($"DELETE FROM cronoai.obra WHERE id = '{id}'"));
        await using var banco = CriarContexto(usuario, empresa, gancho);
        var servico = CriarServico(banco, usuario, empresa);

        var resultado = await servico.AtualizarAsync(id, Atualizacao(1, "Nome Novo " + Guid.NewGuid().ToString("N")[..8]), TestContext.Current.CancellationToken);

        Assert.True(gancho.Executou);
        Assert.Equal(StatusResultadoObra.NaoEncontrada, resultado.Status);
        Assert.Equal("0", await _banco.ConsultarComoSuperusuarioAsync($"SELECT count(*) FROM cronoai.obra WHERE id = '{id}'"));
        Assert.Equal("0", await _banco.ConsultarComoSuperusuarioAsync($"SELECT count(*) FROM cronoai.auditoria WHERE entidade_id = '{id}'"));
    }

    [Fact]
    public async Task Obra_arquivada_entre_leitura_e_gravacao_vira_409()
    {
        var usuario = await _dados.CriarUsuarioAsync();
        var empresa = await _dados.CriarEmpresaComMembrosAsync(usuario);
        var obra = await _dados.CriarObraAsync(empresa, usuario);

        // Outra pessoa arquiva a obra no meio da operação (o gatilho soma 1 à versão).
        var gancho = new GanchoAntesDeSalvar(() => _banco.ConsultarComoSuperusuarioAsync($"UPDATE cronoai.obra SET arquivada_em = now() WHERE id = '{obra.Id}'"));
        await using var banco = CriarContexto(usuario, empresa, gancho);
        var servico = CriarServico(banco, usuario, empresa);

        var resultado = await servico.AtualizarAsync(obra.Id, Atualizacao(obra.Versao, "Nome Novo " + Guid.NewGuid().ToString("N")[..8]), TestContext.Current.CancellationToken);

        Assert.True(gancho.Executou);
        Assert.Equal(StatusResultadoObra.Conflito, resultado.Status);
        Assert.Equal(ResultadoEscritaObra.ObraArquivada, resultado.TipoDoConflito);
        Assert.NotNull(resultado.EstadoAtual!.ArquivadaEm);
        Assert.Equal(obra.Versao + 1, resultado.EstadoAtual.Versao);

        // A alteração não foi gravada nem auditada.
        Assert.Equal(obra.Nome, resultado.EstadoAtual.Nome);
        Assert.Single(await _dados.LerAuditoriaAsync(empresa, obra.Id));
    }

    [Fact]
    public async Task Versao_alterada_entre_leitura_e_gravacao_vira_409_de_versao()
    {
        var usuario = await _dados.CriarUsuarioAsync();
        var empresa = await _dados.CriarEmpresaComMembrosAsync(usuario);
        var obra = await _dados.CriarObraAsync(empresa, usuario);
        var nomeDaOutra = "Gravado Por Outra Pessoa " + Guid.NewGuid().ToString("N")[..8];

        var gancho = new GanchoAntesDeSalvar(() => _banco.ConsultarComoSuperusuarioAsync($"UPDATE cronoai.obra SET nome = '{nomeDaOutra}' WHERE id = '{obra.Id}'"));
        await using var banco = CriarContexto(usuario, empresa, gancho);
        var servico = CriarServico(banco, usuario, empresa);

        var resultado = await servico.AtualizarAsync(obra.Id, Atualizacao(obra.Versao, "Nome Novo " + Guid.NewGuid().ToString("N")[..8]), TestContext.Current.CancellationToken);

        Assert.Equal(StatusResultadoObra.Conflito, resultado.Status);
        Assert.Equal(ResultadoEscritaObra.ConflitoDeVersao, resultado.TipoDoConflito);
        Assert.Equal(nomeDaOutra, resultado.EstadoAtual!.Nome);
        Assert.Equal(obra.Versao + 1, resultado.EstadoAtual.Versao);
    }

    #endregion

    #region Métodos privados

    private static AtualizarObraRequisicao Atualizacao(long versao, string nome) =>
        new(versao, nome, "PE", "2699999", null, null, null, null, null);

    // Mesmo contexto da API (mesmo interceptor de RLS e de trilha), com o gancho de teste a mais.
    private CronoDbContext CriarContexto(Guid usuario, Guid empresa, GanchoAntesDeSalvar gancho)
    {
        var opcoes = new DbContextOptionsBuilder<CronoDbContext>();
        CronoDbContextConfiguracao.Configurar(opcoes, _banco.StringConexaoApp);
        opcoes.AddInterceptors(gancho);
        return new CronoDbContext(opcoes.Options, new ContextoSessaoBanco(usuario, empresa));
    }

    private static ServicoObras CriarServico(CronoDbContext banco, Guid usuario, Guid empresa)
    {
        var contexto = new ContextoSessao();
        contexto.Preencher(Guid.NewGuid(), usuario, empresa);
        return new ServicoObras(banco, contexto, TimeProvider.System, NullLogger<ServicoObras>.Instance);
    }

    #endregion

    #region Tipos auxiliares

    /// <summary>Executa uma ação UMA vez, quando o <c>SaveChanges</c> começa (depois do carregamento da obra).</summary>
    private sealed class GanchoAntesDeSalvar : SaveChangesInterceptor
    {
        private readonly Func<Task> _acao;

        public GanchoAntesDeSalvar(Func<Task> acao)
        {
            _acao = acao;
        }

        public bool Executou { get; private set; }

        public override async ValueTask<InterceptionResult<int>> SavingChangesAsync(
            DbContextEventData eventData,
            InterceptionResult<int> result,
            CancellationToken cancellationToken = default)
        {
            if (!Executou)
            {
                Executou = true;
                await _acao();
            }

            return result;
        }
    }

    #endregion
}
