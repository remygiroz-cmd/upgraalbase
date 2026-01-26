import React from 'react';
import { X } from 'lucide-react';

export default function ImageZoomModal({ imageUrl, onClose }) {
  if (!imageUrl) return null;

  return (
    <div
      className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="relative max-w-2xl max-h-[90vh] flex items-center justify-center"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute -top-10 -right-10 sm:-top-12 sm:-right-12 text-white hover:text-gray-300 transition-colors p-2"
        >
          <X className="w-6 h-6 sm:w-8 sm:h-8" />
        </button>
        <img
          src={imageUrl}
          alt="Zoomed product"
          className="max-w-full max-h-[85vh] object-contain rounded-lg"
        />
      </div>
    </div>
  );
}