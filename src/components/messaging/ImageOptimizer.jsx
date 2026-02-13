/**
 * Image Optimizer - Compression et redimensionnement optimisés
 * Style WhatsApp avec compression adaptative
 */

/**
 * Détecte la qualité de connexion
 */
export function getNetworkQuality() {
  if (!navigator.connection) return 'fast';
  
  const conn = navigator.connection;
  const type = conn.effectiveType;
  
  if (type === '4g' || type === 'wifi') return 'fast';
  if (type === '3g') return 'medium';
  return 'slow';
}

/**
 * Paramètres de compression selon réseau
 */
export function getCompressionParams() {
  const quality = getNetworkQuality();
  
  switch (quality) {
    case 'fast':
      return { quality: 0.80, maxWidth: 1600, thumbQuality: 0.70 };
    case 'medium':
      return { quality: 0.70, maxWidth: 1600, thumbQuality: 0.60 };
    case 'slow':
      return { quality: 0.55, maxWidth: 1200, thumbQuality: 0.50 };
    default:
      return { quality: 0.75, maxWidth: 1600, thumbQuality: 0.65 };
  }
}

/**
 * Charge une image depuis un File
 */
function loadImage(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

/**
 * Redimensionne et compresse une image
 */
export async function optimizeImage(file, maxWidth, quality) {
  // Vérifier la taille
  if (file.size > 15 * 1024 * 1024) {
    throw new Error('Fichier trop volumineux (max 15MB)');
  }
  
  // Vérifier le type
  const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/heic'];
  if (!allowedTypes.includes(file.type)) {
    throw new Error('Format non supporté. Utilisez JPEG, PNG ou WebP.');
  }
  
  const img = await loadImage(file);
  
  // Calculer dimensions
  let width = img.width;
  let height = img.height;
  
  if (width > maxWidth) {
    height = (height * maxWidth) / width;
    width = maxWidth;
  }
  
  // Créer canvas
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0, width, height);
  
  // Convertir en WebP avec compression
  let blob = await new Promise(resolve => {
    canvas.toBlob(resolve, 'image/webp', quality);
  });
  
  // Si toujours > 1.5MB, réduire qualité progressivement
  let currentQuality = quality;
  while (blob.size > 1.5 * 1024 * 1024 && currentQuality > 0.4) {
    currentQuality -= 0.05;
    blob = await new Promise(resolve => {
      canvas.toBlob(resolve, 'image/webp', currentQuality);
    });
  }
  
  URL.revokeObjectURL(img.src);
  
  return {
    blob,
    width,
    height,
    size: blob.size,
    mimeType: 'image/webp'
  };
}

/**
 * Crée une miniature
 */
export async function createThumbnail(file) {
  const params = getCompressionParams();
  return optimizeImage(file, 320, params.thumbQuality);
}

/**
 * Optimise une image complète
 */
export async function optimizeFullImage(file, onProgress) {
  const params = getCompressionParams();
  
  if (onProgress) onProgress({ stage: 'compression', progress: 0 });
  
  const optimized = await optimizeImage(file, params.maxWidth, params.quality);
  
  if (onProgress) onProgress({ stage: 'compression', progress: 100 });
  
  return optimized;
}

/**
 * Traite plusieurs images avec progression
 */
export async function processImages(files, onProgress) {
  const results = [];
  
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    
    if (onProgress) {
      onProgress({
        stage: 'processing',
        current: i + 1,
        total: files.length,
        filename: file.name
      });
    }
    
    try {
      // Créer miniature
      const thumb = await createThumbnail(file);
      
      // Optimiser image complète
      const full = await optimizeFullImage(file);
      
      results.push({
        original: file,
        full,
        thumb,
        success: true
      });
    } catch (error) {
      results.push({
        original: file,
        error: error.message,
        success: false
      });
    }
  }
  
  return results;
}