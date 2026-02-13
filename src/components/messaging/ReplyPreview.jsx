import React from 'react';
import { X, CornerUpLeft } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Preview de réponse au-dessus de l'input
 */
export default function ReplyPreview({ replyTo, onCancel }) {
  if (!replyTo) return null;
  
  return (
    <div className="bg-blue-50 border-t border-blue-200 px-4 py-2">
      <div className="flex items-start gap-2">
        <CornerUpLeft className="w-4 h-4 text-blue-600 mt-1 flex-shrink-0" />
        
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium text-blue-900">
            Réponse à {replyTo.authorName}
          </p>
          
          {replyTo.type === 'text' && (
            <p className="text-sm text-gray-600 truncate">
              {replyTo.text}
            </p>
          )}
          
          {replyTo.type === 'image' && (
            <div className="flex items-center gap-2 mt-1">
              {replyTo.thumbUrl && (
                <img
                  src={replyTo.thumbUrl}
                  alt="Preview"
                  className="w-8 h-8 rounded object-cover"
                />
              )}
              <span className="text-sm text-gray-600">📷 Image</span>
            </div>
          )}
        </div>
        
        <button
          onClick={onCancel}
          className="p-1 hover:bg-blue-100 rounded transition-colors"
        >
          <X className="w-4 h-4 text-gray-600" />
        </button>
      </div>
    </div>
  );
}

/**
 * Bloc de réponse dans une bulle de message
 */
export function ReplyBlock({ replyData, onClick }) {
  if (!replyData) return null;
  
  return (
    <button
      onClick={onClick}
      className="flex items-start gap-2 mb-2 p-2 bg-black/5 rounded-lg border-l-2 border-blue-500 hover:bg-black/10 transition-colors w-full text-left"
    >
      <CornerUpLeft className="w-3 h-3 text-blue-600 mt-0.5 flex-shrink-0" />
      
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium text-blue-900">
          {replyData.reply_preview_author_name}
        </p>
        
        {replyData.reply_preview_type === 'text' && (
          <p className="text-xs text-gray-700 truncate">
            {replyData.reply_preview_text}
          </p>
        )}
        
        {replyData.reply_preview_type === 'image' && (
          <div className="flex items-center gap-2">
            {replyData.reply_preview_thumb_url && (
              <img
                src={replyData.reply_preview_thumb_url}
                alt="Preview"
                className="w-8 h-8 rounded object-cover"
              />
            )}
            <span className="text-xs text-gray-700">📷 Image</span>
          </div>
        )}
      </div>
    </button>
  );
}