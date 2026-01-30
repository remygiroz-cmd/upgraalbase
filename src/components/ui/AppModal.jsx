import React from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from './button';

/**
 * AppModal - Composant modal standard pour toute l'application
 * 
 * Design : Toujours clair, lisible, contrasté, moderne
 * Usage : Remplace tous les Dialog/Modal custom
 * 
 * @example
 * <AppModal
 *   open={isOpen}
 *   onClose={() => setIsOpen(false)}
 *   title="Titre"
 *   size="lg"
 *   actions={<>
 *     <Button variant="outline" onClick={onCancel}>Annuler</Button>
 *     <Button onClick={onSave}>Enregistrer</Button>
 *   </>}
 * >
 *   Contenu de la modale
 * </AppModal>
 */
export function AppModal({
  open,
  onClose,
  title,
  description,
  children,
  actions,
  size = 'md',
  className,
  showCloseButton = true,
  closeOnOverlayClick = true,
  ...props
}) {
  if (!open) return null;

  const sizeClasses = {
    sm: 'max-w-md',
    md: 'max-w-2xl',
    lg: 'max-w-4xl',
    xl: 'max-w-6xl',
    full: 'max-w-[95vw]'
  };

  const handleOverlayClick = (e) => {
    if (closeOnOverlayClick && e.target === e.currentTarget) {
      onClose?.();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Overlay */}
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-sm animate-in fade-in"
        onClick={handleOverlayClick}
      />

      {/* Modal Container */}
      <div
        className={cn(
          "relative w-full bg-white rounded-lg shadow-xl animate-in zoom-in-95 duration-200",
          "max-h-[90vh] flex flex-col",
          "mx-4",
          sizeClasses[size],
          className
        )}
        {...props}
      >
        {/* Header */}
        <div className="flex items-start justify-between px-6 py-4 border-b border-gray-200 shrink-0">
          <div className="flex-1 pr-8">
            <h2 className="text-xl font-semibold text-gray-900">{title}</h2>
            {description && (
              <p className="mt-1 text-sm text-gray-500">{description}</p>
            )}
          </div>
          {showCloseButton && (
            <button
              onClick={onClose}
              className="flex items-center justify-center w-8 h-8 text-gray-400 transition-colors rounded-lg hover:text-gray-600 hover:bg-gray-100"
            >
              <X className="w-5 h-5" />
              <span className="sr-only">Fermer</span>
            </button>
          )}
        </div>

        {/* Body */}
        <div className="flex-1 px-6 py-4 overflow-y-auto">
          {children}
        </div>

        {/* Footer */}
        {actions && (
          <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-200 shrink-0 bg-gray-50/50">
            {actions}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * AppModalTabs - Onglets pour AppModal
 */
export function AppModalTabs({ tabs, activeTab, onTabChange }) {
  return (
    <div className="flex gap-1 mb-6 border-b border-gray-200 -mt-2">
      {tabs.map((tab) => (
        <button
          key={tab.value}
          onClick={() => onTabChange(tab.value)}
          className={cn(
            "px-4 py-2 text-sm font-medium transition-colors relative",
            activeTab === tab.value
              ? "text-blue-600 border-b-2 border-blue-600"
              : "text-gray-600 hover:text-gray-900"
          )}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

export default AppModal;