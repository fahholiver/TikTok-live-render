# Veo → Google Drive (pelo celular)

Página web pessoal, hospedada de graça no Google Apps Script. Você escreve o
prompt no celular, o Veo gera o vídeo e o arquivo `.mp4` é salvo sozinho na
pasta **Veo** do seu Google Drive. Não precisa de servidor nem de computador
ligado.

## O que é grátis e o que não é

| Parte | Custo |
|---|---|
| Google Apps Script (página + gatilho) | Grátis com conta Google comum |
| Google Drive | Grátis até 15 GB (um vídeo de 8 s fica entre 2 e 10 MB) |
| **Veo na API Gemini** | **Pago.** O Veo não tem cota no nível gratuito da API. A chave precisa estar num projeto com faturamento ativo. Contas novas do Google Cloud costumam ganhar créditos de avaliação, que cobrem vários vídeos. |

Confira o preço atual por segundo de vídeo em
https://ai.google.dev/gemini-api/docs/pricing antes de usar. O modelo padrão
(`veo-3.1-fast-generate-preview`) é a opção mais barata da família Veo 3.1.

> Gerar vídeos no app Gemini ou no Google Flow usa a cota da sua assinatura,
> mas esses apps não têm API. Por isso eles não entram numa automação.

## Instalação (uns 10 minutos, dá para fazer pelo celular no modo "site para computador")

1. **Chave da API:** abra https://aistudio.google.com/apikey, crie uma chave e
   ative o faturamento no projeto dela.
2. **Projeto:** abra https://script.google.com e clique em *Novo projeto*.
   Dê o nome "Veo Drive".
3. **Arquivos:**
   - Substitua o conteúdo de `Código.gs` pelo de [`Code.gs`](Code.gs).
   - Clique em **+ > HTML**, crie o arquivo `Index` e cole [`Index.html`](Index.html).
   - Em *Configurações do projeto*, marque "Mostrar o arquivo de manifesto
     appsscript.json". Depois substitua o conteúdo dele pelo de
     [`appsscript.json`](appsscript.json).
4. **Chave no script:** em *Configurações do projeto > Propriedades do script*,
   adicione `GEMINI_API_KEY` com a sua chave. Opcionais: `VEO_MODEL` para
   trocar o modelo e `DRIVE_FOLDER` para trocar o nome da pasta.
5. **Autorizar e testar:** no editor, selecione a função `setup` e clique em
   *Executar*. Aceite as permissões. O log deve dizer "Tudo certo". Se der
   erro de modelo, troque `VEO_MODEL` por um ID listado na documentação do Veo
   (ex.: `veo-3.1-generate-preview` ou `veo-3.0-fast-generate-001`).
6. **Publicar:** *Implantar > Nova implantação > App da Web*. Use "Executar como:
   eu" e "Quem pode acessar: somente eu". Copie a URL `/exec`.
7. **No celular:** abra a URL no Chrome ou Safari e use *Adicionar à tela
   inicial*. Ela vira um "app".

## Uso

1. Escreva o prompt, escolha 9:16 (TikTok) ou 16:9 e toque em **Gerar vídeo**.
2. Pode fechar a página. Um gatilho verifica a geração a cada minuto, que
   costuma levar de 1 a 6 minutos. Quando o vídeo fica pronto, ele baixa o
   arquivo para o Drive e se desliga sozinho.
3. Volte à página para ver o link **Abrir no Drive**. O app do Drive também
   mostra o arquivo na pasta **Veo**.

## Observações

- A chave fica nas propriedades do script. Ela nunca vai para a página nem
  para o navegador.
- Como o acesso é "somente eu", só a sua conta Google abre a página.
- O Google apaga os vídeos dos servidores dele cerca de 2 dias depois de
  gerar. A cópia que fica valendo é a do Drive.
- Se o Veo bloquear o prompt por política de conteúdo, o trabalho aparece com
  status **erro** e o motivo.
- Se você alterar o código, faça *Implantar > Gerenciar implantações > Editar >
  Nova versão* para a URL usar a versão nova.
