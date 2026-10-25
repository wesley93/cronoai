using CronoAI.Dominio;
using SessaoDominio = CronoAI.Dominio.Sessao;

namespace CronoAI.Api.Testes.Dominio;

/// <summary>Fábricas e validações do domínio (sem banco).</summary>
public sealed class EntidadesTestes
{
    #region Métodos públicos

    [Fact]
    public void Empresa_usa_uuid_v7_e_valida_nome()
    {
        var agora = DateTime.UtcNow;

        var empresa = Empresa.Criar("Construtora Ficticia", agora);

        Assert.Equal(7, empresa.Id.Version);
        Assert.Throws<ArgumentException>(() => Empresa.Criar("", agora));
        Assert.Throws<ArgumentException>(() => Empresa.Criar(new string('x', 201), agora));
        Assert.Equal("Construtora Ficticia", Empresa.Criar("Construtora Ficticia", agora, Guid.Empty).Nome);
    }

    [Fact]
    public void Usuario_valida_tamanhos_e_exige_utc()
    {
        var agora = DateTime.UtcNow;

        Assert.Equal(7, Usuario.Criar("https://idp.teste", "sub-1", null, agora).Id.Version);
        Assert.Throws<ArgumentException>(() => Usuario.Criar("", "sub-1", null, agora));
        Assert.Throws<ArgumentException>(() => Usuario.Criar("https://idp.teste", "", null, agora));
        Assert.Throws<ArgumentException>(() => Usuario.Criar("https://idp.teste", new string('s', 256), null, agora));
        Assert.Throws<ArgumentException>(() => Usuario.Criar("https://idp.teste", "sub-1", new string('n', 201), agora));
        Assert.Throws<ArgumentException>(() => Usuario.Criar("https://idp.teste", "sub-1", null, DateTime.SpecifyKind(DateTime.UtcNow, DateTimeKind.Unspecified)));
    }

    [Fact]
    public void Sujeito_preserva_a_caixa()
    {
        var usuario = Usuario.Criar("https://idp.teste", "AbC-DeF", null, DateTime.UtcNow);

        Assert.Equal("AbC-DeF", usuario.Sujeito);
    }

    [Fact]
    public void Sessao_recebe_os_instantes_e_gera_id_v4()
    {
        var criada = new DateTime(2026, 10, 25, 12, 0, 0, DateTimeKind.Utc);

        var sessao = SessaoDominio.Criar(Guid.CreateVersion7(), criada, criada.AddHours(8));

        Assert.Equal(4, sessao.Id.Version);
        Assert.Equal(criada.AddHours(8), sessao.ExpiraEm);
        Assert.Null(sessao.EncerradaEm);
        Assert.Throws<ArgumentException>(() => SessaoDominio.Criar(Guid.CreateVersion7(), criada, criada));
    }

    [Fact]
    public void Ids_de_sessao_nao_se_repetem()
    {
        var ids = Enumerable.Range(0, 1000).Select(_ => SessaoDominio.GerarId()).ToHashSet();

        Assert.Equal(1000, ids.Count);
    }

    [Fact]
    public void Membro_implementa_IDadoDeEmpresa()
    {
        var empresa = Guid.CreateVersion7();

        var membro = MembroEmpresa.Criar(empresa, Guid.CreateVersion7(), DateTime.UtcNow);
        Assert.IsAssignableFrom<IDadoDeEmpresa>(membro);

        Assert.Equal(empresa, membro.EmpresaId);
    }

    #endregion
}
