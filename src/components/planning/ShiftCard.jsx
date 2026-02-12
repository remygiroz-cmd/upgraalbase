import React, { useState, useRef, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { Clock, Coffee, AlertTriangle, Trash2 } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';

const hexToRgb = (hex) => {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16)
  } : { r: 59, g: 130, b: 246 };
};

const STATUS_ICONS = {
  planned: '📋',
  confirmed: '✅',
  completed: '✔️',
  cancelled: '❌'
};

const ShiftCard = React.memo(function ShiftCard({ 
  shift, 
  positions = [], 
  onClick, 
  onDelete, 
  hasRestWarning, 
  hasOvertimeWarning,
  onSave,
  disabled = false
}) {
  const [editingField, setEditingField] = useState(null); // 'start' | 'end' | null
  const [tempValue, setTempValue] = useState('');
  const [isSettingEndNow, setIsSettingEndNow] = useState(false);
  const inputRef = useRef(null);

  const calculateDuration = () => {
    const [startH, startM] = shift.start_time.split(':').map(Number);
    const [endH, endM] = shift.end_time.split(':').map(Number);
    
    let totalMinutes = (endH * 60 + endM) - (startH * 60 + startM);
    if (totalMinutes < 0) totalMinutes += 24 * 60;
    
    totalMinutes -= (shift.break_minutes || 0);
    
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return `${hours}h${minutes > 0 ? minutes.toString().padStart(2, '0') : ''}`;
  };

  const position = positions.find(p => p.label === shift.position);
  const positionColor = position?.color || '#3b82f6';
  const rgb = hexToRgb(positionColor);
  
  const colors = {
    bg: `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.1)`,
    border: positionColor,
    text: positionColor
  };

  // Auto-focus input when editing starts
  useEffect(() => {
    if (editingField && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editingField]);

  // Handler pour sauvegarder via la même logique que la modale
  const handleSaveTime = (newStartTime, newEndTime) => {
    // 🔥 CRITIQUE: Calculer base_hours_override exactement comme la modale (lignes 240-254)
    const [startH, startM] = newStartTime.split(':').map(Number);
    const [endH, endM] = newEndTime.split(':').map(Number);
    
    let totalMinutes = (endH * 60 + endM) - (startH * 60 + startM);
    if (totalMinutes < 0) totalMinutes += 24 * 60;
    totalMinutes -= (shift.break_minutes || 0);
    
    const decimalHours = Math.round((totalMinutes / 60) * 10) / 10;
    
    const shiftData = {
      ...shift,
      start_time: newStartTime,
      end_time: newEndTime,
      base_hours_override: decimalHours // 🔥 Envoyer le même champ que la modale
    };
    
    // Appeler onSave exactement comme la modale
    // La mutation gère son propre state/loading/success/error
    onSave(shift.id, shiftData);
    
    // Fermer l'édition immédiatement
    setEditingField(null);
    setTempValue('');
  };

  // Bouton "Fin maintenant" - met l'heure de fin à maintenant
  const handleSetEndNow = async (e) => {
    e.stopPropagation();
    
    // Calculer l'heure actuelle arrondie au 5 minutes
    const now = new Date();
    const minutes = now.getMinutes();
    const roundedMinutes = Math.round(minutes / 5) * 5;
    now.setMinutes(roundedMinutes);
    now.setSeconds(0);
    now.setMilliseconds(0);
    
    const hours = String(now.getHours()).padStart(2, '0');
    const mins = String(now.getMinutes()).padStart(2, '0');
    const currentTime = `${hours}:${mins}`;
    
    // Validation: currentTime doit être après startTime
    const [startH, startM] = shift.start_time.split(':').map(Number);
    const [nowH, nowM] = currentTime.split(':').map(Number);
    const startMinutes = startH * 60 + startM;
    const nowMinutes = nowH * 60 + nowM;
    
    // Gérer le cas où le shift ne passe pas minuit
    if (nowMinutes <= startMinutes) {
      toast.error('L\'heure de fin doit être après l\'heure de début');
      return;
    }
    
    setIsSettingEndNow(true);
    
    try {
      // Utiliser exactement la même logique que l'édition inline
      handleSaveTime(shift.start_time, currentTime);
      toast.success(`Heure de fin mise à jour: ${currentTime}`);
    } catch (error) {
      toast.error(`Erreur: ${error.message}`);
    } finally {
      setIsSettingEndNow(false);
    }
  };

  const handleStartEdit = (field, e) => {
    e.stopPropagation();
    if (disabled) {
      toast.error('Lecture seule — vous n\'avez pas la permission de modifier le planning', {
        duration: 3000,
        icon: '🔒'
      });
      return;
    }
    const currentValue = field === 'start' ? shift.start_time : shift.end_time;
    setEditingField(field);
    setTempValue(currentValue);
  };

  const handleCancel = () => {
    setEditingField(null);
    setTempValue('');
  };

  const handleSave = () => {
    if (!tempValue || tempValue === (editingField === 'start' ? shift.start_time : shift.end_time)) {
      handleCancel();
      return;
    }

    // Validation format HH:mm
    if (!/^\d{2}:\d{2}$/.test(tempValue)) {
      toast.error('Format invalide (HH:mm requis)');
      handleCancel();
      return;
    }

    const newStartTime = editingField === 'start' ? tempValue : shift.start_time;
    const newEndTime = editingField === 'end' ? tempValue : shift.end_time;

    // Validation: end > start
    const [startH, startM] = newStartTime.split(':').map(Number);
    const [endH, endM] = newEndTime.split(':').map(Number);
    const startMinutes = startH * 60 + startM;
    const endMinutes = endH * 60 + endM;

    if (endMinutes <= startMinutes && endH < 12) {
      toast.error('L\'heure de fin doit être après l\'heure de début');
      handleCancel();
      return;
    }

    // Save via onSave (même logique que modale)
    handleSaveTime(newStartTime, newEndTime);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSave();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      handleCancel();
    } else if (e.key === 'Tab' && editingField === 'start') {
      e.preventDefault();
      handleSave();
      // Passer à l'édition de end après un court délai
      setTimeout(() => {
        setEditingField('end');
        setTempValue(shift.end_time);
      }, 50);
    }
  };

  const handleBlur = () => {
    // Blur = validation automatique
    setTimeout(() => {
      if (editingField) {
        handleSave();
      }
    }, 100);
  };

  return (
    <div
      onClick={onClick}
      className={cn(
        "relative rounded-lg border-2 p-2 transition-all group h-full flex flex-col justify-center",
        disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer hover:shadow-md",
        shift.status === 'cancelled' && "opacity-50"
      )}
      style={{ 
        backgroundColor: colors.bg,
        borderColor: colors.border
      }}
    >
      {(hasRestWarning || hasOvertimeWarning) && (
        <div className="absolute -top-1 -right-1 bg-orange-500 text-white rounded-full p-0.5">
          <AlertTriangle className="w-3 h-3" />
        </div>
      )}
      
      <button
        onClick={(e) => {
          e.stopPropagation();
          if (disabled) {
            toast.error('Lecture seule — vous n\'avez pas la permission de modifier le planning', {
              duration: 3000,
              icon: '🔒'
            });
            return;
          }
          onDelete(shift);
        }}
        disabled={disabled}
        className={cn(
          "absolute -top-2 -left-2 rounded-full p-1 transition-opacity shadow-lg",
          disabled 
            ? "bg-gray-400 text-gray-200 opacity-30 cursor-not-allowed"
            : "bg-red-500 text-white opacity-0 group-hover:opacity-100 hover:bg-red-600"
        )}
      >
        <Trash2 className="w-3 h-3" />
      </button>
      
      <div className="flex items-center justify-between gap-1">
        <div className="flex items-center flex-1 min-w-0">
          <div className="flex items-center gap-0.5 text-[11px] font-bold flex-1 min-w-0" style={{ color: colors.text }}>
            {/* Heure de début - éditable inline */}
            {editingField === 'start' ? (
              <input
                ref={inputRef}
                type="time"
                value={tempValue}
                onChange={(e) => setTempValue(e.target.value)}
                onKeyDown={handleKeyDown}
                onBlur={handleBlur}
                onClick={(e) => e.stopPropagation()}
                disabled={false}
                className="w-16 px-1 py-0.5 text-[11px] font-bold border rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                style={{ color: colors.text }}
              />
            ) : (
              <span
                onClick={(e) => handleStartEdit('start', e)}
                className="cursor-pointer hover:bg-white/50 px-1 py-0.5 rounded transition-colors"
              >
                {shift.start_time}
              </span>
            )}
            <span className="mx-0.5">-</span>
            {/* Heure de fin - éditable inline */}
            {editingField === 'end' ? (
              <input
                ref={inputRef}
                type="time"
                value={tempValue}
                onChange={(e) => setTempValue(e.target.value)}
                onKeyDown={handleKeyDown}
                onBlur={handleBlur}
                onClick={(e) => e.stopPropagation()}
                disabled={false}
                className="w-16 px-1 py-0.5 text-[11px] font-bold border rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                style={{ color: colors.text }}
              />
            ) : (
              <div className="flex items-center gap-0.5">
                <span
                  onClick={(e) => handleStartEdit('end', e)}
                  className="cursor-pointer hover:bg-white/50 px-1 py-0.5 rounded transition-colors"
                >
                  {shift.end_time}
                </span>
                <button
                  onClick={handleSetEndNow}
                  disabled={isSettingEndNow}
                  className="p-0.5 hover:bg-green-100 rounded transition-colors disabled:opacity-50"
                  title="Mettre fin maintenant"
                >
                  {isSettingEndNow ? (
                    <div className="w-3 h-3 border-2 border-green-600 border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <Clock className="w-3 h-3 text-green-600" />
                  )}
                </button>
              </div>
            )}
          </div>
        </div>
        <span className="text-xs">{STATUS_ICONS[shift.status] || '📋'}</span>
      </div>
      
      <div className="flex items-center justify-between text-[10px] mt-0.5">
        <span className="font-semibold uppercase tracking-wide" style={{ color: colors.text }}>
          {shift.position || 'Autre'}
        </span>
        <div className="flex items-center gap-1.5">
          <span className="font-semibold" style={{ color: colors.text }}>
            {calculateDuration()}
          </span>
          {shift.break_minutes > 0 && (
            <span className="flex items-center gap-0.5" style={{ color: colors.text }}>
              <Coffee className="w-2.5 h-2.5" />
              {shift.break_minutes}min
            </span>
          )}
        </div>
      </div>
    </div>
  );
});

export default ShiftCard;