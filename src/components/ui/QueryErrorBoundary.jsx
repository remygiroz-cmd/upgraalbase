import React from 'react';
import { AlertTriangle, RefreshCw, Wifi } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * Error display component for query errors
 *
 * Shows a user-friendly error message with retry option
 * Handles different error types:
 * - 429: Rate limited
 * - 5xx: Server errors
 * - Network errors
 */
export function QueryError({ error, onRetry, title = "Erreur de chargement" }) {
  const status = error?.status || error?.response?.status;

  let errorMessage = "Une erreur est survenue lors du chargement des données.";
  let errorIcon = <AlertTriangle className="w-12 h-12 text-red-500 mb-4" />;

  if (status === 429) {
    errorMessage = "Trop de requêtes en cours. Veuillez patienter quelques secondes.";
    errorIcon = <RefreshCw className="w-12 h-12 text-orange-500 mb-4 animate-spin" />;
  } else if (status >= 500) {
    errorMessage = "Le serveur est temporairement indisponible. Veuillez réessayer.";
  } else if (!navigator.onLine) {
    errorMessage = "Vous semblez être hors ligne. Vérifiez votre connexion internet.";
    errorIcon = <Wifi className="w-12 h-12 text-gray-500 mb-4" />;
  }

  return (
    <div className="flex flex-col items-center justify-center p-8 text-center min-h-[200px]">
      {errorIcon}
      <h3 className="text-lg font-semibold text-gray-900 mb-2">{title}</h3>
      <p className="text-gray-600 mb-4 max-w-md">{errorMessage}</p>
      {onRetry && (
        <Button
          onClick={onRetry}
          variant="outline"
          className="flex items-center gap-2"
        >
          <RefreshCw className="w-4 h-4" />
          Réessayer
        </Button>
      )}
    </div>
  );
}

/**
 * Loading skeleton for data tables
 */
export function TableSkeleton({ rows = 5, columns = 4 }) {
  return (
    <div className="animate-pulse">
      {/* Header */}
      <div className="flex gap-4 p-4 bg-gray-100 rounded-t-lg">
        {Array.from({ length: columns }).map((_, i) => (
          <div key={i} className="h-4 bg-gray-300 rounded flex-1" />
        ))}
      </div>
      {/* Rows */}
      {Array.from({ length: rows }).map((_, rowIndex) => (
        <div key={rowIndex} className="flex gap-4 p-4 border-b border-gray-100">
          {Array.from({ length: columns }).map((_, colIndex) => (
            <div
              key={colIndex}
              className="h-4 bg-gray-200 rounded flex-1"
              style={{ width: `${60 + Math.random() * 40}%` }}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

/**
 * Loading skeleton for cards
 */
export function CardSkeleton({ count = 3 }) {
  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 animate-pulse">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="bg-white rounded-lg border p-4 space-y-3">
          <div className="h-4 bg-gray-200 rounded w-3/4" />
          <div className="h-3 bg-gray-100 rounded w-1/2" />
          <div className="h-3 bg-gray-100 rounded w-2/3" />
        </div>
      ))}
    </div>
  );
}

/**
 * Full page loading state
 */
export function PageLoading({ message = "Chargement en cours..." }) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[400px]">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-600 mb-4" />
      <p className="text-gray-600">{message}</p>
    </div>
  );
}

/**
 * Wrapper component that handles loading and error states
 */
export function QueryStateHandler({
  isLoading,
  isError,
  error,
  onRetry,
  loadingComponent,
  errorTitle,
  children
}) {
  if (isLoading) {
    return loadingComponent || <PageLoading />;
  }

  if (isError) {
    return <QueryError error={error} onRetry={onRetry} title={errorTitle} />;
  }

  return children;
}

export default QueryStateHandler;
