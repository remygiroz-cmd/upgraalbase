import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    const now = new Date();
    
    // Convertir en heure de Paris
    const parisTime = new Date(now.toLocaleString('en-US', { timeZone: 'Europe/Paris' }));
    const currentDay = ['D', 'L', 'MA', 'ME', 'J', 'V', 'S'][parisTime.getDay()];
    const currentTime = `${String(parisTime.getHours()).padStart(2, '0')}:${String(parisTime.getMinutes()).padStart(2, '0')}`;
    
    console.log(`UTC:`, now.toISOString());
    console.log(`Paris Time:`, parisTime.toString());
    console.log(`Current Day:`, currentDay);
    console.log(`Current Time:`, currentTime);

    // Récupérer tous les fournisseurs
    const suppliers = await base44.asServiceRole.entities.Supplier.filter({ is_active: true });
    
    console.log(`Total suppliers:`, suppliers.length);
    
    // Test de la logique pour chaque fournisseur
    suppliers.forEach(s => {
      const hasDay = s.delivery_days?.includes(currentDay);
      
      if (!s.closing_time) {
        console.log(`${s.name}: NO CLOSING TIME`);
        return;
      }
      
      const [targetHour, targetMinute] = s.closing_time.split(':').map(Number);
      const targetTimeInMinutes = targetHour * 60 + targetMinute;
      const currentTimeInMinutes = parisTime.getHours() * 60 + parisTime.getMinutes();
      const diff = currentTimeInMinutes - targetTimeInMinutes;
      const timeMatch = diff >= 0 && diff < 5;
      
      console.log(`${s.name}:`, {
        delivery_days: s.delivery_days,
        hasDay,
        closing_time: s.closing_time,
        targetMinutes: targetTimeInMinutes,
        currentMinutes: currentTimeInMinutes,
        diff,
        timeMatch,
        WILL_PROCESS: hasDay && timeMatch
      });
    });

    return Response.json({
      success: true,
      now: now.toISOString(),
      parisTime: parisTime.toString(),
      currentDay,
      currentTime
    });

  } catch (error) {
    console.error('Erreur:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});