# Minhas Finanças — controle financeiro pessoal

Aplicação web responsiva com aparência de aplicativo (PWA) para acompanhar salário, gastos, cartões de crédito, empréstimos (inclusive consignado CLT), plano para sair do vermelho e metas. Tudo em português do Brasil, em reais, **sem servidor e sem conta**: os dados ficam no seu navegador.

## Por que aplicação web e não planilha

| Critério | Planilha no celular | App web (escolhido) |
|---|---|---|
| Registrar um gasto rápido | Células pequenas, rolagem lateral | Botão "+ Adicionar gasto" e formulário com botões grandes |
| Foto de nota/comprovante | Não acessa câmera nem lê texto | Câmera/galeria e leitura de texto no próprio navegador |
| Regras (parcelas, fatura, consignado) | Fórmulas frágeis, fáceis de quebrar | Regras testadas em código (`js/calc.js` + testes) |
| Manutenção | Fácil de editar, difícil de evoluir | Arquivos simples, sem build e sem dependências instaladas |

## Como executar

Não precisa instalar nada além de um servidor de arquivos estáticos. Na pasta do projeto:

```bash
python -m http.server 8765 --bind 127.0.0.1
```

Abra `http://localhost:8765` no computador. Também dá para abrir o `index.html` direto (duplo clique), mas aí não funciona offline nem instala.

### No celular

O app só pode ser **instalado** e funcionar **offline** quando é aberto por **https** (ou `localhost`). Opções:

1. **Hospedagem estática gratuita com https** (GitHub Pages, Netlify, Cloudflare Pages). Só os arquivos do app ficam publicados. **Seus dados continuam só no celular**, porque nada é enviado para o servidor. Isso **ainda não foi feito**: só faça se quiser e quando autorizar.
2. **Mesma rede Wi-Fi** (teste rápido): rode `python -m http.server 8765` (sem `--bind`) e abra `http://IP-DO-COMPUTADOR:8765` no celular. Funciona para usar, mas sem instalação nem modo offline, e os dados ficam presos a esse endereço.

### Adicionar à tela inicial
- **Android (Chrome/Edge/Samsung Internet):** menu ⋮ → *Instalar app* / *Adicionar à tela inicial*.
- **iPhone (Safari):** Compartilhar → *Adicionar à Tela de Início*. No iOS, o app instalado guarda os dados separados do Safari.
- **Computador (Chrome/Edge):** ícone de instalar na barra de endereço.

## Onde os dados ficam

- **Lançamentos:** `localStorage` do navegador, na chave `controle-financeiro.v1`.
- **Fotos:** IndexedDB do navegador (banco `controle-financeiro-fotos`), comprimidas para cerca de 1400 px em JPEG.
- **Nada é enviado** para servidores. Não há login, nuvem nem conexão com bancos.
- **Se você limpar os dados do navegador, usar modo anônimo, desinstalar o navegador ou trocar de celular, os dados se perdem** sem backup.
- O armazenamento local **não é criptografado nem protegido por senha**. Quem usa o aparelho desbloqueado pode ver os dados. Use o bloqueio de tela.
- Em *Mais → Backup e dados* há um botão para pedir ao navegador que não apague os dados automaticamente (`navigator.storage.persist`).

## Backup

*Mais → Backup e dados*:
- **Baixar backup** gera um arquivo `.json`, com ou sem as fotos (as fotos vão em base64, então o arquivo fica maior).
- **Restaurar backup** valida o arquivo, mostra um resumo e substitui os dados do aparelho.
- O arquivo **não é criptografado**. Guarde em local de confiança.
- Para trocar de celular: faça o backup no aparelho antigo, abra o app no novo e use *Restaurar um backup*.

## Leitura de notas e comprovantes (OCR)

- Usa o **Tesseract.js 5.1.1** (código aberto, gratuito), que roda **dentro do navegador**. **A imagem não sai do aparelho.**
- Na primeira leitura, o navegador baixa a biblioteca e o idioma português do CDN **jsDelivr** (alguns MB; o app pede consentimento antes). Precisa de internet nessa primeira vez.
- **Não tem custo** nem cadastro.
- O resultado é sempre uma **sugestão**. Campos lidos ficam com borda amarela, campos não identificados com borda vermelha. **Nada é salvo sem você tocar em "Salvar".**
- Funciona bem em fotos nítidas e bem iluminadas. Fotos tortas, amassadas ou de baixa resolução erram mais.
- **Alternativas mais precisas (não implementadas):** Google Cloud Vision, Azure AI Vision, AWS Textract ou modelos de IA com visão. Todas **enviam a imagem a um serviço externo**, exigem conta e chave de API e podem cobrar por uso. Também seria preciso um pequeno servidor para não expor a chave no navegador.
- Também existe verificação de **possível duplicidade** (mesmo valor, data em até 2 dias e nome parecido). Ela só avisa, não bloqueia.

## Regras de cálculo (resumo)

- Valores em **centavos inteiros**, sem erros de arredondamento. Nas parcelas, a sobra de centavos vai para a 1ª.
- **Saídas do mês** = despesas diretas (Pix, débito, boleto…) + **valor total das faturas** que vencem no mês + parcelas de empréstimos pagas manualmente.
- **Compras no cartão não são somadas de novo**: elas formam a fatura. O pagamento da fatura é o dinheiro que sai da conta.
- **Fatura:** compra feita no dia do fechamento ou depois vai para a fatura seguinte. Cada compra pode ter a fatura corrigida manualmente.
- **Limite disponível** é uma *estimativa*: limite − tudo que ainda não foi pago nas faturas cadastradas.
- **Salário:**
  - *Líquido*: o valor que cai na conta. Consignados em folha já estão dentro dele e não são subtraídos de novo.
  - *Referência*: valor − descontos que você informou − consignados em folha. O consignado entra uma única vez, no primeiro salário do mês.
  - Nenhum imposto é calculado automaticamente.
- **Consignado em folha** aparece no total comprometido com empréstimos, mas não como saída da conta.
- **Empréstimos:** "soma estimada das parcelas restantes" = parcela × restantes. **Não é** saldo devedor nem valor de quitação. O saldo real é o informado por você a partir do banco.
- **Atrasos:** só aparecem quando você marca. Vencimento passado sem pagamento aparece como "confira", não como atrasado.
- **Ordem de atenção** é uma sugestão: atrasadas/vencidas → essenciais → juros informados (maior primeiro) → vencendo em 10 dias.

### Testes

```bash
node --test tests/calc.test.js
```

São 16 testes. Eles cobrem parcelamento, fechamento e vencimento de fatura (inclusive virada de ano), pagamento parcial, limite estimado, não duplicidade entre compra e fatura, salário líquido versus referência com consignado, empréstimos, despesas recorrentes, pendências, alertas, duplicidade, metas e extração de dados de nota.

## Estrutura

```
index.html              casca do app (barra superior, navegação, botão de gasto)
manifest.webmanifest    instalação na tela inicial
sw.js                   cache dos arquivos para uso offline (não guarda dados financeiros)
css/app.css             estilos (claro/escuro automático, celular e computador)
js/calc.js              regras de cálculo puras (testáveis no Node)
js/util.js              formatação pt-BR, moeda, datas
js/store.js             localStorage, IndexedDB (fotos), backup
js/ocr.js               leitura de nota (Tesseract.js) + interpretação do texto
js/demo.js              dados fictícios relativos ao mês atual
js/forms.js             painéis e construtor de formulários
js/app.js               navegação, estado, ações globais
js/views-*.js           telas: início, lançamentos, cartões, dívidas, mais
tests/calc.test.js      testes dos cálculos
```

## O que ainda não existe / próximos passos

- **Usar em mais de um aparelho (sincronização):** precisaria de login e banco de dados na nuvem, por exemplo Supabase ou Firebase (ambos com plano gratuito). O que falta configurar:
  1. Criar o projeto e as tabelas.
  2. Adicionar autenticação por e-mail.
  3. Ativar regras para que cada pessoa só leia os próprios dados.
  4. Trocar `store.js` por uma camada que sincroniza.

  Isso envia seus dados para um serviço externo, então só deve ser feito com a sua autorização. Até lá, use o backup para levar os dados de um aparelho a outro.
- **Notificações** (celular, e-mail, WhatsApp): **não implementadas**. Os avisos aparecem só dentro do app.
- **Saldo acumulado entre meses:** cada mês mostra só as próprias entradas e saídas.
- **Importar extrato/OFX ou a planilha antiga:** não implementado.
- **Senha/PIN no app:** não implementado. Use o bloqueio do celular.
