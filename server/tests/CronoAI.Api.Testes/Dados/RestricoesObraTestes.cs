using CronoAI.Api.Testes.Infra;
using CronoAI.Dados;
using Microsoft.EntityFrameworkCore;
using Npgsql;

namespace CronoAI.Api.Testes.Dados;

/// <summary>
/// Restrições da obra no BANCO (CHECK, FKs compostas e índice único parcial), com INSERT direto como <c>cronoai_app</c>:
/// o domínio não participa, então o teste prova que o banco recusa sozinho.
/// </summary>
[Collection(ColecaoBanco.Nome)]
[Trait("Categoria", "Integracao")]
public sealed class RestricoesObraTestes
{
    #region Campos

    private static readonly string[] _fksDaUf = ["fk_obra_uf", "fk_obra_municipio_uf"];

    private readonly DadosTeste _dados;

    #endregion

    #region Construtor

    public RestricoesObraTestes(BancoPostgresFixture banco)
    {
        _dados = new DadosTeste(banco);
    }

    #endregion

    #region Métodos públicos

    [Fact]
    public async Task Obra_valores_validos_passam()
    {
        // Controle negativo dos testes abaixo: o mesmo insert, sem defeito, passa (inclusive SINAPI completo e opções no limite).
        var empresa = await _dados.CriarEmpresaAsync();

        await _dados.InserirObraBrutaAsync(empresa, empresa, Nome());
        await _dados.InserirObraBrutaAsync(empresa, empresa, Nome(), sinapiUf: "PE", sinapiRegime: "desonerado", sinapiDataBase: new DateOnly(2026, 9, 1));
        await _dados.InserirObraBrutaAsync(empresa, empresa, Nome(), opcoes: Opcoes(16000));
    }

    [Theory]
    [InlineData("nome-vazio", "ck_obra_nome_tamanho")]
    [InlineData("municipio-6-digitos", "ck_obra_municipio_formato")]
    [InlineData("sinapi-parcial", "ck_obra_sinapi_tudo_ou_nada")]
    [InlineData("data-base-dia-2", "ck_obra_sinapi_data_base_dia_1")]
    [InlineData("regime-invalido", "ck_obra_sinapi_regime")]
    [InlineData("opcoes-array", "ck_obra_opcoes_objeto")]
    [InlineData("opcoes-grande", "ck_obra_opcoes_tamanho")]
    public async Task Obra_checks_do_banco(string caso, string constraint)
    {
        var empresa = await _dados.CriarEmpresaAsync();

        var erro = await Assert.ThrowsAsync<PostgresException>(() => caso switch
        {
            "nome-vazio" => _dados.InserirObraBrutaAsync(empresa, empresa, ""),
            "municipio-6-digitos" => _dados.InserirObraBrutaAsync(empresa, empresa, Nome(), municipio: "269999"),
            "sinapi-parcial" => _dados.InserirObraBrutaAsync(empresa, empresa, Nome(), sinapiUf: "PE"),
            "data-base-dia-2" => _dados.InserirObraBrutaAsync(empresa, empresa, Nome(), sinapiUf: "PE", sinapiRegime: "desonerado", sinapiDataBase: new DateOnly(2026, 9, 2)),
            "regime-invalido" => _dados.InserirObraBrutaAsync(empresa, empresa, Nome(), sinapiUf: "PE", sinapiRegime: "x", sinapiDataBase: new DateOnly(2026, 9, 1)),
            "opcoes-array" => _dados.InserirObraBrutaAsync(empresa, empresa, Nome(), opcoes: "[1,2]"),
            "opcoes-grande" => _dados.InserirObraBrutaAsync(empresa, empresa, Nome(), opcoes: Opcoes(17000)),
            _ => throw new InvalidOperationException(caso),
        });

        Assert.Equal(PostgresErrorCodes.CheckViolation, erro.SqlState);
        Assert.Equal(constraint, erro.ConstraintName);
    }

    [Fact]
    public async Task Obra_municipio_com_prefixo_de_outra_uf_falha()
    {
        var empresa = await _dados.CriarEmpresaAsync();

        // 2699999 tem prefixo 26 (PE): com UF SP a FK composta (uf, prefixo) recusa.
        var erro = await Assert.ThrowsAsync<PostgresException>(() => _dados.InserirObraBrutaAsync(empresa, empresa, Nome(), uf: "SP", municipio: "2699999"));

        Assert.Equal(PostgresErrorCodes.ForeignKeyViolation, erro.SqlState);
        Assert.Equal("fk_obra_municipio_uf", erro.ConstraintName);

        // Controle negativo: com a UF certa, passa.
        await _dados.InserirObraBrutaAsync(empresa, empresa, Nome(), uf: "PE", municipio: "2699999");
    }

    [Fact]
    public async Task Obra_uf_e_sinapi_uf_inexistentes_falham()
    {
        var empresa = await _dados.CriarEmpresaAsync();

        var daSinapi = await Assert.ThrowsAsync<PostgresException>(() => _dados.InserirObraBrutaAsync(empresa, empresa, Nome(), sinapiUf: "XX", sinapiRegime: "desonerado", sinapiDataBase: new DateOnly(2026, 9, 1)));
        Assert.Equal(PostgresErrorCodes.ForeignKeyViolation, daSinapi.SqlState);
        Assert.Equal("fk_obra_sinapi_uf", daSinapi.ConstraintName);

        // UF inexistente quebra duas FKs (a da UF e a composta do município); o PostgreSQL reporta a primeira que dispara.
        var daUf = await Assert.ThrowsAsync<PostgresException>(() => _dados.InserirObraBrutaAsync(empresa, empresa, Nome(), uf: "XX"));
        Assert.Equal(PostgresErrorCodes.ForeignKeyViolation, daUf.SqlState);
        Assert.Contains(daUf.ConstraintName, _fksDaUf);
    }

    [Fact]
    public async Task Obra_responsavel_so_membro_da_mesma_empresa()
    {
        var membroA = await _dados.CriarUsuarioAsync();
        var membroB = await _dados.CriarUsuarioAsync();
        var semVinculo = await _dados.CriarUsuarioAsync();
        var empresaA = await _dados.CriarEmpresaComMembrosAsync(membroA);
        await _dados.CriarEmpresaComMembrosAsync(membroB);

        foreach (var alheio in new[] { semVinculo, membroB, Guid.NewGuid() })
        {
            var erro = await Assert.ThrowsAsync<PostgresException>(() => _dados.InserirObraBrutaAsync(empresaA, empresaA, Nome(), responsavel: alheio));
            Assert.Equal(PostgresErrorCodes.ForeignKeyViolation, erro.SqlState);
            Assert.Equal("fk_obra_responsavel", erro.ConstraintName);
        }

        // Controle negativo: sem responsável e membro da própria empresa passam.
        await _dados.InserirObraBrutaAsync(empresaA, empresaA, Nome());
        await _dados.InserirObraBrutaAsync(empresaA, empresaA, Nome(), responsavel: membroA);
    }

    [Fact]
    public async Task Obra_nome_unico_entre_ativas_por_empresa()
    {
        var empresaA = await _dados.CriarEmpresaAsync();
        var empresaB = await _dados.CriarEmpresaAsync();
        var nome = Nome();
        await _dados.InserirObraBrutaAsync(empresaA, empresaA, nome);

        // Outra caixa conta como o mesmo nome.
        var duplicada = await Assert.ThrowsAsync<PostgresException>(() => _dados.InserirObraBrutaAsync(empresaA, empresaA, nome.ToUpperInvariant()));
        Assert.Equal(PostgresErrorCodes.UniqueViolation, duplicada.SqlState);
        Assert.Equal("ux_obra_empresa_nome_ativa", duplicada.ConstraintName);

        // Outra empresa pode repetir o nome.
        await _dados.InserirObraBrutaAsync(empresaB, empresaB, nome);

        // Acento diferente é nome diferente.
        await _dados.InserirObraBrutaAsync(empresaA, empresaA, "Obra Água " + nome);
        await _dados.InserirObraBrutaAsync(empresaA, empresaA, "Obra Agua " + nome);

        // Arquivar a primeira libera o nome.
        await using var contexto = _dados.Fabrica.Criar(ContextoSessaoBanco.DaEmpresa(empresaA));
        await contexto.Database.ExecuteSqlAsync($"UPDATE cronoai.obra SET arquivada_em = {DateTime.UtcNow.AddMinutes(1)} WHERE nome = {nome}", TestContext.Current.CancellationToken);
        await _dados.InserirObraBrutaAsync(empresaA, empresaA, nome);
    }

    #endregion

    #region Métodos privados

    private static string Nome() => "Obra Ficticia " + Guid.NewGuid().ToString("N");

    private static string Opcoes(int tamanho) => "{\"a\":\"" + new string('x', tamanho) + "\"}";

    #endregion
}
