import React from 'react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { 
  ChefHat, 
  ClipboardList, 
  Thermometer, 
  BookOpen, 
  History,
  Users, 
  PackageMinus, 
  Package,
  ArrowRight,
  AlertCircle
} from 'lucide-react';
import { motion } from 'framer-motion';
import LoadingSpinner from '@/components/ui/LoadingSpinner';

export default function Home() {
  const { data: currentUser, isLoading: loadingUser } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me(),
    staleTime: 0,
    refetchOnMount: true
  });

  const { data: appSettings = [] } = useQuery({
    queryKey: ['appSettings'],
    queryFn: () => base44.entities.AppSettings.filter({ setting_key: 'app_logo' })
  });

  const { data: userRole } = useQuery({
    queryKey: ['userRole', currentUser?.role_id],
    queryFn: async () => {
      if (!currentUser?.role_id) return null;
      const roles = await base44.entities.Role.filter({ id: currentUser.role_id });
      return roles[0] || null;
    },
    enabled: !!currentUser?.role_id
  });

  const { data: permissionOverride } = useQuery({
    queryKey: ['permissionOverride', currentUser?.email],
    queryFn: async () => {
      if (!currentUser?.email) return null;
      const overrides = await base44.entities.UserPermissionOverride.filter({ user_email: currentUser.email });
      return overrides[0] || null;
    },
    enabled: !!currentUser?.email
  });

  const logoUrl = appSettings[0]?.logo_url || 'https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/69497257a1b1a9a05e568521/71ee8b574_logonouveau.png';

  const hasPermission = (moduleKey) => {
    if (currentUser?.role === 'admin') return true;
    if (permissionOverride?.permissions_override?.[moduleKey] !== undefined) {
      return permissionOverride.permissions_override[moduleKey];
    }
    return userRole?.permissions?.[moduleKey] || false;
  };

  const allModules = [
    {
      title: 'Cuisine',
      color: 'emerald',
      items: [
        { name: 'MiseEnPlace', label: 'Mise en Place', icon: ClipboardList, desc: 'Catalogue des tâches', module: 'mise_en_place' },
        { name: 'TravailDuJour', label: 'Travail du Jour', icon: ChefHat, desc: 'Production quotidienne', module: 'travail_du_jour' },
        { name: 'Temperatures', label: 'Températures', icon: Thermometer, desc: 'Conformité HACCP', module: 'temperatures' },
        { name: 'Recettes', label: 'Recettes', icon: BookOpen, desc: 'Fiches techniques', module: 'recettes' },
        { name: 'Historique', label: 'Historique', icon: History, desc: 'Archives de production', module: 'historique' },
      ]
    },
    {
      title: 'Gestion',
      color: 'indigo',
      items: [
        { name: 'Equipe', label: 'Équipe & Shifts', icon: Users, desc: 'Planning et RH', module: 'equipe' },
        { name: 'Pertes', label: 'Invendus & Pertes', icon: PackageMinus, desc: 'Contrôle Food Cost', module: 'pertes' },
        { name: 'Stocks', label: 'Inventaires', icon: Package, desc: 'Stocks & Commandes', module: 'stocks' },
      ]
    }
  ];

  const modules = allModules.map(section => ({
    ...section,
    items: section.items.filter(item => hasPermission(item.module))
  })).filter(section => section.items.length > 0);

  if (loadingUser) {
    return <LoadingSpinner />;
  }

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: { staggerChildren: 0.1 }
    }
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: { opacity: 1, y: 0 }
  };

  if (modules.length === 0) {
    return (
      <div className="max-w-2xl mx-auto text-center py-12">
        <div className="bg-amber-50 border-2 border-amber-300 rounded-2xl p-8">
          <div className="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <AlertCircle className="w-8 h-8 text-amber-600" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-3">Aucun accès autorisé</h2>
          <p className="text-gray-700 mb-4">
            Vous n'avez actuellement accès à aucun module de l'application.
          </p>
          <p className="text-sm text-gray-600">
            Contactez votre administrateur pour obtenir les autorisations nécessaires.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-2 sm:px-0">
      {/* Hero */}
      <motion.div 
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center mb-8 sm:mb-12"
      >
        <div className="inline-flex items-center justify-center mb-4 sm:mb-6">
          <img 
            src={logoUrl} 
            alt="UpGraal Logo" 
            className="w-24 h-24 sm:w-32 sm:h-32 object-contain"
          />
        </div>
        <h1 className="text-3xl sm:text-4xl font-bold mb-2 sm:mb-3 text-gray-900">UpGraal</h1>
        <p className="text-gray-700 text-base sm:text-lg px-4">Votre système de gestion cuisine temps réel</p>
      </motion.div>

      {/* Modules */}
      {modules.map((module, moduleIndex) => (
        <motion.section 
          key={module.title}
          variants={containerVariants}
          initial="hidden"
          animate="visible"
          className="mb-6 sm:mb-10"
        >
          <h2 className="text-xs sm:text-sm font-semibold text-gray-600 uppercase tracking-wider mb-3 sm:mb-4 px-1">
            {module.title}
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
            {module.items.map((item, index) => (
              <motion.div key={item.name} variants={itemVariants}>
                <Link
                  to={createPageUrl(item.name)}
                  className={`
                    group block p-4 sm:p-5 rounded-xl sm:rounded-2xl border-2 transition-all duration-200
                    bg-white border-gray-300
                    hover:bg-gray-50 hover:border-gray-400 hover:shadow-md
                    active:scale-[0.98] touch-manipulation
                  `}
                >
                  <div className="flex items-start justify-between">
                    <div className={`
                      w-10 h-10 sm:w-12 sm:h-12 rounded-lg sm:rounded-xl flex items-center justify-center mb-3 sm:mb-4 flex-shrink-0
                      bg-${module.color}-600/20 text-${module.color}-400
                    `}>
                      <item.icon className="w-5 h-5 sm:w-6 sm:h-6" />
                    </div>
                    <ArrowRight className="w-4 h-4 sm:w-5 sm:h-5 text-gray-400 group-hover:text-gray-600 transition-colors flex-shrink-0" />
                  </div>
                  <h3 className="font-semibold text-base sm:text-lg mb-1 text-gray-900 line-clamp-2">{item.label}</h3>
                  <p className="text-xs sm:text-sm text-gray-600 line-clamp-2">{item.desc}</p>
                </Link>
              </motion.div>
            ))}
          </div>
        </motion.section>
      ))}

      {/* Footer Info */}
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.5 }}
        className="mt-8 sm:mt-12 p-4 sm:p-6 rounded-xl sm:rounded-2xl bg-gray-100 border-2 border-gray-300 text-center"
      >
        <p className="text-gray-700 text-xs sm:text-sm px-2">
          Application optimisée pour tablettes tactiles • Mode hors-ligne partiel disponible
        </p>
      </motion.div>
    </div>
  );
}