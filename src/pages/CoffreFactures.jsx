import React from 'react';
import { FileText } from 'lucide-react';

export default function CoffreFactures() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 p-6">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center gap-3 mb-8">
          <FileText className="w-8 h-8 text-blue-600" />
          <h1 className="text-3xl font-bold text-gray-900">Coffre à factures</h1>
        </div>

        <div className="bg-white border border-gray-300 rounded-lg p-8 text-center">
          <p className="text-gray-600 text-lg">Module en cours de reconstruction</p>
        </div>
      </div>
    </div>
  );
}