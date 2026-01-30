import React, { useRef } from 'react';
import { Upload, Image as ImageIcon, Loader2, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import { useOptimizedImageUpload } from '@/components/hooks/useOptimizedImageUpload';

/**
 * Composant d'upload d'images avec optimisation automatique
 * 
 * @example
 * <OptimizedImageUploader
 *   type="avatar"
 *   onUploadComplete={(result) => console.log(result.url)}
 *   accept="image/*"
 * />
 */
export default function OptimizedImageUploader({
  type = 'default',
  context = '',
  onUploadComplete,
  onUploadError,
  multiple = false,
  accept = 'image/*',
  showPreview = true,
  showNotification = true,
  privateStorage = false,
  className,
  buttonText = 'Sélectionner une image',
  buttonVariant = 'outline',
  disabled = false
}) {
  const inputRef = useRef(null);
  const [previewUrl, setPreviewUrl] = React.useState(null);

  const { uploadImage, uploadImages, uploading, progress } = useOptimizedImageUpload({
    type,
    context,
    showNotification,
    privateStorage
  });

  const handleFileSelect = async (event) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    // Créer l'aperçu pour une seule image
    if (!multiple && files.length === 1 && showPreview) {
      const reader = new FileReader();
      reader.onload = (e) => setPreviewUrl(e.target.result);
      reader.readAsDataURL(files[0]);
    }

    try {
      let result;
      if (multiple) {
        result = await uploadImages(files);
      } else {
        result = await uploadImage(files[0]);
      }

      if (result && onUploadComplete) {
        onUploadComplete(result);
      }
    } catch (error) {
      if (onUploadError) {
        onUploadError(error);
      }
    }

    // Reset input
    if (inputRef.current) {
      inputRef.current.value = '';
    }
  };

  const handleClick = () => {
    inputRef.current?.click();
  };

  return (
    <div className={cn('space-y-3', className)}>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple={multiple}
        onChange={handleFileSelect}
        className="hidden"
        disabled={disabled || uploading}
      />

      <Button
        type="button"
        variant={buttonVariant}
        onClick={handleClick}
        disabled={disabled || uploading}
        className="w-full"
      >
        {uploading ? (
          <>
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            Optimisation et upload...
          </>
        ) : (
          <>
            <Upload className="w-4 h-4 mr-2" />
            {buttonText}
          </>
        )}
      </Button>

      {uploading && (
        <div className="space-y-2">
          <Progress value={progress} className="h-2" />
          <p className="text-xs text-gray-500 text-center">
            {progress < 40 ? 'Optimisation de l\'image...' : 
             progress < 80 ? 'Upload en cours...' : 
             'Finalisation...'}
          </p>
        </div>
      )}

      {showPreview && previewUrl && !uploading && (
        <Card className="p-3 bg-green-50 border-green-200">
          <div className="flex items-center gap-3">
            <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-medium text-green-900">Image optimisée et uploadée</p>
              <p className="text-xs text-green-700">Prête à être utilisée</p>
            </div>
            {previewUrl && (
              <img 
                src={previewUrl} 
                alt="Aperçu" 
                className="w-12 h-12 rounded object-cover"
              />
            )}
          </div>
        </Card>
      )}
    </div>
  );
}