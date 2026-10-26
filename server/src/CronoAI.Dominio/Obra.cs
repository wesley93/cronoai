using System.Text.RegularExpressions;

namespace CronoAI.Dominio;

/// <summary>
/// Obra da empresa (ciclo 00013). Aggregate raiz dos ciclos seguintes. "Apagar" é ARQUIVAR (<see cref="ArquivadaEm"/>):
/// a trilha de auditoria referencia a obra e é imutável. <see cref="Versao"/> é incrementada por gatilho do banco e
/// serve de token de concorrência otimista (ADR 00009): o domínio nunca a calcula.
/// </summary>
public sealed partial class Obra : IDadoDeEmpresa, IArquivavel
{
    #region Campos

    public const int TamanhoMaximoNome = 200;

    #endregion

    #region Construtor

    // Usado pelo EF Core na materialização.
    private Obra()
    {
    }

    private Obra(Guid id, Guid empresaId, DadosObra dados, DateTime criadaEm)
    {
        Id = id;
        EmpresaId = empresaId;
        CriadaEm = criadaEm;
        AtualizadaEm = criadaEm;
        Aplicar(Validar(dados));
    }

    #endregion

    #region Propriedades

    public Guid Id { get; private set; }

    public Guid EmpresaId { get; private set; }

    public string Nome { get; private set; } = "";

    public string Uf { get; private set; } = "";

    public string MunicipioIbge { get; private set; } = "";

    public Guid? ResponsavelId { get; private set; }

    public DateOnly? DataStatus { get; private set; }

    public string? SinapiUf { get; private set; }

    public string? SinapiRegime { get; private set; }

    public DateOnly? SinapiDataBase { get; private set; }

    /// <summary>Objeto JSON opaco (<c>jsonb</c>): o servidor guarda e devolve sem interpretar.</summary>
    public string OpcoesCronograma { get; private set; } = "{}";

    /// <summary>
    /// Versão da linha: nasce 1 (default do banco) e o gatilho soma 1 em todo <c>UPDATE</c>, ignorando o valor enviado.
    /// Fica 0 até o primeiro <c>SaveChanges</c> da obra nova, que a lê de volta.
    /// </summary>
    public long Versao { get; private set; }

    public DateTime CriadaEm { get; private set; }

    public DateTime AtualizadaEm { get; private set; }

    public DateTime? ArquivadaEm { get; private set; }

    public bool EstaArquivada => ArquivadaEm is not null;

    // A obra tem Id próprio: ele é o entidade_id da trilha.
    Guid IAuditavel.EntidadeId => Id;

    #endregion

    #region Métodos públicos

    /// <summary>Cria a obra com id uuid v7. Passe <paramref name="id"/> só para ids fixos fictícios (semente e testes).</summary>
    public static Obra Criar(Guid empresaId, DadosObra dados, DateTime criadaEmUtc, Guid? id = null)
    {
        ArgumentNullException.ThrowIfNull(dados);
        Validacao.Utc(criadaEmUtc, nameof(criadaEmUtc));
        if (empresaId == Guid.Empty)
        {
            throw new ArgumentException("A empresa é obrigatória.", nameof(empresaId));
        }

        return new Obra(id ?? Guid.CreateVersion7(), empresaId, dados, criadaEmUtc);
    }

    /// <summary>
    /// Substitui os campos editáveis. Devolve <c>false</c> (e não toca em nada, nem em <see cref="AtualizadaEm"/>) se nada
    /// mudou: assim o EF não emite <c>UPDATE</c>, a versão não anda e nada é auditado.
    /// </summary>
    public bool Alterar(DadosObra dados, DateTime instanteUtc)
    {
        ArgumentNullException.ThrowIfNull(dados);
        ValidarInstante(instanteUtc, nameof(instanteUtc));
        var novos = Validar(dados);
        if (ArquivadaEm is not null)
        {
            throw new InvalidOperationException("A obra arquivada é somente leitura.");
        }

        if (Iguais(novos))
        {
            return false;
        }

        Aplicar(novos);
        AtualizadaEm = instanteUtc;
        return true;
    }

    /// <summary>Arquiva a obra: só <see cref="ArquivadaEm"/> e <see cref="AtualizadaEm"/> mudam.</summary>
    public void Arquivar(DateTime instanteUtc)
    {
        ValidarInstante(instanteUtc, nameof(instanteUtc));
        if (ArquivadaEm is not null)
        {
            throw new InvalidOperationException("A obra já está arquivada.");
        }

        ArquivadaEm = instanteUtc;
        AtualizadaEm = instanteUtc;
    }

    /// <summary>Restaura a obra arquivada: só <see cref="ArquivadaEm"/> (volta a nulo) e <see cref="AtualizadaEm"/> mudam.</summary>
    public void Restaurar(DateTime instanteUtc)
    {
        ValidarInstante(instanteUtc, nameof(instanteUtc));
        if (ArquivadaEm is null)
        {
            throw new InvalidOperationException("A obra não está arquivada.");
        }

        ArquivadaEm = null;
        AtualizadaEm = instanteUtc;
    }

    /// <summary>
    /// Chaves do contrato (camelCase) dos campos de CADASTRO que <paramref name="novos"/> mudam em relação à obra atual: nome, UF,
    /// município, responsável e SINAPI (os três campos do SINAPI contam como <c>sinapi</c>). Compara os dados já validados e
    /// normalizados (<see cref="Validar"/>): o nome com espaços nas pontas igual ao atual não conta como mudança. Não inclui
    /// <c>dataStatus</c> nem <c>opcoesCronograma</c>, que fazem parte da edição comum.
    /// </summary>
    public IReadOnlyList<string> CamposDeCadastroAlterados(DadosObra novos)
    {
        ArgumentNullException.ThrowIfNull(novos);
        var alterados = new List<string>();
        if (!string.Equals(Nome, novos.Nome, StringComparison.Ordinal))
        {
            alterados.Add("nome");
        }

        if (!string.Equals(Uf, novos.Uf, StringComparison.Ordinal))
        {
            alterados.Add("uf");
        }

        if (!string.Equals(MunicipioIbge, novos.MunicipioIbge, StringComparison.Ordinal))
        {
            alterados.Add("municipioIbge");
        }

        if (ResponsavelId != novos.ResponsavelId)
        {
            alterados.Add("responsavelId");
        }

        if (!string.Equals(SinapiUf, novos.SinapiUf, StringComparison.Ordinal)
            || !string.Equals(SinapiRegime, novos.SinapiRegime, StringComparison.Ordinal)
            || SinapiDataBase != novos.SinapiDataBase)
        {
            alterados.Add("sinapi");
        }

        return alterados;
    }

    /// <summary>
    /// Valida e normaliza os campos (nome aparado) sem criar nada. Usado pela API para devolver todos os erros de
    /// validação do domínio antes de tocar no banco.
    /// </summary>
    public static DadosObra Validar(DadosObra dados)
    {
        ArgumentNullException.ThrowIfNull(dados);

        var nome = dados.Nome?.Trim() ?? "";
        Validacao.TextoEntre(nome, 1, TamanhoMaximoNome, "nome");
        if (nome.Any(char.IsControl))
        {
            // Inclui \0 (o PostgreSQL recusa NUL em text), tabulação e quebras de linha.
            throw Validacao.Campo("nome", "O nome não pode ter caracteres de controle.");
        }

        if (dados.Uf is null || !SiglaUf().IsMatch(dados.Uf))
        {
            throw Validacao.Campo("uf", "A UF deve ter 2 letras maiúsculas.");
        }

        CodigoMunicipioIbge.Validar(dados.MunicipioIbge, "municipioIbge");

        if (dados.ResponsavelId == Guid.Empty)
        {
            throw Validacao.Campo("responsavelId", "O responsável é inválido.");
        }

        ValidarSinapi(dados);
        var opcoes = JsonOpcoes.Validar(dados.OpcoesCronograma, "opcoesCronograma");
        return dados with { Nome = nome, OpcoesCronograma = opcoes };
    }

    #endregion

    #region Métodos privados

    [GeneratedRegex("^[A-Z]{2}$")]
    private static partial Regex SiglaUf();

    // Tudo ou nada: UF, regime e data-base juntos ou nenhum (ck_obra_sinapi_tudo_ou_nada).
    private static void ValidarSinapi(DadosObra dados)
    {
        var preenchidos = new[] { dados.SinapiUf is not null, dados.SinapiRegime is not null, dados.SinapiDataBase is not null };
        if (preenchidos.Any(p => p) && !preenchidos.All(p => p))
        {
            throw Validacao.Campo("sinapi", "Informe UF, regime e data-base do SINAPI juntos, ou nenhum deles.");
        }

        if (dados.SinapiUf is not null && !SiglaUf().IsMatch(dados.SinapiUf))
        {
            throw Validacao.Campo("sinapiUf", "A UF do SINAPI deve ter 2 letras maiúsculas.");
        }

        if (dados.SinapiRegime is not null && !RegimesSinapi.EhValido(dados.SinapiRegime))
        {
            throw Validacao.Campo("sinapiRegime", "Regime do SINAPI inválido.");
        }

        if (dados.SinapiDataBase is { Day: not 1 })
        {
            throw Validacao.Campo("sinapiDataBase", "A data-base do SINAPI é sempre o dia 1 do mês.");
        }
    }

    // O instante nunca pode ser anterior à criação (ck_obra_atualizada_apos_criada e ck_obra_arquivada_apos_criada).
    private void ValidarInstante(DateTime instanteUtc, string parametro)
    {
        Validacao.Utc(instanteUtc, parametro);
        if (instanteUtc < CriadaEm)
        {
            throw new ArgumentException("O instante não pode ser anterior à criação da obra.", parametro);
        }
    }

    private bool Iguais(DadosObra novos) =>
        string.Equals(Nome, novos.Nome, StringComparison.Ordinal)
        && string.Equals(Uf, novos.Uf, StringComparison.Ordinal)
        && string.Equals(MunicipioIbge, novos.MunicipioIbge, StringComparison.Ordinal)
        && ResponsavelId == novos.ResponsavelId
        && DataStatus == novos.DataStatus
        && string.Equals(SinapiUf, novos.SinapiUf, StringComparison.Ordinal)
        && string.Equals(SinapiRegime, novos.SinapiRegime, StringComparison.Ordinal)
        && SinapiDataBase == novos.SinapiDataBase
        && JsonOpcoes.Iguais(OpcoesCronograma, novos.OpcoesCronograma);

    // Recebe os dados JÁ validados por Validar.
    private void Aplicar(DadosObra validados)
    {
        Nome = validados.Nome;
        Uf = validados.Uf;
        MunicipioIbge = validados.MunicipioIbge;
        ResponsavelId = validados.ResponsavelId;
        DataStatus = validados.DataStatus;
        SinapiUf = validados.SinapiUf;
        SinapiRegime = validados.SinapiRegime;
        SinapiDataBase = validados.SinapiDataBase;

        // Mantém o texto atual se o novo for semanticamente igual: o jsonb reordena chaves, e o EF veria "mudança".
        if (string.IsNullOrEmpty(OpcoesCronograma) || !JsonOpcoes.Iguais(OpcoesCronograma, validados.OpcoesCronograma))
        {
            OpcoesCronograma = validados.OpcoesCronograma;
        }
    }

    #endregion
}
