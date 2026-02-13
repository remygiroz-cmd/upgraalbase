import { base44 } from '@/api/base44Client';

/**
 * Get planning manager info from settings (Paramètres Planning > Compta tab)
 * Returns { name, email, user } or null if not configured
 */
export async function getPlanningManager() {
  try {
    // Fetch planning settings
    const settings = await base44.entities.AppSettings.filter({ setting_key: 'planning_settings' });
    
    if (!settings || settings.length === 0) {
      console.warn('[getPlanningManager] No planning settings found');
      return null;
    }

    const planningSettings = settings[0];
    const managerName = planningSettings.compta_manager_name;
    const managerEmail = planningSettings.compta_manager_email;

    if (!managerEmail) {
      console.warn('[getPlanningManager] No manager email configured');
      return null;
    }

    // Find matching user by email
    const users = await base44.entities.User.list();
    const matchingUser = users.find(u => 
      u.email?.trim().toLowerCase() === managerEmail?.trim().toLowerCase()
    );

    if (!matchingUser) {
      console.warn('[getPlanningManager] No user found with email:', managerEmail);
      // Fallback: return basic info without user object
      return {
        name: managerName || 'Responsable',
        email: managerEmail,
        user: null
      };
    }

    return {
      name: managerName || matchingUser.full_name,
      email: managerEmail,
      user: matchingUser
    };
  } catch (error) {
    console.error('[getPlanningManager] Error:', error);
    return null;
  }
}

/**
 * Check if current user is the planning manager
 */
export async function isCurrentUserPlanningManager(currentUser) {
  if (!currentUser) return false;
  
  // Admin always has access
  if (currentUser.role === 'admin') return true;

  const manager = await getPlanningManager();
  if (!manager) return false;

  return currentUser.email?.trim().toLowerCase() === manager.email?.trim().toLowerCase();
}