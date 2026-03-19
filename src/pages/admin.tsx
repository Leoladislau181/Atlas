import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Shield, Users, Star, Search, CheckCircle, XCircle, Download, Activity, Car, Wrench, Clock, MoreVertical, AlertCircle } from 'lucide-react';
import { format, addMonths, addYears } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Modal } from '@/components/ui/modal';
import { supabase } from '@/lib/supabase';

export function Admin() {
  const [users, setUsers] = useState<any[]>([]);
  const [globalStats, setGlobalStats] = useState({ totalLancamentos: 0, totalVeiculos: 0, totalManutencoes: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');

  // Modals state
  const [selectedUser, setSelectedUser] = useState<any>(null);
  const [isPremiumModalOpen, setIsPremiumModalOpen] = useState(false);
  const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);
  const [userDetails, setUserDetails] = useState<any>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  
  // Custom Alert/Confirm Modals
  const [alertMessage, setAlertMessage] = useState('');
  const [confirmAction, setConfirmAction] = useState<{ message: string, onConfirm: () => void } | null>(null);

  const fetchUsersAndStats = async () => {
    try {
      setLoading(true);
      setError('');
      
      const { data: usersData, error: usersError } = await supabase
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: false });

      if (usersError) throw usersError;

      const { count: totalLancamentos } = await supabase.from('lancamentos').select('*', { count: 'exact', head: true });
      const { count: totalVeiculos } = await supabase.from('vehicles').select('*', { count: 'exact', head: true });
      const { count: totalManutencoes } = await supabase.from('manutencoes').select('*', { count: 'exact', head: true });

      setUsers(usersData || []);
      setGlobalStats({
        totalLancamentos: totalLancamentos || 0,
        totalVeiculos: totalVeiculos || 0,
        totalManutencoes: totalManutencoes || 0
      });
    } catch (err: any) {
      setError(err.message || 'Erro ao carregar dados. Verifique se você tem permissão de administrador.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsersAndStats();
  }, []);

  const handleGrantPremium = async (months: number) => {
    if (!selectedUser) return;
    try {
      const premiumUntil = months === 999 
        ? addYears(new Date(), 100).toISOString() 
        : addMonths(new Date(), months).toISOString();

      const { error } = await supabase
        .from('profiles')
        .update({ premium_until: premiumUntil })
        .eq('id', selectedUser.id);
      
      if (error) throw error;
      
      setIsPremiumModalOpen(false);
      fetchUsersAndStats();
    } catch (err: any) {
      setAlertMessage(err.message || 'Erro ao conceder premium');
    }
  };

  const handleRemovePremium = async (userId: string) => {
    setConfirmAction({
      message: 'Tem certeza que deseja remover o acesso Premium deste usuário?',
      onConfirm: async () => {
        try {
          const { error } = await supabase
            .from('profiles')
            .update({ premium_until: null })
            .eq('id', userId);
          
          if (error) throw error;
          
          fetchUsersAndStats();
        } catch (err: any) {
          setAlertMessage(err.message || 'Erro ao remover premium');
        }
      }
    });
  };

  const openUserDetails = async (user: any) => {
    setSelectedUser(user);
    setIsDetailsModalOpen(true);
    setDetailsLoading(true);
    try {
      const { count: lancamentosCount } = await supabase.from('lancamentos').select('*', { count: 'exact', head: true }).eq('user_id', user.id);
      const { count: veiculosCount } = await supabase.from('vehicles').select('*', { count: 'exact', head: true }).eq('user_id', user.id);
      const { count: manutencoesCount } = await supabase.from('manutencoes').select('*', { count: 'exact', head: true }).eq('user_id', user.id);
      
      setUserDetails({
        lancamentos: lancamentosCount || 0,
        veiculos: veiculosCount || 0,
        manutencoes: manutencoesCount || 0
      });
    } catch (err: any) {
      setAlertMessage('Erro ao carregar detalhes: ' + err.message);
    } finally {
      setDetailsLoading(false);
    }
  };

  const exportToCSV = () => {
    const headers = ['ID', 'Nome', 'Email', 'Data de Cadastro', 'Status Premium', 'Premium Até'];
    const csvContent = [
      headers.join(','),
      ...users.map(u => {
        const isPremium = u.premium_until && new Date(u.premium_until) > new Date();
        return [
          u.id,
          `"${u.nome || ''}"`,
          `"${u.email || ''}"`,
          u.created_at ? format(new Date(u.created_at), 'dd/MM/yyyy HH:mm') : '',
          isPremium ? 'Premium' : 'Gratuito',
          isPremium ? format(new Date(u.premium_until), 'dd/MM/yyyy') : ''
        ].join(',');
      })
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `usuarios_atlas_${format(new Date(), 'dd_MM_yyyy')}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const filteredUsers = users.filter(u => 
    (u.email || '').toLowerCase().includes(search.toLowerCase()) || 
    (u.nome || '').toLowerCase().includes(search.toLowerCase())
  );

  const totalUsers = users.length;
  const premiumUsers = users.filter(u => u.premium_until && new Date(u.premium_until) > new Date()).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
          <Shield className="h-6 w-6 text-indigo-500" />
          Painel Administrativo
        </h2>
        <div className="flex items-center gap-2">
          <Button onClick={exportToCSV} variant="outline" size="sm" className="flex items-center gap-2">
            <Download className="h-4 w-4" />
            Exportar CSV
          </Button>
          <Button onClick={fetchUsersAndStats} variant="outline" size="sm">
            Atualizar
          </Button>
        </div>
      </div>

      {error ? (
        <Card className="border-red-200 bg-red-50 dark:bg-red-900/10 dark:border-red-900/50">
          <CardContent className="p-6">
            <div className="flex items-center gap-3 text-red-600 dark:text-red-400">
              <XCircle className="h-6 w-6" />
              <div>
                <h3 className="font-bold">Acesso Restrito ou Erro</h3>
                <p className="text-sm">{error}</p>
                <p className="text-xs mt-2 opacity-80">
                  Dica: Verifique se a variável SUPABASE_SERVICE_ROLE_KEY está configurada nos Secrets do AI Studio.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Dashboard Stats */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Card className="border-none shadow-sm bg-white dark:bg-gray-900">
              <CardContent className="p-6 flex items-center gap-4">
                <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-xl">
                  <Users className="h-6 w-6 text-blue-500" />
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Total Usuários</p>
                  <h3 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{totalUsers}</h3>
                </div>
              </CardContent>
            </Card>
            
            <Card className="border-none shadow-sm bg-white dark:bg-gray-900">
              <CardContent className="p-6 flex items-center gap-4">
                <div className="p-3 bg-[#F59E0B]/10 rounded-xl">
                  <Star className="h-6 w-6 text-[#F59E0B]" />
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Usuários Premium</p>
                  <h3 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{premiumUsers}</h3>
                </div>
              </CardContent>
            </Card>

            <Card className="border-none shadow-sm bg-white dark:bg-gray-900">
              <CardContent className="p-6 flex items-center gap-4">
                <div className="p-3 bg-emerald-50 dark:bg-emerald-900/20 rounded-xl">
                  <Activity className="h-6 w-6 text-emerald-500" />
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Lançamentos</p>
                  <h3 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{globalStats.totalLancamentos}</h3>
                </div>
              </CardContent>
            </Card>

            <Card className="border-none shadow-sm bg-white dark:bg-gray-900">
              <CardContent className="p-6 flex items-center gap-4">
                <div className="p-3 bg-purple-50 dark:bg-purple-900/20 rounded-xl">
                  <Car className="h-6 w-6 text-purple-500" />
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Veículos</p>
                  <h3 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{globalStats.totalVeiculos}</h3>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Users Table */}
          <Card className="border-none shadow-sm bg-white dark:bg-gray-900">
            <CardHeader className="pb-4 border-b border-gray-100 dark:border-gray-800">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <CardTitle className="text-lg">Gerenciamento de Usuários</CardTitle>
                <div className="relative w-full sm:w-64">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <Input 
                    placeholder="Buscar por nome ou email..." 
                    className="pl-9"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {loading ? (
                <div className="p-8 text-center text-gray-500">Carregando usuários...</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-left">
                    <thead className="text-xs text-gray-500 uppercase bg-gray-50 dark:bg-gray-800/50 dark:text-gray-400">
                      <tr>
                        <th className="px-6 py-3 font-medium">Usuário</th>
                        <th className="px-6 py-3 font-medium">Data de Cadastro</th>
                        <th className="px-6 py-3 font-medium">Status Premium</th>
                        <th className="px-6 py-3 font-medium text-right">Ações</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                      {filteredUsers.map((u) => {
                        const isPremium = u.premium_until && new Date(u.premium_until) > new Date();
                        return (
                          <tr key={u.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                            <td className="px-6 py-4">
                              <div className="flex items-center gap-3">
                                {u.foto_url ? (
                                  <img src={u.foto_url} alt="" className="w-8 h-8 rounded-full object-cover" />
                                ) : (
                                  <div className="w-8 h-8 rounded-full bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center text-indigo-600 dark:text-indigo-400 font-bold">
                                    {u.nome?.charAt(0) || u.email?.charAt(0) || '?'}
                                  </div>
                                )}
                                <div>
                                  <div className="font-medium text-gray-900 dark:text-gray-100">{u.nome || 'Sem nome'}</div>
                                  <div className="text-xs text-gray-500">{u.email}</div>
                                </div>
                              </div>
                            </td>
                            <td className="px-6 py-4 text-gray-500">
                              {u.created_at ? format(new Date(u.created_at), "dd/MM/yyyy HH:mm", { locale: ptBR }) : '-'}
                            </td>
                            <td className="px-6 py-4">
                              {isPremium ? (
                                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-[#F59E0B]/10 text-[#D97706] dark:text-[#FBBF24]">
                                  <Star className="h-3 w-3 fill-current" />
                                  Até {format(new Date(u.premium_until), "dd/MM/yyyy")}
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400">
                                  Gratuito
                                </span>
                              )}
                            </td>
                            <td className="px-6 py-4 text-right space-x-2">
                              <Button 
                                variant="ghost" 
                                size="sm"
                                onClick={() => openUserDetails(u)}
                                className="text-gray-500 hover:text-indigo-600"
                              >
                                Detalhes
                              </Button>
                              {isPremium ? (
                                <Button 
                                  variant="outline" 
                                  size="sm"
                                  onClick={() => handleRemovePremium(u.id)}
                                  className="text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
                                >
                                  Remover Premium
                                </Button>
                              ) : (
                                <Button 
                                  variant="outline" 
                                  size="sm"
                                  onClick={() => {
                                    setSelectedUser(u);
                                    setIsPremiumModalOpen(true);
                                  }}
                                  className="text-[#F59E0B] border-[#F59E0B]/20 hover:bg-[#F59E0B]/10"
                                >
                                  Dar Premium
                                </Button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                      {filteredUsers.length === 0 && (
                        <tr>
                          <td colSpan={4} className="px-6 py-8 text-center text-gray-500">
                            Nenhum usuário encontrado.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}

      {/* Premium Duration Modal */}
      {isPremiumModalOpen && selectedUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <Card className="w-full max-w-md bg-white dark:bg-gray-900 shadow-xl">
            <CardHeader>
              <CardTitle>Conceder Premium</CardTitle>
              <p className="text-sm text-gray-500">Selecione a duração do plano para {selectedUser.nome || selectedUser.email}</p>
            </CardHeader>
            <CardContent className="space-y-3">
              <Button variant="outline" className="w-full justify-start" onClick={() => handleGrantPremium(1)}>
                <Star className="mr-2 h-4 w-4 text-[#F59E0B]" /> 1 Mês
              </Button>
              <Button variant="outline" className="w-full justify-start" onClick={() => handleGrantPremium(6)}>
                <Star className="mr-2 h-4 w-4 text-[#F59E0B]" /> 6 Meses
              </Button>
              <Button variant="outline" className="w-full justify-start" onClick={() => handleGrantPremium(12)}>
                <Star className="mr-2 h-4 w-4 text-[#F59E0B]" /> 1 Ano
              </Button>
              <Button variant="outline" className="w-full justify-start" onClick={() => handleGrantPremium(999)}>
                <Star className="mr-2 h-4 w-4 text-[#F59E0B]" /> Vitalício (Para Sempre)
              </Button>
              <Button variant="ghost" className="w-full mt-4" onClick={() => setIsPremiumModalOpen(false)}>
                Cancelar
              </Button>
            </CardContent>
          </Card>
        </div>
      )}

      {/* User Details Modal */}
      {isDetailsModalOpen && selectedUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <Card className="w-full max-w-md bg-white dark:bg-gray-900 shadow-xl">
            <CardHeader>
              <CardTitle>Detalhes do Usuário</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-4 mb-6">
                {selectedUser.foto_url ? (
                  <img src={selectedUser.foto_url} alt="" className="w-16 h-16 rounded-full object-cover" />
                ) : (
                  <div className="w-16 h-16 rounded-full bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center text-indigo-600 dark:text-indigo-400 text-2xl font-bold">
                    {selectedUser.nome?.charAt(0) || selectedUser.email?.charAt(0) || '?'}
                  </div>
                )}
                <div>
                  <h3 className="font-bold text-lg">{selectedUser.nome || 'Sem nome'}</h3>
                  <p className="text-sm text-gray-500">{selectedUser.email}</p>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4">
                <div className="bg-gray-50 dark:bg-gray-800 p-3 rounded-lg">
                  <p className="text-xs text-gray-500 mb-1">Cadastro</p>
                  <p className="text-sm font-medium">
                    {selectedUser.created_at ? format(new Date(selectedUser.created_at), "dd/MM/yyyy") : '-'}
                  </p>
                </div>
              </div>

              {detailsLoading ? (
                <div className="py-8 text-center text-sm text-gray-500">Carregando estatísticas de uso...</div>
              ) : userDetails ? (
                <div className="space-y-3 mt-4">
                  <h4 className="text-sm font-bold text-gray-900 dark:text-gray-100 border-b pb-2">Estatísticas de Uso</h4>
                  <div className="flex justify-between items-center text-sm">
                    <span className="flex items-center gap-2 text-gray-600 dark:text-gray-400"><Activity className="h-4 w-4"/> Lançamentos</span>
                    <span className="font-bold">{userDetails.totalLancamentos}</span>
                  </div>
                  <div className="flex justify-between items-center text-sm">
                    <span className="flex items-center gap-2 text-gray-600 dark:text-gray-400"><Car className="h-4 w-4"/> Veículos</span>
                    <span className="font-bold">{userDetails.totalVeiculos}</span>
                  </div>
                  <div className="flex justify-between items-center text-sm">
                    <span className="flex items-center gap-2 text-gray-600 dark:text-gray-400"><Wrench className="h-4 w-4"/> Manutenções</span>
                    <span className="font-bold">{userDetails.totalManutencoes}</span>
                  </div>
                </div>
              ) : null}

              <Button variant="outline" className="w-full mt-6" onClick={() => setIsDetailsModalOpen(false)}>
                Fechar
              </Button>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Alert Modal */}
      <Modal
        isOpen={!!alertMessage}
        onClose={() => setAlertMessage('')}
        title="Aviso"
      >
        <div className="flex flex-col items-center justify-center text-center p-4">
          <AlertCircle className="h-12 w-12 text-amber-500 mb-4" />
          <p className="text-gray-700 dark:text-gray-300 mb-6">{alertMessage}</p>
          <Button onClick={() => setAlertMessage('')} className="w-full">
            Entendi
          </Button>
        </div>
      </Modal>

      {/* Confirm Modal */}
      <Modal
        isOpen={!!confirmAction}
        onClose={() => setConfirmAction(null)}
        title="Confirmação"
      >
        <div className="flex flex-col items-center justify-center text-center p-4">
          <AlertCircle className="h-12 w-12 text-indigo-500 mb-4" />
          <p className="text-gray-700 dark:text-gray-300 mb-6">{confirmAction?.message}</p>
          <div className="flex gap-3 w-full">
            <Button variant="outline" onClick={() => setConfirmAction(null)} className="flex-1">
              Cancelar
            </Button>
            <Button 
              variant="destructive"
              onClick={() => {
                if (confirmAction) {
                  confirmAction.onConfirm();
                  setConfirmAction(null);
                }
              }} 
              className="flex-1"
            >
              Confirmar
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

