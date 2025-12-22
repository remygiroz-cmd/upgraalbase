import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { createPageUrl } from './utils';
import { 
  ChefHat, 
  ClipboardList, 
  Thermometer, 
  BookOpen, 
  History,
  Users, 
  PackageMinus, 
  Package,
  Menu,
  X,
  Home
} from 'lucide-react';
import { cn } from '@/lib/utils';

export default function Layout({ children, currentPageName }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const cuisineLinks = [
    { name: 'MiseEnPlace', label: 'Mise en Place', icon: ClipboardList },
    { name: 'TravailDuJour', label: 'Travail du Jour', icon: ChefHat },
    { name: 'Temperatures', label: 'Températures', icon: Thermometer },
    { name: 'Recettes', label: 'Recettes', icon: BookOpen },
    { name: 'Historique', label: 'Historique', icon: History },
  ];

  const gestionLinks = [
    { name: 'Equipe', label: 'Équipe & Shifts', icon: Users },
    { name: 'Pertes', label: 'Invendus & Pertes', icon: PackageMinus },
    { name: 'Stocks', label: 'Inventaires', icon: Package },
  ];

  const NavLink = ({ to, icon: Icon, label, active }) => (
    <Link
      to={createPageUrl(to)}
      onClick={() => setSidebarOpen(false)}
      className={cn(
        "flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200",
        "hover:bg-slate-700/50 active:scale-95",
        active && "bg-orange-600/20 text-orange-400 border border-orange-600/30"
      )}
    >
      <Icon className="w-5 h-5" />
      <span className="font-medium">{label}</span>
    </Link>
  );

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100">
      <style>{`
        :root {
          --success: #f97316;
          --warning: #f59e0b;
          --cold: #6366f1;
          --danger: #ef4444;
        }
        * {
          -webkit-tap-highlight-color: transparent;
        }
        ::-webkit-scrollbar {
          width: 6px;
          height: 6px;
        }
        ::-webkit-scrollbar-track {
          background: transparent;
        }
        ::-webkit-scrollbar-thumb {
          background: #475569;
          border-radius: 3px;
        }
      `}</style>

      {/* Mobile Header */}
      <header className="lg:hidden fixed top-0 left-0 right-0 z-50 bg-slate-800/95 backdrop-blur-sm border-b border-slate-700 px-4 py-3">
        <div className="flex items-center justify-between">
          <button
            onClick={() => setSidebarOpen(true)}
            className="p-2 rounded-lg hover:bg-slate-700 transition-colors"
          >
            <Menu className="w-6 h-6" />
          </button>
          <div className="flex items-center gap-2">
            <ChefHat className="w-6 h-6 text-emerald-500" />
            <span className="font-bold text-lg">UpGraal</span>
          </div>
          <div className="w-10" />
        </div>
      </header>

      {/* Sidebar Overlay */}
      {sidebarOpen && (
        <div 
          className="lg:hidden fixed inset-0 bg-black/60 z-40"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={cn(
        "fixed top-0 left-0 h-full w-72 bg-slate-800 z-50 transition-transform duration-300 ease-out",
        "lg:translate-x-0",
        sidebarOpen ? "translate-x-0" : "-translate-x-full"
      )}>
        <div className="flex flex-col h-full">
          {/* Logo */}
          <div className="flex items-center justify-between p-5 border-b border-slate-700">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-orange-500 to-orange-700 flex items-center justify-center">
                <ChefHat className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="font-bold text-lg">UpGraal</h1>
                <p className="text-xs text-slate-400">Kitchen OS</p>
              </div>
            </div>
            <button
              onClick={() => setSidebarOpen(false)}
              className="lg:hidden p-2 rounded-lg hover:bg-slate-700"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Navigation */}
          <nav className="flex-1 overflow-y-auto p-4 space-y-6">
            {/* Home */}
            <div>
              <NavLink 
                to="Home" 
                icon={Home} 
                label="Accueil" 
                active={currentPageName === 'Home'} 
              />
            </div>

            {/* Cuisine */}
            <div>
              <h2 className="px-4 text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                Cuisine
              </h2>
              <div className="space-y-1">
                {cuisineLinks.map((link) => (
                  <NavLink
                    key={link.name}
                    to={link.name}
                    icon={link.icon}
                    label={link.label}
                    active={currentPageName === link.name}
                  />
                ))}
              </div>
            </div>

            {/* Gestion */}
            <div>
              <h2 className="px-4 text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                Gestion
              </h2>
              <div className="space-y-1">
                {gestionLinks.map((link) => (
                  <NavLink
                    key={link.name}
                    to={link.name}
                    icon={link.icon}
                    label={link.label}
                    active={currentPageName === link.name}
                  />
                ))}
              </div>
            </div>
          </nav>

          {/* Footer */}
          <div className="p-4 border-t border-slate-700">
            <p className="text-xs text-slate-500 text-center">
              UpGraal v1.0 — Kitchen Slate
            </p>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className={cn(
        "min-h-screen transition-all duration-300",
        "pt-16 lg:pt-0 lg:pl-72"
      )}>
        <div className="p-4 lg:p-6">
          {children}
        </div>
      </main>
    </div>
  );
}