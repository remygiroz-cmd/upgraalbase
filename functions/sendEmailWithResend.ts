import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { to, subject, html } = await req.json();

    if (!to || !subject || !html) {
      return Response.json({ error: 'Missing required fields: to, subject, html' }, { status: 400 });
    }

    const apiKey = Deno.env.get('RESEND_API_KEY');
    if (!apiKey) {
      return Response.json({ error: 'RESEND_API_KEY not configured' }, { status: 500 });
    }

    // Get sender name from settings
    let senderName = 'UpGraal';
    try {
      const settings = await base44.asServiceRole.entities.AppSettings.filter({ setting_key: 'email_sender_name' });
      if (settings.length > 0 && settings[0].email_sender_name) {
        senderName = settings[0].email_sender_name;
      }
    } catch (err) {
      console.log('Using default sender name');
    }

    // Send email via Resend API
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: `${senderName} <noreply@upgraal.com>`,
        to: [to],
        subject: subject,
        html: html
      })
    });

    const result = await response.json();

    if (!response.ok) {
      // Better error handling for common issues
      let errorMessage = 'Erreur lors de l\'envoi de l\'email';
      
      if (response.status === 403) {
        errorMessage = 'Le domaine d\'envoi n\'est pas vérifié. Veuillez vérifier votre domaine dans Resend.';
      } else if (response.status === 422) {
        errorMessage = 'Adresse email invalide ou domaine non configuré correctement.';
      }
      
      return Response.json({ 
        error: errorMessage,
        details: result,
        status: response.status
      }, { status: response.status });
    }

    return Response.json({ 
      success: true, 
      message: 'Email sent successfully',
      id: result.id 
    });

  } catch (error) {
    return Response.json({ 
      error: 'Internal server error', 
      details: error.message 
    }, { status: 500 });
  }
});