import { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { optimizeImage, formatOptimizationStats } from '@/components/utils/imageOptimizer';
import { toast } from 'sonner';

/**
 * Hook personnalisé pour uploader des images optimisées automatiquement
 * 
 * @param {Object} options - Options de configuration
 * @param {string} options.type - Type d'image ('avatar', 'logo', 'photo', 'document')
 * @param {string} options.context - Contexte pour auto-détection du type
 * @param {boolean} options.showNotification - Afficher une notification d'optimisation (défaut: true)
 * @param {boolean} options.privateStorage - Utiliser le stockage privé (défaut: false)
 * 
 * @returns {Object} - { uploadImage, uploadImages, uploading, progress, error }
 * 
 * @example
 * const { uploadImage, uploading } = useOptimizedImageUpload({ 
 *   type: 'avatar',
 *   showNotification: true 
 * });
 * 
 * const handleUpload = async (file) => {
 *   const result = await uploadImage(file);
 *   if (result) {
 *     console.log('URL:', result.url);
 *   }
 * };
 */
export function useOptimizedImageUpload(options = {}) {
  const {
    type = 'default',
    context = '',
    showNotification = true,
    privateStorage = false
  } = options;

  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState(null);

  /**
   * Upload une image unique avec optimisation automatique
   */
  const uploadImage = async (file) => {
    if (!file) {
      setError('Aucun fichier sélectionné');
      return null;
    }

    setUploading(true);
    setError(null);
    setProgress(0);

    try {
      // Vérifier que c'est une image
      if (!file.type.startsWith('image/')) {
        throw new Error('Le fichier doit être une image');
      }

      // Étape 1 : Optimisation (30%)
      setProgress(30);
      const { file: optimizedFile, stats } = await optimizeImage(file, type, context);

      // Étape 2 : Upload (60%)
      setProgress(60);
      let uploadResult;
      
      if (privateStorage) {
        uploadResult = await base44.integrations.Core.UploadPrivateFile({ file: optimizedFile });
      } else {
        uploadResult = await base44.integrations.Core.UploadFile({ file: optimizedFile });
      }

      // Étape 3 : Terminé (100%)
      setProgress(100);

      // Notification de succès avec stats
      if (showNotification) {
        const formattedStats = formatOptimizationStats(stats);
        
        if (formattedStats.shouldNotify) {
          toast.success(formattedStats.message, {
            description: formattedStats.details,
            duration: 4000
          });
        } else {
          toast.success('Image uploadée avec succès');
        }
      }

      setUploading(false);
      
      return {
        url: privateStorage ? uploadResult.file_uri : uploadResult.file_url,
        stats,
        file: optimizedFile
      };

    } catch (err) {
      console.error('Erreur upload image optimisée:', err);
      setError(err.message);
      setUploading(false);
      
      if (showNotification) {
        toast.error('Erreur lors de l\'upload de l\'image', {
          description: err.message
        });
      }
      
      return null;
    }
  };

  /**
   * Upload plusieurs images avec optimisation automatique
   */
  const uploadImages = async (files) => {
    if (!files || files.length === 0) {
      setError('Aucun fichier sélectionné');
      return [];
    }

    setUploading(true);
    setError(null);
    setProgress(0);

    try {
      const filesArray = Array.from(files);
      const results = [];
      
      for (let i = 0; i < filesArray.length; i++) {
        const file = filesArray[i];
        
        // Vérifier que c'est une image
        if (!file.type.startsWith('image/')) {
          console.warn(`Fichier ignoré (pas une image): ${file.name}`);
          continue;
        }

        // Optimisation
        const { file: optimizedFile, stats } = await optimizeImage(file, type, context);

        // Upload
        let uploadResult;
        if (privateStorage) {
          uploadResult = await base44.integrations.Core.UploadPrivateFile({ file: optimizedFile });
        } else {
          uploadResult = await base44.integrations.Core.UploadFile({ file: optimizedFile });
        }

        results.push({
          url: privateStorage ? uploadResult.file_uri : uploadResult.file_url,
          stats,
          file: optimizedFile,
          originalName: file.name
        });

        // Mise à jour progression
        setProgress(Math.round(((i + 1) / filesArray.length) * 100));
      }

      if (showNotification) {
        const totalReduction = results.reduce((sum, r) => sum + r.stats.reduction, 0) / results.length;
        toast.success(`${results.length} image(s) uploadée(s)`, {
          description: `Réduction moyenne: ${Math.round(totalReduction)}%`,
          duration: 3000
        });
      }

      setUploading(false);
      return results;

    } catch (err) {
      console.error('Erreur upload images optimisées:', err);
      setError(err.message);
      setUploading(false);
      
      if (showNotification) {
        toast.error('Erreur lors de l\'upload des images', {
          description: err.message
        });
      }
      
      return [];
    }
  };

  /**
   * Upload depuis un input file avec optimisation
   */
  const uploadFromInput = async (event) => {
    const files = event.target.files;
    if (!files || files.length === 0) return null;

    if (files.length === 1) {
      return uploadImage(files[0]);
    } else {
      return uploadImages(files);
    }
  };

  return {
    uploadImage,
    uploadImages,
    uploadFromInput,
    uploading,
    progress,
    error
  };
}

export default useOptimizedImageUpload;