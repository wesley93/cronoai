using CronoAI.Api.Obras;
using Npgsql;

namespace CronoAI.Api.Testes.Obras;

/// <summary>Mapeamento de violação do banco em campo do contrato (sem banco): só o que não é alcançável por requisição.</summary>
public sealed class MapeadorErrosObraTestes
{
    #region Métodos públicos

    // Rede de segurança: o domínio recusa antes (número exponencial, tamanho do texto do jsonb), então estas constraints da trilha
    // não são alcançáveis por requisição; se um dia forem, o resultado é 400 na chave certa e não 500.
    [Theory]
    [InlineData("ck_auditoria_antes_tamanho")]
    [InlineData("ck_auditoria_depois_tamanho")]
    public void Constraints_de_tamanho_da_trilha_viram_400_em_opcoesCronograma(string constraint)
    {
        var erro = new InvalidOperationException("falha ao salvar", ViolacaoDeCheck(constraint));

        var resultado = MapeadorErrosObra.Classificar(erro);

        Assert.NotNull(resultado);
        Assert.Equal(StatusResultadoObra.Invalida, resultado.Status);
        Assert.Equal("opcoesCronograma", Assert.Single(resultado.Erros!).Key);
    }

    [Fact]
    public void Constraint_desconhecida_nao_e_traduzida()
    {
        Assert.Null(MapeadorErrosObra.Classificar(ViolacaoDeCheck("ck_qualquer_outra")));
    }

    #endregion

    #region Métodos privados

    private static PostgresException ViolacaoDeCheck(string constraint) =>
        new("mensagem do banco", "ERROR", "ERROR", PostgresErrorCodes.CheckViolation, constraintName: constraint);

    #endregion
}
