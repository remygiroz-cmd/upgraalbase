import React, { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Upload, Loader2, CheckCircle, AlertCircle, X, FileText, Camera } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';

export default function InvoiceUploadModal({ open, onClose }) {
  const queryClient = useQueryClient();
  const [files, setFiles] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [uploadResults, setUploadResults] = useState([]);
  const [globalProgress, setGlobalProgress] = useState(0);
  const [cameraMode, setCameraMode] = useState(false);
  const videoRef = React.useRef(null);
  const streamRef = React.useRef(null);

  const handleFileSelect = (e) => {
    const selectedFiles = Array.from(e.target.files || []);
    setFiles(selectedFiles);
  };

  const handleRemoveFile = (index) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
  };

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { facingMode: 'environment' } // Use rear camera on mobile
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        streamRef.current = stream;
      }
      setCameraMode(true);
    } catch (err) {
      alert('Impossible d\'accéder à la caméra: ' + err.message);
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    setCameraMode(false);
  };

  const capturePhoto = () => {
    const video = videoRef.current;
    if (!video) return;

    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0);

    canvas.toBlob((blob) => {
      const file = new File([blob], `facture_${Date.now()}.jpg`, { type: 'image/jpeg' });
      setFiles([file]);
      stopCamera();
    }, 'image/jpeg', 0.9);
  };

  React.useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  const handleUpload = async () => {
    if (files.length === 0) return;

    setUploading(true);
    setUploadResults([]);
    setGlobalProgress(0);

    const results = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const fileResult = {
        name: file.name,
        status: 'uploading',
        progress: 0,
        error: null
      };

      try {
        // 1. Upload file
        fileResult.progress = 30;
        setUploadResults([...results, fileResult]);

        const { file_url } = await base44.integrations.Core.UploadFile({ file });

        // Extract bucket and path from URL
        const urlParts = file_url.split('/storage/v1/object/public/');
        let fileBucket = '';
        let filePath = '';

        if (urlParts.length > 1) {
          const pathParts = urlParts[1].split('/');
          fileBucket = pathParts[0];
          filePath = pathParts.slice(1).join('/');
        }

        fileResult.progress = 50;
        setUploadResults([...results, fileResult]);

        // 2. Create invoice record with processing status
        const invoice = await base44.entities.Invoice.create({
          file_url,
          file_bucket: fileBucket,
          file_path: filePath,
          file_name: file.name,
          file_mime: file.type || 'application/pdf',
          file_size: file.size,
          status: 'non_envoyee',
          ai_processing: true
        });

        fileResult.progress = 70;
        fileResult.invoiceId = invoice.id;
        setUploadResults([...results, fileResult]);

        // 3. Launch AI extraction (async)
        base44.functions.invoke('extractInvoiceData', {
          file_url
        }).then(async (extractedData) => {
          // Update invoice with extracted data
          const normalizedName = `${extractedData.data.invoice_date || 'XXXX-XX-XX'}__${(extractedData.data.supplier || 'FOURNISSEUR').replace(/[^a-zA-Z0-9]/g, '_')}__${(extractedData.data.amount_ttc || 0).toFixed(2)}.pdf`;

          await base44.entities.Invoice.update(invoice.id, {
            normalized_file_name: normalizedName,
            supplier: extractedData.data.supplier,
            invoice_date: extractedData.data.invoice_date,
            categories: extractedData.data.categories || [],
            short_description: extractedData.data.short_description,
            accounting_account: extractedData.data.accounting_account,
            amount_ht: extractedData.data.amount_ht,
            amount_ttc: extractedData.data.amount_ttc,
            vat: extractedData.data.vat,
            indexed_text: extractedData.data.indexed_text,
            ai_confidence: extractedData.data.confidence,
            status: extractedData.data.status,
            ai_processing: false
          });

          queryClient.invalidateQueries({ queryKey: ['invoices'] });
        }).catch(async (err) => {
          console.error('Extraction error:', err);
          // Mark as failed processing
          await base44.entities.Invoice.update(invoice.id, {
            ai_processing: false
          });
          queryClient.invalidateQueries({ queryKey: ['invoices'] });
        });

        fileResult.status = 'success';
        fileResult.progress = 100;

      } catch (err) {
        fileResult.status = 'error';
        fileResult.error = err.message || 'Erreur upload';
        fileResult.progress = 0;
      }

      results.push(fileResult);
      setUploadResults([...results]);
      setGlobalProgress(((i + 1) / files.length) * 100);
    }

    setUploading(false);
    queryClient.invalidateQueries({ queryKey: ['invoices'] });

    // Auto-close if all success
    const allSuccess = results.every(r => r.status === 'success');
    if (allSuccess) {
      setTimeout(() => {
        setFiles([]);
        setUploadResults([]);
        onClose();
      }, 3000);
    }
  };

  const successCount = uploadResults.filter(r => r.status === 'success').length;
  const errorCount = uploadResults.filter(r => r.status === 'error').length;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="bg-white border-gray-200 sm:max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-gray-900">Uploader des factures</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {files.length === 0 && uploadResults.length === 0 && !cameraMode && (
            <div className="space-y-3">
              <label className="block">
                <div className={cn(
                  "border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all",
                  "border-gray-300 hover:border-orange-500 hover:bg-orange-50"
                )}>
                  <Upload className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                  <p className="text-lg font-medium text-gray-900 mb-2">
                    Cliquez pour sélectionner des fichiers
                  </p>
                  <p className="text-sm text-gray-600">
                    PDF ou images (JPEG, PNG) - Sélection multiple
                  </p>
                </div>
                <input
                  type="file"
                  className="hidden"
                  accept=".pdf,.jpg,.jpeg,.png"
                  multiple
                  onChange={handleFileSelect}
                />
              </label>

              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-gray-300"></div>
                </div>
                <div className="relative flex justify-center text-sm">
                  <span className="px-2 bg-white text-gray-500">ou</span>
                </div>
              </div>

              <Button
                onClick={startCamera}
                variant="outline"
                className="w-full border-2 border-gray-300 hover:border-orange-500 hover:bg-orange-50"
              >
                <Camera className="w-5 h-5 mr-2" />
                Capturer une photo
              </Button>
            </div>
          )}

          {cameraMode && (
            <div className="space-y-4">
              <div className="relative bg-black rounded-xl overflow-hidden">
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  className="w-full aspect-video object-cover"
                />
              </div>
              <div className="flex gap-3">
                <Button
                  onClick={stopCamera}
                  variant="outline"
                  className="flex-1 border-gray-300 text-gray-900"
                >
                  Annuler
                </Button>
                <Button
                  onClick={capturePhoto}
                  className="flex-1 bg-orange-600 hover:bg-orange-700"
                >
                  <Camera className="w-4 h-4 mr-2" />
                  Capturer
                </Button>
              </div>
            </div>
          )}

          {files.length > 0 && !uploading && uploadResults.length === 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-gray-900">
                  {files.length} fichier(s) sélectionné(s)
                </p>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setFiles([])}
                  className="text-gray-500 hover:text-gray-700"
                >
                  Tout effacer
                </Button>
              </div>

              <div className="space-y-2 max-h-64 overflow-y-auto">
                {files.map((file, idx) => (
                  <div key={idx} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg border border-gray-200">
                    <FileText className="w-6 h-6 text-orange-600 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{file.name}</p>
                      <p className="text-xs text-gray-500">{(file.size / 1024).toFixed(1)} KB</p>
                    </div>
                    <button
                      onClick={() => handleRemoveFile(idx)}
                      className="p-1 hover:bg-gray-200 rounded"
                    >
                      <X className="w-4 h-4 text-gray-500" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {uploading && (
            <div className="space-y-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-700 font-medium">Progression globale</span>
                  <span className="text-gray-600">{Math.round(globalProgress)}%</span>
                </div>
                <Progress value={globalProgress} className="h-2" />
              </div>

              <div className="space-y-2 max-h-64 overflow-y-auto">
                {uploadResults.map((result, idx) => (
                  <div key={idx} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg border border-gray-200">
                    {result.status === 'uploading' && <Loader2 className="w-5 h-5 text-orange-600 animate-spin flex-shrink-0" />}
                    {result.status === 'success' && <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0" />}
                    {result.status === 'error' && <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0" />}

                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{result.name}</p>
                      {result.status === 'uploading' && (
                        <Progress value={result.progress} className="h-1 mt-1" />
                      )}
                      {result.error && (
                        <p className="text-xs text-red-600 mt-1">{result.error}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {uploadResults.length > 0 && !uploading && (
            <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <p className="text-sm font-semibold text-gray-900">
                    Résultat de l'upload
                  </p>
                  <div className="flex gap-4 text-xs">
                    <span className="text-green-600 font-medium">
                      ✓ {successCount} réussi(s)
                    </span>
                    {errorCount > 0 && (
                      <span className="text-red-600 font-medium">
                        ✗ {errorCount} échoué(s)
                      </span>
                    )}
                  </div>
                </div>
                {successCount === files.length && (
                  <CheckCircle className="w-8 h-8 text-green-600" />
                )}
              </div>
            </div>
          )}

          {!uploading && uploadResults.length === 0 && files.length === 0 && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <p className="text-sm text-blue-900 font-medium mb-2">✨ Extraction automatique</p>
              <ul className="text-xs text-blue-800 space-y-1">
                <li>• Fournisseur et date</li>
                <li>• Montants HT, TTC, TVA</li>
                <li>• Catégorie et description</li>
                <li>• Texte intégral pour recherche</li>
              </ul>
            </div>
          )}
        </div>

        <div className="flex gap-3 justify-end pt-4 border-t border-gray-200">
          {!uploading && uploadResults.length === 0 && files.length > 0 && (
            <>
              <Button
                variant="outline"
                onClick={onClose}
                className="border-gray-300 text-gray-900 hover:bg-gray-50"
              >
                Annuler
              </Button>
              <Button
                onClick={handleUpload}
                className="bg-orange-600 hover:bg-orange-700"
              >
                <Upload className="w-4 h-4 mr-2" />
                Uploader {files.length} fichier(s)
              </Button>
            </>
          )}

          {uploadResults.length > 0 && !uploading && (
            <Button
              onClick={() => {
                setFiles([]);
                setUploadResults([]);
                onClose();
              }}
              className="bg-orange-600 hover:bg-orange-700"
            >
              Fermer
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}