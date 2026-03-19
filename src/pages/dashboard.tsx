import React, { useMemo, useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { formatCurrency, formatCurrencyInput, parseCurrency, parseLocalDate } from '@/lib/utils';
import { Lancamento, Categoria, Vehicle, Manutencao, User } from '@/types';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { startOfMonth, endOfMonth, isWithinInterval, format, subMonths } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { isPremium } from '@/lib/utils';

import { ArrowUpCircle, ArrowDownCircle, DollarSign, Wallet, Filter, Zap, Fuel, AlertTriangle, CheckCircle, Camera } from 'lucide-react';
import { Modal } from '@/components/ui/modal';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { CustomSelect } from '@/components/ui/custom-select';
import { supabase } from '@/lib/supabase';
import { PremiumModal } from '@/components/premium-modal';

interface DashboardProps {
  lancamentos: Lancamento[];
  categorias: Categoria[];
  vehicles: Vehicle[];
  manutencoes: Manutencao[];
  refetch: () => void;
  user: User;
  onReadReceipt?: () => void;
}

export function Dashboard({ lancamentos, categorias, vehicles, manutencoes, refetch, user, onReadReceipt }: DashboardProps) {
  const [isPremiumModalOpen, setIsPremiumModalOpen] = useState(false);
  const [premiumFeatureName, setPremiumFeatureName] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const now = new Date();
  const start = startOfMonth(now);
  const end = endOfMonth(now);

  const [monthsFilter, setMonthsFilter] = useState<number>(6);
  const [showFilter, setShowFilter] = useState(false);
  const [quickEntryOpen, setQuickEntryOpen] = useState(false);
  const [quickValueStr, setQuickValueStr] = useState('');
  const [quickKM, setQuickKM] = useState('');
  const [quickPricePerLiterStr, setQuickPricePerLiterStr] = useState('');
  const [quickVehicleId, setQuickVehicleId] = useState('');
  const [quickLoading, setQuickLoading] = useState(false);

  // Auto-fill states for Quick Refuel
  const [isQuickOdometerManuallyEdited, setIsQuickOdometerManuallyEdited] = useState(false);
  const [lastQuickAutoFillTrigger, setLastQuickAutoFillTrigger] = useState('');
  const [lastQuickFuelData, setLastQuickFuelData] = useState<{
    pricePerLiter: number | null;
    lastOdometer: number | null;
    avgConsumption: number | null;
  } | null>(null);

  const [performModalOpen, setPerformModalOpen] = useState(false);
  const [performManutencao, setPerformManutencao] = useState<Manutencao | null>(null);
  const [performVehicle, setPerformVehicle] = useState<Vehicle | null>(null);
  const [performDate, setPerformDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [performKm, setPerformKm] = useState('');
  const [performValueStr, setPerformValueStr] = useState('');
  const [performObs, setPerformObs] = useState('');
  const [performLoading, setPerformLoading] = useState(false);

  useEffect(() => {
    if (vehicles.length > 0) {
      const activeVehicle = vehicles.find(v => v.status === 'active') || vehicles[0];
      setQuickVehicleId(activeVehicle.id);
    }
  }, [vehicles, quickEntryOpen]);

  useEffect(() => {
    // Set default based on screen size on initial load
    if (window.innerWidth < 768) {
      setMonthsFilter(3);
    }
  }, []);

  useEffect(() => {
    const triggerKey = `${quickVehicleId}`;

    if (quickEntryOpen && quickVehicleId) {
      const vLancamentos = lancamentos.filter(l => l.vehicle_id === quickVehicleId);
      
      const fuelEntries = vLancamentos
        .filter(l => l.fuel_price_per_liter && l.fuel_liters && l.odometer)
        .sort((a, b) => new Date(b.data).getTime() - new Date(a.data).getTime());

      const lastFuelEntry = fuelEntries.length > 0 ? fuelEntries[0] : null;
      const lastPrice = lastFuelEntry?.fuel_price_per_liter || null;
      
      const odoEntries = vLancamentos
        .filter(l => l.odometer)
        .sort((a, b) => new Date(b.data).getTime() - new Date(a.data).getTime());
      
      const vehicle = vehicles.find(v => v.id === quickVehicleId);
      const lastOdo = odoEntries.length > 0 ? odoEntries[0].odometer! : (vehicle?.initial_odometer || null);

      let totalLitros = 0;
      let maxFuelOdometer = vehicle?.initial_odometer || 0;
      
      vLancamentos.forEach(l => {
        if (l.tipo === 'despesa' && l.fuel_liters && l.fuel_liters > 0) {
          totalLitros += Number(l.fuel_liters);
          if (l.odometer && l.odometer > maxFuelOdometer) {
            maxFuelOdometer = l.odometer;
          }
        }
      });
      
      const kmRodadoCombustivel = maxFuelOdometer - (vehicle?.initial_odometer || 0);
      const avgConsumption = totalLitros > 0 ? (kmRodadoCombustivel / totalLitros) : null;

      setLastQuickFuelData({
        pricePerLiter: lastPrice,
        lastOdometer: lastOdo,
        avgConsumption: avgConsumption
      });

      if (triggerKey !== lastQuickAutoFillTrigger) {
        if (lastPrice) {
          setQuickPricePerLiterStr(formatCurrency(lastPrice));
        }
        setIsQuickOdometerManuallyEdited(false);
        setLastQuickAutoFillTrigger(triggerKey);
      }
    } else if (!quickVehicleId) {
      setLastQuickFuelData(null);
      setIsQuickOdometerManuallyEdited(false);
      setLastQuickAutoFillTrigger(triggerKey);
    }
  }, [quickVehicleId, quickEntryOpen, lancamentos, vehicles, lastQuickAutoFillTrigger]);

  useEffect(() => {
    if (quickEntryOpen && quickVehicleId && !isQuickOdometerManuallyEdited && lastQuickFuelData) {
      const valorNum = parseCurrency(quickValueStr);
      const pricePerLiter = parseCurrency(quickPricePerLiterStr);
      
      if (valorNum > 0 && pricePerLiter > 0 && lastQuickFuelData.lastOdometer !== null && lastQuickFuelData.avgConsumption !== null && lastQuickFuelData.avgConsumption > 0) {
        const liters = valorNum / pricePerLiter;
        const expectedKm = liters * lastQuickFuelData.avgConsumption;
        const expectedOdometer = Math.round(lastQuickFuelData.lastOdometer + expectedKm);
        
        setQuickKM(expectedOdometer.toString());
      } else if (valorNum === 0 || pricePerLiter === 0) {
        setQuickKM('');
      }
    }
  }, [quickValueStr, quickPricePerLiterStr, lastQuickFuelData, isQuickOdometerManuallyEdited, quickEntryOpen, quickVehicleId]);

  const stats = useMemo(() => {
    let receitasMes = 0;
    let despesasMes = 0;
    let saldoGeral = 0;

    lancamentos.forEach((l) => {
      const valor = Number(l.valor);
      const data = parseLocalDate(l.data);
      const isCurrentMonth = isWithinInterval(data, { start, end });

      if (l.tipo === 'receita') {
        saldoGeral += valor;
        if (isCurrentMonth) receitasMes += valor;
      } else {
        saldoGeral -= valor;
        if (isCurrentMonth) despesasMes += valor;
      }
    });

    return {
      receitasMes,
      despesasMes,
      lucroLiquido: receitasMes - despesasMes,
      saldoGeral,
    };
  }, [lancamentos, start, end]);

  const handleQuickEntry = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    if (!quickValueStr || !quickKM) return;

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

    const valorNum = parseCurrency(quickValueStr);
    if (valorNum <= 0) {
      setErrorMsg('O valor deve ser maior que zero.');
      return;
    }

    const fuelCategory = categorias.find(c => c.nome.toLowerCase().includes('combustível') || c.nome.toLowerCase().includes('fuel'));
    const selectedVehicle = vehicles.find(v => v.id === quickVehicleId);

    if (!fuelCategory) {
      setErrorMsg('Categoria "Combustível" não encontrada. Por favor, crie uma categoria de despesa com esse nome primeiro nas configurações.');
      return;
    }

    if (!selectedVehicle) {
      setErrorMsg('Selecione um veículo.');
      return;
    }

    const pricePerLiter = parseCurrency(quickPricePerLiterStr);
    let fuelLiters = null;
    if (pricePerLiter > 0) {
      fuelLiters = valorNum / pricePerLiter;
    }

    setQuickLoading(true);
    try {
      const { error } = await supabase
        .from('lancamentos')
        .insert([{
          user_id: user.id,
          tipo: 'despesa',
          categoria_id: fuelCategory.id,
          vehicle_id: selectedVehicle.id,
          valor: valorNum,
          data: format(new Date(), 'yyyy-MM-dd'),
          odometer: Number(quickKM),
          fuel_price_per_liter: pricePerLiter > 0 ? pricePerLiter : null,
          fuel_liters: fuelLiters,
          observacao: 'Abastecimento'
        }]);

      if (error) throw error;

      setQuickValueStr('');
      setQuickKM('');
      setQuickPricePerLiterStr('');
      setQuickEntryOpen(false);
      refetch();
    } catch (error: any) {
      setErrorMsg(error.message || 'Erro ao registrar abastecimento.');
    } finally {
      setQuickLoading(false);
    }
  };

  const chartData = useMemo(() => {
    const data = [];
    for (let i = monthsFilter - 1; i >= 0; i--) {
      const targetMonth = subMonths(now, i);
      const monthStart = startOfMonth(targetMonth);
      const monthEnd = endOfMonth(targetMonth);

      let receitas = 0;
      let despesas = 0;

      lancamentos.forEach((l) => {
        const valor = Number(l.valor);
        const dataLancamento = parseLocalDate(l.data);
        if (isWithinInterval(dataLancamento, { start: monthStart, end: monthEnd })) {
          if (l.tipo === 'receita') receitas += valor;
          else despesas += valor;
        }
      });

      data.push({
        name: format(targetMonth, 'MMM/yy', { locale: ptBR }).toUpperCase(),
        Receitas: receitas,
        Despesas: despesas,
      });
    }
    return data;
  }, [lancamentos, monthsFilter, now]);

  const maintenanceAlerts = useMemo(() => {
    const alerts: { vehicle: Vehicle; manutencao: Manutencao; kmFaltante: number; status: 'warning' | 'danger'; currentOdometer: number }[] = [];
    
    manutencoes.forEach(m => {
      const vehicle = vehicles.find(v => v.id === m.vehicle_id);
      if (!vehicle) return;

      // Find current odometer for this vehicle
      const vLancamentos = lancamentos.filter(l => l.vehicle_id === vehicle.id && l.odometer);
      let currentOdometer = vehicle.initial_odometer;
      
      if (vLancamentos.length > 0) {
        currentOdometer = Math.max(...vLancamentos.map(l => l.odometer || 0), currentOdometer);
      }

      const kmProximaManutencao = m.ultimo_km_realizado + m.intervalo_km;
      const kmFaltante = kmProximaManutencao - currentOdometer;

      if (kmFaltante <= 0) {
        alerts.push({ vehicle, manutencao: m, kmFaltante, status: 'danger', currentOdometer });
      } else if (kmFaltante <= (m.aviso_km_antes || 1000)) {
        alerts.push({ vehicle, manutencao: m, kmFaltante, status: 'warning', currentOdometer });
      }
    });

    return alerts.sort((a, b) => a.kmFaltante - b.kmFaltante);
  }, [manutencoes, vehicles, lancamentos]);

  const handleOpenPerform = (alert: any) => {
    setPerformManutencao(alert.manutencao);
    setPerformVehicle(alert.vehicle);
    setPerformDate(format(new Date(), 'yyyy-MM-dd'));
    setPerformKm(alert.currentOdometer.toString());
    setPerformValueStr('');
    setPerformObs(`Manutenção: ${alert.manutencao.tipo}`);
    setPerformModalOpen(true);
  };

  const handleConfirmPerform = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    if (!performManutencao || !performVehicle || !performKm || !performValueStr || !performDate) return;

    const valorNum = parseCurrency(performValueStr);
    if (valorNum <= 0) {
      setErrorMsg('O valor deve ser maior que zero.');
      return;
    }

    const maintCategory = categorias.find(c => c.nome.toLowerCase().includes('manuten'));
    if (!maintCategory) {
      setErrorMsg('Categoria "Manutenção" não encontrada. Por favor, crie uma categoria de despesa com esse nome primeiro nas configurações.');
      return;
    }

    setPerformLoading(true);
    try {
      // 1. Update Manutencao
      const { error: maintError } = await supabase
        .from('manutencoes')
        .update({ ultimo_km_realizado: Number(performKm) })
        .eq('id', performManutencao.id);
      if (maintError) throw maintError;

      // 2. Insert Lancamento
      const { error: lancError } = await supabase
        .from('lancamentos')
        .insert([{
          user_id: user.id,
          tipo: 'despesa',
          categoria_id: maintCategory.id,
          vehicle_id: performVehicle.id,
          valor: valorNum,
          data: performDate,
          odometer: Number(performKm),
          observacao: performObs
        }]);
      if (lancError) throw lancError;

      setPerformModalOpen(false);
      refetch();
    } catch (error: any) {
      setErrorMsg(error.message || 'Erro ao registrar manutenção.');
    } finally {
      setPerformLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Resumo</h2>
        <div className="flex items-center gap-2">
          <Button 
            onClick={onReadReceipt}
            variant="outline"
            className="bg-indigo-50 text-indigo-600 border-indigo-200 hover:bg-indigo-100 dark:bg-indigo-900/20 dark:text-indigo-400 dark:border-indigo-800/50 shadow-sm gap-2"
          >
            <Camera className="h-4 w-4" />
            <span className="hidden sm:inline">Ler Nota</span>
            <span className="sm:hidden">Nota</span>
          </Button>
          <Button 
            onClick={() => {
              setQuickEntryOpen(true);
              setIsQuickOdometerManuallyEdited(false);
              setLastQuickAutoFillTrigger('');
            }}
            className="bg-[#F59E0B] hover:bg-[#D97706] text-white shadow-sm gap-2"
          >
            <Fuel className="h-4 w-4" />
            <span className="hidden sm:inline">Abastecer</span>
            <span className="sm:hidden">Abastecer</span>
          </Button>
        </div>
      </div>

      {maintenanceAlerts.length > 0 && (
        <div className="grid grid-cols-1 gap-3">
          {maintenanceAlerts.map((alert, idx) => (
            <div 
              key={idx} 
              className={`flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-xl border ${
                alert.status === 'danger' 
                  ? 'bg-red-50 border-red-200 dark:bg-red-900/20 dark:border-red-800/50' 
                  : 'bg-yellow-50 border-yellow-200 dark:bg-yellow-900/20 dark:border-yellow-800/50'
              }`}
            >
              <div className="flex items-center gap-3">
                <AlertTriangle className={`h-6 w-6 shrink-0 ${alert.status === 'danger' ? 'text-red-500 dark:text-red-400' : 'text-yellow-500 dark:text-yellow-400'}`} />
                <div>
                  <h4 className={`font-bold ${alert.status === 'danger' ? 'text-red-800 dark:text-red-300' : 'text-yellow-800 dark:text-yellow-300'}`}>
                    {alert.status === 'danger' ? 'Manutenção Atrasada!' : 'Atenção: Manutenção Próxima'}
                  </h4>
                  <p className={`text-sm ${alert.status === 'danger' ? 'text-red-600 dark:text-red-400' : 'text-yellow-700 dark:text-yellow-400'}`}>
                    {alert.manutencao.tipo} do veículo <strong>{alert.vehicle.name}</strong>. 
                    {alert.status === 'danger' 
                      ? ` Passou ${Math.abs(alert.kmFaltante).toLocaleString('pt-BR')} km do limite.` 
                      : ` Faltam apenas ${alert.kmFaltante.toLocaleString('pt-BR')} km.`}
                  </p>
                </div>
              </div>
              <Button 
                onClick={() => handleOpenPerform(alert)}
                className={`shrink-0 self-start sm:self-auto ${alert.status === 'danger' ? 'bg-red-600 hover:bg-red-700 text-white' : 'bg-yellow-600 hover:bg-yellow-700 text-white'}`}
              >
                <CheckCircle className="h-4 w-4 mr-2" />
                Realizar
              </Button>
            </div>
          ))}
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 md:gap-6">
        <Card className="col-span-2 md:col-span-1 border-none shadow-sm bg-white dark:bg-gray-900 hover:shadow-md transition-all duration-200 text-center py-4">
          <CardHeader className="flex flex-row items-center justify-center gap-2 space-y-0 pb-2">
            <DollarSign className={`h-6 w-6 md:h-6 md:w-6 ${stats.lucroLiquido >= 0 ? 'text-[#059568] dark:text-[#10B981]' : 'text-[#EF4444] dark:text-[#F87171]'}`} />
            <CardTitle className="text-base md:text-lg font-medium text-gray-500 dark:text-gray-400">Saldo</CardTitle>
          </CardHeader>
          <CardContent className="px-2">
            <div
              className={`text-3xl md:text-4xl font-bold break-words ${
                stats.lucroLiquido >= 0 ? 'text-[#059568] dark:text-[#10B981]' : 'text-[#EF4444] dark:text-[#F87171]'
              }`}
            >
              {formatCurrency(stats.lucroLiquido)}
            </div>
          </CardContent>
        </Card>

        <Card className="border-none shadow-sm bg-white dark:bg-gray-900 hover:shadow-md transition-all duration-200 text-center py-4">
          <CardHeader className="flex flex-row items-center justify-center gap-2 space-y-0 pb-2">
            <ArrowUpCircle className="h-5 w-5 md:h-6 md:w-6 text-[#059568] dark:text-[#10B981]" />
            <CardTitle className="text-sm md:text-lg font-medium text-gray-500 dark:text-gray-400">Receitas</CardTitle>
          </CardHeader>
          <CardContent className="px-2">
            <div className="text-lg md:text-3xl font-bold text-[#059568] dark:text-[#10B981] break-words">
              {formatCurrency(stats.receitasMes)}
            </div>
          </CardContent>
        </Card>

        <Card className="border-none shadow-sm bg-white dark:bg-gray-900 hover:shadow-md transition-all duration-200 text-center py-4">
          <CardHeader className="flex flex-row items-center justify-center gap-2 space-y-0 pb-2">
            <ArrowDownCircle className="h-5 w-5 md:h-6 md:w-6 text-[#EF4444] dark:text-[#F87171]" />
            <CardTitle className="text-sm md:text-lg font-medium text-gray-500 dark:text-gray-400">Despesas</CardTitle>
          </CardHeader>
          <CardContent className="px-2">
            <div className="text-lg md:text-3xl font-bold text-[#EF4444] dark:text-[#F87171] break-words">
              {formatCurrency(stats.despesasMes)}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="col-span-3 border-none shadow-sm bg-white dark:bg-gray-900">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-lg font-semibold text-gray-900 dark:text-gray-100">Comparativo Mensal</CardTitle>
          <div className="relative">
            <Button 
              variant="ghost" 
              size="icon" 
              onClick={() => setShowFilter(!showFilter)} 
              className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
            >
              <Filter className="h-4 w-4" />
            </Button>
            {showFilter && (
              <div className="absolute right-0 mt-2 w-48 bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-100 dark:border-gray-700 z-10 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
                <div className="py-1">
                  {[3, 6, 12].map((months) => (
                    <button
                      key={months}
                      onClick={() => {
                        setMonthsFilter(months);
                        setShowFilter(false);
                      }}
                      className={`block w-full text-left px-4 py-2.5 text-sm transition-colors ${
                        monthsFilter === months 
                          ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400 font-medium' 
                          : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
                      }`}
                    >
                      Últimos {months} meses
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent className="pl-2">
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="currentColor" className="text-gray-200 dark:text-gray-800" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: 'currentColor', fontSize: 12 }} className="text-gray-500 dark:text-gray-400" dy={10} />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(value) => `R$ ${value}`}
                  tick={{ fill: 'currentColor', fontSize: 12 }}
                  className="text-gray-500 dark:text-gray-400"
                  dx={-10}
                />
                <Tooltip
                  formatter={(value: number) => formatCurrency(value)}
                  cursor={{ fill: 'currentColor', opacity: 0.1 }}
                  contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)', backgroundColor: 'var(--tw-colors-white)' }}
                />
                <Legend iconType="circle" wrapperStyle={{ paddingTop: '20px' }} />
                <Bar dataKey="Receitas" fill="#059568" radius={[6, 6, 0, 0]} maxBarSize={50} />
                <Bar dataKey="Despesas" fill="#EF4444" radius={[6, 6, 0, 0]} maxBarSize={50} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      <Modal
        isOpen={quickEntryOpen}
        onClose={() => {
          setQuickEntryOpen(false);
          setErrorMsg('');
        }}
        title="Registrar Abastecimento"
        className="max-w-lg"
      >
        <form onSubmit={handleQuickEntry} className="space-y-4">
          {errorMsg && (
            <div className="p-3 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-sm rounded-lg border border-red-100 dark:border-red-800/50">
              {errorMsg}
            </div>
          )}
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Veículo</label>
            <CustomSelect 
              value={quickVehicleId} 
              onChange={setQuickVehicleId}
              options={[
                { value: '', label: 'Selecione um veículo' },
                ...vehicles.map(v => ({ value: v.id, label: `${v.name} (${v.plate})` }))
              ]}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Valor Pago (R$)</label>
              <Input
                type="text"
                inputMode="decimal"
                value={quickValueStr}
                onChange={(e) => setQuickValueStr(formatCurrencyInput(e.target.value))}
                placeholder="R$ 0,00"
                required
                autoFocus
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Preço por Litro</label>
              <Input
                type="text"
                inputMode="decimal"
                value={quickPricePerLiterStr}
                onChange={(e) => setQuickPricePerLiterStr(formatCurrencyInput(e.target.value))}
                placeholder="R$ 0,00"
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">KM Atual</label>
            <Input
              type="number"
              inputMode="numeric"
              value={quickKM}
              onChange={(e) => {
                setQuickKM(e.target.value);
                setIsQuickOdometerManuallyEdited(true);
              }}
              placeholder="0"
              required
            />
          </div>

          <div className="pt-4">
            <Button 
              type="submit" 
              disabled={quickLoading}
              className="w-full bg-[#F59E0B] hover:bg-[#D97706] text-white"
            >
              {quickLoading ? 'Salvando...' : 'Confirmar Abastecimento'}
            </Button>
          </div>
        </form>
      </Modal>

      <Modal
        isOpen={performModalOpen}
        onClose={() => {
          setPerformModalOpen(false);
          setErrorMsg('');
        }}
        title="Realizar Manutenção"
        className="max-w-md"
      >
        <form onSubmit={handleConfirmPerform} className="space-y-4">
          {errorMsg && (
            <div className="p-3 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-sm rounded-lg border border-red-100 dark:border-red-800/50">
              {errorMsg}
            </div>
          )}
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Veículo e Serviço</label>
            <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-md border border-gray-200 dark:border-gray-700 text-sm font-medium text-gray-700 dark:text-gray-300">
              {performVehicle?.name} - {performManutencao?.tipo}
            </div>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Data da Manutenção *</label>
            <Input
              type="date"
              value={performDate}
              onChange={(e) => setPerformDate(e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">KM Atual *</label>
            <Input
              type="number"
              inputMode="numeric"
              value={performKm}
              onChange={(e) => setPerformKm(e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Valor Gasto (R$) *</label>
            <Input
              type="text"
              inputMode="decimal"
              placeholder="R$ 0,00"
              value={performValueStr}
              onChange={(e) => setPerformValueStr(formatCurrencyInput(e.target.value))}
              required
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Observação</label>
            <Input
              type="text"
              placeholder="Ex: Troca de óleo Motul e filtro"
              value={performObs}
              onChange={(e) => setPerformObs(e.target.value)}
            />
          </div>
          <div className="flex flex-col sm:flex-row justify-end pt-4 gap-2">
            <Button type="button" variant="outline" onClick={() => setPerformModalOpen(false)} className="w-full sm:w-auto">
              Cancelar
            </Button>
            <Button type="submit" disabled={performLoading} className="w-full sm:w-auto bg-[#059568] hover:bg-[#047857] text-white">
              {performLoading ? 'Salvando...' : 'Confirmar e Lançar'}
            </Button>
          </div>
        </form>
      </Modal>

      <PremiumModal
        isOpen={isPremiumModalOpen}
        onClose={() => setIsPremiumModalOpen(false)}
        featureName={premiumFeatureName}
      />
    </div>
  );
}
