import React, { useState, useMemo, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { formatCurrency, parseLocalDate, isPremium } from '@/lib/utils';
import { Lancamento, Vehicle, User } from '@/types';
import { format, isWithinInterval, startOfMonth, endOfMonth, subMonths, eachMonthOfInterval, differenceInDays, addDays, isSameDay, startOfYear, endOfYear } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { Filter, TrendingUp, TrendingDown, DollarSign, Wallet, ChevronDown, ChevronUp, FileText, Download, FileSpreadsheet, FileJson, MessageSquare } from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import html2canvas from 'html2canvas';
import { Modal } from '@/components/ui/modal';

interface RelatoriosProps {
  lancamentos: Lancamento[];
  vehicles: Vehicle[];
  user: User;
}

export function Relatorios({ lancamentos, vehicles, user }: RelatoriosProps) {
  const [filterType, setFilterType] = useState<'month' | 'year' | 'custom'>('month');
  const [selectedMonth, setSelectedMonth] = useState(format(new Date(), 'yyyy-MM'));
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear().toString());
  const [startDate, setStartDate] = useState(format(startOfMonth(new Date()), 'yyyy-MM-dd'));
  const [endDate, setEndDate] = useState(format(endOfMonth(new Date()), 'yyyy-MM-dd'));
  const [selectedVehicleId, setSelectedVehicleId] = useState<string>('all');
  const [showFilters, setShowFilters] = useState(false);
  const [chartMonthsFilter, setChartMonthsFilter] = useState<number>(6);
  const [showChartFilter, setShowChartFilter] = useState(false);
  const [exportNotes, setExportNotes] = useState('');
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [exportLoading, setExportLoading] = useState(false);

  const chartRef = React.useRef<HTMLDivElement>(null);
  const reportChartRef = React.useRef<HTMLDivElement>(null);

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
    } else if (filterType === 'year') {
      start = startOfYear(new Date(Number(selectedYear), 0));
      end = endOfYear(new Date(Number(selectedYear), 0));
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
    const porVeiculo: Record<string, { nome: string; placa: string; receitas: number; despesas: number; saldo: number }> = {};

    // Calculate accumulated balance up to the end date of the filter
    let endFilterDate: Date;
    if (filterType === 'month') {
      const [year, month] = selectedMonth.split('-');
      endFilterDate = endOfMonth(new Date(Number(year), Number(month) - 1));
    } else if (filterType === 'year') {
      endFilterDate = endOfYear(new Date(Number(selectedYear), 0));
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

      if (l.vehicle_id && l.vehicles) {
        if (!porVeiculo[l.vehicle_id]) {
          porVeiculo[l.vehicle_id] = {
            nome: l.vehicles.name,
            placa: l.vehicles.plate || '',
            receitas: 0,
            despesas: 0,
            saldo: 0
          };
        }
        if (l.tipo === 'receita') {
          porVeiculo[l.vehicle_id].receitas += valor;
          porVeiculo[l.vehicle_id].saldo += valor;
        } else {
          porVeiculo[l.vehicle_id].despesas += valor;
          porVeiculo[l.vehicle_id].saldo -= valor;
        }
      }
    });

    return {
      receitas,
      despesas,
      lucroLiquido: receitas - despesas,
      saldoAcumulado,
      porCategoria: Object.values(porCategoria).sort((a, b) => b.valor - a.valor),
      porCategoriaRaw: porCategoria,
      porVeiculo: Object.values(porVeiculo).sort((a, b) => b.saldo - a.saldo)
    };
  }, [filteredLancamentos, lancamentos, filterType, selectedMonth, selectedYear, endDate, selectedVehicleId]);

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

  const reportChartData = useMemo(() => {
    let start: Date;
    let end: Date;
    
    if (filterType === 'month') {
      const [year, month] = selectedMonth.split('-');
      start = startOfMonth(new Date(Number(year), Number(month) - 1));
      end = endOfMonth(new Date(Number(year), Number(month) - 1));
    } else if (filterType === 'year') {
      start = startOfYear(new Date(Number(selectedYear), 0));
      end = endOfYear(new Date(Number(selectedYear), 0));
    } else {
      start = parseLocalDate(startDate);
      end = parseLocalDate(endDate);
    }

    const now = new Date();
    // Se o período selecionado inclui o dia de hoje, usamos o dia de hoje para decidir a granularidade (ex: 11 dias de Março)
    const isCurrentPeriod = isWithinInterval(now, { start, end });
    const effectiveEndForGranularity = isCurrentPeriod ? now : end;
    const daysCount = differenceInDays(effectiveEndForGranularity, start) + 1;
    
    const data: any[] = [];

    if (daysCount <= 6) {
      // Daily
      for (let i = 0; i < daysCount; i++) {
        const targetDate = addDays(start, i);
        let receitas = 0;
        let despesas = 0;
        filteredLancamentos.forEach(l => {
          if (isSameDay(parseLocalDate(l.data), targetDate)) {
            if (l.tipo === 'receita') receitas += Number(l.valor);
            else despesas += Number(l.valor);
          }
        });
        data.push({
          name: format(targetDate, 'dd/MM'),
          Receitas: receitas,
          Despesas: despesas
        });
      }
    } else if (daysCount <= 20) {
      // Weekly
      const weeksCount = Math.ceil(daysCount / 7);
      for (let i = 0; i < weeksCount; i++) {
        const weekStart = addDays(start, i * 7);
        const weekEnd = addDays(weekStart, 6) > end ? end : addDays(weekStart, 6);
        let receitas = 0;
        let despesas = 0;
        filteredLancamentos.forEach(l => {
          const lDate = parseLocalDate(l.data);
          if (isWithinInterval(lDate, { start: weekStart, end: weekEnd })) {
            if (l.tipo === 'receita') receitas += Number(l.valor);
            else despesas += Number(l.valor);
          }
        });
        data.push({
          name: `Semana ${i + 1}`,
          Receitas: receitas,
          Despesas: despesas
        });
      }
    } else {
      // Fortnightly (Quinzena)
      const midPoint = addDays(start, 14);
      
      let r1 = 0, d1 = 0, r2 = 0, d2 = 0;
      filteredLancamentos.forEach(l => {
        const lDate = parseLocalDate(l.data);
        if (lDate <= midPoint) {
          if (l.tipo === 'receita') r1 += Number(l.valor);
          else d1 += Number(l.valor);
        } else {
          if (l.tipo === 'receita') r2 += Number(l.valor);
          else d2 += Number(l.valor);
        }
      });
      
      data.push({ name: '1ª Quinzena', Receitas: r1, Despesas: d1 });
      data.push({ name: '2ª Quinzena', Receitas: r2, Despesas: d2 });
    }

    return data;
  }, [filteredLancamentos, filterType, selectedMonth, startDate, endDate]);

  const exportToPDF = async () => {
    setExportLoading(true);
    try {
      const doc = new jsPDF();
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      
      // Header
      doc.setFillColor(245, 158, 11); // #F59E0B
      doc.rect(0, 0, pageWidth, 45, 'F');
      
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
          doc.addImage(img, 'JPEG', 15, 7, 30, 30);
        } catch (e) {
          console.error("Error adding image to PDF", e);
        }
      }

      doc.setTextColor(255, 255, 255);
      doc.setFontSize(22);
      doc.text('Atlas Financeiro', 55, 22);
      doc.setFontSize(12);
      doc.text(`Relatório de: ${user.nome || user.email}`, 55, 32);
      
      doc.setTextColor(100, 100, 100);
      doc.setFontSize(10);
      const periodText = filterType === 'month' 
        ? `Período: ${format(parseLocalDate(selectedMonth + '-01'), 'MMMM yyyy', { locale: ptBR })}`
        : `Período: ${format(parseLocalDate(startDate), 'dd/MM/yyyy')} até ${format(parseLocalDate(endDate), 'dd/MM/yyyy')}`;
      
      doc.text(periodText, 15, 55);
      
      let currentY = 60;
      if (selectedVehicleId !== 'all') {
        const vehicle = vehicles.find(v => v.id === selectedVehicleId);
        doc.text(`Veículo: ${vehicle?.name} (${vehicle?.plate})`, 15, currentY);
        currentY += 5;
      }

      // Add Export Notes if any
      if (exportNotes) {
        doc.setFontSize(9);
        doc.setFont('helvetica', 'italic');
        const splitNotes = doc.splitTextToSize(`Observações: ${exportNotes}`, pageWidth - 30);
        doc.text(splitNotes, 15, currentY + 5);
        currentY += (splitNotes.length * 5) + 10;
      } else {
        currentY += 10;
      }

      // Add Chart to PDF FIRST
      if (reportChartRef.current) {
        try {
          const canvas = await html2canvas(reportChartRef.current, {
            scale: 3, // Higher scale for better quality (less "print" look)
            backgroundColor: '#ffffff',
            logging: false,
            useCORS: true,
            onclone: (clonedDoc) => {
              // Force a clean white background for the chart capture
              const chartContainer = clonedDoc.getElementById('report-chart-container');
              if (chartContainer) {
                chartContainer.style.backgroundColor = '#ffffff';
                chartContainer.style.color = '#111827';
                chartContainer.style.padding = '20px';
                chartContainer.style.borderRadius = '0px';
                chartContainer.style.boxShadow = 'none';
              }
              
              // The html2canvas parser fails on oklch() in the CSS.
              const styleTags = clonedDoc.getElementsByTagName('style');
              for (let i = 0; i < styleTags.length; i++) {
                try {
                  styleTags[i].innerHTML = styleTags[i].innerHTML.replace(/oklch\([^)]+\)/g, '#71717a');
                } catch (e) {
                  console.warn("Could not sanitize style tag", e);
                }
              }
              
              const linkTags = clonedDoc.getElementsByTagName('link');
              for (let i = 0; i < linkTags.length; i++) {
                if (linkTags[i].rel === 'stylesheet') {
                  linkTags[i].remove();
                }
              }

              const elements = clonedDoc.getElementsByTagName('*');
              for (let i = 0; i < elements.length; i++) {
                const el = elements[i] as HTMLElement;
                
                // Force dark text and remove dark mode classes for the capture
                if (el.classList) {
                  el.classList.remove('dark');
                  el.classList.remove('dark:bg-gray-900');
                  el.classList.remove('dark:text-gray-400');
                  el.classList.remove('bg-white');
                  el.classList.remove('dark:bg-gray-800');
                }

                if (el.style) {
                  for (let j = 0; j < el.style.length; j++) {
                    const prop = el.style[j];
                    const val = el.style.getPropertyValue(prop);
                    if (val && val.includes('oklch')) {
                      el.style.setProperty(prop, '#71717a');
                    }
                  }
                }
              }
            }
          });
          const imgData = canvas.toDataURL('image/png');
          
          // Check if we need a new page for the chart
          if (currentY + 80 > pageHeight) {
            doc.addPage();
            currentY = 20;
          }

          doc.setFontSize(14);
          doc.text('Comparativo do Período', 15, currentY);
          
          // Add a subtle border around the chart image
          doc.setDrawColor(240, 240, 240);
          doc.rect(15, currentY + 5, pageWidth - 30, 70);
          
          doc.addImage(imgData, 'PNG', 15, currentY + 5, pageWidth - 30, 70);
          currentY += 85;
        } catch (e) {
          console.error("Error adding chart to PDF", e);
        }
      }

      // Stats Table
      autoTable(doc, {
        startY: currentY,
        head: [['Resumo Financeiro', 'Valor']],
        body: [
          ['Total Receitas', formatCurrency(stats.receitas)],
          ['Total Despesas', formatCurrency(stats.despesas)],
          ['Lucro Líquido', formatCurrency(stats.lucroLiquido)],
          ['Saldo Acumulado', formatCurrency(stats.saldoAcumulado)],
        ],
        theme: 'striped',
        headStyles: { fillColor: [245, 158, 11] },
        columnStyles: {
          1: { halign: 'right', fontStyle: 'bold' }
        }
      });

      currentY = (doc as any).lastAutoTable.finalY + 15;

      // Category Summary Table
      doc.setFontSize(14);
      doc.setTextColor(55, 65, 81);
      doc.text('Resumo por Categoria', 15, currentY);
      
      const categoryData = stats.porCategoria.map(c => [
        c.nome,
        c.tipo === 'receita' ? 'Receita' : 'Despesa',
        formatCurrency(c.valor)
      ]);

      autoTable(doc, {
        startY: currentY + 5,
        head: [['Categoria', 'Tipo', 'Total']],
        body: categoryData,
        theme: 'grid',
        headStyles: { fillColor: [107, 114, 128] },
        columnStyles: {
          2: { halign: 'right' }
        },
        didParseCell: (data) => {
          if (data.section === 'body' && data.column.index === 1) {
            if (data.cell.text[0] === 'Receita') {
              data.cell.styles.textColor = [5, 149, 104];
            } else {
              data.cell.styles.textColor = [239, 68, 68];
            }
          }
        }
      });

      currentY = (doc as any).lastAutoTable.finalY + 15;

      // Vehicle Summary Table
      if (stats.porVeiculo.length > 0) {
        if (currentY + 40 > pageHeight) {
          doc.addPage();
          currentY = 20;
        }

        doc.setFontSize(14);
        doc.setTextColor(55, 65, 81);
        doc.text('Resumo por Veículo', 15, currentY);
        
        const vehicleData = stats.porVeiculo.map(v => [
          v.nome + (v.placa ? ` (${v.placa})` : ''),
          formatCurrency(v.receitas),
          formatCurrency(v.despesas),
          formatCurrency(v.saldo)
        ]);

        autoTable(doc, {
          startY: currentY + 5,
          head: [['Veículo', 'Receitas', 'Despesas', 'Saldo']],
          body: vehicleData,
          theme: 'grid',
          headStyles: { fillColor: [107, 114, 128] },
          columnStyles: {
            1: { halign: 'right' },
            2: { halign: 'right' },
            3: { halign: 'right', fontStyle: 'bold' }
          },
          didParseCell: (data) => {
            if (data.section === 'body' && data.column.index === 3) {
              const rawValue = data.cell.raw as string;
              if (!rawValue.includes('-') && rawValue !== 'R$ 0,00') {
                data.cell.styles.textColor = [5, 149, 104];
              } else if (rawValue.includes('-')) {
                data.cell.styles.textColor = [239, 68, 68];
              }
            }
          }
        });

        currentY = (doc as any).lastAutoTable.finalY + 15;
      }

      // Transactions Table
      if (currentY + 40 > pageHeight) {
        doc.addPage();
        currentY = 20;
      }

      doc.setFontSize(14);
      doc.text('Detalhamento de Transações', 15, currentY);

      const tableData = filteredLancamentos.map(l => [
        format(parseLocalDate(l.data), 'dd/MM/yyyy'),
        l.observacao || '-',
        l.categorias?.nome || '-',
        l.vehicles?.name || '-',
        l.tipo === 'receita' ? 'RECEITA' : 'DESPESA',
        formatCurrency(Number(l.valor))
      ]);

      autoTable(doc, {
        startY: currentY + 5,
        head: [['Data', 'Descrição', 'Categoria', 'Veículo', 'Tipo', 'Valor']],
        body: tableData,
        theme: 'grid',
        headStyles: { fillColor: [55, 65, 81] },
        columnStyles: {
          5: { halign: 'right' }
        },
        didParseCell: (data) => {
          if (data.section === 'body' && data.column.index === 4) {
            if (data.cell.text[0] === 'RECEITA') {
              data.cell.styles.textColor = [5, 149, 104];
            } else {
              data.cell.styles.textColor = [239, 68, 68];
            }
          }
        }
      });

      // Footer with page numbers
      const totalPages = (doc as any).internal.getNumberOfPages();
      for (let i = 1; i <= totalPages; i++) {
        doc.setPage(i);
        doc.setFontSize(8);
        doc.setTextColor(150, 150, 150);
        doc.text(
          `Gerado em ${format(new Date(), 'dd/MM/yyyy HH:mm')} - Atlas Financeiro`,
          15,
          pageHeight - 10
        );
        doc.text(
          `Página ${i} de ${totalPages}`,
          pageWidth - 30,
          pageHeight - 10
        );
      }

      doc.save(`relatorio-financeiro-${format(new Date(), 'yyyy-MM-dd')}.pdf`);
      setIsExportModalOpen(false);
    } catch (error) {
      console.error("Export error:", error);
      alert("Erro ao exportar PDF.");
    } finally {
      setExportLoading(false);
    }
  };


  const exportToExcel = (fileFormat: 'xlsx' | 'csv') => {
    setExportLoading(true);
    try {
      // Prepare data for Excel
      const data = filteredLancamentos.map(l => ({
        'Data': format(parseLocalDate(l.data), 'dd/MM/yyyy'),
        'Descrição': l.observacao || '-',
        'Categoria': l.categorias?.nome || '-',
        'Tipo': l.tipo === 'receita' ? 'Receita' : 'Despesa',
        'Valor': Number(l.valor),
        'Veículo': l.vehicles?.name || '-',
        'Placa': l.vehicles?.plate || '-'
      }));

      // Add summary sheet or rows
      const summary = [
        { 'Item': 'Total Receitas', 'Valor': stats.receitas },
        { 'Item': 'Total Despesas', 'Valor': stats.despesas },
        { 'Item': 'Lucro Líquido', 'Valor': stats.lucroLiquido },
        { 'Item': 'Saldo Acumulado', 'Valor': stats.saldoAcumulado }
      ];

      const vehicleSummary = stats.porVeiculo.map(v => ({
        'Veículo': v.nome,
        'Placa': v.placa,
        'Receitas': v.receitas,
        'Despesas': v.despesas,
        'Saldo': v.saldo
      }));

      const wb = XLSX.utils.book_new();
      const wsTransactions = XLSX.utils.json_to_sheet(data);
      const wsSummary = XLSX.utils.json_to_sheet(summary);
      
      XLSX.utils.book_append_sheet(wb, wsTransactions, 'Transações');
      XLSX.utils.book_append_sheet(wb, wsSummary, 'Resumo');

      if (vehicleSummary.length > 0) {
        const wsVehicleSummary = XLSX.utils.json_to_sheet(vehicleSummary);
        XLSX.utils.book_append_sheet(wb, wsVehicleSummary, 'Resumo por Veículo');
      }

      if (fileFormat === 'xlsx') {
        XLSX.writeFile(wb, `atlas-financeiro-${format(new Date(), 'yyyy-MM-dd')}.xlsx`);
      } else {
        XLSX.writeFile(wb, `atlas-financeiro-${format(new Date(), 'yyyy-MM-dd')}.csv`, { bookType: 'csv' });
      }
      setIsExportModalOpen(false);
    } catch (error) {
      console.error("Excel export error:", error);
      alert("Erro ao exportar arquivo.");
    } finally {
      setExportLoading(false);
    }
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
                  <option value="year">Por Ano</option>
                  <option value="custom">Período Personalizado</option>
                </Select>
              </div>

              {filterType === 'month' ? (
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Ano</label>
                    <Select 
                      value={selectedMonth.split('-')[0]} 
                      onChange={(e) => setSelectedMonth(`${e.target.value}-${selectedMonth.split('-')[1]}`)}
                    >
                      {Array.from({ length: 11 }, (_, i) => new Date().getFullYear() - 5 + i).map(year => (
                        <option key={year} value={year.toString()}>{year}</option>
                      ))}
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Mês</label>
                    <Select 
                      value={selectedMonth.split('-')[1]} 
                      onChange={(e) => setSelectedMonth(`${selectedMonth.split('-')[0]}-${e.target.value}`)}
                    >
                      {Array.from({ length: 12 }, (_, i) => {
                        const monthNum = (i + 1).toString().padStart(2, '0');
                        const monthName = format(new Date(2000, i, 1), 'MMMM', { locale: ptBR });
                        return (
                          <option key={monthNum} value={monthNum} className="capitalize">
                            {monthName.charAt(0).toUpperCase() + monthName.slice(1)}
                          </option>
                        );
                      })}
                    </Select>
                  </div>
                </div>
              ) : filterType === 'year' ? (
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Ano</label>
                  <Select 
                    value={selectedYear} 
                    onChange={(e) => setSelectedYear(e.target.value)}
                  >
                    {Array.from({ length: 11 }, (_, i) => new Date().getFullYear() - 5 + i).map(year => (
                      <option key={year} value={year.toString()}>{year}</option>
                    ))}
                  </Select>
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
                  onClick={() => {
                    if (!isPremium(user)) {
                      alert('A exportação de relatórios é uma funcionalidade exclusiva do plano Premium.');
                      return;
                    }
                    setIsExportModalOpen(true);
                  }}
                  className="w-full bg-[#F59E0B] hover:bg-[#D97706] text-white flex items-center justify-center gap-2"
                >
                  <Download className="h-4 w-4" />
                  Exportar Relatório
                </Button>
              </div>
            </div>
          </CardContent>
        )}
      </Card>

      <Modal
        isOpen={isExportModalOpen}
        onClose={() => setIsExportModalOpen(false)}
        title="Exportar Relatório"
      >
        <div className="space-y-6">
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300 flex items-center gap-2">
              <MessageSquare className="h-4 w-4 text-gray-400" />
              Notas e Observações (opcional)
            </label>
            <textarea
              className="w-full min-h-[100px] p-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-sm focus:ring-2 focus:ring-[#F59E0B] transition-all outline-none"
              placeholder="Adicione observações que aparecerão no topo do relatório..."
              value={exportNotes}
              onChange={(e) => setExportNotes(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Button
              onClick={exportToPDF}
              disabled={exportLoading}
              className="bg-red-600 hover:bg-red-700 text-white flex items-center justify-center gap-2"
            >
              <FileText className="h-4 w-4" />
              PDF
            </Button>
            <Button
              onClick={() => exportToExcel('xlsx')}
              disabled={exportLoading}
              className="bg-green-600 hover:bg-green-700 text-white flex items-center justify-center gap-2"
            >
              <FileSpreadsheet className="h-4 w-4" />
              Excel (XLSX)
            </Button>
            <Button
              onClick={() => exportToExcel('csv')}
              disabled={exportLoading}
              className="bg-blue-600 hover:bg-blue-700 text-white flex items-center justify-center gap-2"
            >
              <FileJson className="h-4 w-4" />
              CSV
            </Button>
          </div>

          {exportLoading && (
            <p className="text-center text-xs text-gray-500 animate-pulse">
              Gerando arquivo, por favor aguarde...
            </p>
          )}
        </div>
      </Modal>

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
          <div className="h-[300px] w-full bg-white dark:bg-gray-900 rounded-lg p-2" ref={chartRef}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#6b7280', fontSize: 12 }} dy={10} />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(value) => `R$ ${value}`}
                  tick={{ fill: '#6b7280', fontSize: 12 }}
                  dx={-10}
                />
                <Tooltip
                  formatter={(value: number) => formatCurrency(value)}
                  cursor={{ fill: '#f3f4f6', opacity: 0.4 }}
                  contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)', backgroundColor: '#ffffff' }}
                  itemStyle={{ color: '#111827' }}
                  labelStyle={{ color: '#6b7280', marginBottom: '8px' }}
                />
                <Legend iconType="circle" wrapperStyle={{ paddingTop: '20px' }} />
                <Bar dataKey="Receitas" fill="#059568" radius={[6, 6, 0, 0]} maxBarSize={50} />
                <Bar dataKey="Despesas" fill="#EF4444" radius={[6, 6, 0, 0]} maxBarSize={50} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Hidden Chart for PDF Export */}
      <div 
        id="report-chart-container"
        style={{ position: 'absolute', top: '-9999px', left: '-9999px', width: '800px', height: '400px' }}
        ref={reportChartRef}
      >
        <div className="bg-white p-8 w-full h-full">
          <h3 className="text-lg font-bold mb-4 text-gray-800">Comparativo do Período</h3>
          <ResponsiveContainer width="100%" height="80%">
            <BarChart data={reportChartData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
              <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#6b7280', fontSize: 12 }} dy={10} />
              <YAxis
                axisLine={false}
                tickLine={false}
                tickFormatter={(value) => `R$ ${value}`}
                tick={{ fill: '#6b7280', fontSize: 12 }}
                dx={-10}
              />
              <Legend iconType="circle" wrapperStyle={{ paddingTop: '20px' }} />
              <Bar dataKey="Receitas" fill="#059568" radius={[6, 6, 0, 0]} maxBarSize={50} />
              <Bar dataKey="Despesas" fill="#EF4444" radius={[6, 6, 0, 0]} maxBarSize={50} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
