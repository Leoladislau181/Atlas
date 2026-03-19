import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { CustomSelect } from '@/components/ui/custom-select';
import { Input } from '@/components/ui/input';
import { formatCurrency, parseLocalDate, isPremium } from '@/lib/utils';
import { Lancamento, Vehicle, User, Categoria } from '@/types';
import { format, isWithinInterval, startOfMonth, endOfMonth, subMonths, eachMonthOfInterval, differenceInDays, addDays, isSameDay, startOfYear, endOfYear, parse, isValid } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { Filter, TrendingUp, TrendingDown, DollarSign, Wallet, ChevronDown, ChevronUp, FileText, Download, FileSpreadsheet, FileJson, MessageSquare, Upload, CheckCircle, AlertCircle, X } from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import html2canvas from 'html2canvas';
import { Modal } from '@/components/ui/modal';
import { PremiumModal } from '@/components/premium-modal';
import { supabase } from '@/lib/supabase';
import { parsePDFReport } from '@/services/geminiService';

interface ImportRow {
  data: string;
  descricao: string;
  categoria: string;
  tipo: 'receita' | 'despesa';
  valor: number;
  veiculo?: string;
  placa?: string;
  _valid: boolean;
  _error?: string;
}

interface RelatoriosProps {
  lancamentos: Lancamento[];
  vehicles: Vehicle[];
  user: User;
  categorias: Categoria[];
  refetch: () => void;
}

export function Relatorios({ lancamentos, vehicles, user, categorias, refetch }: RelatoriosProps) {
  const [isPremiumModalOpen, setIsPremiumModalOpen] = useState(false);
  const [premiumFeatureName, setPremiumFeatureName] = useState('');
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
  const [errorMsg, setErrorMsg] = useState('');

  // Import state
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [importRows, setImportRows] = useState<ImportRow[]>([]);
  const [importLoading, setImportLoading] = useState(false);
  const [importResult, setImportResult] = useState<{ success: number; errors: number } | null>(null);
  const [importFileError, setImportFileError] = useState('');
  const [importingPDF, setImportingPDF] = useState(false);
  const importInputRef = useRef<HTMLInputElement>(null);

  const chartRef = React.useRef<HTMLDivElement>(null);
  const reportChartRef = React.useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (window.innerWidth < 768) {
      setChartMonthsFilter(3);
    }
  }, []);

  // ── Import logic ──────────────────────────────────────────────
  const parseDate = (raw: any): string | null => {
    if (!raw) return null;
    // Excel serial number
    if (typeof raw === 'number') {
      const date = XLSX.SSF.parse_date_code(raw);
      if (date) {
        const y = date.y;
        const m = String(date.m).padStart(2, '0');
        const d = String(date.d).padStart(2, '0');
        return `${y}-${m}-${d}`;
      }
    }
    const str = String(raw).trim();
    // dd/MM/yyyy
    const f1 = parse(str, 'dd/MM/yyyy', new Date());
    if (isValid(f1)) return format(f1, 'yyyy-MM-dd');
    // yyyy-MM-dd
    const f2 = parse(str, 'yyyy-MM-dd', new Date());
    if (isValid(f2)) return format(f2, 'yyyy-MM-dd');
    return null;
  };

  const parseCurrency = (raw: any): number | null => {
    if (raw === null || raw === undefined || raw === '') return null;
    if (typeof raw === 'number') return raw;
    const str = String(raw).replace(/[R$\s]/g, '').replace(',', '.');
    const num = parseFloat(str);
    return isNaN(num) ? null : num;
  };

  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    setImportFileError('');
    setImportResult(null);
    const file = e.target.files?.[0];
    if (!file) return;

    const ext = file.name.split('.').pop()?.toLowerCase();
    if (!['xlsx', 'csv', 'xls'].includes(ext || '')) {
      setImportFileError('Formato inválido. Use .xlsx, .xls ou .csv');
      return;
    }

    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = new Uint8Array(ev.target!.result as ArrayBuffer);
        const wb = XLSX.read(data, { type: 'array', cellDates: false });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const raw: any[] = XLSX.utils.sheet_to_json(ws, { defval: '' });

        const rows: ImportRow[] = raw.map((r, idx) => {
          const dataStr = parseDate(r['Data'] ?? r['data'] ?? r['DATE'] ?? '');
          const descricao = String(r['Descrição'] ?? r['Descricao'] ?? r['descricao'] ?? r['observacao'] ?? '').trim();
          const catNome = String(r['Categoria'] ?? r['categoria'] ?? '').trim();
          const tipoRaw = String(r['Tipo'] ?? r['tipo'] ?? '').toLowerCase();
          const tipo: 'receita' | 'despesa' = tipoRaw.includes('receita') ? 'receita' : 'despesa';
          const valor = parseCurrency(r['Valor'] ?? r['valor'] ?? null);

          let _valid = true;
          let _error = '';
          if (!dataStr) { _valid = false; _error = 'Data inválida'; }
          if (!catNome) { _valid = false; _error += (_error ? ', ' : '') + 'Categoria em branco'; }
          if (valor === null || valor <= 0) { _valid = false; _error += (_error ? ', ' : '') + 'Valor inválido'; }

          return {
            data: dataStr || '',
            descricao,
            categoria: catNome,
            tipo,
            valor: valor ?? 0,
            veiculo: String(r['Veículo'] ?? r['Veiculo'] ?? r['veiculo'] ?? '').trim() || undefined,
            placa: String(r['Placa'] ?? r['placa'] ?? '').trim() || undefined,
            _valid,
            _error: _error || undefined,
          };
        });

        if (rows.length === 0) {
          setImportFileError('O arquivo está vazio ou sem dados reconhecíveis.');
          return;
        }
        setImportRows(rows);
      } catch (err) {
        setImportFileError('Erro ao ler o arquivo. Verifique se é um Excel ou CSV válido.');
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const handleImportPDF = (e: React.ChangeEvent<HTMLInputElement>) => {
    setImportFileError('');
    setImportResult(null);
    setImportRows([]);
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.toLowerCase().endsWith('.pdf')) {
      setImportFileError('Selecione um arquivo .pdf válido.');
      return;
    }

    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        setImportingPDF(true);
        // Convert to base64
        const arrayBuffer = ev.target!.result as ArrayBuffer;
        const bytes = new Uint8Array(arrayBuffer);
        let binary = '';
        for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
        const base64 = window.btoa(binary);

        const transactions = await parsePDFReport(base64);

        if (transactions.length === 0) {
          setImportFileError('O Gemini não encontrou lançamentos financeiros neste PDF. Verifique se o arquivo contém dados financeiros.');
          setImportingPDF(false);
          return;
        }

        // Convert to ImportRow format
        const rows: ImportRow[] = transactions.map(t => {
          let _valid = true;
          let _error = '';
          if (!t.data || !/^\d{4}-\d{2}-\d{2}$/.test(t.data)) { _valid = false; _error = 'Data inválida'; }
          if (!t.categoria) { _valid = false; _error += (_error ? ', ' : '') + 'Categoria em branco'; }
          if (!t.valor || t.valor <= 0) { _valid = false; _error += (_error ? ', ' : '') + 'Valor inválido'; }
          return {
            data: t.data || '',
            descricao: t.descricao || '',
            categoria: t.categoria || '',
            tipo: t.tipo === 'receita' ? 'receita' : 'despesa',
            valor: t.valor || 0,
            veiculo: t.veiculo || undefined,
            _valid,
            _error: _error || undefined,
          };
        });

        setImportRows(rows);
      } catch (err: any) {
        setImportFileError(err.message?.includes('GEMINI') || err.message?.includes('API')
          ? 'Erro de conexão com o Gemini. Verifique se sua chave VITE_GEMINI_API_KEY está configurada.'
          : `Erro ao processar o PDF: ${err.message || 'Erro desconhecido'}`
        );
      } finally {
        setImportingPDF(false);
      }
    };
    reader.readAsArrayBuffer(file);
  };


  const handleConfirmImport = async () => {
    const validRows = importRows.filter(r => r._valid);
    if (validRows.length === 0) return;

    setImportLoading(true);
    let successCount = 0;
    let errorCount = importRows.filter(r => !r._valid).length;

    try {
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser) throw new Error('Não autenticado');

      // Build or fetch category id map
      const catMap: Record<string, string> = {};
      categorias.forEach(c => { catMap[c.nome.toLowerCase()] = c.id; });

      // Collect unknown categories and create them
      const unknownCats = [...new Set(
        validRows
          .map(r => r.categoria.toLowerCase())
          .filter(n => !catMap[n])
      )];

      if (unknownCats.length > 0) {
        // Determine tipo for each new category based on the rows
        const newCats = (unknownCats as string[]).map((name: string) => {
          const sample = validRows.find(r => r.categoria.toLowerCase() === name);
          return { nome: name.charAt(0).toUpperCase() + name.slice(1), tipo: sample?.tipo ?? 'despesa', user_id: authUser.id };
        });
        const { data: created, error: catErr } = await supabase.from('categorias').insert(newCats).select();
        if (catErr) throw catErr;
        (created || []).forEach((c: any) => { catMap[c.nome.toLowerCase()] = c.id; });
      }

      // Build vehicle map (by name or plate)
      const vehMap: Record<string, string> = {};
      vehicles.forEach(v => {
        if (v.name) vehMap[v.name.toLowerCase()] = v.id;
        if (v.plate) vehMap[v.plate.toLowerCase()] = v.id;
      });

      // Batch insert
      const toInsert = validRows.map(r => {
        const catId = catMap[r.categoria.toLowerCase()];
        const vehId = r.veiculo ? (vehMap[r.veiculo.toLowerCase()] ?? vehMap[(r.placa ?? '').toLowerCase()] ?? null) : null;
        return {
          user_id: authUser.id,
          tipo: r.tipo,
          categoria_id: catId,
          valor: r.valor,
          data: r.data,
          observacao: r.descricao || '',
          vehicle_id: vehId,
        };
      });

      // Insert in chunks of 100
      const chunkSize = 100;
      for (let i = 0; i < toInsert.length; i += chunkSize) {
        const chunk = toInsert.slice(i, i + chunkSize);
        const { error: insErr } = await supabase.from('lancamentos').insert(chunk);
        if (insErr) {
          errorCount += chunk.length;
        } else {
          successCount += chunk.length;
        }
      }

      setImportResult({ success: successCount, errors: errorCount });
      setImportRows([]);
      if (successCount > 0) refetch();
    } catch (err: any) {
      setImportFileError(err.message || 'Erro ao importar.');
    } finally {
      setImportLoading(false);
    }
  };

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
    const porCombustivel: Record<string, { valor: number; litros: number }> = {};

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

      if (l.tipo === 'despesa' && l.fuel_liters && l.fuel_liters > 0) {
        const fuelType = l.fuel_type || 'Não especificado';
        if (!porCombustivel[fuelType]) {
          porCombustivel[fuelType] = { valor: 0, litros: 0 };
        }
        porCombustivel[fuelType].valor += valor;
        porCombustivel[fuelType].litros += Number(l.fuel_liters);
      }
    });

    return {
      receitas,
      despesas,
      lucroLiquido: receitas - despesas,
      saldoAcumulado,
      porCategoria: Object.values(porCategoria).sort((a, b) => b.valor - a.valor),
      porCategoriaRaw: porCategoria,
      porVeiculo: Object.values(porVeiculo).sort((a, b) => b.saldo - a.saldo),
      porCombustivel: Object.entries(porCombustivel).map(([tipo, data]) => ({ tipo, ...data })).sort((a, b) => b.valor - a.valor)
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
          ['Saldo', formatCurrency(stats.lucroLiquido)],
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
      setErrorMsg("Erro ao exportar PDF.");
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
        { 'Item': 'Saldo', 'Valor': stats.lucroLiquido },
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
      setErrorMsg("Erro ao exportar arquivo.");
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
                <CustomSelect 
                  value={filterType} 
                  onChange={(val) => setFilterType(val as any)}
                  options={[
                    { value: 'month', label: 'Por Mês' },
                    { value: 'year', label: 'Por Ano' },
                    { value: 'custom', label: 'Período Personalizado' }
                  ]}
                />
              </div>

              {filterType === 'month' ? (
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Ano</label>
                    <CustomSelect 
                      value={selectedMonth.split('-')[0]} 
                      onChange={(val) => setSelectedMonth(`${val}-${selectedMonth.split('-')[1]}`)}
                      options={Array.from({ length: 11 }, (_, i) => new Date().getFullYear() - 5 + i).map(year => ({
                        value: year.toString(),
                        label: year.toString()
                      }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Mês</label>
                    <CustomSelect 
                      value={selectedMonth.split('-')[1]} 
                      onChange={(val) => setSelectedMonth(`${selectedMonth.split('-')[0]}-${val}`)}
                      options={Array.from({ length: 12 }, (_, i) => {
                        const monthNum = (i + 1).toString().padStart(2, '0');
                        const monthName = format(new Date(2000, i, 1), 'MMMM', { locale: ptBR });
                        return {
                          value: monthNum,
                          label: monthName.charAt(0).toUpperCase() + monthName.slice(1)
                        };
                      })}
                    />
                  </div>
                </div>
              ) : filterType === 'year' ? (
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Ano</label>
                  <CustomSelect 
                    value={selectedYear} 
                    onChange={setSelectedYear}
                    options={Array.from({ length: 11 }, (_, i) => new Date().getFullYear() - 5 + i).map(year => ({
                      value: year.toString(),
                      label: year.toString()
                    }))}
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
                <CustomSelect 
                  value={selectedVehicleId} 
                  onChange={setSelectedVehicleId}
                  options={[
                    { value: 'all', label: 'Todos os Veículos' },
                    ...vehicles.map(v => ({ value: v.id, label: `${v.name} (${v.plate})` }))
                  ]}
                />
              </div>

              <div className="sm:col-span-2 lg:col-span-1 flex flex-col sm:flex-row lg:flex-col gap-2">
                <Button 
                  onClick={() => {
                    if (!isPremium(user)) {
                      setPremiumFeatureName('Exportação de Relatórios');
                      setIsPremiumModalOpen(true);
                      return;
                    }
                    setIsExportModalOpen(true);
                  }}
                  className="w-full bg-[#F59E0B] hover:bg-[#D97706] text-white flex items-center justify-center gap-2"
                >
                  <Download className="h-4 w-4" />
                  Exportar Relatório
                </Button>
                <Button 
                  onClick={() => {
                    if (!isPremium(user)) {
                      setPremiumFeatureName('Importação de Relatórios');
                      setIsPremiumModalOpen(true);
                      return;
                    }
                    setIsImportModalOpen(true);
                    setImportRows([]);
                    setImportResult(null);
                    setImportFileError('');
                  }}
                  className="w-full bg-indigo-600 hover:bg-indigo-700 text-white flex items-center justify-center gap-2"
                >
                  <Upload className="h-4 w-4" />
                  Importar Dados
                </Button>
              </div>
            </div>
          </CardContent>
        )}
      </Card>

      <Modal
        isOpen={isExportModalOpen}
        onClose={() => {
          setIsExportModalOpen(false);
          setErrorMsg('');
        }}
        title="Exportar Relatório"
      >
        <div className="space-y-6">
          {errorMsg && (
            <div className="p-3 rounded-lg bg-red-50 text-red-600 text-sm dark:bg-red-900/20 dark:text-red-400">
              {errorMsg}
            </div>
          )}
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

      {/* ── Import Modal ── */}
      <Modal
        isOpen={isImportModalOpen}
        onClose={() => {
          if (!importLoading) {
            setIsImportModalOpen(false);
            setImportRows([]);
            setImportResult(null);
            setImportFileError('');
            if (importInputRef.current) importInputRef.current.value = '';
          }
        }}
        title="Importar Lançamentos"
      >
        <div className="space-y-5">
          {importResult ? (
            <div className="text-center space-y-4 py-4">
              <CheckCircle className="mx-auto h-14 w-14 text-green-500" />
              <div>
                <p className="text-lg font-bold text-gray-900 dark:text-gray-100">Importação concluída!</p>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                  <span className="text-green-600 font-semibold">{importResult.success} lançamentos</span> importados com sucesso.
                  {importResult.errors > 0 && <span className="text-red-500 font-semibold"> {importResult.errors} registros ignorados por erro.</span>}
                </p>
              </div>
              <Button
                onClick={() => {
                  setIsImportModalOpen(false);
                  setImportResult(null);
                  if (importInputRef.current) importInputRef.current.value = '';
                }}
                className="bg-[#F59E0B] hover:bg-[#D97706] text-white"
              >
                Fechar
              </Button>
            </div>
          ) : (
            <>
              {/* PDF loading state */}
              {importingPDF && (
                <div className="flex flex-col items-center justify-center gap-4 py-8">
                  <div className="h-12 w-12 rounded-full border-4 border-indigo-200 border-t-indigo-600 animate-spin" />
                  <div className="text-center">
                    <p className="font-semibold text-gray-800 dark:text-gray-100">Analisando PDF com Gemini IA...</p>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Isso pode levar alguns segundos</p>
                  </div>
                </div>
              )}

              {!importingPDF && (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {/* Excel / CSV */}
                    <div className="space-y-1">
                      <p className="text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wide flex items-center gap-1">
                        <FileSpreadsheet className="h-3.5 w-3.5 text-green-600" /> Excel / CSV
                      </p>
                      <div
                        className="border-2 border-dashed border-gray-300 dark:border-gray-700 rounded-xl p-5 text-center cursor-pointer hover:border-indigo-400 dark:hover:border-indigo-500 transition-colors"
                        onClick={() => importInputRef.current?.click()}
                      >
                        <FileSpreadsheet className="mx-auto h-8 w-8 text-green-500 mb-2" />
                        <p className="text-xs font-medium text-gray-700 dark:text-gray-300">Clique para selecionar</p>
                        <p className="text-xs text-gray-400 mt-0.5">.xlsx, .xls, .csv</p>
                        <input
                          ref={importInputRef}
                          type="file"
                          accept=".xlsx,.xls,.csv"
                          className="hidden"
                          aria-label="Selecionar arquivo Excel ou CSV para importar"
                          title="Arquivo Excel ou CSV"
                          onChange={handleImportFile}
                        />
                      </div>
                      <p className="text-xs text-gray-400 dark:text-gray-500">Precisa ter colunas: Data, Categoria, Tipo, Valor</p>
                    </div>

                    {/* PDF */}
                    <div className="space-y-1">
                      <p className="text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wide flex items-center gap-1">
                        <FileText className="h-3.5 w-3.5 text-red-500" /> PDF <span className="text-indigo-500 font-bold">✦ IA</span>
                      </p>
                      <div
                        className="border-2 border-dashed border-gray-300 dark:border-gray-700 rounded-xl p-5 text-center cursor-pointer hover:border-red-400 dark:hover:border-red-500 transition-colors"
                        onClick={() => {
                          const pdfInput = document.getElementById('pdf-import-input') as HTMLInputElement;
                          pdfInput?.click();
                        }}
                      >
                        <FileText className="mx-auto h-8 w-8 text-red-500 mb-2" />
                        <p className="text-xs font-medium text-gray-700 dark:text-gray-300">Clique para selecionar</p>
                        <p className="text-xs text-gray-400 mt-0.5">.pdf</p>
                        <input
                          id="pdf-import-input"
                          type="file"
                          accept=".pdf"
                          className="hidden"
                          aria-label="Selecionar arquivo PDF para importar com IA"
                          title="Arquivo PDF"
                          onChange={handleImportPDF}
                        />
                      </div>
                      <p className="text-xs text-gray-400 dark:text-gray-500">Extratos, faturas e notas — Gemini lê e interpreta automaticamente</p>
                    </div>
                  </div>
                </>
              )}

              {importFileError && (
                <div className="flex items-start gap-2 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 text-sm text-red-600 dark:text-red-400 border border-red-100 dark:border-red-800">
                  <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                  {importFileError}
                </div>
              )}

              {importRows.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                      Pré-visualização: <span className="text-indigo-600">{importRows.filter(r => r._valid).length}</span> válidos, <span className="text-red-500">{importRows.filter(r => !r._valid).length}</span> com erro
                    </p>
                    <button title="Limpar arquivo" aria-label="Limpar arquivo selecionado" onClick={() => { setImportRows([]); if (importInputRef.current) importInputRef.current.value = ''; }} className="text-gray-400 hover:text-gray-600">
                      <X className="h-4 w-4" />
                    </button>
                  </div>

                  <div className="max-h-48 overflow-y-auto rounded-xl border border-gray-200 dark:border-gray-700">
                    <table className="w-full text-xs">
                      <thead className="bg-gray-50 dark:bg-gray-800 sticky top-0">
                        <tr>
                          <th className="text-left p-2 font-semibold text-gray-600 dark:text-gray-400">Data</th>
                          <th className="text-left p-2 font-semibold text-gray-600 dark:text-gray-400">Categoria</th>
                          <th className="text-left p-2 font-semibold text-gray-600 dark:text-gray-400">Tipo</th>
                          <th className="text-right p-2 font-semibold text-gray-600 dark:text-gray-400">Valor</th>
                          <th className="p-2"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {importRows.map((row, i) => (
                          <tr key={i} className={`border-t border-gray-100 dark:border-gray-800 ${!row._valid ? 'bg-red-50 dark:bg-red-900/10' : ''}`}>
                            <td className="p-2 text-gray-700 dark:text-gray-300">{row.data || '—'}</td>
                            <td className="p-2 text-gray-700 dark:text-gray-300">{row.categoria || '—'}</td>
                            <td className="p-2">
                              <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${
                                row.tipo === 'receita'
                                  ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                                  : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                              }`}>{row.tipo}</span>
                            </td>
                            <td className="p-2 text-right font-mono text-gray-700 dark:text-gray-300">{row._valid ? formatCurrency(row.valor) : '—'}</td>
                            <td className="p-2 text-center">
                              {row._valid
                                ? <CheckCircle className="h-3.5 w-3.5 text-green-500 inline" />
                                : <span title={row._error}><AlertCircle className="h-3.5 w-3.5 text-red-500 inline" /></span>}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <Button
                    onClick={handleConfirmImport}
                    disabled={importLoading || importRows.filter(r => r._valid).length === 0}
                    className="w-full bg-indigo-600 hover:bg-indigo-700 text-white flex items-center justify-center gap-2"
                  >
                    {importLoading ? (
                      <><div className="h-4 w-4 rounded-full border-2 border-white border-t-transparent animate-spin" /> Importando...</>
                    ) : (
                      <><Upload className="h-4 w-4" /> Confirmar Importação ({importRows.filter(r => r._valid).length} registros)</>
                    )}
                  </Button>
                </div>
              )}
            </>
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
            <CardTitle className="text-sm font-medium text-gray-500 dark:text-gray-400">Saldo</CardTitle>
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

      {stats.porCombustivel.length > 0 && (
        <Card className="border-none shadow-sm bg-white dark:bg-gray-900">
          <CardHeader className="border-b border-gray-50 dark:border-gray-800 pb-4">
            <CardTitle className="text-lg text-gray-900 dark:text-gray-100">Resumo por Combustível</CardTitle>
          </CardHeader>
          <CardContent className="pt-6">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {stats.porCombustivel.map((comb, index) => (
                <div key={index} className="p-4 rounded-xl bg-gray-50 dark:bg-gray-800/50 border border-gray-100 dark:border-gray-700">
                  <div className="text-sm font-medium text-gray-500 dark:text-gray-400 uppercase mb-1">{comb.tipo}</div>
                  <div className="text-lg font-bold text-gray-900 dark:text-gray-100">{formatCurrency(comb.valor)}</div>
                  <div className="text-sm text-gray-500 dark:text-gray-400 mt-1">{comb.litros.toFixed(2)} Litros</div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

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
        className="pdf-chart-offscreen"
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
      
      <PremiumModal
        isOpen={isPremiumModalOpen}
        onClose={() => setIsPremiumModalOpen(false)}
        featureName={premiumFeatureName}
      />
    </div>
  );
}
