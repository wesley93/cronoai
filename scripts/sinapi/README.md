# Gerador do recorte SINAPI (offline)

Lê a planilha nacional `SINAPI_Referencia_AAAA_MM.xlsx` (Caixa, layout a partir de 2025) e gera o **recorte** de uma UF, um regime e uma data-base, em JSON. A obra importa o recorte na tela **Integrações**. O navegador nunca recebe a tabela nacional, e a planilha não entra no git.

> Este script é de uso do administrador do CronoAI, na máquina dele. Não é publicação nem hospedagem: não há servidor nem rede. Qualquer dúvida sobre onde guardar a planilha e os recortes de uma equipe fica com a **Infraestrutura**.

## Requisitos

- Node 22.6 ou superior (o script é TypeScript, executado pelo *type stripping* do Node; `--experimental-strip-types` já vai no `npm run`; o `zlib.crc32` do leitor existe desde o 22.2).
- Nenhuma dependência nova: o leitor de xlsx é próprio (`zip.ts` e `planilha.ts`).

## Passo a passo (uma vez por publicação mensal)

1. Baixe o zip da publicação no site da Caixa (SINAPI, relatórios mensais, formato xlsx) e extraia em uma pasta **fora do repositório**, por exemplo `referencias/sinapi/2026-09/xlsx/`. No zip nacional, os nomes de arquivo vêm em CP850 com a marca de UTF-8: alguns extratores trocam o "ê" de "Referência" por "�". O script acha o arquivo pelo nome sem acento, ou por `--arquivo`.
2. Defina `CRONOAI_REF_DIR` com a pasta `referencias` (opcional se usar `--arquivo` e `--saida`).
3. Rode:

```bash
npm run sinapi:recorte -- --uf SP --regime nao-desonerado --data-base 2026-09
```

O recorte sai em `$CRONOAI_REF_DIR/recortes/recorte-sinapi-SP-nao-desonerado-2026-09.json`. Em **Integrações**, a obra (com a mesma UF, regime e data-base em "Dados da obra") importa o arquivo.

## Opções

| Opção | O que faz |
|---|---|
| `--uf SP` | UF do recorte |
| `--regime nao-desonerado` ou `desonerado` | aba `CSD` ou `CCD` |
| `--data-base 2026-09` | mês da publicação; acha a planilha em `$CRONOAI_REF_DIR/sinapi/2026-09/xlsx/` e confere com o mês escrito na planilha |
| `--arquivo caminho.xlsx` | usa esta planilha |
| `--codigos 103332,104658` | só estas composições |
| `--grupos "Alvenaria de Vedação;Pisos"` | só estes grupos (separados por `;`). Com `--codigos`, vale a união |
| `--saida caminho.json` | onde gravar (padrão acima) |
| `--sobrescrever` | permite trocar um arquivo que já existe |

## O que entra no recorte

- Só composições com situação **COM CUSTO** e custo maior que zero na UF. Ficam de fora as `SEM CUSTO` (custo zero em todas as UFs) e as com custo zero na UF; a contagem vai em `totais`. Com filtro, a contagem vale só para o que passou no filtro.
- Mão de obra por função, do Analítico: itens `COMPOSICAO` em horas cuja descrição termina em "COM ENCARGOS COMPLEMENTARES", com o coeficiente publicado. Só o 1º nível (subcomposições não são explodidas).
- Encargos horista e mensalista da UF, a fonte (arquivo, SHA-256, emissão) e o `%AS` publicado (só exibido).
- Medido em 09/2026: o recorte de SP sem filtro tem 8.443 composições e cerca de 3,5 MB. O limite do app é 6 MiB; acima disso, use `--grupos` ou `--codigos`.

## Segurança do leitor

A planilha é arquivo externo. O leitor confere tudo **antes** de descompactar e nunca grava nada em disco:

- planilha até 64 MiB, até 200 entradas no zip, entrada lida até 64 MiB descompactada, soma das entradas lidas até 256 MiB e razão de compressão até 200 (por entrada lida);
- recusa zip criptografado, Zip64, vários volumes, método diferente de armazenado e deflate, nomes repetidos, deslocamentos fora do arquivo e diretório truncado;
- tamanho real e CRC-32 conferidos depois de descompactar;
- XML com `DOCTYPE`, `ENTITY` ou CDATA é recusado (XXE e *billion laughs*); só as 5 entidades predefinidas e referências numéricas;
- até 200.000 linhas e 200 colunas por aba;
- mensagens de erro não repetem conteúdo do arquivo.

A saída **não pode ficar dentro do repositório** (inclusive `src/` e `public/`, que vão no bundle).

## Se a Caixa mudar o layout

Colunas, UFs, encargos e mês são achados pelo **texto do cabeçalho**, não pela posição. O código da composição vem do 2º argumento da fórmula `HYPERLINK` da coluna "Código da Composição" (a fórmula nunca é avaliada) e é conferido com o Analítico. Se algo não bater, o script para com uma mensagem nomeando o que mudou ("layout mudou"): ele nunca gera recorte parcial. Nesse caso, avise o time de desenvolvimento e acrescente o teste de referência do mês novo (`referencia-AAAA-MM.test.ts`).

## Testes

```bash
npx vitest run scripts/sinapi                                                    # zip, planilha, layout, recorte e CLI (CI)
CRONOAI_REF_DIR=/caminho/referencias npx vitest run scripts/sinapi/referencia-2026-09.test.ts   # planilha real (só local)
```
