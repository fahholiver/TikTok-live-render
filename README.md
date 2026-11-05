# TikTok Live Reader

A pasta dist é a demonstração estática do painel. Os botões de teste
enviam eventos também ao overlay aberto no mesmo navegador e perfil.

Para receber eventos reais, implante o projeto como serviço Node.js no Render.
Use o Blueprint render.yaml e configure READER_PASSWORD com no mínimo 16
caracteres. Entre no painel com o usuário reader e essa senha. O botão de copiar
fornece um link de leitura para o OBS. Compartilhe-o apenas com quem deve ver
o feed. Alterar READER_PASSWORD invalida os links anteriores.

O serviço usa uma live pública por instância. Digite o @ quando a live
estiver aberta. A voz sai do navegador do painel e o overlay é silencioso.
O conector TikTok é não oficial.

Para validar localmente, execute npm ci e npm test. Para iniciar o modo
local, execute npm start e abra http://127.0.0.1:8765.

## Back4app + EulerStream (eventos reais)

Variáveis em Back4app → Environment:

- `READER_PLATFORM=back4app`
- `READER_PASSWORD` (mínimo 16 caracteres)
- `EULERSTREAM_API_KEY`: chave do plano Community do EulerStream. Com ela,
  o servidor usa o WebSocket gerenciado `wss://ws.eulerstream.com` em vez da
  rota de assinatura, que exige o plano Business.

Ao conectar, os logs do container mostram linhas `[EulerStream @perfil]`:
"WebSocket aberto", o primeiro evento de cada tipo com os nomes dos campos e,
ao fechar, o código e a contagem de eventos recebidos. Se chegarem eventos e
nada aparecer no painel, essas linhas mostram o formato real. A chave não é
registrada nos logs.

`npm test` também valida esse caminho com um servidor WebSocket falso.
