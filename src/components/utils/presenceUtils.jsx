/**
 * Calculate presence status from last_seen_at timestamp
 * @param {string} lastSeenAt - ISO date string
 * @returns {{ status: 'online'|'away'|'offline', label: string, color: string }}
 */
export function calculatePresenceStatus(lastSeenAt) {
  if (!lastSeenAt) {
    return {
      status: 'offline',
      label: 'Hors ligne',
      color: 'text-gray-400',
      dotColor: 'bg-gray-400'
    };
  }

  const now = new Date();
  const lastSeen = new Date(lastSeenAt);
  const diffMs = now - lastSeen;
  const diffSeconds = Math.floor(diffMs / 1000);
  const diffMinutes = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffMinutes / 60);

  // Online: <= 90 seconds
  if (diffSeconds <= 90) {
    return {
      status: 'online',
      label: 'En ligne',
      color: 'text-green-600',
      dotColor: 'bg-green-500'
    };
  }

  // Away: > 90 seconds and <= 24 hours
  if (diffMinutes <= 1440) { // 24 hours
    let label;
    if (diffMinutes < 60) {
      label = `Vu il y a ${diffMinutes} min`;
    } else if (diffHours < 24) {
      const lastSeenTime = lastSeen.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
      label = `Vu à ${lastSeenTime}`;
    } else {
      label = 'Vu il y a 1 jour';
    }
    
    return {
      status: 'away',
      label,
      color: 'text-orange-500',
      dotColor: 'bg-orange-400'
    };
  }

  // Offline: > 24 hours
  return {
    status: 'offline',
    label: 'Hors ligne',
    color: 'text-gray-400',
    dotColor: 'bg-gray-400'
  };
}

/**
 * Get online count for a list of employee IDs
 * @param {Array} employeeIds - Array of employee IDs
 * @param {Array} allEmployees - All employees with last_seen_at
 * @returns {number} Count of online employees
 */
export function getOnlineCount(employeeIds, allEmployees) {
  if (!employeeIds || !allEmployees) return 0;
  
  return employeeIds.filter(id => {
    const employee = allEmployees.find(emp => emp.id === id);
    if (!employee) return false;
    const presence = calculatePresenceStatus(employee.last_seen_at);
    return presence.status === 'online';
  }).length;
}