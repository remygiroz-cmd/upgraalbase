/**
 * Design System - Tokens globaux pour toute l'application
 * 
 * RÈGLE : Utiliser ces tokens partout, jamais de valeurs en dur
 * OBJECTIF : Cohérence visuelle totale entre toutes les interfaces
 */

export const designTokens = {
  // Couleurs
  colors: {
    // Surfaces
    background: '#ffffff',
    surface: '#ffffff',
    surfaceHover: '#f9fafb',
    overlay: 'rgba(0, 0, 0, 0.5)',
    
    // Bordures
    border: '#e5e7eb',
    borderLight: '#f3f4f6',
    borderDark: '#d1d5db',
    
    // Texte
    text: '#111827',
    textSecondary: '#6b7280',
    textMuted: '#9ca3af',
    textDisabled: '#d1d5db',
    
    // Actions
    primary: '#2563eb',
    primaryHover: '#1d4ed8',
    primaryLight: '#dbeafe',
    
    // États
    success: '#16a34a',
    successLight: '#dcfce7',
    warning: '#f59e0b',
    warningLight: '#fef3c7',
    danger: '#ef4444',
    dangerLight: '#fee2e2',
    info: '#3b82f6',
    infoLight: '#dbeafe',
  },

  // Espacement
  spacing: {
    xs: '0.25rem',    // 4px
    sm: '0.5rem',     // 8px
    md: '0.75rem',    // 12px
    lg: '1rem',       // 16px
    xl: '1.5rem',     // 24px
    '2xl': '2rem',    // 32px
    '3xl': '3rem',    // 48px
  },

  // Bordures arrondies
  radius: {
    sm: '0.25rem',    // 4px
    md: '0.5rem',     // 8px
    lg: '0.75rem',    // 12px
    xl: '1rem',       // 16px
    full: '9999px',
  },

  // Ombres
  shadow: {
    sm: '0 1px 2px 0 rgb(0 0 0 / 0.05)',
    md: '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)',
    lg: '0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)',
    xl: '0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)',
    modal: '0 25px 50px -12px rgb(0 0 0 / 0.25)',
  },

  // Typographie
  typography: {
    // Tailles
    xs: '0.75rem',      // 12px
    sm: '0.875rem',     // 14px
    base: '1rem',       // 16px
    lg: '1.125rem',     // 18px
    xl: '1.25rem',      // 20px
    '2xl': '1.5rem',    // 24px
    '3xl': '1.875rem',  // 30px
    
    // Poids
    normal: '400',
    medium: '500',
    semibold: '600',
    bold: '700',
    
    // Hauteurs de ligne
    tight: '1.25',
    normal: '1.5',
    relaxed: '1.75',
  },

  // Tailles de conteneurs
  container: {
    sm: '640px',
    md: '768px',
    lg: '1024px',
    xl: '1280px',
    '2xl': '1536px',
  },

  // Transitions
  transition: {
    fast: '150ms',
    base: '200ms',
    slow: '300ms',
    slower: '500ms',
  },

  // Z-index
  zIndex: {
    dropdown: 1000,
    sticky: 1020,
    fixed: 1030,
    modalBackdrop: 1040,
    modal: 1050,
    popover: 1060,
    tooltip: 1070,
  },
};

/**
 * Classes Tailwind standardisées pour composants communs
 */
export const standardClasses = {
  // Modal/Dialog
  modal: {
    overlay: 'fixed inset-0 bg-black/50 backdrop-blur-sm z-50',
    container: 'relative bg-white rounded-lg shadow-xl max-h-[90vh] flex flex-col',
    header: 'px-6 py-4 border-b border-gray-200',
    title: 'text-xl font-semibold text-gray-900',
    description: 'text-sm text-gray-500',
    body: 'px-6 py-4 overflow-y-auto',
    footer: 'px-6 py-4 border-t border-gray-200 bg-gray-50/50 flex justify-end gap-3',
  },

  // Boutons
  button: {
    base: 'inline-flex items-center justify-center rounded-md font-medium transition-colors',
    primary: 'bg-blue-600 text-white hover:bg-blue-700',
    secondary: 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50',
    danger: 'bg-red-600 text-white hover:bg-red-700',
    ghost: 'hover:bg-gray-100 text-gray-700',
  },

  // Inputs
  input: {
    base: 'w-full px-3 py-2 border border-gray-300 rounded-md bg-white text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent',
    label: 'block text-sm font-medium text-gray-700 mb-1',
    error: 'border-red-500 focus:ring-red-500',
    disabled: 'bg-gray-50 text-gray-500 cursor-not-allowed',
  },

  // Cards
  card: {
    base: 'bg-white rounded-lg border border-gray-200 shadow-sm',
    header: 'px-6 py-4 border-b border-gray-200',
    body: 'px-6 py-4',
    footer: 'px-6 py-4 border-t border-gray-200 bg-gray-50/50',
  },

  // Tabs
  tabs: {
    list: 'flex gap-1 border-b border-gray-200',
    tab: 'px-4 py-2 text-sm font-medium transition-colors',
    tabActive: 'text-blue-600 border-b-2 border-blue-600',
    tabInactive: 'text-gray-600 hover:text-gray-900',
  },
};

export default designTokens;