/**
 * SOURCE DE VÉRITÉ UNIQUE pour la gestion de la liste du jour
 * 
 * Ce module centralise toute la logique liée à la liste active du jour
 * pour garantir la cohérence entre "Mise en place" et "Travail du jour"
 */

/**
 * Obtient la date du jour en timezone France (Europe/Paris)
 * Format: YYYY-MM-DD
 */
export function getTodayInParis() {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat('fr-FR', {
    timeZone: 'Europe/Paris',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  
  const parts = formatter.formatToParts(now);
  const year = parts.find(p => p.type === 'year').value;
  const month = parts.find(p => p.type === 'month').value;
  const day = parts.find(p => p.type === 'day').value;
  
  return `${year}-${month}-${day}`;
}

/**
 * Obtient la date du jour (timezone Paris)
 */
export function getTodayDate() {
  return getTodayInParis();
}

/**
 * Trouve la liste active du jour
 * 
 * @param {Array} allSessions - Toutes les sessions WorkSession
 * @returns {Object|null} La session active du jour, ou null si aucune
 */
export function findTodayActiveSession(allSessions) {
  if (!allSessions || allSessions.length === 0) return null;
  
  // Chercher une session active (status = 'active')
  // Il ne devrait y avoir qu'une seule session active à la fois
  const activeSessions = allSessions.filter(s => s.status === 'active');
  
  if (activeSessions.length === 0) return null;
  
  // S'il y a plusieurs sessions actives (ne devrait pas arriver), prendre la plus récente
  const mostRecent = activeSessions.sort((a, b) => {
    const dateA = new Date(a.started_at || a.created_date);
    const dateB = new Date(b.started_at || b.created_date);
    return dateB - dateA;
  })[0];
  
  return mostRecent;
}

/**
 * Vérifie si une liste active existe pour aujourd'hui
 * 
 * @param {Array} allSessions - Toutes les sessions WorkSession
 * @returns {boolean} true si une liste existe, false sinon
 */
export function hasTodayActiveSession(allSessions) {
  return findTodayActiveSession(allSessions) !== null;
}

/**
 * Crée une nouvelle session WorkSession pour aujourd'hui
 * 
 * @param {Object} base44 - Client Base44
 * @param {Array} selectedTasks - Tâches sélectionnées
 * @param {Object} currentUser - Utilisateur actuel
 * @returns {Promise<Object>} La session créée
 */
export async function createTodaySession(base44, selectedTasks, currentUser) {
  const today = getTodayDate();
  
  // Avant de créer, vérifier s'il existe déjà une session active
  // et la clôturer automatiquement
  const allActiveSessions = await base44.entities.WorkSession.filter({ status: 'active' });
  
  if (allActiveSessions.length > 0) {
    console.log('[todayListManager] Clôture des sessions actives existantes:', allActiveSessions.length);
    await Promise.all(
      allActiveSessions.map(session =>
        base44.entities.WorkSession.update(session.id, {
          status: 'completed',
          completed_by: currentUser?.email,
          completed_by_name: currentUser?.full_name || currentUser?.email,
          completed_at: new Date().toISOString()
        })
      )
    );
  }
  
  // Créer la nouvelle session
  const newSession = await base44.entities.WorkSession.create({
    date: today,
    status: 'active',
    tasks: selectedTasks,
    started_by: currentUser?.email,
    started_by_name: currentUser?.full_name || currentUser?.email,
    started_at: new Date().toISOString()
  });
  
  console.log('[todayListManager] Session créée:', newSession.id, 'pour le', today);
  
  return newSession;
}

/**
 * Ajoute des tâches à la session active existante
 * 
 * @param {Object} base44 - Client Base44
 * @param {Object} activeSession - Session active
 * @param {Array} newTasks - Nouvelles tâches à ajouter
 * @returns {Promise<Object>} La session mise à jour
 */
export async function addTasksToActiveSession(base44, activeSession, newTasks) {
  if (!activeSession) {
    throw new Error('Aucune session active');
  }
  
  const updatedTasks = [...(activeSession.tasks || []), ...newTasks];
  
  const updated = await base44.entities.WorkSession.update(activeSession.id, {
    tasks: updatedTasks
  });
  
  console.log('[todayListManager] Tâches ajoutées à la session:', activeSession.id);
  
  return updated;
}