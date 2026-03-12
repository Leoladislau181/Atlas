import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { User } from '@/types';
import { isPremium } from '@/lib/utils';
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
    const initializeAuth = async () => {
      try {
        const { data: { session }, error } = await supabase.auth.getSession();
        
        if (error) {
          console.error('Erro ao recuperar sessão:', error.message);
          // Se o token de atualização for inválido ou não encontrado, limpa a sessão local
          if (error.message.includes('Refresh Token Not Found') || error.message.includes('Invalid Refresh Token')) {
            await supabase.auth.signOut();
          }
          setSession(null);
          setUser(null);
          return;
        }

        setSession(session);
        if (session?.user) {
          setUser({ 
            id: session.user.id, 
            email: session.user.email || '',
            nome: session.user.user_metadata?.nome || '',
            telefone: session.user.user_metadata?.telefone || '',
            foto_url: session.user.user_metadata?.foto_url || '',
            referral_code: session.user.user_metadata?.referral_code || '',
            referred_by: session.user.user_metadata?.referred_by || '',
            premium_until: session.user.user_metadata?.premium_until || ''
          });
        }
      } catch (err) {
        console.error('Erro inesperado na autenticação:', err);
        setSession(null);
        setUser(null);
      }
    };

    initializeAuth();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      console.log('Auth Event:', event);
      setSession(session);
      
      if (session?.user) {
        setUser({ 
          id: session.user.id, 
          email: session.user.email || '',
          nome: session.user.user_metadata?.nome || '',
          telefone: session.user.user_metadata?.telefone || '',
          foto_url: session.user.user_metadata?.foto_url || '',
          referral_code: session.user.user_metadata?.referral_code || '',
          referred_by: session.user.user_metadata?.referred_by || '',
          premium_until: session.user.user_metadata?.premium_until || ''
        });
      } else {
        setUser(null);
      }

      // Se a sessão for invalidada ou o usuário sair, garante que o estado local seja limpo
      if (event === 'SIGNED_OUT') {
        setSession(null);
        setUser(null);
        // Limpa qualquer dado residual do localStorage se necessário
        localStorage.removeItem('supabase.auth.token');
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
  const { categorias, lancamentos, vehicles, manutencoes, loading, refetch } = useFinanceData();
  const [isNewLancamentoOpen, setIsNewLancamentoOpen] = useState(false);
  const [forceOpenProfile, setForceOpenProfile] = useState(false);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F9FAFB] dark:bg-gray-950">
        <div className="text-lg font-medium text-gray-500 dark:text-gray-400">Carregando dados...</div>
      </div>
    );
  }

  const handleNewLancamento = () => {
    if (!isPremium(user)) {
      const currentMonth = new Date().getMonth();
      const currentYear = new Date().getFullYear();
      const transactionsThisMonth = lancamentos.filter(l => {
        const d = new Date(l.data);
        return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
      });

      if (transactionsThisMonth.length >= 50) {
        alert('Usuários do plano gratuito têm um limite de 50 lançamentos por mês. Faça o upgrade para lançamentos ilimitados.');
        return;
      }
    }
    setActiveTab('lancamentos');
    setIsNewLancamentoOpen(true);
  };

  const handleProfileClick = () => {
    setActiveTab('configuracoes');
    setForceOpenProfile(true);
  };

  return (
    <Layout 
      activeTab={activeTab} 
      setActiveTab={setActiveTab} 
      onNewLancamento={handleNewLancamento}
      onProfileClick={handleProfileClick}
      user={user}
    >
      {activeTab === 'inicio' && (
        <Dashboard 
          lancamentos={lancamentos} 
          categorias={categorias} 
          vehicles={vehicles} 
          manutencoes={manutencoes}
          refetch={refetch}
          user={user}
        />
      )}
      {activeTab === 'lancamentos' && (
        <Lancamentos
          categorias={categorias}
          lancamentos={lancamentos}
          vehicles={vehicles}
          refetch={refetch}
          user={user}
          forceOpenForm={isNewLancamentoOpen}
          onFormClose={() => setIsNewLancamentoOpen(false)}
        />
      )}
      {activeTab === 'relatorios' && <Relatorios lancamentos={lancamentos} vehicles={vehicles} user={user} />}
      {activeTab === 'veiculos' && (
        <Veiculos
          vehicles={vehicles}
          lancamentos={lancamentos}
          manutencoes={manutencoes}
          refetch={refetch}
          user={user}
        />
      )}
      {activeTab === 'configuracoes' && (
        <Configuracoes 
          categorias={categorias} 
          user={user} 
          refetch={refetch} 
          onNavigateToRelatorios={() => setActiveTab('relatorios')}
          forceOpenProfile={forceOpenProfile}
          onProfileOpened={() => setForceOpenProfile(false)}
        />
      )}
    </Layout>
  );
}

