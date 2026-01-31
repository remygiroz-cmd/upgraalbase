/**
 * Compression serveur stricte des images de factures
 * Garantit que tous les fichiers stockés ≤ 900 Ko
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import Sharp from 'npm:sharp@0.33.5';

const MAX_SIZE_KB = 900;
const MAX_SIZE_BYTES = MAX_SIZE_KB * 1024;

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    
    // Authentification
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { file_url, invoice_id } = await req.json();

    if (!file_url) {
      return Response.json({ error: 'file_url required' }, { status: 400 });
    }

    // Télécharger le fichier
    const fileResponse = await fetch(file_url);
    if (!fileResponse.ok) {
      return Response.json({ error: 'Failed to fetch file' }, { status: 400 });
    }

    const originalBuffer = await fileResponse.arrayBuffer();
    const originalSize = originalBuffer.byteLength;

    console.log(`Original file size: ${(originalSize / 1024).toFixed(1)} Ko`);

    // Si déjà ≤ 900 Ko, pas de compression nécessaire
    if (originalSize <= MAX_SIZE_BYTES) {
      return Response.json({
        success: true,
        compression_applied: false,
        original_size: originalSize,
        optimized_size: originalSize,
        compression_passes_count: 0,
        file_url
      });
    }

    // Compression stricte avec Sharp
    let compressedBuffer = Buffer.from(originalBuffer);
    let passCount = 0;
    let quality = 75;
    let maxWidth = 2000;

    while (compressedBuffer.length > MAX_SIZE_BYTES && passCount < 10) {
      passCount++;

      if (passCount <= 3) {
        quality = Math.max(40, quality - 10);
      } else {
        maxWidth = Math.floor(maxWidth * 0.85);
        quality = Math.max(35, quality - 5);
      }

      compressedBuffer = await Sharp(Buffer.from(originalBuffer))
        .resize(maxWidth, null, { 
          fit: 'inside',
          withoutEnlargement: true 
        })
        .jpeg({ 
          quality,
          mozjpeg: true,
          chromaSubsampling: '4:2:0'
        })
        .toBuffer();

      console.log(`Compression pass ${passCount}: ${(compressedBuffer.length / 1024).toFixed(1)} Ko (quality: ${quality}, width: ${maxWidth})`);
    }

    // Si toujours trop lourd, compression extrême
    if (compressedBuffer.length > MAX_SIZE_BYTES) {
      console.warn('Compression extrême nécessaire');
      compressedBuffer = await Sharp(Buffer.from(originalBuffer))
        .resize(1200, null, { fit: 'inside' })
        .jpeg({ quality: 30, mozjpeg: true })
        .toBuffer();
      passCount++;
    }

    const optimizedSize = compressedBuffer.length;
    console.log(`Final size: ${(optimizedSize / 1024).toFixed(1)} Ko after ${passCount} passes`);

    // Uploader le fichier compressé
    const blob = new Blob([compressedBuffer], { type: 'image/jpeg' });
    const file = new File([blob], `compressed_${Date.now()}.jpg`, { type: 'image/jpeg' });
    
    const { file_url: optimized_url } = await base44.integrations.Core.UploadFile({ file });

    // Extraire bucket et path
    const urlParts = optimized_url.split('/storage/v1/object/public/');
    let fileBucket = '';
    let filePath = '';

    if (urlParts.length > 1) {
      const pathParts = urlParts[1].split('/');
      fileBucket = pathParts[0];
      filePath = pathParts.slice(1).join('/');
    }

    // Mettre à jour l'invoice avec les nouvelles infos
    if (invoice_id) {
      await base44.entities.Invoice.update(invoice_id, {
        file_url: optimized_url,
        file_bucket: fileBucket,
        file_path: filePath,
        original_size: originalSize,
        optimized_size: optimizedSize,
        compression_applied: true,
        compression_passes_count: passCount
      });
    }

    return Response.json({
      success: true,
      compression_applied: true,
      original_size: originalSize,
      optimized_size: optimizedSize,
      compression_passes_count: passCount,
      compression_ratio: ((1 - optimizedSize / originalSize) * 100).toFixed(1) + '%',
      file_url: optimized_url,
      file_bucket: fileBucket,
      file_path: filePath
    });

  } catch (error) {
    console.error('Compression error:', error);
    return Response.json({ 
      error: error.message,
      success: false 
    }, { status: 500 });
  }
});