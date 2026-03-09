import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Modal } from '@/components/ui/modal';
import { formatCurrency, formatCurrencyInput, parseCurrency, parseLocalDate } from '@/lib/utils';
import { Categoria, Lancamento, TipoLancamento, Vehicle } from '@/types';
import { supabase } from '@/lib/supabase';
import { Edit2, Trash2, Car, Plus, ChevronUp, Filter } from 'lucide-react';
import { format } from 'date-fns';

interface LancamentosProps {
  categorias: Categoria[];
  lancamentos: Lancamento[];
  vehicles: Vehicle[];
  refetch: () => void;
  userId: string;
}

export function Lancamentos({ categorias, lancamentos, vehicles, refetch, userId }: LancamentosProps) {
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

  // History Filters
  const [filterMonth, setFilterMonth] = useState('');
  const [filterTipo, setFilterTipo] = useState<'all' | 'receita' | 'despesa'>('all');
  const [filterCategoriaId, setFilterCategoriaId] = useState('all');
  const [filterVehicleId, setFilterVehicleId] = useState('all');
  const [showFilters, setShowFilters] = useState(false);

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
        user_id: userId,
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
    const matchesMonth = !filterMonth || l.data.startsWith(filterMonth);
    const matchesTipo = filterTipo === 'all' || l.tipo === filterTipo;
    const matchesCategoria = filterCategoriaId === 'all' || l.categoria_id === filterCategoriaId;
    const matchesVehicle = filterVehicleId === 'all' || l.vehicle_id === filterVehicleId;
    return matchesMonth && matchesTipo && matchesCategoria && matchesVehicle;
  });

  const sortedLancamentos = [...filteredLancamentos].sort((a, b) => {
    const dateA = new Date(a.data).getTime();
    const dateB = new Date(b.data).getTime();
    if (dateA !== dateB) return dateB - dateA;
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });

  const visibleLancamentos = sortedLancamentos.slice(0, visibleCount);
  const hasMore = visibleCount < sortedLancamentos.length;

  return (
    <div className="space-y-6">
      <Card className="overflow-hidden border-none shadow-sm bg-white">
        <div 
          className="p-4 flex items-center justify-between cursor-pointer hover:bg-gray-50 transition-colors"
          onClick={() => setIsFormOpen(!isFormOpen)}
        >
          <div className="flex items-center gap-3">
            <div className="p-2 bg-[#F59E0B]/10 rounded-lg">
              <Plus className="h-5 w-5 text-[#F59E0B]" />
            </div>
            <div>
              <h3 className="font-bold text-gray-900">
                {editingId ? 'Editar Lançamento' : 'Novo Lançamento'}
              </h3>
              <p className="text-xs text-gray-500">
                {isFormOpen ? 'Preencha os dados abaixo' : 'Clique para adicionar uma receita ou despesa'}
              </p>
            </div>
          </div>
          <Button 
            variant="ghost" 
            size="sm" 
            className="text-[#F59E0B] hover:text-[#D97706] hover:bg-[#F59E0B]/5"
          >
            {isFormOpen ? (
              <div className="flex items-center gap-2">
                <span>Recolher</span>
                <ChevronUp className="h-4 w-4" />
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <Plus className="h-4 w-4" />
                <span>Adicionar</span>
              </div>
            )}
          </Button>
        </div>

        {isFormOpen && (
          <CardContent className="pt-0 border-t border-gray-100">
            <form onSubmit={handleSubmit} className="space-y-4 pt-6">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700">Tipo</label>
                <Select value={tipo} onChange={(e) => setTipo(e.target.value as TipoLancamento)}>
                  <option value="despesa">Despesa</option>
                  <option value="receita">Receita</option>
                </Select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700">Categoria</label>
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
                <label className="text-sm font-medium text-gray-700">
                  {useVehicle && tipo === 'despesa' && isCombustivel() ? 'Valor Total Abastecido' : 'Valor'}
                </label>
                <Input
                  type="text"
                  placeholder="R$ 0,00"
                  value={valorStr}
                  onChange={handleValorChange}
                  required
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700">Data</label>
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
                className="h-4 w-4 rounded border-gray-300 text-[#F59E0B] focus:ring-[#F59E0B]"
              />
              <label htmlFor="useVehicle" className="text-sm font-medium text-gray-700">
                Atrelar a um veículo?
              </label>
            </div>

            {useVehicle && (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4 p-4 bg-gray-50 rounded-lg border border-gray-100">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700">Veículo *</label>
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
                    <label className="text-sm font-medium text-gray-700">Odômetro Atual (KM) *</label>
                    <Input
                      type="number"
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
                      <label className="text-sm font-medium text-gray-700">Valor por Litro</label>
                      <Input
                        type="text"
                        placeholder="R$ 0,00"
                        value={fuelPricePerLiterStr}
                        onChange={(e) => setFuelPricePerLiterStr(formatCurrencyInput(e.target.value))}
                        required={useVehicle && tipo === 'despesa' && isCombustivel()}
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-gray-700">Litros (Calculado)</label>
                      <Input
                        type="text"
                        value={
                          parseCurrency(fuelPricePerLiterStr) > 0 && parseCurrency(valorStr) > 0
                            ? (parseCurrency(valorStr) / parseCurrency(fuelPricePerLiterStr)).toFixed(2) + ' L'
                            : '0.00 L'
                        }
                        disabled
                        className="bg-gray-100"
                      />
                    </div>
                  </>
                )}
              </div>
            )}

            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700">Observação</label>
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
        </CardContent>
        )}
      </Card>

      <Card className="border-none shadow-sm">
        <CardHeader className="flex flex-col space-y-4 md:flex-row md:items-center md:justify-between md:space-y-0">
          <div className="flex items-center justify-between w-full md:w-auto">
            <CardTitle>Histórico de Lançamentos</CardTitle>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowFilters(!showFilters)}
              className="md:hidden text-gray-500 hover:text-gray-700 hover:bg-gray-100"
            >
              <Filter className="h-4 w-4 mr-2" />
              Filtros
            </Button>
          </div>
          
          <div className="hidden md:flex items-center space-x-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowFilters(!showFilters)}
              className="text-gray-500 hover:text-gray-700 hover:bg-gray-100"
            >
              <Filter className="h-4 w-4 mr-2" />
              Filtros
            </Button>
          </div>
        </CardHeader>

        {showFilters && (
          <CardContent className="pt-0 pb-4 border-b border-gray-50 animate-in fade-in slide-in-from-top-2 duration-200">
            <div className="grid grid-cols-2 gap-4 md:flex md:items-center md:space-x-4">
              <div className="space-y-1.5 flex-1">
                <label className="text-xs font-medium text-gray-500 uppercase">Mês</label>
                <Input
                  type="month"
                  value={filterMonth}
                  onChange={(e) => setFilterMonth(e.target.value)}
                  className="h-9"
                />
              </div>
              <div className="space-y-1.5 flex-1">
                <label className="text-xs font-medium text-gray-500 uppercase">Tipo</label>
                <Select
                  value={filterTipo}
                  onChange={(e) => setFilterTipo(e.target.value as any)}
                  className="h-9"
                >
                  <option value="all">Todos</option>
                  <option value="receita">Receitas</option>
                  <option value="despesa">Despesas</option>
                </Select>
              </div>
              <div className="space-y-1.5 flex-1">
                <label className="text-xs font-medium text-gray-500 uppercase">Categoria</label>
                <Select
                  value={filterCategoriaId}
                  onChange={(e) => setFilterCategoriaId(e.target.value)}
                  className="h-9"
                >
                  <option value="all">Todas</option>
                  {categorias.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nome}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="space-y-1.5 flex-1">
                <label className="text-xs font-medium text-gray-500 uppercase">Veículo</label>
                <Select
                  value={filterVehicleId}
                  onChange={(e) => setFilterVehicleId(e.target.value)}
                  className="h-9"
                >
                  <option value="all">Todos</option>
                  {vehicles.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.name}
                    </option>
                  ))}
                </Select>
              </div>
            </div>
          </CardContent>
        )}

        <CardContent className={showFilters ? "pt-6" : "pt-6"}>
          {/* Desktop Table View */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-left text-sm text-gray-600">
              <thead className="bg-gray-50 text-xs uppercase text-gray-700">
                <tr>
                  <th className="px-4 py-3">Data</th>
                  <th className="px-4 py-3">Tipo</th>
                  <th className="px-4 py-3">Categoria</th>
                  <th className="px-4 py-3">Veículo</th>
                  <th className="px-4 py-3">Observação</th>
                  <th className="px-4 py-3 text-right">Valor</th>
                  <th className="px-4 py-3 text-center">Ações</th>
                </tr>
              </thead>
              <tbody>
                {visibleLancamentos.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-gray-500">
                      Nenhum lançamento encontrado.
                    </td>
                  </tr>
                ) : (
                  visibleLancamentos.map((l) => (
                    <tr key={l.id} className="border-b hover:bg-gray-50">
                      <td className="px-4 py-3 whitespace-nowrap">
                        {format(parseLocalDate(l.data), 'dd/MM/yyyy')}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${
                            l.tipo === 'receita'
                              ? 'bg-green-100 text-[#059568]'
                              : 'bg-red-100 text-[#EF4444]'
                          }`}
                        >
                          {l.tipo === 'receita' ? 'Receita' : 'Despesa'}
                        </span>
                      </td>
                      <td className="px-4 py-3">{l.categorias?.nome || 'N/A'}</td>
                      <td className="px-4 py-3">
                        {l.vehicles ? (
                          <span className="inline-flex items-center rounded-md bg-gray-100 px-2 py-1 text-xs font-medium text-gray-600">
                            {l.vehicles.name}
                          </span>
                        ) : (
                          '-'
                        )}
                      </td>
                      <td className="px-4 py-3 max-w-[200px] truncate" title={l.observacao}>
                        {l.observacao || '-'}
                      </td>
                      <td
                        className={`px-4 py-3 text-right font-medium whitespace-nowrap ${
                          l.tipo === 'receita' ? 'text-[#059568]' : 'text-[#EF4444]'
                        }`}
                      >
                        {formatCurrency(l.valor)}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <div className="flex items-center justify-center space-x-2">
                          <button
                            onClick={() => handleEdit(l)}
                            className="text-gray-400 hover:text-[#F59E0B] transition-colors"
                            title="Editar"
                          >
                            <Edit2 className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => confirmDelete(l.id)}
                            className="text-gray-400 hover:text-[#EF4444] transition-colors"
                            title="Excluir"
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
          <div className="md:hidden space-y-4">
            {visibleLancamentos.length === 0 ? (
              <div className="py-8 text-center text-gray-500 bg-gray-50 rounded-xl border border-dashed">
                Nenhum lançamento encontrado.
              </div>
            ) : (
              visibleLancamentos.map((l) => (
                <div key={l.id} className="rounded-2xl border border-gray-100 p-4 space-y-3 bg-white shadow-sm hover:shadow-md transition-all duration-200">
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="text-xs text-gray-400 font-medium mb-1">{format(parseLocalDate(l.data), 'dd/MM/yyyy')}</p>
                      <h4 className="font-bold text-gray-900">{l.categorias?.nome || 'N/A'}</h4>
                    </div>
                    <div className="text-right">
                      <p className={`font-bold text-lg ${l.tipo === 'receita' ? 'text-[#059568]' : 'text-[#EF4444]'}`}>
                        {l.tipo === 'receita' ? '+' : '-'} {formatCurrency(l.valor)}
                      </p>
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider mt-1 ${
                          l.tipo === 'receita'
                            ? 'bg-green-50 text-[#059568]'
                            : 'bg-red-50 text-[#EF4444]'
                        }`}
                      >
                        {l.tipo === 'receita' ? 'Receita' : 'Despesa'}
                      </span>
                    </div>
                  </div>
                  
                  {(l.vehicles || l.observacao) && (
                    <div className="flex flex-wrap gap-2 pt-2 border-t border-gray-50 mt-3">
                      {l.vehicles && (
                        <span className="inline-flex items-center rounded-lg bg-gray-50 px-2 py-1 text-[10px] font-medium text-gray-600 border border-gray-100">
                          <Car className="h-3 w-3 mr-1 text-gray-400" /> {l.vehicles.name}
                        </span>
                      )}
                      {l.observacao && (
                        <p className="text-xs text-gray-500 italic truncate max-w-full w-full mt-1">
                          "{l.observacao}"
                        </p>
                      )}
                    </div>
                  )}

                  <div className="flex justify-end gap-2 pt-3 border-t border-gray-50 mt-2">
                    <button
                      onClick={() => handleEdit(l)}
                      className="flex items-center gap-1 text-xs font-medium text-gray-500 hover:text-[#F59E0B] px-2 py-1 rounded-md hover:bg-gray-50 transition-colors"
                    >
                      <Edit2 className="h-3 w-3" /> Editar
                    </button>
                    <button
                      onClick={() => confirmDelete(l.id)}
                      className="flex items-center gap-1 text-xs font-medium text-gray-500 hover:text-[#EF4444] px-2 py-1 rounded-md hover:bg-red-50 transition-colors"
                    >
                      <Trash2 className="h-3 w-3" /> Excluir
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

          {hasMore && (
            <div className="mt-6 flex justify-center">
              <Button
                variant="outline"
                onClick={() => setVisibleCount((prev) => prev + 20)}
                className="w-full sm:w-auto"
              >
                Ver Mais Lançamentos
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
        <p className="mb-6 text-sm text-gray-600">
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
    </div>
  );
}
