// Live-endpoint assertions for the deployed MCP server.
//
// This exists because `scripts/mcp-smoke.sh` cannot fail. That script runs
// `set -u` (not `-e`), states its expectations only in a header comment, never
// compares a response to them, and ends on `curl` — so it exits 0 whatever the
// endpoint returns. It is a useful thing to read by eye and a useless thing to
// gate on, and the gate was originally reading its exit code as a check.
//
// The assertions below are the ones that comment describes, actually made.

const PROTOCOL_VERSION = '2025-06-18'

function headers(token) {
  return {
    'content-type': 'application/json',
    accept: 'application/json, text/event-stream',
    'mcp-protocol-version': PROTOCOL_VERSION,
    ...(token ? { authorization: `Bearer ${token}` } : {}),
  }
}

const rpc = (method, params, id = 1) => JSON.stringify({ jsonrpc: '2.0', id, method, params })

async function post(url, token, body, timeoutMs) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(url, { method: 'POST', headers: headers(token), body, signal: controller.signal })
    const text = await res.text()
    let json = null
    try { json = JSON.parse(text) } catch { /* non-JSON is itself a finding */ }
    return { status: res.status, text, json }
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Returns { ok, failures[] }. Every assertion states what it expected, so a
 * failure is actionable without re-reading this file.
 */
export async function smokeEndpoint({ baseUrl, token, timeoutMs = 20_000 }) {
  const url = `${baseUrl.replace(/\/+$/, '')}/mcp`
  const failures = []
  const expect = (cond, message) => { if (!cond) failures.push(message) }

  const init = rpc('initialize', {
    protocolVersion: PROTOCOL_VERSION,
    capabilities: {},
    clientInfo: { name: 'gate-smoke', version: '0' },
  })

  // 1 — no token must be refused, not served.
  try {
    const r = await post(url, null, init, timeoutMs)
    expect(r.status === 401, `no-token request returned ${r.status}, expected 401`)
    expect(!r.text.includes('sage_get_budget'), 'no-token response leaked a tool name')
  } catch (err) {
    failures.push(`no-token request threw: ${err.message}`)
  }

  // 2 — a wrong token must be refused.
  try {
    const r = await post(url, 'definitely-not-the-token', init, timeoutMs)
    expect(r.status === 401, `wrong-token request returned ${r.status}, expected 401`)
  } catch (err) {
    failures.push(`wrong-token request threw: ${err.message}`)
  }

  // 3 — initialize must name this server.
  try {
    const r = await post(url, token, init, timeoutMs)
    expect(r.status === 200, `initialize returned ${r.status}, expected 200`)
    expect(r.json?.result?.serverInfo?.name === 'sage-mcp-server',
      `initialize serverInfo.name was ${JSON.stringify(r.json?.result?.serverInfo?.name)}, expected "sage-mcp-server"`)
  } catch (err) {
    failures.push(`initialize threw: ${err.message}`)
  }

  // 4 — exactly the two read-only tools.
  try {
    const r = await post(url, token, rpc('tools/list', undefined, 2), timeoutMs)
    const names = (r.json?.result?.tools ?? []).map(t => t.name).sort()
    expect(JSON.stringify(names) === JSON.stringify(['sage_compute_totals', 'sage_get_budget']),
      `tools/list returned ${JSON.stringify(names)}, expected the two sage tools`)
  } catch (err) {
    failures.push(`tools/list threw: ${err.message}`)
  }

  // 5 — the deployed numbers must be the numbers. This is the assertion the
  // shell script was missing, and the only one that catches a bad deploy.
  try {
    const r = await post(url, token,
      rpc('tools/call', { name: 'sage_get_budget', arguments: { budget_id: 'B158116' } }, 3), timeoutMs)
    const sc = r.json?.result?.structuredContent
    expect(r.json?.result?.isError !== true, 'sage_get_budget returned isError')
    expect(sc?.totals?.total === 201483, `deployed total was ${sc?.totals?.total}, expected 201483`)
    expect(sc?.totals?.fa === 57661, `deployed F&A was ${sc?.totals?.fa}, expected 57661`)
    expect(sc?.totals?.mtdcBase === 100280, `deployed MTDC base was ${sc?.totals?.mtdcBase}, expected 100280`)
    expect(sc?.noa_total === 267006, `deployed NoA total was ${sc?.noa_total}, expected 267006`)
    expect(sc?.delta === 65523, `deployed delta was ${sc?.delta}, expected 65523`)
    expect(Array.isArray(sc?.rows) && sc.rows.length === 12,
      `deployed row count was ${sc?.rows?.length}, expected 12`)
  } catch (err) {
    failures.push(`sage_get_budget threw: ${err.message}`)
  }

  // 6 — an unknown id is a tool error naming the known ids.
  try {
    const r = await post(url, token,
      rpc('tools/call', { name: 'sage_get_budget', arguments: { budget_id: 'B999' } }, 4), timeoutMs)
    expect(r.json?.result?.isError === true, 'unknown budget id did not return isError')
    expect(String(r.json?.result?.content?.[0]?.text ?? '').includes('B158116'),
      'unknown-id error did not name the known ids')
  } catch (err) {
    failures.push(`unknown-id call threw: ${err.message}`)
  }

  // 7 — the formula engine is live, not a cached fixture.
  try {
    const r = await post(url, token, rpc('tools/call', {
      name: 'sage_compute_totals',
      arguments: { rows: [{ id: 'p1', category: 'personnel', monthlySalary: 10000, effortPct: 50, months: 12 }] },
    }, 5), timeoutMs)
    expect(r.json?.result?.structuredContent?.subtotals?.[0]?.subtotal === 60000,
      `compute_totals returned ${r.json?.result?.structuredContent?.subtotals?.[0]?.subtotal}, expected 60000`)
  } catch (err) {
    failures.push(`sage_compute_totals threw: ${err.message}`)
  }

  // 8 — out-of-range input is rejected, not priced.
  try {
    const r = await post(url, token, rpc('tools/call', {
      name: 'sage_compute_totals',
      arguments: { rows: [{ id: 'x', category: 'personnel', effortPct: 500 }] },
    }, 6), timeoutMs)
    expect(r.json?.result?.isError === true || r.json?.error !== undefined,
      'effortPct=500 was accepted instead of rejected')
  } catch (err) {
    failures.push(`bad-input call threw: ${err.message}`)
  }

  // 9 — GET is unsupported in stateless JSON mode.
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    const r = await fetch(url, { headers: headers(token), signal: controller.signal })
    clearTimeout(timer)
    expect(r.status === 405 || r.status === 406,
      `GET /mcp returned ${r.status}, expected 405 or 406`)
  } catch (err) {
    failures.push(`GET /mcp threw: ${err.message}`)
  }

  return { ok: failures.length === 0, failures }
}
