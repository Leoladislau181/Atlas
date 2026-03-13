import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Modal } from '@/components/ui/modal';
import { Categoria, TipoLancamento, User } from '@/types';
import { supabase } from '@/lib/supabase';
import { Edit2, Trash2, User as UserIcon, Settings, Shield, Tag, ChevronDown, ChevronUp, Moon, Sun, Camera, BarChart2, Gift, Copy } from 'lucide-react';
import { useTheme } from '@/components/theme-provider';
import { ProfilePhotoUpload } from '@/components/profile-photo-upload';
import { isPremium } from '@/lib/utils';

interface ConfiguracoesProps {
  categorias: Categoria[];
  user: User;
  refetch: () => void;
  onNavigateToRelatorios?: () => void;
  forceOpenProfile?: boolean;
  onProfileOpened?: () => void;
}

export function Configuracoes({ categorias, user, refetch, onNavigateToRelatorios, forceOpenProfile, onProfileOpened }: ConfiguracoesProps) {
  const [nome, setNome] = useState('');
  const [tipo, setTipo] = useState<TipoLancamento>('despesa');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [newPassword, setNewPassword] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [isPasswordFormOpen, setIsPasswordFormOpen] = useState(false);

  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [profileNome, setProfileNome] = useState(user.nome || '');
  const [profileTelefone, setProfileTelefone] = useState(user.telefone || '');
  const [profileLoading, setProfileLoading] = useState(false);
  const [isCategoryFormOpen, setIsCategoryFormOpen] = useState(false);
  const [isReferralOpen, setIsReferralOpen] = useState(false);
  const [referralCode, setReferralCode] = useState(user.referral_code || '');
  const [referralLoading, setReferralLoading] = useState(false);
  const [isPlanOpen, setIsPlanOpen] = useState(false);
  const [planLoading, setPlanLoading] = useState(false);

  React.useEffect(() => {
    setProfileNome(user.nome || '');
    setProfileTelefone(user.telefone || '');
  }, [user]);

  React.useEffect(() => {
    if (forceOpenProfile) {
      setIsProfileOpen(true);
      onProfileOpened?.();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, [forceOpenProfile, onProfileOpened]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nome) return;

    setLoading(true);
    try {
      if (editingId) {
        const { error } = await supabase
          .from('categorias')
          .update({ nome, tipo })
          .eq('id', editingId);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('categorias')
          .insert([{ user_id: user.id, nome, tipo }]);
        if (error) throw error;
      }

      setNome('');
      setTipo('despesa');
      setEditingId(null);
      setIsCategoryFormOpen(false);
      refetch();
    } catch (error: any) {
      alert(error.message || 'Erro ao salvar categoria.');
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (cat: Categoria) => {
    setEditingId(cat.id);
    setNome(cat.nome);
    setTipo(cat.tipo);
    setIsCategoryFormOpen(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const confirmDelete = (id: string) => {
    setDeletingId(id);
    setDeleteModalOpen(true);
  };

  const handleDelete = async () => {
    if (!deletingId) return;
    try {
      const { error } = await supabase.from('categorias').delete().eq('id', deletingId);
      if (error) throw error;
      setDeleteModalOpen(false);
      setDeletingId(null);
      refetch();
    } catch (error: any) {
      alert(error.message || 'Erro ao excluir categoria. Verifique se há lançamentos vinculados.');
    }
  };

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!currentPassword) {
      alert('Por favor, informe sua senha atual.');
      return;
    }

    if (!newPassword || newPassword.length < 6) {
      alert('A nova senha deve ter pelo menos 6 caracteres.');
      return;
    }

    if (newPassword !== confirmPassword) {
      alert('A nova senha e a confirmação não coincidem.');
      return;
    }

    setPasswordLoading(true);
    try {
      // First verify current password by re-authenticating
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: user.email,
        password: currentPassword,
      });

      if (signInError) {
        throw new Error('Senha atual incorreta.');
      }

      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      
      alert('Senha atualizada com sucesso!');
      setNewPassword('');
      setCurrentPassword('');
      setConfirmPassword('');
      setIsPasswordFormOpen(false);
    } catch (error: any) {
      alert(error.message || 'Erro ao atualizar senha.');
    } finally {
      setPasswordLoading(false);
    }
  };

  const handleProfileUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    setProfileLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({
        data: {
          nome: profileNome,
          telefone: profileTelefone
        }
      });
      if (error) throw error;
      alert('Perfil atualizado com sucesso!');
    } catch (error: any) {
      alert(error.message || 'Erro ao atualizar perfil.');
    } finally {
      setProfileLoading(false);
    }
  };

  const generateReferralCode = async () => {
    setReferralLoading(true);
    const code = Math.random().toString(36).substring(2, 8).toUpperCase();
    try {
      const { error } = await supabase.auth.updateUser({
        data: { referral_code: code }
      });
      if (error) throw error;
      setReferralCode(code);
      alert('Código gerado com sucesso!');
    } catch (error: any) {
      alert(error.message || 'Erro ao gerar código.');
    } finally {
      setReferralLoading(false);
    }
  };

  const copyReferralLink = () => {
    const link = `${window.location.origin}?ref=${referralCode}`;
    navigator.clipboard.writeText(link);
    alert('Link copiado para a área de transferência!');
  };

  const receitas = categorias.filter((c) => c.tipo === 'receita');
  const { theme, setTheme } = useTheme();

  const despesas = categorias.filter((c) => c.tipo === 'despesa');

  const handleTestPremium = async () => {
    setPlanLoading(true);
    try {
      const nextMonth = new Date();
      nextMonth.setMonth(nextMonth.getMonth() + 1);
      
      const { error } = await supabase.auth.updateUser({
        data: {
          premium_until: nextMonth.toISOString()
        }
      });
      
      if (error) throw error;
      
      alert('Plano Premium ativado com sucesso para testes (válido por 1 mês)! Recarregue a página para aplicar as alterações.');
      window.location.reload();
    } catch (error: any) {
      alert(error.message || 'Erro ao ativar plano premium.');
    } finally {
      setPlanLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4">
        <Card className="border-none shadow-sm bg-white dark:bg-gray-900 overflow-hidden">
          <div 
            className="p-4 flex items-center justify-between cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
            onClick={() => setIsProfileOpen(!isProfileOpen)}
          >
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                <UserIcon className="h-5 w-5 text-blue-500 dark:text-blue-400" />
              </div>
              <div>
                <h3 className="font-bold text-gray-900 dark:text-gray-100">Perfil</h3>
                <p className="text-xs text-gray-500 dark:text-gray-400">Preferências e informações particulares</p>
              </div>
            </div>
            <Button variant="ghost" size="sm" className="text-gray-400 dark:text-gray-500">
              {isProfileOpen ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
            </Button>
          </div>
          
          {isProfileOpen && (
            <CardContent className="pt-6 border-t border-gray-100 dark:border-gray-800 animate-in fade-in slide-in-from-top-2 duration-200">
              <div className="flex justify-center mb-8">
                <ProfilePhotoUpload user={user} onUpdate={refetch} />
              </div>

              <form onSubmit={handleProfileUpdate} className="space-y-4 mb-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Nome</label>
                    <Input 
                      type="text" 
                      value={profileNome} 
                      onChange={(e) => setProfileNome(e.target.value)} 
                      placeholder="Seu nome completo" 
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Telefone</label>
                    <Input 
                      type="tel" 
                      inputMode="tel"
                      value={profileTelefone} 
                      onChange={(e) => setProfileTelefone(e.target.value)} 
                      placeholder="(00) 00000-0000" 
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Email</label>
                  <Input type="email" value={user.email} disabled className="bg-gray-50 dark:bg-gray-800/50 text-gray-500 dark:text-gray-400" />
                  <p className="text-[10px] text-gray-400 dark:text-gray-500 italic">O email não pode ser alterado.</p>
                </div>
                <Button type="submit" disabled={profileLoading} className="w-full sm:w-auto">
                  {profileLoading ? 'Salvando...' : 'Salvar Detalhes'}
                </Button>
              </form>

              <div className="pt-6 mt-6 border-t border-gray-100 dark:border-gray-800">
                <button 
                  onClick={() => setIsPasswordFormOpen(!isPasswordFormOpen)}
                  className="flex items-center justify-between w-full group"
                >
                  <div className="flex items-center gap-2">
                    <Shield className="h-4 w-4 text-gray-400 dark:text-gray-500" />
                    <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Alterar Senha</h4>
                  </div>
                  <div className="text-gray-400 dark:text-gray-500 group-hover:text-gray-600 dark:group-hover:text-gray-300 transition-colors">
                    {isPasswordFormOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  </div>
                </button>

                {isPasswordFormOpen && (
                  <form onSubmit={handlePasswordChange} className="space-y-4 mt-4 animate-in fade-in slide-in-from-top-2 duration-200">
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Senha Atual</label>
                      <Input
                        type="password"
                        value={currentPassword}
                        onChange={(e) => setCurrentPassword(e.target.value)}
                        placeholder="Sua senha atual"
                        required
                      />
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Nova Senha</label>
                        <Input
                          type="password"
                          value={newPassword}
                          onChange={(e) => setNewPassword(e.target.value)}
                          placeholder="Mínimo 6 caracteres"
                          required
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Confirmar Nova Senha</label>
                        <Input
                          type="password"
                          value={confirmPassword}
                          onChange={(e) => setConfirmPassword(e.target.value)}
                          placeholder="Repita a nova senha"
                          required
                        />
                      </div>
                    </div>
                    <Button type="submit" disabled={passwordLoading} className="w-full sm:w-auto">
                      {passwordLoading ? 'Atualizando...' : 'Atualizar Senha'}
                    </Button>
                  </form>
                )}
              </div>

              <div className="space-y-4 pt-6 mt-6 border-t border-gray-100 dark:border-gray-800">
                <div className="flex items-center gap-2 mb-2">
                  <Moon className="h-4 w-4 text-gray-400 dark:text-gray-500" />
                  <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Aparência</h4>
                </div>
                <div 
                  onClick={() => setTheme(theme === "light" ? "dark" : "light")}
                  className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-800/50 rounded-xl border border-gray-100 dark:border-gray-800 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 transition-all duration-200 group"
                >
                  <div>
                    <p className="text-sm font-medium text-gray-900 dark:text-gray-100">Modo Escuro</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">Alterne entre o tema claro e escuro</p>
                  </div>
                  <div className="flex items-center justify-center rounded-lg p-2 text-gray-500 group-hover:text-gray-900 dark:text-gray-400 dark:group-hover:text-gray-100 transition-colors">
                    <Sun className="h-[1.2rem] w-[1.2rem] rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
                    <Moon className="absolute h-[1.2rem] w-[1.2rem] rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
                  </div>
                </div>
              </div>
            </CardContent>
          )}
        </Card>

        <Card className="border-none shadow-sm bg-white dark:bg-gray-900 overflow-hidden">
          <div 
            className="p-4 flex items-center justify-between cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
            onClick={() => setIsPlanOpen(!isPlanOpen)}
          >
            <div className="flex items-center gap-3">
              <div className="p-2 bg-amber-50 dark:bg-amber-900/20 rounded-lg">
                <Shield className="h-5 w-5 text-amber-500 dark:text-amber-400" />
              </div>
              <div>
                <h3 className="font-bold text-gray-900 dark:text-gray-100">Meu Plano</h3>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {isPremium(user) ? 'Você é Premium 🌟' : 'Plano Gratuito'}
                </p>
              </div>
            </div>
            <Button variant="ghost" size="sm" className="text-gray-400 dark:text-gray-500">
              {isPlanOpen ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
            </Button>
          </div>

          {isPlanOpen && (
            <CardContent className="pt-6 border-t border-gray-100 dark:border-gray-800 animate-in fade-in slide-in-from-top-2 duration-200">
              <div className="space-y-4">
                <div className={`p-4 rounded-xl border ${isPremium(user) ? 'bg-amber-50 border-amber-200 dark:bg-amber-900/10 dark:border-amber-900/30' : 'bg-gray-50 border-gray-200 dark:bg-gray-800/50 dark:border-gray-700'}`}>
                  <h4 className={`font-semibold mb-2 ${isPremium(user) ? 'text-amber-800 dark:text-amber-300' : 'text-gray-800 dark:text-gray-300'}`}>
                    {isPremium(user) ? 'Plano Premium Ativo' : 'Plano Gratuito'}
                  </h4>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                    {isPremium(user) 
                      ? 'Você tem acesso a todas as funcionalidades do Atlas Financeiro, incluindo leitura de notas fiscais com IA, veículos ilimitados e exportação de relatórios.'
                      : 'Faça o upgrade para desbloquear leitura de notas fiscais com IA, veículos ilimitados, exportação de relatórios e muito mais.'}
                  </p>
                  
                  {!isPremium(user) && (
                    <Button 
                      onClick={handleTestPremium} 
                      disabled={planLoading} 
                      className="w-full bg-amber-500 hover:bg-amber-600 text-white"
                    >
                      {planLoading ? 'Ativando...' : 'Ativar Premium (Modo Teste)'}
                    </Button>
                  )}
                </div>
              </div>
            </CardContent>
          )}
        </Card>

        <Card className="border-none shadow-sm bg-white dark:bg-gray-900 overflow-hidden">
          <div 
            className="p-4 flex items-center justify-between cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
            onClick={() => setIsReferralOpen(!isReferralOpen)}
          >
            <div className="flex items-center gap-3">
              <div className="p-2 bg-emerald-50 dark:bg-emerald-900/20 rounded-lg">
                <Gift className="h-5 w-5 text-emerald-500 dark:text-emerald-400" />
              </div>
              <div>
                <h3 className="font-bold text-gray-900 dark:text-gray-100">Indique e Ganhe Premium</h3>
                <p className="text-xs text-gray-500 dark:text-gray-400">Ganhe 1 mês grátis por cada amigo que usar o app</p>
              </div>
            </div>
            <Button variant="ghost" size="sm" className="text-gray-400 dark:text-gray-500">
              {isReferralOpen ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
            </Button>
          </div>

          {isReferralOpen && (
            <CardContent className="pt-6 border-t border-gray-100 dark:border-gray-800 animate-in fade-in slide-in-from-top-2 duration-200">
              <div className="space-y-4">
                <div className="bg-emerald-50 dark:bg-emerald-900/10 p-4 rounded-xl border border-emerald-100 dark:border-emerald-900/30">
                  <h4 className="font-semibold text-emerald-800 dark:text-emerald-300 mb-2">Como funciona?</h4>
                  <ul className="text-sm text-emerald-700 dark:text-emerald-400 space-y-1 list-disc list-inside">
                    <li>Compartilhe seu link com amigos.</li>
                    <li>Eles ganham 15 dias de Premium ao se cadastrar.</li>
                    <li>Quando seu amigo registrar 10 corridas, você ganha 1 mês de Premium!</li>
                  </ul>
                </div>

                {referralCode ? (
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Seu Link de Indicação</label>
                    <div className="flex gap-2">
                      <Input value={`${window.location.origin}?ref=${referralCode}`} readOnly className="font-mono text-sm tracking-tight text-center bg-gray-50 dark:bg-gray-800/50" />
                      <Button onClick={copyReferralLink} variant="outline" className="shrink-0">
                        <Copy className="h-4 w-4 mr-2" />
                        Copiar
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-4">
                    <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">Você ainda não tem um link de indicação.</p>
                    <Button onClick={generateReferralCode} disabled={referralLoading} className="bg-emerald-600 hover:bg-emerald-700 text-white">
                      {referralLoading ? 'Gerando...' : 'Gerar Meu Link'}
                    </Button>
                  </div>
                )}
              </div>
            </CardContent>
          )}
        </Card>

        <Card className="border-none shadow-sm bg-white dark:bg-gray-900 overflow-hidden">
          <div 
            className="p-4 flex items-center justify-between cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
            onClick={onNavigateToRelatorios}
          >
            <div className="flex items-center gap-3">
              <div className="p-2 bg-purple-50 dark:bg-purple-900/20 rounded-lg">
                <BarChart2 className="h-5 w-5 text-purple-500 dark:text-purple-400" />
              </div>
              <div>
                <h3 className="font-bold text-gray-900 dark:text-gray-100">Relatórios Detalhados</h3>
                <p className="text-xs text-gray-500 dark:text-gray-400">Consulte gráficos e exporte seus dados</p>
              </div>
            </div>
            <Button variant="ghost" size="sm" className="text-gray-400 dark:text-gray-500">
              <ChevronDown className="h-5 w-5 -rotate-90" />
            </Button>
          </div>
        </Card>

        <Card className="border-none shadow-sm bg-white dark:bg-gray-900 overflow-hidden">
          <div 
            className="p-4 flex items-center justify-between cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
            onClick={() => setIsCategoryFormOpen(!isCategoryFormOpen)}
          >
            <div className="flex items-center gap-3">
              <div className="p-2 bg-[#F59E0B]/10 rounded-lg">
                <Settings className="h-5 w-5 text-[#F59E0B]" />
              </div>
              <div>
                <h3 className="font-bold text-gray-900 dark:text-gray-100">{editingId ? 'Editar Categoria' : 'Nova Categoria'}</h3>
                <p className="text-xs text-gray-500 dark:text-gray-400">Cadastre ou edite categorias de lançamentos</p>
              </div>
            </div>
            <Button variant="ghost" size="sm" className="text-gray-400 dark:text-gray-500">
              {isCategoryFormOpen ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
            </Button>
          </div>

          {isCategoryFormOpen && (
            <CardContent className="pt-6 border-t border-gray-100 dark:border-gray-800 animate-in fade-in slide-in-from-top-2 duration-200">
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Nome da Categoria</label>
                    <Input
                      type="text"
                      value={nome}
                      onChange={(e) => setNome(e.target.value)}
                      placeholder="Ex: Alimentação, Salário..."
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Tipo</label>
                    <Select value={tipo} onChange={(e) => setTipo(e.target.value as TipoLancamento)}>
                      <option value="despesa">Despesa</option>
                      <option value="receita">Receita</option>
                    </Select>
                  </div>
                </div>
                <div className="flex justify-end space-x-2 pt-4">
                  {editingId && (
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => {
                        setEditingId(null);
                        setNome('');
                        setTipo('despesa');
                        setIsCategoryFormOpen(false);
                      }}
                    >
                      Cancelar
                    </Button>
                  )}
                  <Button type="submit" disabled={loading} className="w-full sm:w-auto bg-[#F59E0B] hover:bg-[#D97706]">
                    {loading ? 'Salvando...' : editingId ? 'Atualizar' : 'Criar Categoria'}
                  </Button>
                </div>
              </form>
            </CardContent>
          )}
        </Card>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card className="border-none shadow-sm bg-white dark:bg-gray-900">
          <CardHeader className="pb-4 border-b border-gray-50 dark:border-gray-800">
            <div className="flex items-center gap-2">
              <div className="p-2 bg-red-50 dark:bg-[#EF4444]/20 rounded-lg">
                <Tag className="h-5 w-5 text-[#EF4444] dark:text-[#F87171]" />
              </div>
              <CardTitle className="text-[#EF4444] dark:text-[#F87171]">Categorias de Despesa</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="pt-6">
            <ul className="space-y-2">
              {despesas.length === 0 ? (
                <li className="text-sm text-gray-500 dark:text-gray-400 text-center py-4 bg-gray-50 dark:bg-gray-800/50 rounded-lg border border-dashed dark:border-gray-700">Nenhuma categoria cadastrada.</li>
              ) : (
                despesas.map((cat) => (
                  <li
                    key={cat.id}
                    className="flex items-center justify-between rounded-xl border border-gray-100 dark:border-gray-800 p-3 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{cat.nome}</span>
                      {cat.is_system_default && (
                        <span className="px-2 py-0.5 text-[10px] font-medium bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 rounded-full">Padrão</span>
                      )}
                    </div>
                    {!cat.is_system_default && (
                      <div className="flex space-x-1">
                        <button
                          onClick={() => handleEdit(cat)}
                          className="p-1.5 text-gray-400 dark:text-gray-500 hover:text-[#F59E0B] dark:hover:text-[#FBBF24] hover:bg-orange-50 dark:hover:bg-[#F59E0B]/10 rounded-md transition-colors"
                        >
                          <Edit2 className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => confirmDelete(cat.id)}
                          className="p-1.5 text-gray-400 dark:text-gray-500 hover:text-[#EF4444] dark:hover:text-[#F87171] hover:bg-red-50 dark:hover:bg-[#EF4444]/10 rounded-md transition-colors"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    )}
                  </li>
                ))
              )}
            </ul>
          </CardContent>
        </Card>

        <Card className="border-none shadow-sm bg-white dark:bg-gray-900">
          <CardHeader className="pb-4 border-b border-gray-50 dark:border-gray-800">
            <div className="flex items-center gap-2">
              <div className="p-2 bg-green-50 dark:bg-[#10B981]/20 rounded-lg">
                <Tag className="h-5 w-5 text-[#059568] dark:text-[#10B981]" />
              </div>
              <CardTitle className="text-[#059568] dark:text-[#10B981]">Categorias de Receita</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="pt-6">
            <ul className="space-y-2">
              {receitas.length === 0 ? (
                <li className="text-sm text-gray-500 dark:text-gray-400 text-center py-4 bg-gray-50 dark:bg-gray-800/50 rounded-lg border border-dashed dark:border-gray-700">Nenhuma categoria cadastrada.</li>
              ) : (
                receitas.map((cat) => (
                  <li
                    key={cat.id}
                    className="flex items-center justify-between rounded-xl border border-gray-100 dark:border-gray-800 p-3 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{cat.nome}</span>
                      {cat.is_system_default && (
                        <span className="px-2 py-0.5 text-[10px] font-medium bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 rounded-full">Padrão</span>
                      )}
                    </div>
                    {!cat.is_system_default && (
                      <div className="flex space-x-1">
                        <button
                          onClick={() => handleEdit(cat)}
                          className="p-1.5 text-gray-400 dark:text-gray-500 hover:text-[#F59E0B] dark:hover:text-[#FBBF24] hover:bg-orange-50 dark:hover:bg-[#F59E0B]/10 rounded-md transition-colors"
                        >
                          <Edit2 className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => confirmDelete(cat.id)}
                          className="p-1.5 text-gray-400 dark:text-gray-500 hover:text-[#EF4444] dark:hover:text-[#F87171] hover:bg-red-50 dark:hover:bg-[#EF4444]/10 rounded-md transition-colors"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    )}
                  </li>
                ))
              )}
            </ul>
          </CardContent>
        </Card>
      </div>

      <Modal
        isOpen={deleteModalOpen}
        onClose={() => setDeleteModalOpen(false)}
        title="Confirmar Exclusão"
      >
        <p className="mb-6 text-sm text-gray-600 dark:text-gray-400">
          Tem certeza que deseja excluir esta categoria? Não será possível excluir se houver lançamentos vinculados a ela.
        </p>
        <div className="flex justify-end space-x-3">
          <Button variant="outline" onClick={() => setDeleteModalOpen(false)}>
            Cancelar
          </Button>
          <Button variant="destructive" onClick={handleDelete}>
            Confirmar Exclusão
          </Button>
        </div>
      </Modal>
    </div>
  );
}
