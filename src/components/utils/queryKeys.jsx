/**
 * Centralized React Query key factory.
 * Use these everywhere to ensure consistent invalidation.
 *
 * Naming convention:
 *   STABLE_*   → staleTime: 15–60 min  (reference data, rarely mutated)
 *   LIVE_*     → staleTime: 0–30s      (real-time messaging, presence)
 *   PLANNING_* → staleTime: 30s–5min   (planning data, scoped by monthKey+resetVersion)
 */

// ─── Auth / User ────────────────────────────────────────────────────────────
export const QK = {
  currentUser: () => ['currentUser'],

  // ─── Stable reference data (rarely changes) ─────────────────────────────
  employees: () => ['allEmployees'],
  teams: () => ['teams'],
  positions: () => ['positions'],
  nonShiftTypes: () => ['nonShiftTypes'],
  roles: () => ['roles'],
  userRole: (roleId) => ['userRole', roleId],
  isPlanningManager: (email) => ['isPlanningManager', email],
  appSettings: (key) => key ? ['appSettings', key] : ['appSettings'],

  // ─── Planning (scoped by month + version) ────────────────────────────────
  planningMonth: (year, month) => ['planningMonth', year, month],
  shifts: (year, month, resetVersion) => ['shifts', year, month, resetVersion],
  nonShiftEvents: (year, month, resetVersion) => ['nonShiftEvents', year, month, resetVersion],
  paidLeavePeriods: (monthKey, resetVersion) => ['paidLeavePeriods', monthKey, resetVersion],
  weeklyRecaps: (monthKey, resetVersion) => ['allWeeklyRecaps', monthKey, resetVersion],
  monthlyRecaps: (monthKey, resetVersion) => ['allMonthlyRecaps', monthKey, resetVersion],
  /** Jours fériés scoped par année (cache 7 jours) */
  holidayDates: (year) => ['holidayDates', 'year', year],
  approvedSwaps: (monthKey) => ['approvedSwaps', monthKey],

  // ─── Messaging (live / near real-time) ───────────────────────────────────
  conversations: (employeeId) => ['myConversations', employeeId],
  conversationMembers: (employeeId) => ['myConversationMembers', employeeId],
  messages: () => ['allMessages'],
  messageReads: (employeeId) => ['myMessageReads', employeeId],
  mentions: (employeeId) => ['myMentions', employeeId],

  // ─── Notifications ────────────────────────────────────────────────────────
  urgentAnnouncements: () => ['urgentAnnouncements'],
  urgentAnnouncementAcks: (employeeId) => ['urgentAnnouncementAcks', employeeId],
  allUrgentAnnouncements: () => ['allUrgentAnnouncements'],
  announcements: () => ['activeAnnouncements'],

  // ─── Leave / Swap ─────────────────────────────────────────────────────────
  pendingLeaveRequests: () => ['pendingLeaveRequests'],
  myLeaveRequestDecisions: (employeeId) => ['myLeaveRequestDecisions', employeeId],
  pendingSwapRequests: () => ['shiftSwapRequests', 'PENDING'],
  mySwapDecisions: (employeeId) => ['mySwapDecisions', employeeId],
};

// ─── staleTime presets ───────────────────────────────────────────────────────
export const STALE = {
  /** Reference data: employees, teams, positions, roles — 15 min */
  STABLE: 15 * 60 * 1000,
  /** Config / settings — 30 min */
  CONFIG: 30 * 60 * 1000,
  /** Planning data scoped by month+version — 30s */
  PLANNING: 30 * 1000,
  /** Shift-level data — 30s */
  SHIFTS: 30 * 1000,
  /** Holiday dates — 1 hour */
  HOLIDAYS: 60 * 60 * 1000,
  /** Live messaging — always fresh */
  LIVE: 0,
  /** Notification data — 30s */
  NOTIFICATIONS: 30 * 1000,
  /** Leave/swap decisions — 1 min */
  DECISIONS: 60 * 1000,
};