#!/bin/bash
# Smoke test for the SAGE MCP endpoint (netlify/functions/mcp).
#   bash scripts/mcp-smoke.sh http://localhost:8888 <token>            # netlify dev
#   bash scripts/mcp-smoke.sh https://hcdeorbit.netlify.app <token>    # production / deploy preview
# Expected: 1-2 → 401, 3 → protocolVersion + server name, 4 → both tool names,
# 5 → totals for B158116, 6 → isError with known ids, 7 → subtotals 15143 / 8707,
# 8 → validation error, 9 → SPA title, 10 → 406 (GET/SSE unsupported in JSON mode).
set -u
BASE="${1:?usage: mcp-smoke.sh <base-url> <token>}"
TOKEN="${2:?usage: mcp-smoke.sh <base-url> <token>}"
URL="$BASE/mcp"
CT=(-H 'Content-Type: application/json' -H 'Accept: application/json, text/event-stream' -H 'MCP-Protocol-Version: 2025-06-18')
AUTH=(-H "Authorization: Bearer $TOKEN")
INIT='{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"smoke","version":"0"}}}'

pick() { node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{const j=JSON.parse(s);const f=new Function("j",process.argv[1]);console.log(JSON.stringify(f(j)))}catch(e){console.log("RAW:",s.slice(0,400))}})' "$1"; }

echo "=== 1. POST no token -> expect 401";    curl -s -o /dev/null -w "%{http_code}\n" -X POST "$URL" "${CT[@]}" -d "$INIT"
echo "=== 2. POST wrong token -> expect 401"; curl -s -o /dev/null -w "%{http_code}\n" -X POST "$URL" "${CT[@]}" -H 'Authorization: Bearer nope' -d "$INIT"
echo "=== 3. initialize";                     curl -s -X POST "$URL" "${CT[@]}" "${AUTH[@]}" -d "$INIT" | pick 'return j.result ? {protocolVersion:j.result.protocolVersion, server:j.result.serverInfo} : j'
echo "=== 4. tools/list";                     curl -s -X POST "$URL" "${CT[@]}" "${AUTH[@]}" -d '{"jsonrpc":"2.0","id":2,"method":"tools/list"}' | pick 'return j.result ? j.result.tools.map(t=>t.name) : j'
echo "=== 5. sage_get_budget B158116";        curl -s -X POST "$URL" "${CT[@]}" "${AUTH[@]}" -d '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"sage_get_budget","arguments":{"budget_id":"B158116"}}}' | pick 'const r=j.result; return r ? {isError:r.isError, totals:r.structuredContent.totals, noa:r.structuredContent.noa_total, delta:r.structuredContent.delta, rows:r.structuredContent.rows.length} : j'
echo "=== 6. sage_get_budget unknown id";     curl -s -X POST "$URL" "${CT[@]}" "${AUTH[@]}" -d '{"jsonrpc":"2.0","id":4,"method":"tools/call","params":{"name":"sage_get_budget","arguments":{"budget_id":"B999"}}}' | pick 'return j.result ? {isError:j.result.isError, text:j.result.content[0].text} : j'
echo "=== 7. sage_compute_totals (2 rows)";   curl -s -X POST "$URL" "${CT[@]}" "${AUTH[@]}" -d '{"jsonrpc":"2.0","id":5,"method":"tools/call","params":{"name":"sage_compute_totals","arguments":{"rows":[{"id":"per1","category":"personnel","monthlySalary":16826,"effortPct":10,"months":9},{"id":"fa","category":"fa","faRate":57.5,"excludedFromMtdc":true}]}}}' | pick 'return j.result ? j.result.structuredContent : j'
echo "=== 8. bad input effortPct=500 -> expect error"; curl -s -X POST "$URL" "${CT[@]}" "${AUTH[@]}" -d '{"jsonrpc":"2.0","id":6,"method":"tools/call","params":{"name":"sage_compute_totals","arguments":{"rows":[{"id":"x","category":"personnel","effortPct":500}]}}}' | pick 'return j.result ? {isError:j.result.isError, text:(j.result.content[0].text||"").slice(0,160)} : j.error'
echo "=== 9. SPA root still served";          curl -s "$BASE/" | grep -o "<title>[^<]*</title>"
echo "=== 10. GET /mcp with token -> expect 406"; curl -s -o /dev/null -w "%{http_code}\n" "$URL" "${AUTH[@]}"
