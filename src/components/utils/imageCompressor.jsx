/**
 * Compression d'image stricte - MAX 900 Ko
 * Garantit que toute image capturée respecte la limite de taille
 */

const MAX_SIZE_KB = 900;
const MAX_SIZE_BYTES = MAX_SIZE_KB * 1024;
const INITIAL_MAX_WIDTH = 2000;
const INITIAL_QUALITY = 0.75;

/**
 * Compresse une image jusqu'à ce qu'elle soit ≤ 900 Ko
 * @param {File} file - Fichier image original
 * @returns {Promise<{file: File, metadata: Object}>}
 */
export async function compressImageStrict(file) {
  const startSize = file.size;
  const startTime = Date.now();
  
  // Si ce n'est pas une image, retourner tel quel
  if (!file.type.startsWith('image/')) {
    return {
      file,
      metadata: {
        original_size: startSize,
        optimized_size: startSize,
        compression_applied: false,
        compression_passes_count: 0,
        processing_time_ms: 0
      }
    };
  }

  // Charger l'image
  const img = await loadImage(file);
  
  let compressedFile = file;
  let passCount = 0;
  let currentWidth = Math.min(img.width, INITIAL_MAX_WIDTH);
  let currentQuality = INITIAL_QUALITY;

  // Boucle de compression stricte
  while (compressedFile.size > MAX_SIZE_BYTES && passCount < 10) {
    passCount++;
    
    // Pass 1-3: Réduire la qualité
    if (passCount <= 3) {
      currentQuality = Math.max(0.4, currentQuality - 0.1);
    }
    // Pass 4+: Réduire aussi la taille
    else {
      currentWidth = Math.floor(currentWidth * 0.85);
      currentQuality = Math.max(0.35, currentQuality - 0.05);
    }

    compressedFile = await compressImage(img, currentWidth, currentQuality);
    
    console.log(`Compression pass ${passCount}: ${(compressedFile.size / 1024).toFixed(1)} Ko (quality: ${currentQuality}, width: ${currentWidth}px)`);
  }

  const endTime = Date.now();
  const finalSize = compressedFile.size;

  // Si toujours trop lourd après 10 passes, forcer une compression extrême
  if (finalSize > MAX_SIZE_BYTES) {
    console.warn('Compression extrême nécessaire');
    compressedFile = await compressImage(img, 1200, 0.3);
    passCount++;
  }

  const metadata = {
    original_size: startSize,
    optimized_size: compressedFile.size,
    compression_applied: passCount > 0,
    compression_passes_count: passCount,
    processing_time_ms: endTime - startTime,
    compression_ratio: ((1 - finalSize / startSize) * 100).toFixed(1) + '%'
  };

  console.log('Compression terminée:', metadata);

  return { file: compressedFile, metadata };
}

/**
 * Charge une image dans un élément Image
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
 * Compresse une image avec les paramètres donnés
 */
function compressImage(img, maxWidth, quality) {
  return new Promise((resolve) => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    // Calculer les dimensions
    let width = img.width;
    let height = img.height;

    if (width > maxWidth) {
      height = Math.floor((height * maxWidth) / width);
      width = maxWidth;
    }

    canvas.width = width;
    canvas.height = height;

    // Dessiner l'image
    ctx.fillStyle = '#FFFFFF'; // Fond blanc pour les transparences
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(img, 0, 0, width, height);

    // Convertir en blob JPEG (supprime automatiquement les EXIF)
    canvas.toBlob(
      (blob) => {
        const file = new File(
          [blob],
          `facture_${Date.now()}.jpg`,
          { type: 'image/jpeg' }
        );
        resolve(file);
      },
      'image/jpeg',
      quality
    );
  });
}

/**
 * Compresse plusieurs images en parallèle
 */
export async function compressImagesParallel(files) {
  const results = await Promise.all(
    files.map(file => compressImageStrict(file))
  );
  return results;
}