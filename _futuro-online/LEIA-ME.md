# Colaboração em tempo real (guardada para depois)

Retirada do app em 22/11/2026, mas funcionando e testada com duas janelas.

- `kixel-com-colaboracao.tgz`: cópia completa do projeto com a colaboração ligada (src, server, vite.config.ts, package.json, index.html, README).
- `collab.ts`: cliente (envia cada objeto inteiro ao mudar, último a gravar vence, cursores, ids sem colisão).
- `collab-server.mjs`: relé WebSocket (salas em memória), usado como plugin do Vite em `/__collab`. Precisa do pacote `ws`.

Para voltar: extrair o `.tgz` por cima, rodar `npm install` e hospedar o relé num endereço público
(ou trocar por um serviço de tempo real, como o Supabase Realtime ou Cloudflare Durable Objects).
