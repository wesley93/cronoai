using CronoAI.Api.Testes.Infra;
using CronoAI.Dados;
using Microsoft.EntityFrameworkCore;
using Npgsql;

namespace CronoAI.Api.Testes.Dados;

/// <summary>
/// FKs compostas por empresa dos vínculos, frentes e carteiras (T20) e versão por gatilho em frente e carteira (T32). As FKs
/// ignoram o RLS: o mesmo 23503 vale para "inexistente" e "de outra empresa" (nada de oráculo de existência).
/// </summary>
[Collection(ColecaoBanco.Nome)]
[Trait("Categoria", "Integracao")]
public sealed class VinculosTestes
{
    #region Campos

    private readonly BancoPostgresFixture _banco;
    private readonly DadosTeste _dados;

    #endregion

    #region Construtor

    public VinculosTestes(BancoPostgresFixture banco)
    {
        _banco = banco;
        _dados = new DadosTeste(banco);
    }

    #endregion

    #region Métodos públicos

    [Fact]
    public async Task Fks_compostas_por_empresa()
    {
        var c = await CenarioPermissoes.CriarAsync(_dados);
        var inexistente = Guid.NewGuid();

        // acesso_obra: membro de OUTRA empresa e membro INEXISTENTE dão o MESMO erro (a FK composta ignora o RLS).
        var membroAlheio = await ViolacaoAsync(c, contexto => InserirAcessoObraAsync(contexto, c.EmpresaX, c.Obra2, c.Z));
        var membroInexistente = await ViolacaoAsync(c, contexto => InserirAcessoObraAsync(contexto, c.EmpresaX, c.Obra2, inexistente));
        Assert.Equal(("23503", "fk_acesso_obra_membro"), membroAlheio);
        Assert.Equal(membroAlheio, membroInexistente);

        // acesso_obra: obra de outra empresa e obra inexistente: idem.
        var obraAlheia = await ViolacaoAsync(c, contexto => InserirAcessoObraAsync(contexto, c.EmpresaX, c.ObraY, c.D));
        var obraInexistente = await ViolacaoAsync(c, contexto => InserirAcessoObraAsync(contexto, c.EmpresaX, inexistente, c.D));
        Assert.Equal(("23503", "fk_acesso_obra_obra"), obraAlheia);
        Assert.Equal(obraAlheia, obraInexistente);

        // acesso_frente sem acesso_obra do usuário (quem tem frente tem a obra).
        Assert.Equal(("23503", "fk_acesso_frente_acesso_obra"), await ViolacaoAsync(c, contexto => InserirAcessoFrenteAsync(contexto, c.EmpresaX, c.Obra1, c.Frente1, c.D)));

        // acesso_frente com obra_id diferente da obra da frente (o par frente + obra não existe).
        var obraDiferente = await ViolacaoAsync(c, contexto => InserirAcessoFrenteAsync(contexto, c.EmpresaX, c.Obra2, c.Frente1, c.B));
        Assert.Equal("23503", obraDiferente.SqlState);

        // carteira_obra cruzando empresas (obra da empresa Y numa carteira da X).
        Assert.Equal(("23503", "fk_carteira_obra_obra"), await ViolacaoAsync(c, contexto => contexto.Database.ExecuteSqlAsync(
            $"INSERT INTO cronoai.carteira_obra (id, empresa_id, carteira_id, obra_id, criado_em) VALUES ({Guid.CreateVersion7()}, {c.EmpresaX}, {c.CarteiraK}, {c.ObraY}, {DateTime.UtcNow})",
            TestContext.Current.CancellationToken)));

        // frente.responsavel_id de outra empresa e inexistente: mesmo erro.
        var responsavelAlheio = await ViolacaoAsync(c, contexto => InserirFrenteAsync(contexto, c.EmpresaX, c.Obra1, c.Z));
        var responsavelInexistente = await ViolacaoAsync(c, contexto => InserirFrenteAsync(contexto, c.EmpresaX, c.Obra1, inexistente));
        Assert.Equal(("23503", "fk_frente_responsavel"), responsavelAlheio);
        Assert.Equal(responsavelAlheio, responsavelInexistente);

        // Revogar acesso_obra com acesso_frente pendente: a FK Restrict recusa (a aplicação apaga as frentes antes).
        Assert.Equal(("23503", "fk_acesso_frente_acesso_obra"), await ViolacaoAsync(c, contexto => contexto.Database.ExecuteSqlAsync(
            $"DELETE FROM cronoai.acesso_obra WHERE obra_id = {c.Obra1} AND usuario_id = {c.F}",
            TestContext.Current.CancellationToken)));

        // Controle negativo: o caso VÁLIDO de cada um passa.
        await using (var contexto = Como(c.A, c.EmpresaX))
        {
            await InserirAcessoObraAsync(contexto, c.EmpresaX, c.Obra2, c.D);
        }

        await using (var contexto = Como(c.A, c.EmpresaX))
        {
            await InserirAcessoFrenteAsync(contexto, c.EmpresaX, c.Obra1, c.Frente1, c.B);
        }

        await using (var contexto = Como(c.A, c.EmpresaX))
        {
            await contexto.Database.ExecuteSqlAsync(
                $"INSERT INTO cronoai.carteira_obra (id, empresa_id, carteira_id, obra_id, criado_em) VALUES ({Guid.CreateVersion7()}, {c.EmpresaX}, {c.CarteiraK}, {c.Obra1}, {DateTime.UtcNow})",
                TestContext.Current.CancellationToken);
        }

        await using (var contexto = Como(c.A, c.EmpresaX))
        {
            await InserirFrenteAsync(contexto, c.EmpresaX, c.Obra1, c.B);
        }
    }

    [Fact]
    public async Task Versao_por_gatilho_em_frente_e_carteira()
    {
        var c = await CenarioPermissoes.CriarAsync(_dados);

        // Nasce 1; o gatilho soma 1 à versão ANTIGA e ignora o valor enviado (999).
        Assert.Equal("1", await _banco.ConsultarComoSuperusuarioAsync($"SELECT versao FROM cronoai.frente WHERE id = '{c.Frente1}'"));
        await using (var contexto = Como(c.A, c.EmpresaX))
        {
            await contexto.Database.ExecuteSqlAsync($"UPDATE cronoai.frente SET versao = 999, nome = {"Frente Renomeada " + Guid.NewGuid().ToString("N")[..8]} WHERE id = {c.Frente1}", TestContext.Current.CancellationToken);
        }

        Assert.Equal("2", await _banco.ConsultarComoSuperusuarioAsync($"SELECT versao FROM cronoai.frente WHERE id = '{c.Frente1}'"));

        Assert.Equal("1", await _banco.ConsultarComoSuperusuarioAsync($"SELECT versao FROM cronoai.carteira WHERE id = '{c.CarteiraK}'"));
        await using (var contexto = Como(c.A, c.EmpresaX))
        {
            await contexto.Database.ExecuteSqlAsync($"UPDATE cronoai.carteira SET versao = 999, nome = {"Carteira Renomeada " + Guid.NewGuid().ToString("N")[..8]} WHERE id = {c.CarteiraK}", TestContext.Current.CancellationToken);
        }

        Assert.Equal("2", await _banco.ConsultarComoSuperusuarioAsync($"SELECT versao FROM cronoai.carteira WHERE id = '{c.CarteiraK}'"));
    }

    [Fact]
    public async Task Nome_unico_entre_frentes_e_entre_carteiras_ativas()
    {
        // Índices parciais por expressão (só a migração os cria): o nome vale entre as NÃO arquivadas, sem diferenciar caixa.
        var c = await CenarioPermissoes.CriarAsync(_dados);
        var nome = "Frente Unica " + Guid.NewGuid().ToString("N")[..8];
        await _dados.CriarFrenteAsync(c.EmpresaX, c.Obra1, nome);

        var repetida = await Assert.ThrowsAsync<InvalidOperationException>(() => _dados.CriarFrenteAsync(c.EmpresaX, c.Obra1, nome.ToUpperInvariant()));
        Assert.Contains("ux_frente_obra_nome_ativa", repetida.Message, StringComparison.Ordinal);

        // Controle negativo: a mesma frente em OUTRA obra passa.
        await _dados.CriarFrenteAsync(c.EmpresaX, c.Obra2, nome);

        var carteira = "Carteira Unica " + Guid.NewGuid().ToString("N")[..8];
        await _dados.CriarCarteiraAsync(c.EmpresaX, carteira, "regional");
        var carteiraRepetida = await Assert.ThrowsAsync<InvalidOperationException>(() => _dados.CriarCarteiraAsync(c.EmpresaX, carteira.ToUpperInvariant(), "regional"));
        Assert.Contains("ux_carteira_empresa_tipo_nome_ativa", carteiraRepetida.Message, StringComparison.Ordinal);

        // Tipo diferente passa; e arquivar libera o nome.
        await _dados.CriarCarteiraAsync(c.EmpresaX, carteira, "cliente");
        await _banco.ProduzirEstadoComoSuperusuarioAsync($"UPDATE cronoai.carteira SET arquivada_em = now() + interval '1 minute' WHERE empresa_id = '{c.EmpresaX}' AND nome = '{carteira}' AND tipo = 'regional'");
        await _dados.CriarCarteiraAsync(c.EmpresaX, carteira, "regional");
    }

    #endregion

    #region Métodos privados

    private CronoDbContext Como(Guid usuario, Guid empresa) => _dados.Fabrica.Criar(new ContextoSessaoBanco(usuario, empresa));

    // Roda a escrita como ADMINISTRADOR (passa as políticas) e devolve o SQLSTATE e a constraint da violação.
    private async Task<(string? SqlState, string? Constraint)> ViolacaoAsync(CenarioPermissoes c, Func<CronoDbContext, Task> escrita)
    {
        await using var contexto = Como(c.A, c.EmpresaX);
        var erro = await Assert.ThrowsAsync<PostgresException>(() => escrita(contexto));
        return (erro.SqlState, erro.ConstraintName);
    }

    private static Task<int> InserirAcessoObraAsync(CronoDbContext contexto, Guid empresa, Guid obra, Guid usuario) =>
        contexto.Database.ExecuteSqlAsync(
            $"INSERT INTO cronoai.acesso_obra (id, empresa_id, obra_id, usuario_id, criado_em) VALUES ({Guid.CreateVersion7()}, {empresa}, {obra}, {usuario}, {DateTime.UtcNow})",
            TestContext.Current.CancellationToken);

    private static Task<int> InserirAcessoFrenteAsync(CronoDbContext contexto, Guid empresa, Guid obra, Guid frente, Guid usuario) =>
        contexto.Database.ExecuteSqlAsync(
            $"INSERT INTO cronoai.acesso_frente (id, empresa_id, obra_id, frente_id, usuario_id, criado_em) VALUES ({Guid.CreateVersion7()}, {empresa}, {obra}, {frente}, {usuario}, {DateTime.UtcNow})",
            TestContext.Current.CancellationToken);

    private static Task<int> InserirFrenteAsync(CronoDbContext contexto, Guid empresa, Guid obra, Guid responsavel) =>
        contexto.Database.ExecuteSqlAsync(
            $"INSERT INTO cronoai.frente (id, empresa_id, obra_id, nome, responsavel_id, criada_em, atualizada_em) VALUES ({Guid.CreateVersion7()}, {empresa}, {obra}, {"Frente " + Guid.NewGuid().ToString("N")}, {responsavel}, {DateTime.UtcNow}, {DateTime.UtcNow})",
            TestContext.Current.CancellationToken);

    #endregion
}
