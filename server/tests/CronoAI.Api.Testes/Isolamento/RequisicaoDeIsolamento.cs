using System.Net.Http.Json;

namespace CronoAI.Api.Testes.Isolamento;

/// <summary>
/// Monta a requisição que o teste genérico de isolamento envia a cada rota do catálogo. É UM ponto só (usado pelo teste
/// <c>Usuario_da_empresa_A_nao_ve_dado_da_empresa_B_em_nenhuma_rota</c> e testado direto pelo meta-teste): é aqui que o
/// <c>{id}</c> vira a obra REAL da empresa B quando a entrada do catálogo declara <see cref="RecursoAlheio.Obra"/>.
/// </summary>
public static class RequisicaoDeIsolamento
{
    #region Métodos públicos

    /// <param name="rota">Rota registrada.</param>
    /// <param name="empresaAlheia">Empresa B, entregue ao corpo das entradas que a usam.</param>
    /// <param name="recursos">Recursos reais; sem eles (testes de 401 e de antiforgery) os parâmetros da rota são aleatórios. Só entram os que a entrada do catálogo declara em <see cref="EntradaCatalogo.Recurso"/>.</param>
    /// <param name="antiforgery">Token de antiforgery, ou nulo.</param>
    public static HttpRequestMessage Montar(RotaRegistrada rota, Guid empresaAlheia, RecursosDeIsolamento? recursos, string? antiforgery)
    {
        ArgumentNullException.ThrowIfNull(rota);
        var entrada = CatalogoRotas.Entradas.FirstOrDefault(e => e.Chave == rota.Chave);
        var reais = recursos ?? RecursosDeIsolamento.Nenhum;
        var declarados = new RecursosDeIsolamento(
            entrada?.Recurso is RecursoAlheio.Obra or RecursoAlheio.ObraEMembro ? reais.Obra : null,
            entrada?.Recurso is RecursoAlheio.Membro or RecursoAlheio.ObraEMembro ? reais.Membro : null);
        var requisicao = new HttpRequestMessage(new HttpMethod(rota.Metodo), DetectorDeRotas.Concretizar(rota.Padrao, declarados));
        if (antiforgery is not null)
        {
            requisicao.Headers.Add("X-XSRF-TOKEN", antiforgery);
        }

        if (rota.EhEscrita)
        {
            requisicao.Content = JsonContent.Create(entrada?.Corpo?.Invoke(empresaAlheia) ?? new { });
        }

        return requisicao;
    }

    #endregion
}
