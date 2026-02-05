import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

// Rôles autorisés à envoyer des emails
const ALLOWED_ROLES = ['admin', 'manager', 'comptable', 'gestionnaire'];

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    // Vérification authentification
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Vérification des permissions
    if (!ALLOWED_ROLES.includes(user.role)) {
      console.warn(`[SECURITY] User ${user.id} attempted to send email without permission`);
      return Response.json({ error: 'Permissions insuffisantes' }, { status: 403 });
    }

    const { to, subject, html, body, attachments, from_name, reply_to } = await req.json();

    if (!to || !subject || (!html && !body)) {
      return Response.json({ error: 'Missing required fields: to, subject, html or body' }, { status: 400 });
    }

    // Validation email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(to)) {
      return Response.json({ error: 'Invalid email format' }, { status: 400 });
    }

    const apiKey = Deno.env.get('RESEND_API_KEY');
    if (!apiKey) {
      return Response.json({ error: 'RESEND_API_KEY not configured' }, { status: 500 });
    }

    // Get sender name from settings or use provided from_name
    let senderName = from_name || 'UpGraal';
    if (!from_name) {
      try {
        const settings = await base44.asServiceRole.entities.AppSettings.filter({ setting_key: 'email_sender_name' });
        if (settings.length > 0 && settings[0].email_sender_name) {
          senderName = settings[0].email_sender_name;
        }
      } catch (err) {
        // Use default sender name
      }
    }

    // Build email payload
    const emailPayload: any = {
      from: `${senderName} <noreply@upgraal.com>`,
      to: [to],
      subject: subject
    };

    if (html) {
      emailPayload.html = html;
    } else if (body) {
      emailPayload.text = body;
    }

    if (reply_to) {
      emailPayload.reply_to = [reply_to];
    }

    if (attachments && attachments.length > 0) {
      emailPayload.attachments = attachments;
    }

    // Log sécurisé (sans données sensibles)
    console.log(`[INFO] Sending email with ${attachments?.length || 0} attachments`);

    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(emailPayload)
    });

    const result = await response.json();

    if (!response.ok) {
      let errorMessage = 'Erreur lors de l\'envoi de l\'email';
      
      if (response.status === 403) {
        errorMessage = 'Le domaine d\'envoi n\'est pas vérifié.';
      } else if (response.status === 422) {
        errorMessage = 'Adresse email invalide ou domaine non configuré.';
      }
      
      return Response.json({ 
        error: errorMessage,
        status: response.status
      }, { status: response.status });
    }

    return Response.json({ 
      success: true, 
      message: 'Email sent successfully',
      id: result.id
    });

  } catch (error) {
    console.error('[ERROR] sendEmailWithResend:', error.message);
    return Response.json({ 
      error: 'Internal server error'
    }, { status: 500 });
  }
});
