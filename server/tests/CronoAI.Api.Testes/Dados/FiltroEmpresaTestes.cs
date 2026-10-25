using CronoAI.Api.Testes.Infra;
using CronoAI.Dados;
using Microsoft.EntityFrameworkCore;

namespace CronoAI.Api.Testes.Dados;

/// <summary>Filtro global nomeado "Empresa" do EF (primeira camada; o RLS é a segunda).</summary>
[Collection(ColecaoBanco.Nome)]
[Trait("Categoria", "Integracao")]
public sealed class FiltroEmpresaTestes
{
    #region Campos

    private readonly DadosTeste _dados;

    #endregion

    #region Construtor

    public FiltroEmpresaTestes(BancoPostgresFixture banco)
    {
        _dados = new DadosTeste(banco);
    }

    #endregion

    #region Métodos públicos

    [Fact]
    public async Task Filtro_do_EF_sem_empresa_ativa_nao_devolve_nada()
    {
        var usuario = await _dados.CriarUsuarioAsync();
        await _dados.CriarEmpresaComMembrosAsync(usuario);

        // Contexto só de usuário (o RLS enxerga o vínculo), mas o filtro "Empresa" exige empresa ativa: zero.
        await using var contexto = _dados.Fabrica.Criar(ContextoSessaoBanco.DoUsuario(usuario));

        Assert.Equal(0, await contexto.Membros.CountAsync(TestContext.Current.CancellationToken));
    }

    [Fact]
    public async Task Filtro_do_EF_com_empresa_so_devolve_a_empresa_do_contexto()
    {
        var usuario = await _dados.CriarUsuarioAsync();
        var empresaA = await _dados.CriarEmpresaComMembrosAsync(usuario);
        await _dados.CriarEmpresaComMembrosAsync(usuario);

        await using var contexto = _dados.Fabrica.Criar(new ContextoSessaoBanco(usuario, empresaA));

        var membros = await contexto.Membros.ToListAsync(TestContext.Current.CancellationToken);
        var unico = Assert.Single(membros);
        Assert.Equal(empresaA, unico.EmpresaId);
    }

    #endregion
}
