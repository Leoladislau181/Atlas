import React from 'react';
import { LogOut, Home, List, BarChart2, Car, Settings, User as UserIcon, Plus, Star } from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase } from '@/lib/supabase';
import { User } from '@/types';

interface LayoutProps {
  children: React.ReactNode;
  activeTab: string;
  setActiveTab: (tab: string) => void;
  onNewLancamento?: () => void;
  onProfileClick?: () => void;
  user?: User;
}

export function Layout({ children, activeTab, setActiveTab, onNewLancamento, onProfileClick, user }: LayoutProps) {
  const tabs = [
    { id: 'inicio', label: 'Início', icon: Home },
    { id: 'lancamentos', label: 'Lançamentos', icon: List },
    { id: 'veiculos', label: 'Veículos', icon: Car },
    { id: 'premium', label: 'Premium', icon: Star },
    { id: 'configuracoes', label: 'Configurações', icon: Settings },
  ];

  const handleLogout = async () => {
    await supabase.auth.signOut();
  };

  return (
    <div className="min-h-screen bg-[#F9FAFB] dark:bg-gray-950 font-sans text-gray-900 dark:text-gray-100 pb-24 sm:pb-0 transition-colors duration-200">
      <header className="sticky top-0 z-40 w-full bg-white/80 dark:bg-gray-900/80 backdrop-blur-md border-b border-gray-100 dark:border-gray-800 shadow-sm">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <img 
              src="/logo.svg" 
              alt="Atlas Logo" 
              className="h-9 w-9 rounded-xl shadow-sm"
              referrerPolicy="no-referrer"
            />
            <span className="text-xl font-bold tracking-tight text-gray-900 dark:text-white">
              Atlas Financeiro
            </span>
          </div>

          <nav className="hidden sm:flex items-center space-x-1">
            {tabs.slice(0, 2).map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={cn(
                    'flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-all duration-200',
                    activeTab === tab.id
                      ? 'bg-[#F59E0B]/10 text-[#D97706] dark:bg-[#F59E0B]/20 dark:text-[#FBBF24]'
                      : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-gray-100'
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {tab.label}
                </button>
              );
            })}

            <button
              onClick={onNewLancamento}
              className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-all duration-200 bg-[#F59E0B] text-white hover:bg-[#D97706] shadow-sm mx-2"
            >
              <Plus className="h-4 w-4" />
              Novo Lançamento
            </button>

            {tabs.slice(2).map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={cn(
                    'flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-all duration-200',
                    activeTab === tab.id
                      ? 'bg-[#F59E0B]/10 text-[#D97706] dark:bg-[#F59E0B]/20 dark:text-[#FBBF24]'
                      : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-gray-100'
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {tab.label}
                </button>
              );
            })}
          </nav>

          <div className="flex items-center gap-4">
            {user && (
              <button 
                onClick={onProfileClick}
                className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-full bg-gray-50 dark:bg-gray-800 border border-gray-100 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors cursor-pointer"
              >
                <div className="h-6 w-6 rounded-full bg-[#F59E0B] flex items-center justify-center text-[10px] text-white font-bold overflow-hidden">
                  {user.foto_url ? (
                    <img 
                      src={user.foto_url} 
                      alt={user.nome} 
                      className="h-full w-full object-cover"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    user.nome ? user.nome.charAt(0).toUpperCase() : <UserIcon className="h-3 w-3" />
                  )}
                </div>
                <span className="text-xs font-medium text-gray-700 dark:text-gray-300 max-w-[120px] truncate">
                  {user.nome ? user.nome.trim().split(' ')[0] : user.email.split('@')[0]}
                </span>
              </button>
            )}
            <button
              onClick={handleLogout}
              className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-gray-500 dark:text-gray-400 hover:bg-red-50 dark:hover:bg-red-900/20 hover:text-red-600 dark:hover:text-red-400 transition-colors"
            >
              <LogOut className="h-4 w-4" />
              <span className="hidden sm:inline">Sair</span>
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl p-4 sm:p-6 lg:p-8 animate-in fade-in duration-300">{children}</main>

      {/* Floating Bottom Navigation for Mobile */}
      <nav className="fixed bottom-4 left-4 right-4 z-50 sm:hidden">
        <div className="flex h-16 items-center justify-between rounded-2xl bg-white/90 dark:bg-gray-900/90 backdrop-blur-lg shadow-lg border border-gray-100 dark:border-gray-800 px-2">
          {tabs.slice(0, 2).map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  'relative flex flex-col items-center justify-center gap-1 w-14 h-full transition-all duration-200',
                  isActive ? 'text-[#D97706] dark:text-[#FBBF24]' : 'text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300'
                )}
              >
                {isActive && (
                  <span className="absolute -top-3 w-1 h-1 rounded-full bg-[#D97706] dark:bg-[#FBBF24]" />
                )}
                <Icon className={cn("transition-all duration-200", isActive ? "h-5 w-5" : "h-5 w-5")} />
                <span className={cn("text-[10px] font-medium transition-all duration-200", isActive ? "opacity-100" : "opacity-70")}>{tab.label}</span>
              </button>
            );
          })}

          {/* Central Plus Button */}
          <div className="relative -top-6">
            <button
              onClick={onNewLancamento}
              className="flex h-14 w-14 items-center justify-center rounded-full bg-[#F59E0B] text-white shadow-lg shadow-orange-500/40 hover:bg-[#D97706] transition-all duration-200 active:scale-90"
            >
              <Plus className="h-7 w-7" />
              <span className="sr-only">Novo Lançamento</span>
              <div className="absolute inset-0 rounded-full bg-[#F59E0B] animate-ping opacity-20 -z-10" />
            </button>
          </div>

          {tabs.slice(2).map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  'relative flex flex-col items-center justify-center gap-1 w-14 h-full transition-all duration-200',
                  isActive ? 'text-[#D97706] dark:text-[#FBBF24]' : 'text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300'
                )}
              >
                {isActive && (
                  <span className="absolute -top-3 w-1 h-1 rounded-full bg-[#D97706] dark:bg-[#FBBF24]" />
                )}
                <Icon className={cn("transition-all duration-200", isActive ? "h-5 w-5" : "h-5 w-5")} />
                <span className={cn("text-[10px] font-medium transition-all duration-200", isActive ? "opacity-100" : "opacity-70")}>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
