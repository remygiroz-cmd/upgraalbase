import React, { useRef, useEffect, useCallback } from 'react';
import { cn } from '@/lib/utils';

const MONTHS_SHORT = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Jun', 'Jul', 'Aoû', 'Sep', 'Oct', 'Nov', 'Déc'];

// Generate a range of months: 12 months before current + 12 after
function generateMonthItems(currentYear, currentMonth) {
  const items = [];
  // From 2 years back to 2 years ahead
  const startYear = currentYear - 2;
  const endYear = currentYear + 2;
  for (let y = startYear; y <= endYear; y++) {
    for (let m = 0; m < 12; m++) {
      items.push({ year: y, month: m, key: `${y}-${String(m + 1).padStart(2, '0')}` });
    }
  }
  return items;
}

const ITEM_WIDTH = 72; // px — width of each month cell

export default function MonthCarousel({ currentYear, currentMonth, onChange }) {
  const items = generateMonthItems(currentYear, currentMonth);
  const containerRef = useRef(null);
  const activeIndexRef = useRef(-1);
  const lastEmittedKey = useRef(null);
  const isScrollingProgrammatically = useRef(false);

  // Find index of a given year/month in items
  const indexOf = (year, month) =>
    items.findIndex(i => i.year === year && i.month === month);

  // Scroll to a specific index (instant or smooth)
  const scrollToIndex = useCallback((index, behavior = 'instant') => {
    const container = containerRef.current;
    if (!container) return;
    const containerWidth = container.offsetWidth;
    const targetScrollLeft = index * ITEM_WIDTH - containerWidth / 2 + ITEM_WIDTH / 2;
    isScrollingProgrammatically.current = true;
    container.scrollTo({ left: Math.max(0, targetScrollLeft), behavior });
    if (behavior === 'instant') {
      setTimeout(() => { isScrollingProgrammatically.current = false; }, 50);
    } else {
      setTimeout(() => { isScrollingProgrammatically.current = false; }, 400);
    }
  }, []);

  // On mount: scroll to current month instantly
  useEffect(() => {
    const idx = indexOf(currentYear, currentMonth);
    if (idx >= 0) scrollToIndex(idx, 'instant');
  }, []); // only on mount

  // When currentYear/currentMonth changes externally (e.g. from outside), sync carousel
  useEffect(() => {
    const currentKey = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}`;
    if (lastEmittedKey.current === currentKey) return; // we triggered this change, skip
    const idx = indexOf(currentYear, currentMonth);
    if (idx >= 0) scrollToIndex(idx, 'smooth');
  }, [currentYear, currentMonth]);

  // On scroll: detect centered month and emit if changed
  const handleScroll = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;

    const containerWidth = container.offsetWidth;
    const centerX = container.scrollLeft + containerWidth / 2;
    const idx = Math.round((centerX - ITEM_WIDTH / 2) / ITEM_WIDTH);
    const clampedIdx = Math.max(0, Math.min(idx, items.length - 1));

    if (clampedIdx === activeIndexRef.current) return;
    activeIndexRef.current = clampedIdx;

    const item = items[clampedIdx];
    if (!item) return;

    const newKey = item.key;
    if (newKey === lastEmittedKey.current) return;
    lastEmittedKey.current = newKey;
    onChange(item.year, item.month);
  }, [items, onChange]);

  // Track scroll position for visual transforms via CSS custom prop
  const rafRef = useRef(null);
  const handleScrollVisual = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      handleScroll();
      // Force re-render for visual updates
      forceUpdate();
    });
  }, [handleScroll]);

  // Minimal force-update
  const [, setTick] = React.useState(0);
  const forceUpdate = useCallback(() => setTick(t => t + 1), []);

  // Compute which index is currently centered (for live transforms during drag)
  const getCenteredIndex = () => {
    const container = containerRef.current;
    if (!container) return indexOf(currentYear, currentMonth);
    const containerWidth = container.offsetWidth;
    const centerX = container.scrollLeft + containerWidth / 2;
    return (centerX - ITEM_WIDTH / 2) / ITEM_WIDTH;
  };

  const centeredIndex = getCenteredIndex();

  // Detect year boundary changes for the year indicator
  const getVisibleYear = () => {
    const idx = Math.round(centeredIndex);
    return items[Math.max(0, Math.min(idx, items.length - 1))]?.year ?? currentYear;
  };

  return (
    <div className="relative w-full select-none">
      {/* Year indicator */}
      <div className="text-center text-xs font-bold text-orange-600 mb-1 tracking-widest uppercase">
        {getVisibleYear()}
      </div>

      {/* Fade masks left/right */}
      <div className="absolute left-0 top-6 bottom-0 w-10 z-10 pointer-events-none bg-gradient-to-r from-white to-transparent" />
      <div className="absolute right-0 top-6 bottom-0 w-10 z-10 pointer-events-none bg-gradient-to-l from-white to-transparent" />

      {/* Carousel track */}
      <div
        ref={containerRef}
        onScroll={handleScrollVisual}
        className="flex overflow-x-auto pb-1"
        style={{
          scrollSnapType: 'x mandatory',
          scrollBehavior: 'auto',
          msOverflowStyle: 'none',
          scrollbarWidth: 'none',
          WebkitOverflowScrolling: 'touch',
          cursor: 'grab',
        }}
      >
        {/* Left padding so first item can be centered */}
        <div className="flex-shrink-0" style={{ width: 'calc(50% - 36px)' }} />

        {items.map((item, idx) => {
          const distance = Math.abs(idx - centeredIndex);
          const isActive = distance < 0.5;
          // Lerp scale: 1.2 at center, 0.93 at distance ≥ 2
          const scale = Math.max(0.93, 1.2 - distance * 0.135);
          const opacity = Math.max(0.35, 1 - distance * 0.25);

          // Year separator: show year label above first month of a year if it's different from previous
          const showYearSep = item.month === 0 && idx > 0;

          return (
            <div
              key={item.key}
              className="flex-shrink-0 flex items-center justify-center"
              style={{
                width: ITEM_WIDTH,
                scrollSnapAlign: 'center',
              }}
            >
              <button
                onClick={() => {
                  const i = indexOf(item.year, item.month);
                  scrollToIndex(i, 'smooth');
                  lastEmittedKey.current = item.key;
                  onChange(item.year, item.month);
                }}
                className={cn(
                  'flex flex-col items-center justify-center rounded-xl px-2 py-1.5 transition-all',
                  isActive ? 'text-orange-600' : 'text-gray-500',
                )}
                style={{
                  transform: `scale(${scale})`,
                  opacity,
                  transition: 'transform 200ms ease, opacity 200ms ease',
                  width: 60,
                  fontWeight: isActive ? 700 : 500,
                  letterSpacing: isActive ? '0.02em' : '0',
                }}
              >
                {showYearSep && (
                  <span className="text-[8px] font-bold text-orange-400 uppercase tracking-widest mb-0.5 leading-none">
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

        {/* Right padding so last item can be centered */}
        <div className="flex-shrink-0" style={{ width: 'calc(50% - 36px)' }} />
      </div>

      {/* Hide scrollbar */}
      <style>{`.month-carousel-track::-webkit-scrollbar { display: none; }`}</style>
    </div>
  );
}