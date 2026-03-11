import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { User } from '@/types';
import { Auth } from '@/pages/auth';
import { Layout } from '@/components/layout';
import { Dashboard } from '@/pages/dashboard';
import { Lancamentos } from '@/pages/lancamentos';
import { Relatorios } from '@/pages/relatorios';
import { Configuracoes } from '@/pages/configuracoes';
import { Veiculos } from '@/pages/veiculos';
import { useFinanceData } from '@/hooks/useFinanceData';

import { ThemeProvider } from '@/components/theme-provider';

export default function App() {
  const [session, setSession] = useState<any>(null);
  const [user, setUser] = useState<User | null>(null);
  const [activeTab, setActiveTab] = useState('inicio');

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session?.user) {
        setUser({ 
          id: session.user.id, 
          email: session.user.email || '',
          nome: session.user.user_metadata?.nome || '',
          telefone: session.user.user_metadata?.telefone || '',
          foto_url: session.user.user_metadata?.foto_url || ''
        });
      }
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session?.user) {
        setUser({ 
          id: session.user.id, 
          email: session.user.email || '',
          nome: session.user.user_metadata?.nome || '',
          telefone: session.user.user_metadata?.telefone || '',
          foto_url: session.user.user_metadata?.foto_url || ''
        });
      } else {
        setUser(null);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    // Update favicon if user has a profile photo
    if (user?.foto_url) {
      const link = document.querySelector("link[rel~='icon']") as HTMLLinkElement || document.createElement('link');
      link.type = 'image/x-icon';
      link.rel = 'icon';
      link.href = user.foto_url;
      document.getElementsByTagName('head')[0].appendChild(link);
    }
  }, [user?.foto_url]);

  if (!session || !user) {
    return <Auth />;
  }

  return (
    <ThemeProvider defaultTheme="system" storageKey="atlas-theme">
      <MainApp user={user} activeTab={activeTab} setActiveTab={setActiveTab} />
    </ThemeProvider>
  );
}

function MainApp({ user, activeTab, setActiveTab }: { user: User; activeTab: string; setActiveTab: (tab: string) => void }) {
  const { categorias, lancamentos, vehicles, loading, refetch } = useFinanceData();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F9FAFB] dark:bg-gray-950">
        <div className="text-lg font-medium text-gray-500 dark:text-gray-400">Carregando dados...</div>
      </div>
    );
  }

  return (
    <Layout activeTab={activeTab} setActiveTab={setActiveTab} user={user}>
      {activeTab === 'inicio' && (
        <Dashboard 
          lancamentos={lancamentos} 
          categorias={categorias} 
          vehicles={vehicles} 
          refetch={refetch}
          userId={user.id}
        />
      )}
      {activeTab === 'lancamentos' && (
        <Lancamentos
          categorias={categorias}
          lancamentos={lancamentos}
          vehicles={vehicles}
          refetch={refetch}
          userId={user.id}
        />
      )}
      {activeTab === 'relatorios' && <Relatorios lancamentos={lancamentos} vehicles={vehicles} user={user} />}
      {activeTab === 'veiculos' && (
        <Veiculos
          vehicles={vehicles}
          lancamentos={lancamentos}
          refetch={refetch}
          userId={user.id}
        />
      )}
      {activeTab === 'configuracoes' && (
        <Configuracoes categorias={categorias} user={user} refetch={refetch} />
      )}
    </Layout>
  );
}

