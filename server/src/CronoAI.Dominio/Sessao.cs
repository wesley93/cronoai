using System.Security.Cryptography;

namespace CronoAI.Dominio;

/// <summary>
/// Sessão revogável no servidor. O id é um uuid v4 gerado por CSPRNG: é identificador de segurança, exceção
/// à regra do uuid v7 (que carrega o instante). A inatividade fica só no ticket do cookie; aqui vão o prazo
/// absoluto e o encerramento.
/// </summary>
public sealed class Sessao
{
    #region Construtor

    // Usado pelo EF Core na materialização.
    private Sessao()
    {
    }

    private Sessao(Guid id, Guid usuarioId, DateTime criadaEm, DateTime expiraEm)
    {
        Id = id;
        UsuarioId = usuarioId;
        CriadaEm = criadaEm;
        ExpiraEm = expiraEm;
    }

    #endregion

    #region Propriedades

    public Guid Id { get; private set; }

    public Guid UsuarioId { get; private set; }

    /// <summary>Empresa ativa; nula até o usuário escolher. O banco garante que é uma empresa do usuário.</summary>
    public Guid? EmpresaAtivaId { get; private set; }

    public DateTime CriadaEm { get; private set; }

    public DateTime ExpiraEm { get; private set; }

    public DateTime? EncerradaEm { get; private set; }

    #endregion

    #region Métodos públicos

    /// <summary>Cria a sessão recebendo os instantes (do <c>TimeProvider</c>), sem ler relógio aqui.</summary>
    public static Sessao Criar(Guid usuarioId, DateTime criadaEmUtc, DateTime expiraEmUtc, Guid? empresaAtivaId = null)
    {
        Validacao.Utc(criadaEmUtc, nameof(criadaEmUtc));
        Validacao.Utc(expiraEmUtc, nameof(expiraEmUtc));
        if (expiraEmUtc <= criadaEmUtc)
        {
            throw new ArgumentException("A expiração precisa ser posterior à criação.", nameof(expiraEmUtc));
        }

        var sessao = new Sessao(GerarId(), usuarioId, criadaEmUtc, expiraEmUtc)
        {
            EmpresaAtivaId = empresaAtivaId,
        };
        return sessao;
    }

    /// <summary>uuid v4 (RFC 9562) a partir de 16 bytes do <see cref="RandomNumberGenerator"/>.</summary>
    public static Guid GerarId()
    {
        Span<byte> bytes = stackalloc byte[16];
        RandomNumberGenerator.Fill(bytes);
        bytes[6] = (byte)((bytes[6] & 0x0F) | 0x40); // versão 4
        bytes[8] = (byte)((bytes[8] & 0x3F) | 0x80); // variante RFC 9562
        return new Guid(bytes, bigEndian: true);
    }

    #endregion
}
