namespace CronoAI.Api.Borda;

/// <summary>
/// Envolve o corpo da requisição e lança <see cref="BadHttpRequestException"/> 413 quando a leitura passa do limite. Cobre o
/// corpo sem <c>Content-Length</c> (chunked) em qualquer servidor, sem depender de o servidor honrar o limite do endpoint.
/// Somente leitura e sem retrocesso.
/// </summary>
internal sealed class CorpoLimitadoStream : Stream
{
    #region Campos

    private readonly Stream _origem;
    private readonly long _maximo;
    private long _lidos;

    #endregion

    #region Construtor

    public CorpoLimitadoStream(Stream origem, long maximo)
    {
        _origem = origem;
        _maximo = maximo;
    }

    #endregion

    #region Propriedades

    public override bool CanRead => true;

    public override bool CanSeek => false;

    public override bool CanWrite => false;

    public override long Length => throw new NotSupportedException();

    public override long Position
    {
        get => throw new NotSupportedException();
        set => throw new NotSupportedException();
    }

    #endregion

    #region Métodos públicos

    public override int Read(byte[] buffer, int offset, int count) => Contar(_origem.Read(buffer, offset, count));

    public override int Read(Span<byte> buffer) => Contar(_origem.Read(buffer));

    public override async Task<int> ReadAsync(byte[] buffer, int offset, int count, CancellationToken cancellationToken) =>
        Contar(await _origem.ReadAsync(buffer.AsMemory(offset, count), cancellationToken));

    public override async ValueTask<int> ReadAsync(Memory<byte> buffer, CancellationToken cancellationToken = default) =>
        Contar(await _origem.ReadAsync(buffer, cancellationToken));

    public override void Flush()
    {
    }

    public override long Seek(long offset, SeekOrigin origin) => throw new NotSupportedException();

    public override void SetLength(long value) => throw new NotSupportedException();

    public override void Write(byte[] buffer, int offset, int count) => throw new NotSupportedException();

    #endregion

    #region Métodos privados

    private int Contar(int lidos)
    {
        _lidos += lidos;
        if (_lidos > _maximo)
        {
            throw new BadHttpRequestException("O corpo da requisição excede o limite permitido.", StatusCodes.Status413PayloadTooLarge);
        }

        return lidos;
    }

    #endregion
}
