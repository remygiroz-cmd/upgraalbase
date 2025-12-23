import React, { useState, useEffect } from 'react';
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
  Home,
  Sun,
  Moon
} from 'lucide-react';
import { cn } from '@/lib/utils';

export default function Layout({ children, currentPageName }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [theme, setTheme] = useState(() => {
    const saved = localStorage.getItem('upgraal-theme');
    if (saved) return saved;
    
    // Respect system preference if no saved preference
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches) {
      return 'light';
    }
    return 'dark';
  });

  useEffect(() => {
    localStorage.setItem('upgraal-theme', theme);
    if (theme === 'light') {
      document.documentElement.classList.add('light-mode');
    } else {
      document.documentElement.classList.remove('light-mode');
    }
  }, [theme]);

  const toggleTheme = () => {
    setTheme(prev => prev === 'dark' ? 'light' : 'dark');
  };

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
        "flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 active:scale-95",
        active 
          ? "bg-orange-600/20 text-orange-400 border border-orange-600/30" 
          : "text-[rgb(var(--text-primary))] hover:bg-[rgb(var(--bg-hover))]"
      )}
    >
      <Icon className="w-5 h-5" />
      <span className="font-medium">{label}</span>
    </Link>
  );

  return (
    <div className="min-h-screen">

      {/* Mobile Header */}
      <header className="lg:hidden fixed top-0 left-0 right-0 z-50 backdrop-blur-sm border-b border-[rgb(var(--border-primary))] px-4 py-3 bg-[rgb(var(--bg-secondary))/95]">
        <div className="flex items-center justify-between">
          <button
            onClick={() => setSidebarOpen(true)}
            className="p-2 rounded-lg transition-colors hover:bg-[rgb(var(--bg-hover))]"
          >
            <Menu className="w-6 h-6" />
          </button>
          <div className="flex items-center gap-2">
            <ChefHat className="w-6 h-6 text-orange-500" />
            <span className="font-bold text-lg">UpGraal</span>
          </div>
          <button
            onClick={toggleTheme}
            className="p-2 rounded-lg transition-colors hover:bg-[rgb(var(--bg-hover))]"
          >
            {theme === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
          </button>
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
        "fixed top-0 left-0 h-full w-72 z-50 transition-all duration-200 ease-out",
        "bg-[rgb(var(--bg-secondary))] light-mode:border-r border-[rgb(var(--border-primary))]",
        "lg:translate-x-0",
        sidebarOpen ? "translate-x-0" : "-translate-x-full"
      )}>
        <div className="flex flex-col h-full">
          {/* Logo */}
          <div className="flex items-center justify-between p-5 border-b border-[rgb(var(--border-primary))]">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-orange-500 to-orange-700 flex items-center justify-center">
                <ChefHat className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="font-bold text-lg">UpGraal</h1>
                <p className="text-xs text-[rgb(var(--text-secondary))]">Kitchen OS</p>
              </div>
            </div>
            <button
              onClick={() => setSidebarOpen(false)}
              className="lg:hidden p-2 rounded-lg transition-colors hover:bg-[rgb(var(--bg-hover))]"
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
              <h2 className="px-4 text-xs font-semibold uppercase tracking-wider mb-2 text-[rgb(var(--text-tertiary))]">
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
              <h2 className="px-4 text-xs font-semibold uppercase tracking-wider mb-2 text-[rgb(var(--text-tertiary))]">
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
          <div className="p-4 border-t border-[rgb(var(--border-primary))]">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs text-center flex-1 text-[rgb(var(--text-tertiary))]">
                UpGraal v1.0
              </p>
            </div>
            <button
              onClick={toggleTheme}
              className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-lg transition-colors text-sm bg-[rgb(var(--bg-tertiary))] hover:bg-[rgb(var(--bg-hover))]"
            >
              {theme === 'dark' ? (
                <>
                  <Sun className="w-4 h-4" />
                  <span>Mode clair</span>
                </>
              ) : (
                <>
                  <Moon className="w-4 h-4" />
                  <span>Mode sombre</span>
                </>
              )}
            </button>
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