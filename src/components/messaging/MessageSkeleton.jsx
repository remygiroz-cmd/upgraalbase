import React from 'react';

export default function MessageSkeleton({ count = 3 }) {
  return (
    <div className="space-y-4 p-4">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className={`flex gap-2 ${i % 2 === 0 ? 'justify-start' : 'justify-end'}`}>
          {i % 2 === 0 && (
            <div className="w-8 h-8 rounded-full bg-gray-200 animate-pulse" />
          )}
          <div className="space-y-2">
            <div className={`h-16 rounded-2xl bg-gray-200 animate-pulse ${i % 2 === 0 ? 'w-48' : 'w-56'}`} />
          </div>
          {i % 2 === 1 && (
            <div className="w-8 h-8 rounded-full bg-gray-200 animate-pulse" />
          )}
        </div>
      ))}
    </div>
  );
}