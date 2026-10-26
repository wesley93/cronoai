using System.Text;
using System.Text.Json;
using CronoAI.Dominio;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.ChangeTracking;
using Microsoft.EntityFrameworkCore.Diagnostics;

namespace CronoAI.Dados.Auditoria;

/// <summary>
/// Grava a trilha de auditoria NA MESMA transação da mudança (ADR 00009): no <c>SavingChanges</c>, percorre as
/// entidades <see cref="IAuditavel"/> do <c>ChangeTracker</c> e adiciona os <see cref="RegistroAuditoria"/> ao MESMO
/// <see cref="CronoDbContext"/>, que os grava no mesmo lote (tudo ou nada). Nunca usa outro contexto: seria outra
/// conexão, outra transação e outro contexto de RLS.
/// FALHA FECHADA: uma entidade auditável sem os metadados de <see cref="CronoDbContext.SalvarAuditadoAsync"/>, ou
/// removida, faz o <c>SaveChanges</c> lançar; nenhuma escrita auditável sai sem quem, de onde e por quê. Só entra na
/// trilha o que a <see cref="ListaBrancaAuditoria"/> permite. Singleton e sem estado.
/// </summary>
public sealed class AuditoriaInterceptor : SaveChangesInterceptor
{
    #region Campos

    private const string NomeDaVersao = "Versao";

    #endregion

    #region Propriedades

    /// <summary>Instância única (o interceptor não guarda estado).</summary>
    public static AuditoriaInterceptor Instancia { get; } = new();

    #endregion

    #region Métodos públicos

    public override InterceptionResult<int> SavingChanges(DbContextEventData eventData, InterceptionResult<int> result)
    {
        ArgumentNullException.ThrowIfNull(eventData);
        Auditar(eventData.Context);
        return result;
    }

    public override ValueTask<InterceptionResult<int>> SavingChangesAsync(
        DbContextEventData eventData,
        InterceptionResult<int> result,
        CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(eventData);
        Auditar(eventData.Context);
        return ValueTask.FromResult(result);
    }

    // Falhou o lote: os registros adicionados aqui NÃO podem ficar rastreados, ou um novo SaveChanges no mesmo
    // contexto os gravaria em duplicidade.
    public override void SaveChangesFailed(DbContextErrorEventData eventData)
    {
        ArgumentNullException.ThrowIfNull(eventData);
        DescartarRegistrosPendentes(eventData.Context);
    }

    public override Task SaveChangesFailedAsync(DbContextErrorEventData eventData, CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(eventData);
        DescartarRegistrosPendentes(eventData.Context);
        return Task.CompletedTask;
    }

    #endregion

    #region Métodos privados

    private static void Auditar(DbContext? contexto)
    {
        if (contexto is not CronoDbContext banco)
        {
            return;
        }

        // Sem isto o ChangeTracker pode ainda não ter visto a mudança feita por atribuição de propriedade.
        banco.ChangeTracker.DetectChanges();

        var entradas = banco.ChangeTracker.Entries<IAuditavel>()
            .Where(e => e.State is EntityState.Added or EntityState.Modified or EntityState.Deleted)
            .ToList();
        if (entradas.Count == 0)
        {
            return;
        }

        // Só o vínculo (acesso_*, carteira_obra) admite DELETE físico, e o DELETE vira a ação "remover" na trilha. Obra,
        // frente, carteira e membro nunca são apagados: arquivam-se ou removem-se logicamente (ADR 00009).
        if (entradas.Any(e => e.State == EntityState.Deleted && e.Entity is not IVinculoRemovivel))
        {
            throw new InvalidOperationException("Entidade auditável não pode ser removida: arquive-a (ADR 00009).");
        }

        var metadados = banco.MetadadosAtuais
            ?? throw new InvalidOperationException("Escrita de entidade auditável exige CronoDbContext.SalvarAuditadoAsync com os metadados (ADR 00009).");
        var usuarioId = banco.ContextoBanco.UsuarioId
            ?? throw new InvalidOperationException("Escrita auditada exige o usuário da sessão no contexto do banco.");

        foreach (var entrada in entradas)
        {
            banco.Auditorias.Add(Montar(entrada, metadados, usuarioId));
        }
    }

    private static void DescartarRegistrosPendentes(DbContext? contexto)
    {
        if (contexto is null)
        {
            return;
        }

        foreach (var entrada in contexto.ChangeTracker.Entries<RegistroAuditoria>().Where(e => e.State == EntityState.Added).ToList())
        {
            entrada.State = EntityState.Detached;
        }
    }

    private static RegistroAuditoria Montar(EntityEntry<IAuditavel> entrada, MetadadosEscrita metadados, Guid usuarioId)
    {
        var tipo = entrada.Entity.GetType();
        var campos = ListaBrancaAuditoria.Campos(tipo);
        var empresaId = entrada.Entity is IDadoDeEmpresa dadoDeEmpresa
            ? dadoDeEmpresa.EmpresaId
            : throw new InvalidOperationException($"{tipo.Name} é auditável mas não pertence a uma empresa.");

        string acao;
        string? antes = null;
        string? depois;
        long? versaoDepois = null;

        if (entrada.State == EntityState.Added)
        {
            acao = AcoesAuditoria.Criar;
            depois = EscreverJson(campos, c => entrada.Property(c.Propriedade).CurrentValue);

            // O default do banco é 1 e só o gatilho de UPDATE soma. Entidade sem contador (vínculo, membro com xmin) fica nula.
            versaoDepois = TemContador(entrada) ? 1 : null;
        }
        else if (entrada.State == EntityState.Deleted)
        {
            // Revogação de vínculo: o estado vai em "antes" (lista branca) e não há "depois".
            acao = AcoesAuditoria.Remover;
            antes = EscreverJson(campos, c => entrada.Property(c.Propriedade).OriginalValue);
            depois = null;
        }
        else
        {
            // Só os campos da lista branca que de fato mudaram: o resto (atualizada_em, versão...) é descartado.
            var alterados = campos.Where(c => Alterou(entrada.Property(c.Propriedade))).ToList();
            acao = DerivarAcao(entrada);
            antes = EscreverJson(alterados, c => entrada.Property(c.Propriedade).OriginalValue);
            depois = EscreverJson(alterados, c => entrada.Property(c.Propriedade).CurrentValue);
            versaoDepois = TemContador(entrada) ? (long?)entrada.Property(NomeDaVersao).OriginalValue + 1 : null;
        }

        return RegistroAuditoria.Criar(
            empresaId,
            ObraDaTrilha(entrada.Entity),
            usuarioId,
            entrada.Metadata.GetTableName() ?? throw new InvalidOperationException($"{tipo.Name} sem tabela."),
            entrada.Entity.EntidadeId,
            acao,
            antes,
            depois,
            versaoDepois,
            metadados.Origem,
            metadados.Motivo,
            metadados.CorrelacaoId,
            metadados.InstanteUtc);
    }

    private static bool Alterou(PropertyEntry propriedade) =>
        propriedade.IsModified && !Equals(propriedade.OriginalValue, propriedade.CurrentValue);

    // Só a obra e o que ela agrupa levam obra_id; membro, carteira e vínculos de carteira são trilha da empresa (nulo).
    private static Guid? ObraDaTrilha(IAuditavel entidade) => entidade switch
    {
        Obra obra => obra.Id,
        IDadoDeObra dadoDeObra => dadoDeObra.ObraId,
        _ => null,
    };

    // O contador "versao" (long) existe em obra, frente e carteira. O xmin do membro (uint) não é contador: a trilha não o grava.
    private static bool TemContador(EntityEntry<IAuditavel> entrada) =>
        entrada.Metadata.FindProperty(NomeDaVersao)?.ClrType == typeof(long);

    // Arquivar/restaurar (IArquivavel) e remover/reativar (IRemovivelLogicamente) são só a troca da coluna entre nulo e valor
    // (o domínio garante que nada mais muda nessa escrita).
    private static string DerivarAcao(EntityEntry<IAuditavel> entrada)
    {
        if (entrada.Entity is IArquivavel)
        {
            var acao = AcaoDaTroca(entrada.Property(nameof(IArquivavel.ArquivadaEm)), AcoesAuditoria.Arquivar, AcoesAuditoria.Restaurar);
            if (acao is not null)
            {
                return acao;
            }
        }

        if (entrada.Entity is IRemovivelLogicamente)
        {
            var acao = AcaoDaTroca(entrada.Property(nameof(IRemovivelLogicamente.RemovidoEm)), AcoesAuditoria.Remover, AcoesAuditoria.Restaurar);
            if (acao is not null)
            {
                return acao;
            }
        }

        return AcoesAuditoria.Alterar;
    }

    private static string? AcaoDaTroca(PropertyEntry propriedade, string quandoPreenche, string quandoLimpa)
    {
        if (!propriedade.IsModified)
        {
            return null;
        }

        if (propriedade.OriginalValue is null && propriedade.CurrentValue is not null)
        {
            return quandoPreenche;
        }

        return propriedade.OriginalValue is not null && propriedade.CurrentValue is null ? quandoLimpa : null;
    }

    private static string EscreverJson(IEnumerable<CampoAuditado> campos, Func<CampoAuditado, object?> valor)
    {
        using var fluxo = new MemoryStream();
        using (var escritor = new Utf8JsonWriter(fluxo))
        {
            escritor.WriteStartObject();
            foreach (var campo in campos)
            {
                escritor.WritePropertyName(campo.Chave);
                EscreverValor(escritor, campo, valor(campo));
            }

            escritor.WriteEndObject();
        }

        return Encoding.UTF8.GetString(fluxo.ToArray());
    }

    private static void EscreverValor(Utf8JsonWriter escritor, CampoAuditado campo, object? valor)
    {
        switch (valor)
        {
            case null:
                escritor.WriteNullValue();
                break;
            case string texto when campo.EhJson:
                using (var documento = JsonDocument.Parse(texto))
                {
                    documento.RootElement.WriteTo(escritor);
                }

                break;
            case string texto:
                escritor.WriteStringValue(texto);
                break;
            case Guid id:
                escritor.WriteStringValue(id);
                break;
            case DateOnly data:
                escritor.WriteStringValue(data.ToString("yyyy-MM-dd", System.Globalization.CultureInfo.InvariantCulture));
                break;
            case DateTime instante:
                escritor.WriteStringValue(instante);
                break;
            case long inteiro:
                escritor.WriteNumberValue(inteiro);
                break;
            case int inteiro:
                escritor.WriteNumberValue(inteiro);
                break;
            case bool booleano:
                escritor.WriteBooleanValue(booleano);
                break;
            default:
                throw new InvalidOperationException($"Tipo sem serialização na trilha: {valor.GetType().Name} ({campo.Propriedade}).");
        }
    }

    #endregion
}
