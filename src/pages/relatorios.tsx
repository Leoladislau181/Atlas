import React, { useState, useMemo, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { formatCurrency, parseLocalDate } from '@/lib/utils';
import { Lancamento, Vehicle } from '@/types';
import { format, isWithinInterval, startOfMonth, endOfMonth, subMonths, eachMonthOfInterval } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { Filter, TrendingUp, TrendingDown, DollarSign, Wallet, ChevronDown, ChevronUp } from 'lucide-react';

interface RelatoriosProps {
  lancamentos: Lancamento[];
  vehicles: Vehicle[];
}

export function Relatorios({ lancamentos, vehicles }: RelatoriosProps) {
  const [filterType, setFilterType] = useState<'month' | 'custom'>('month');
  const [selectedMonth, setSelectedMonth] = useState(format(new Date(), 'yyyy-MM'));
  const [startDate, setStartDate] = useState(format(startOfMonth(new Date()), 'yyyy-MM-dd'));
  const [endDate, setEndDate] = useState(format(endOfMonth(new Date()), 'yyyy-MM-dd'));
  const [selectedVehicleId, setSelectedVehicleId] = useState<string>('all');
  const [showFilters, setShowFilters] = useState(false);
  const [chartMonthsFilter, setChartMonthsFilter] = useState<number>(6);
  const [showChartFilter, setShowChartFilter] = useState(false);

  useEffect(() => {
    if (window.innerWidth < 768) {
      setChartMonthsFilter(3);
    }
  }, []);

  const filteredLancamentos = useMemo(() => {
    let start: Date;
    let end: Date;

    if (filterType === 'month') {
      const [year, month] = selectedMonth.split('-');
      start = startOfMonth(new Date(Number(year), Number(month) - 1));
      end = endOfMonth(new Date(Number(year), Number(month) - 1));
    } else {
      start = parseLocalDate(startDate);
      end = parseLocalDate(endDate);
    }

    return lancamentos.filter((l) => {
      const data = parseLocalDate(l.data);
      const matchesDate = isWithinInterval(data, { start, end });
      const matchesVehicle = selectedVehicleId === 'all' || l.vehicle_id === selectedVehicleId;
      return matchesDate && matchesVehicle;
    });
  }, [lancamentos, filterType, selectedMonth, startDate, endDate, selectedVehicleId]);

  const stats = useMemo(() => {
    let receitas = 0;
    let despesas = 0;
    let saldoAcumulado = 0;
    const porCategoria: Record<string, { nome: string; valor: number; tipo: string }> = {};

    // Calculate accumulated balance up to the end date of the filter
    let endFilterDate: Date;
    if (filterType === 'month') {
      const [year, month] = selectedMonth.split('-');
      endFilterDate = endOfMonth(new Date(Number(year), Number(month) - 1));
    } else {
      endFilterDate = parseLocalDate(endDate);
    }

    lancamentos.forEach((l) => {
      const data = parseLocalDate(l.data);
      const matchesVehicle = selectedVehicleId === 'all' || l.vehicle_id === selectedVehicleId;
      
      if (data <= endFilterDate && matchesVehicle) {
        const valor = Number(l.valor);
        if (l.tipo === 'receita') saldoAcumulado += valor;
        else saldoAcumulado -= valor;
      }
    });

    filteredLancamentos.forEach((l) => {
      const valor = Number(l.valor);
      if (l.tipo === 'receita') {
        receitas += valor;
      } else {
        despesas += valor;
      }

      if (l.categorias) {
        if (!porCategoria[l.categorias.id]) {
          porCategoria[l.categorias.id] = {
            nome: l.categorias.nome,
            valor: 0,
            tipo: l.tipo,
          };
        }
        porCategoria[l.categorias.id].valor += valor;
      }
    });

    return {
      receitas,
      despesas,
      lucroLiquido: receitas - despesas,
      saldoAcumulado,
      porCategoria: Object.values(porCategoria).sort((a, b) => b.valor - a.valor),
    };
  }, [filteredLancamentos, lancamentos, filterType, selectedMonth, endDate, selectedVehicleId]);

  const chartData = useMemo(() => {
    const data = [];
    const now = new Date();
    for (let i = chartMonthsFilter - 1; i >= 0; i--) {
      const targetMonth = subMonths(now, i);
      const start = startOfMonth(targetMonth);
      const end = endOfMonth(targetMonth);
      
      let receitas = 0;
      let despesas = 0;

      lancamentos.forEach((l) => {
        const lDate = parseLocalDate(l.data);
        const matchesVehicle = selectedVehicleId === 'all' || l.vehicle_id === selectedVehicleId;
        
        if (isWithinInterval(lDate, { start, end }) && matchesVehicle) {
          if (l.tipo === 'receita') receitas += Number(l.valor);
          else despesas += Number(l.valor);
        }
      });

      data.push({
        name: format(targetMonth, 'MMM/yy', { locale: ptBR }).toUpperCase(),
        Receitas: receitas,
        Despesas: despesas,
      });
    }
    return data;
  }, [lancamentos, chartMonthsFilter, selectedVehicleId]);

  return (
    <div className="space-y-6">
      <Card className="border-none shadow-sm bg-white overflow-hidden">
        <div 
          className="p-4 flex items-center justify-between cursor-pointer hover:bg-gray-50 transition-colors"
          onClick={() => setShowFilters(!showFilters)}
        >
          <div className="flex items-center gap-3">
            <div className="p-2 bg-[#F59E0B]/10 rounded-lg">
              <Filter className="h-5 w-5 text-[#F59E0B]" />
            </div>
            <div>
              <h3 className="font-bold text-gray-900">Filtros de Relatório</h3>
              <p className="text-xs text-gray-500">
                {showFilters ? 'Ocultar filtros' : 'Clique para filtrar por período ou veículo'}
              </p>
            </div>
          </div>
          <button className="text-gray-400 hover:text-gray-600">
            {showFilters ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
          </button>
        </div>

        {showFilters && (
          <CardContent className="pt-6 border-t border-gray-100 animate-in fade-in slide-in-from-top-2 duration-200">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 items-end">
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700">Tipo de Filtro</label>
                <Select value={filterType} onChange={(e) => setFilterType(e.target.value as any)}>
                  <option value="month">Por Mês</option>
                  <option value="custom">Período Personalizado</option>
                </Select>
              </div>

              {filterType === 'month' ? (
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700">Mês</label>
                  <Input
                    type="month"
                    value={selectedMonth}
                    onChange={(e) => setSelectedMonth(e.target.value)}
                  />
                </div>
              ) : (
                <>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-gray-700">Data Inicial</label>
                    <Input
                      type="date"
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-gray-700">Data Final</label>
                    <Input
                      type="date"
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                    />
                  </div>
                </>
              )}

              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700">Veículo</label>
                <Select value={selectedVehicleId} onChange={(e) => setSelectedVehicleId(e.target.value)}>
                  <option value="all">Todos os Veículos</option>
                  {vehicles.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.name} ({v.plate})
                    </option>
                  ))}
                </Select>
              </div>
            </div>
          </CardContent>
        )}
      </Card>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card className="border-none shadow-sm bg-white hover:shadow-md transition-all duration-200 text-center">
          <CardHeader className="pb-2 flex flex-row items-center justify-center gap-2 space-y-0">
            <div className="p-2 bg-green-50 rounded-full">
              <TrendingUp className="h-4 w-4 text-[#059568]" />
            </div>
            <CardTitle className="text-sm font-medium text-gray-500">Total Receitas</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-[#059568]">
              {formatCurrency(stats.receitas)}
            </div>
          </CardContent>
        </Card>
        <Card className="border-none shadow-sm bg-white hover:shadow-md transition-all duration-200 text-center">
          <CardHeader className="pb-2 flex flex-row items-center justify-center gap-2 space-y-0">
            <div className="p-2 bg-red-50 rounded-full">
              <TrendingDown className="h-4 w-4 text-[#EF4444]" />
            </div>
            <CardTitle className="text-sm font-medium text-gray-500">Total Despesas</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-[#EF4444]">
              {formatCurrency(stats.despesas)}
            </div>
          </CardContent>
        </Card>
        <Card className="border-none shadow-sm bg-white hover:shadow-md transition-all duration-200 text-center">
          <CardHeader className="pb-2 flex flex-row items-center justify-center gap-2 space-y-0">
            <div className={`p-2 rounded-full ${stats.lucroLiquido >= 0 ? 'bg-green-50' : 'bg-red-50'}`}>
              <DollarSign className={`h-4 w-4 ${stats.lucroLiquido >= 0 ? 'text-[#059568]' : 'text-[#EF4444]'}`} />
            </div>
            <CardTitle className="text-sm font-medium text-gray-500">Lucro Líquido</CardTitle>
          </CardHeader>
          <CardContent>
            <div
              className={`text-2xl font-bold ${
                stats.lucroLiquido >= 0 ? 'text-[#059568]' : 'text-[#EF4444]'
              }`}
            >
              {formatCurrency(stats.lucroLiquido)}
            </div>
          </CardContent>
        </Card>
        <Card className="border-none shadow-sm bg-white hover:shadow-md transition-all duration-200 text-center">
          <CardHeader className="pb-2 flex flex-row items-center justify-center gap-2 space-y-0">
            <div className={`p-2 rounded-full ${stats.saldoAcumulado >= 0 ? 'bg-gray-100' : 'bg-red-50'}`}>
              <Wallet className={`h-4 w-4 ${stats.saldoAcumulado >= 0 ? 'text-gray-900' : 'text-[#EF4444]'}`} />
            </div>
            <CardTitle className="text-sm font-medium text-gray-500">Saldo Acumulado</CardTitle>
          </CardHeader>
          <CardContent>
            <div
              className={`text-2xl font-bold ${
                stats.saldoAcumulado >= 0 ? 'text-gray-900' : 'text-[#EF4444]'
              }`}
            >
              {formatCurrency(stats.saldoAcumulado)}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="border-none shadow-sm bg-white">
          <CardHeader className="border-b border-gray-50 pb-4">
            <CardTitle className="text-lg">Despesas por Categoria</CardTitle>
          </CardHeader>
          <CardContent className="pt-6">
            <div className="space-y-4">
              {stats.porCategoria.filter((c) => c.tipo === 'despesa').length === 0 ? (
                <p className="text-sm text-gray-500 text-center py-4 bg-gray-50 rounded-lg border border-dashed">Nenhuma despesa no período.</p>
              ) : (
                stats.porCategoria
                  .filter((c) => c.tipo === 'despesa')
                  .map((cat, index) => (
                    <div key={index} className="flex items-center justify-between p-3 rounded-xl hover:bg-gray-50 transition-colors border border-transparent hover:border-gray-100">
                      <span className="text-sm font-medium text-gray-700">{cat.nome}</span>
                      <span className="text-sm font-bold text-[#EF4444]">
                        {formatCurrency(cat.valor)}
                      </span>
                    </div>
                  ))
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="border-none shadow-sm bg-white">
          <CardHeader className="border-b border-gray-50 pb-4">
            <CardTitle className="text-lg">Receitas por Categoria</CardTitle>
          </CardHeader>
          <CardContent className="pt-6">
            <div className="space-y-4">
              {stats.porCategoria.filter((c) => c.tipo === 'receita').length === 0 ? (
                <p className="text-sm text-gray-500 text-center py-4 bg-gray-50 rounded-lg border border-dashed">Nenhuma receita no período.</p>
              ) : (
                stats.porCategoria
                  .filter((c) => c.tipo === 'receita')
                  .map((cat, index) => (
                    <div key={index} className="flex items-center justify-between p-3 rounded-xl hover:bg-gray-50 transition-colors border border-transparent hover:border-gray-100">
                      <span className="text-sm font-medium text-gray-700">{cat.nome}</span>
                      <span className="text-sm font-bold text-[#059568]">
                        {formatCurrency(cat.valor)}
                      </span>
                    </div>
                  ))
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="border-none shadow-sm bg-white">
        <CardHeader className="border-b border-gray-50 pb-4 flex flex-row items-center justify-between">
          <CardTitle className="text-lg">Comparativo Mensal</CardTitle>
          <div className="relative">
            <Button 
              variant="ghost" 
              size="icon" 
              onClick={() => setShowChartFilter(!showChartFilter)} 
              className="text-gray-400 hover:text-gray-600 hover:bg-gray-100"
            >
              <Filter className="h-4 w-4" />
            </Button>
            {showChartFilter && (
              <div className="absolute right-0 mt-2 w-48 bg-white rounded-xl shadow-lg border border-gray-100 z-10 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
                <div className="py-1">
                  {[1, 3, 6, 12].map((months) => (
                    <button
                      key={months}
                      onClick={() => {
                        setChartMonthsFilter(months);
                        setShowChartFilter(false);
                      }}
                      className={`block w-full text-left px-4 py-2.5 text-sm transition-colors ${
                        chartMonthsFilter === months 
                          ? 'bg-blue-50 text-blue-700 font-medium' 
                          : 'text-gray-700 hover:bg-gray-50'
                      }`}
                    >
                      Últimos {months} {months === 1 ? 'mês' : 'meses'}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent className="pt-6">
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#6B7280', fontSize: 12 }} dy={10} />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(value) => `R$ ${value}`}
                  tick={{ fill: '#6B7280', fontSize: 12 }}
                  dx={-10}
                />
                <Tooltip
                  formatter={(value: number) => formatCurrency(value)}
                  cursor={{ fill: '#F3F4F6', opacity: 0.4 }}
                  contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)' }}
                />
                <Legend iconType="circle" wrapperStyle={{ paddingTop: '20px' }} />
                <Bar dataKey="Receitas" fill="#059568" radius={[6, 6, 0, 0]} maxBarSize={50} />
                <Bar dataKey="Despesas" fill="#EF4444" radius={[6, 6, 0, 0]} maxBarSize={50} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
