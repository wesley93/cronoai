using System.Net;
using CronoAI.Api.Testes.Infra;
using CronoAI.Api.Testes.Infra.IdpTeste;
using CronoAI.Dados;
using CronoAI.Dominio;

namespace CronoAI.Api.Testes.Isolamento;

/// <summary>
/// Isolamento ENTRE OBRAS DA MESMA EMPRESA (plano 00014, T76 e T77): o filtro de empresa e o RLS de empresa não ajudam aqui, só o
/// RLS por obra. O recurso é uma obra REAL da mesma empresa que o usuário não enxerga, montada pelo MESMO montador único dos demais
/// testes de isolamento (<see cref="RequisicaoDeIsolamento"/>), e o meta-teste prova que ela existe e é invisível ao usuário.
/// </summary>
[Collection(ColecaoBanco.Nome)]
[Trait("Categoria", "Integracao")]
public sealed class ObraSemVinculoTestes
{
    #region Campos

    private readonly BancoPostgresFixture _banco;
    private readonly DadosTeste _dados;

    #endregion

    #region Construtor

    public ObraSemVinculoTestes(BancoPostgresFixture banco)
    {
        _banco = banco;
        _dados = new DadosTeste(banco);
    }

    #endregion

    #region Métodos públicos

    [Fact]
    public async Task Obra_sem_vinculo_da_mesma_empresa_em_toda_rota_de_obra()
    {
        using var idp = new IdpEmMemoria();
        await using var fabrica = new ApiFactory(_banco.StringConexaoApp) { Idp = idp };
        var comCenario = CatalogoRotas.Entradas.Where(e => e.SemVinculo is not null).ToList();

        // Toda rota do catálogo com {id} de obra declara o cenário (rota nova com {id} sem cenário reprova aqui).
        var semDeclaracao = CatalogoRotas.Entradas
            .Where(e => e.Recurso is RecursoAlheio.Obra && e.Cenario == CenarioIsolamento.ComIdDeOutraEmpresa && e.SemVinculo is null)
            .Select(e => e.Chave)
            .ToList();
        Assert.Empty(semDeclaracao);
        Assert.NotEmpty(comCenario);

        var falhas = new List<string>();
        foreach (var entrada in comCenario)
        {
            var declarado = entrada.SemVinculo!;
            if (declarado.Esperado == HttpStatusCode.Forbidden)
            {
                // Cenário "tem a ação e não tem a obra" não se aplica (só o administrador a tem): precisa justificar.
                Assert.False(string.IsNullOrWhiteSpace(declarado.NaoSeAplica), $"{entrada.Chave}: 403 sem justificativa de NaoSeAplica");
            }

            var cenario = await CriarCenarioAsync(fabrica, idp, declarado.Perfil, declarado.Escopo);
            using var navegador = cenario.Navegador.Navegador;
            var rota = new RotaRegistrada(entrada.Metodo, entrada.Padrao, false);
            var token = rota.EhEscrita ? await ClienteAutenticado.ObterTokenAntiforgeryAsync(navegador) : null;

            // O mesmo montador dos demais testes de isolamento; o {id} é a obra REAL da MESMA empresa.
            using var requisicao = RequisicaoDeIsolamento.Montar(rota, cenario.EmpresaDaObra, new RecursosDeIsolamento(cenario.Obra), token);
            using var resposta = await navegador.SendAsync(requisicao, TestContext.Current.CancellationToken);
            var corpo = await resposta.Content.ReadAsStringAsync(TestContext.Current.CancellationToken);

            if (resposta.StatusCode != declarado.Esperado)
            {
                falhas.Add($"{entrada.Chave} ({declarado.Perfil}) respondeu {(int)resposta.StatusCode}, esperado {(int)declarado.Esperado}");
            }

            // Nenhum marcador da obra (o nome) no corpo, nem no 404 nem no 403.
            if (corpo.Contains(cenario.NomeDaObra, StringComparison.OrdinalIgnoreCase))
            {
                falhas.Add($"{entrada.Chave} vazou o nome da obra sem vínculo");
            }
        }

        Assert.Empty(falhas);
    }

    [Fact]
    public async Task Concretizacao_usa_recursos_reais()
    {
        // Meta-teste (T77), pelo MONTADOR ÚNICO. (1) O {id} das rotas ComIdDeOutraEmpresa é uma obra que EXISTE na empresa B e o
        // {usuarioId} é um membro que EXISTE em B. (2) No cenário sem vínculo, a obra existe na MESMA empresa do usuário e é
        // invisível a ele, mas visível ao administrador da empresa. Controle negativo: sem os recursos os ids são aleatórios.
        var usuarioB = await _dados.CriarUsuarioAsync();
        var empresaB = await _dados.CriarEmpresaComMembrosAsync(usuarioB);
        var obraB = await _dados.CriarObraAsync(empresaB, usuarioB);
        var recursos = new RecursosDeIsolamento(obraB.Id, usuarioB);

        foreach (var entrada in CatalogoRotas.Entradas.Where(e => e.Recurso != RecursoAlheio.Nenhum))
        {
            var rota = new RotaRegistrada(entrada.Metodo, entrada.Padrao, false);
            using var requisicao = RequisicaoDeIsolamento.Montar(rota, empresaB, recursos, null);
            var ids = System.Text.RegularExpressions.Regex.Matches(requisicao.RequestUri!.ToString(), "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}")
                .Select(m => Guid.Parse(m.Value))
                .ToList();

            if (entrada.Recurso is RecursoAlheio.Obra or RecursoAlheio.ObraEMembro)
            {
                Assert.Contains(obraB.Id, ids);
                Assert.Equal(empresaB.ToString("D"), await _banco.ConsultarComoSuperusuarioAsync($"SELECT empresa_id FROM cronoai.obra WHERE id = '{obraB.Id}'"));
            }

            if (entrada.Recurso is RecursoAlheio.Membro or RecursoAlheio.ObraEMembro)
            {
                Assert.Contains(usuarioB, ids);
                Assert.Equal("1", await _banco.ConsultarComoSuperusuarioAsync($"SELECT count(*) FROM cronoai.membro_empresa WHERE empresa_id = '{empresaB}' AND usuario_id = '{usuarioB}'"));
            }

            // Controle negativo: sem os recursos, nenhum id montado é o real.
            using var semRecursos = RequisicaoDeIsolamento.Montar(rota, empresaB, null, null);
            Assert.DoesNotContain(obraB.Id.ToString("D"), semRecursos.RequestUri!.ToString(), StringComparison.OrdinalIgnoreCase);
            Assert.DoesNotContain(usuarioB.ToString("D"), semRecursos.RequestUri!.ToString(), StringComparison.OrdinalIgnoreCase);
        }

        // (2) Cenário sem vínculo: a obra EXISTE na empresa do usuário e ele não a enxerga; o administrador sim.
        using var idp = new IdpEmMemoria();
        await using var fabrica = new ApiFactory(_banco.StringConexaoApp) { Idp = idp };
        var cenario = await CriarCenarioAsync(fabrica, idp, Perfis.EngenheiroPlanejamento);
        using var navegador = cenario.Navegador.Navegador;

        Assert.Equal(cenario.Navegador.Empresas[0], cenario.EmpresaDaObra);
        Assert.Equal(cenario.EmpresaDaObra.ToString("D"), await _banco.ConsultarComoSuperusuarioAsync($"SELECT empresa_id FROM cronoai.obra WHERE id = '{cenario.Obra}'"));

        await using (var comoUsuario = _dados.Fabrica.Criar(new ContextoSessaoBanco(cenario.Navegador.UsuarioId, cenario.EmpresaDaObra)))
        {
            Assert.Empty(await DadosTeste.LerIdsAsync(comoUsuario, $"SELECT id AS \"Value\" FROM cronoai.obra WHERE id = {cenario.Obra}"));
        }

        await using (var comoAdministrador = _dados.Fabrica.Criar(DadosTeste.ComoAdministrador(cenario.EmpresaDaObra)))
        {
            Assert.Equal([cenario.Obra], await DadosTeste.LerIdsAsync(comoAdministrador, $"SELECT id AS \"Value\" FROM cronoai.obra WHERE id = {cenario.Obra}"));
        }

        // O montador, no cenário sem vínculo, leva a obra real da mesma empresa na URL.
        var rotaGet = new RotaRegistrada("GET", "/api/v1/obras/{id}", false);
        using var requisicaoSemVinculo = RequisicaoDeIsolamento.Montar(rotaGet, cenario.EmpresaDaObra, new RecursosDeIsolamento(cenario.Obra), null);
        Assert.EndsWith(cenario.Obra.ToString("D"), requisicaoSemVinculo.RequestUri!.ToString(), StringComparison.OrdinalIgnoreCase);
    }

    #endregion

    #region Métodos privados

    // Empresa com um administrador técnico, uma obra real (nome com marcador) e um usuário do perfil dado (escopo "vinculadas" ou
    // "carteiras", sem nenhum vínculo nem carteira): a obra existe na empresa dele e ele não a enxerga.
    private async Task<CenarioSemVinculo> CriarCenarioAsync(ApiFactory fabrica, IdpEmMemoria idp, string perfil, string? escopo = null)
    {
        var empresa = await _dados.CriarEmpresaAsync();
        var nome = "Obra-SV-MARCADOR-" + Guid.NewGuid().ToString("N");
        var obra = await _dados.CriarObraAsync(empresa, DadosTeste.AdministradorDe(empresa), DadosTeste.DadosObraValidos(nome));
        var login = await CenarioLogin.NaEmpresaAsync(fabrica, idp, _dados, empresa, perfil, escopo ?? Perfis.EscopoUnico(perfil) ?? EscoposObras.Carteiras);
        return new CenarioSemVinculo(login, empresa, obra.Id, nome);
    }

    #endregion

    #region Tipos auxiliares

    private sealed record CenarioSemVinculo(CenarioLogin Navegador, Guid EmpresaDaObra, Guid Obra, string NomeDaObra);

    #endregion
}
