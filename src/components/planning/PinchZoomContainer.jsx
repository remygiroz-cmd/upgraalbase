import React, { useRef, useState, useEffect } from 'react';
import { ZoomIn, ZoomOut, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const MIN_ZOOM = 0.75;
const MAX_ZOOM = 1.6;

export default function PinchZoomContainer({ children, className, monthKey }) {
  const [zoom, setZoom] = useState(() => {
    // Restore zoom per month
    const saved = sessionStorage.getItem(`planning-zoom-${monthKey}`);
    return saved ? parseFloat(saved) : 1;
  });
  const [isPinching, setIsPinching] = useState(false);
  const containerRef = useRef(null);
  const touchesRef = useRef([]);
  const initialDistanceRef = useRef(0);
  const initialZoomRef = useRef(1);

  // Save zoom to sessionStorage
  useEffect(() => {
    sessionStorage.setItem(`planning-zoom-${monthKey}`, zoom.toString());
  }, [zoom, monthKey]);

  // Calculate distance between two touches
  const getDistance = (touch1, touch2) => {
    const dx = touch1.clientX - touch2.clientX;
    const dy = touch1.clientY - touch2.clientY;
    return Math.sqrt(dx * dx + dy * dy);
  };

  // Handle touch events for pinch zoom - ONLY preventDefault when 2 fingers
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleTouchStart = (e) => {
      // Only handle 2-finger pinch, let 1-finger scroll through
      if (e.touches.length === 2) {
        e.preventDefault(); // Only block when pinching
        setIsPinching(true);
        touchesRef.current = Array.from(e.touches);
        initialDistanceRef.current = getDistance(e.touches[0], e.touches[1]);
        initialZoomRef.current = zoom;
      }
    };

    const handleTouchMove = (e) => {
      // Only handle when actively pinching with 2 fingers
      if (e.touches.length === 2 && isPinching) {
        e.preventDefault();
        const currentDistance = getDistance(e.touches[0], e.touches[1]);
        const scale = currentDistance / initialDistanceRef.current;
        const newZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, initialZoomRef.current * scale));
        setZoom(newZoom);
      }
      // If 1 finger, do nothing - let native scroll work
    };

    const handleTouchEnd = (e) => {
      if (e.touches.length < 2) {
        setTimeout(() => setIsPinching(false), 100);
        touchesRef.current = [];
      }
    };

    // passive: false only for 2-finger detection, but we check touches.length first
    container.addEventListener('touchstart', handleTouchStart, { passive: false });
    container.addEventListener('touchmove', handleTouchMove, { passive: false });
    container.addEventListener('touchend', handleTouchEnd, { passive: true });
    container.addEventListener('touchcancel', handleTouchEnd, { passive: true });

    return () => {
      container.removeEventListener('touchstart', handleTouchStart);
      container.removeEventListener('touchmove', handleTouchMove);
      container.removeEventListener('touchend', handleTouchEnd);
      container.removeEventListener('touchcancel', handleTouchEnd);
    };
  }, [isPinching, zoom]);

  const handleZoomIn = () => {
    setZoom(prev => Math.min(MAX_ZOOM, prev + 0.1));
  };

  const handleZoomOut = () => {
    setZoom(prev => Math.max(MIN_ZOOM, prev - 0.1));
  };

  const handleReset = () => {
    setZoom(1);
  };

  return (
    <div className="relative">
      {/* Zoom controls - mobile only */}
      <div className="lg:hidden fixed bottom-24 left-4 z-40 bg-white rounded-lg shadow-xl border-2 border-gray-200 p-2 flex flex-col gap-2">
        <Button
          variant="outline"
          size="icon"
          onClick={handleZoomOut}
          disabled={zoom <= MIN_ZOOM}
          className="h-8 w-8"
          title="Zoom out"
        >
          <ZoomOut className="w-4 h-4" />
        </Button>
        <div className="text-xs font-bold text-center px-2 py-1 bg-gray-100 rounded">
          {Math.round(zoom * 100)}%
        </div>
        <Button
          variant="outline"
          size="icon"
          onClick={handleZoomIn}
          disabled={zoom >= MAX_ZOOM}
          className="h-8 w-8"
          title="Zoom in"
        >
          <ZoomIn className="w-4 h-4" />
        </Button>
        {zoom !== 1 && (
          <Button
            variant="outline"
            size="icon"
            onClick={handleReset}
            className="h-8 w-8 border-orange-300"
            title="Reset zoom"
          >
            <RotateCcw className="w-4 h-4 text-orange-600" />
          </Button>
        )}
      </div>

      {/* Scrollable viewport - ALWAYS allows pan/scroll */}
      <div
        ref={containerRef}
        className={cn(
          "overflow-auto",
          className
        )}
        style={{
          WebkitOverflowScrolling: 'touch',
          touchAction: 'pan-x pan-y', // ALWAYS allow pan, never block scroll
          height: '100%',
          width: '100%',
          position: 'relative'
        }}
      >
        {/* Sizer - maintains scrollable area based on zoom */}
        <div
          style={{
            width: zoom === 1 ? '100%' : `${zoom * 100}%`,
            height: zoom === 1 ? '100%' : `${zoom * 100}%`,
            minWidth: zoom === 1 ? '100%' : `${zoom * 100}%`,
            position: 'relative'
          }}
        >
          {/* Scaled content wrapper */}
          <div
            style={{
              transform: `scale(${zoom})`,
              transformOrigin: 'top left',
              transition: isPinching ? 'none' : 'transform 0.1s ease-out',
              width: zoom === 1 ? '100%' : `${100 / zoom}%`,
              height: '100%',
              position: 'absolute',
              top: 0,
              left: 0,
              pointerEvents: 'auto'
            }}
          >
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}