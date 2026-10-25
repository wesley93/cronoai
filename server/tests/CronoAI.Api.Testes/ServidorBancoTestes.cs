using CronoAI.Api.Testes.Infra;

namespace CronoAI.Api.Testes;

[Collection(ColecaoBanco.Nome)]
[Trait("Categoria", "Integracao")]
public sealed class ServidorBancoTestes
{
    #region Campos

    private readonly BancoPostgresFixture _banco;

    #endregion

    #region Construtor

    public ServidorBancoTestes(BancoPostgresFixture banco)
    {
        _banco = banco;
    }

    #endregion

    #region Métodos públicos

    [Fact]
    public async Task Servidor_em_utf8_icu_ptbr_e_utc()
    {
        // Consulta pelo socket local como superusuário (psql não define fuso de sessão): vale o do servidor.
        Assert.Equal("UTF8", await _banco.ConsultarComoSuperusuarioAsync("SHOW server_encoding"));
        Assert.Equal("UTC", await _banco.ConsultarComoSuperusuarioAsync("SHOW timezone"));
        Assert.Equal(
            "i|pt-BR",
            await _banco.ConsultarComoSuperusuarioAsync(
                "SELECT datlocprovider::text || '|' || datlocale FROM pg_database WHERE datname = current_database()"));
    }

    [Fact]
    public async Task Autenticacao_tcp_exige_scram_e_so_o_socket_local_e_trust()
    {
        // AC-16: senha armazenada em scram-sha-256 e nenhuma regra trust fora do socket local.
        Assert.Equal("scram-sha-256", await _banco.ConsultarComoSuperusuarioAsync("SHOW password_encryption"));
        Assert.Equal(
            "0",
            await _banco.ConsultarComoSuperusuarioAsync(
                "SELECT count(*) FROM pg_hba_file_rules WHERE auth_method = 'trust' AND type <> 'local'"));
    }

    #endregion
}
