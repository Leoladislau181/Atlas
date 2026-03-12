export type TipoLancamento = 'receita' | 'despesa';

export interface Categoria {
  id: string;
  user_id: string;
  nome: string;
  tipo: TipoLancamento;
  is_system_default?: boolean;
  created_at: string;
}

export interface Vehicle {
  id: string;
  user_id: string;
  name: string;
  plate: string;
  type: 'own' | 'rented';
  status: 'active' | 'sold' | 'deactivated';
  initial_odometer: number;
  contract_value?: number;
  contract_start_date?: string;
  contract_end_date?: string;
  contract_initial_km?: number;
  contract_km_limit?: number;
  profit_goal?: number;
  maintenance_reserve?: number;
  created_at: string;
}

export interface Manutencao {
  id: string;
  user_id: string;
  vehicle_id: string;
  tipo: string;
  intervalo_km: number;
  ultimo_km_realizado: number;
  aviso_km_antes: number;
  created_at: string;
}

export interface Lancamento {
  id: string;
  user_id: string;
  tipo: TipoLancamento;
  categoria_id: string;
  valor: number;
  data: string;
  observacao: string;
  created_at: string;
  categorias?: Categoria; // Joined data
  vehicle_id?: string;
  odometer?: number;
  fuel_liters?: number;
  fuel_price_per_liter?: number;
  vehicles?: Vehicle; // Joined data
}

export interface User {
  id: string;
  email: string;
  nome?: string;
  telefone?: string;
  foto_url?: string;
  referral_code?: string;
  referred_by?: string;
  premium_until?: string;
}
