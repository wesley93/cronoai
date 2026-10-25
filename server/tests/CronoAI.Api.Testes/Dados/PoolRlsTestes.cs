using CronoAI.Api.Testes.Infra;
using CronoAI.Dados;
using Microsoft.EntityFrameworkCore;
using Npgsql;

namespace CronoAI.Api.Testes.Dados;

/// <summary>
/// Sem vazamento de empresa pelo pool de conexões. Cada teste usa uma string com <c>Application Name</c> própria
/// (pool próprio) e <c>Maximum Pool Size</c> pequeno, para forçar a reutilização da mesma conexão física.
/// </summary>
[Collection(ColecaoBanco.Nome)]
[Trait("Categoria", "Integracao")]
public sealed class PoolRlsTestes
{
    #region Campos

    private readonly BancoPostgresFixture _banco;
    private readonly DadosTeste _dados;

    #endregion

    #region Construtor

    public PoolRlsTestes(BancoPostgresFixture banco)
    {
        _banco = banco;
        _dados = new DadosTeste(banco);
    }

    #endregion

    #region Métodos públicos

    [Fact]
    public async Task Sem_sobrescrita_e_sem_reset_o_valor_vaza()
    {
        // CONTROLE NEGATIVO: prova que o teste detecta vazamento. Conexão crua, pool 1, reset DESLIGADO.
        var cs = StringApp(tamanhoPool: 1, semReset: true);
        var empresa = Guid.NewGuid().ToString("D");

        var pidAntes = await DefinirEmpresaECarregarAsync(cs, empresa);
        var (pidDepois, valor) = await LerAsync(cs);

        Assert.Equal(pidAntes, pidDepois);
        Assert.Equal(empresa, valor);
    }

    [Fact]
    public async Task Sem_sobrescrita_com_o_reset_padrao_o_valor_volta_vazio()
    {
        var cs = StringApp(tamanhoPool: 1, semReset: false);

        var pidAntes = await DefinirEmpresaECarregarAsync(cs, Guid.NewGuid().ToString("D"));
        var (pidDepois, valor) = await LerAsync(cs);

        Assert.Equal(pidAntes, pidDepois);
        Assert.Equal("", valor);
    }

    [Fact]
    public async Task Sobrescrita_independe_do_reset()
    {
        // Reset DESLIGADO: só a sobrescrita do interceptor protege. Contexto A e depois vazio pelo EF, mesma conexão física.
        var fabrica = new FabricaCronoDbContext(StringApp(tamanhoPool: 1, semReset: true));
        var usuario = await _dados.CriarUsuarioAsync();
        var empresa = await _dados.CriarEmpresaComMembrosAsync(usuario);

        int pidA;
        await using (var comA = fabrica.Criar(new ContextoSessaoBanco(usuario, empresa)))
        {
            pidA = await LerPidAsync(comA);
            Assert.Equal(empresa.ToString("D"), await LerVariavelAsync(comA, PapeisBanco.VariavelEmpresa));
        }

        await using var vazio = fabrica.Criar(ContextoSessaoBanco.Vazio);
        var pidB = await LerPidAsync(vazio);

        Assert.Equal(pidA, pidB);
        Assert.Equal("", await LerVariavelAsync(vazio, PapeisBanco.VariavelEmpresa));
        Assert.Equal("", await LerVariavelAsync(vazio, PapeisBanco.VariavelUsuario));
        Assert.Equal(0, (await vazio.Database.SqlQuery<int>($"SELECT count(*)::int AS \"Value\" FROM cronoai.membro_empresa").ToListAsync(TestContext.Current.CancellationToken)).Single());
    }

    [Fact]
    public async Task Conexao_devolvida_ao_pool_nao_carrega_contexto()
    {
        var cs = StringApp(tamanhoPool: 1, semReset: false);
        var fabrica = new FabricaCronoDbContext(cs);
        var usuario = await _dados.CriarUsuarioAsync();
        var empresa = await _dados.CriarEmpresaComMembrosAsync(usuario);

        int pidA;
        await using (var comA = fabrica.Criar(new ContextoSessaoBanco(usuario, empresa)))
        {
            pidA = await LerPidAsync(comA);
        }

        // Mesma conexão física, aberta de forma crua: o reset do pool limpou a variável.
        var (pidB, valor) = await LerAsync(cs);

        Assert.Equal(pidA, pidB);
        Assert.Equal("", valor);
    }

    [Fact]
    public async Task Concorrencia_com_pool_pequeno_nao_mistura_empresas()
    {
        var fabrica = new FabricaCronoDbContext(StringApp(tamanhoPool: 3, semReset: false));
        var usuario = await _dados.CriarUsuarioAsync();
        var empresaA = await _dados.CriarEmpresaComMembrosAsync(usuario);
        var empresaB = await _dados.CriarEmpresaComMembrosAsync(usuario);

        var operacoes = Enumerable.Range(0, 60).Select(async i =>
        {
            var minha = i % 2 == 0 ? empresaA : empresaB;
            var outra = i % 2 == 0 ? empresaB : empresaA;
            await Task.Yield();
            await using var contexto = fabrica.Criar(ContextoSessaoBanco.DaEmpresa(minha));
            var vistas = await DadosTeste.LerIdsAsync(
                contexto,
                $"SELECT empresa_id AS \"Value\" FROM cronoai.membro_empresa WHERE empresa_id IN ({empresaA}, {empresaB})");
            return (minha, outra, vistas);
        }).ToList();

        var resultados = await Task.WhenAll(operacoes);

        Assert.All(resultados, r =>
        {
            Assert.NotEmpty(r.vistas);
            Assert.All(r.vistas, id => Assert.Equal(r.minha, id));
            Assert.DoesNotContain(r.outra, r.vistas);
        });
    }

    #endregion

    #region Métodos privados

    private string StringApp(int tamanhoPool, bool semReset)
    {
        return new NpgsqlConnectionStringBuilder(_banco.StringConexaoApp)
        {
            MaxPoolSize = tamanhoPool,
            NoResetOnClose = semReset,
            ApplicationName = "pool-teste-" + Guid.NewGuid().ToString("N")[..10],
        }.ConnectionString;
    }

    private static async Task<int> DefinirEmpresaECarregarAsync(string cs, string empresa)
    {
        await using var conexao = new NpgsqlConnection(cs);
        await conexao.OpenAsync(TestContext.Current.CancellationToken);
        await using var comando = new NpgsqlCommand("SELECT set_config('app.empresa_id', @e, false), pg_backend_pid()", conexao);
        comando.Parameters.AddWithValue("e", empresa);
        await using var leitor = await comando.ExecuteReaderAsync(TestContext.Current.CancellationToken);
        await leitor.ReadAsync(TestContext.Current.CancellationToken);
        return leitor.GetInt32(1);
    }

    private static async Task<(int Pid, string Valor)> LerAsync(string cs)
    {
        await using var conexao = new NpgsqlConnection(cs);
        await conexao.OpenAsync(TestContext.Current.CancellationToken);
        await using var comando = new NpgsqlCommand("SELECT pg_backend_pid(), coalesce(current_setting('app.empresa_id', true), '<nulo>')", conexao);
        await using var leitor = await comando.ExecuteReaderAsync(TestContext.Current.CancellationToken);
        await leitor.ReadAsync(TestContext.Current.CancellationToken);
        return (leitor.GetInt32(0), leitor.GetString(1));
    }

    private static async Task<int> LerPidAsync(CronoDbContext contexto) =>
        (await contexto.Database.SqlQuery<int>($"SELECT pg_backend_pid() AS \"Value\"").ToListAsync()).Single();

    private static async Task<string> LerVariavelAsync(CronoDbContext contexto, string nome) =>
        (await contexto.Database.SqlQuery<string>($"SELECT coalesce(current_setting({nome}, true), '<nulo>') AS \"Value\"").ToListAsync()).Single();

    #endregion
}
