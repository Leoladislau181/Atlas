import React, { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Check, Star, Zap, Shield, FileText, Car, Gift } from 'lucide-react';
import { User } from '@/types';
import { isPremium } from '@/lib/utils';
import { supabase } from '@/lib/supabase';

interface PremiumProps {
  user: User;
  refetch: () => void;
}

export function Premium({ user, refetch }: PremiumProps) {
  const [loading, setLoading] = useState(false);
  const isUserPremium = isPremium(user);

  const handleSubscribe = async (plan: 'monthly' | 'yearly') => {
    // Aqui no futuro chamaremos a API do Stripe/Mercado Pago
    alert(`Em breve! Integração com pagamento para o plano ${plan === 'monthly' ? 'Mensal (R$ 14,90)' : 'Anual (R$ 99,90)'}.`);
  };

  return (
    <div className="max-w-5xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="text-center space-y-4 mb-12">
        <div className="inline-flex items-center justify-center p-3 bg-amber-100 dark:bg-amber-900/30 rounded-full mb-4">
          <Star className="h-8 w-8 text-amber-600 dark:text-amber-400" />
        </div>
        <h1 className="text-4xl font-extrabold tracking-tight text-gray-900 dark:text-white">
          Atlas <span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-500 to-orange-600">Premium</span>
        </h1>
        <p className="text-lg text-gray-600 dark:text-gray-400 max-w-2xl mx-auto">
          Desbloqueie todo o potencial do seu negócio. Ferramentas inteligentes para motoristas que querem lucrar mais e gastar menos.
        </p>
      </div>

      {isUserPremium && (
        <div className="bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-2xl p-6 mb-8 text-center">
          <Shield className="h-12 w-12 text-emerald-500 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-emerald-800 dark:text-emerald-400 mb-2">Você já é Premium!</h2>
          <p className="text-emerald-600 dark:text-emerald-500">
            Seu plano está ativo até {new Date(user.premium_until!).toLocaleDateString('pt-BR')}. Aproveite todos os recursos!
          </p>
        </div>
      )}

      <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto">
        {/* Plano Mensal */}
        <Card className="relative overflow-hidden border-2 border-gray-200 dark:border-gray-800 hover:border-amber-300 dark:hover:border-amber-700 transition-all duration-300">
          <CardContent className="p-8">
            <div className="mb-8">
              <h3 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">Mensal</h3>
              <p className="text-gray-500 dark:text-gray-400 text-sm">Ideal para testar e ter flexibilidade.</p>
            </div>
            <div className="mb-8">
              <span className="text-5xl font-extrabold text-gray-900 dark:text-white">R$ 14,90</span>
              <span className="text-gray-500 dark:text-gray-400">/mês</span>
            </div>
            
            <ul className="space-y-4 mb-8">
              <li className="flex items-start gap-3">
                <Check className="h-5 w-5 text-emerald-500 shrink-0 mt-0.5" />
                <span className="text-gray-600 dark:text-gray-300"><strong>Lançamentos Ilimitados</strong> (O grátis trava em 50/mês)</span>
              </li>
              <li className="flex items-start gap-3">
                <Check className="h-5 w-5 text-emerald-500 shrink-0 mt-0.5" />
                <span className="text-gray-600 dark:text-gray-300"><strong>Leitura de Notas com IA</strong> (Bateu foto, preencheu)</span>
              </li>
              <li className="flex items-start gap-3">
                <Check className="h-5 w-5 text-emerald-500 shrink-0 mt-0.5" />
                <span className="text-gray-600 dark:text-gray-300"><strong>Plano de Manutenção</strong> (Avisos de troca de óleo, etc)</span>
              </li>
              <li className="flex items-start gap-3">
                <Check className="h-5 w-5 text-emerald-500 shrink-0 mt-0.5" />
                <span className="text-gray-600 dark:text-gray-300"><strong>Exportação de Relatórios</strong> (Para contador/IR)</span>
              </li>
              <li className="flex items-start gap-3">
                <Check className="h-5 w-5 text-emerald-500 shrink-0 mt-0.5" />
                <span className="text-gray-600 dark:text-gray-300"><strong>Sistema de Indicação</strong> (Ganhe meses grátis)</span>
              </li>
            </ul>

            <Button 
              onClick={() => handleSubscribe('monthly')}
              disabled={isUserPremium || loading}
              className="w-full h-12 text-lg font-semibold bg-gray-900 hover:bg-gray-800 dark:bg-white dark:text-gray-900 dark:hover:bg-gray-100"
            >
              {isUserPremium ? 'Plano Ativo' : 'Assinar Mensal'}
            </Button>
          </CardContent>
        </Card>

        {/* Plano Anual */}
        <Card className="relative overflow-hidden border-2 border-amber-500 shadow-xl shadow-amber-500/10 transform md:-translate-y-4">
          <div className="absolute top-0 inset-x-0 h-1.5 bg-gradient-to-r from-amber-400 to-orange-500"></div>
          <div className="absolute top-4 right-4 bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-400 text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wider">
            Mais Popular
          </div>
          <CardContent className="p-8">
            <div className="mb-8">
              <h3 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">Anual</h3>
              <p className="text-gray-500 dark:text-gray-400 text-sm">Economize 44% e garanta um ano de tranquilidade.</p>
            </div>
            <div className="mb-8">
              <div className="flex items-baseline gap-2">
                <span className="text-5xl font-extrabold text-gray-900 dark:text-white">R$ 99,90</span>
                <span className="text-gray-500 dark:text-gray-400">/ano</span>
              </div>
              <p className="text-sm text-emerald-600 dark:text-emerald-400 font-medium mt-2">
                Equivale a apenas R$ 8,32 por mês!
              </p>
            </div>
            
            <ul className="space-y-4 mb-8">
              <li className="flex items-start gap-3">
                <Check className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
                <span className="text-gray-600 dark:text-gray-300 font-medium">Todos os benefícios do plano Mensal</span>
              </li>
              <li className="flex items-start gap-3">
                <Check className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
                <span className="text-gray-600 dark:text-gray-300"><strong>Desconto de 44%</strong> (Pague 6, leve 12)</span>
              </li>
              <li className="flex items-start gap-3">
                <Check className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
                <span className="text-gray-600 dark:text-gray-300"><strong>Suporte Prioritário</strong> via WhatsApp</span>
              </li>
              <li className="flex items-start gap-3">
                <Check className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
                <span className="text-gray-600 dark:text-gray-300"><strong>Acesso antecipado</strong> a novas funcionalidades</span>
              </li>
            </ul>

            <Button 
              onClick={() => handleSubscribe('yearly')}
              disabled={isUserPremium || loading}
              className="w-full h-12 text-lg font-semibold bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 text-white shadow-lg shadow-amber-500/25 border-0"
            >
              {isUserPremium ? 'Plano Ativo' : 'Assinar Anual com Desconto'}
            </Button>
          </CardContent>
        </Card>
      </div>
      
      <div className="mt-16 text-center">
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Pagamento seguro via PIX ou Cartão de Crédito. Cancele quando quiser.
        </p>
      </div>
    </div>
  );
}
