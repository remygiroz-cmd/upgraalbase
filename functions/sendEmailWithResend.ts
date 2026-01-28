import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { to, subject, html, body, attachments, from_name, reply_to } = await req.json();

    if (!to || !subject || (!html && !body)) {
      return Response.json({ error: 'Missing required fields: to, subject, html or body' }, { status: 400 });
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
        console.log('Using default sender name');
      }
    }

    // Build email payload
    const emailPayload = {
      from: `${senderName} <noreply@upgraal.com>`,
      to: [to],
      subject: subject
    };

    // Add HTML or plain text
    if (html) {
      emailPayload.html = html;
    } else if (body) {
      emailPayload.text = body;
    }

    // Add reply-to if provided
    if (reply_to) {
      emailPayload.reply_to = [reply_to];
    }

    // Add attachments if provided
    if (attachments && attachments.length > 0) {
      emailPayload.attachments = attachments;
      console.log('Attachments:', attachments.map(a => ({ filename: a.filename, contentLength: a.content?.length })));
    }

    // Send email via Resend API
    console.log('Sending email with payload:', { to, subject, hasAttachments: !!emailPayload.attachments });
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
      id: result.id,
      attachmentsSent: emailPayload.attachments?.length || 0
    });

  } catch (error) {
    console.error('Error:', error);
    return Response.json({ 
      error: 'Internal server error', 
      details: error.message 
    }, { status: 500 });
  }
});