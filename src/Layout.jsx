import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { createPageUrl } from './utils';
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
  Menu,
  X,
  Home,
  Settings
} from 'lucide-react';
import { cn } from '@/lib/utils';

export default function Layout({ children, currentPageName }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const { data: currentUser } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me()
  });

  const theme = currentUser?.preferences?.theme || 'professional-light';

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
        "flex items-center gap-3 px-4 py-2.5 transition-all duration-200 relative",
        theme === 'professional-light' ? (
          active 
            ? currentTheme.navActive
            : cn("text-gray-700 hover:bg-gray-50")
        ) : (
          active 
            ? currentTheme.navActive
            : cn("text-slate-300 hover:bg-slate-800 rounded-lg")
        )
      )}
    >
      <Icon className="w-5 h-5" />
      <span className="font-medium text-sm">{label}</span>
    </Link>
  );

  // Theme configurations
  const themes = {
    'professional-light': {
      bg: 'bg-gray-50',
      text: 'text-gray-900',
      sidebar: 'bg-white border-r border-gray-200',
      sidebarText: 'text-gray-700',
      header: 'bg-white/95 border-gray-200',
      card: 'bg-white border-gray-200',
      cardHover: 'hover:border-gray-300',
      navHover: 'hover:bg-gray-100',
      navActive: 'bg-blue-50 text-blue-700 border-l-4 border-blue-600',
      button: 'bg-blue-600 hover:bg-blue-700',
      buttonText: 'text-white',
      accent: '#2563eb',
      input: 'bg-white border-gray-300',
      scrollbar: '#d1d5db',
      shadow: 'shadow-sm',
      sectionTitle: 'text-gray-500'
    },
    'dark-premium': {
      bg: 'bg-slate-950',
      text: 'text-slate-100',
      sidebar: 'bg-slate-900 border-r border-slate-800',
      sidebarText: 'text-slate-300',
      header: 'bg-slate-900/95 border-slate-800',
      card: 'bg-slate-900 border-slate-800',
      cardHover: 'hover:border-slate-700',
      navHover: 'hover:bg-slate-800',
      navActive: 'bg-violet-500/10 text-violet-400 border-l-4 border-violet-500',
      button: 'bg-violet-600 hover:bg-violet-700',
      buttonText: 'text-white',
      accent: '#8b5cf6',
      input: 'bg-slate-800 border-slate-700',
      scrollbar: '#475569',
      shadow: 'shadow-lg shadow-black/20',
      sectionTitle: 'text-slate-500'
    }
  };

  const currentTheme = themes[theme] || themes['professional-light'];

  return (
    <div className={cn("min-h-screen", currentTheme.bg, currentTheme.text)}>
      <style>{`
        :root {
          --accent-color: ${currentTheme.accent};
          --success: ${theme === 'professional-light' ? '#16a34a' : '#10b981'};
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
          background: ${currentTheme.scrollbar};
          border-radius: 3px;
        }
      `}</style>

      {/* Mobile Header */}
      <header className={cn(
        "lg:hidden fixed top-0 left-0 right-0 z-50 backdrop-blur-sm border-b px-4 py-3",
        currentTheme.header
      )}>
        <div className="flex items-center justify-between">
          <button
            onClick={() => setSidebarOpen(true)}
            className={cn("p-2 rounded-lg transition-colors", currentTheme.navHover)}
          >
            <Menu className="w-6 h-6" />
          </button>
          <div className="flex items-center gap-2">
            <div className={cn(
              "w-8 h-8 rounded-xl flex items-center justify-center",
              theme === 'professional-light' ? 'bg-blue-600' : 'bg-violet-600'
            )}>
              <ChefHat className="w-5 h-5 text-white" />
            </div>
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
        "fixed top-0 left-0 h-full w-72 z-50 transition-transform duration-300 ease-out",
        currentTheme.sidebar,
        "lg:translate-x-0",
        sidebarOpen ? "translate-x-0" : "-translate-x-full"
      )}>
        <div className="flex flex-col h-full">
          {/* Logo */}
          <div className={cn(
            "flex items-center justify-between p-5 border-b",
            theme === 'professional-light' ? 'border-gray-200' : 'border-slate-800'
          )}>
            <div className="flex items-center gap-3">
              <div className={cn(
                "w-10 h-10 rounded-xl flex items-center justify-center",
                theme === 'professional-light' 
                  ? 'bg-gradient-to-br from-blue-500 to-blue-700' 
                  : 'bg-gradient-to-br from-violet-500 to-violet-700'
              )}>
                <ChefHat className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="font-bold text-base">UpGraal</h1>
                <p className={cn(
                  "text-xs",
                  theme === 'professional-light' ? 'text-gray-500' : 'text-slate-400'
                )}>{currentUser?.full_name || currentUser?.email || 'Kitchen OS'}</p>
              </div>
            </div>
            <button
              onClick={() => setSidebarOpen(false)}
              className={cn("lg:hidden p-2 rounded-lg", currentTheme.navHover)}
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Navigation */}
          <nav className="flex-1 overflow-y-auto p-4 space-y-5">
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
              <h2 className={cn(
                "px-4 text-[10px] font-semibold uppercase tracking-widest mb-2",
                currentTheme.sectionTitle
              )}>
                Cuisine
              </h2>
              <div className="space-y-0.5">
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
              <h2 className={cn(
                "px-4 text-[10px] font-semibold uppercase tracking-widest mb-2",
                currentTheme.sectionTitle
              )}>
                Gestion
              </h2>
              <div className="space-y-0.5">
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
          <div className={cn(
            "p-4 border-t space-y-2",
            theme === 'professional-light' ? 'border-gray-200' : 'border-slate-800'
          )}>
            <NavLink 
              to="Parametres" 
              icon={Settings} 
              label="Paramètres" 
              active={currentPageName === 'Parametres'} 
            />
            <p className={cn(
              "text-[10px] text-center pt-2 font-medium",
              theme === 'professional-light' ? 'text-gray-400' : 'text-slate-600'
            )}>
              UpGraal v1.0
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