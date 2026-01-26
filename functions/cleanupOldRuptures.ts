import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (user && user.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    // Get all ruptures
    const ruptures = await base44.asServiceRole.entities.RuptureHistory.list();
    
    // Calculate date 30 days ago
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const cutoffDate = thirtyDaysAgo.toISOString().split('T')[0];

    // Find ruptures older than 30 days
    const oldRuptures = ruptures.filter(r => r.date < cutoffDate);

    // Delete them
    let deleted = 0;
    for (const rupture of oldRuptures) {
      await base44.asServiceRole.entities.RuptureHistory.delete(rupture.id);
      deleted++;
    }

    return Response.json({
      success: true,
      message: `${deleted} rupture(s) supprimée(s)`,
      deleted_count: deleted,
      cutoff_date: cutoffDate
    });

  } catch (error) {
    console.error('Erreur:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});