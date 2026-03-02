import React, { useRef, useEffect, useCallback, useState } from 'react';
import { cn } from '@/lib/utils';
import { ChevronLeft, ChevronRight } from 'lucide-react';

const MONTHS_SHORT = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Jun', 'Jul', 'Aoû', 'Sep', 'Oct', 'Nov', 'Déc'];
const ITEM_WIDTH = 72; // px

function generateMonthItems() {
  const now = new Date();
  const currentYear = now.getFullYear();
  const items = [];
  for (let y = currentYear - 2; y <= currentYear + 2; y++) {
    for (let m = 0; m < 12; m++) {
      items.push({ year: y, month: m, key: `${y}-${String(m + 1).padStart(2, '0')}` });
    }
  }
  return items;
}

const ITEMS = generateMonthItems();

export default function MonthCarousel({ currentYear, currentMonth, onChange }) {
  const containerRef = useRef(null);
  const itemRefs = useRef({});
  const lastEmittedKey = useRef(null);
  const isDragging = useRef(false);
  const dragStartX = useRef(0);
  const dragStartScrollLeft = useRef(0);
  const scrollEndTimer = useRef(null);
  const [centeredKey, setCenteredKey] = useState(`${currentYear}-${String(currentMonth + 1).padStart(2, '0')}`);

  const activeKey = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}`;

  // Scroll item into center
  const scrollToKey = useCallback((key, behavior = 'smooth') => {
    const el = itemRefs.current[key];
    if (el) {
      el.scrollIntoView({ behavior, inline: 'center', block: 'nearest' });
    }
  }, []);

  // On mount: center current month instantly
  useEffect(() => {
    scrollToKey(activeKey, 'instant');
    lastEmittedKey.current = activeKey;
    setCenteredKey(activeKey);
  }, []); // eslint-disable-line

  // When activeKey changes from outside (PlanningV2 changed month), re-center
  useEffect(() => {
    if (lastEmittedKey.current === activeKey) return;
    lastEmittedKey.current = activeKey;
    setCenteredKey(activeKey);
    scrollToKey(activeKey, 'smooth');
  }, [activeKey, scrollToKey]);

  // Detect which item is centered after scroll settles
  const detectCentered = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    const containerRect = container.getBoundingClientRect();
    const centerX = containerRect.left + containerRect.width / 2;

    let closestKey = null;
    let closestDist = Infinity;
    for (const [key, el] of Object.entries(itemRefs.current)) {
      if (!el) continue;
      const rect = el.getBoundingClientRect();
      const itemCenter = rect.left + rect.width / 2;
      const dist = Math.abs(itemCenter - centerX);
      if (dist < closestDist) {
        closestDist = dist;
        closestKey = key;
      }
    }

    if (closestKey && closestKey !== lastEmittedKey.current) {
      lastEmittedKey.current = closestKey;
      setCenteredKey(closestKey);
      const item = ITEMS.find(i => i.key === closestKey);
      if (item) onChange(item.year, item.month);
    }
  }, [onChange]);

  // Scroll handler: debounce to detect settled position
  const handleScroll = useCallback(() => {
    if (scrollEndTimer.current) clearTimeout(scrollEndTimer.current);
    scrollEndTimer.current = setTimeout(detectCentered, 80);
  }, [detectCentered]);

  // Wheel: convert vertical wheel to horizontal scroll
  const handleWheel = useCallback((e) => {
    e.preventDefault();
    const container = containerRef.current;
    if (!container) return;
    container.scrollLeft += e.deltaY || e.deltaX;
  }, []);

  // Mouse drag
  const handleMouseDown = useCallback((e) => {
    if (e.button !== 0) return;
    isDragging.current = true;
    dragStartX.current = e.pageX - containerRef.current.offsetLeft;
    dragStartScrollLeft.current = containerRef.current.scrollLeft;
    containerRef.current.style.cursor = 'grabbing';
    containerRef.current.style.userSelect = 'none';
  }, []);

  const handleMouseMove = useCallback((e) => {
    if (!isDragging.current) return;
    const x = e.pageX - containerRef.current.offsetLeft;
    const walk = x - dragStartX.current;
    containerRef.current.scrollLeft = dragStartScrollLeft.current - walk;
  }, []);

  const handleMouseUp = useCallback(() => {
    if (!isDragging.current) return;
    isDragging.current = false;
    containerRef.current.style.cursor = 'grab';
    containerRef.current.style.userSelect = '';
    // Snap to nearest after drag
    detectCentered();
    const el = itemRefs.current[lastEmittedKey.current];
    if (el) el.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
  }, [detectCentered]);

  // Arrow navigation
  const handlePrev = useCallback(() => {
    const idx = ITEMS.findIndex(i => i.key === (lastEmittedKey.current || activeKey));
    if (idx > 0) {
      const prev = ITEMS[idx - 1];
      scrollToKey(prev.key, 'smooth');
      lastEmittedKey.current = prev.key;
      setCenteredKey(prev.key);
      onChange(prev.year, prev.month);
    }
  }, [activeKey, scrollToKey, onChange]);

  const handleNext = useCallback(() => {
    const idx = ITEMS.findIndex(i => i.key === (lastEmittedKey.current || activeKey));
    if (idx < ITEMS.length - 1) {
      const next = ITEMS[idx + 1];
      scrollToKey(next.key, 'smooth');
      lastEmittedKey.current = next.key;
      setCenteredKey(next.key);
      onChange(next.year, next.month);
    }
  }, [activeKey, scrollToKey, onChange]);

  // Attach wheel listener (passive: false to prevent page scroll)
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    container.addEventListener('wheel', handleWheel, { passive: false });
    return () => container.removeEventListener('wheel', handleWheel);
  }, [handleWheel]);

  // Get visible year from centered key
  const visibleYear = centeredKey ? parseInt(centeredKey.split('-')[0]) : currentYear;

  return (
    <div className="relative w-full select-none">
      {/* Year indicator */}
      <div className="text-center text-[11px] font-bold text-orange-600 mb-1 tracking-widest uppercase leading-none">
        {visibleYear}
      </div>

      <div className="flex items-center gap-1">
        {/* Left arrow */}
        <button
          onClick={handlePrev}
          className="flex-shrink-0 w-6 h-6 flex items-center justify-center rounded-full hover:bg-orange-100 text-gray-400 hover:text-orange-600 transition-colors"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>

        {/* Fade masks */}
        <div className="relative flex-1 min-w-0">
          <div className="absolute left-0 top-0 bottom-0 w-8 z-10 pointer-events-none bg-gradient-to-r from-white to-transparent" />
          <div className="absolute right-0 top-0 bottom-0 w-8 z-10 pointer-events-none bg-gradient-to-l from-white to-transparent" />

          {/* Scroll container */}
          <div
            ref={containerRef}
            onScroll={handleScroll}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            className="flex overflow-x-auto"
            style={{
              scrollSnapType: 'x mandatory',
              scrollBehavior: 'auto',
              scrollbarWidth: 'thin',
              scrollbarColor: '#fdba74 transparent',
              cursor: 'grab',
              WebkitOverflowScrolling: 'touch',
            }}
          >
            {/* Left spacer so first item can center */}
            <div className="flex-shrink-0" style={{ width: `calc(50% - ${ITEM_WIDTH / 2}px)` }} />

            {ITEMS.map((item) => {
              const isActive = item.key === centeredKey;
              const showYearSep = item.month === 0;

              return (
                <div
                  key={item.key}
                  ref={el => { itemRefs.current[item.key] = el; }}
                  className="flex-shrink-0 flex items-center justify-center"
                  style={{
                    width: ITEM_WIDTH,
                    scrollSnapAlign: 'center',
                  }}
                >
                  <button
                    onClick={() => {
                      scrollToKey(item.key, 'smooth');
                      lastEmittedKey.current = item.key;
                      setCenteredKey(item.key);
                      onChange(item.year, item.month);
                    }}
                    className={cn(
                      'flex flex-col items-center justify-center rounded-xl px-2 py-1 transition-all duration-200',
                      isActive ? 'text-orange-600' : 'text-gray-500 hover:text-gray-700',
                    )}
                    style={{
                      transform: isActive ? 'scale(1.25)' : 'scale(0.9)',
                      fontWeight: isActive ? 700 : 400,
                    }}
                  >
                    {showYearSep && (
                      <span className="text-[7px] font-bold text-orange-300 uppercase tracking-widest leading-none mb-0.5">
                        {item.year}
                      </span>
                    )}
                    <span className="text-sm leading-tight">{MONTHS_SHORT[item.month]}</span>
                    {isActive && (
                      <div className="w-1 h-1 rounded-full bg-orange-500 mt-0.5" />
                    )}
                  </button>
                </div>
              );
            })}

            {/* Right spacer */}
            <div className="flex-shrink-0" style={{ width: `calc(50% - ${ITEM_WIDTH / 2}px)` }} />
          </div>
        </div>

        {/* Right arrow */}
        <button
          onClick={handleNext}
          className="flex-shrink-0 w-6 h-6 flex items-center justify-center rounded-full hover:bg-orange-100 text-gray-400 hover:text-orange-600 transition-colors"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}