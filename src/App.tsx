import React, { useState, useEffect, Suspense } from 'react';
import { supabase } from '@/lib/supabase';
import { User } from '@/types';
import { isPremium } from '@/lib/utils';
import { Auth } from '@/pages/auth';
import { Layout } from '@/components/layout';
import { useFinanceData } from '@/hooks/useFinanceData';
import { ThemeProvider } from '@/components/theme-provider';

const Dashboard = React.lazy(() => import('@/pages/dashboard').then(m => ({ default: m.Dashboard })));
const Lancamentos = React.lazy(() => import('@/pages/lancamentos').then(m => ({ default: m.Lancamentos })));
const Relatorios = React.lazy(() => import('@/pages/relatorios').then(m => ({ default: m.Relatorios })));
const Configuracoes = React.lazy(() => import('@/pages/configuracoes').then(m => ({ default: m.Configuracoes })));
const Veiculos = React.lazy(() => import('@/pages/veiculos').then(m => ({ default: m.Veiculos })));
const Premium = React.lazy(() => import('@/pages/premium').then(m => ({ default: m.Premium })));
const Admin = React.lazy(() => import('@/pages/admin').then(m => ({ default: m.Admin })));
import { PremiumModal } from '@/components/premium-modal';
import { ErrorBoundary } from '@/components/error-boundary';

export default function App() {
  const [session, setSession] = useState<any>(null);
  const [user, setUser] = useState<User | null>(null);
  const [activeTab, setActiveTab] = useState('inicio');
  const [isPremiumModalOpen, setIsPremiumModalOpen] = useState(false);
  const [premiumFeatureName, setPremiumFeatureName] = useState('');

  useEffect(() => {
    const fetchUserProfile = async (sessionUser: any) => {
      try {
        const { data: profile, error } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', sessionUser.id)
          .single();

        if (error && error.code !== 'PGRST116') {
          console.error('Erro ao buscar perfil:', error);
        }

        setUser({ 
          id: sessionUser.id, 
          email: sessionUser.email || '',
          nome: profile?.nome || sessionUser.user_metadata?.nome || '',
          telefone: profile?.telefone || sessionUser.user_metadata?.telefone || '',
          foto_url: profile?.foto_url || sessionUser.user_metadata?.foto_url || '',
          referral_code: profile?.referral_code || sessionUser.user_metadata?.referral_code || '',
          referred_by: profile?.referred_by || sessionUser.user_metadata?.referred_by || '',
          premium_until: profile?.premium_until || sessionUser.user_metadata?.premium_until || ''
        });
      } catch (err) {
        console.error('Erro ao buscar perfil:', err);
        // Fallback to metadata
        setUser({ 
          id: sessionUser.id, 
          email: sessionUser.email || '',
          nome: sessionUser.user_metadata?.nome || '',
          telefone: sessionUser.user_metadata?.telefone || '',
          foto_url: sessionUser.user_metadata?.foto_url || '',
          referral_code: sessionUser.user_metadata?.referral_code || '',
          referred_by: sessionUser.user_metadata?.referred_by || '',
          premium_until: sessionUser.user_metadata?.premium_until || ''
        });
      }
    };

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
          await fetchUserProfile(session.user);
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
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      console.log('Auth Event:', event);
      setSession(session);
      
      if (session?.user) {
        await fetchUserProfile(session.user);
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
      <ErrorBoundary>
        <MainApp user={user} activeTab={activeTab} setActiveTab={setActiveTab} />
      </ErrorBoundary>
    </ThemeProvider>
  );
}

function MainApp({ user, activeTab, setActiveTab }: { user: User; activeTab: string; setActiveTab: (tab: string) => void }) {
  const { categorias, lancamentos, vehicles, manutencoes, loading, error, refetch } = useFinanceData();
  const [isNewLancamentoOpen, setIsNewLancamentoOpen] = useState(false);
  const [forceOpenProfile, setForceOpenProfile] = useState(false);
  const [forceOpenReceiptReader, setForceOpenReceiptReader] = useState(false);
  const [isPremiumModalOpen, setIsPremiumModalOpen] = useState(false);
  const [premiumFeatureName, setPremiumFeatureName] = useState('');

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F9FAFB] dark:bg-gray-950 p-4">
        <div className="bg-white dark:bg-gray-900 p-6 rounded-xl shadow-lg max-w-md w-full text-center border border-red-100 dark:border-red-900">
          <div className="text-red-500 mb-4 text-4xl">⚠️</div>
          <h2 className="text-xl font-bold mb-2 text-gray-900 dark:text-white">Erro ao carregar dados</h2>
          <p className="text-gray-600 dark:text-gray-400 mb-6 text-sm">{error}</p>
          <button 
            onClick={refetch}
            className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-medium py-2 px-4 rounded-lg transition-colors"
          >
            Tentar Novamente
          </button>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex min-h-screen flex-col bg-[#F9FAFB] dark:bg-gray-950">
        <div className="h-16 w-full bg-white dark:bg-gray-900 border-b border-gray-100 dark:border-gray-800 animate-pulse"></div>
        <div className="mx-auto w-full max-w-7xl p-4 sm:p-6 lg:p-8 space-y-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="h-32 rounded-2xl bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 animate-pulse"></div>
            ))}
          </div>
          <div className="h-96 rounded-2xl bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 animate-pulse"></div>
        </div>
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
        setPremiumFeatureName('Lançamentos Ilimitados');
        setIsPremiumModalOpen(true);
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

  const handleOpenReceiptReader = () => {
    setActiveTab('lancamentos');
    setForceOpenReceiptReader(true);
  };

  return (
    <Layout 
      activeTab={activeTab} 
      setActiveTab={setActiveTab} 
      onNewLancamento={handleNewLancamento}
      onProfileClick={handleProfileClick}
      user={user}
    >
      <Suspense fallback={
        <div className="flex h-[50vh] items-center justify-center">
          <div className="flex flex-col items-center gap-4">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-200 border-t-[#F59E0B] dark:border-gray-800 dark:border-t-[#F59E0B]"></div>
            <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Carregando interface...</p>
          </div>
        </div>
      }>
        {activeTab === 'inicio' && (
          <Dashboard 
            lancamentos={lancamentos} 
            categorias={categorias} 
            vehicles={vehicles} 
            manutencoes={manutencoes}
            refetch={refetch}
            user={user}
            onReadReceipt={handleOpenReceiptReader}
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
            forceOpenReceiptReader={forceOpenReceiptReader}
            onReceiptReaderClose={() => setForceOpenReceiptReader(false)}
          />
        )}
        {activeTab === 'relatorios' && (
          <Relatorios 
            lancamentos={lancamentos} 
            vehicles={vehicles} 
            user={user} 
          />
        )}
        {activeTab === 'veiculos' && (
          <Veiculos
            vehicles={vehicles}
            lancamentos={lancamentos}
            manutencoes={manutencoes}
            refetch={refetch}
            user={user}
          />
        )}
        {activeTab === 'admin' && user.email === 'leoladislau181@gmail.com' && (
          <Admin />
        )}
        {activeTab === 'premium' && (
          <Premium user={user} refetch={refetch} />
        )}
        {activeTab === 'configuracoes' && (
          <Configuracoes 
            categorias={categorias} 
            user={user} 
            refetch={refetch} 
            onNavigateToRelatorios={() => setActiveTab('relatorios')}
            onNavigateToPremium={() => setActiveTab('premium')}
            onNavigateToVeiculos={() => setActiveTab('veiculos')}
            onNavigateToAdmin={() => setActiveTab('admin')}
            forceOpenProfile={forceOpenProfile}
            onProfileOpened={() => setForceOpenProfile(false)}
          />
        )}
      </Suspense>

      <PremiumModal
        isOpen={isPremiumModalOpen}
        onClose={() => setIsPremiumModalOpen(false)}
        featureName={premiumFeatureName}
      />
    </Layout>
  );
}

