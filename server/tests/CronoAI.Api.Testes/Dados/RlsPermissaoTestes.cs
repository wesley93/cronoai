using CronoAI.Api.Testes.Infra;
using CronoAI.Dados;
using Microsoft.EntityFrameworkCore;
using Npgsql;

namespace CronoAI.Api.Testes.Dados;

/// <summary>
/// RLS por obra, como <c>cronoai_app</c> (plano 00014, seção 11.2). Os negativos de UPDATE e DELETE rodam SEM <c>WHERE</c>, SEM
/// <c>RETURNING</c> e, no UPDATE, com <c>SET</c> CONSTANTE: com WHERE, RETURNING ou <c>SET x = x</c> a política de SELECT também
/// se aplica e mascararia um <c>USING</c> ou <c>WITH CHECK</c> afrouxado. Cada negativo de política de escrita tem um irmão
/// <c>*_mutacao</c> (controle por mutação, <see cref="ScriptRls"/>): numa transação do superusuário a política é afrouxada, o
/// mesmo DML roda e AFETA as linhas proibidas, provando que o negativo depende da política.
/// </summary>
[Collection(ColecaoBanco.Nome)]
[Trait("Categoria", "Integracao")]
public sealed class RlsPermissaoTestes
{
    #region Campos

    private static readonly DateTime _futuro = new(2030, 1, 1, 0, 0, 0, DateTimeKind.Utc);

    // Uma leitura por tabela do schema (texto constante: sem SQL montado).
    private static readonly string[] _leituras =
    [
        "SELECT count(*)::int AS \"Value\" FROM cronoai.empresa",
        "SELECT count(*)::int AS \"Value\" FROM cronoai.membro_empresa",
        "SELECT count(*)::int AS \"Value\" FROM cronoai.sessao",
        "SELECT count(*)::int AS \"Value\" FROM cronoai.obra",
        "SELECT count(*)::int AS \"Value\" FROM cronoai.auditoria",
        "SELECT count(*)::int AS \"Value\" FROM cronoai.acesso_obra",
        "SELECT count(*)::int AS \"Value\" FROM cronoai.frente",
        "SELECT count(*)::int AS \"Value\" FROM cronoai.acesso_frente",
        "SELECT count(*)::int AS \"Value\" FROM cronoai.carteira",
        "SELECT count(*)::int AS \"Value\" FROM cronoai.carteira_obra",
        "SELECT count(*)::int AS \"Value\" FROM cronoai.acesso_carteira",
        "SELECT count(*)::int AS \"Value\" FROM cronoai.usuario",
        "SELECT count(*)::int AS \"Value\" FROM cronoai.uf_referencia",
        "SELECT count(*)::int AS \"Value\" FROM cronoai.municipio_referencia",
    ];

    // Escritas SEM EFEITO (WHERE false) em cada tabela com política de escrita: o que interessa é a expansão das políticas.
    private static readonly string[] _escritasSemEfeito =
    [
        "UPDATE cronoai.membro_empresa SET atualizado_em = '2030-01-01T00:00:00Z' WHERE false",
        "UPDATE cronoai.obra SET atualizada_em = '2030-01-01T00:00:00Z' WHERE false",
        "UPDATE cronoai.frente SET atualizada_em = '2030-01-01T00:00:00Z' WHERE false",
        "UPDATE cronoai.carteira SET atualizada_em = '2030-01-01T00:00:00Z' WHERE false",
        "UPDATE cronoai.sessao SET encerrada_em = '2030-01-01T00:00:00Z' WHERE false",
        "DELETE FROM cronoai.acesso_obra WHERE false",
        "DELETE FROM cronoai.acesso_frente WHERE false",
        "DELETE FROM cronoai.carteira_obra WHERE false",
        "DELETE FROM cronoai.acesso_carteira WHERE false",
        "DELETE FROM cronoai.sessao WHERE false",
    ];

    private readonly BancoPostgresFixture _banco;
    private readonly DadosTeste _dados;

    #endregion

    #region Construtor

    public RlsPermissaoTestes(BancoPostgresFixture banco)
    {
        _banco = banco;
        _dados = new DadosTeste(banco);
    }

    #endregion

    #region Métodos públicos

    [Fact]
    public async Task Sem_recursao_em_nenhuma_tabela_nem_contexto()
    {
        var c = await CenarioPermissoes.CriarAsync(_dados);
        var contextos = new[]
        {
            new ContextoSessaoBanco(c.A, c.EmpresaX), new ContextoSessaoBanco(c.B, c.EmpresaX), new ContextoSessaoBanco(c.C, c.EmpresaX),
            new ContextoSessaoBanco(c.D, c.EmpresaX), new ContextoSessaoBanco(c.G, c.EmpresaX), new ContextoSessaoBanco(c.R, c.EmpresaX),
            new ContextoSessaoBanco(c.F, c.EmpresaX), new ContextoSessaoBanco(c.Z, c.EmpresaY), ContextoSessaoBanco.Vazio,
            ContextoSessaoBanco.DoUsuario(c.A), ContextoSessaoBanco.DaEmpresa(c.EmpresaX),
        };

        var lidas = 0;
        foreach (var contexto in contextos)
        {
            foreach (var leitura in _leituras)
            {
                await using var banco = _dados.Fabrica.Criar(contexto);
                await banco.Database.SqlQueryRaw<int>(leitura).ToListAsync(TestContext.Current.CancellationToken);
                lidas++;
            }

            foreach (var escrita in _escritasSemEfeito)
            {
                await using var banco = _dados.Fabrica.Criar(contexto);
                try
                {
                    await banco.Database.ExecuteSqlRawAsync(escrita, TestContext.Current.CancellationToken);
                }
                catch (PostgresException erro) when (erro.SqlState == PostgresErrorCodes.InsufficientPrivilege)
                {
                    // Sem privilégio ou recusado pelo gatilho: o que não pode aparecer é a recursão (42P17).
                }
            }
        }

        Assert.Equal(contextos.Length * _leituras.Length, lidas);
    }

    [Fact]
    public async Task Politica_que_cita_a_propria_tabela_dispara_42P17_controle_do_detector()
    {
        // (boot) Prova que o teste acima ENXERGARIA a recursão: uma política de UPDATE de membro_empresa que consulta a própria
        // tabela (o desenho que o parecer do dba propôs e o plano trocou por gatilho) dispara o 42P17. Transação desfeita.
        var (codigo, _, erro) = await _banco.ExecutarScriptComoSuperusuarioAsync(
            """
            BEGIN;
            CREATE POLICY pol_teste_recursao ON cronoai.membro_empresa AS PERMISSIVE FOR UPDATE TO cronoai_app
              USING (EXISTS (SELECT 1 FROM cronoai.membro_empresa x WHERE x.perfil = 'administrador'))
              WITH CHECK (true);
            SET LOCAL ROLE cronoai_app;
            UPDATE cronoai.membro_empresa SET atualizado_em = '2030-01-01T00:00:00Z' WHERE false;
            ROLLBACK;
            """);

        Assert.NotEqual(0, codigo);
        Assert.Contains("42P17", erro, StringComparison.Ordinal);
    }

    [Fact]
    public async Task Obra_visivel_por_escopo()
    {
        var c = await CenarioPermissoes.CriarAsync(_dados);
        var todasDeX = new[] { c.Obra1, c.Obra2, c.Obra3 }.Order().ToList();

        Assert.Equal(todasDeX, await ObrasVisiveisAsync(c.A, c.EmpresaX));
        Assert.Equal([c.Obra1], await ObrasVisiveisAsync(c.B, c.EmpresaX));

        // C é gestor de escopo carteiras: a K tem a obra2; a K2 (arquivada) tem a obra3 e NÃO concede acesso, mesmo atribuída a C.
        Assert.Equal([c.Obra2], await ObrasVisiveisAsync(c.C, c.EmpresaX));
        Assert.Equal(todasDeX, await ObrasVisiveisAsync(c.G, c.EmpresaX));
        Assert.Empty(await ObrasVisiveisAsync(c.D, c.EmpresaX));
        Assert.Empty(await ObrasVisiveisAsync(c.R, c.EmpresaX));
        Assert.Equal([c.Obra1], await ObrasVisiveisAsync(c.F, c.EmpresaX));
        Assert.Equal([c.ObraY], await ObrasVisiveisAsync(c.Z, c.EmpresaY));

        // Sem contexto, só com a empresa e só com o usuário: nada (sem usuário não há alcance; sem empresa não há linha).
        await using (var vazio = _dados.Fabrica.Criar(ContextoSessaoBanco.Vazio))
        {
            Assert.Empty(await DadosTeste.LerIdsAsync(vazio, $"SELECT id AS \"Value\" FROM cronoai.obra"));
        }

        Assert.Empty(await ObrasVisiveisAsync(null, c.EmpresaX));
        Assert.Empty(await ObrasVisiveisAsync(c.A, null));

        // Um usuário de OUTRA empresa com o contexto da empresa X também não vê nada (o vínculo é lido na empresa do contexto).
        Assert.Empty(await ObrasVisiveisAsync(c.Z, c.EmpresaX));

        // Controle negativo (boot): as 4 obras existem; a invisibilidade acima é do RLS.
        Assert.Equal("4", await _banco.ConsultarComoSuperusuarioAsync($"SELECT count(*) FROM cronoai.obra WHERE id IN ('{c.Obra1}', '{c.Obra2}', '{c.Obra3}', '{c.ObraY}')"));
    }

    [Fact]
    public async Task Administrador_removido_nao_ve_obra()
    {
        // Controle do T13: o mesmo administrador vê todas as obras ANTES de ser removido e nenhuma DEPOIS (removido_em IS NULL
        // em toda política). A empresa tem outro administrador, então a remoção é aceita pelo gatilho do último administrador.
        var tecnico = await _dados.CriarUsuarioAsync();
        var empresa = await _dados.CriarEmpresaAsync(comAdministradorTecnico: false);
        await _dados.VincularAsync(empresa, tecnico);
        var admin = await _dados.CriarUsuarioAsync();
        await _dados.VincularAsync(empresa, admin);
        var obra = (await _dados.CriarObraAsync(empresa, tecnico)).Id;

        Assert.Equal([obra], await ObrasVisiveisAsync(admin, empresa));

        await _dados.RemoverMembroAsync(empresa, admin);

        Assert.Empty(await ObrasVisiveisAsync(admin, empresa));
        Assert.Equal([obra], await ObrasVisiveisAsync(tecnico, empresa));
    }

    [Fact]
    public async Task Obra_update_sem_where_respeita_alcance()
    {
        var c = await CenarioPermissoes.CriarAsync(_dados);

        // B (vinculado à obra1): UPDATE SEM WHERE, SEM RETURNING e com SET constante afeta SÓ a obra1.
        await using (var comoB = Como(c.B, c.EmpresaX))
        {
            Assert.Equal(1, await comoB.Database.ExecuteSqlAsync($"UPDATE cronoai.obra SET atualizada_em = {_futuro}", TestContext.Current.CancellationToken));
        }

        Assert.Equal("0", await _banco.ConsultarComoSuperusuarioAsync($"SELECT count(*) FROM cronoai.obra WHERE id IN ('{c.Obra2}', '{c.Obra3}') AND atualizada_em = '2030-01-01T00:00:00Z'"));
        Assert.Equal("1", await _banco.ConsultarComoSuperusuarioAsync($"SELECT count(*) FROM cronoai.obra WHERE id = '{c.Obra1}' AND atualizada_em = '2030-01-01T00:00:00Z'"));

        // Mover a obra de empresa: WITH CHECK (42501).
        await using (var comoB = Como(c.B, c.EmpresaX))
        {
            var erro = await Assert.ThrowsAsync<PostgresException>(() => comoB.Database.ExecuteSqlAsync($"UPDATE cronoai.obra SET empresa_id = {c.EmpresaY}", TestContext.Current.CancellationToken));
            Assert.Equal(PostgresErrorCodes.InsufficientPrivilege, erro.SqlState);
        }

        // Controle negativo: A (todas) afeta as 3.
        await using (var comoA = Como(c.A, c.EmpresaX))
        {
            Assert.Equal(3, await comoA.Database.ExecuteSqlAsync($"UPDATE cronoai.obra SET atualizada_em = {_futuro}", TestContext.Current.CancellationToken));
        }
    }

    [Fact]
    public async Task Obra_update_sem_where_respeita_alcance_mutacao()
    {
        // Mutação: com o USING/WITH CHECK do UPDATE afrouxado, B (que afeta 1) passa a afetar TODAS as obras da tabela.
        var c = await CenarioPermissoes.CriarAsync(_dados);

        var resultado = await ScriptRls.ExecutarAsync(
            _banco,
            c.B,
            c.EmpresaX,
            "UPDATE cronoai.obra SET atualizada_em = '2030-01-01T00:00:00Z'",
            mutacao: "ALTER POLICY pol_obra_update ON cronoai.obra USING (true) WITH CHECK (true)");

        Assert.True(resultado.Afetadas >= 4, resultado.Erro);
    }

    [Fact]
    public async Task Obra_insert_so_escopo_todas()
    {
        var c = await CenarioPermissoes.CriarAsync(_dados);

        // B (vinculadas) e C (carteiras): o escopo não é "todas" → 42501.
        foreach (var usuario in new[] { c.B, c.C })
        {
            await using var contexto = Como(usuario, c.EmpresaX);
            var erro = await Assert.ThrowsAsync<PostgresException>(() => InserirObraAsync(contexto, c.EmpresaX));
            Assert.Equal(PostgresErrorCodes.InsufficientPrivilege, erro.SqlState);
        }

        // A (administrador) e G (gestor com escopo todas): passam, com RETURNING (a política de SELECT vale para a linha nova).
        foreach (var usuario in new[] { c.A, c.G })
        {
            await using var contexto = Como(usuario, c.EmpresaX);
            var criadas = await contexto.Database.SqlQuery<Guid>($"""
                INSERT INTO cronoai.obra (id, empresa_id, nome, uf, municipio_ibge, criada_em, atualizada_em)
                VALUES ({Guid.CreateVersion7()}, {c.EmpresaX}, {"Obra Ficticia " + Guid.NewGuid().ToString("N")}, {"PE"}, {"2699999"}, {DateTime.UtcNow}, {DateTime.UtcNow})
                RETURNING id AS "Value"
                """).ToListAsync(TestContext.Current.CancellationToken);
            Assert.Single(criadas);
        }

        // A com empresa_id de outra empresa: 42501 (a política exige empresa_id = E).
        await using (var comoA = Como(c.A, c.EmpresaX))
        {
            var erro = await Assert.ThrowsAsync<PostgresException>(() => InserirObraAsync(comoA, c.EmpresaY));
            Assert.Equal(PostgresErrorCodes.InsufficientPrivilege, erro.SqlState);
        }
    }

    [Fact]
    public async Task Obra_insert_so_escopo_todas_mutacao()
    {
        // Mutação do WITH CHECK do INSERT: B (escopo vinculadas) passa a conseguir criar obra.
        var c = await CenarioPermissoes.CriarAsync(_dados);
        var id = Guid.CreateVersion7();

        var resultado = await ScriptRls.ExecutarAsync(
            _banco,
            c.B,
            c.EmpresaX,
            $"INSERT INTO cronoai.obra (id, empresa_id, nome, uf, municipio_ibge, criada_em, atualizada_em) VALUES ('{id}', '{c.EmpresaX}', 'Obra Mutacao {id:N}', 'PE', '2699999', now(), now())",
            mutacao: "ALTER POLICY pol_obra_insert ON cronoai.obra WITH CHECK (true)");

        Assert.True(resultado.Afetadas == 1, resultado.Erro);
    }

    [Fact]
    public async Task AcessoObra_leitura_e_escrita()
    {
        var c = await CenarioPermissoes.CriarAsync(_dados);

        // Leitura: B só os próprios; A, C (gestor) e G leem todos os vínculos da empresa (B, R e F).
        Assert.Equal([c.B], await UsuariosDeAcessoObraAsync(c.B, c.EmpresaX));
        var todos = new[] { c.B, c.R, c.F }.Order().ToList();
        foreach (var leitor in new[] { c.A, c.C, c.G })
        {
            Assert.Equal(todos, await UsuariosDeAcessoObraAsync(leitor, c.EmpresaX));
        }

        // B não insere (42501) e DELETE sem WHERE afeta 0 (o USING esconde todas as linhas).
        await using (var comoB = Como(c.B, c.EmpresaX))
        {
            var erro = await Assert.ThrowsAsync<PostgresException>(() => InserirAcessoObraAsync(comoB, c.EmpresaX, c.Obra1, c.D));
            Assert.Equal(PostgresErrorCodes.InsufficientPrivilege, erro.SqlState);
        }

        await using (var comoB = Como(c.B, c.EmpresaX))
        {
            Assert.Equal(0, await comoB.Database.ExecuteSqlAsync($"DELETE FROM cronoai.acesso_obra", TestContext.Current.CancellationToken));
        }

        Assert.Equal("3", await _banco.ConsultarComoSuperusuarioAsync($"SELECT count(*) FROM cronoai.acesso_obra WHERE empresa_id = '{c.EmpresaX}'"));

        // C (gestor de carteiras) concede na obra2 (da carteira K) e NÃO na obra1 nem na obra3 (obra3 só está na carteira arquivada).
        await using (var comoC = Como(c.C, c.EmpresaX))
        {
            await InserirAcessoObraAsync(comoC, c.EmpresaX, c.Obra2, c.D);
        }

        foreach (var obra in new[] { c.Obra1, c.Obra3 })
        {
            await using var comoC = Como(c.C, c.EmpresaX);
            var erro = await Assert.ThrowsAsync<PostgresException>(() => InserirAcessoObraAsync(comoC, c.EmpresaX, obra, c.D));
            Assert.Equal(PostgresErrorCodes.InsufficientPrivilege, erro.SqlState);
        }

        // C apaga SEM WHERE: só os vínculos da obra2 (1); os da obra1 ficam.
        await using (var comoC = Como(c.C, c.EmpresaX))
        {
            Assert.Equal(1, await comoC.Database.ExecuteSqlAsync($"DELETE FROM cronoai.acesso_obra", TestContext.Current.CancellationToken));
        }

        Assert.Equal("3", await _banco.ConsultarComoSuperusuarioAsync($"SELECT count(*) FROM cronoai.acesso_obra WHERE obra_id = '{c.Obra1}'"));
        Assert.Equal("0", await _banco.ConsultarComoSuperusuarioAsync($"SELECT count(*) FROM cronoai.acesso_obra WHERE obra_id = '{c.Obra2}'"));

        // G (gestor de todas) concede na obra1; A apaga um vínculo (1) — controle negativo: o administrador consegue.
        await using (var comoG = Como(c.G, c.EmpresaX))
        {
            await InserirAcessoObraAsync(comoG, c.EmpresaX, c.Obra1, c.D);
        }

        await using (var comoA = Como(c.A, c.EmpresaX))
        {
            Assert.Equal(1, await comoA.Database.ExecuteSqlAsync($"DELETE FROM cronoai.acesso_obra WHERE obra_id = {c.Obra1} AND usuario_id = {c.B}", TestContext.Current.CancellationToken));
        }
    }

    [Fact]
    public async Task AcessoObra_leitura_e_escrita_mutacao()
    {
        // Mutação do USING do DELETE: B, que apagava 0, passa a apagar TODOS os vínculos. O preparo tira os acesso_frente (a FK
        // Restrict impediria apagar o vínculo de quem tem frente) como superusuário, dentro da transação desfeita.
        var c = await CenarioPermissoes.CriarAsync(_dados);

        var resultado = await ScriptRls.ExecutarAsync(
            _banco,
            c.B,
            c.EmpresaX,
            "DELETE FROM cronoai.acesso_obra",
            mutacao: "ALTER POLICY pol_acesso_obra_delete ON cronoai.acesso_obra USING (true)",
            preparo: "DELETE FROM cronoai.acesso_frente");

        Assert.True(resultado.Afetadas >= 3, resultado.Erro);
    }

    [Fact]
    public async Task AcessoFrente_leitura_e_escrita()
    {
        var c = await CenarioPermissoes.CriarAsync(_dados);
        var frente2 = await _dados.CriarFrenteAsync(c.EmpresaX, c.Obra2);
        await _dados.CriarAcessoObraAsync(c.EmpresaX, c.Obra2, c.D);

        // Leitura: B não tem frente (0); A, C e G leem a de F.
        Assert.Empty(await UsuariosDeAcessoFrenteAsync(c.B, c.EmpresaX));
        foreach (var leitor in new[] { c.A, c.C, c.G })
        {
            Assert.Equal([c.F], await UsuariosDeAcessoFrenteAsync(leitor, c.EmpresaX));
        }

        // B não insere (42501) e DELETE sem WHERE afeta 0.
        await using (var comoB = Como(c.B, c.EmpresaX))
        {
            var erro = await Assert.ThrowsAsync<PostgresException>(() => InserirAcessoFrenteAsync(comoB, c.EmpresaX, c.Obra1, c.Frente1, c.R));
            Assert.Equal(PostgresErrorCodes.InsufficientPrivilege, erro.SqlState);
        }

        await using (var comoB = Como(c.B, c.EmpresaX))
        {
            Assert.Equal(0, await comoB.Database.ExecuteSqlAsync($"DELETE FROM cronoai.acesso_frente", TestContext.Current.CancellationToken));
        }

        // C concede na obra2 (alcance) e não na obra1.
        await using (var comoC = Como(c.C, c.EmpresaX))
        {
            await InserirAcessoFrenteAsync(comoC, c.EmpresaX, c.Obra2, frente2, c.D);
        }

        await using (var comoC = Como(c.C, c.EmpresaX))
        {
            var erro = await Assert.ThrowsAsync<PostgresException>(() => InserirAcessoFrenteAsync(comoC, c.EmpresaX, c.Obra1, c.Frente1, c.R));
            Assert.Equal(PostgresErrorCodes.InsufficientPrivilege, erro.SqlState);
        }

        // C apaga SEM WHERE: só o da obra2 (1); o de F (obra1) fica.
        await using (var comoC = Como(c.C, c.EmpresaX))
        {
            Assert.Equal(1, await comoC.Database.ExecuteSqlAsync($"DELETE FROM cronoai.acesso_frente", TestContext.Current.CancellationToken));
        }

        Assert.Equal("1", await _banco.ConsultarComoSuperusuarioAsync($"SELECT count(*) FROM cronoai.acesso_frente WHERE obra_id = '{c.Obra1}'"));

        // Controle negativo: o administrador apaga o de F.
        await using (var comoA = Como(c.A, c.EmpresaX))
        {
            Assert.Equal(1, await comoA.Database.ExecuteSqlAsync($"DELETE FROM cronoai.acesso_frente WHERE usuario_id = {c.F}", TestContext.Current.CancellationToken));
        }
    }

    [Fact]
    public async Task AcessoFrente_leitura_e_escrita_mutacao()
    {
        var c = await CenarioPermissoes.CriarAsync(_dados);

        var resultado = await ScriptRls.ExecutarAsync(
            _banco,
            c.B,
            c.EmpresaX,
            "DELETE FROM cronoai.acesso_frente",
            mutacao: "ALTER POLICY pol_acesso_frente_delete ON cronoai.acesso_frente USING (true)");

        Assert.True(resultado.Afetadas >= 1, resultado.Erro);
    }

    [Fact]
    public async Task Frente_por_visibilidade_da_obra()
    {
        var c = await CenarioPermissoes.CriarAsync(_dados);
        var frente2 = await _dados.CriarFrenteAsync(c.EmpresaX, c.Obra2);

        // Leitura: B só a frente da obra1; C a da obra2; A as duas.
        Assert.Equal([c.Frente1], await FrentesVisiveisAsync(c.B, c.EmpresaX));
        Assert.Equal([frente2], await FrentesVisiveisAsync(c.C, c.EmpresaX));
        Assert.Equal(new[] { c.Frente1, frente2 }.Order().ToList(), await FrentesVisiveisAsync(c.A, c.EmpresaX));

        // UPDATE SEM WHERE por B: afeta só as frentes da obra1.
        await using (var comoB = Como(c.B, c.EmpresaX))
        {
            Assert.Equal(1, await comoB.Database.ExecuteSqlAsync($"UPDATE cronoai.frente SET atualizada_em = {_futuro}", TestContext.Current.CancellationToken));
        }

        Assert.Equal("0", await _banco.ConsultarComoSuperusuarioAsync($"SELECT count(*) FROM cronoai.frente WHERE id = '{frente2}' AND atualizada_em = '2030-01-01T00:00:00Z'"));

        // INSERT de frente na obra2 por B: 42501. DELETE: 42501 (o papel não tem o privilégio).
        await using (var comoB = Como(c.B, c.EmpresaX))
        {
            var erro = await Assert.ThrowsAsync<PostgresException>(() => InserirFrenteAsync(comoB, c.EmpresaX, c.Obra2));
            Assert.Equal(PostgresErrorCodes.InsufficientPrivilege, erro.SqlState);
        }

        await using (var comoB = Como(c.B, c.EmpresaX))
        {
            var erro = await Assert.ThrowsAsync<PostgresException>(() => comoB.Database.ExecuteSqlAsync($"DELETE FROM cronoai.frente", TestContext.Current.CancellationToken));
            Assert.Equal(PostgresErrorCodes.InsufficientPrivilege, erro.SqlState);
        }

        // Controle negativo: B insere frente na obra1 (a que ele enxerga).
        await using (var comoB = Como(c.B, c.EmpresaX))
        {
            await InserirFrenteAsync(comoB, c.EmpresaX, c.Obra1);
        }
    }

    [Fact]
    public async Task Frente_por_visibilidade_da_obra_mutacao()
    {
        // Mutação do WITH CHECK do INSERT: B passa a inserir frente na obra2 (que não enxerga).
        var c = await CenarioPermissoes.CriarAsync(_dados);
        var id = Guid.CreateVersion7();

        var resultado = await ScriptRls.ExecutarAsync(
            _banco,
            c.B,
            c.EmpresaX,
            $"INSERT INTO cronoai.frente (id, empresa_id, obra_id, nome, criada_em, atualizada_em) VALUES ('{id}', '{c.EmpresaX}', '{c.Obra2}', 'Frente Mutacao {id:N}', now(), now())",
            mutacao: "ALTER POLICY pol_frente_insert ON cronoai.frente WITH CHECK (true)");

        Assert.True(resultado.Afetadas == 1, resultado.Erro);
    }

    [Fact]
    public async Task Carteiras_por_escopo_e_escrita_so_administrador()
    {
        var c = await CenarioPermissoes.CriarAsync(_dados);
        var k3 = await _dados.CriarCarteiraAsync(c.EmpresaX);

        // Leitura: C vê as carteiras que lhe foram atribuídas (K e K2) e NÃO a K3; G (todas) e A veem as três.
        Assert.Equal(new[] { c.CarteiraK, c.CarteiraK2 }.Order().ToList(), await CarteirasVisiveisAsync(c.C, c.EmpresaX));
        Assert.Equal(new[] { c.CarteiraK, c.CarteiraK2, k3 }.Order().ToList(), await CarteirasVisiveisAsync(c.G, c.EmpresaX));
        Assert.Equal(new[] { c.CarteiraK, c.CarteiraK2, k3 }.Order().ToList(), await CarteirasVisiveisAsync(c.A, c.EmpresaX));
        Assert.Empty(await CarteirasVisiveisAsync(c.B, c.EmpresaX));

        // carteira_obra: C vê os vínculos das suas duas carteiras (2).
        await using (var comoC = Como(c.C, c.EmpresaX))
        {
            Assert.Equal(2, (await comoC.Database.SqlQuery<int>($"SELECT count(*)::int AS \"Value\" FROM cronoai.carteira_obra").ToListAsync(TestContext.Current.CancellationToken)).Single());
        }

        // Escrita: só o administrador. C e G (gestores) recebem 42501 nos INSERT e 0 linhas nos DELETE e no UPDATE.
        foreach (var gestor in new[] { c.C, c.G })
        {
            await using (var contexto = Como(gestor, c.EmpresaX))
            {
                var erro = await Assert.ThrowsAsync<PostgresException>(() => contexto.Database.ExecuteSqlAsync(
                    $"INSERT INTO cronoai.carteira (id, empresa_id, nome, tipo, criada_em, atualizada_em) VALUES ({Guid.CreateVersion7()}, {c.EmpresaX}, {"Carteira Gestor " + Guid.NewGuid().ToString("N")}, {"regional"}, {DateTime.UtcNow}, {DateTime.UtcNow})",
                    TestContext.Current.CancellationToken));
                Assert.Equal(PostgresErrorCodes.InsufficientPrivilege, erro.SqlState);
            }

            await using (var contexto = Como(gestor, c.EmpresaX))
            {
                var erro = await Assert.ThrowsAsync<PostgresException>(() => contexto.Database.ExecuteSqlAsync(
                    $"INSERT INTO cronoai.carteira_obra (id, empresa_id, carteira_id, obra_id, criado_em) VALUES ({Guid.CreateVersion7()}, {c.EmpresaX}, {k3}, {c.Obra1}, {DateTime.UtcNow})",
                    TestContext.Current.CancellationToken));
                Assert.Equal(PostgresErrorCodes.InsufficientPrivilege, erro.SqlState);
            }

            await using (var contexto = Como(gestor, c.EmpresaX))
            {
                var erro = await Assert.ThrowsAsync<PostgresException>(() => contexto.Database.ExecuteSqlAsync(
                    $"INSERT INTO cronoai.acesso_carteira (id, empresa_id, carteira_id, usuario_id, criado_em) VALUES ({Guid.CreateVersion7()}, {c.EmpresaX}, {k3}, {c.C}, {DateTime.UtcNow})",
                    TestContext.Current.CancellationToken));
                Assert.Equal(PostgresErrorCodes.InsufficientPrivilege, erro.SqlState);
            }

            await using (var contexto = Como(gestor, c.EmpresaX))
            {
                Assert.Equal(0, await contexto.Database.ExecuteSqlAsync($"DELETE FROM cronoai.carteira_obra", TestContext.Current.CancellationToken));
            }

            await using (var contexto = Como(gestor, c.EmpresaX))
            {
                Assert.Equal(0, await contexto.Database.ExecuteSqlAsync($"DELETE FROM cronoai.acesso_carteira", TestContext.Current.CancellationToken));
            }

            await using (var contexto = Como(gestor, c.EmpresaX))
            {
                Assert.Equal(0, await contexto.Database.ExecuteSqlAsync($"UPDATE cronoai.carteira SET atualizada_em = {_futuro}", TestContext.Current.CancellationToken));
            }
        }

        // DELETE em carteira: 42501 para todos (o papel não tem o privilégio).
        await using (var comoA = Como(c.A, c.EmpresaX))
        {
            var erro = await Assert.ThrowsAsync<PostgresException>(() => comoA.Database.ExecuteSqlAsync($"DELETE FROM cronoai.carteira", TestContext.Current.CancellationToken));
            Assert.Equal(PostgresErrorCodes.InsufficientPrivilege, erro.SqlState);
        }

        // Controle negativo: o administrador inclui obra, atribui acesso e cria carteira.
        await using (var comoA = Como(c.A, c.EmpresaX))
        {
            await comoA.Database.ExecuteSqlAsync(
                $"INSERT INTO cronoai.carteira_obra (id, empresa_id, carteira_id, obra_id, criado_em) VALUES ({Guid.CreateVersion7()}, {c.EmpresaX}, {k3}, {c.Obra1}, {DateTime.UtcNow})",
                TestContext.Current.CancellationToken);
        }

        await using (var comoA = Como(c.A, c.EmpresaX))
        {
            await comoA.Database.ExecuteSqlAsync(
                $"INSERT INTO cronoai.acesso_carteira (id, empresa_id, carteira_id, usuario_id, criado_em) VALUES ({Guid.CreateVersion7()}, {c.EmpresaX}, {k3}, {c.C}, {DateTime.UtcNow})",
                TestContext.Current.CancellationToken);
        }

        await using (var comoA = Como(c.A, c.EmpresaX))
        {
            var criadas = await comoA.Database.SqlQuery<Guid>($"""
                INSERT INTO cronoai.carteira (id, empresa_id, nome, tipo, criada_em, atualizada_em)
                VALUES ({Guid.CreateVersion7()}, {c.EmpresaX}, {"Carteira Admin " + Guid.NewGuid().ToString("N")}, {"cliente"}, {DateTime.UtcNow}, {DateTime.UtcNow})
                RETURNING id AS "Value"
                """).ToListAsync(TestContext.Current.CancellationToken);
            Assert.Single(criadas);
        }
    }

    [Fact]
    public async Task Carteiras_por_escopo_e_escrita_so_administrador_mutacao()
    {
        // Mutação do USING do DELETE de carteira_obra: C, que apagava 0, passa a apagar os vínculos de carteira.
        var c = await CenarioPermissoes.CriarAsync(_dados);

        var resultado = await ScriptRls.ExecutarAsync(
            _banco,
            c.C,
            c.EmpresaX,
            "DELETE FROM cronoai.carteira_obra",
            mutacao: "ALTER POLICY pol_carteira_obra_delete ON cronoai.carteira_obra USING (true)");

        Assert.True(resultado.Afetadas >= 2, resultado.Erro);
    }

    #endregion

    #region Métodos privados

    private CronoDbContext Como(Guid usuario, Guid empresa) => _dados.Fabrica.Criar(new ContextoSessaoBanco(usuario, empresa));

    private async Task<List<Guid>> ObrasVisiveisAsync(Guid? usuario, Guid? empresa)
    {
        await using var contexto = _dados.Fabrica.Criar(new ContextoSessaoBanco(usuario, empresa));
        return (await DadosTeste.LerIdsAsync(contexto, $"SELECT id AS \"Value\" FROM cronoai.obra")).Order().ToList();
    }

    private async Task<List<Guid>> UsuariosDeAcessoObraAsync(Guid usuario, Guid empresa)
    {
        await using var contexto = Como(usuario, empresa);
        return (await DadosTeste.LerIdsAsync(contexto, $"SELECT usuario_id AS \"Value\" FROM cronoai.acesso_obra")).Order().ToList();
    }

    private async Task<List<Guid>> UsuariosDeAcessoFrenteAsync(Guid usuario, Guid empresa)
    {
        await using var contexto = Como(usuario, empresa);
        return (await DadosTeste.LerIdsAsync(contexto, $"SELECT usuario_id AS \"Value\" FROM cronoai.acesso_frente")).Order().ToList();
    }

    private async Task<List<Guid>> FrentesVisiveisAsync(Guid usuario, Guid empresa)
    {
        await using var contexto = Como(usuario, empresa);
        return (await DadosTeste.LerIdsAsync(contexto, $"SELECT id AS \"Value\" FROM cronoai.frente")).Order().ToList();
    }

    private async Task<List<Guid>> CarteirasVisiveisAsync(Guid usuario, Guid empresa)
    {
        await using var contexto = Como(usuario, empresa);
        return (await DadosTeste.LerIdsAsync(contexto, $"SELECT id AS \"Value\" FROM cronoai.carteira")).Order().ToList();
    }

    private static Task<int> InserirObraAsync(CronoDbContext contexto, Guid empresaDaLinha) =>
        contexto.Database.ExecuteSqlAsync(
            $"INSERT INTO cronoai.obra (id, empresa_id, nome, uf, municipio_ibge, criada_em, atualizada_em) VALUES ({Guid.CreateVersion7()}, {empresaDaLinha}, {"Obra Ficticia " + Guid.NewGuid().ToString("N")}, {"PE"}, {"2699999"}, {DateTime.UtcNow}, {DateTime.UtcNow})",
            TestContext.Current.CancellationToken);

    private static Task<int> InserirAcessoObraAsync(CronoDbContext contexto, Guid empresa, Guid obra, Guid usuario) =>
        contexto.Database.ExecuteSqlAsync(
            $"INSERT INTO cronoai.acesso_obra (id, empresa_id, obra_id, usuario_id, criado_em) VALUES ({Guid.CreateVersion7()}, {empresa}, {obra}, {usuario}, {DateTime.UtcNow})",
            TestContext.Current.CancellationToken);

    private static Task<int> InserirAcessoFrenteAsync(CronoDbContext contexto, Guid empresa, Guid obra, Guid frente, Guid usuario) =>
        contexto.Database.ExecuteSqlAsync(
            $"INSERT INTO cronoai.acesso_frente (id, empresa_id, obra_id, frente_id, usuario_id, criado_em) VALUES ({Guid.CreateVersion7()}, {empresa}, {obra}, {frente}, {usuario}, {DateTime.UtcNow})",
            TestContext.Current.CancellationToken);

    private static Task<int> InserirFrenteAsync(CronoDbContext contexto, Guid empresa, Guid obra) =>
        contexto.Database.ExecuteSqlAsync(
            $"INSERT INTO cronoai.frente (id, empresa_id, obra_id, nome, criada_em, atualizada_em) VALUES ({Guid.CreateVersion7()}, {empresa}, {obra}, {"Frente " + Guid.NewGuid().ToString("N")}, {DateTime.UtcNow}, {DateTime.UtcNow})",
            TestContext.Current.CancellationToken);

    #endregion
}
