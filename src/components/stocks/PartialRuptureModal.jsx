import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Package, CheckCircle, Ban } from 'lucide-react';

export default function PartialRuptureModal({ isOpen, onClose, item, onConfirm }) {
  const [checkedQuantity, setCheckedQuantity] = useState(0);

  const handleConfirm = () => {
    const ruptureQuantity = item.quantity - checkedQuantity;
    if (checkedQuantity < 0 || checkedQuantity > item.quantity) {
      return;
    }
    onConfirm({
      checkedQuantity,
      ruptureQuantity
    });
    setCheckedQuantity(0);
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold text-gray-900">
            Rupture Partielle
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="bg-orange-50 border-2 border-orange-300 rounded-lg p-4">
            <div className="flex items-center gap-3 mb-2">
              <Package className="w-6 h-6 text-orange-600" />
              <h3 className="font-bold text-gray-900">{item?.product_name}</h3>
            </div>
            <div className="text-sm text-gray-700">
              Commandé: <span className="font-semibold">{item?.quantity} {item?.unit}</span>
            </div>
          </div>

          <div className="space-y-3">
            <label className="block">
              <div className="flex items-center gap-2 mb-2">
                <CheckCircle className="w-5 h-5 text-green-600" />
                <span className="font-semibold text-gray-900">Quantité trouvée au magasin</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setCheckedQuantity(Math.max(0, checkedQuantity - 1))}
                  className="w-12 h-12 rounded-lg bg-gray-200 hover:bg-gray-300 text-gray-900 font-bold text-xl active:scale-95 transition-transform"
                >
                  -
                </button>
                <Input
                  type="number"
                  min="0"
                  max={item?.quantity || 0}
                  value={checkedQuantity}
                  onChange={(e) => {
                    const val = parseInt(e.target.value) || 0;
                    if (val >= 0 && val <= item?.quantity) {
                      setCheckedQuantity(val);
                    }
                  }}
                  className="text-center text-lg font-bold h-12"
                />
                <button
                  onClick={() => setCheckedQuantity(Math.min(item?.quantity || 0, checkedQuantity + 1))}
                  className="w-12 h-12 rounded-lg bg-gray-200 hover:bg-gray-300 text-gray-900 font-bold text-xl active:scale-95 transition-transform"
                >
                  +
                </button>
              </div>
            </label>

            {checkedQuantity > 0 && checkedQuantity < item?.quantity && (
              <div className="bg-red-50 border-2 border-red-300 rounded-lg p-3">
                <div className="flex items-center gap-2 mb-1">
                  <Ban className="w-5 h-5 text-red-600" />
                  <span className="font-semibold text-red-900">En rupture</span>
                </div>
                <div className="text-lg font-bold text-red-600">
                  {item?.quantity - checkedQuantity} {item?.unit}
                </div>
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose}>
            Annuler
          </Button>
          <Button 
            onClick={handleConfirm}
            className="bg-orange-600 hover:bg-orange-700"
            disabled={checkedQuantity === 0 || checkedQuantity > (item?.quantity || 0)}
          >
            Valider
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}