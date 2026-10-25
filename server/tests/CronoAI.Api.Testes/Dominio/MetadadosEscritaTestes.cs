using CronoAI.Dados.Auditoria;
using CronoAI.Dominio;

namespace CronoAI.Api.Testes.Dominio;

/// <summary>Metadados obrigatórios da escrita auditada (sem banco).</summary>
public sealed class MetadadosEscritaTestes
{
    #region Campos

    private static readonly DateTime _agora = new(2026, 10, 25, 12, 0, 0, DateTimeKind.Utc);

    #endregion

    #region Métodos públicos

    [Fact]
    public void Metadados_recusam_motivo_invalido()
    {
        Assert.Throws<ArgumentException>(() => new MetadadosEscrita(OrigensAuditoria.Ui, new string('m', 501), null, _agora));
        Assert.Throws<ArgumentException>(() => new MetadadosEscrita(OrigensAuditoria.Ui, "motivo\0com nulo", null, _agora));

        // Controle: 500 caracteres e motivo nulo são aceitos.
        Assert.Equal(500, new MetadadosEscrita(OrigensAuditoria.Ui, new string('m', 500), null, _agora).Motivo!.Length);
        Assert.Null(new MetadadosEscrita(OrigensAuditoria.Ui, null, null, _agora).Motivo);
    }

    [Fact]
    public void Motivo_em_branco_vira_nulo_e_o_texto_e_preservado()
    {
        Assert.Null(new MetadadosEscrita(OrigensAuditoria.Ui, "   ", null, _agora).Motivo);
        Assert.Null(new MetadadosEscrita(OrigensAuditoria.Ui, "", null, _agora).Motivo);

        // Texto livre não é alterado: nem aparado, nem sem TAB ou CR no início (o CSV neutraliza fórmula de ponta a ponta).
        Assert.Equal("  revisão de prazo ", new MetadadosEscrita(OrigensAuditoria.Ui, "  revisão de prazo ", null, _agora).Motivo);
        Assert.Equal("\tx", new MetadadosEscrita(OrigensAuditoria.Ui, "\tx", null, _agora).Motivo);
        Assert.Equal("\rx", new MetadadosEscrita(OrigensAuditoria.Ui, "\rx", null, _agora).Motivo);
    }

    [Fact]
    public void Metadados_recusam_origem_desconhecida_e_instante_nao_utc()
    {
        Assert.Throws<ArgumentException>(() => new MetadadosEscrita("web", null, null, _agora));
        Assert.Throws<ArgumentException>(() => new MetadadosEscrita(OrigensAuditoria.Ui, null, null, DateTime.SpecifyKind(_agora, DateTimeKind.Unspecified)));
    }

    #endregion
}
