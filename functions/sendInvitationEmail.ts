import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    
    // Verify admin
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const body = await req.json();
    const { to_email, to_name, invite_url, invited_by_name } = body;

    // Get EmailJS credentials
    const serviceId = Deno.env.get('EMAILJS_SERVICE_ID');
    const templateId = Deno.env.get('EMAILJS_TEMPLATE_ID');
    const publicKey = Deno.env.get('EMAILJS_PUBLIC_KEY');

    if (!serviceId || !templateId || !publicKey) {
      return Response.json({ 
        error: 'Configuration EmailJS manquante. Configurez les secrets EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID et EMAILJS_PUBLIC_KEY.' 
      }, { status: 500 });
    }

    // Send email via EmailJS REST API
    const emailData = {
      service_id: serviceId,
      template_id: templateId,
      user_id: publicKey,
      accessToken: Deno.env.get('EMAILJS_PRIVATE_KEY') || '',
      template_params: {
        to_email: to_email,
        to_name: to_name,
        invite_url: invite_url,
        invited_by_name: invited_by_name
      }
    };

    const response = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Origin': `https://${Deno.env.get('BASE44_APP_ID')}.base44.com`
      },
      body: JSON.stringify(emailData)
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`EmailJS API error: ${errorText}`);
    }

    return Response.json({ 
      success: true,
      message: 'Email envoyé avec succès'
    });

  } catch (error) {
    console.error('Error sending email:', error);
    return Response.json({ 
      error: error.message || 'Erreur lors de l\'envoi de l\'email' 
    }, { status: 500 });
  }
});