/**
 * Optimisation automatique des images avant upload
 * Redimensionne, compresse et convertit les images pour réduire leur poids
 */

// Configuration par type d'usage
const IMAGE_CONFIGS = {
  avatar: { maxWidth: 512, maxHeight: 512, quality: 0.85, maxSizeKB: 200 },
  logo: { maxWidth: 1024, maxHeight: 1024, quality: 0.85, maxSizeKB: 300 },
  photo: { maxWidth: 1600, maxHeight: 1600, quality: 0.80, maxSizeKB: 500 },
  document: { maxWidth: 2048, maxHeight: 2048, quality: 0.75, maxSizeKB: 800 },
  default: { maxWidth: 1600, maxHeight: 1600, quality: 0.80, maxSizeKB: 500 }
};

/**
 * Détecte le type d'image en fonction du contexte
 */
function detectImageType(fileName, context = '') {
  const lowerContext = context.toLowerCase();
  const lowerFileName = fileName.toLowerCase();
  
  if (lowerContext.includes('avatar') || lowerContext.includes('profile') || lowerFileName.includes('avatar')) {
    return 'avatar';
  }
  if (lowerContext.includes('logo') || lowerFileName.includes('logo')) {
    return 'logo';
  }
  if (lowerContext.includes('document') || lowerContext.includes('doc')) {
    return 'document';
  }
  if (lowerContext.includes('photo') || lowerContext.includes('employee') || lowerContext.includes('employé')) {
    return 'photo';
  }
  
  return 'default';
}

/**
 * Charge une image depuis un File et retourne un HTMLImageElement
 */
function loadImage(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Erreur de chargement de l\'image'));
    };
    
    img.src = url;
  });
}

/**
 * Calcule les nouvelles dimensions en préservant le ratio
 */
function calculateDimensions(img, maxWidth, maxHeight) {
  let { width, height } = img;
  
  // Si déjà plus petit que les limites, garder la taille originale
  if (width <= maxWidth && height <= maxHeight) {
    return { width, height, needsResize: false };
  }
  
  // Calculer le ratio
  const ratio = Math.min(maxWidth / width, maxHeight / height);
  
  return {
    width: Math.round(width * ratio),
    height: Math.round(height * ratio),
    needsResize: true
  };
}

/**
 * Optimise une image : redimensionne, compresse et convertit
 */
async function optimizeImage(file, type = 'default', context = '') {
  // Vérifier que c'est bien une image
  if (!file.type.startsWith('image/')) {
    throw new Error('Le fichier n\'est pas une image');
  }
  
  // Auto-détection du type si non spécifié
  if (type === 'default') {
    type = detectImageType(file.name, context);
  }
  
  const config = IMAGE_CONFIGS[type] || IMAGE_CONFIGS.default;
  
  // Charger l'image
  const img = await loadImage(file);
  
  // Calculer les nouvelles dimensions
  const dimensions = calculateDimensions(img, config.maxWidth, config.maxHeight);
  
  // Créer un canvas
  const canvas = document.createElement('canvas');
  canvas.width = dimensions.width;
  canvas.height = dimensions.height;
  
  const ctx = canvas.getContext('2d');
  
  // Optimisation du rendu
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  
  // Dessiner l'image redimensionnée
  ctx.drawImage(img, 0, 0, dimensions.width, dimensions.height);
  
  // Tenter WebP d'abord (meilleure compression)
  let blob = await canvasToBlob(canvas, 'image/webp', config.quality);
  let format = 'webp';
  
  // Vérifier si WebP est supporté et si la taille est acceptable
  const targetSizeBytes = config.maxSizeKB * 1024;
  
  // Si WebP trop lourd ou non supporté, utiliser JPEG
  if (!blob || blob.size > targetSizeBytes) {
    blob = await canvasToBlob(canvas, 'image/jpeg', config.quality);
    format = 'jpeg';
  }
  
  // Si encore trop lourd, réduire la qualité progressivement
  let quality = config.quality;
  let attempts = 0;
  const maxAttempts = 5;
  
  while (blob.size > targetSizeBytes && attempts < maxAttempts && quality > 0.4) {
    quality -= 0.1;
    blob = await canvasToBlob(canvas, format === 'webp' ? 'image/webp' : 'image/jpeg', quality);
    attempts++;
  }
  
  // Créer un nouveau fichier avec le nom optimisé
  const extension = format === 'webp' ? '.webp' : '.jpg';
  const originalName = file.name.replace(/\.[^/.]+$/, '');
  const optimizedFileName = `${originalName}_optimized${extension}`;
  
  const optimizedFile = new File([blob], optimizedFileName, {
    type: format === 'webp' ? 'image/webp' : 'image/jpeg',
    lastModified: Date.now()
  });
  
  // Statistiques d'optimisation
  const stats = {
    originalSize: file.size,
    optimizedSize: optimizedFile.size,
    reduction: Math.round((1 - optimizedFile.size / file.size) * 100),
    originalDimensions: { width: img.width, height: img.height },
    optimizedDimensions: { width: dimensions.width, height: dimensions.height },
    format,
    quality: Math.round(quality * 100),
    type
  };
  
  return { file: optimizedFile, stats };
}

/**
 * Convertit un canvas en Blob avec le format et la qualité spécifiés
 */
function canvasToBlob(canvas, mimeType, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob);
        } else {
          reject(new Error('Échec de la conversion en blob'));
        }
      },
      mimeType,
      quality
    );
  });
}

/**
 * Optimise plusieurs images en parallèle
 */
async function optimizeImages(files, type = 'default', context = '') {
  const promises = Array.from(files).map(file => optimizeImage(file, type, context));
  return Promise.all(promises);
}

/**
 * Formate les stats pour affichage
 */
function formatOptimizationStats(stats) {
  const originalMB = (stats.originalSize / 1024 / 1024).toFixed(2);
  const optimizedKB = (stats.optimizedSize / 1024).toFixed(0);
  
  return {
    message: `Image optimisée : ${originalMB} MB → ${optimizedKB} KB (${stats.reduction}% de réduction)`,
    details: `Format: ${stats.format.toUpperCase()} | Qualité: ${stats.quality}% | Dimensions: ${stats.optimizedDimensions.width}×${stats.optimizedDimensions.height}`,
    shouldNotify: stats.reduction > 20 // Notifier si réduction > 20%
  };
}

export { optimizeImage, optimizeImages, formatOptimizationStats, IMAGE_CONFIGS };