import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Categoria, Lancamento, Vehicle, Manutencao } from '@/types';

const checkedUsers = new Set<string>();
let isCreatingDefaults = false;

export function useFinanceData() {
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [lancamentos, setLancamentos] = useState<Lancamento[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [manutencoes, setManutencoes] = useState<Manutencao[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [userResult, catResult, vehResult, manResult, lanResult] = await Promise.all([
        supabase.auth.getUser(),
        supabase.from('categorias').select('*').order('nome'),
        supabase.from('vehicles').select('*').order('name'),
        supabase.from('manutencoes').select('*').order('created_at', { ascending: false }),
        supabase.from('lancamentos').select('*, categorias(*), vehicles(*)').order('data', { ascending: false })
      ]);

      const userId = userResult.data.user?.id;
      let catData = catResult.data;
      const catError = catResult.error;
      
      if (catError) throw catError;

      // Check and create default categories if they don't exist
      if (userId && catData && !checkedUsers.has(userId) && !isCreatingDefaults) {
        isCreatingDefaults = true;
        try {
          const defaultCategories = [
            { nome: 'Manutenção', tipo: 'despesa', is_system_default: true, is_deductible: true },
            { nome: 'Combustível', tipo: 'despesa', is_system_default: true, is_deductible: true },
            { nome: 'Particular', tipo: 'receita', is_system_default: true, is_deductible: false },
            { nome: 'Aluguel', tipo: 'despesa', is_system_default: true, is_deductible: true }
          ];

          const missingDefaults = defaultCategories.filter(
            def => !catData!.some(c => c.nome.toLowerCase() === def.nome.toLowerCase() && c.tipo === def.tipo)
          );

          if (missingDefaults.length > 0) {
            const { data: newCats, error: insertError } = await supabase
              .from('categorias')
              .insert(missingDefaults.map(def => ({ ...def, user_id: userId })))
              .select();
            
            if (!insertError && newCats) {
              catData = [...catData, ...newCats].sort((a, b) => a.nome.localeCompare(b.nome));
              checkedUsers.add(userId);
            }
          } else {
            checkedUsers.add(userId);
          }
        } finally {
          isCreatingDefaults = false;
        }
      }

      setCategorias(catData || []);

      const vehError = vehResult.error;
      if (vehError && vehError.code !== '42P01') throw vehError; // Ignore if table doesn't exist yet
      setVehicles(vehResult.data || []);

      const manError = manResult.error;
      if (manError && manError.code !== '42P01') throw manError;
      setManutencoes(manResult.data || []);

      const lanError = lanResult.error;
      if (lanError) throw lanError;
      setLancamentos(lanResult.data || []);
    } catch (error: any) {
      console.error('Error fetching data:', error);
      setError(error.message || 'Erro ao carregar dados do banco de dados.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  return { categorias, lancamentos, vehicles, manutencoes, loading, error, refetch: fetchData };
}
