import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Categoria, Lancamento, Vehicle, Manutencao } from '@/types';

export function useFinanceData() {
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [lancamentos, setLancamentos] = useState<Lancamento[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [manutencoes, setManutencoes] = useState<Manutencao[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
    setLoading(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData.user?.id;

      let { data: catData, error: catError } = await supabase
        .from('categorias')
        .select('*')
        .order('nome');
      
      if (catError) throw catError;

      // Check and create default categories if they don't exist
      if (userId && catData) {
        const defaultCategories = [
          { nome: 'Manutenção', tipo: 'despesa', is_system_default: true },
          { nome: 'Combustível', tipo: 'despesa', is_system_default: true },
          { nome: 'Particular', tipo: 'receita', is_system_default: true }
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
          }
        }
      }

      setCategorias(catData || []);

      const { data: vehData, error: vehError } = await supabase
        .from('vehicles')
        .select('*')
        .order('name');
      
      if (vehError && vehError.code !== '42P01') throw vehError; // Ignore if table doesn't exist yet
      setVehicles(vehData || []);

      const { data: manData, error: manError } = await supabase
        .from('manutencoes')
        .select('*')
        .order('created_at', { ascending: false });
        
      if (manError && manError.code !== '42P01') throw manError;
      setManutencoes(manData || []);

      const { data: lanData, error: lanError } = await supabase
        .from('lancamentos')
        .select('*, categorias(*), vehicles(*)')
        .order('data', { ascending: false });

      if (lanError) throw lanError;
      setLancamentos(lanData || []);
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  return { categorias, lancamentos, vehicles, manutencoes, loading, refetch: fetchData };
}
