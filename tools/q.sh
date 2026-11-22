#!/usr/bin/env bash
# Roda um comando e mostra só o fim e as linhas de erro. O log completo fica em /tmp/q.log.
# Uso: tools/q.sh [-n LINHAS] comando args...   (economiza contexto em tsc, build e testes)
N=15; if [ "$1" = "-n" ]; then N="$2"; shift 2; fi
"$@" >/tmp/q.log 2>&1; code=$?
grep -inE "error|fail|falh|warning|TS[0-9]{4}" /tmp/q.log | head -20
echo "--- fim (de $(wc -l </tmp/q.log) linhas), saída $code ---"; tail -n "$N" /tmp/q.log
exit $code
