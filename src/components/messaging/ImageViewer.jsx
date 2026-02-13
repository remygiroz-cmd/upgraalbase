import React, { useState } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { X, ChevronLeft, ChevronRight, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * Visionneuse d'images plein écran avec swipe
 */
export default function ImageViewer({ images, initialIndex = 0, open, onOpenChange }) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  
  const currentImage = images?.[currentIndex];
  
  const goNext = () => {
    if (images && currentIndex < images.length - 1) {
      setCurrentIndex(currentIndex + 1);
    }
  };
  
  const goPrev = () => {
    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1);
    }
  };
  
  const handleDownload = () => {
    if (!currentImage) return;
    const link = document.createElement('a');
    link.href = currentImage.url;
    link.download = `image-${Date.now()}.webp`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };
  
  // Keyboard navigation
  React.useEffect(() => {
    if (!open || !images || images.length === 0) return;
    
    const handleKeyDown = (e) => {
      if (e.key === 'ArrowLeft') goPrev();
      if (e.key === 'ArrowRight') goNext();
      if (e.key === 'Escape') onOpenChange(false);
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, currentIndex, images]);
  
  if (!images || images.length === 0) return null;
  
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent 
        className="max-w-[95vw] h-[95vh] p-0 bg-black/95 border-none"
        hideCloseButton
      >
        <div className="relative w-full h-full flex items-center justify-center">
          {/* Close button */}
          <button
            onClick={() => onOpenChange(false)}
            className="absolute top-4 right-4 z-50 p-2 bg-black/50 hover:bg-black/70 rounded-full transition-colors"
          >
            <X className="w-6 h-6 text-white" />
          </button>
          
          {/* Download button */}
          <button
            onClick={handleDownload}
            className="absolute top-4 right-16 z-50 p-2 bg-black/50 hover:bg-black/70 rounded-full transition-colors"
          >
            <Download className="w-5 h-5 text-white" />
          </button>
          
          {/* Counter */}
          {images.length > 1 && (
            <div className="absolute top-4 left-4 z-50 px-3 py-1.5 bg-black/50 rounded-full text-white text-sm font-medium">
              {currentIndex + 1} / {images.length}
            </div>
          )}
          
          {/* Previous button */}
          {currentIndex > 0 && (
            <button
              onClick={goPrev}
              className="absolute left-4 z-50 p-2 bg-black/50 hover:bg-black/70 rounded-full transition-colors"
            >
              <ChevronLeft className="w-8 h-8 text-white" />
            </button>
          )}
          
          {/* Image */}
          <img
            src={currentImage.url}
            alt={`Image ${currentIndex + 1}`}
            className="max-w-full max-h-full object-contain"
            loading="lazy"
          />
          
          {/* Next button */}
          {currentIndex < images.length - 1 && (
            <button
              onClick={goNext}
              className="absolute right-4 z-50 p-2 bg-black/50 hover:bg-black/70 rounded-full transition-colors"
            >
              <ChevronRight className="w-8 h-8 text-white" />
            </button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Grille d'images dans une bulle de message
 */
export function ImageMessageGrid({ images, onImageClick }) {
  const count = images.length;
  
  if (count === 0) return null;
  
  // 1 image : grande
  if (count === 1) {
    return (
      <button
        onClick={() => onImageClick(0)}
        className="relative w-full max-w-sm overflow-hidden rounded-lg cursor-pointer group"
      >
        <img
          src={images[0].thumbUrl || images[0].url}
          alt="Image"
          className="w-full h-auto object-cover group-hover:opacity-90 transition-opacity"
          loading="lazy"
        />
      </button>
    );
  }
  
  // 2 images : 2 colonnes
  if (count === 2) {
    return (
      <div className="grid grid-cols-2 gap-1 max-w-sm rounded-lg overflow-hidden">
        {images.map((img, i) => (
          <button
            key={i}
            onClick={() => onImageClick(i)}
            className="relative aspect-square overflow-hidden cursor-pointer group"
          >
            <img
              src={img.thumbUrl || img.url}
              alt={`Image ${i + 1}`}
              className="w-full h-full object-cover group-hover:opacity-90 transition-opacity"
              loading="lazy"
            />
          </button>
        ))}
      </div>
    );
  }
  
  // 3 images : 1 grande + 2 petites
  if (count === 3) {
    return (
      <div className="grid grid-cols-2 gap-1 max-w-sm rounded-lg overflow-hidden">
        <button
          onClick={() => onImageClick(0)}
          className="relative row-span-2 aspect-square overflow-hidden cursor-pointer group"
        >
          <img
            src={images[0].thumbUrl || images[0].url}
            alt="Image 1"
            className="w-full h-full object-cover group-hover:opacity-90 transition-opacity"
            loading="lazy"
          />
        </button>
        {images.slice(1).map((img, i) => (
          <button
            key={i + 1}
            onClick={() => onImageClick(i + 1)}
            className="relative aspect-square overflow-hidden cursor-pointer group"
          >
            <img
              src={img.thumbUrl || img.url}
              alt={`Image ${i + 2}`}
              className="w-full h-full object-cover group-hover:opacity-90 transition-opacity"
              loading="lazy"
            />
          </button>
        ))}
      </div>
    );
  }
  
  // 4+ images : grille 2x2 ou plus
  return (
    <div className={cn(
      "grid gap-1 max-w-sm rounded-lg overflow-hidden",
      count === 4 ? "grid-cols-2" : "grid-cols-3"
    )}>
      {images.slice(0, count > 6 ? 9 : count).map((img, i) => (
        <button
          key={i}
          onClick={() => onImageClick(i)}
          className="relative aspect-square overflow-hidden cursor-pointer group"
        >
          <img
            src={img.thumbUrl || img.url}
            alt={`Image ${i + 1}`}
            className="w-full h-full object-cover group-hover:opacity-90 transition-opacity"
            loading="lazy"
          />
          {i === 8 && count > 9 && (
            <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
              <span className="text-white text-2xl font-bold">+{count - 9}</span>
            </div>
          )}
        </button>
      ))}
    </div>
  );
}