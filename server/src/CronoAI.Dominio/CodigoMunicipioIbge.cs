namespace CronoAI.Dominio;

/// <summary>
/// Código de município do IBGE: 7 dígitos ASCII, os 2 primeiros são o código da UF e o 7º é o dígito verificador
/// (módulo 10, pesos 1,2,1,2,1,2 sobre os 6 primeiros; soma dos ALGARISMOS de cada produto;
/// <c>DV = (10 − soma mod 10) mod 10</c>). Barra erro de digitação sem a lista oficial, que ainda não foi carregada.
/// A fórmula foi conferida à mão com casos conhecidos e fixada em teste; a conferência contra a lista oficial é
/// pendência do usuário (ciclo 00013).
/// </summary>
public static class CodigoMunicipioIbge
{
    #region Campos

    public const int Tamanho = 7;

    private static readonly int[] _pesos = [1, 2, 1, 2, 1, 2];

    // Códigos oficiais que não seguem o DV, se a lista do IBGE confirmar que existem (risco registrado no plano).
    // Vazio de propósito: entra aqui no ciclo da carga, nunca por palpite.
    private static readonly HashSet<string> _excecoesDoDigito = new(StringComparer.Ordinal);

    #endregion

    #region Métodos públicos

    /// <summary>Formato correto (7 algarismos de 0 a 9) e dígito verificador conferido (ou código na lista de exceções).</summary>
    public static bool EhValido(string? codigo)
    {
        if (!TemFormato(codigo))
        {
            return false;
        }

        return _excecoesDoDigito.Contains(codigo!) || CalcularDigitoVerificador(codigo![..6]) == codigo[6] - '0';
    }

    /// <summary>Lança <see cref="ArgumentException"/> (com o nome do campo) se o código não for válido.</summary>
    public static void Validar(string? codigo, string parametro)
    {
        if (!TemFormato(codigo))
        {
            throw new ArgumentException("O código do município deve ter 7 dígitos.", parametro);
        }

        if (!EhValido(codigo))
        {
            throw new ArgumentException("O dígito verificador do código do município não confere.", parametro);
        }
    }

    /// <summary>Dígito verificador dos 6 primeiros algarismos.</summary>
    public static int CalcularDigitoVerificador(string seisPrimeiros)
    {
        ArgumentNullException.ThrowIfNull(seisPrimeiros);
        if (seisPrimeiros.Length != 6 || !seisPrimeiros.All(EhAlgarismo))
        {
            throw new ArgumentException("São necessários exatamente 6 algarismos.", nameof(seisPrimeiros));
        }

        var soma = 0;
        for (var i = 0; i < 6; i++)
        {
            var produto = (seisPrimeiros[i] - '0') * _pesos[i];

            // Soma dos algarismos do produto (produto de 2 dígitos: 10 a 18).
            soma += (produto / 10) + (produto % 10);
        }

        return (10 - (soma % 10)) % 10;
    }

    /// <summary>Código da UF (2 primeiros dígitos). Exige formato válido.</summary>
    public static int PrefixoUf(string codigo)
    {
        if (!TemFormato(codigo))
        {
            throw new ArgumentException("O código do município deve ter 7 dígitos.", nameof(codigo));
        }

        return ((codigo[0] - '0') * 10) + (codigo[1] - '0');
    }

    #endregion

    #region Métodos privados

    // char.IsDigit aceitaria algarismos de outros alfabetos: só '0' a '9'.
    private static bool EhAlgarismo(char c) => c is >= '0' and <= '9';

    private static bool TemFormato(string? codigo) => codigo is { Length: Tamanho } && codigo.All(EhAlgarismo);

    #endregion
}
