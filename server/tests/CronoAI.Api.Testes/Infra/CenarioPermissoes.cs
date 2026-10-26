using CronoAI.Dominio;

namespace CronoAI.Api.Testes.Infra;

/// <summary>
/// Cenário-base dos testes de banco de permissão (plano 00014, seção 11.0), todo FICTÍCIO e criado com ids novos:
/// empresa X com A (administrador), B (engenheiro de obra vinculado à obra1), C (gestor de escopo carteiras, com a carteira K
/// que contém a obra2 e a K2 ARQUIVADA que contém a obra3), G (gestor de escopo todas), D (engenheiro sem vínculo), R
/// (engenheiro vinculado à obra1 e depois REMOVIDO) e F (encarregado vinculado à obra1 e à frente1, criado pela fixture);
/// empresa Y com Z (administrador) e a obraY.
/// </summary>
public sealed record CenarioPermissoes(
    Guid EmpresaX,
    Guid EmpresaY,
    Guid A,
    Guid B,
    Guid C,
    Guid G,
    Guid D,
    Guid R,
    Guid F,
    Guid Z,
    Guid Obra1,
    Guid Obra2,
    Guid Obra3,
    Guid ObraY,
    Guid CarteiraK,
    Guid CarteiraK2,
    Guid Frente1)
{
    #region Métodos públicos

    public static async Task<CenarioPermissoes> CriarAsync(DadosTeste dados)
    {
        ArgumentNullException.ThrowIfNull(dados);
        var a = await dados.CriarUsuarioAsync();
        var b = await dados.CriarUsuarioAsync();
        var c = await dados.CriarUsuarioAsync();
        var g = await dados.CriarUsuarioAsync();
        var d = await dados.CriarUsuarioAsync();
        var r = await dados.CriarUsuarioAsync();
        var f = await dados.CriarUsuarioAsync();
        var z = await dados.CriarUsuarioAsync();

        var empresaX = await dados.CriarEmpresaAsync(comAdministradorTecnico: false);
        await dados.VincularAsync(empresaX, a);
        await dados.VincularAsync(empresaX, b, Perfis.EngenheiroObra);
        await dados.VincularAsync(empresaX, c, Perfis.GestorPortfolio, EscoposObras.Carteiras);
        await dados.VincularAsync(empresaX, g, Perfis.GestorPortfolio, EscoposObras.Todas);
        await dados.VincularAsync(empresaX, d, Perfis.EngenheiroPlanejamento);
        await dados.VincularAsync(empresaX, r, Perfis.EngenheiroObra);
        await dados.VincularAsync(empresaX, f, Perfis.Encarregado);

        var empresaY = await dados.CriarEmpresaAsync(comAdministradorTecnico: false);
        await dados.VincularAsync(empresaY, z);

        var obra1 = (await dados.CriarObraAsync(empresaX, a)).Id;
        var obra2 = (await dados.CriarObraAsync(empresaX, a)).Id;
        var obra3 = (await dados.CriarObraAsync(empresaX, a)).Id;
        var obraY = (await dados.CriarObraAsync(empresaY, z)).Id;

        await dados.CriarAcessoObraAsync(empresaX, obra1, b);
        await dados.CriarAcessoObraAsync(empresaX, obra1, r);
        await dados.CriarAcessoObraAsync(empresaX, obra1, f);
        var frente1 = await dados.CriarFrenteAsync(empresaX, obra1);
        await dados.CriarAcessoFrenteAsync(empresaX, obra1, frente1, f);

        var k = await dados.CriarCarteiraAsync(empresaX, tipo: TiposCarteira.Regional);
        var k2 = await dados.CriarCarteiraAsync(empresaX, tipo: TiposCarteira.Cliente, arquivada: true);
        await dados.IncluirObraNaCarteiraAsync(empresaX, k, obra2);
        await dados.IncluirObraNaCarteiraAsync(empresaX, k2, obra3);
        await dados.AtribuirCarteiraAsync(empresaX, k, c);
        await dados.AtribuirCarteiraAsync(empresaX, k2, c);

        // R é removido DEPOIS de receber o vínculo: o vínculo físico segue existindo, mas fica inerte.
        await dados.RemoverMembroAsync(empresaX, r);

        return new CenarioPermissoes(empresaX, empresaY, a, b, c, g, d, r, f, z, obra1, obra2, obra3, obraY, k, k2, frente1);
    }

    #endregion
}
