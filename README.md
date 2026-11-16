# LogiAI — Assistente Inteligente de Logística

Aplicação web de análise logística que consolida arquivos CSV de pedidos, entregas e ocorrências
para transformar dados operacionais em indicadores verificáveis e apoiar decisões gerenciais.

O projeto integra a Groq com o modelo `openai/gpt-oss-20b` para diagnósticos e recomendações de IA generativa,
fundamentados nos dados validados, com uma arquitetura simples, modular e extensível.

**Estado atual:** versão 2 para uso local, com importação, validação, indicadores, dashboard e integração Groq.
O diagnóstico é habilitado ao configurar `GROQ_API_KEY` no servidor; sem chave, a análise logística continua funcionando.

## Objetivo

Oferecer uma visão consolidada da operação, facilitar a identificação de problemas de desempenho
e apoiar a avaliação de alternativas de melhoria logística. Os cálculos oficiais são determinísticos;
a IA tem função consultiva, sem alterar dados ou executar decisões operacionais automaticamente.

## Características principais

- Importação conjunta de múltiplos CSVs, com seleção de arquivos ou arrastar e soltar.
- Validação no servidor de campos obrigatórios, datas, identificadores e referências entre arquivos.
- Rejeição integral de importações inválidas, com mensagens indicando a origem dos problemas.
- Normalizações explícitas, com avisos sobre espaços externos removidos e linhas vazias ignoradas.
- Dashboard responsivo com indicadores, distribuição das entregas e ocorrências por tipo.
- Comparação de volumes e pontualidade por transportadora.
- Modelos de CSV para download e demonstração com dados fictícios.
- Rastreabilidade por arquivos de origem, versão do contrato e resumo SHA-256 da base.
- Análises temporárias em memória, com expiração e opção de limpeza.
- Diagnósticos via Groq, com fatos verificados, hipóteses, alternativas de ação e limitações em JSON estruturado.

## Tecnologias utilizadas

| Tecnologia | Responsabilidade |
| --- | --- |
| HTML5 | Estrutura semântica da interface |
| CSS3 | Layout responsivo e apresentação visual |
| JavaScript com módulos ES | Interações, comunicação com a API e renderização segura |
| Node.js 22 ou superior | Execução do backend e dos testes |
| Express 5 | API HTTP, arquivos públicos e tratamento de erros |
| Groq + `openai/gpt-oss-20b` | Diagnósticos por `fetch` nativo, sem SDK adicional |
| csv-parse 7 | Leitura e interpretação dos arquivos CSV |
| `node:test` e `node:assert` | Testes automatizados e verificações de resultados |
| npm e `package-lock.json` | Gerenciamento e reprodução das dependências |

Esta versão não utiliza banco de dados, autenticação ou framework de frontend.

## Skills e competências aplicadas

- **Modelagem de dados:** contratos de CSV, chaves, cardinalidades e integridade dos relacionamentos.
- **Análise logística:** definição de indicadores, interpretação de volumes e pontualidade.
- **Desenvolvimento web:** interface responsiva, API REST e separação de responsabilidades.
- **Qualidade de software:** especificações de comportamento, testes e resultados de referência independentes.
- **Segurança e privacidade:** validação de entradas, limites de recursos e minimização de dados.
- **Integração de IA generativa:** contexto agregado, fatos verificáveis e distinção entre hipóteses e recomendações.

Procedimentos reutilizáveis do agente serão documentados progressivamente em `skills.md`, quando criado.

## Como executar

Pré-requisitos: Node.js 22 ou superior, npm e um navegador atualizado.
No terminal, entre na pasta do projeto e execute:

```sh
npm ci
npm start
```

Acesse [LogiAI local](http://127.0.0.1:3000). Não é necessária uma chave de IA para importar arquivos e consultar os indicadores.

| Comando | Uso |
| --- | --- |
| `npm start` | Iniciar a aplicação local |
| `npm run dev` | Iniciar com reinício automático do servidor ao alterar código |
| `npm test` | Executar os testes automatizados |

A variável de ambiente `PORT` permite trocar a porta; o endereço continua restrito a `127.0.0.1`.

## Configurar a IA

1. Mantenha sua conta Groq no plano **Free** e crie uma chave no [console da Groq](https://console.groq.com/keys).
2. Se `.env` ainda não existir, copie `.env.example` para `.env` na raiz do projeto.
3. Preencha `GROQ_API_KEY=` somente no `.env` local, sem compartilhar a chave em chats ou commits.
4. Reinicie com `npm start`, importe uma base válida e clique em **Gerar diagnóstico**.

O servidor carrega `.env` automaticamente; variáveis já definidas no ambiente têm precedência.
`.env` e suas variantes são ignorados pelo Git; somente `.env.example`, sem credenciais, é versionado.
O plano gratuito é definido na conta Groq, não por uma opção do código; cotas e disponibilidade podem mudar.
Limite de uso (`429`), chave recusada e falhas do provedor geram mensagens controladas, sem apagar indicadores.
Há uma chamada por vez, tempo limite de 20 segundos e até 4.096 tokens de conclusão, sem repetição automática.
Somente agregados e limitações são enviados; CSVs completos, nomes e IDs ficam fora do contexto externo.
Referências: [JSON Schema](https://console.groq.com/docs/structured-outputs) e [planos da Groq](https://console.groq.com/docs/billing-faqs).

## Primeiro uso

1. Clique em **Explorar demonstração** para conhecer o dashboard com dados fictícios.
2. Consulte **Ver formatos e regras** e baixe os modelos de CSV.
3. Preencha os arquivos da sua operação e selecione os três tipos de dados juntos.
4. Clique em **Analisar arquivos** e corrija os problemas informados, caso existam.
5. Confira os indicadores e a seção de qualidade, origem e critérios da análise.

Os exemplos estão em [assets/examples](assets/examples). A demonstração contém 6 pedidos,
4 entregas concluídas, 2 pedidos sem entrega, 50% de pontualidade e 3 ocorrências.

## Contrato dos dados

| Tipo | Colunas obrigatórias |
| --- | --- |
| Pedidos | `pedido_id`, `data_pedido`, `data_prevista`, `transportadora`, `destino` |
| Entregas | `entrega_id`, `pedido_id`, `data_entrega` |
| Ocorrências | `ocorrencia_id`, `pedido_id`, `data_ocorrencia`, `tipo` |

- Use UTF-8, com ou sem BOM, e vírgula ou ponto e vírgula como delimitador.
- Os cabeçalhos devem conter exatamente as colunas do tipo, em qualquer ordem.
- Datas devem representar dias reais no formato `AAAA-MM-DD`, sem horário, entre os anos 1900 e 9999.
- Todos os campos são obrigatórios; IDs são únicos por conjunto e diferenciam maiúsculas de minúsculas.
- Toda entrega ou ocorrência deve referenciar um `pedido_id` importado.
- O contrato inicial admite uma entrega e várias ocorrências por pedido.
- Previsão, entrega e ocorrência não podem anteceder a data do pedido relacionado.
- Os três tipos são necessários; entregas e ocorrências podem conter somente o cabeçalho.
- Vários arquivos do mesmo tipo podem ser consolidados, desde que tenham nomes diferentes.
- Qualquer erro rejeita o conjunto inteiro; até 100 detalhes de validação são exibidos por tentativa.

As regras completas e os limites de campos estão disponíveis na própria interface,
gerados pelo contrato em [src/contract.js](src/contract.js).

## Indicadores e critérios de interpretação

| Indicador | Cálculo |
| --- | --- |
| Pedidos importados | Quantidade de pedidos únicos validados |
| Entregas concluídas | Quantidade de pedidos com entrega registrada |
| Sem entrega registrada | Pedidos importados menos entregas concluídas |
| Pontualidade | Entregas com `data_entrega <= data_prevista` ÷ entregas concluídas × 100 |
| Ocorrências registradas | Quantidade de ocorrências únicas validadas |

Percentuais são arredondados para uma casa decimal. Sem entregas, a pontualidade fica indisponível,
em vez de assumir zero. O período exibido corresponde à menor e à maior data dos pedidos importados.
Pedidos sem entrega não são classificados como atrasados. Não há metas de desempenho ou filtros adicionais.
A análise considera apenas os arquivos enviados e não comprova a completude dos dados na origem.

## Arquitetura e organização

Fluxo principal: **CSVs → leitura → validação e relacionamento → indicadores → dashboard**.
A geração de diagnósticos consome agregados validados, sem interferir nesse fluxo.

```text
index.html            Interface principal
assets/
  style.css           Estilos e responsividade
  script.js           Importação e comunicação com a API
  view.js             Apresentação dos resultados
  examples/           CSVs fictícios para demonstração
server.js             Inicialização do servidor local
src/
  app.js              Rotas, segurança HTTP e tratamento de erros
  contract.js         Esquemas, limites e definições de indicadores
  csv.js              Interpretação de CSVs
  validation.js       Validação e integridade dos relacionamentos
  analysis.js         Cálculo determinístico e agregações
  store.js            Armazenamento temporário em memória
  ai.js               Contrato do adaptador e validação de respostas de IA
  providers/groq.js   Chamada à Groq, instruções e JSON Schema
  config.js           Carregamento local do .env
  errors.js           Erros controlados da aplicação
tests/                Testes de análise, API, armazenamento e IA simulada
```

As diretrizes do agente ficam na pasta de contexto separada `logiai-agent`: `agent.md` orienta a arquitetura,
`spec-driven.md` define o comportamento esperado, `contrato-mvp.md` detalha o contrato inicial e
`memory.md` registra decisões e aprendizados. Esses documentos não são necessários para executar a aplicação.

## Limites, segurança e privacidade

- Até 9 arquivos, 1 MiB por arquivo e 5 MiB por importação.
- Até 10.000 registros por arquivo e 20.000 por conjunto.
- Até 20 análises retidas em memória, com acesso por 30 minutos e limpeza periódica após a expiração.
- Os CSVs não são gravados no servidor; arquivos selecionados permanecem na memória do navegador.
- Resultados são descartados ao limpar a análise, expirar ou reiniciar o servidor.
- Fechar o navegador não garante descarte imediato no servidor; aplica-se a expiração.
- Conteúdos importados são exibidos como texto, sem execução de HTML ou scripts.
- O servidor restringe Host e origem para uso local; esta versão não fornece controle de acesso por usuário.

## Validação e evolução

Os testes cobrem indicadores com valores conhecidos, CSVs inválidos, duplicidades, relacionamentos,
limites, isolamento, expiração e proteção das rotas. A camada de IA é testada com respostas simuladas,
incluindo indisponibilidade, tempo limite e fatos numéricos incompatíveis com a base.

A integração utiliza o modelo escolhido na Groq; os testes usam respostas simuladas, sem consumir a API real.
Fatos numéricos são conferidos contra os indicadores; hipóteses e recomendações exigem revisão gerencial.
A qualidade semântica e o acesso real dependem de validação com a chave local e a conta do usuário.

Publicação e configuração de deployment serão tratadas em uma etapa posterior.
A validação de recomendações reais permanece necessária antes de considerar o MVP integralmente validado.
