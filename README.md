# Kixel

Editor de pixel art em tela infinita: vários quadros, contêineres, camadas, referências, notas, animação com player, exportação (PNG, .aseprite, sprite sheet, SVG, GIF, Godot), espaços de trabalho e tradução em português, inglês e espanhol. Feito com TypeScript, WebGL2 e Vite.

As mudanças por versão estão no [CHANGELOG](CHANGELOG.md). Os commits seguem o padrão Conventional Commits (`feat`, `fix`, `docs`...) e o hook em `.githooks/` confere o formato: ative com `git config core.hooksPath .githooks`.

## Como rodar
```bash
npm install
npm run dev          # http://localhost:5190 (e na rede local)
npm run build        # tsc + vite build
```

### No celular Android, pelo cabo
```bash
adb reverse tcp:5190 tcp:5190
adb shell am start -a android.intent.action.VIEW -d "http://localhost:5190/?auto=5000&s=10"
```
O resultado do teste automático é gravado em `bench.log`. Outros valores de `auto`: 1000, 20000.

## Controles
| Ação | Mouse e teclado | Toque |
|---|---|---|
| Desenhar | B lápis, E borracha, G balde, I conta-gotas | 1 dedo |
| Mover a tela | Espaço + arrastar, ou botão do meio | 2 dedos |
| Zoom | roda do mouse (passos inteiros) | pinça |
| Desfazer | Ctrl+Z | toque rápido com 2 dedos |
| Menu do que está sob o cursor | botão direito | toque longo (com Selecionar; com ferramentas de desenho o toque longo é traço) |
| Ver tudo | Shift+1 | botão ⤢ |
| Zoom no quadro | Shift+2 ou duplo clique | – |
| Atalhos | `?` | botão ao lado do zoom |

## Ferramentas
As parecidas ficam num botão só na barra, com uma seta que abre a lista. O botão mostra a última usada e o Kixel lembra a escolha. Os atalhos continuam valendo.

| Grupo | Ferramentas |
|---|---|
| Soltas | Selecionar (V), Mão (H), Lápis (B), Borracha (E), Sombra (D), Conta-gotas (I), Nota (T) |
| Formas | Retângulo (U), Linha (L), Elipse (O), Polígono (P), Curva (C) |
| Seleção | Retângulo (M), Laço (Q), Varinha mágica (W) |
| Preenchimento | Balde (G), Degradê (R) |
| Quadros | Quadro (F), Contêiner (S), Animação (A) |

### Desenho
- **Pincel:** tamanho de 1 a 32 px e opacidade de 1 a 100%, editáveis digitando ou rolando o mouse sobre o número (Shift muda de 1 em 1). A opacidade vale para lápis, formas e balde; na borracha tira só parte da opacidade.
- **Opções:** pixel perfect, espelho horizontal (X) e vertical (Y), pincel redondo, modo tile (o desenho dá a volta pelas bordas), onion skin, preencher formas, balde global.
- **Sombra (D):** clareia ao pintar, Alt escurece (sombras para o azul, luzes para o amarelo).
- **Pontilhado:** 25%, 50% ou 75%, em padrão fixo, para lápis, borracha e formas.
- **Formas:** Shift trava ângulo, quadrado ou círculo. Polígono: clique nos pontos, clicar no primeiro fecha, clicar no último (ou Enter) termina, Backspace tira o último ponto, Esc cancela. Curva: clique no começo, no fim e onde ela deve entortar.
- **Degradê (R):** da cor atual até a cor final, pontilhado (Bayer 4x4) ou em faixas de 5 tons, linear ou radial. Com seleção de pixels, só ela é preenchida.
- **Tolerância:** quanto uma cor pode diferir, na varinha e no balde.

### Seleção de pixels
- Retângulo, laço (à mão) ou varinha mágica (cores parecidas; Shift soma, Alt pega todos do quadro). Ctrl+Shift+I inverte, Ctrl+A seleciona tudo, Ctrl+D desmarca.
- 8 alças para esticar ou amassar, sem borrar. Shift mantém a proporção; passar da borda oposta espelha.
- Mover arrastando ou com as setas (Shift: 8 px). Alt+arrastar leva uma cópia.
- Shift+H e Shift+V espelham, Shift+R gira 90°, girar em qualquer ângulo pelo menu do botão direito.
- Ctrl+C, Ctrl+X e Ctrl+V copiam, recortam e colam. "Usar a seleção como pincel" carimba com as cores dela.

### Cores
- **Ajustar cores:** matiz, saturação e brilho, inverter e contorno automático, na seleção ou no quadro todo.
- **Cores do quadro:** lista as cores usadas, com hex, opacidade e quantos pixels usam. Mudar uma troca em todos os pixels.
- **Rampa:** gera 7 tons da cor atual e guarda em "Minha paleta".
- **Seletor de cor próprio:** quadrado de cor, matiz, opacidade, hex, conta-gotas da tela (quando o navegador tem) e a paleta do quadro.
- **Paletas:** cada quadro guarda a sua. Sweetie 16, Game Boy, Game Boy Pocket, NES, Master System, GBA, PICO-8, Commodore 64, ZX Spectrum, EGA, CGA e "Minha paleta". Dados em `src/data.ts`. Importa `.gpl`, `.hex`, `.pal` e `.txt`, e extrai a paleta de uma imagem ou do desenho (botão no painel Cor).

## Quadros, contêineres e camadas
- **Árvore de camadas única (esquerda):** quadros, imagens de referência, notas e contêineres na mesma lista. Arraste para reordenar; solte no meio de um contêiner para colocar dentro. Olho oculta, cadeado trava, duplo clique renomeia. A ordem da lista decide quem aparece por cima.
- **Quadros:** a ferramenta Quadro (F) abre uma lista de tamanhos (comuns, portáteis, consoles, computadores, ícones), aceita largura e altura livres ou arrastar na tela. Até 2048 × 2048. Alças nos 8 pontos redimensionam sem mexer nos pixels. Fundo sólido ou transparente (xadrez).
- **Seleção múltipla:** Shift + clique, ou arrastar uma área vazia. Mover, duplicar, apagar, exportar e agrupar valem para todos. Alinhar, distribuir e linhas-guia que grudam (Ctrl desliga).
- **Contêineres (S, ou Ctrl+G):** arrastar o contêiner move tudo dentro. Ctrl+Shift+G desagrupa.
- **Camadas do quadro:** nova, duplicar, subir, descer, ocultar, renomear, opacidade, mesclar com a de baixo, modo de mesclagem (multiplicar, tela, sobrepor, somar) e travar transparência.
- **Nomes:** quadros e contêineres usam o menor número livre.
- **Referências e notas:** imagem de referência com opacidade, bloquear, mostrar na frente, "Calcar no quadro", "Reduzir para pixels", "Fixar na tela", fatiar em quadros. Nota (T): texto na tela, com cor e tamanho.
- **Botão direito (estilo Figma):** menu do que está sob o cursor (quadro, contêiner, imagem, nota, tela vazia, seleção de pixels). Com lápis ou borracha sobre um quadro, continua apagando.

## Animação
- Um contêiner com 2 ou mais quadros do mesmo tamanho vira animação. Ferramenta Animação (A), botão de filme na lista ou "Criar animação com estes quadros" no menu.
- **Player na tela:** play e pausa, passo a passo, velocidade contínua de 0,1× a 10×, FPS até 120, duração própria por frame, modos em sequência, vai e volta e de trás para frente. Sempre dentro da tela; o alfinete faz o sprite acompanhar o zoom.
- **Ordem dos frames:** miniaturas no player (arraste para reordenar) e janela "Organizar" com seleção múltipla, arrastar em bloco, mover com `[` e `]`, ir ao início ou ao fim, inverter, voltar à ordem pela tela e duração em lote.
- **Tags (ações):** grupos de frames como "andar" e "atacar" no mesmo contêiner, cada uma com o seu modo de reprodução. A tag escolhida é a que toca e vai para o GIF e o .aseprite.
- **Onion skin:** 1 a 3 frames de cada lado (antes em vermelho, depois em azul), mais fracos quanto mais longe.

## Arquivos
- **Projeto (Ctrl+S / Ctrl+O):** arquivo `.kixel` com quadros, camadas, contêineres, imagens, notas, ordem, tags e paletas. Salva sozinho no navegador (IndexedDB).
- **Exportar:** PNG (escala automática ou 1× a 16×, com ou sem fundo, copiar para a área de transferência), SVG, GIF animado, paleta `.gpl`, `.aseprite` (camadas, mesclagem, frames e tags) e sprite sheet PNG + JSON no formato do Aseprite, com espaço entre quadros, colunas e corte do espaço vazio.
- **Godot:** gera `nome.png` e `nome.tres` (SpriteFrames do Godot 4, uma animação por tag mais a "default"). Coloque na pasta do projeto, use o `.tres` num `AnimatedSprite2D` e deixe o filtro de textura em Nearest.
- **Importar:** `.aseprite` (camadas, opacidade, frames viram animação, tags) e sprite sheet em grade (corta em quadros do tamanho informado, pula células vazias e monta a animação).

## Espaços de trabalho e idiomas
- **Tela inicial:** lista de espaços de trabalho (cada um é uma tela infinita) com miniatura, número de quadros e data. Criar, abrir, renomear, duplicar, baixar como `.kixel` e excluir. O endereço (`#/w/...`) mantém o espaço aberto. Tudo fica no navegador. O logo abre o menu do Kixel e leva de volta à tela inicial.
- **Compartilhar em tempo real:** feito e testado, mas retirado por enquanto (fica para depois, com hospedagem própria). O código completo está em `_futuro-online/`.
- **Português, inglês e espanhol:** o idioma segue o do navegador e muda na hora pelo menu do logo ou pela tela inicial. O texto-fonte do código é o português; `src/i18n.ts` traduz na tela usando `src/i18n/en.ts` e `src/i18n/es.ts`. Chaves com `{nome}` casam com trechos variáveis. Para achar o que falta traduzir, abra o app com `?probe=1`: cada texto sem tradução é gravado em `i18n-missing.log` (só no servidor de desenvolvimento).

## Interface
Layout de estúdio: árvore de camadas à esquerda, painel contextual (muda conforme o que está selecionado) à direita, ferramentas flutuantes embaixo e barra de contexto no topo. Em telas até 900 px vira o layout de ilhas: paleta e ferramentas embaixo, painéis em gavetas (botões "Camadas" e "Painel"). No celular, o player começa compacto (▾ mostra o resto) e o toque longo abre o menu do que está sob o dedo. O painel "Desempenho" (estresse e teste de 10 s) fica recolhido na direita.

Visual limpo, cantos suaves e cinzas frios, com destaque verde-menta `#4de3b5`. Fonte Geist (texto) e Geist Mono (números), ícones Lucide.

**Logo:** um K de pixels (grade 7×7, haste e braços de 2 pixels) dentro de uma moldura de quatro cantos, como o quadro do editor. Paleta: menta `#4de3b5`, grafite `#18191e`, branco `#f4f4f4` e, só para fundo claro, o menta escuro `#16a37c`. Os arquivos ficam em `brand/` (`svg/` é a fonte, `png/` tem 1024 px com fundo transparente): ícone de app (principal, todo menta, todo branco, menta com preto, todo preto no branco) e marca solta (principal para fundo escuro, toda menta, toda branca, toda preta e para fundo claro). Em `public/` estão o que o app usa: `mark.svg` (favicon e ícone), `favicon.ico`, `apple-touch-icon.png`, `icon-192.png`, `icon-512.png`, `logo.svg` e `logo-dark.svg` (símbolo + nome, para fundo escuro e claro) e `wordmark.svg` e `wordmark-dark.svg` (só o nome, desenhado a partir da Geist Bold, com um quadradinho no lugar do pingo do i).

## Como é por dentro
- Núcleo em TypeScript puro (`doc.ts`): quadros, atlas, índice espacial, histórico.
- Renderização em WebGL2 (`gl.ts`): os quadros de uma página saem em **uma** chamada de desenho; contorno e xadrez no shader.
- Desfazer por diferença: guarda só a área alterada de cada traço.
- Quadros vivem em páginas de atlas 2048×2048 por classe de tamanho (16, 32, 64).
- Testes de navegador (Playwright) em `tools/e2e/`; `tools/mapa.sh` mostra um índice do código com números de linha.
