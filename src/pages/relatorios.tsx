import React, { useState, useMemo, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { formatCurrency, parseLocalDate } from '@/lib/utils';
import { Lancamento, Vehicle, User } from '@/types';
import { format, isWithinInterval, startOfMonth, endOfMonth, subMonths, eachMonthOfInterval } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { Filter, TrendingUp, TrendingDown, DollarSign, Wallet, ChevronDown, ChevronUp, FileText, Download } from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

interface RelatoriosProps {
  lancamentos: Lancamento[];
  vehicles: Vehicle[];
  user: User;
}

export function Relatorios({ lancamentos, vehicles, user }: RelatoriosProps) {
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

  const exportToPDF = async () => {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    
    // Header
    doc.setFillColor(245, 158, 11); // #F59E0B
    doc.rect(0, 0, pageWidth, 40, 'F');
    
    // User Photo as Logo in PDF
    if (user.foto_url) {
      try {
        const img = new Image();
        img.src = user.foto_url;
        img.crossOrigin = "Anonymous";
        await new Promise((resolve, reject) => {
          img.onload = resolve;
          img.onerror = reject;
        });
        doc.addImage(img, 'JPEG', 15, 5, 30, 30);
      } catch (e) {
        console.error("Error adding image to PDF", e);
      }
    }

    doc.setTextColor(255, 255, 255);
    doc.setFontSize(22);
    doc.text('Atlas Financeiro', 55, 20);
    doc.setFontSize(12);
    doc.text(`Relatório de: ${user.nome || user.email}`, 55, 30);
    
    doc.setTextColor(100, 100, 100);
    doc.setFontSize(10);
    const periodText = filterType === 'month' 
      ? `Período: ${format(parseLocalDate(selectedMonth + '-01'), 'MMMM yyyy', { locale: ptBR })}`
      : `Período: ${format(parseLocalDate(startDate), 'dd/MM/yyyy')} até ${format(parseLocalDate(endDate), 'dd/MM/yyyy')}`;
    doc.text(periodText, 15, 50);
    
    if (selectedVehicleId !== 'all') {
      const vehicle = vehicles.find(v => v.id === selectedVehicleId);
      doc.text(`Veículo: ${vehicle?.name} (${vehicle?.plate})`, 15, 55);
    }

    // Stats Table
    autoTable(doc, {
      startY: 65,
      head: [['Resumo Financeiro', 'Valor']],
      body: [
        ['Total Receitas', formatCurrency(stats.receitas)],
        ['Total Despesas', formatCurrency(stats.despesas)],
        ['Lucro Líquido', formatCurrency(stats.lucroLiquido)],
        ['Saldo Acumulado', formatCurrency(stats.saldoAcumulado)],
      ],
      theme: 'striped',
      headStyles: { fillColor: [245, 158, 11] },
    });

    // Transactions Table
    const tableData = filteredLancamentos.map(l => [
      format(parseLocalDate(l.data), 'dd/MM/yyyy'),
      l.descricao,
      l.categorias?.nome || '-',
      l.tipo.toUpperCase(),
      formatCurrency(Number(l.valor))
    ]);

    autoTable(doc, {
      startY: (doc as any).lastAutoTable.finalY + 15,
      head: [['Data', 'Descrição', 'Categoria', 'Tipo', 'Valor']],
      body: tableData,
      theme: 'grid',
      headStyles: { fillColor: [55, 65, 81] },
      columnStyles: {
        4: { halign: 'right' }
      }
    });

    doc.save(`relatorio-financeiro-${format(new Date(), 'yyyy-MM-dd')}.pdf`);
  };

  return (
    <div className="space-y-6">
      <Card className="border-none shadow-sm bg-white dark:bg-gray-900 overflow-hidden">
        <div 
          className="p-4 flex items-center justify-between cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
          onClick={() => setShowFilters(!showFilters)}
        >
          <div className="flex items-center gap-3">
            <div className="p-2 bg-[#F59E0B]/10 rounded-lg">
              <Filter className="h-5 w-5 text-[#F59E0B]" />
            </div>
            <div>
              <h3 className="font-bold text-gray-900 dark:text-gray-100">Filtros de Relatório</h3>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {showFilters ? 'Ocultar filtros' : 'Clique para filtrar por período ou veículo'}
              </p>
            </div>
          </div>
          <button className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
            {showFilters ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
          </button>
        </div>

        {showFilters && (
          <CardContent className="pt-6 border-t border-gray-100 dark:border-gray-800 animate-in fade-in slide-in-from-top-2 duration-200">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 items-end">
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Tipo de Filtro</label>
                <Select value={filterType} onChange={(e) => setFilterType(e.target.value as any)}>
                  <option value="month">Por Mês</option>
                  <option value="custom">Período Personalizado</option>
                </Select>
              </div>

              {filterType === 'month' ? (
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Mês</label>
                  <Input
                    type="month"
                    value={selectedMonth}
                    onChange={(e) => setSelectedMonth(e.target.value)}
                  />
                </div>
              ) : (
                <>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Data Inicial</label>
                    <Input
                      type="date"
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Data Final</label>
                    <Input
                      type="date"
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                    />
                  </div>
                </>
              )}

              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Veículo</label>
                <Select value={selectedVehicleId} onChange={(e) => setSelectedVehicleId(e.target.value)}>
                  <option value="all">Todos os Veículos</option>
                  {vehicles.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.name} ({v.plate})
                    </option>
                  ))}
                </Select>
              </div>

              <div className="sm:col-span-2 lg:col-span-1">
                <Button 
                  onClick={exportToPDF}
                  className="w-full bg-[#F59E0B] hover:bg-[#D97706] text-white flex items-center justify-center gap-2"
                >
                  <Download className="h-4 w-4" />
                  Exportar PDF
                </Button>
              </div>
            </div>
          </CardContent>
        )}
      </Card>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card className="border-none shadow-sm bg-white dark:bg-gray-900 hover:shadow-md transition-all duration-200 text-center">
          <CardHeader className="pb-2 flex flex-row items-center justify-center gap-2 space-y-0">
            <div className="p-2 bg-green-50 dark:bg-[#059568]/20 rounded-full">
              <TrendingUp className="h-4 w-4 text-[#059568] dark:text-[#10B981]" />
            </div>
            <CardTitle className="text-sm font-medium text-gray-500 dark:text-gray-400">Total Receitas</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-[#059568] dark:text-[#10B981]">
              {formatCurrency(stats.receitas)}
            </div>
          </CardContent>
        </Card>
        <Card className="border-none shadow-sm bg-white dark:bg-gray-900 hover:shadow-md transition-all duration-200 text-center">
          <CardHeader className="pb-2 flex flex-row items-center justify-center gap-2 space-y-0">
            <div className="p-2 bg-red-50 dark:bg-[#EF4444]/20 rounded-full">
              <TrendingDown className="h-4 w-4 text-[#EF4444] dark:text-[#F87171]" />
            </div>
            <CardTitle className="text-sm font-medium text-gray-500 dark:text-gray-400">Total Despesas</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-[#EF4444] dark:text-[#F87171]">
              {formatCurrency(stats.despesas)}
            </div>
          </CardContent>
        </Card>
        <Card className="border-none shadow-sm bg-white dark:bg-gray-900 hover:shadow-md transition-all duration-200 text-center">
          <CardHeader className="pb-2 flex flex-row items-center justify-center gap-2 space-y-0">
            <div className={`p-2 rounded-full ${stats.lucroLiquido >= 0 ? 'bg-green-50 dark:bg-[#059568]/20' : 'bg-red-50 dark:bg-[#EF4444]/20'}`}>
              <DollarSign className={`h-4 w-4 ${stats.lucroLiquido >= 0 ? 'text-[#059568] dark:text-[#10B981]' : 'text-[#EF4444] dark:text-[#F87171]'}`} />
            </div>
            <CardTitle className="text-sm font-medium text-gray-500 dark:text-gray-400">Lucro Líquido</CardTitle>
          </CardHeader>
          <CardContent>
            <div
              className={`text-2xl font-bold ${
                stats.lucroLiquido >= 0 ? 'text-[#059568] dark:text-[#10B981]' : 'text-[#EF4444] dark:text-[#F87171]'
              }`}
            >
              {formatCurrency(stats.lucroLiquido)}
            </div>
          </CardContent>
        </Card>
        <Card className="border-none shadow-sm bg-white dark:bg-gray-900 hover:shadow-md transition-all duration-200 text-center">
          <CardHeader className="pb-2 flex flex-row items-center justify-center gap-2 space-y-0">
            <div className={`p-2 rounded-full ${stats.saldoAcumulado >= 0 ? 'bg-gray-100 dark:bg-gray-800' : 'bg-red-50 dark:bg-[#EF4444]/20'}`}>
              <Wallet className={`h-4 w-4 ${stats.saldoAcumulado >= 0 ? 'text-gray-900 dark:text-gray-100' : 'text-[#EF4444] dark:text-[#F87171]'}`} />
            </div>
            <CardTitle className="text-sm font-medium text-gray-500 dark:text-gray-400">Saldo Acumulado</CardTitle>
          </CardHeader>
          <CardContent>
            <div
              className={`text-2xl font-bold ${
                stats.saldoAcumulado >= 0 ? 'text-gray-900 dark:text-gray-100' : 'text-[#EF4444] dark:text-[#F87171]'
              }`}
            >
              {formatCurrency(stats.saldoAcumulado)}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="border-none shadow-sm bg-white dark:bg-gray-900">
          <CardHeader className="border-b border-gray-50 dark:border-gray-800 pb-4">
            <CardTitle className="text-lg text-gray-900 dark:text-gray-100">Despesas por Categoria</CardTitle>
          </CardHeader>
          <CardContent className="pt-6">
            <div className="space-y-4">
              {stats.porCategoria.filter((c) => c.tipo === 'despesa').length === 0 ? (
                <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-4 bg-gray-50 dark:bg-gray-800/50 rounded-lg border border-dashed dark:border-gray-700">Nenhuma despesa no período.</p>
              ) : (
                stats.porCategoria
                  .filter((c) => c.tipo === 'despesa')
                  .map((cat, index) => (
                    <div key={index} className="flex items-center justify-between p-3 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors border border-transparent hover:border-gray-100 dark:hover:border-gray-700">
                      <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{cat.nome}</span>
                      <span className="text-sm font-bold text-[#EF4444] dark:text-[#F87171]">
                        {formatCurrency(cat.valor)}
                      </span>
                    </div>
                  ))
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="border-none shadow-sm bg-white dark:bg-gray-900">
          <CardHeader className="border-b border-gray-50 dark:border-gray-800 pb-4">
            <CardTitle className="text-lg text-gray-900 dark:text-gray-100">Receitas por Categoria</CardTitle>
          </CardHeader>
          <CardContent className="pt-6">
            <div className="space-y-4">
              {stats.porCategoria.filter((c) => c.tipo === 'receita').length === 0 ? (
                <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-4 bg-gray-50 dark:bg-gray-800/50 rounded-lg border border-dashed dark:border-gray-700">Nenhuma receita no período.</p>
              ) : (
                stats.porCategoria
                  .filter((c) => c.tipo === 'receita')
                  .map((cat, index) => (
                    <div key={index} className="flex items-center justify-between p-3 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors border border-transparent hover:border-gray-100 dark:hover:border-gray-700">
                      <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{cat.nome}</span>
                      <span className="text-sm font-bold text-[#059568] dark:text-[#10B981]">
                        {formatCurrency(cat.valor)}
                      </span>
                    </div>
                  ))
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="border-none shadow-sm bg-white dark:bg-gray-900">
        <CardHeader className="border-b border-gray-50 dark:border-gray-800 pb-4 flex flex-row items-center justify-between">
          <CardTitle className="text-lg text-gray-900 dark:text-gray-100">Comparativo Mensal</CardTitle>
          <div className="relative">
            <Button 
              variant="ghost" 
              size="icon" 
              onClick={() => setShowChartFilter(!showChartFilter)} 
              className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
            >
              <Filter className="h-4 w-4" />
            </Button>
            {showChartFilter && (
              <div className="absolute right-0 mt-2 w-48 bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-100 dark:border-gray-700 z-10 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
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
                          ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400 font-medium' 
                          : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
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
                  itemStyle={{ color: 'var(--tw-colors-gray-900)' }}
                  labelStyle={{ color: 'var(--tw-colors-gray-500)', marginBottom: '8px' }}
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
