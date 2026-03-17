import express from "express";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config();

const app = express();
app.use(express.json());

// Helper function to add timeout to promises
const withTimeout = <T>(promise: Promise<T>, timeoutMs: number, errorMessage: string): Promise<T> => {
  let timeoutHandle: NodeJS.Timeout;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutHandle = setTimeout(() => reject(new Error(errorMessage)), timeoutMs);
  });
  return Promise.race([
    promise,
    timeoutPromise
  ]).finally(() => clearTimeout(timeoutHandle));
};

app.get(["/api/admin/users", "/api/admin/users/", "/admin/users", "/admin/users/"], async (req, res) => {
  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return res.status(500).json({ 
      error: "SUPABASE_SERVICE_ROLE_KEY ou VITE_SUPABASE_URL não configurados nos Secrets." 
    });
  }

  try {
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });

    const { data: { users }, error } = await withTimeout(
      supabaseAdmin.auth.admin.listUsers(),
      15000,
      "A requisição ao Supabase demorou muito. O projeto pode estar pausado ou a URL está incorreta."
    );
    
    if (error) throw error;

    const formattedUsers = users.map(u => ({
      id: u.id,
      email: u.email,
      created_at: u.created_at,
      last_sign_in_at: u.last_sign_in_at,
      ...u.user_metadata
    }));

    res.json(formattedUsers);
  } catch (error: any) {
    console.error("Erro ao buscar usuários:", error);
    res.status(500).json({ error: error.message || "Erro interno do servidor" });
  }
});

app.get(["/api/admin/stats", "/api/admin/stats/", "/admin/stats", "/admin/stats/"], async (req, res) => {
  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return res.status(500).json({ error: "Configuração ausente." });
  }

  try {
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    const [lancamentosRes, veiculosRes, manutencoesRes] = await withTimeout(
      Promise.all([
        supabaseAdmin.from('lancamentos').select('*', { count: 'exact', head: true }),
        supabaseAdmin.from('vehicles').select('*', { count: 'exact', head: true }),
        supabaseAdmin.from('manutencoes').select('*', { count: 'exact', head: true })
      ]),
      15000,
      "A requisição ao Supabase demorou muito. O projeto pode estar pausado ou a URL está incorreta."
    );

    res.json({
      totalLancamentos: lancamentosRes.count || 0,
      totalVeiculos: veiculosRes.count || 0,
      totalManutencoes: manutencoesRes.count || 0
    });
  } catch (error: any) {
    console.error("Erro ao buscar estatísticas:", error);
    res.status(500).json({ error: error.message || "Erro interno do servidor" });
  }
});

app.get(["/api/admin/users/:id/stats", "/admin/users/:id/stats"], async (req, res) => {
  const { id } = req.params;
  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return res.status(500).json({ error: "Configuração ausente." });
  }

  try {
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    const [lancamentosRes, veiculosRes, manutencoesRes] = await withTimeout(
      Promise.all([
        supabaseAdmin.from('lancamentos').select('*', { count: 'exact', head: true }).eq('user_id', id),
        supabaseAdmin.from('vehicles').select('*', { count: 'exact', head: true }).eq('user_id', id),
        supabaseAdmin.from('manutencoes').select('*', { count: 'exact', head: true }).eq('user_id', id)
      ]),
      15000,
      "A requisição ao Supabase demorou muito. O projeto pode estar pausado ou a URL está incorreta."
    );

    res.json({
      totalLancamentos: lancamentosRes.count || 0,
      totalVeiculos: veiculosRes.count || 0,
      totalManutencoes: manutencoesRes.count || 0
    });
  } catch (error: any) {
    console.error("Erro ao buscar estatísticas do usuário:", error);
    res.status(500).json({ error: error.message || "Erro interno do servidor" });
  }
});

app.post(["/api/admin/users/:id/premium", "/admin/users/:id/premium"], async (req, res) => {
  const { id } = req.params;
  const { premium_until } = req.body;
  
  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return res.status(500).json({ error: "Configuração ausente." });
  }

  try {
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    const { data: user, error: fetchError } = await withTimeout(
      supabaseAdmin.auth.admin.getUserById(id),
      15000,
      "A requisição ao Supabase demorou muito. O projeto pode estar pausado ou a URL está incorreta."
    );
    if (fetchError) throw fetchError;

    const currentMetadata = user.user.user_metadata || {};
    
    const { data, error } = await withTimeout(
      supabaseAdmin.auth.admin.updateUserById(id, {
        user_metadata: {
          ...currentMetadata,
          premium_until
        }
      }),
      15000,
      "A requisição ao Supabase demorou muito. O projeto pode estar pausado ou a URL está incorreta."
    );

    if (error) throw error;
    res.json({ success: true, user: data.user });
  } catch (error: any) {
    console.error("Erro ao atualizar usuário:", error);
    res.status(500).json({ error: error.message || "Erro interno do servidor" });
  }
});

export default app;
