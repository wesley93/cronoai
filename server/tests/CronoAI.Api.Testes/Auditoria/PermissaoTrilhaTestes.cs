using System.Net;
using System.Text;
using CronoAI.Api.Testes.Infra;
using CronoAI.Dados.Auditoria;
using CronoAI.Dominio;
using Microsoft.EntityFrameworkCore;

namespace CronoAI.Api.Testes.Auditoria;

/// <summary>
/// Leitura e exportação da trilha por perfil e por obra (plano 00014, T55 e T56): a matriz decide quem pode chamar; o RLS decide
/// quais obras a pessoa vê. A trilha da empresa (sem obra, como a troca de perfil de um membro) só o administrador lê e exporta.
/// </summary>
[Collection(ColecaoBanco.Nome)]
[Trait("Categoria", "Integracao")]
public sealed class PermissaoTrilhaTestes
{
    #region Campos

    private readonly BancoPostgresFixture _banco;
    private readonly DadosTeste _dados;

    #endregion

    #region Construtor

    public PermissaoTrilhaTestes(BancoPostgresFixture banco)
    {
        _banco = banco;
        _dados = new DadosTeste(banco);
    }

    #endregion

    #region Métodos públicos

    [Fact]
    public async Task Trilha_por_matriz_e_visibilidade()
    {
        await using var api = await AmbienteApi.CriarAsync(_banco, _dados);
        var obra1 = await api.CriarObraAsync();
        var obra2 = await api.CriarObraAsync();

        // Encarregado, suprimentos e diretoria: 403 por perfil, MESMO tendo a obra visível (a matriz não os deixa ler a trilha).
        foreach (var perfil in new[] { Perfis.Encarregado, Perfis.Suprimentos, Perfis.Diretoria })
        {
            var escopo = Perfis.EscopoUnico(perfil) ?? EscoposObras.Todas;
            var usuario = await api.NovoUsuarioNaEmpresaAsync(perfil, escopo);
            if (escopo == EscoposObras.Vinculadas)
            {
                await _dados.CriarAcessoObraAsync(api.EmpresaId, obra1.Id, usuario.UsuarioId);
            }

            using var resposta = await usuario.Navegador.GetAsync($"/api/v1/obras/{obra1.Id}/auditoria", TestContext.Current.CancellationToken);
            var lida = await AmbienteApi.RespostaJson.LerAsync(resposta);

            Assert.Equal(HttpStatusCode.Forbidden, lida.Status);
            Assert.Equal("acao-nao-permitida", lida.Corpo.GetProperty("type").GetString());
        }

        // Engenheiro de obra vinculado SÓ à obra1: lê a trilha dela (200) e recebe 404 na da obra2 (RLS: a obra não existe para ele).
        var engenheiro = await api.NovoUsuarioNaEmpresaAsync(Perfis.EngenheiroObra);
        await _dados.CriarAcessoObraAsync(api.EmpresaId, obra1.Id, engenheiro.UsuarioId);

        using var daObra1 = await engenheiro.Navegador.GetAsync($"/api/v1/obras/{obra1.Id}/auditoria", TestContext.Current.CancellationToken);
        using var daObra2 = await engenheiro.Navegador.GetAsync($"/api/v1/obras/{obra2.Id}/auditoria", TestContext.Current.CancellationToken);
        var lidaDaObra1 = await AmbienteApi.RespostaJson.LerAsync(daObra1);

        Assert.Equal(HttpStatusCode.OK, lidaDaObra1.Status);
        Assert.NotEmpty(lidaDaObra1.Corpo.GetProperty("itens").EnumerateArray());
        Assert.Equal(HttpStatusCode.NotFound, daObra2.StatusCode);
    }

    [Fact]
    public async Task Exportacao_so_administrador_com_trilha_da_empresa()
    {
        await using var api = await AmbienteApi.CriarAsync(_banco, _dados);
        await api.CriarObraAsync();
        var hoje = DateOnly.FromDateTime(DateTime.UtcNow);
        var url = $"/api/v1/auditoria/exportacao.csv?de={hoje.AddDays(-1):yyyy-MM-dd}&ate={hoje.AddDays(1):yyyy-MM-dd}";

        // Gera a trilha da EMPRESA (sem obra): a troca de perfil de um membro, auditada como a API do 00014 a gravará.
        var membro = await _dados.CriarUsuarioAsync();
        await _dados.VincularAsync(api.EmpresaId, membro, Perfis.EngenheiroObra, EscoposObras.Vinculadas);
        await using (var contexto = _dados.Fabrica.Criar(new CronoAI.Dados.ContextoSessaoBanco(api.UsuarioId, api.EmpresaId)))
        {
            var alvo = await contexto.Membros.SingleAsync(m => m.UsuarioId == membro, TestContext.Current.CancellationToken);
            alvo.AlterarPerfil(Perfis.Suprimentos, EscoposObras.Vinculadas, DateTime.UtcNow);
            await contexto.SalvarAuditadoAsync(new MetadadosEscrita(OrigensAuditoria.Ui, null, null, DateTime.UtcNow), TestContext.Current.CancellationToken);
        }

        // Os outros 6 perfis: 403 (a exportação inclui a trilha da empresa e o motivo de todas as obras).
        foreach (var perfil in Perfis.Todos.Where(p => p != Perfis.Administrador))
        {
            var usuario = await api.NovoUsuarioNaEmpresaAsync(perfil, Perfis.EscopoUnico(perfil) ?? EscoposObras.Todas);
            using var resposta = await usuario.Navegador.GetAsync(url, TestContext.Current.CancellationToken);

            Assert.Equal(HttpStatusCode.Forbidden, resposta.StatusCode);
        }

        // Controle negativo: o administrador exporta, e o CSV traz a linha da troca de perfil (obra_id vazio).
        var (status, bytes, _) = await api.LerBytesAsync(url);
        var csv = Encoding.UTF8.GetString(bytes);

        Assert.Equal(HttpStatusCode.OK, status);
        Assert.Contains("membro_empresa", csv, StringComparison.Ordinal);
        Assert.Contains("#fim;", csv, StringComparison.Ordinal);
    }

    #endregion
}
