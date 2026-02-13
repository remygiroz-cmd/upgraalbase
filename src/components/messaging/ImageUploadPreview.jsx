import React from 'react';
import { X, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Aperçu des images avant envoi
 */
export default function ImageUploadPreview({ 
  images, 
  onRemove, 
  uploadProgress 
}) {
  if (!images || images.length === 0) return null;
  
  return (
    <div className="bg-gray-50 border-t border-gray-200 px-4 py-3">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-sm font-medium text-gray-700">
          {images.length} image{images.length > 1 ? 's' : ''} sélectionnée{images.length > 1 ? 's' : ''}
        </span>
      </div>
      
      <div className="flex gap-2 overflow-x-auto pb-2">
        {images.map((img, i) => (
          <div key={i} className="relative flex-shrink-0">
            <div className="w-20 h-20 rounded-lg overflow-hidden bg-gray-200">
              <img
                src={img.preview}
                alt={`Image ${i + 1}`}
                className="w-full h-full object-cover"
              />
            </div>
            
            {/* Remove button */}
            {!uploadProgress && (
              <button
                onClick={() => onRemove(i)}
                className="absolute -top-2 -right-2 p-1 bg-red-500 hover:bg-red-600 rounded-full transition-colors"
              >
                <X className="w-3 h-3 text-white" />
              </button>
            )}
            
            {/* Upload progress */}
            {uploadProgress && (
              <div className="absolute inset-0 bg-black/60 flex items-center justify-center rounded-lg">
                {uploadProgress.current === i + 1 ? (
                  <div className="text-center">
                    <Loader2 className="w-6 h-6 text-white animate-spin mx-auto mb-1" />
                    <span className="text-xs text-white font-medium">
                      {uploadProgress.stage === 'compression' && 'Compression...'}
                      {uploadProgress.stage === 'upload' && `${i + 1}/${images.length}`}
                    </span>
                  </div>
                ) : uploadProgress.current > i + 1 ? (
                  <div className="w-6 h-6 bg-green-500 rounded-full flex items-center justify-center">
                    <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                ) : null}
              </div>
            )}
          </div>
        ))}
      </div>
      
      {/* Global progress */}
      {uploadProgress && (
        <div className="mt-2">
          <div className="flex items-center justify-between text-xs text-gray-600 mb-1">
            <span>
              {uploadProgress.stage === 'compression' && 'Compression en cours...'}
              {uploadProgress.stage === 'upload' && `Envoi ${uploadProgress.current}/${uploadProgress.total}`}
              {uploadProgress.stage === 'complete' && 'Terminé'}
            </span>
            <span>{Math.round((uploadProgress.current / uploadProgress.total) * 100)}%</span>
          </div>
          <div className="w-full h-1.5 bg-gray-200 rounded-full overflow-hidden">
            <div 
              className="h-full bg-blue-600 transition-all duration-300"
              style={{ width: `${(uploadProgress.current / uploadProgress.total) * 100}%` }}
            />
          </div>
        </div>
      )}
    </div>
  );
}