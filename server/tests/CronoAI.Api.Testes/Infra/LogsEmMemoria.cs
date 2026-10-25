using System.Collections.Concurrent;
using Microsoft.Extensions.Logging;

namespace CronoAI.Api.Testes.Infra;

/// <summary>Provedor de log em memória: guarda mensagem e exceção de tudo o que o aplicativo registra.</summary>
public sealed class LogsEmMemoria : ILoggerProvider
{
    #region Campos

    private readonly ConcurrentQueue<string> _linhas = new();

    #endregion

    #region Propriedades

    public IReadOnlyCollection<string> Linhas => _linhas.ToArray();

    public string Tudo => string.Join('\n', _linhas);

    #endregion

    #region Métodos públicos

    public ILogger CreateLogger(string categoryName) => new Registrador(categoryName, _linhas);

    public void Dispose()
    {
    }

    #endregion

    #region Tipos auxiliares

    private sealed class Registrador : ILogger
    {
        private readonly string _categoria;
        private readonly ConcurrentQueue<string> _linhas;

        public Registrador(string categoria, ConcurrentQueue<string> linhas)
        {
            _categoria = categoria;
            _linhas = linhas;
        }

        public IDisposable? BeginScope<TState>(TState state)
            where TState : notnull => null;

        public bool IsEnabled(LogLevel logLevel) => true;

        public void Log<TState>(LogLevel logLevel, EventId eventId, TState state, Exception? exception, Func<TState, Exception?, string> formatter)
        {
            var texto = $"{_categoria} [{logLevel}] {formatter(state, exception)}";
            if (exception is not null)
            {
                texto += "\n" + exception;
            }

            _linhas.Enqueue(texto);
        }
    }

    #endregion
}
