namespace CronoAI.Api.Testes.Infra;

/// <summary>Destino de escrita que guarda o que recebeu e lança <see cref="IOException"/> na N-ésima escrita (conexão que cai no meio de um arquivo).</summary>
public sealed class FluxoQueFalhaNaEscritaStream : Stream
{
    #region Campos

    private readonly int _escritaQueFalha;
    private int _escritas;

    #endregion

    #region Construtor

    public FluxoQueFalhaNaEscritaStream(int escritaQueFalha)
    {
        _escritaQueFalha = escritaQueFalha;
    }

    #endregion

    #region Propriedades

    public MemoryStream Conteudo { get; } = new();

    public override bool CanRead => false;

    public override bool CanSeek => false;

    public override bool CanWrite => true;

    public override long Length => Conteudo.Length;

    public override long Position
    {
        get => Conteudo.Position;
        set => throw new NotSupportedException();
    }

    #endregion

    #region Métodos públicos

    public override ValueTask WriteAsync(ReadOnlyMemory<byte> buffer, CancellationToken cancellationToken = default)
    {
        if (++_escritas >= _escritaQueFalha)
        {
            throw new IOException("A conexão caiu no meio do arquivo (simulado).");
        }

        return Conteudo.WriteAsync(buffer, cancellationToken);
    }

    public override Task WriteAsync(byte[] buffer, int offset, int count, CancellationToken cancellationToken) =>
        WriteAsync(buffer.AsMemory(offset, count), cancellationToken).AsTask();

    public override void Write(byte[] buffer, int offset, int count) => WriteAsync(buffer.AsMemory(offset, count)).AsTask().GetAwaiter().GetResult();

    public override void Flush()
    {
    }

    public override Task FlushAsync(CancellationToken cancellationToken) => Task.CompletedTask;

    public override int Read(byte[] buffer, int offset, int count) => throw new NotSupportedException();

    public override long Seek(long offset, SeekOrigin origin) => throw new NotSupportedException();

    public override void SetLength(long value) => throw new NotSupportedException();

    #endregion

    #region Métodos protegidos

    protected override void Dispose(bool disposing)
    {
        if (disposing)
        {
            Conteudo.Dispose();
        }

        base.Dispose(disposing);
    }

    #endregion
}
