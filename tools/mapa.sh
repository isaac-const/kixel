#!/usr/bin/env bash
# Índice do código: seções do main.ts (com linha) e funções exportadas dos outros arquivos.
# Use isto e depois leia só o trecho (sed -n 'A,Bp'), em vez de abrir o arquivo inteiro.
cd "$(dirname "$0")/.." || exit 1
echo "== src/main.ts =="; grep -n "^// =====\|^// -----" src/main.ts | sed 's/[=-]\{5,\} *//' | cut -c1-100
for f in src/ui.ts src/player.ts src/doc.ts src/gl.ts src/exporters.ts src/home.ts src/workspaces.ts; do echo "== $f ($(wc -l <$f) linhas) =="; grep -n "^export \(function\|const\|class\|type\)" $f | cut -c1-110; done
