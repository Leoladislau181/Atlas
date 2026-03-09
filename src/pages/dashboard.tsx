import React, { useMemo, useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { formatCurrency, parseLocalDate } from '@/lib/utils';
import { Lancamento } from '@/types';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { startOfMonth, endOfMonth, isWithinInterval, format, subMonths } from 'date-fns';
import { ptBR } from 'date-fns/locale';

import { ArrowUpCircle, ArrowDownCircle, DollarSign, Wallet, Filter } from 'lucide-react';

interface DashboardProps {
  lancamentos: Lancamento[];
}

export function Dashboard({ lancamentos }: DashboardProps) {
  const now = new Date();
  const start = startOfMonth(now);
  const end = endOfMonth(now);

  const [monthsFilter, setMonthsFilter] = useState<number>(6);
  const [showFilter, setShowFilter] = useState(false);

  useEffect(() => {
    // Set default based on screen size on initial load
    if (window.innerWidth < 768) {
      setMonthsFilter(3);
    }
  }, []);

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

  return (
    <div className="space-y-6">
      <div className="grid gap-6 md:grid-cols-3">
        <Card className="border-none shadow-sm hover:shadow-md transition-all duration-200 text-center">
          <CardHeader className="flex flex-row items-center justify-center gap-2 space-y-0 pb-2">
            <ArrowUpCircle className="h-4 w-4 text-[#059568]" />
            <CardTitle className="text-sm font-medium text-gray-500">Receitas do Mês</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-[#059568]">
              {formatCurrency(stats.receitasMes)}
            </div>
          </CardContent>
        </Card>

        <Card className="border-none shadow-sm hover:shadow-md transition-all duration-200 text-center">
          <CardHeader className="flex flex-row items-center justify-center gap-2 space-y-0 pb-2">
            <ArrowDownCircle className="h-4 w-4 text-[#EF4444]" />
            <CardTitle className="text-sm font-medium text-gray-500">Despesas do Mês</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-[#EF4444]">
              {formatCurrency(stats.despesasMes)}
            </div>
          </CardContent>
        </Card>

        <Card className="border-none shadow-sm hover:shadow-md transition-all duration-200 text-center">
          <CardHeader className="flex flex-row items-center justify-center gap-2 space-y-0 pb-2">
            <DollarSign className={`h-4 w-4 ${stats.lucroLiquido >= 0 ? 'text-[#059568]' : 'text-[#EF4444]'}`} />
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
      </div>

      <Card className="col-span-3 border-none shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-lg font-semibold text-gray-900">Comparativo Mensal</CardTitle>
          <div className="relative">
            <Button 
              variant="ghost" 
              size="icon" 
              onClick={() => setShowFilter(!showFilter)} 
              className="text-gray-400 hover:text-gray-600 hover:bg-gray-100"
            >
              <Filter className="h-4 w-4" />
            </Button>
            {showFilter && (
              <div className="absolute right-0 mt-2 w-48 bg-white rounded-xl shadow-lg border border-gray-100 z-10 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
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
                          ? 'bg-blue-50 text-blue-700 font-medium' 
                          : 'text-gray-700 hover:bg-gray-50'
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
