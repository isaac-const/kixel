# Kixel

Editor de pixel art em tela infinita: vários quadros, contêineres, camadas, referências, notas, animação com player, exportação (PNG, .aseprite, sprite sheet, SVG, GIF, Godot), espaços de trabalho e tradução em português, inglês e espanhol. Feito com TypeScript, WebGL2 e Vite.

## Como rodar
```bash
npm install
npm run dev          # http://localhost:5190 (e na rede local)
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
| Novo quadro | F e clique, ou botão "＋ Quadro" | botão |
| Mover quadro | V e arrastar; setas movem 1 pixel | arrastar |
| Ver tudo | Shift+1 | botão ⤢ |
| Zoom no quadro | Shift+2 ou duplo clique | – |
| Espelho, pincel | X, `[` e `]` | opções do topo |

## v2: o que mudou
- **Árvore de camadas única (esquerda):** quadros, imagens de referência e contêineres na mesma lista, com ícones diferentes. Arraste uma linha para reordenar; solte no meio de um contêiner para colocar dentro. Olho oculta, cadeado trava a imagem, duplo clique renomeia.
- **Nome do quadro no canvas:** clique no nome acima do quadro para selecionar (Shift + clique soma), arraste o nome para mover, duplo clique renomeia (F2 também).
- **Redimensionar:** alças nos 8 pontos do quadro ou do contêiner; nas imagens, 4 cantos mantendo a proporção. Os pixels ficam no lugar.
- **Seleção múltipla:** Shift + clique, ou arrastar uma área vazia (Shift soma). Mover, duplicar, apagar, exportar e agrupar valem para todos.
- **Contêineres (S, ou Ctrl+G com quadros selecionados):** arrastar o contêiner move todos os quadros dentro. Quadro solto com o centro dentro de um contêiner passa a fazer parte dele. Ctrl+Shift+G desfaz o agrupamento.
- **Camadas dentro do quadro:** nova, duplicar, subir, descer, ocultar, renomear. O desenho vai na camada ativa.
- **Paleta por quadro:** cada quadro guarda a sua. Quadro novo herda a do último quadro usado; escolher um console nos tamanhos já traz a paleta dele. "Usar em todos os quadros" aplica de uma vez.
- **Fundo do quadro:** cor sólida ou transparente (xadrez), também nas cores da paleta.
- **Referência:** opacidade começa em 100%, bloquear, mostrar na frente, e três ações com explicação ("Calcar no quadro", "Reduzir para pixels", "Fixar na tela").
- **Desfazer:** cobre agora adicionar/excluir imagem, mover, redimensionar, renomear, fundo, paleta, camadas, ordem, agrupar e opacidade.
- **Exportar:** aparece ao selecionar um quadro, mostra o tamanho final em pixels, escala automática ou 1× a 16×, opção de incluir o fundo, baixar um PNG por quadro e copiar para a área de transferência.
- **Botão do meio** só move a tela; colar imagem só vale com Ctrl+V.

## v3: notas, projeto e formatos
- **Nota (T):** componente de texto na tela, como as imagens: arrasta, redimensiona pelas alças, escala com o zoom, tem cor e tamanho de texto, aparece na árvore e entra no desfazer. Duplo clique escreve direto nela.
- **Projeto (Ctrl+S / Ctrl+O):** salva e abre um arquivo `.kixel` (quadros com camadas, contêineres, imagens, notas, ordem e paletas).
- **Exportar:** PNG, `.aseprite` (com as camadas; vários quadros do mesmo tamanho podem virar uma animação), sprite sheet PNG + JSON no formato do Aseprite, SVG e paleta `.gpl`.

## v4: menu, formas, seleção e animação
- **Botão direito (estilo Figma):** menu do que está sob o cursor: quadro (copiar, colar aqui, duplicar, ordem, agrupar, espelhar, girar, renomear, ocultar, ir até, exportar, excluir), contêiner, imagem, nota e tela vazia. Também funciona nas linhas da árvore. Com lápis ou borracha sobre um quadro, o botão direito continua apagando.
- **Ordem de camadas valendo de verdade:** a ordem da lista decide qual quadro aparece por cima (e qual recebe o clique) quando eles se sobrepõem.
- **Atalhos novos:** Ctrl+C/V (quadros ou pixels), Ctrl+] e Ctrl+[ (ordem), Shift+H/V (espelhar), Shift+R (girar 90°), Ctrl+Shift+H (ocultar), Ctrl+Shift+L (bloquear imagem).
- **Formas:** linha (L), retângulo (U), elipse (O), com opção de preencher e Shift para travar ângulo, quadrado ou círculo. Cada forma é um passo no desfazer.
- **Seleção de pixels (M):** arraste para selecionar, arraste dentro para mover, Delete limpa, Ctrl+C/X/V copiam, recortam e colam.
- **Animação:** um contêiner com 2 ou mais quadros do mesmo tamanho vira animação, tocando da esquerda para a direita. Prévia com FPS, "Novo frame" (cópia do último), GIF animado e `.aseprite` com os frames.

## v5: cores, alinhar, importar, camadas e salvamento
- **Cores do quadro (como "Selection colors" do Figma):** aba Cor lista as cores do quadro selecionado, com hex, opacidade e quantos pixels usam. Mudar uma troca em todos os pixels (de todas as camadas) e entra no desfazer.
- **Salvamento automático** no navegador (IndexedDB), recuperado ao abrir. Ctrl+S / Ctrl+O continuam salvando e abrindo arquivos `.kixel`. "Novo projeto" fica no menu do botão direito na tela vazia.
- **Alinhar e distribuir** (2 ou mais quadros) na aba Quadro, e **linhas-guia** que grudam nas bordas e nos centros ao arrastar (Ctrl desliga).
- **Importar:** `.aseprite` (camadas, opacidade, frames viram animação), sprite sheet em grade (Fatiar em quadros) e paletas `.gpl`, `.hex`, `.pal`, `.txt`. Também extrai a paleta de uma imagem.
- **Camadas:** opacidade por camada, mesclar com a de baixo e arrastar para reordenar. Vale também no `.aseprite`.
- **Ordem entre imagens e quadros:** imagens de referência entram na lista e seguem a ordem de camadas junto com os quadros.
- **Animação:** duração por frame, frame anterior semitransparente (onion skin) e prévia respeitando os tempos.
- **Ajuda de atalhos** (tecla ? ou botão ao lado do zoom).

- **Seletor de cor próprio:** quadrado de cor, matiz, opacidade (nas cores do quadro), hex, conta-gotas da tela (quando o navegador tem) e as cores da paleta do quadro. Substitui o seletor nativo do navegador em todos os lugares.

## v6: tela inicial, espaços de trabalho e compartilhamento
- **Fundo do quadro acompanha o quadro:** o xadrez da transparência agora nasce no canto do próprio quadro e anda junto quando ele é movido.
- **Tela inicial:** lista de espaços de trabalho (cada um é uma tela infinita), com miniatura, número de quadros e quando foi editado. Criar, abrir, renomear, duplicar, baixar como `.kixel`, excluir, abrir arquivo e entrar numa sala. O nome do espaço se edita no topo do editor; clicar no logo volta para a tela inicial. Tudo fica no navegador (IndexedDB) e o endereço (`#/w/...`) mantém o espaço aberto ao recarregar.
- **Compartilhar em tempo real:** feito e testado, mas **retirado por enquanto** (fica para depois, com hospedagem própria). O código completo está em `_futuro-online/`.
- Removido o botão "Em todos": cada quadro tem a sua paleta, e ao selecionar vários quadros (Ctrl+A para todos) trocar a paleta vale para todos os selecionados.

## v7: ajustes de uso
- O logo no topo da barra esquerda abre o menu do Kixel (como o do Figma): "Voltar para a tela inicial" em primeiro, depois novo espaço, abrir e baixar arquivo, importar .aseprite, desfazer, selecionar tudo, ver tudo e atalhos.
- Removido o botão "Novo quadro" da barra esquerda (a ferramenta Quadro, tecla F, continua na barra de ferramentas). Tela vazia mostra uma dica com botão "Criar quadro".
- Nomes de quadros e contêineres usam o menor número livre: apagar o "Quadro 1" e criar outro volta a ser "Quadro 1".
- "Abrir arquivo .kixel" (Ctrl+O) agora cria um novo espaço de trabalho em vez de substituir o atual; "Baixar arquivo" usa o nome do espaço.

## v8: controles, animação e Godot
- **Barra do topo:** tamanho do pincel (1 a 32 px) e opacidade (1 a 100%) editáveis digitando ou rolando o mouse sobre o número (Shift muda de 1 em 1). Pixel perfect virou botão que liga e desliga. A opacidade vale para o lápis, a linha, as formas e o balde; na borracha, ela tira só uma parte da opacidade do que já existe.
- **Opções da ferramenta (direita):** botões com ícone que ficam ativos ou inativos: Pixel perfect, Espelho, Sombra do frame anterior e Preencher formas. (O zoom já para sempre em tamanhos inteiros, então não há mais botão para isso.)
- **Menu do logo:** clicar de novo no logo fecha o menu.
- **Player de animação na tela:** clique com o botão direito em quadros selecionados e escolha "Criar animação com estes quadros", ou ligue "Player na tela" no painel de um contêiner. Uma janelinha ao lado do contêiner toca os quadros de dentro em loop, com play e pausa, passo a passo, velocidade de 0,25× a 4× e FPS. Jogar um quadro dentro do contêiner já o coloca na animação. A ordem é pela posição (de cima para baixo, da esquerda para a direita) e cada frame pode ter duração própria.
- **Exportar para Godot:** gera `nome.png` (sprite sheet) e `nome.tres` (SpriteFrames do Godot 4, com a velocidade, o loop e a duração de cada frame). Coloque os dois na pasta do projeto (`res://`) e use o `.tres` em um `AnimatedSprite2D`. Para pixel art, deixe o filtro de textura do projeto em Nearest. Validado abrindo no Godot 4.7.

## v9: animação à vista, painel da imagem e ajustes
- **Animação mais fácil de achar:** ferramenta **Animação** na barra (tecla A, arraste sobre os quadros), botão de filme na lista de camadas e no painel do quadro (cria a animação com os quadros selecionados).
- **Player:** sempre dentro da tela (nunca cortado) e com campo de FPS legível. O botão de alfinete no cabeçalho do player faz o sprite acompanhar o zoom do canvas (tamanho real), em vez de ter tamanho fixo na tela.
- **Ordem dos frames:** miniaturas no player; clique para ir ao frame, arraste para mudar a ordem (entra no desfazer). "Ordem pela posição na tela" volta ao padrão. A ordem vale também para GIF, `.aseprite` e Godot.
- **Painel da imagem de referência:** duas abas, "Imagem" (nome, opacidade, bloquear, na frente dos quadros, fixar, excluir) e "Usar no desenho" (calcar, reduzir para pixels, fatiar em quadros e extrair paleta, estes dois recolhíveis).
- **Contêiner mais justo:** a margem e o espaço entre quadros agora são proporcionais ao tamanho dos quadros (3 a 8 unidades; antes eram sempre 12 e 8).
- Abrir e baixar arquivo `.kixel` ficam só no menu do logo (e Ctrl+O, Ctrl+S).

## v10: idiomas, velocidade e git
- **Português, inglês e espanhol:** o idioma segue o do navegador e muda na hora pelo menu do logo (seção "Idioma") ou pelo seletor da tela inicial; a escolha fica guardada. O texto-fonte do código é o português; `src/i18n.ts` traduz na tela (textos, dicas e avisos) usando os dicionários `src/i18n/en.ts` e `src/i18n/es.ts`. Chaves com `{nome}` casam com trechos variáveis (números, nomes) e `{~nome}` também traduz o trecho. Nomes que você digita (quadros, camadas, espaços) nunca são traduzidos; os nomes padrão de itens novos (Quadro 1, Camada 1…) nascem no idioma em uso.
- **Achar o que falta traduzir:** abra o app com `?probe=1` no endereço; cada texto sem tradução é gravado em `i18n-missing.log` (só no servidor de desenvolvimento).
- **Player:** velocidade contínua de 0,1× a 10× (campo, rolagem do mouse, − e +), FPS até 120 e duração própria de cada frame.
- **Git:** o projeto agora é um repositório; cada funcionalidade nova entra em um commit.
- **Celular:** o player começa compacto (▾ mostra o resto); toque longo (550 ms) abre o menu do que está sob o dedo; as gavetas Camadas e Painel têm botão X. Em celular deitado a tela fica apertada e o player pode encostar na faixa de cores.

## v11: transformar a seleção e novas opções de desenho
- **Seleção de pixels:** 8 alças para esticar ou amassar (vizinho mais próximo, pixels nítidos). Shift mantém a proporção nos cantos e passar da borda oposta espelha. Shift+H e Shift+V espelham, Shift+R gira 90°, as setas movem 1 px (Shift: 8 px), Alt+arrastar leva uma cópia, Ctrl+A seleciona o quadro todo e Ctrl+D desmarca. O botão direito mostra tudo isso em um menu.
- **Desenho:** espelho vertical (Y), pincel redondo e balde global (troca todos os pixels da mesma cor no quadro).

## Interface
Layout A (estúdio): árvore de camadas à esquerda, painel contextual (muda conforme o que está selecionado) à direita, ferramentas flutuantes embaixo e barra de contexto no topo. Em telas até 900 px vira o layout D (ilhas): paleta e ferramentas embaixo, painéis em gavetas (botões "Quadros" e "Painel"). O painel "Desempenho" (estresse e teste de 10 s) fica recolhido na direita.

## Identidade e interface
Visual limpo, cantos suaves e cinzas frios, com destaque verde-menta `#4de3b5`. Fonte Geist (texto) e Geist Mono (números), ícones Lucide. Sem fonte pixel.

Logo em `public/`: `mark.svg` (ícone), `logo.svg` e `logo-dark.svg` (ícone + nome), `wordmark.svg` e `wordmark-dark.svg`. O nome é desenhado a partir da Geist Bold, com um quadradinho (o "pixel") no lugar do pingo do i.

## Quadros e paletas
- **Ferramenta Quadro (F):** abre uma lista de tamanhos, como a ferramenta Frame do Figma: tamanhos comuns (8 a 128), portáteis (Game Boy, GBA, DS...), consoles de mesa, computadores e ícones. Também aceita largura e altura livres, ou arrastar na tela. Clique sem arrastar cria o último tamanho usado.
- **Quadros grandes:** acima de 64 px o quadro ganha textura própria (até 2048 × 2048).
- **Paletas:** Sweetie 16, Game Boy, Game Boy Pocket, NES (54), Master System (64), GBA, PICO-8, Commodore 64, ZX Spectrum, EGA, CGA e "Minha paleta" (guarda cores, Shift + clique remove). Os dados ficam em `src/data.ts`.

## Como é por dentro
- Núcleo em TypeScript puro (`doc.ts`): quadros, atlas, índice espacial, histórico.
- Renderização em WebGL2 (`gl.ts`): os quadros de uma página saem em **uma** chamada de desenho; contorno e xadrez no shader.
- Desfazer por diferença: guarda só a área alterada de cada traço.
- Quadros vivem em páginas de atlas 2048×2048 por classe de tamanho (16, 32, 64).
- Limite do protótipo: quadros de até 64×64. O produto usaria blocos (tiles) para quadros maiores.
