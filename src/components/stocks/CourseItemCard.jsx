import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

export default function CourseItemCard({ item, itemNumber, onStateChange, isChecked, isRupture, onImageClick }) {
  const [showQuantityInput, setShowQuantityInput] = useState(false);
  const [customQuantity, setCustomQuantity] = useState(item.quantity);

  // Fetch article details for image
  const { data: article } = useQuery({
    queryKey: ['article', item.product_id],
    queryFn: () => base44.entities.Article.filter({ id: item.product_id }).then(res => res[0]),
    enabled: !!item.product_id
  });

  const imageUrl = article?.image_url;

  const handleTrouve = () => {
    onStateChange('check');
  };

  const handlePartielle = () => {
    setShowQuantityInput(true);
  };

  const handlePartielleConfirm = () => {
    onStateChange('check', customQuantity);
    setShowQuantityInput(false);
  };

  const handleTotale = () => {
    onStateChange('rupture');
  };

  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-4 sm:p-5 space-y-4">
      {/* Top: Number + Product Info */}
      <div className="flex gap-3 sm:gap-4">
        {/* Item Number */}
        <div className="flex-shrink-0 text-3xl sm:text-4xl font-bold text-orange-200">
          #{itemNumber}
        </div>

        {/* Image */}
        <div className="flex-shrink-0">
          {imageUrl ? (
            <button
              onClick={() => onImageClick(imageUrl)}
              className="hover:opacity-80 transition-opacity"
            >
              <img
                src={imageUrl}
                alt={item.product_name}
                className="w-20 h-20 sm:w-24 sm:h-24 md:w-28 md:h-28 rounded-lg object-cover border border-gray-200"
              />
            </button>
          ) : (
            <div className="w-20 h-20 sm:w-24 sm:h-24 md:w-28 md:h-28 bg-gray-100 rounded-lg border border-gray-200 flex items-center justify-center text-gray-400 text-xs">
              Pas image
            </div>
          )}
        </div>

        {/* Product Details */}
        <div className="flex-1 min-w-0">
          <h3 className="font-bold text-gray-900 text-base sm:text-lg md:text-xl mb-2 truncate">
            {item.product_name}
          </h3>

          <div className="flex flex-wrap gap-2 items-center">
            <Badge className="bg-gray-900 text-white text-xs sm:text-sm font-bold px-3 py-1">
              {item.quantity} {item.unit}
            </Badge>
            {item.supplier_reference && (
              <Badge variant="outline" className="text-xs sm:text-sm">
                {item.supplier_reference}
              </Badge>
            )}
          </div>
        </div>
      </div>

      {/* Action Buttons */}
      {!showQuantityInput ? (
        <div className="space-y-3">
          {!isChecked && !isRupture && (
            <>
              <Button
                onClick={handleTrouve}
                className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-3 sm:py-4 text-base sm:text-lg h-auto min-h-[48px] rounded-lg"
              >
                ✓ Trouvé
              </Button>
              <div className="grid grid-cols-2 gap-3">
                <Button
                  onClick={handlePartielle}
                  variant="outline"
                  className="border-2 border-orange-600 text-orange-600 hover:bg-orange-50 font-bold py-2 sm:py-3 text-sm sm:text-base h-auto min-h-[44px] rounded-lg"
                >
                  ⊘ Partielle
                </Button>
                <Button
                  onClick={handleTotale}
                  variant="outline"
                  className="border-2 border-red-600 text-red-600 hover:bg-red-50 font-bold py-2 sm:py-3 text-sm sm:text-base h-auto min-h-[44px] rounded-lg"
                >
                  ✕ Totale
                </Button>
              </div>
            </>
          )}
          {(isChecked || isRupture) && (
            <div className="py-3 text-center text-gray-500 text-sm">
              {isChecked ? '✓ Article checké' : '✕ En rupture'}
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          <p className="font-semibold text-gray-900 text-sm">
            Combien avez-vous trouvé?
          </p>
          <div className="flex gap-2">
            <input
              type="number"
              min="0"
              max={item.quantity}
              value={customQuantity}
              onChange={(e) => setCustomQuantity(parseFloat(e.target.value) || 0)}
              className="flex-1 px-3 py-2 border-2 border-gray-300 rounded-lg text-base h-auto min-h-[44px]"
            />
            <span className="flex items-center px-3 text-gray-600 font-semibold">
              {item.unit}
            </span>
          </div>
          <div className="flex gap-2">
            <Button
              onClick={() => setShowQuantityInput(false)}
              variant="outline"
              className="flex-1 h-auto min-h-[44px]"
            >
              Annuler
            </Button>
            <Button
              onClick={handlePartielleConfirm}
              className="flex-1 bg-orange-600 hover:bg-orange-700 text-white h-auto min-h-[44px] font-bold"
            >
              Confirmer
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}