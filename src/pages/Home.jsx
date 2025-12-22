import React from 'react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { 
  ChefHat, 
  ClipboardList, 
  Thermometer, 
  BookOpen, 
  History,
  Users, 
  PackageMinus, 
  Package,
  ArrowRight
} from 'lucide-react';
import { motion } from 'framer-motion';

export default function Home() {
  const modules = [
    {
      title: 'Cuisine',
      color: 'emerald',
      items: [
        { name: 'MiseEnPlace', label: 'Mise en Place', icon: ClipboardList, desc: 'Catalogue des tâches' },
        { name: 'TravailDuJour', label: 'Travail du Jour', icon: ChefHat, desc: 'Production quotidienne' },
        { name: 'Temperatures', label: 'Températures', icon: Thermometer, desc: 'Conformité HACCP' },
        { name: 'Recettes', label: 'Recettes', icon: BookOpen, desc: 'Fiches techniques' },
        { name: 'Historique', label: 'Historique', icon: History, desc: 'Archives de production' },
      ]
    },
    {
      title: 'Gestion',
      color: 'indigo',
      items: [
        { name: 'Equipe', label: 'Équipe & Shifts', icon: Users, desc: 'Planning et RH' },
        { name: 'Pertes', label: 'Invendus & Pertes', icon: PackageMinus, desc: 'Contrôle Food Cost' },
        { name: 'Stocks', label: 'Inventaires', icon: Package, desc: 'Stocks & Commandes' },
      ]
    }
  ];

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

  return (
    <div className="max-w-6xl mx-auto">
      {/* Hero */}
      <motion.div 
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center mb-12"
      >
        <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-gradient-to-br from-orange-500 to-orange-700 mb-6 shadow-lg shadow-orange-500/20">
          <ChefHat className="w-10 h-10 text-white" />
        </div>
        <h1 className="text-4xl font-bold mb-3">UpGraal</h1>
        <p className="text-slate-400 text-lg">Votre système de gestion cuisine temps réel</p>
      </motion.div>

      {/* Modules */}
      {modules.map((module, moduleIndex) => (
        <motion.section 
          key={module.title}
          variants={containerVariants}
          initial="hidden"
          animate="visible"
          className="mb-10"
        >
          <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-4 px-1">
            {module.title}
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {module.items.map((item, index) => (
              <motion.div key={item.name} variants={itemVariants}>
                <Link
                  to={createPageUrl(item.name)}
                  className={`
                    group block p-5 rounded-2xl border transition-all duration-200
                    bg-slate-800/50 border-slate-700/50
                    hover:bg-slate-800 hover:border-${module.color}-600/30 hover:shadow-lg
                    active:scale-[0.98]
                  `}
                >
                  <div className="flex items-start justify-between">
                    <div className={`
                      w-12 h-12 rounded-xl flex items-center justify-center mb-4
                      bg-${module.color}-600/20 text-${module.color}-400
                    `}>
                      <item.icon className="w-6 h-6" />
                    </div>
                    <ArrowRight className="w-5 h-5 text-slate-600 group-hover:text-slate-400 transition-colors" />
                  </div>
                  <h3 className="font-semibold text-lg mb-1">{item.label}</h3>
                  <p className="text-sm text-slate-400">{item.desc}</p>
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
        className="mt-12 p-6 rounded-2xl bg-slate-800/30 border border-slate-700/50 text-center"
      >
        <p className="text-slate-400 text-sm">
          Application optimisée pour tablettes tactiles • Mode hors-ligne partiel disponible
        </p>
      </motion.div>
    </div>
  );
}