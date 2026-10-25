using CronoAI.Dados;
using Microsoft.EntityFrameworkCore;
using Npgsql;

namespace CronoAI.Api.Testes.Infra;

/// <summary>Leituras e ajustes diretos no banco de teste, SEMPRE como <c>cronoai_app</c> (e sob RLS quando couber).</summary>
public static class ConsultaBanco
{
    #region Métodos públicos

    public static async Task<int> ContarUsuariosAsync(BancoPostgresFixture banco, string emissor, string sujeito)
    {
        await using var contexto = banco.FabricaApp.Criar(ContextoSessaoBanco.Vazio);
        var contagens = await contexto.Database
            .SqlQuery<int>($"SELECT count(*)::int AS \"Value\" FROM cronoai.usuario WHERE emissor = {emissor} AND sujeito = {sujeito}")
            .ToListAsync(TestContext.Current.CancellationToken);
        return contagens.Single();
    }

    public static async Task<Guid?> ObterUsuarioIdAsync(BancoPostgresFixture banco, string emissor, string sujeito)
    {
        await using var contexto = banco.FabricaApp.Criar(ContextoSessaoBanco.Vazio);
        var ids = await contexto.Database
            .SqlQuery<Guid>($"SELECT id AS \"Value\" FROM cronoai.usuario WHERE emissor = {emissor} AND sujeito = {sujeito}")
            .ToListAsync(TestContext.Current.CancellationToken);
        return ids.Count == 0 ? null : ids[0];
    }

    /// <summary>Sessões do usuário (lidas com o contexto dele: o RLS só mostra as próprias).</summary>
    public static async Task<int> ContarSessoesAsync(BancoPostgresFixture banco, Guid usuarioId)
    {
        await using var contexto = banco.FabricaApp.Criar(ContextoSessaoBanco.DoUsuario(usuarioId));
        var contagens = await contexto.Database
            .SqlQuery<int>($"SELECT count(*)::int AS \"Value\" FROM cronoai.sessao WHERE usuario_id = {usuarioId}")
            .ToListAsync(TestContext.Current.CancellationToken);
        return contagens.Single();
    }

    /// <summary>Sessões ainda abertas (sem <c>encerrada_em</c>) do usuário.</summary>
    public static async Task<int> ContarSessoesAbertasAsync(BancoPostgresFixture banco, Guid usuarioId)
    {
        await using var contexto = banco.FabricaApp.Criar(ContextoSessaoBanco.DoUsuario(usuarioId));
        var contagens = await contexto.Database
            .SqlQuery<int>($"SELECT count(*)::int AS \"Value\" FROM cronoai.sessao WHERE usuario_id = {usuarioId} AND encerrada_em IS NULL")
            .ToListAsync(TestContext.Current.CancellationToken);
        return contagens.Single();
    }

    /// <summary>Marca o usuário como desativado (quem administra faria; o login nunca o faz).</summary>
    public static async Task DesativarUsuarioAsync(BancoPostgresFixture banco, Guid usuarioId, DateTime quando)
    {
        await using var contexto = banco.FabricaApp.Criar(ContextoSessaoBanco.Vazio);
        await contexto.Database.ExecuteSqlAsync(
            $"UPDATE cronoai.usuario SET desativado_em = {quando} WHERE id = {usuarioId}",
            TestContext.Current.CancellationToken);
    }

    public static async Task<DateTime?> LerDesativadoEmAsync(BancoPostgresFixture banco, Guid usuarioId)
    {
        await using var conexao = new NpgsqlConnection(banco.StringConexaoApp);
        await conexao.OpenAsync(TestContext.Current.CancellationToken);
        await using var comando = new NpgsqlCommand("SELECT desativado_em FROM cronoai.usuario WHERE id = @id", conexao);
        comando.Parameters.AddWithValue("id", usuarioId);
        var valor = await comando.ExecuteScalarAsync(TestContext.Current.CancellationToken);
        return valor is DateTime data ? data : null;
    }

    #endregion
}
