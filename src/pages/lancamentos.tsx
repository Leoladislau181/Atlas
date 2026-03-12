import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Modal } from '@/components/ui/modal';
import { cn, formatCurrency, formatCurrencyInput, parseCurrency, parseLocalDate, isPremium } from '@/lib/utils';
import { Categoria, Lancamento, TipoLancamento, Vehicle, User } from '@/types';
import { supabase } from '@/lib/supabase';
import { Edit2, Trash2, Car, Plus, ChevronUp, Filter, Search, ChevronLeft, ChevronRight, Calendar, Download, TrendingUp, TrendingDown, DollarSign, Camera, Loader2, Lock } from 'lucide-react';
import { format, addMonths, subMonths, startOfMonth, endOfMonth, isWithinInterval } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { parseReceiptImage } from '@/services/geminiService';

interface LancamentosProps {
  categorias: Categoria[];
  lancamentos: Lancamento[];
  vehicles: Vehicle[];
  refetch: () => void;
  user: User;
  forceOpenForm?: boolean;
  onFormClose?: () => void;
}

export function Lancamentos({ categorias, lancamentos, vehicles, refetch, user, forceOpenForm, onFormClose }: LancamentosProps) {
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [tipo, setTipo] = useState<TipoLancamento>('despesa');
  const [categoriaId, setCategoriaId] = useState('');
  const [valorStr, setValorStr] = useState('');
  const [data, setData] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [observacao, setObservacao] = useState('');
  
  // Vehicle fields
  const [useVehicle, setUseVehicle] = useState(false);
  const [vehicleId, setVehicleId] = useState('');
  const [odometer, setOdometer] = useState('');
  const [fuelPricePerLiterStr, setFuelPricePerLiterStr] = useState('');

  const [editingId, setEditingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [visibleCount, setVisibleCount] = useState(20);

  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [exportLoading, setExportLoading] = useState(false);

  const [isReadingReceipt, setIsReadingReceipt] = useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  // History Filters
  const [filterMonth, setFilterMonth] = useState('');
  const [filterTipo, setFilterTipo] = useState<'all' | 'receita' | 'despesa'>('all');
  const [filterCategoriaId, setFilterCategoriaId] = useState('all');
  const [filterVehicleId, setFilterVehicleId] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [showFilters, setShowFilters] = useState(false);

  useEffect(() => {
    if (forceOpenForm) {
      setIsFormOpen(true);
    }
  }, [forceOpenForm]);

  useEffect(() => {
    if (!isFormOpen && onFormClose) {
      onFormClose();
    }
  }, [isFormOpen, onFormClose]);

  const nextMonth = () => setSelectedDate(addMonths(selectedDate, 1));
  const prevMonth = () => setSelectedDate(subMonths(selectedDate, 1));

  const filteredCategorias = categorias.filter((c) => c.tipo === tipo);

  useEffect(() => {
    const validCategory = filteredCategorias.find(c => c.id === categoriaId);
    if (!validCategory && filteredCategorias.length > 0) {
      setCategoriaId(filteredCategorias[0].id);
    } else if (filteredCategorias.length === 0) {
      setCategoriaId('');
    }
  }, [tipo, categorias, categoriaId]);

  const handleValorChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formatted = formatCurrencyInput(e.target.value);
    setValorStr(formatted);
  };

  const handleReceiptUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!isPremium(user)) {
      alert('A Leitura de Nota Fiscal com IA é uma funcionalidade exclusiva do plano Premium.');
      return;
    }

    const file = e.target.files?.[0];
    if (!file) return;

    setIsReadingReceipt(true);
    try {
      const reader = new FileReader();
      reader.onloadend = async () => {
        try {
          const base64String = (reader.result as string).split(',')[1];
          const mimeType = file.type;
          
          const result = await parseReceiptImage(base64String, mimeType);
          
          setTipo('despesa');
          
          const fuelCategory = categorias.find(c => c.nome.toLowerCase().includes('combustível') || c.nome.toLowerCase().includes('combustivel'));
          if (fuelCategory) {
            setCategoriaId(fuelCategory.id);
          }

          if (result.valor) setValorStr(formatCurrency(result.valor));
          if (result.data) setData(result.data);
          
          if (result.litros && result.preco_litro) {
            setUseVehicle(true);
            setFuelPricePerLiterStr(formatCurrency(result.preco_litro));
          }

          setObservacao('Lançamento via Leitor de Nota Fiscal');
          setIsFormOpen(true);
        } catch (error: any) {
          alert('Erro ao ler a nota fiscal: ' + error.message);
        } finally {
          setIsReadingReceipt(false);
          if (fileInputRef.current) fileInputRef.current.value = '';
        }
      };
      reader.readAsDataURL(file);
    } catch (error) {
      setIsReadingReceipt(false);
      alert('Erro ao processar imagem.');
    }
  };

  const isCombustivel = () => {
    const cat = categorias.find(c => c.id === categoriaId);
    return cat?.nome.toLowerCase().includes('combustível') || cat?.nome.toLowerCase().includes('combustivel');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!categoriaId || !valorStr || !data) {
      alert('Preencha os campos obrigatórios.');
      return;
    }

    if (useVehicle && !vehicleId) {
      alert('Selecione um veículo.');
      return;
    }

    if (useVehicle && tipo === 'despesa' && !odometer) {
      alert('O odômetro é obrigatório para despesas atreladas a um veículo.');
      return;
    }

    const valorNum = parseCurrency(valorStr);
    if (valorNum <= 0) {
      alert('O valor deve ser maior que zero.');
      return;
    }

    if (!editingId && !isPremium(user)) {
      const currentMonth = new Date().getMonth();
      const currentYear = new Date().getFullYear();
      const transactionsThisMonth = lancamentos.filter(l => {
        const d = new Date(l.data);
        return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
      });

      if (transactionsThisMonth.length >= 50) {
        alert('Usuários do plano gratuito têm um limite de 50 lançamentos por mês. Faça o upgrade para lançamentos ilimitados.');
        return;
      }
    }

    if (useVehicle && tipo === 'despesa') {
      const vehicle = vehicles.find(v => v.id === vehicleId);
      const odoNum = Number(odometer);
      
      // Find last odometer for this vehicle
      const vLancamentos = lancamentos.filter(l => l.vehicle_id === vehicleId && l.odometer).sort((a, b) => {
        const dateA = new Date(a.data).getTime();
        const dateB = new Date(b.data).getTime();
        return dateB - dateA;
      });
      
      const lastOdo = vLancamentos.length > 0 ? vLancamentos[0].odometer! : (vehicle?.initial_odometer || 0);

      if (odoNum < lastOdo && !editingId) { // Only validate if not editing, or we'd need more complex validation
         // Actually, let's just warn or block. The prompt says "Não pode ser menor que último odômetro registrado"
         // If editing, it might be the last one, so it's fine. Let's just do a simple check.
         if (odoNum < lastOdo && !editingId) {
            alert(`O odômetro atual (${odoNum}) não pode ser menor que o último registrado (${lastOdo}).`);
            return;
         }
      }
    }

    setLoading(true);
    try {
      const payload: any = {
        user_id: user.id,
        tipo,
        categoria_id: categoriaId,
        valor: valorNum,
        data,
        observacao,
        vehicle_id: useVehicle ? vehicleId : null,
        odometer: useVehicle && tipo === 'despesa' ? Number(odometer) : null,
        fuel_price_per_liter: null,
        fuel_liters: null,
      };

      if (useVehicle && tipo === 'despesa' && isCombustivel()) {
        const pricePerLiter = parseCurrency(fuelPricePerLiterStr);
        const totalFuelValue = valorNum;
        
        if (pricePerLiter > 0 && totalFuelValue > 0) {
           payload.fuel_price_per_liter = pricePerLiter;
           payload.fuel_liters = totalFuelValue / pricePerLiter;
        }
      }

      if (editingId) {
        const { error } = await supabase.from('lancamentos').update(payload).eq('id', editingId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('lancamentos').insert([payload]);
        if (error) throw error;
      }

      setTipo('despesa');
      setValorStr('');
      setData(format(new Date(), 'yyyy-MM-dd'));
      setObservacao('');
      setUseVehicle(false);
      setVehicleId('');
      setOdometer('');
      setFuelPricePerLiterStr('');
      setEditingId(null);
      setIsFormOpen(false);
      refetch();
    } catch (error: any) {
      alert(error.message || 'Erro ao salvar lançamento.');
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (lancamento: Lancamento) => {
    setEditingId(lancamento.id);
    setIsFormOpen(true);
    setTipo(lancamento.tipo);
    setCategoriaId(lancamento.categoria_id);
    setValorStr(formatCurrency(lancamento.valor));
    setData(lancamento.data);
    setObservacao(lancamento.observacao || '');
    
    if (lancamento.vehicle_id) {
      setUseVehicle(true);
      setVehicleId(lancamento.vehicle_id);
      setOdometer(lancamento.odometer ? lancamento.odometer.toString() : '');
      if (lancamento.fuel_price_per_liter) {
        setFuelPricePerLiterStr(formatCurrency(lancamento.fuel_price_per_liter));
      } else {
        setFuelPricePerLiterStr('');
      }
    } else {
      setUseVehicle(false);
      setVehicleId('');
      setOdometer('');
      setFuelPricePerLiterStr('');
    }
    
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const confirmDelete = (id: string) => {
    setDeletingId(id);
    setDeleteModalOpen(true);
  };

  const handleDelete = async () => {
    if (!deletingId) return;
    try {
      const { error } = await supabase.from('lancamentos').delete().eq('id', deletingId);
      if (error) throw error;
      setDeleteModalOpen(false);
      setDeletingId(null);
      refetch();
    } catch (error: any) {
      alert(error.message || 'Erro ao excluir lançamento.');
    }
  };

  const filteredLancamentos = lancamentos.filter((l) => {
    const dataLancamento = parseLocalDate(l.data);
    const monthStart = startOfMonth(selectedDate);
    const monthEnd = endOfMonth(selectedDate);
    
    const matchesMonth = isWithinInterval(dataLancamento, { start: monthStart, end: monthEnd });
    const matchesTipo = filterTipo === 'all' || l.tipo === filterTipo;
    const matchesCategoria = filterCategoriaId === 'all' || l.categoria_id === filterCategoriaId;
    const matchesVehicle = filterVehicleId === 'all' || l.vehicle_id === filterVehicleId;
    const matchesSearch = !searchTerm || 
      (l.observacao && l.observacao.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (l.categorias && l.categorias.nome.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (l.valor.toString().includes(searchTerm));
      
    return matchesMonth && matchesTipo && matchesCategoria && matchesVehicle && matchesSearch;
  });

  const sortedLancamentos = [...filteredLancamentos].sort((a, b) => {
    const dateA = new Date(a.data).getTime();
    const dateB = new Date(b.data).getTime();
    if (dateA !== dateB) return dateB - dateA;
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });

  const monthSummary = React.useMemo(() => {
    let receitas = 0;
    let despesas = 0;
    filteredLancamentos.forEach(l => {
      if (l.tipo === 'receita') receitas += Number(l.valor);
      else despesas += Number(l.valor);
    });
    return { receitas, despesas, saldo: receitas - despesas };
  }, [filteredLancamentos]);

  const exportToExcel = (fileFormat: 'xlsx' | 'csv') => {
    setExportLoading(true);
    try {
      const data = sortedLancamentos.map(l => ({
        'Data': format(parseLocalDate(l.data), 'dd/MM/yyyy'),
        'Descrição': l.observacao || '',
        'Categoria': l.categorias?.nome || '-',
        'Tipo': l.tipo === 'receita' ? 'Receita' : 'Despesa',
        'Valor': Number(l.valor),
        'Veículo': l.vehicles?.name || '-',
        'Placa': l.vehicles?.plate || '-'
      }));

      const ws = XLSX.utils.json_to_sheet(data);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Lançamentos');
      
      if (fileFormat === 'xlsx') {
        XLSX.writeFile(wb, `lancamentos-${format(selectedDate, 'yyyy-MM')}.xlsx`);
      } else {
        XLSX.writeFile(wb, `lancamentos-${format(selectedDate, 'yyyy-MM')}.csv`, { bookType: 'csv' });
      }
      setIsExportModalOpen(false);
    } catch (error) {
      console.error("Export error:", error);
      alert("Erro ao exportar arquivo.");
    } finally {
      setExportLoading(false);
    }
  };

  const exportToPDF = () => {
    setExportLoading(true);
    try {
      const doc = new jsPDF();
      const pageWidth = doc.internal.pageSize.width;
      const pageHeight = doc.internal.pageSize.height;

      doc.setFontSize(20);
      doc.setTextColor(15, 23, 42);
      doc.text('Relatório de Lançamentos', 15, 20);

      doc.setFontSize(12);
      doc.setTextColor(100, 116, 139);
      doc.text(`Período: ${format(selectedDate, 'MMMM yyyy', { locale: ptBR })}`, 15, 30);

      let currentY = 40;

      const tableData = sortedLancamentos.map(l => [
        format(parseLocalDate(l.data), 'dd/MM/yyyy'),
        l.observacao || '-',
        l.categorias?.nome || '-',
        l.vehicles?.name || '-',
        l.tipo === 'receita' ? 'RECEITA' : 'DESPESA',
        formatCurrency(Number(l.valor))
      ]);

      autoTable(doc, {
        startY: currentY,
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

      const totalPages = (doc as any).internal.getNumberOfPages();
      for (let i = 1; i <= totalPages; i++) {
        doc.setPage(i);
        doc.setFontSize(8);
        doc.setTextColor(156, 163, 175);
        doc.text(
          `Gerado em ${format(new Date(), 'dd/MM/yyyy HH:mm')}`,
          15,
          pageHeight - 10
        );
        doc.text(
          `Página ${i} de ${totalPages}`,
          pageWidth - 30,
          pageHeight - 10
        );
      }

      doc.save(`lancamentos-${format(selectedDate, 'yyyy-MM')}.pdf`);
      setIsExportModalOpen(false);
    } catch (error) {
      console.error("Export error:", error);
      alert("Erro ao exportar PDF.");
    } finally {
      setExportLoading(false);
    }
  };

  const visibleLancamentos = sortedLancamentos.slice(0, visibleCount);
  const hasMore = visibleCount < sortedLancamentos.length;

  return (
    <div className="space-y-6">
      {/* Month Selector Header */}
      <div className="flex items-center justify-between bg-white dark:bg-gray-900 p-4 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800">
        <div className="w-10 sm:hidden"></div> {/* Spacer for mobile centering balance */}
        <div className="flex items-center justify-center flex-1">
          <Button
            variant="ghost"
            onClick={prevMonth}
            className="h-10 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full px-2 sm:px-3 flex items-center gap-1"
          >
            <ChevronLeft className="h-5 w-5" />
            <span className="hidden sm:inline text-xs capitalize">{format(subMonths(selectedDate, 1), 'MMM', { locale: ptBR })}</span>
          </Button>
          
          <div className="text-center mx-1 sm:mx-4 min-w-[120px] sm:min-w-[140px]">
            <h2 className="text-lg sm:text-xl font-bold text-gray-900 dark:text-gray-100 capitalize">
              {format(selectedDate, 'MMMM yyyy', { locale: ptBR })}
            </h2>
            <p className="text-[10px] sm:text-xs text-gray-500 dark:text-gray-400">
              {filteredLancamentos.length} lançamentos
            </p>
          </div>

          <Button
            variant="ghost"
            onClick={nextMonth}
            className="h-10 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full px-2 sm:px-3 flex items-center gap-1"
          >
            <span className="hidden sm:inline text-xs capitalize">{format(addMonths(selectedDate, 1), 'MMM', { locale: ptBR })}</span>
            <ChevronRight className="h-5 w-5" />
          </Button>
        </div>

        <div className="flex items-center justify-end w-10 sm:w-auto sm:ml-4 gap-2">
          <input
            type="file"
            accept="image/*"
            capture="environment"
            ref={fileInputRef}
            onChange={handleReceiptUpload}
            className="hidden"
          />
          <Button
            variant="outline"
            className="hidden sm:flex items-center gap-2 bg-indigo-50 text-indigo-600 border-indigo-200 hover:bg-indigo-100 dark:bg-indigo-900/20 dark:text-indigo-400 dark:border-indigo-800/50"
            onClick={() => fileInputRef.current?.click()}
            disabled={isReadingReceipt}
          >
            {isReadingReceipt ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
            Ler Nota Fiscal
          </Button>
          <Button
            variant="outline"
            size="icon"
            onClick={() => fileInputRef.current?.click()}
            disabled={isReadingReceipt}
            className="sm:hidden flex h-9 w-9 rounded-xl bg-indigo-50 text-indigo-600 border-indigo-200 hover:bg-indigo-100 dark:bg-indigo-900/20 dark:text-indigo-400 dark:border-indigo-800/50"
          >
            {isReadingReceipt ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
          </Button>
          <Button
            variant="outline"
            size="icon"
            onClick={() => {
              if (!isPremium(user)) {
                alert('A exportação de relatórios é uma funcionalidade exclusiva do plano Premium.');
                return;
              }
              setIsExportModalOpen(true);
            }}
            title="Exportar"
            className="flex h-9 w-9 sm:h-11 sm:w-11 rounded-xl text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100"
          >
            <Download className="h-4 w-4 sm:h-5 sm:w-5" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            onClick={() => setShowFilters(!showFilters)}
            className={cn(
              "h-9 w-9 sm:h-11 sm:w-11 rounded-xl transition-all",
              showFilters 
                ? "bg-[#F59E0B] text-white border-[#F59E0B] hover:bg-[#D97706]" 
                : "text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800"
            )}
          >
            <Filter className="h-4 w-4 sm:h-5 sm:w-5" />
          </Button>
        </div>
      </div>

      {/* Month Summary Cards */}
      <div className="hidden sm:grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="bg-white dark:bg-gray-900 border-none shadow-sm">
          <CardContent className="p-4 flex items-center gap-4">
            <div className="p-3 bg-emerald-50 dark:bg-emerald-900/20 rounded-xl">
              <TrendingUp className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div>
              <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Receitas</p>
              <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">
                {formatCurrency(monthSummary.receitas)}
              </h3>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-white dark:bg-gray-900 border-none shadow-sm">
          <CardContent className="p-4 flex items-center gap-4">
            <div className="p-3 bg-red-50 dark:bg-red-900/20 rounded-xl">
              <TrendingDown className="h-5 w-5 text-red-600 dark:text-red-400" />
            </div>
            <div>
              <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Despesas</p>
              <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">
                {formatCurrency(monthSummary.despesas)}
              </h3>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-white dark:bg-gray-900 border-none shadow-sm">
          <CardContent className="p-4 flex items-center gap-4">
            <div className={cn(
              "p-3 rounded-xl",
              monthSummary.saldo >= 0 ? "bg-blue-50 dark:bg-blue-900/20" : "bg-red-50 dark:bg-red-900/20"
            )}>
              <DollarSign className={cn(
                "h-5 w-5",
                monthSummary.saldo >= 0 ? "text-blue-600 dark:text-blue-400" : "text-red-600 dark:text-red-400"
              )} />
            </div>
            <div>
              <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Saldo do Mês</p>
              <h3 className={cn(
                "text-lg font-bold",
                monthSummary.saldo >= 0 ? "text-blue-600 dark:text-blue-400" : "text-red-600 dark:text-red-400"
              )}>
                {formatCurrency(monthSummary.saldo)}
              </h3>
            </div>
          </CardContent>
        </Card>
      </div>

      {showFilters && (
        <Card className="border-none shadow-md bg-white dark:bg-gray-900 animate-in fade-in slide-in-from-top-4 duration-300">
          <CardContent className="pt-6">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
              <div className="space-y-2">
                <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Busca</label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                  <Input
                    placeholder="O que você procura?"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10 h-11 rounded-xl border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Tipo</label>
                <Select
                  value={filterTipo}
                  onChange={(e) => setFilterTipo(e.target.value as any)}
                  className="h-11 rounded-xl border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50"
                >
                  <option value="all">Todos os Tipos</option>
                  <option value="receita">Receitas</option>
                  <option value="despesa">Despesas</option>
                </Select>
              </div>
              <div className="space-y-2">
                <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Categoria</label>
                <Select
                  value={filterCategoriaId}
                  onChange={(e) => setFilterCategoriaId(e.target.value)}
                  className="h-11 rounded-xl border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50"
                >
                  <option value="all">Todas as Categorias</option>
                  {categorias.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nome}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="space-y-2">
                <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Veículo</label>
                <Select
                  value={filterVehicleId}
                  onChange={(e) => setFilterVehicleId(e.target.value)}
                  className="h-11 rounded-xl border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50"
                >
                  <option value="all">Todos os Veículos</option>
                  {vehicles.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.name} - {v.plate}
                    </option>
                  ))}
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <Modal
        isOpen={isReadingReceipt}
        onClose={() => {}}
        title="Processando Recibo"
        className="max-w-sm"
      >
        <div className="flex flex-col items-center justify-center py-8 space-y-4">
          <Loader2 className="h-12 w-12 text-indigo-500 animate-spin" />
          <p className="text-center text-gray-600 dark:text-gray-300 font-medium">
            A Inteligência Artificial está lendo seu recibo...
          </p>
          <p className="text-center text-xs text-gray-400 dark:text-gray-500">
            Isso leva apenas alguns segundos.
          </p>
        </div>
      </Modal>

      <Modal
        isOpen={isFormOpen}
        onClose={() => setIsFormOpen(false)}
        title={editingId ? 'Editar Lançamento' : 'Novo Lançamento'}
        className="max-w-2xl"
      >
        <form onSubmit={handleSubmit} className="space-y-6 pt-6">
              <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Tipo</label>
                <Select value={tipo} onChange={(e) => setTipo(e.target.value as TipoLancamento)}>
                  <option value="despesa">Despesa</option>
                  <option value="receita">Receita</option>
                </Select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Categoria</label>
                <Select value={categoriaId} onChange={(e) => setCategoriaId(e.target.value)}>
                  {filteredCategorias.length === 0 && (
                    <option value="" disabled>Nenhuma categoria</option>
                  )}
                  {filteredCategorias.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nome}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  {useVehicle && tipo === 'despesa' && isCombustivel() ? 'Valor Total Abastecido' : 'Valor'}
                </label>
                <Input
                  type="text"
                  inputMode="decimal"
                  placeholder="R$ 0,00"
                  value={valorStr}
                  onChange={handleValorChange}
                  required
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Data</label>
                <Input
                  type="date"
                  value={data}
                  onChange={(e) => setData(e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="flex items-center space-x-2 py-2">
              <input
                type="checkbox"
                id="useVehicle"
                checked={useVehicle}
                onChange={(e) => setUseVehicle(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300 dark:border-gray-600 text-[#F59E0B] focus:ring-[#F59E0B] dark:bg-gray-700"
              />
              <label htmlFor="useVehicle" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Atrelar a um veículo?
              </label>
            </div>

            {useVehicle && (
              <div className="grid grid-cols-1 gap-6 md:grid-cols-2 p-4 bg-gray-50 dark:bg-gray-800/50 rounded-lg border border-gray-100 dark:border-gray-800">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Veículo *</label>
                  <Select value={vehicleId} onChange={(e) => setVehicleId(e.target.value)}>
                    <option value="" disabled>Selecione um veículo</option>
                    {vehicles.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.name} ({v.plate})
                      </option>
                    ))}
                  </Select>
                </div>
                
                {tipo === 'despesa' && (
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Odômetro Atual (KM) *</label>
                    <Input
                      type="number"
                      inputMode="numeric"
                      placeholder="Ex: 50100"
                      value={odometer}
                      onChange={(e) => setOdometer(e.target.value)}
                      required={useVehicle && tipo === 'despesa'}
                    />
                  </div>
                )}

                {tipo === 'despesa' && isCombustivel() && (
                  <>
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Valor por Litro</label>
                      <Input
                        type="text"
                        inputMode="decimal"
                        placeholder="R$ 0,00"
                        value={fuelPricePerLiterStr}
                        onChange={(e) => setFuelPricePerLiterStr(formatCurrencyInput(e.target.value))}
                        required={useVehicle && tipo === 'despesa' && isCombustivel()}
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Litros (Calculado)</label>
                      <Input
                        type="text"
                        value={
                          parseCurrency(fuelPricePerLiterStr) > 0 && parseCurrency(valorStr) > 0
                            ? (parseCurrency(valorStr) / parseCurrency(fuelPricePerLiterStr)).toFixed(2) + ' L'
                            : '0.00 L'
                        }
                        disabled
                        className="bg-gray-100 dark:bg-gray-800"
                      />
                    </div>
                  </>
                )}
              </div>
            )}

            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Observação</label>
              <Input
                type="text"
                placeholder="Detalhes do lançamento..."
                value={observacao}
                onChange={(e) => setObservacao(e.target.value)}
              />
            </div>
            <div className="flex justify-end pt-4">
              {editingId && (
                <Button
                  type="button"
                  variant="ghost"
                  className="mr-2"
                  onClick={() => {
                    setEditingId(null);
                    setValorStr('');
                    setObservacao('');
                    setIsFormOpen(false);
                  }}
                >
                  Cancelar
                </Button>
              )}
              <Button type="submit" disabled={loading || filteredCategorias.length === 0} className="w-full sm:w-auto bg-[#F59E0B] hover:bg-[#D97706]">
                {loading ? 'Salvando...' : editingId ? 'Atualizar Lançamento' : 'Salvar Lançamento'}
              </Button>
            </div>
        </form>
      </Modal>

      <Card className="border-none shadow-sm bg-white dark:bg-gray-900 overflow-hidden">
        <CardContent className="p-0">
          {/* Desktop Table View */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-left text-sm text-gray-600 dark:text-gray-300">
              <thead className="bg-gray-50 dark:bg-gray-800/50 text-[10px] uppercase tracking-wider font-bold text-gray-500 dark:text-gray-400">
                <tr>
                  <th className="px-6 py-4">Data</th>
                  <th className="px-6 py-4">Tipo</th>
                  <th className="px-6 py-4">Categoria</th>
                  <th className="px-6 py-4">Veículo</th>
                  <th className="px-6 py-4">Observação</th>
                  <th className="px-6 py-4 text-right">Valor</th>
                  <th className="px-6 py-4 text-center">Ações</th>
                </tr>
              </thead>
              <tbody>
                {visibleLancamentos.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-6 py-12 text-center text-gray-500 dark:text-gray-400">
                      Nenhum lançamento encontrado para este período.
                    </td>
                  </tr>
                ) : (
                  visibleLancamentos.map((l) => (
                    <tr key={l.id} className="border-b border-gray-50 dark:border-gray-800/50 hover:bg-gray-50/50 dark:hover:bg-gray-800/20 transition-colors group">
                      <td className="px-6 py-4 whitespace-nowrap text-xs text-gray-500 dark:text-gray-400">
                        {format(parseLocalDate(l.data), 'dd/MM/yyyy')}
                      </td>
                      <td className="px-6 py-4">
                        <span
                          className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                            l.tipo === 'receita'
                              ? 'bg-green-50 dark:bg-[#059568]/10 text-[#059568] dark:text-[#10B981]'
                              : 'bg-red-50 dark:bg-[#EF4444]/10 text-[#EF4444] dark:text-[#F87171]'
                          }`}
                        >
                          {l.tipo === 'receita' ? 'Receita' : 'Despesa'}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm font-medium text-gray-900 dark:text-gray-100">{l.categorias?.nome || 'N/A'}</td>
                      <td className="px-6 py-4">
                        {l.vehicles ? (
                          <span className="inline-flex items-center gap-1.5 rounded-md bg-gray-100 dark:bg-gray-800 px-2 py-1 text-[10px] font-medium text-gray-600 dark:text-gray-300">
                            <Car className="h-3 w-3" />
                            {l.vehicles.name}
                          </span>
                        ) : (
                          <span className="text-gray-400 dark:text-gray-500">-</span>
                        )}
                      </td>
                      <td className="px-6 py-4 max-w-[200px] truncate text-xs text-gray-500 dark:text-gray-400" title={l.observacao}>
                        {l.observacao || '-'}
                      </td>
                      <td
                        className={`px-6 py-4 text-right font-bold text-sm whitespace-nowrap ${
                          l.tipo === 'receita' ? 'text-[#059568] dark:text-[#10B981]' : 'text-[#EF4444] dark:text-[#F87171]'
                        }`}
                      >
                        {l.tipo === 'receita' ? '+' : '-'}{formatCurrency(l.valor)}
                      </td>
                      <td className="px-6 py-4 text-center">
                        <div className="flex items-center justify-center space-x-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={() => handleEdit(l)}
                            className="p-2 text-gray-400 dark:text-gray-500 hover:text-[#F59E0B] dark:hover:text-[#FBBF24] hover:bg-orange-50 dark:hover:bg-[#F59E0B]/10 rounded-lg transition-colors"
                          >
                            <Edit2 className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => confirmDelete(l.id)}
                            className="p-2 text-gray-400 dark:text-gray-500 hover:text-[#EF4444] dark:hover:text-[#F87171] hover:bg-red-50 dark:hover:bg-[#EF4444]/10 rounded-lg transition-colors"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          
          {/* Mobile Card View */}
          <div className="md:hidden divide-y divide-gray-100 dark:divide-gray-800">
            {visibleLancamentos.length === 0 ? (
              <div className="p-12 text-center text-gray-500 dark:text-gray-400">
                Nenhum lançamento encontrado para este período.
              </div>
            ) : (
              visibleLancamentos.map((l) => (
                <div key={l.id} className="p-4 active:bg-gray-50 dark:active:bg-gray-800/50 transition-colors">
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-3">
                      <div className={cn(
                        "p-2.5 rounded-xl",
                        l.tipo === 'receita' ? "bg-green-50 dark:bg-green-900/20" : "bg-red-50 dark:bg-red-900/20"
                      )}>
                        {l.tipo === 'receita' ? (
                          <ChevronUp className="h-5 w-5 text-[#059568] dark:text-[#10B981]" />
                        ) : (
                          <ChevronUp className="h-5 w-5 text-[#EF4444] dark:text-[#F87171] rotate-180" />
                        )}
                      </div>
                      <div>
                        <p className="text-sm font-bold text-gray-900 dark:text-gray-100">{l.categorias?.nome || 'N/A'}</p>
                        <p className="text-[10px] font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                          {format(parseLocalDate(l.data), 'dd MMM yyyy', { locale: ptBR })}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className={cn(
                        "text-sm font-bold",
                        l.tipo === 'receita' ? "text-[#059568] dark:text-[#10B981]" : "text-[#EF4444] dark:text-[#F87171]"
                      )}>
                        {l.tipo === 'receita' ? '+' : '-'}{formatCurrency(l.valor)}
                      </p>
                      {l.vehicles && (
                        <p className="text-[10px] text-gray-400 dark:text-gray-500 flex items-center justify-end gap-1 mt-0.5">
                          <Car className="h-2.5 w-2.5" />
                          {l.vehicles.name}
                        </p>
                      )}
                    </div>
                  </div>
                  
                  {l.observacao && (
                    <p className="text-xs text-gray-500 dark:text-gray-400 mb-4 pl-12 italic">"{l.observacao}"</p>
                  )}

                  <div className="flex items-center justify-end gap-2 pl-12">
                    <button
                      onClick={() => handleEdit(l)}
                      className="flex items-center gap-1.5 px-4 py-2 text-[10px] font-bold uppercase tracking-wider text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                    >
                      <Edit2 className="h-3.5 w-3.5" />
                      Editar
                    </button>
                    <button
                      onClick={() => confirmDelete(l.id)}
                      className="flex items-center gap-1.5 px-4 py-2 text-[10px] font-bold uppercase tracking-wider text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded-lg hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Excluir
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

          {hasMore && (
            <div className="p-6 border-t border-gray-50 dark:border-gray-800 text-center">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setVisibleCount(prev => prev + 20)}
                className="text-xs font-bold uppercase tracking-wider text-gray-400 hover:text-gray-900 dark:text-gray-500 dark:hover:text-gray-100"
              >
                Carregar mais lançamentos
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Modal
        isOpen={deleteModalOpen}
        onClose={() => setDeleteModalOpen(false)}
        title="Confirmar Exclusão"
      >
        <p className="mb-6 text-sm text-gray-600 dark:text-gray-300">
          Tem certeza que deseja excluir este lançamento? Esta ação não poderá ser desfeita.
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
        isOpen={isExportModalOpen}
        onClose={() => setIsExportModalOpen(false)}
        title="Exportar Lançamentos"
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Escolha o formato para exportar os lançamentos do mês selecionado.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Button
              variant="outline"
              className="h-24 flex flex-col items-center justify-center gap-2 hover:border-red-500 hover:text-red-600 dark:hover:border-red-400 dark:hover:text-red-400"
              onClick={exportToPDF}
              disabled={exportLoading}
            >
              <Download className="h-6 w-6" />
              <span>PDF</span>
            </Button>
            <Button
              variant="outline"
              className="h-24 flex flex-col items-center justify-center gap-2 hover:border-green-500 hover:text-green-600 dark:hover:border-green-400 dark:hover:text-green-400"
              onClick={() => exportToExcel('xlsx')}
              disabled={exportLoading}
            >
              <Download className="h-6 w-6" />
              <span>Excel (.xlsx)</span>
            </Button>
            <Button
              variant="outline"
              className="h-24 flex flex-col items-center justify-center gap-2 hover:border-blue-500 hover:text-blue-600 dark:hover:border-blue-400 dark:hover:text-blue-400"
              onClick={() => exportToExcel('csv')}
              disabled={exportLoading}
            >
              <Download className="h-6 w-6" />
              <span>CSV</span>
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
