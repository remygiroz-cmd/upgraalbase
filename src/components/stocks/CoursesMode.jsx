import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { ShoppingCart, CheckCircle2, AlertCircle } from 'lucide-react';
import LoadingSpinner from '@/components/ui/LoadingSpinner';

export default function CoursesMode() {
  const [activeTab, setActiveTab] = useState('a-prendre');

  // Fetch articles actifs
  const { data: articles = [], isLoading } = useQuery({
    queryKey: ['articles'],
    queryFn: () => base44.entities.Article.filter({ is_active: true })
  });

  if (isLoading) return <LoadingSpinner />;

  return (
    <div className="space-y-6 pb-6">
      <div className="flex items-center gap-3">
        <h2 className="text-2xl font-bold">🛒 Mode Courses</h2>
        <span className="bg-orange-500 text-white px-4 py-1 rounded-full font-bold text-sm">
          METRO
        </span>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full max-w-md grid-cols-3">
          <TabsTrigger value="a-prendre" className="flex items-center gap-2">
            <ShoppingCart className="w-4 h-4" />
            À PRENDRE
          </TabsTrigger>
          <TabsTrigger value="check" className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4" />
            CHECK
          </TabsTrigger>
          <TabsTrigger value="rupture" className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4" />
            RUPTURE
          </TabsTrigger>
        </TabsList>

        <TabsContent value="a-prendre" className="space-y-4 mt-6">
          <div className="text-gray-600 text-sm">
            {articles.length} article{articles.length > 1 ? 's' : ''} à prendre
          </div>
        </TabsContent>

        <TabsContent value="check" className="space-y-4 mt-6">
          <div className="text-gray-600 text-sm">
            Onglet Check
          </div>
        </TabsContent>

        <TabsContent value="rupture" className="space-y-4 mt-6">
          <div className="text-gray-600 text-sm">
            Onglet Rupture
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}