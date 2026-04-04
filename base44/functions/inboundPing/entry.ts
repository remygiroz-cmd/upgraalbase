Deno.serve(async (req) => {
  return Response.json({
    ok: true,
    fn: "inboundPing",
    method: req.method,
    url: req.url,
    ts: new Date().toISOString(),
  });
});