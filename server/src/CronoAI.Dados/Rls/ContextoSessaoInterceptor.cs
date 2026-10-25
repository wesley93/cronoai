using System.Data.Common;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;

namespace CronoAI.Dados.Rls;

/// <summary>
/// Em TODA abertura de conexão do EF, sobrescreve as duas variáveis de sessão que as políticas de RLS leem
/// (<c>app.usuario_id</c> e <c>app.empresa_id</c>), inclusive com texto vazio quando não há contexto. Assim uma
/// conexão reciclada pelo pool nunca carrega o valor do dono anterior, mesmo que o reset do Npgsql falhe ou
/// esteja desligado: o reset (<c>DISCARD ALL</c>) é a segunda rede, não a única (ADR 00006).
/// Nível de sessão (<c>set_config(..., false)</c>) porque leituras do EF não abrem transação; nomes são
/// constantes e os valores vão como PARÂMETROS. Singleton e sem estado.
/// </summary>
public sealed class ContextoSessaoInterceptor : DbConnectionInterceptor
{
    #region Campos

    private const string Comando = "SELECT set_config(@nu, @vu, false), set_config(@ne, @ve, false)";

    #endregion

    #region Propriedades

    /// <summary>Instância única (o interceptor não guarda estado).</summary>
    public static ContextoSessaoInterceptor Instancia { get; } = new();

    #endregion

    #region Métodos públicos

    public override void ConnectionOpened(DbConnection connection, ConnectionEndEventData eventData)
    {
        using var comando = CriarComando(connection, eventData.Context);
        comando.ExecuteNonQuery();
    }

    public override async Task ConnectionOpenedAsync(
        DbConnection connection,
        ConnectionEndEventData eventData,
        CancellationToken cancellationToken = default)
    {
        await using var comando = CriarComando(connection, eventData.Context);
        await comando.ExecuteNonQueryAsync(cancellationToken);
    }

    #endregion

    #region Métodos privados

    private static DbCommand CriarComando(DbConnection conexao, DbContext? contexto)
    {
        // Contexto ausente (conexão que não veio de um CronoDbContext): sobrescreve com vazio, nunca deixa o valor antigo.
        var banco = (contexto as CronoDbContext)?.ContextoBanco ?? ContextoSessaoBanco.Vazio;

        var comando = conexao.CreateCommand();
        comando.CommandText = Comando;
        Adicionar(comando, "@nu", PapeisBanco.VariavelUsuario);
        Adicionar(comando, "@vu", Texto(banco.UsuarioId));
        Adicionar(comando, "@ne", PapeisBanco.VariavelEmpresa);
        Adicionar(comando, "@ve", Texto(banco.EmpresaId));
        return comando;
    }

    // Guid em minúsculas (formato "D") ou vazio.
    private static string Texto(Guid? valor) => valor?.ToString("D") ?? "";

    private static void Adicionar(DbCommand comando, string nome, string valor)
    {
        var parametro = comando.CreateParameter();
        parametro.ParameterName = nome;
        parametro.Value = valor;
        comando.Parameters.Add(parametro);
    }

    #endregion
}
