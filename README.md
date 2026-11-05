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
