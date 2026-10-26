using CronoAI.Api.Testes.Infra;
using CronoAI.Dados.Rls;
using CronoAI.Dominio;
using Microsoft.EntityFrameworkCore;
using Npgsql;

namespace CronoAI.Api.Testes.Dados;

/// <summary>
/// <c>ProvisionamentoEmpresa</c> (T35): cria empresa e membros como o MIGRADOR e restaura o <c>FORCE</c>; sem administrador a
/// transação inteira desfaz (inclusive o <c>NO FORCE</c>); o app continua sem INSERT em <c>membro_empresa</c>.
/// </summary>
[Collection(ColecaoBanco.Nome)]
[Trait("Categoria", "Integracao")]
public sealed class ProvisionamentoTestes
{
    #region Campos

    private readonly BancoPostgresFixture _banco;
    private readonly DadosTeste _dados;

    #endregion

    #region Construtor

    public ProvisionamentoTestes(BancoPostgresFixture banco)
    {
        _banco = banco;
        _dados = new DadosTeste(banco);
    }

    #endregion

    #region Métodos públicos

    [Fact]
    public async Task Provisionamento_restaura_force_e_exige_administrador()
    {
        var provisionamento = new ProvisionamentoEmpresa(_banco.FabricaMigrador);
        var admin = await _dados.CriarUsuarioAsync();
        var engenheiro = await _dados.CriarUsuarioAsync();
        var agora = DateTime.UtcNow;

        // Válido: empresa + administrador + engenheiro.
        var empresa = Empresa.Criar("Empresa Provisionada Ficticia", agora);
        await provisionamento.ProvisionarAsync(
            empresa,
            [
                MembroEmpresa.Criar(empresa.Id, admin, Perfis.Administrador, EscoposObras.Todas, agora),
                MembroEmpresa.Criar(empresa.Id, engenheiro, Perfis.EngenheiroObra, EscoposObras.Vinculadas, agora),
            ],
            TestContext.Current.CancellationToken);

        Assert.Equal("1|2", await _banco.ConsultarComoSuperusuarioAsync($"SELECT (SELECT count(*) FROM cronoai.empresa WHERE id = '{empresa.Id}') || '|' || (SELECT count(*) FROM cronoai.membro_empresa WHERE empresa_id = '{empresa.Id}')"));
        await AfirmarForceAsync();

        // Idempotente: repetir não duplica nem falha.
        await provisionamento.ProvisionarAsync(
            empresa,
            [MembroEmpresa.Criar(empresa.Id, admin, Perfis.Administrador, EscoposObras.Todas, agora)],
            TestContext.Current.CancellationToken);
        Assert.Equal("2", await _banco.ConsultarComoSuperusuarioAsync($"SELECT count(*) FROM cronoai.membro_empresa WHERE empresa_id = '{empresa.Id}'"));

        // O papel da aplicação segue SEM INSERT em membro_empresa.
        await using (var comoApp = _dados.Fabrica.Criar(new CronoAI.Dados.ContextoSessaoBanco(admin, empresa.Id)))
        {
            var erro = await Assert.ThrowsAsync<PostgresException>(() => comoApp.Database.ExecuteSqlAsync(
                $"INSERT INTO cronoai.membro_empresa (empresa_id, usuario_id, perfil, escopo_obras, criado_em, atualizado_em) VALUES ({empresa.Id}, {Guid.NewGuid()}, {"administrador"}, {"todas"}, {agora}, {agora})",
                TestContext.Current.CancellationToken));
            Assert.Equal(PostgresErrorCodes.InsufficientPrivilege, erro.SqlState);
        }

        // Sem administrador: a transação falha NO SET CONSTRAINTS e NADA fica (nem a empresa, nem o NO FORCE).
        var semAdmin = Empresa.Criar("Empresa Sem Administrador Ficticia", agora);
        var falha = await Assert.ThrowsAnyAsync<Exception>(() => provisionamento.ProvisionarAsync(
            semAdmin,
            [MembroEmpresa.Criar(semAdmin.Id, engenheiro, Perfis.EngenheiroObra, EscoposObras.Vinculadas, agora)],
            TestContext.Current.CancellationToken));
        Assert.Equal("ck_empresa_tem_administrador", PostgresDaCadeia(falha).ConstraintName);
        Assert.Equal("0|0", await _banco.ConsultarComoSuperusuarioAsync($"SELECT (SELECT count(*) FROM cronoai.empresa WHERE id = '{semAdmin.Id}') || '|' || (SELECT count(*) FROM cronoai.membro_empresa WHERE empresa_id = '{semAdmin.Id}')"));
        await AfirmarForceAsync();
    }

    [Fact]
    public async Task Provisionamento_desiste_por_lock_timeout_e_nao_deixa_nada_pela_metade()
    {
        // Outra sessão segura um lock que conflita com o NO FORCE (ACCESS EXCLUSIVE): o provisionamento desiste em ~5 s (55P03)
        // em vez de ficar na fila bloqueando a aplicação, e o rollback não deixa NO FORCE nem empresa para trás.
        var provisionamento = new ProvisionamentoEmpresa(_banco.FabricaMigrador);
        var admin = await _dados.CriarUsuarioAsync();
        var agora = DateTime.UtcNow;
        var empresa = Empresa.Criar("Empresa Lock Ficticia", agora);
        var membros = new[] { MembroEmpresa.Criar(empresa.Id, admin, Perfis.Administrador, EscoposObras.Todas, agora) };

        await using (var segurando = new NpgsqlConnection(_banco.StringConexaoMigrador))
        {
            await segurando.OpenAsync(TestContext.Current.CancellationToken);
            await using var transacaoDoLock = await segurando.BeginTransactionAsync(TestContext.Current.CancellationToken);
            await using (var comando = new NpgsqlCommand("LOCK TABLE cronoai.empresa IN ACCESS SHARE MODE", segurando, transacaoDoLock))
            {
                await comando.ExecuteNonQueryAsync(TestContext.Current.CancellationToken);
            }

            var cronometro = System.Diagnostics.Stopwatch.StartNew();
            var falha = await Assert.ThrowsAnyAsync<Exception>(() => provisionamento.ProvisionarAsync(empresa, membros, TestContext.Current.CancellationToken));
            cronometro.Stop();

            Assert.Equal(PostgresErrorCodes.LockNotAvailable, PostgresDaCadeia(falha).SqlState);
            Assert.InRange(cronometro.Elapsed, TimeSpan.FromSeconds(3), TimeSpan.FromSeconds(30));
            await transacaoDoLock.RollbackAsync(TestContext.Current.CancellationToken);
        }

        Assert.Equal("0|0", await _banco.ConsultarComoSuperusuarioAsync($"SELECT (SELECT count(*) FROM cronoai.empresa WHERE id = '{empresa.Id}') || '|' || (SELECT count(*) FROM cronoai.membro_empresa WHERE empresa_id = '{empresa.Id}')"));
        await AfirmarForceAsync();

        // Controle: sem o lock da outra sessão o mesmo provisionamento passa.
        await provisionamento.ProvisionarAsync(empresa, membros, TestContext.Current.CancellationToken);
        Assert.Equal("1|1", await _banco.ConsultarComoSuperusuarioAsync($"SELECT (SELECT count(*) FROM cronoai.empresa WHERE id = '{empresa.Id}') || '|' || (SELECT count(*) FROM cronoai.membro_empresa WHERE empresa_id = '{empresa.Id}')"));
    }

    #endregion

    #region Métodos privados

    private async Task AfirmarForceAsync()
    {
        Assert.Equal(
            "empresa=true|membro_empresa=true",
            await _banco.ConsultarComoSuperusuarioAsync("SELECT string_agg(relname || '=' || relforcerowsecurity::text, '|' ORDER BY relname) FROM pg_class WHERE oid IN ('cronoai.empresa'::regclass, 'cronoai.membro_empresa'::regclass)"));
    }

    private static PostgresException PostgresDaCadeia(Exception erro)
    {
        for (var atual = erro; atual is not null; atual = atual.InnerException)
        {
            if (atual is PostgresException postgres)
            {
                return postgres;
            }
        }

        throw new InvalidOperationException("Sem PostgresException na cadeia: " + erro);
    }

    #endregion
}
