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

        if (entradas.Any(e => e.State == EntityState.Deleted))
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
        string depois;
        long? versaoDepois;

        if (entrada.State == EntityState.Added)
        {
            acao = AcoesAuditoria.Criar;
            depois = EscreverJson(campos, c => entrada.Property(c.Propriedade).CurrentValue);

            // O default do banco é 1 e só o gatilho de UPDATE soma.
            versaoDepois = 1;
        }
        else
        {
            // Só os campos da lista branca que de fato mudaram: o resto (atualizada_em, versão...) é descartado.
            var alterados = campos.Where(c => Alterou(entrada.Property(c.Propriedade))).ToList();
            acao = DerivarAcao(entrada);
            antes = EscreverJson(alterados, c => entrada.Property(c.Propriedade).OriginalValue);
            depois = EscreverJson(alterados, c => entrada.Property(c.Propriedade).CurrentValue);
            versaoDepois = entrada.Metadata.FindProperty(NomeDaVersao) is not null
                ? (long?)entrada.Property(NomeDaVersao).OriginalValue + 1
                : null;
        }

        return RegistroAuditoria.Criar(
            empresaId,
            entrada.Entity is Obra obra ? obra.Id : null,
            usuarioId,
            entrada.Metadata.GetTableName() ?? throw new InvalidOperationException($"{tipo.Name} sem tabela."),
            entrada.Entity.Id,
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

    // Arquivar e restaurar são só a troca de arquivada_em entre nulo e valor (o domínio garante que nada mais muda).
    private static string DerivarAcao(EntityEntry<IAuditavel> entrada)
    {
        if (entrada.Entity is Obra)
        {
            var arquivamento = entrada.Property(nameof(Obra.ArquivadaEm));
            if (arquivamento.IsModified)
            {
                if (arquivamento.OriginalValue is null && arquivamento.CurrentValue is not null)
                {
                    return AcoesAuditoria.Arquivar;
                }

                if (arquivamento.OriginalValue is not null && arquivamento.CurrentValue is null)
                {
                    return AcoesAuditoria.Restaurar;
                }
            }
        }

        return AcoesAuditoria.Alterar;
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
