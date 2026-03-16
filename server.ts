import express from "express";
import { createServer as createViteServer } from "vite";
import { createClient } from "@supabase/supabase-js";
import path from "path";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json());

// Admin API Routes
app.get("/api/admin/users", async (req, res) => {
  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return res.status(500).json({ 
      error: "SUPABASE_SERVICE_ROLE_KEY ou VITE_SUPABASE_URL não configurados nos Secrets." 
    });
  }

  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });

  try {
    const { data: { users }, error } = await supabaseAdmin.auth.admin.listUsers();
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
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/admin/stats", async (req, res) => {
  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return res.status(500).json({ error: "Configuração ausente." });
  }

  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });

  try {
    const { count: totalLancamentos } = await supabaseAdmin.from('lancamentos').select('*', { count: 'exact', head: true });
    const { count: totalVeiculos } = await supabaseAdmin.from('vehicles').select('*', { count: 'exact', head: true });
    const { count: totalManutencoes } = await supabaseAdmin.from('manutencoes').select('*', { count: 'exact', head: true });

    res.json({
      totalLancamentos: totalLancamentos || 0,
      totalVeiculos: totalVeiculos || 0,
      totalManutencoes: totalManutencoes || 0
    });
  } catch (error: any) {
    console.error("Erro ao buscar estatísticas:", error);
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/admin/users/:id/stats", async (req, res) => {
  const { id } = req.params;
  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return res.status(500).json({ error: "Configuração ausente." });
  }

  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });

  try {
    const { count: totalLancamentos } = await supabaseAdmin.from('lancamentos').select('*', { count: 'exact', head: true }).eq('user_id', id);
    const { count: totalVeiculos } = await supabaseAdmin.from('vehicles').select('*', { count: 'exact', head: true }).eq('user_id', id);
    const { count: totalManutencoes } = await supabaseAdmin.from('manutencoes').select('*', { count: 'exact', head: true }).eq('user_id', id);

    res.json({
      totalLancamentos: totalLancamentos || 0,
      totalVeiculos: totalVeiculos || 0,
      totalManutencoes: totalManutencoes || 0
    });
  } catch (error: any) {
    console.error("Erro ao buscar estatísticas do usuário:", error);
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/admin/users/:id/premium", async (req, res) => {
  const { id } = req.params;
  const { premium_until } = req.body;
  
  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return res.status(500).json({ error: "Configuração ausente." });
  }

  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });

  try {
    const { data: user, error: fetchError } = await supabaseAdmin.auth.admin.getUserById(id);
    if (fetchError) throw fetchError;

    const currentMetadata = user.user.user_metadata || {};
    
    const { data, error } = await supabaseAdmin.auth.admin.updateUserById(id, {
      user_metadata: {
        ...currentMetadata,
        premium_until
      }
    });

    if (error) throw error;
    res.json({ success: true, user: data.user });
  } catch (error: any) {
    console.error("Erro ao atualizar usuário:", error);
    res.status(500).json({ error: error.message });
  }
});

async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
