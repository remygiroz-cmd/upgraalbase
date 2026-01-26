import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

export default function CourseItemCard({ item, itemNumber, currentState, onStateChange, isChecked, isRupture, onImageClick }) {
  const [showQuantityInput, setShowQuantityInput] = useState(false);
  const [customQuantity, setCustomQuantity] = useState(item.quantity);

  const handleTrouve = () => {
    onStateChange('check');
  };

  const handlePartielle = () => {
    setShowQuantityInput(true);
  };

  const handlePartielleConfirm = () => {
    // Move found quantity to check
    onStateChange('check', customQuantity);
    // Keep the rest in a_prendre (would need backend logic)
    setShowQuantityInput(false);
  };

  const handleTotale = () => {
    onStateChange('rupture');
  };

  return (
    <div className="bg-white rounded-lg border-2 border-gray-200 p-3 sm:p-4 md:p-5 space-y-3 sm:space-y-4">
      <div className="flex gap-3 sm:gap-4">
        {/* Item Number */}
        <div className="flex-shrink-0">
          <span className="inline-flex items-center justify-center w-8 h-8 sm:w-10 sm:h-10 bg-orange-100 text-orange-600 rounded font-bold text-sm sm:text-base">
            #{itemNumber}
          </span>
        </div>

        {/* Item Image & Info */}
        <div className="flex-1 min-w-0">
          <div className="flex gap-2 sm:gap-3">
            {/* Image */}
            {item.image_url ? (
              <button
                onClick={() => onImageClick(item.image_url)}
                className="flex-shrink-0 hover:opacity-80 transition-opacity cursor-pointer"
              >
                <img
                  src={item.image_url}
                  alt={item.product_name}
                  className="w-16 h-16 sm:w-20 sm:h-20 md:w-24 md:h-24 rounded object-cover"
                />
              </button>
            ) : (
              <div className="w-16 h-16 sm:w-20 sm:h-20 md:w-24 md:h-24 bg-gray-100 rounded flex-shrink-0" />
            )}

            {/* Details */}
            <div className="flex-1 min-w-0">
              <h3 className="font-bold text-gray-900 text-sm sm:text-base md:text-lg truncate">
                {item.product_name}
              </h3>

              <div className="flex flex-wrap gap-1 sm:gap-2 mt-1 sm:mt-2">
                <Badge className="bg-gray-800 text-white text-xs sm:text-sm">
                  {item.quantity} {item.unit}
                </Badge>
                {item.unit_price && (
                  <Badge variant="outline" className="text-xs sm:text-sm">
                    {item.unit_price.toFixed(2)} €
                  </Badge>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Action Buttons */}
      {!showQuantityInput ? (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-3">
          {!isChecked && !isRupture && (
            <>
              <Button
                onClick={handleTrouve}
                className="bg-green-600 hover:bg-green-700 text-white font-bold py-2 sm:py-3 text-sm sm:text-base h-auto min-h-[44px] touch-manipulation"
              >
                ✓ Trouvé
              </Button>
              <Button
                onClick={handlePartielle}
                variant="outline"
                className="border-orange-600 text-orange-600 hover:bg-orange-50 font-bold py-2 sm:py-3 text-sm sm:text-base h-auto min-h-[44px] touch-manipulation"
              >
                ⊘ Partielle
              </Button>
              <Button
                onClick={handleTotale}
                variant="outline"
                className="border-red-600 text-red-600 hover:bg-red-50 font-bold py-2 sm:py-3 text-sm sm:text-base h-auto min-h-[44px] touch-manipulation"
              >
                ✕ Totale
              </Button>
            </>
          )}
          {(isChecked || isRupture) && (
            <p className="text-gray-500 text-sm text-center py-2 col-span-1 sm:col-span-3">
              {isChecked ? 'Article checké' : 'Article en rupture'}
            </p>
          )}
        </div>
      ) : (
        <div className="space-y-2 sm:space-y-3">
          <p className="text-sm sm:text-base font-semibold text-gray-900">
            Combien avez-vous trouvé?
          </p>
          <div className="flex gap-2">
            <input
              type="number"
              min="0"
              max={item.quantity}
              value={customQuantity}
              onChange={(e) => setCustomQuantity(parseFloat(e.target.value) || 0)}
              className="flex-1 px-3 sm:px-4 py-2 border border-gray-300 rounded text-sm sm:text-base h-auto min-h-[44px]"
            />
            <span className="flex items-center px-2 sm:px-3 text-gray-600 text-sm sm:text-base">
              {item.unit}
            </span>
          </div>
          <div className="flex gap-2 sm:gap-3">
            <Button
              onClick={() => setShowQuantityInput(false)}
              variant="outline"
              className="flex-1 h-auto min-h-[44px] text-sm sm:text-base"
            >
              Annuler
            </Button>
            <Button
              onClick={handlePartielleConfirm}
              className="flex-1 bg-orange-600 hover:bg-orange-700 text-white h-auto min-h-[44px] text-sm sm:text-base"
            >
              Confirmer
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}