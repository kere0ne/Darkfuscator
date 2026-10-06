function json(data, status) {
  return new Response(JSON.stringify(data), {
    status: status || 200,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' }
  });
}

// GET /v1/health — liveness + version.
export async function onRequestGet() {
  return json({ ok: true, name: 'Darkfuscator', version: '5.1.0', engine: 'bytecode-vm', time: new Date().toISOString() });
}

export async function onRequestHead() {
  return new Response(null, { status: 200 });
}
