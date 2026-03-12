import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Modal } from '@/components/ui/modal';
import { formatCurrency, formatCurrencyInput, parseCurrency, isPremium } from '@/lib/utils';
import { Lancamento, Vehicle, Manutencao, User } from '@/types';
import { supabase } from '@/lib/supabase';
import { Edit2, Trash2, Car, RefreshCw, Plus, ChevronDown, ChevronUp, Wrench, Lock } from 'lucide-react';

interface VeiculosProps {
  vehicles: Vehicle[];
  lancamentos: Lancamento[];
  manutencoes: Manutencao[];
  refetch: () => void;
  user: User;
}

export function Veiculos({ vehicles, lancamentos, manutencoes, refetch, user }: VeiculosProps) {
  const [name, setName] = useState('');
  const [plate, setPlate] = useState('');
  const [type, setType] = useState<'own' | 'rented'>('own');
  const [status, setStatus] = useState<'active' | 'sold' | 'deactivated'>('active');
  const [initialOdometer, setInitialOdometer] = useState('');
  
  // Rented specific
  const [contractValueStr, setContractValueStr] = useState('');
  const [contractStartDate, setContractStartDate] = useState('');
  const [contractEndDate, setContractEndDate] = useState('');
  const [contractInitialKm, setContractInitialKm] = useState('');
  const [contractKmLimit, setContractKmLimit] = useState('');
  const [profitGoalStr, setProfitGoalStr] = useState('');
  
  // Own specific
  const [maintenanceReserveStr, setMaintenanceReserveStr] = useState('');

  const [editingId, setEditingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);

  // Renew Contract specific
  const [renewModalOpen, setRenewModalOpen] = useState(false);
  const [renewingVehicle, setRenewingVehicle] = useState<Vehicle | null>(null);
  const [renewContractValueStr, setRenewContractValueStr] = useState('');
  const [renewStartDate, setRenewStartDate] = useState('');
  const [renewEndDate, setRenewEndDate] = useState('');
  const [renewInitialKm, setRenewInitialKm] = useState('');
  const [renewContractKmLimit, setRenewContractKmLimit] = useState('');
  const [addRemainingKm, setAddRemainingKm] = useState(false);
  const [renewProfitGoalStr, setRenewProfitGoalStr] = useState('');
  
  // Maintenance Plan specific
  const [maintenanceModalOpen, setMaintenanceModalOpen] = useState(false);
  const [maintenanceVehicle, setMaintenanceVehicle] = useState<Vehicle | null>(null);
  const [maintenanceTipo, setMaintenanceTipo] = useState('');
  const [maintenanceIntervaloKm, setMaintenanceIntervaloKm] = useState('');
  const [maintenanceUltimoKm, setMaintenanceUltimoKm] = useState('');
  const [maintenanceAvisoKm, setMaintenanceAvisoKm] = useState('');
  const [editingMaintenanceId, setEditingMaintenanceId] = useState<string | null>(null);
  const [deleteMaintenanceModalOpen, setDeleteMaintenanceModalOpen] = useState(false);
  const [deletingMaintenanceId, setDeletingMaintenanceId] = useState<string | null>(null);
  
  const [expandedInfo, setExpandedInfo] = useState<Record<string, boolean>>({});

  const toggleInfo = (id: string) => {
    setExpandedInfo(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const getDaysRemaining = (endDate?: string) => {
    if (!endDate) return 0;
    const end = new Date(endDate);
    const today = new Date();
    const diffTime = end.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays > 0 ? diffDays : 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !plate || !initialOdometer) {
      alert('Preencha os campos obrigatórios.');
      return;
    }

    if (!editingId && !isPremium(user) && vehicles.length >= 1) {
      alert('Usuários do plano gratuito podem cadastrar apenas 1 veículo. Faça o upgrade para cadastrar mais veículos.');
      return;
    }

    setLoading(true);
    try {
      const payload: any = {
        user_id: user.id,
        name,
        plate,
        type,
        status,
        initial_odometer: Number(initialOdometer),
      };

      if (type === 'rented') {
        payload.contract_value = parseCurrency(contractValueStr);
        payload.contract_start_date = contractStartDate || null;
        payload.contract_end_date = contractEndDate || null;
        payload.contract_initial_km = contractInitialKm ? Number(contractInitialKm) : null;
        payload.contract_km_limit = contractKmLimit ? Number(contractKmLimit) : null;
        payload.profit_goal = parseCurrency(profitGoalStr);
        payload.maintenance_reserve = null;
      } else {
        payload.profit_goal = parseCurrency(profitGoalStr);
        payload.maintenance_reserve = parseCurrency(maintenanceReserveStr);
        payload.contract_value = null;
        payload.contract_start_date = null;
        payload.contract_end_date = null;
        payload.contract_initial_km = null;
        payload.contract_km_limit = null;
      }

      if (editingId) {
        const { error } = await supabase.from('vehicles').update(payload).eq('id', editingId);
        if (error) throw error;
      } else {
        const { data: newVehicle, error } = await supabase.from('vehicles').insert([payload]).select();
        if (error) throw error;

        if (type === 'rented') {
          const { data: catData } = await supabase.from('categorias').select('id').eq('nome', 'Aluguel').single();
          if (catData) {
            await supabase.from('lancamentos').insert([{
              user_id: user.id,
              tipo: 'despesa',
              categoria_id: catData.id,
              vehicle_id: newVehicle[0].id,
              valor: parseCurrency(contractValueStr),
              data: contractStartDate || new Date().toISOString().split('T')[0],
              observacao: `Pagamento inicial do contrato - ${name}`
            }]);
          }
        }
      }

      resetForm();
      setIsFormOpen(false);
      refetch();
    } catch (error: any) {
      alert(error.message || 'Erro ao salvar veículo.');
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setName('');
    setPlate('');
    setType('own');
    setStatus('active');
    setInitialOdometer('');
    setContractValueStr('');
    setContractStartDate('');
    setContractEndDate('');
    setContractInitialKm('');
    setContractKmLimit('');
    setProfitGoalStr('');
    setMaintenanceReserveStr('');
    setEditingId(null);
    setIsFormOpen(false);
  };

  const handleEdit = (vehicle: Vehicle) => {
    setEditingId(vehicle.id);
    setIsFormOpen(true);
    setName(vehicle.name);
    setPlate(vehicle.plate);
    setType(vehicle.type);
    setStatus(vehicle.status || 'active');
    setInitialOdometer(vehicle.initial_odometer.toString());
    
    if (vehicle.type === 'rented') {
      setContractValueStr(formatCurrency(vehicle.contract_value || 0));
      setContractStartDate(vehicle.contract_start_date || '');
      setContractEndDate(vehicle.contract_end_date || '');
      setContractInitialKm(vehicle.contract_initial_km?.toString() || '');
      setContractKmLimit(vehicle.contract_km_limit?.toString() || '');
      setProfitGoalStr(formatCurrency(vehicle.profit_goal || 0));
      setMaintenanceReserveStr('');
    } else {
      setProfitGoalStr(formatCurrency(vehicle.profit_goal || 0));
      setMaintenanceReserveStr(formatCurrency(vehicle.maintenance_reserve || 0));
      setContractValueStr('');
      setContractStartDate('');
      setContractEndDate('');
      setContractInitialKm('');
      setContractKmLimit('');
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleOpenRenew = (vehicle: Vehicle) => {
    setRenewingVehicle(vehicle);
    setRenewContractValueStr(formatCurrency(vehicle.contract_value || 0));
    setRenewStartDate(vehicle.contract_end_date || ''); // Default to previous end date
    setRenewEndDate('');
    
    // Get the last known odometer to use as the new initial KM
    const metrics = calculateMetrics(vehicle);
    setRenewInitialKm(metrics.lastOdometer.toString());
    
    setRenewContractKmLimit(vehicle.contract_km_limit?.toString() || '');
    setAddRemainingKm(false);
    setRenewProfitGoalStr(formatCurrency(vehicle.profit_goal || 0));
    setRenewModalOpen(true);
  };

  const handleRenewSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!renewingVehicle) return;

    setLoading(true);
    try {
      let finalKmLimit = renewContractKmLimit ? Number(renewContractKmLimit) : null;

      if (addRemainingKm && finalKmLimit !== null) {
        const metrics = calculateMetrics(renewingVehicle);
        const kmRodadoContrato = metrics.lastOdometer - (renewingVehicle.contract_initial_km || renewingVehicle.initial_odometer);
        const kmRestante = (renewingVehicle.contract_km_limit || 0) - kmRodadoContrato;
        
        if (kmRestante > 0) {
          finalKmLimit += kmRestante;
        }
      }

      const payload = {
        contract_value: parseCurrency(renewContractValueStr),
        contract_start_date: renewStartDate || null,
        contract_end_date: renewEndDate || null,
        contract_initial_km: renewInitialKm ? Number(renewInitialKm) : null,
        contract_km_limit: finalKmLimit,
        profit_goal: parseCurrency(renewProfitGoalStr),
      };

      const { error } = await supabase.from('vehicles').update(payload).eq('id', renewingVehicle.id);
      if (error) throw error;

      const { data: catData } = await supabase.from('categorias').select('id').eq('nome', 'Aluguel').single();
      if (catData) {
        await supabase.from('lancamentos').insert([{
          user_id: user.id,
          tipo: 'despesa',
          categoria_id: catData.id,
          vehicle_id: renewingVehicle.id,
          valor: parseCurrency(renewContractValueStr),
          data: renewStartDate || new Date().toISOString().split('T')[0],
          observacao: `Pagamento de renovação de contrato - ${renewingVehicle.name}`
        }]);
      }

      setRenewModalOpen(false);
      setRenewingVehicle(null);
      refetch();
    } catch (error: any) {
      alert(error.message || 'Erro ao renovar contrato.');
    } finally {
      setLoading(false);
    }
  };

  const confirmDelete = (id: string) => {
    setDeletingId(id);
    setDeleteModalOpen(true);
  };

  const handleDelete = async () => {
    if (!deletingId) return;
    try {
      const { error } = await supabase.from('vehicles').delete().eq('id', deletingId);
      if (error) throw error;
      setDeleteModalOpen(false);
      setDeletingId(null);
      refetch();
    } catch (error: any) {
      alert(error.message || 'Erro ao excluir veículo.');
    }
  };

  const handleSaveMaintenance = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!maintenanceVehicle || !maintenanceTipo || !maintenanceIntervaloKm || !maintenanceUltimoKm || !maintenanceAvisoKm) {
      alert('Preencha todos os campos.');
      return;
    }

    if (!isPremium(user)) {
      alert('O plano de manutenção é uma funcionalidade exclusiva do plano Premium.');
      return;
    }

    setLoading(true);
    try {
      const payload = {
        user_id: user.id,
        vehicle_id: maintenanceVehicle.id,
        tipo: maintenanceTipo,
        intervalo_km: Number(maintenanceIntervaloKm),
        ultimo_km_realizado: Number(maintenanceUltimoKm),
        aviso_km_antes: Number(maintenanceAvisoKm)
      };

      if (editingMaintenanceId) {
        const { error } = await supabase.from('manutencoes').update(payload).eq('id', editingMaintenanceId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('manutencoes').insert([payload]);
        if (error) throw error;
      }

      setMaintenanceTipo('');
      setMaintenanceIntervaloKm('');
      setMaintenanceUltimoKm('');
      setMaintenanceAvisoKm('');
      setEditingMaintenanceId(null);
      refetch();
    } catch (error: any) {
      alert(error.message || 'Erro ao salvar manutenção.');
    } finally {
      setLoading(false);
    }
  };

  const handleEditMaintenance = (m: Manutencao) => {
    setEditingMaintenanceId(m.id);
    setMaintenanceTipo(m.tipo);
    setMaintenanceIntervaloKm(m.intervalo_km.toString());
    setMaintenanceUltimoKm(m.ultimo_km_realizado.toString());
    setMaintenanceAvisoKm(m.aviso_km_antes.toString());
  };

  const handleDeleteMaintenance = (id: string) => {
    setDeletingMaintenanceId(id);
    setDeleteMaintenanceModalOpen(true);
  };

  const confirmDeleteMaintenance = async () => {
    if (!deletingMaintenanceId) return;
    try {
      const { error } = await supabase.from('manutencoes').delete().eq('id', deletingMaintenanceId);
      if (error) throw error;
      setDeleteMaintenanceModalOpen(false);
      setDeletingMaintenanceId(null);
      refetch();
    } catch (error: any) {
      alert(error.message || 'Erro ao excluir manutenção.');
    }
  };

  const calculateMetrics = (vehicle: Vehicle) => {
    const vLancamentos = lancamentos.filter(l => l.vehicle_id === vehicle.id);
    
    let totalReceitas = 0;
    let totalDespesas = 0;
    let totalCombustivel = 0;
    let totalLitros = 0;
    let maxOdometer = vehicle.initial_odometer;
    let maxFuelOdometer = vehicle.initial_odometer;

    vLancamentos.forEach(l => {
      if (l.tipo === 'receita') {
        totalReceitas += Number(l.valor);
      } else {
        totalDespesas += Number(l.valor);
        
        if (l.odometer && l.odometer > maxOdometer) {
          maxOdometer = l.odometer;
        }

        if (l.fuel_liters && l.fuel_liters > 0) {
          totalCombustivel += Number(l.valor);
          totalLitros += Number(l.fuel_liters);
          if (l.odometer && l.odometer > maxFuelOdometer) {
            maxFuelOdometer = l.odometer;
          }
        }
      }
    });

    const lucroLiquido = totalReceitas - totalDespesas;
    const kmRodadoTotal = maxOdometer - vehicle.initial_odometer;
    const kmRodadoCombustivel = maxFuelOdometer - vehicle.initial_odometer;
    const mediaKmL = totalLitros > 0 ? (kmRodadoCombustivel / totalLitros).toFixed(2) : '0.00';

    return {
      totalReceitas,
      totalDespesas,
      lucroLiquido,
      totalCombustivel,
      mediaKmL,
      kmRodado: kmRodadoTotal,
      lastOdometer: maxOdometer
    };
  };

  const sortedVehicles = [...vehicles].sort((a, b) => {
    const getOrder = (v: Vehicle) => {
      if (v.status === 'sold' || v.status === 'deactivated') return 3;
      if (v.type === 'own') return 1;
      if (v.type === 'rented') return 2;
      return 4;
    };
    return getOrder(a) - getOrder(b);
  });

  return (
    <div className="space-y-6">
      <Card className="overflow-hidden border-none shadow-sm bg-white dark:bg-gray-900">
        <div 
          className="p-4 flex items-center justify-between cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
          onClick={() => {
            if (!isFormOpen && !editingId && !isPremium(user) && vehicles.length >= 1) {
              alert('Usuários do plano gratuito podem cadastrar apenas 1 veículo. Faça o upgrade para cadastrar mais veículos.');
              return;
            }
            setIsFormOpen(!isFormOpen);
          }}
        >
          <div className="flex items-center gap-3">
            <div className="p-2 bg-[#F59E0B]/10 rounded-lg">
              <Car className="h-5 w-5 text-[#F59E0B]" />
            </div>
            <div className="hidden sm:block">
              <h3 className="font-bold text-gray-900 dark:text-gray-100">
                {editingId ? 'Editar Veículo' : 'Novo Veículo'}
              </h3>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {isFormOpen ? 'Preencha os dados abaixo' : 'Clique para cadastrar um novo veículo'}
              </p>
            </div>
            <div className="sm:hidden">
              <h3 className="font-bold text-gray-900 dark:text-gray-100">
                {editingId ? 'Editar Veículo' : 'Cadastrar veículo'}
              </h3>
            </div>
          </div>
          <div className="text-[#F59E0B] sm:hidden">
            {isFormOpen ? <ChevronUp className="h-5 w-5" /> : <Plus className="h-5 w-5" />}
          </div>
          <Button 
            variant="ghost" 
            size="sm" 
            className="hidden sm:flex text-[#F59E0B] hover:text-[#D97706] hover:bg-[#F59E0B]/5 dark:hover:bg-[#F59E0B]/10"
          >
            {isFormOpen ? (
              <div className="flex items-center gap-2">
                <span>Recolher</span>
                <ChevronUp className="h-4 w-4" />
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <Plus className="h-4 w-4" />
                <span>Cadastrar Veículo</span>
              </div>
            )}
          </Button>
        </div>

        {isFormOpen && (
          <CardContent className="pt-0 border-t border-gray-100 dark:border-gray-800">
            <form onSubmit={handleSubmit} className="space-y-6 pt-6">
              <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Nome do Veículo *</label>
                  <Input
                    type="text"
                    placeholder="Ex: Corolla 2015"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Placa *</label>
                  <Input
                    type="text"
                    placeholder="ABC-1234"
                    value={plate}
                    onChange={(e) => setPlate(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Tipo *</label>
                  <Select value={type} onChange={(e) => {
                    const newType = e.target.value as 'own' | 'rented';
                    setType(newType);
                    if (newType === 'own' && status === 'deactivated') setStatus('active');
                    if (newType === 'rented' && status === 'sold') setStatus('active');
                  }}>
                    <option value="own">Próprio</option>
                    <option value="rented">Alugado</option>
                  </Select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Status *</label>
                  <Select value={status} onChange={(e) => setStatus(e.target.value as any)}>
                    <option value="active">Ativo</option>
                    {type === 'own' ? (
                      <option value="sold">Vendido</option>
                    ) : (
                      <option value="deactivated">Desativado</option>
                    )}
                  </Select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Odômetro Inicial (KM) *</label>
                  <Input
                    type="number"
                    inputMode="numeric"
                    placeholder="Ex: 50000"
                    value={initialOdometer}
                    onChange={(e) => setInitialOdometer(e.target.value)}
                    required
                  />
                </div>
              </div>

              {type === 'rented' ? (
                <div className="grid grid-cols-1 gap-6 md:grid-cols-2 mt-4 p-4 bg-gray-50 dark:bg-gray-800/50 rounded-lg border border-gray-100 dark:border-gray-800">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Valor do Contrato</label>
                    <Input
                      type="text"
                      inputMode="decimal"
                      placeholder="R$ 0,00"
                      value={contractValueStr}
                      onChange={(e) => setContractValueStr(formatCurrencyInput(e.target.value))}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Meta de Lucro</label>
                    <Input
                      type="text"
                      inputMode="decimal"
                      placeholder="R$ 0,00"
                      value={profitGoalStr}
                      onChange={(e) => setProfitGoalStr(formatCurrencyInput(e.target.value))}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Data Início Contrato</label>
                    <Input
                      type="date"
                      value={contractStartDate}
                      onChange={(e) => setContractStartDate(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Data Fim Contrato</label>
                    <Input
                      type="date"
                      value={contractEndDate}
                      onChange={(e) => setContractEndDate(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-gray-700 dark:text-gray-300">KM Inicial Contrato</label>
                    <Input
                      type="number"
                      inputMode="numeric"
                      placeholder="Ex: 50000"
                      value={contractInitialKm}
                      onChange={(e) => setContractInitialKm(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Franquia de KM (Limite)</label>
                    <Input
                      type="number"
                      inputMode="numeric"
                      placeholder="Ex: 5000"
                      value={contractKmLimit}
                      onChange={(e) => setContractKmLimit(e.target.value)}
                    />
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-6 md:grid-cols-2 mt-4 p-4 bg-gray-50 dark:bg-gray-800/50 rounded-lg border border-gray-100 dark:border-gray-800">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Reserva de Manutenção</label>
                    <Input
                      type="text"
                      inputMode="decimal"
                      placeholder="R$ 0,00"
                      value={maintenanceReserveStr}
                      onChange={(e) => setMaintenanceReserveStr(formatCurrencyInput(e.target.value))}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Meta de Lucro</label>
                    <Input
                      type="text"
                      inputMode="decimal"
                      placeholder="R$ 0,00"
                      value={profitGoalStr}
                      onChange={(e) => setProfitGoalStr(formatCurrencyInput(e.target.value))}
                    />
                  </div>
                </div>
              )}

              <div className="flex flex-col sm:flex-row justify-end pt-4 gap-2">
                {editingId && (
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={resetForm}
                    className="w-full sm:w-auto"
                  >
                    Cancelar
                  </Button>
                )}
                <Button type="submit" disabled={loading} className="w-full sm:w-auto bg-[#F59E0B] hover:bg-[#D97706]">
                  {loading ? 'Salvando...' : editingId ? 'Atualizar Veículo' : 'Salvar Veículo'}
                </Button>
              </div>
            </form>
          </CardContent>
        )}
      </Card>

      <div className="flex flex-col gap-4">
        {sortedVehicles.map((v) => {
          const metrics = calculateMetrics(v);
          return (
            <Card key={v.id} className={`overflow-hidden transition-all duration-200 bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-800 ${v.status !== 'active' ? 'opacity-75 grayscale-[0.5]' : 'hover:shadow-md'}`}>
              <div 
                className="bg-white dark:bg-gray-900 px-6 py-5 flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
                onClick={() => toggleInfo(v.id)}
              >
                <div className="flex items-center gap-4">
                  <div className={`p-3 rounded-xl shadow-sm border ${v.status === 'sold' ? 'bg-red-50 dark:bg-red-900/20 border-red-100 dark:border-red-800' : v.status === 'deactivated' ? 'bg-gray-100 dark:bg-gray-800 border-gray-200 dark:border-gray-700' : 'bg-[#F59E0B]/10 border-[#F59E0B]/20'}`}>
                    <Car className={`h-6 w-6 ${v.status === 'sold' ? 'text-red-500 dark:text-red-400' : v.status === 'deactivated' ? 'text-gray-500 dark:text-gray-400' : 'text-[#F59E0B]'}`} />
                  </div>
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-bold text-lg text-gray-900 dark:text-gray-100">{v.name}</h3>
                      {expandedInfo[v.id] ? (
                        <ChevronUp className="h-5 w-5 text-gray-400 dark:text-gray-500" />
                      ) : (
                        <ChevronDown className="h-5 w-5 text-gray-400 dark:text-gray-500" />
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-xs font-medium">
                      <span className="bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 px-2 py-1 rounded-md uppercase tracking-wider">{v.plate}</span>
                      <span className={`px-2 py-1 rounded-md uppercase tracking-wider ${v.type === 'own' ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400' : 'bg-purple-50 dark:bg-purple-900/20 text-purple-600 dark:text-purple-400'}`}>
                        {v.type === 'own' ? 'Próprio' : 'Alugado'}
                      </span>
                      {v.status === 'sold' && <span className="bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 px-2 py-1 rounded-md uppercase tracking-wider">Vendido</span>}
                      {v.status === 'deactivated' && <span className="bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 px-2 py-1 rounded-md uppercase tracking-wider">Desativado</span>}
                    </div>
                  </div>
                </div>
                
                <div className="flex items-center gap-2 self-end sm:self-auto" onClick={(e) => e.stopPropagation()}>
                  <Button variant="outline" size="sm" onClick={() => {
                    setMaintenanceVehicle(v);
                    setMaintenanceModalOpen(true);
                  }} className="text-blue-600 border-blue-200 hover:bg-blue-50 dark:text-blue-400 dark:border-blue-900/50 dark:hover:bg-blue-900/20" title="Plano de Manutenção">
                    <Wrench className="h-4 w-4 mr-2" />
                    Manutenção
                  </Button>
                  {v.type === 'rented' && (
                    <Button variant="outline" size="sm" onClick={() => handleOpenRenew(v)} className="text-[#059568] border-[#059568]/20 hover:bg-[#059568]/10 dark:text-[#10B981] dark:border-[#10B981]/20 dark:hover:bg-[#10B981]/10" title="Renovar Contrato">
                      <RefreshCw className="h-4 w-4 mr-2" />
                      Renovar
                    </Button>
                  )}
                  <Button variant="outline" size="icon" onClick={() => handleEdit(v)} className="text-[#F59E0B] border-[#F59E0B]/20 hover:bg-[#F59E0B]/10 dark:text-[#FBBF24] dark:border-[#FBBF24]/20 dark:hover:bg-[#FBBF24]/10" title="Editar">
                    <Edit2 className="h-4 w-4" />
                  </Button>
                  <Button variant="outline" size="icon" onClick={() => confirmDelete(v.id)} className="text-red-500 border-red-200 hover:bg-red-50 dark:text-red-400 dark:border-red-900/50 dark:hover:bg-red-900/20" title="Excluir">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              
              {expandedInfo[v.id] && (
                <CardContent className="p-6 animate-in fade-in slide-in-from-top-2 duration-200 bg-gray-50/50 dark:bg-gray-800/20 border-t border-gray-100 dark:border-gray-800">
                  {/* Section: Financeiro */}
                  <div className="mb-8">
                    <h4 className="text-sm font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-4 flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-[#059568] dark:bg-[#10B981]"></span>
                      Financeiro
                    </h4>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      <div className="bg-white dark:bg-gray-900 p-5 rounded-xl border border-gray-200 dark:border-gray-800 shadow-sm">
                        <p className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-2">Lucro Líquido</p>
                        <p className={`font-bold text-2xl ${metrics.lucroLiquido >= 0 ? 'text-[#059568] dark:text-[#10B981]' : 'text-[#EF4444] dark:text-[#F87171]'}`}>
                          {formatCurrency(metrics.lucroLiquido)}
                        </p>
                      </div>
                      <div className="bg-white dark:bg-gray-900 p-5 rounded-xl border border-gray-200 dark:border-gray-800 shadow-sm">
                        <p className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-2">Receitas</p>
                        <p className="font-semibold text-xl text-[#059568] dark:text-[#10B981]">{formatCurrency(metrics.totalReceitas)}</p>
                      </div>
                      <div className="bg-white dark:bg-gray-900 p-5 rounded-xl border border-gray-200 dark:border-gray-800 shadow-sm">
                        <p className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-2">Despesas</p>
                        <p className="font-semibold text-xl text-[#EF4444] dark:text-[#F87171]">{formatCurrency(metrics.totalDespesas)}</p>
                      </div>
                    </div>
                  </div>

                  {/* Section: Contrato */}
                  {v.type === 'rented' && (
                    <div className="mb-8">
                      <h4 className="text-sm font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-4 flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-blue-500 dark:bg-blue-400"></span>
                        Contrato de Aluguel
                      </h4>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                        <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-xl border border-blue-100 dark:border-blue-800/50">
                          <p className="text-xs font-medium text-blue-600/80 dark:text-blue-400/80 mb-1">Dias Restantes</p>
                          <p className="font-bold text-lg text-blue-700 dark:text-blue-300">{getDaysRemaining(v.contract_end_date)} dias</p>
                        </div>
                        <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-xl border border-blue-100 dark:border-blue-800/50">
                          <p className="text-xs font-medium text-blue-600/80 dark:text-blue-400/80 mb-1">KM Restante</p>
                          <p className="font-bold text-lg text-blue-700 dark:text-blue-300">
                            {v.contract_km_limit ? (v.contract_km_limit - (metrics.lastOdometer - (v.contract_initial_km || v.initial_odometer))).toLocaleString('pt-BR') : '-'} km
                          </p>
                        </div>
                        <div className="bg-white dark:bg-gray-900 p-4 rounded-xl border border-gray-200 dark:border-gray-800">
                          <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Franquia de KM</p>
                          <p className="font-semibold text-gray-900 dark:text-gray-100">{v.contract_km_limit ? v.contract_km_limit.toLocaleString('pt-BR') : '-'} km</p>
                        </div>
                        <div className="bg-white dark:bg-gray-900 p-4 rounded-xl border border-gray-200 dark:border-gray-800">
                          <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">KM Inicial Contrato</p>
                          <p className="font-semibold text-gray-900 dark:text-gray-100">{v.contract_initial_km ? v.contract_initial_km.toLocaleString('pt-BR') : '-'}</p>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Section: Uso e Consumo */}
                  <div>
                    <h4 className="text-sm font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-4 flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-purple-500 dark:bg-purple-400"></span>
                      Uso e Consumo
                    </h4>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                      <div className="bg-white dark:bg-gray-900 p-4 rounded-xl border border-gray-200 dark:border-gray-800">
                        <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Último Odômetro</p>
                        <p className="font-semibold text-gray-900 dark:text-gray-100">{metrics.lastOdometer.toLocaleString('pt-BR')}</p>
                      </div>
                      <div className="bg-white dark:bg-gray-900 p-4 rounded-xl border border-gray-200 dark:border-gray-800">
                        <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">KM Rodado</p>
                        <p className="font-semibold text-gray-900 dark:text-gray-100">{metrics.kmRodado.toLocaleString('pt-BR')} km</p>
                      </div>
                      <div className="bg-white dark:bg-gray-900 p-4 rounded-xl border border-gray-200 dark:border-gray-800">
                        <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Média Consumo</p>
                        <p className="font-semibold text-gray-900 dark:text-gray-100">{metrics.mediaKmL} km/l</p>
                      </div>
                      <div className="bg-white dark:bg-gray-900 p-4 rounded-xl border border-gray-200 dark:border-gray-800">
                        <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Gasto Combustível</p>
                        <p className="font-semibold text-gray-900 dark:text-gray-100">{formatCurrency(metrics.totalCombustivel)}</p>
                      </div>
                    </div>
                  </div>
                </CardContent>
              )}
            </Card>
          );
        })}
        
        {vehicles.length === 0 && (
          <div className="py-12 text-center text-gray-500 dark:text-gray-400 bg-white dark:bg-gray-900 rounded-xl border border-dashed dark:border-gray-800">
            Nenhum veículo cadastrado ainda.
          </div>
        )}
      </div>

      <Modal
        isOpen={deleteModalOpen}
        onClose={() => setDeleteModalOpen(false)}
        title="Confirmar Exclusão"
      >
        <p className="mb-6 text-sm text-gray-600 dark:text-gray-400">
          Tem certeza que deseja excluir este veículo? Os lançamentos atrelados a ele não serão apagados, apenas perderão o vínculo.
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

      <Modal
        isOpen={renewModalOpen}
        onClose={() => setRenewModalOpen(false)}
        title={`Renovar Contrato - ${renewingVehicle?.name}`}
        className="max-w-lg"
      >
        <form onSubmit={handleRenewSubmit} className="space-y-6">
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Novo Valor do Contrato</label>
              <Input
                type="text"
                inputMode="decimal"
                placeholder="R$ 0,00"
                value={renewContractValueStr}
                onChange={(e) => setRenewContractValueStr(formatCurrencyInput(e.target.value))}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Nova Meta de Lucro</label>
              <Input
                type="text"
                inputMode="decimal"
                placeholder="R$ 0,00"
                value={renewProfitGoalStr}
                onChange={(e) => setRenewProfitGoalStr(formatCurrencyInput(e.target.value))}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Nova Data Início</label>
              <Input
                type="date"
                value={renewStartDate}
                onChange={(e) => setRenewStartDate(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Nova Data Fim</label>
              <Input
                type="date"
                value={renewEndDate}
                onChange={(e) => setRenewEndDate(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Novo KM Inicial do Contrato</label>
              <Input
                type="number"
                inputMode="numeric"
                placeholder="Ex: 50000"
                value={renewInitialKm}
                onChange={(e) => setRenewInitialKm(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Nova Franquia de KM (Limite)</label>
              <Input
                type="number"
                inputMode="numeric"
                placeholder="Ex: 5000"
                value={renewContractKmLimit}
                onChange={(e) => setRenewContractKmLimit(e.target.value)}
              />
            </div>
          </div>
          
          <p className="text-xs text-gray-500 dark:text-gray-400 -mt-2">O KM inicial foi preenchido automaticamente com o último odômetro registrado.</p>
          <div className="flex items-center space-x-2 pt-2">
            <input
              type="checkbox"
              id="addRemainingKm"
              checked={addRemainingKm}
              onChange={(e) => setAddRemainingKm(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300 dark:border-gray-600 text-[#F59E0B] focus:ring-[#F59E0B] dark:bg-gray-700"
            />
            <label htmlFor="addRemainingKm" className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Somar KM restante do contrato anterior ao novo contrato?
            </label>
          </div>
          <div className="flex justify-end space-x-3 pt-4">
            <Button type="button" variant="outline" onClick={() => setRenewModalOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? 'Salvando...' : 'Confirmar Renovação'}
            </Button>
          </div>
        </form>
      </Modal>

      <Modal
        isOpen={maintenanceModalOpen}
        onClose={() => setMaintenanceModalOpen(false)}
        title={`Plano de Manutenção - ${maintenanceVehicle?.name}`}
        className="max-w-2xl"
      >
        <div className="space-y-6">
          <form onSubmit={handleSaveMaintenance} className="grid grid-cols-1 md:grid-cols-5 gap-4 items-end bg-gray-50 dark:bg-gray-800/50 p-4 rounded-xl border border-gray-100 dark:border-gray-800">
            <div className="space-y-2">
              <label className="text-xs font-medium text-gray-700 dark:text-gray-300">Tipo (ex: Óleo)</label>
              <Input
                type="text"
                placeholder="Ex: Troca de Óleo"
                value={maintenanceTipo}
                onChange={(e) => setMaintenanceTipo(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-medium text-gray-700 dark:text-gray-300">Intervalo (KM)</label>
              <Input
                type="number"
                inputMode="numeric"
                placeholder="Ex: 10000"
                value={maintenanceIntervaloKm}
                onChange={(e) => setMaintenanceIntervaloKm(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-medium text-gray-700 dark:text-gray-300">Último KM Realizado</label>
              <Input
                type="number"
                inputMode="numeric"
                placeholder="Ex: 50000"
                value={maintenanceUltimoKm}
                onChange={(e) => setMaintenanceUltimoKm(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-medium text-gray-700 dark:text-gray-300">Avisar faltando (KM)</label>
              <Input
                type="number"
                inputMode="numeric"
                placeholder="Ex: 500"
                value={maintenanceAvisoKm}
                onChange={(e) => setMaintenanceAvisoKm(e.target.value)}
                required
              />
            </div>
            <div className="flex gap-2 w-full">
              {editingMaintenanceId && (
                <Button type="button" variant="outline" onClick={() => {
                  setEditingMaintenanceId(null);
                  setMaintenanceTipo('');
                  setMaintenanceIntervaloKm('');
                  setMaintenanceUltimoKm('');
                  setMaintenanceAvisoKm('');
                }} className="flex-1">
                  Cancelar
                </Button>
              )}
              <Button type="submit" disabled={loading} className={`flex-1 ${editingMaintenanceId ? 'bg-[#F59E0B] hover:bg-[#D97706]' : 'bg-blue-600 hover:bg-blue-700'} text-white`}>
                {loading ? 'Salvando...' : editingMaintenanceId ? 'Atualizar' : 'Adicionar'}
              </Button>
            </div>
          </form>

          <div className="space-y-3">
            <h4 className="text-sm font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Manutenções Programadas</h4>
            {maintenanceVehicle && manutencoes.filter(m => m.vehicle_id === maintenanceVehicle.id).length > 0 ? (
              <div className="grid grid-cols-1 gap-3">
                {manutencoes.filter(m => m.vehicle_id === maintenanceVehicle.id).map(m => (
                  <div key={m.id} className="flex items-center justify-between p-4 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl">
                    <div>
                      <h5 className="font-bold text-gray-900 dark:text-gray-100">{m.tipo}</h5>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                        A cada {m.intervalo_km.toLocaleString('pt-BR')} km | Avisa faltando: {m.aviso_km_antes ? m.aviso_km_antes.toLocaleString('pt-BR') : '1.000'} km | Última: {m.ultimo_km_realizado.toLocaleString('pt-BR')} km
                      </p>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="icon" onClick={() => handleEditMaintenance(m)} className="text-[#F59E0B] hover:text-[#D97706] hover:bg-[#F59E0B]/10 dark:hover:bg-[#F59E0B]/20">
                        <Edit2 className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => handleDeleteMaintenance(m.id)} className="text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-4 bg-white dark:bg-gray-900 rounded-xl border border-dashed border-gray-200 dark:border-gray-800">
                Nenhuma manutenção programada para este veículo.
              </p>
            )}
          </div>
        </div>
      </Modal>
      <Modal
        isOpen={deleteMaintenanceModalOpen}
        onClose={() => setDeleteMaintenanceModalOpen(false)}
        title="Confirmar Exclusão"
      >
        <p className="mb-6 text-sm text-gray-600 dark:text-gray-400">
          Tem certeza que deseja excluir este plano de manutenção?
        </p>
        <div className="flex justify-end space-x-3">
          <Button variant="outline" onClick={() => setDeleteMaintenanceModalOpen(false)}>
            Cancelar
          </Button>
          <Button variant="destructive" onClick={confirmDeleteMaintenance}>
            Confirmar Exclusão
          </Button>
        </div>
      </Modal>
    </div>
  );
}
