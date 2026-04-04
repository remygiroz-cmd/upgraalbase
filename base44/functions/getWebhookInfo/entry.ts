import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  const user = await base44.auth.me();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const baseUrl = Deno.env.get('BASE44_APP_URL') || '';
  const appId = Deno.env.get('BASE44_APP_ID') || '';

  const isNativeBase44 = baseUrl.includes('.base44.app');
  const nativeUrl = isNativeBase44 ? baseUrl : (appId ? `https://${appId}.base44.app` : null);
  const webhookUrl = nativeUrl ? `${nativeUrl}/api/inboundFactures?secret=${Deno.env.get('RESEND_INBOUND_SECRET') || ''}` : null;

  return Response.json({
    base44AppUrl: baseUrl,
    isNativeBase44,
    nativeUrl,
    webhookUrl,
    appId,
  });
});