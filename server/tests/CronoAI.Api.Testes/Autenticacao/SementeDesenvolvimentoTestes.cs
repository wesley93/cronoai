using CronoAI.Api.Desenvolvimento;
using CronoAI.Api.Testes.Infra;
using CronoAI.Dados;
using CronoAI.Dominio;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;

namespace CronoAI.Api.Testes.Autenticacao;

[Collection(ColecaoBanco.Nome)]
[Trait("Categoria", "Integracao")]
public sealed class SementeDesenvolvimentoTestes
{
    #region Campos

    private readonly BancoPostgresFixture _banco;

    #endregion

    #region Construtor

    public SementeDesenvolvimentoTestes(BancoPostgresFixture banco)
    {
        _banco = banco;
    }

    #endregion

    #region Métodos públicos

    [Theory]
    [InlineData("Production")]
    [InlineData("Staging")]
    public async Task Semente_recusa_fora_de_Development(string ambiente)
    {
        var semente = CriarSemente(ambiente);

        var erro = await Assert.ThrowsAsync<InvalidOperationException>(() => semente.ExecutarAsync(TestContext.Current.CancellationToken));

        Assert.Contains("Development", erro.Message, StringComparison.Ordinal);
    }

    [Fact]
    public async Task Semente_recusa_sem_a_string_do_migrador()
    {
        // O app não insere membro: sem o migrador a semente falha ruidosamente, ANTES de criar qualquer coisa.
        var semente = CriarSemente("Development", comMigrador: false);

        var erro = await Assert.ThrowsAsync<InvalidOperationException>(() => semente.ExecutarAsync(TestContext.Current.CancellationToken));

        Assert.Contains("CronoaiMigracao", erro.Message, StringComparison.Ordinal);
        Assert.DoesNotContain(_banco.StringConexaoMigrador, erro.Message, StringComparison.Ordinal);
    }

    [Fact]
    public async Task Semente_cria_perfis_distintos_e_vincula_dev_b_a_uma_obra()
    {
        await CriarSemente("Development").ExecutarAsync(TestContext.Current.CancellationToken);

        var devA = (await ConsultaBanco.ObterUsuarioIdAsync(_banco, "urn:cronoai:desenvolvimento", IdsDesenvolvimento.SujeitoDevA))!.Value;
        var devB = (await ConsultaBanco.ObterUsuarioIdAsync(_banco, "urn:cronoai:desenvolvimento", IdsDesenvolvimento.SujeitoDevB))!.Value;
        var empresa = IdsDesenvolvimento.EmpresaCompartilhada;

        Assert.Equal(Perfis.Administrador + "|" + EscoposObras.Todas, await _banco.ConsultarComoSuperusuarioAsync($"SELECT perfil || '|' || escopo_obras FROM cronoai.membro_empresa WHERE empresa_id = '{empresa}' AND usuario_id = '{devA}'"));
        Assert.Equal(Perfis.EngenheiroObra + "|" + EscoposObras.Vinculadas, await _banco.ConsultarComoSuperusuarioAsync($"SELECT perfil || '|' || escopo_obras FROM cronoai.membro_empresa WHERE empresa_id = '{empresa}' AND usuario_id = '{devB}'"));

        // dev-b enxerga exatamente UMA obra (a vinculada); dev-a, todas as da empresa (como app, pelo RLS por obra).
        await using (var comoDevB = _banco.FabricaApp.Criar(new ContextoSessaoBanco(devB, empresa)))
        {
            var obras = await comoDevB.Database.SqlQuery<Guid>($"SELECT id AS \"Value\" FROM cronoai.obra").ToListAsync(TestContext.Current.CancellationToken);
            Assert.Equal([IdsDesenvolvimento.ObraCompartilhada], obras);
        }

        await using (var comoDevA = _banco.FabricaApp.Criar(new ContextoSessaoBanco(devA, empresa)))
        {
            var obras = await comoDevA.Database.SqlQuery<Guid>($"SELECT id AS \"Value\" FROM cronoai.obra").ToListAsync(TestContext.Current.CancellationToken);
            Assert.Contains(IdsDesenvolvimento.ObraCompartilhada, obras);
        }

        // FORCE restaurado depois do provisionamento (o dono segue sujeito ao RLS).
        Assert.Equal("true|true", await _banco.ConsultarComoSuperusuarioAsync("SELECT string_agg(relforcerowsecurity::text, '|' ORDER BY relname) FROM pg_class WHERE oid IN ('cronoai.empresa'::regclass, 'cronoai.membro_empresa'::regclass)"));
    }

    [Fact]
    public async Task Semente_e_idempotente_com_ids_fixos()
    {
        var semente = CriarSemente("Development");

        await semente.ExecutarAsync(TestContext.Current.CancellationToken);
        await semente.ExecutarAsync(TestContext.Current.CancellationToken);

        // Cada empresa, lida com o contexto dela (o RLS exige): 1 linha de empresa; vínculos 1 + 1 + 2 = 4.
        var vinculos = 0;
        foreach (var (empresaId, nome, esperados) in new[]
        {
            (IdsDesenvolvimento.EmpresaA, IdsDesenvolvimento.NomeEmpresaA, 1),
            (IdsDesenvolvimento.EmpresaB, IdsDesenvolvimento.NomeEmpresaB, 1),
            (IdsDesenvolvimento.EmpresaCompartilhada, IdsDesenvolvimento.NomeEmpresaCompartilhada, 2),
        })
        {
            await using var contexto = _banco.FabricaApp.Criar(ContextoSessaoBanco.DaEmpresa(empresaId));
            var empresas = await contexto.Database.SqlQuery<string>($"SELECT nome AS \"Value\" FROM cronoai.empresa WHERE id = {empresaId}").ToListAsync(TestContext.Current.CancellationToken);
            var membros = await contexto.Database.SqlQuery<int>($"SELECT count(*)::int AS \"Value\" FROM cronoai.membro_empresa WHERE empresa_id = {empresaId}").ToListAsync(TestContext.Current.CancellationToken);

            Assert.Equal([nome], empresas);
            Assert.Equal(esperados, membros.Single());
            vinculos += membros.Single();
        }

        Assert.Equal(4, vinculos);
    }

    [Fact]
    public async Task Semente_cria_usuarios_com_emissor_reservado()
    {
        await CriarSemente("Development").ExecutarAsync(TestContext.Current.CancellationToken);

        Assert.Equal(1, await ConsultaBanco.ContarUsuariosAsync(_banco, "urn:cronoai:desenvolvimento", IdsDesenvolvimento.SujeitoDevA));
        Assert.Equal(1, await ConsultaBanco.ContarUsuariosAsync(_banco, "urn:cronoai:desenvolvimento", IdsDesenvolvimento.SujeitoDevB));
    }

    [Fact]
    public async Task Semente_da_composicao_real_do_host_roda_como_cronoai_app()
    {
        // Composição REAL (Program.cs): a semente e a fábrica vêm do contêiner de DI do host, ligado à string do app.
        await using var fabrica = new ApiFactory(_banco.StringConexaoApp, "Development") { Configuracoes = { ["ConnectionStrings:CronoaiMigracao"] = _banco.StringConexaoMigrador } };
        var semente = fabrica.Services.GetRequiredService<SementeDesenvolvimento>();
        var fabricaDoHost = fabrica.Services.GetRequiredService<IFabricaCronoDbContext>();

        await semente.ExecutarAsync(TestContext.Current.CancellationToken);

        await using var contexto = fabricaDoHost.Criar(ContextoSessaoBanco.Vazio);
        var papel = await contexto.Database.SqlQuery<string>($"SELECT current_user::text AS \"Value\"").ToListAsync(TestContext.Current.CancellationToken);
        Assert.Equal("cronoai_app", papel.Single());
        Assert.Equal(1, await ConsultaBanco.ContarUsuariosAsync(_banco, "urn:cronoai:desenvolvimento", IdsDesenvolvimento.SujeitoDevA));
    }

    #endregion

    #region Métodos privados

    private SementeDesenvolvimento CriarSemente(string ambiente, bool comMigrador = true)
    {
        var fabrica = _banco.FabricaApp;
        var configuracao = new ConfigurationBuilder()
            .AddInMemoryCollection(comMigrador ? new Dictionary<string, string?> { ["ConnectionStrings:CronoaiMigracao"] = _banco.StringConexaoMigrador } : [])
            .Build();
        return new SementeDesenvolvimento(fabrica, new CronoAI.Dados.Identidade.ConsultasIdentidade(fabrica), new AmbienteFalso(ambiente), TimeProvider.System, configuracao);
    }

    #endregion
}
