using CronoAI.Api.Testes.Infra;
using CronoAI.Dados;
using Microsoft.EntityFrameworkCore;
using Npgsql;

namespace CronoAI.Api.Testes.Dados;

[Collection(ColecaoBanco.Nome)]
[Trait("Categoria", "Integracao")]
public sealed class SessaoTestes
{
    #region Campos

    private readonly DadosTeste _dados;

    #endregion

    #region Construtor

    public SessaoTestes(BancoPostgresFixture banco)
    {
        _dados = new DadosTeste(banco);
    }

    #endregion

    #region Métodos públicos

    [Fact]
    public async Task Sessao_so_aponta_para_empresa_da_qual_o_usuario_e_membro()
    {
        var usuario = await _dados.CriarUsuarioAsync();
        var outroUsuario = await _dados.CriarUsuarioAsync();
        var empresaDoOutro = await _dados.CriarEmpresaComMembrosAsync(outroUsuario);

        // Empresa existe, mas o usuário não é membro: a FK composta (empresa_ativa_id, usuario_id) recusa.
        var erro = await Assert.ThrowsAsync<DbUpdateException>(() => _dados.CriarSessaoAsync(usuario, empresaDoOutro));

        var pg = Assert.IsType<PostgresException>(erro.InnerException);
        Assert.Equal(PostgresErrorCodes.ForeignKeyViolation, pg.SqlState);
    }

    [Fact]
    public async Task Sessao_aceita_empresa_ativa_nula_e_empresa_propria()
    {
        var usuario = await _dados.CriarUsuarioAsync();
        var empresa = await _dados.CriarEmpresaComMembrosAsync(usuario);

        var semEmpresa = await _dados.CriarSessaoAsync(usuario);
        var comEmpresa = await _dados.CriarSessaoAsync(usuario, empresa);

        Assert.Null(semEmpresa.EmpresaAtivaId);
        Assert.Equal(empresa, comEmpresa.EmpresaAtivaId);
    }

    [Fact]
    public async Task Definir_empresa_ativa_de_quem_nao_e_membro_devolve_false_sem_lancar()
    {
        var usuario = await _dados.CriarUsuarioAsync();
        var outroUsuario = await _dados.CriarUsuarioAsync();
        var propria = await _dados.CriarEmpresaComMembrosAsync(usuario);
        var alheia = await _dados.CriarEmpresaComMembrosAsync(outroUsuario);
        var sessao = await _dados.CriarSessaoAsync(usuario);

        // FK composta violada (23503): o método devolve false (o endpoint responde 404), sem exceção.
        var recusada = await _dados.Consultas.DefinirEmpresaAtivaAsync(sessao.Id, usuario, alheia, TestContext.Current.CancellationToken);
        var aceita = await _dados.Consultas.DefinirEmpresaAtivaAsync(sessao.Id, usuario, propria, TestContext.Current.CancellationToken);

        Assert.False(recusada);
        Assert.True(aceita);
    }

    [Fact]
    public void Id_da_sessao_e_uuid_v4_aleatorio()
    {
        var id = CronoAI.Dominio.Sessao.GerarId();

        // RFC 9562: versão 4 e variante 10xx.
        Assert.Equal(4, (id.ToByteArray(bigEndian: true)[6] >> 4));
        Assert.Equal(0b10, (id.ToByteArray(bigEndian: true)[8] >> 6));
        Assert.NotEqual(id, CronoAI.Dominio.Sessao.GerarId());
    }

    #endregion
}
