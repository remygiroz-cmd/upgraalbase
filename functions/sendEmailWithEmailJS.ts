import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { to, subject, html, imageUrl } = await req.json();

    const serviceId = Deno.env.get('EMAILJS_SERVICE_ID');
    const templateId = Deno.env.get('EMAILJS_TEMPLATE_ID');
    const publicKey = Deno.env.get('EMAILJS_PUBLIC_KEY');
    const privateKey = Deno.env.get('EMAILJS_PRIVATE_KEY');

    if (!serviceId || !templateId || !publicKey || !privateKey) {
      return Response.json({ error: 'EmailJS not configured' }, { status: 500 });
    }

    const emailData = {
      service_id: serviceId,
      template_id: templateId,
      user_id: publicKey,
      accessToken: privateKey,
      template_params: {
        to_email: to,
        subject: subject,
        message: html,
        image_url: imageUrl || ''
      }
    };

    const response = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(emailData)
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('EmailJS error:', errorText);
      return Response.json({ error: 'Failed to send email', details: errorText }, { status: 500 });
    }

    return Response.json({ success: true, message: 'Email sent successfully' });
  } catch (error) {
    console.error('Error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});