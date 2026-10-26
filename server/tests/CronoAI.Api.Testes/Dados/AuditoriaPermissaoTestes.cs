using CronoAI.Api.Testes.Infra;
using CronoAI.Dados;
using CronoAI.Dados.Auditoria;
using CronoAI.Dominio;
using Microsoft.EntityFrameworkCore;
using Npgsql;

namespace CronoAI.Api.Testes.Dados;

/// <summary>
/// Trilha de auditoria sob o RLS por obra e o interceptor estendido (plano 00014, T27 a T31). Leitura pela visibilidade da obra,
/// INSERT atribuído ao próprio usuário do contexto, ação <c>remover</c> para vínculo, <c>entidade_id</c> do membro e atomicidade
/// provada com a trilha JÁ inserida no lote (a sonda de comandos confirma a ordem).
/// </summary>
[Collection(ColecaoBanco.Nome)]
[Trait("Categoria", "Integracao")]
public sealed class AuditoriaPermissaoTestes
{
    #region Campos

    private readonly BancoPostgresFixture _banco;
    private readonly DadosTeste _dados;

    #endregion

    #region Construtor

    public AuditoriaPermissaoTestes(BancoPostgresFixture banco)
    {
        _banco = banco;
        _dados = new DadosTeste(banco);
    }

    #endregion

    #region Métodos públicos

    [Fact]
    public async Task Auditoria_por_visibilidade()
    {
        var c = await CenarioPermissoes.CriarAsync(_dados);

        // Uma linha de trilha da EMPRESA (obra_id nulo), gravada pelo administrador, e uma obra com motivo que B não enxerga.
        await using (var comoA = Como(c.A, c.EmpresaX))
        {
            await comoA.Database.ExecuteSqlAsync(
                $"INSERT INTO cronoai.auditoria (empresa_id, usuario_id, entidade, entidade_id, acao, origem, em) VALUES ({c.EmpresaX}, {c.A}, {"membro_empresa"}, {c.B}, {"alterar"}, {"ui"}, {DateTime.UtcNow})",
                TestContext.Current.CancellationToken);
        }

        var obra4 = await _dados.CriarObraAsync(c.EmpresaX, c.A, motivo: "motivo-sigiloso-da-obra4");

        // B (vinculado à obra1) lê a trilha da obra1 e NÃO a da obra2; nunca vê a linha da empresa nem o motivo da obra4.
        Assert.Equal(1, await ContarAsync(c.B, c.EmpresaX, $"SELECT count(*)::int AS \"Value\" FROM cronoai.auditoria WHERE obra_id = {c.Obra1}"));
        Assert.Equal(0, await ContarAsync(c.B, c.EmpresaX, $"SELECT count(*)::int AS \"Value\" FROM cronoai.auditoria WHERE obra_id = {c.Obra2}"));
        Assert.Equal(0, await ContarAsync(c.B, c.EmpresaX, $"SELECT count(*)::int AS \"Value\" FROM cronoai.auditoria WHERE obra_id IS NULL"));
        Assert.Equal(0, await ContarAsync(c.B, c.EmpresaX, $"SELECT count(*)::int AS \"Value\" FROM cronoai.auditoria WHERE motivo IS NOT NULL"));

        // A trilha da empresa (obra_id nulo) só o administrador lê: nem o gestor (escopo todas ou carteiras) a enxerga.
        Assert.Equal(1, await ContarAsync(c.A, c.EmpresaX, $"SELECT count(*)::int AS \"Value\" FROM cronoai.auditoria WHERE obra_id IS NULL"));
        foreach (var nao in new[] { c.C, c.G, c.D })
        {
            Assert.Equal(0, await ContarAsync(nao, c.EmpresaX, $"SELECT count(*)::int AS \"Value\" FROM cronoai.auditoria WHERE obra_id IS NULL"));
        }

        // Controle negativo: A lê tudo (as 3 obras do cenário, a obra4 com o motivo e a linha da empresa); C só a obra2.
        Assert.Equal(3, await ContarAsync(c.A, c.EmpresaX, $"SELECT count(*)::int AS \"Value\" FROM cronoai.auditoria WHERE obra_id IN ({c.Obra1}, {c.Obra2}, {c.Obra3})"));
        Assert.Equal(1, await ContarAsync(c.A, c.EmpresaX, $"SELECT count(*)::int AS \"Value\" FROM cronoai.auditoria WHERE obra_id = {obra4.Id} AND motivo IS NOT NULL"));
        Assert.Equal(1, await ContarAsync(c.C, c.EmpresaX, $"SELECT count(*)::int AS \"Value\" FROM cronoai.auditoria WHERE obra_id IN ({c.Obra1}, {c.Obra2}, {c.Obra3})"));

        // INSERT atribuído a OUTRO usuário (fecha a lacuna do 00013) e INSERT em obra invisível: 42501.
        await using (var comoA = Como(c.A, c.EmpresaX))
        {
            var erro = await Assert.ThrowsAsync<PostgresException>(() => InserirTrilhaAsync(comoA, c.EmpresaX, usuarioDaLinha: c.B, obra: null));
            Assert.Equal(PostgresErrorCodes.InsufficientPrivilege, erro.SqlState);
        }

        await using (var comoB = Como(c.B, c.EmpresaX))
        {
            var erro = await Assert.ThrowsAsync<PostgresException>(() => InserirTrilhaAsync(comoB, c.EmpresaX, usuarioDaLinha: c.B, obra: c.Obra2));
            Assert.Equal(PostgresErrorCodes.InsufficientPrivilege, erro.SqlState);
        }

        // Rodada 02: trilha SEM obra (da empresa) só o administrador grava. Os demais perfis, mesmo em nome próprio, levam 42501;
        // o administrador (controle negativo) grava.
        foreach (var naoAdmin in new[] { c.B, c.C, c.G, c.D })
        {
            await using var contexto = Como(naoAdmin, c.EmpresaX);
            var erro = await Assert.ThrowsAsync<PostgresException>(() => InserirTrilhaAsync(contexto, c.EmpresaX, usuarioDaLinha: naoAdmin, obra: null));
            Assert.Equal(PostgresErrorCodes.InsufficientPrivilege, erro.SqlState);
        }

        await using (var comoAdministrador = Como(c.A, c.EmpresaX))
        {
            Assert.Equal(1, await InserirTrilhaAsync(comoAdministrador, c.EmpresaX, usuarioDaLinha: c.A, obra: null));
        }

        // Controle negativo: o mesmo INSERT em obra visível, em nome do próprio usuário, passa.
        await using (var comoB = Como(c.B, c.EmpresaX))
        {
            await InserirTrilhaAsync(comoB, c.EmpresaX, usuarioDaLinha: c.B, obra: c.Obra1);
        }

        // Append-only intacto: só SELECT e INSERT, gatilho de instrução com ENABLE ALWAYS.
        Assert.Equal("INSERT|SELECT", await _banco.ConsultarComoSuperusuarioAsync("SELECT string_agg(cmd, '|' ORDER BY cmd) FROM pg_policies WHERE schemaname = 'cronoai' AND tablename = 'auditoria'"));
        Assert.Equal("A", await _banco.ConsultarComoSuperusuarioAsync("SELECT tgenabled::text FROM pg_trigger WHERE tgname = 'trg_auditoria_append_only'"));
    }

    [Fact]
    public async Task Auditoria_por_visibilidade_mutacao()
    {
        // Mutação do WITH CHECK do INSERT: A passa a gravar trilha em nome de OUTRO usuário.
        var c = await CenarioPermissoes.CriarAsync(_dados);

        var resultado = await ScriptRls.ExecutarAsync(
            _banco,
            c.A,
            c.EmpresaX,
            $"INSERT INTO cronoai.auditoria (empresa_id, usuario_id, entidade, entidade_id, acao, origem, em) VALUES ('{c.EmpresaX}', '{c.B}', 'obra', '{Guid.NewGuid()}', 'criar', 'ui', now())",
            mutacao: "ALTER POLICY pol_auditoria_insert ON cronoai.auditoria WITH CHECK (true)");

        Assert.True(resultado.Afetadas == 1, resultado.Erro);
    }

    [Fact]
    public async Task Auditoria_sem_obra_so_do_administrador_mutacao()
    {
        // Mutação do WITH CHECK do INSERT: sem a regra "obra nula só administrador", B (engenheiro) grava trilha da empresa.
        // O mesmo script sem a mutação é o controle (42501).
        var c = await CenarioPermissoes.CriarAsync(_dados);
        var dml = $"INSERT INTO cronoai.auditoria (empresa_id, usuario_id, entidade, entidade_id, acao, origem, em) VALUES ('{c.EmpresaX}', '{c.B}', 'membro_empresa', '{c.B}', 'alterar', 'ui', now())";

        var semMutacao = await ScriptRls.ExecutarAsync(_banco, c.B, c.EmpresaX, dml);
        var comMutacao = await ScriptRls.ExecutarAsync(_banco, c.B, c.EmpresaX, dml, mutacao: "ALTER POLICY pol_auditoria_insert ON cronoai.auditoria WITH CHECK (true)");

        Assert.Equal(PostgresErrorCodes.InsufficientPrivilege, semMutacao.SqlState);
        Assert.True(comMutacao.Afetadas == 1, comMutacao.Erro);
    }

    [Fact]
    public async Task Interceptor_remove_vinculo_com_acao_remover()
    {
        var c = await CenarioPermissoes.CriarAsync(_dados);

        await using (var contexto = Como(c.A, c.EmpresaX))
        {
            var vinculo = await contexto.AcessosObra.SingleAsync(a => a.ObraId == c.Obra1 && a.UsuarioId == c.B, TestContext.Current.CancellationToken);
            contexto.AcessosObra.Remove(vinculo);
            await contexto.SalvarAuditadoAsync(Metadados(), TestContext.Current.CancellationToken);

            // 1 linha "remover": antes = {obra_id, usuario_id}, depois nulo, obra_id preenchido.
            Assert.Equal(
                $"remover|{c.Obra1}|{c.B}|true|{c.Obra1}",
                await _banco.ConsultarComoSuperusuarioAsync($"SELECT acao || '|' || (antes->>'obra_id') || '|' || (antes->>'usuario_id') || '|' || (depois IS NULL)::text || '|' || obra_id::text FROM cronoai.auditoria WHERE entidade = 'acesso_obra' AND entidade_id = '{vinculo.Id}'"));
            Assert.Equal("0", await _banco.ConsultarComoSuperusuarioAsync($"SELECT count(*) FROM cronoai.acesso_obra WHERE id = '{vinculo.Id}'"));
        }

        // Controle negativo: obra e frente (e qualquer entidade que não seja vínculo) continuam LANÇANDO ao serem removidas.
        await using (var contexto = Como(c.A, c.EmpresaX))
        {
            contexto.Obras.Remove(await contexto.Obras.SingleAsync(o => o.Id == c.Obra2, TestContext.Current.CancellationToken));
            await Assert.ThrowsAsync<InvalidOperationException>(() => contexto.SalvarAuditadoAsync(Metadados(), TestContext.Current.CancellationToken));
        }

        await using (var contexto = Como(c.A, c.EmpresaX))
        {
            contexto.Frentes.Remove(await contexto.Frentes.SingleAsync(f => f.Id == c.Frente1, TestContext.Current.CancellationToken));
            await Assert.ThrowsAsync<InvalidOperationException>(() => contexto.SalvarAuditadoAsync(Metadados(), TestContext.Current.CancellationToken));
        }
    }

    [Fact]
    public async Task Interceptor_entidade_id_e_obra_id()
    {
        var c = await CenarioPermissoes.CriarAsync(_dados);
        var instante = DateTime.UtcNow;

        // Membro: entidade_id = usuario_id, obra_id nulo, "perfil" e "escopo_obras" em antes/depois, sem versao_depois (xmin).
        await using (var contexto = Como(c.A, c.EmpresaX))
        {
            var membro = await contexto.Membros.SingleAsync(m => m.UsuarioId == c.D, TestContext.Current.CancellationToken);
            Assert.True(membro.AlterarPerfil(Perfis.Suprimentos, EscoposObras.Vinculadas, instante));
            await contexto.SalvarAuditadoAsync(Metadados(), TestContext.Current.CancellationToken);
        }

        Assert.Equal(
            "alterar|membro_empresa|engenheiro_planejamento|suprimentos|true|true",
            await _banco.ConsultarComoSuperusuarioAsync($"SELECT acao || '|' || entidade || '|' || (antes->>'perfil') || '|' || (depois->>'perfil') || '|' || (obra_id IS NULL)::text || '|' || (versao_depois IS NULL)::text FROM cronoai.auditoria WHERE entidade = 'membro_empresa' AND entidade_id = '{c.D}'"));

        // Frente: obra_id da obra; o texto livre do responsável (nome de pessoa) NÃO entra no depois.
        var frente = Frente.Criar(c.EmpresaX, c.Obra1, "Frente T29", null, "Mestre Ficticio", instante);
        await using (var contexto = Como(c.A, c.EmpresaX))
        {
            contexto.Frentes.Add(frente);
            await contexto.SalvarAuditadoAsync(Metadados(), TestContext.Current.CancellationToken);
        }

        Assert.Equal(
            $"criar|{c.Obra1}|false|1",
            await _banco.ConsultarComoSuperusuarioAsync($"SELECT acao || '|' || obra_id::text || '|' || (depois ? 'responsavel_texto')::text || '|' || versao_depois::text FROM cronoai.auditoria WHERE entidade = 'frente' AND entidade_id = '{frente.Id}'"));

        // Troca SÓ do responsavel_texto: linha "alterar" com antes e depois vazios (quem e quando, sem o valor).
        await using (var contexto = Como(c.A, c.EmpresaX))
        {
            var carregada = await contexto.Frentes.SingleAsync(f => f.Id == frente.Id, TestContext.Current.CancellationToken);
            contexto.Entry(carregada).Property(f => f.ResponsavelTexto).CurrentValue = "Outro Mestre Ficticio";
            await contexto.SalvarAuditadoAsync(Metadados(), TestContext.Current.CancellationToken);
        }

        Assert.Equal(
            "alterar|{}|{}",
            await _banco.ConsultarComoSuperusuarioAsync($"SELECT acao || '|' || antes::text || '|' || depois::text FROM cronoai.auditoria WHERE entidade = 'frente' AND entidade_id = '{frente.Id}' AND acao = 'alterar'"));
        Assert.Equal("0", await _banco.ConsultarComoSuperusuarioAsync($"SELECT count(*) FROM cronoai.auditoria WHERE entidade_id = '{frente.Id}' AND (antes::text ILIKE '%Mestre%' OR depois::text ILIKE '%Mestre%')"));

        // Vínculo de obra: obra_id da obra. Carteira: trilha da empresa (obra_id nulo).
        var acesso = AcessoObra.Criar(c.EmpresaX, c.Obra2, c.D, instante);
        var carteira = Carteira.Criar(c.EmpresaX, "Carteira T29 " + Guid.NewGuid().ToString("N")[..6], TiposCarteira.Gestor, instante);
        await using (var contexto = Como(c.A, c.EmpresaX))
        {
            contexto.AcessosObra.Add(acesso);
            contexto.Carteiras.Add(carteira);
            await contexto.SalvarAuditadoAsync(Metadados(), TestContext.Current.CancellationToken);
        }

        Assert.Equal($"{c.Obra2}", await _banco.ConsultarComoSuperusuarioAsync($"SELECT obra_id::text FROM cronoai.auditoria WHERE entidade = 'acesso_obra' AND entidade_id = '{acesso.Id}'"));
        Assert.Equal("true", await _banco.ConsultarComoSuperusuarioAsync($"SELECT (obra_id IS NULL)::text FROM cronoai.auditoria WHERE entidade = 'carteira' AND entidade_id = '{carteira.Id}'"));
    }

    [Fact]
    public async Task Atomicidade_falha_no_commit_com_trilha_inserida()
    {
        // Único administrador A rebaixa a si mesmo: a trilha é inserida no lote e o gatilho DIFERIDO falha só no COMMIT. Tudo
        // volta: 0 linhas de trilha e o membro intacto.
        var (empresa, a, _) = await EmpresaComUmAdministradorAsync();
        var sonda = new SondaDeComandos();

        await using (var contexto = SondaDeComandos.CriarContexto(_banco, new ContextoSessaoBanco(a, empresa), sonda))
        {
            var membro = await contexto.Membros.SingleAsync(m => m.UsuarioId == a, TestContext.Current.CancellationToken);
            membro.AlterarPerfil(Perfis.EngenheiroObra, EscoposObras.Vinculadas, DateTime.UtcNow);

            var erro = await Assert.ThrowsAnyAsync<Exception>(() => contexto.SalvarAuditadoAsync(Metadados(), TestContext.Current.CancellationToken));
            var postgres = PostgresDaCadeia(erro);
            Assert.Equal(PostgresErrorCodes.CheckViolation, postgres.SqlState);
            Assert.Equal("ck_empresa_tem_administrador", postgres.ConstraintName);
        }

        // PROVA de que a trilha entrou no lote antes da falha (senão "0 trilha" seria trivial).
        Assert.Contains(sonda.Comandos, comando => comando.Contains("INSERT INTO cronoai.auditoria", StringComparison.Ordinal));
        Assert.Equal("0", await _banco.ConsultarComoSuperusuarioAsync($"SELECT count(*) FROM cronoai.auditoria WHERE entidade = 'membro_empresa' AND entidade_id = '{a}'"));
        Assert.Equal("administrador", await _banco.ConsultarComoSuperusuarioAsync($"SELECT perfil FROM cronoai.membro_empresa WHERE empresa_id = '{empresa}' AND usuario_id = '{a}'"));
    }

    [Fact]
    public async Task Atomicidade_com_dois_administradores_grava_trilha_e_membro()
    {
        // Controle negativo do teste anterior: com DOIS administradores o mesmo rebaixamento passa, com 1 trilha e o membro alterado.
        var (empresa, a, _) = await EmpresaComUmAdministradorAsync();
        var segundo = await _dados.CriarUsuarioAsync();
        await _dados.VincularAsync(empresa, segundo);

        await using (var contexto = Como(a, empresa))
        {
            var membro = await contexto.Membros.SingleAsync(m => m.UsuarioId == a, TestContext.Current.CancellationToken);
            membro.AlterarPerfil(Perfis.EngenheiroObra, EscoposObras.Vinculadas, DateTime.UtcNow);
            await contexto.SalvarAuditadoAsync(Metadados(), TestContext.Current.CancellationToken);
        }

        Assert.Equal("1", await _banco.ConsultarComoSuperusuarioAsync($"SELECT count(*) FROM cronoai.auditoria WHERE entidade = 'membro_empresa' AND entidade_id = '{a}'"));
        Assert.Equal("engenheiro_obra", await _banco.ConsultarComoSuperusuarioAsync($"SELECT perfil FROM cronoai.membro_empresa WHERE empresa_id = '{empresa}' AND usuario_id = '{a}'"));
    }

    [Fact]
    public async Task Atomicidade_trilha_antes_do_update_que_falha()
    {
        // T31 (prova): o UPDATE do membro viola o CHECK do par perfil x escopo (23514) DEPOIS de a trilha ser inserida no lote. A
        // sonda registra a ORDEM dos comandos: se o INSERT da trilha não vier antes do UPDATE que falha, o teste reprova por "NÃO
        // PROVA" (um rollback de trilha que nunca foi inserida não prova atomicidade nenhuma).
        var c = await CenarioPermissoes.CriarAsync(_dados);
        var sonda = new SondaDeComandos();

        await using (var contexto = SondaDeComandos.CriarContexto(_banco, new ContextoSessaoBanco(c.A, c.EmpresaX), sonda))
        {
            var membro = await contexto.Membros.SingleAsync(m => m.UsuarioId == c.D, TestContext.Current.CancellationToken);

            // Par inválido imposto por fora do domínio (o domínio recusaria): engenheiro de planejamento com escopo "todas".
            contexto.Entry(membro).Property(m => m.EscopoObras).CurrentValue = EscoposObras.Todas;

            var erro = await Assert.ThrowsAnyAsync<Exception>(() => contexto.SalvarAuditadoAsync(Metadados(), TestContext.Current.CancellationToken));
            var postgres = PostgresDaCadeia(erro);
            Assert.Equal(PostgresErrorCodes.CheckViolation, postgres.SqlState);
            Assert.Equal("ck_membro_perfil_escopo", postgres.ConstraintName);
        }

        var texto = string.Join("\n", sonda.Comandos);
        var posicaoTrilha = texto.IndexOf("INSERT INTO cronoai.auditoria", StringComparison.Ordinal);
        var posicaoUpdate = texto.IndexOf("UPDATE cronoai.membro_empresa", StringComparison.Ordinal);
        Assert.True(posicaoTrilha >= 0 && posicaoUpdate >= 0, "O lote deveria ter a trilha e o UPDATE. Comandos: " + texto);
        Assert.True(posicaoTrilha < posicaoUpdate, "NÃO PROVA: o UPDATE que falha saiu antes da trilha. Comandos: " + texto);

        Assert.Equal("0", await _banco.ConsultarComoSuperusuarioAsync($"SELECT count(*) FROM cronoai.auditoria WHERE entidade = 'membro_empresa' AND entidade_id = '{c.D}'"));
        Assert.Equal("vinculadas", await _banco.ConsultarComoSuperusuarioAsync($"SELECT escopo_obras FROM cronoai.membro_empresa WHERE empresa_id = '{c.EmpresaX}' AND usuario_id = '{c.D}'"));
    }

    [Fact]
    public async Task Atomicidade_do_delete_que_falha_o_lote_apaga_antes_de_gravar_a_trilha()
    {
        // Revogar o vínculo de F na obra1 com acesso_frente pendente: a FK recusa o DELETE (23503). No lote do EF o DELETE sai
        // ANTES do INSERT da trilha (ordem observada e fixada aqui): o DELETE que falha impede a trilha de nem ser enviada, então
        // este teste NÃO prova rollback de trilha já inserida (isso é do T30, no COMMIT, e do teste do UPDATE acima). Prova que a
        // revogação recusada não deixa trilha nem apaga o vínculo; se o EF mudar a ordem, o teste avisa.
        var c = await CenarioPermissoes.CriarAsync(_dados);
        var sonda = new SondaDeComandos();
        Guid vinculoId;

        await using (var contexto = SondaDeComandos.CriarContexto(_banco, new ContextoSessaoBanco(c.A, c.EmpresaX), sonda))
        {
            var vinculo = await contexto.AcessosObra.SingleAsync(a => a.ObraId == c.Obra1 && a.UsuarioId == c.F, TestContext.Current.CancellationToken);
            vinculoId = vinculo.Id;
            contexto.AcessosObra.Remove(vinculo);

            var erro = await Assert.ThrowsAnyAsync<Exception>(() => contexto.SalvarAuditadoAsync(Metadados(), TestContext.Current.CancellationToken));
            Assert.Equal(PostgresErrorCodes.ForeignKeyViolation, PostgresDaCadeia(erro).SqlState);
        }

        var texto = string.Join("\n", sonda.Comandos);
        var posicaoTrilha = texto.IndexOf("INSERT INTO cronoai.auditoria", StringComparison.Ordinal);
        var posicaoDelete = texto.IndexOf("DELETE FROM cronoai.acesso_obra", StringComparison.Ordinal);
        Assert.True(posicaoDelete >= 0 && posicaoTrilha > posicaoDelete, "A ordem do lote do EF mudou (DELETE deixou de preceder a trilha): reavalie este teste e o T31. Comandos: " + texto);

        Assert.Equal("0", await _banco.ConsultarComoSuperusuarioAsync($"SELECT count(*) FROM cronoai.auditoria WHERE entidade = 'acesso_obra' AND entidade_id = '{vinculoId}'"));
        Assert.Equal("1", await _banco.ConsultarComoSuperusuarioAsync($"SELECT count(*) FROM cronoai.acesso_obra WHERE id = '{vinculoId}'"));
    }

    #endregion

    #region Métodos privados

    private CronoDbContext Como(Guid usuario, Guid empresa) => _dados.Fabrica.Criar(new ContextoSessaoBanco(usuario, empresa));

    private static MetadadosEscrita Metadados() => new(OrigensAuditoria.Ui, null, null, DateTime.UtcNow);

    private async Task<int> ContarAsync(Guid usuario, Guid empresa, FormattableString sql)
    {
        await using var contexto = Como(usuario, empresa);
        return (await contexto.Database.SqlQuery<int>(sql).ToListAsync(TestContext.Current.CancellationToken)).Single();
    }

    private static Task<int> InserirTrilhaAsync(CronoDbContext contexto, Guid empresa, Guid usuarioDaLinha, Guid? obra) =>
        contexto.Database.ExecuteSqlAsync(
            $"INSERT INTO cronoai.auditoria (empresa_id, obra_id, usuario_id, entidade, entidade_id, acao, origem, em) VALUES ({empresa}, {obra}, {usuarioDaLinha}, {"obra"}, {Guid.NewGuid()}, {"criar"}, {"ui"}, {DateTime.UtcNow})",
            TestContext.Current.CancellationToken);

    // Empresa com UM administrador (o único) e nenhuma outra pessoa: o rebaixamento dele fere o gatilho do último administrador.
    private async Task<(Guid Empresa, Guid Administrador, Guid Outro)> EmpresaComUmAdministradorAsync()
    {
        var empresa = await _dados.CriarEmpresaAsync(comAdministradorTecnico: false);
        var admin = await _dados.CriarUsuarioAsync();
        await _dados.VincularAsync(empresa, admin);
        return (empresa, admin, Guid.Empty);
    }

    // O erro do banco pode vir embrulhado (DbUpdateException, exceção de commit): procura o PostgresException na cadeia.
    private static PostgresException PostgresDaCadeia(Exception erro)
    {
        for (var atual = erro; atual is not null; atual = atual.InnerException)
        {
            if (atual is PostgresException postgres)
            {
                return postgres;
            }
        }

        throw new InvalidOperationException("Sem PostgresException na cadeia: " + erro);
    }

    #endregion
}
