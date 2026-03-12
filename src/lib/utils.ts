import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { User } from '@/types';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function isPremium(user: User | null | undefined): boolean {
  if (!user) return false;
  if (!user.premium_until) return false;
  const premiumUntil = new Date(user.premium_until);
  return premiumUntil > new Date();
}

export function formatCurrency(value: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value);
}

export function parseCurrency(value: string): number {
  const cleanValue = value.replace(/\D/g, '');
  return Number(cleanValue) / 100;
}

export function formatCurrencyInput(value: string): string {
  const cleanValue = value.replace(/\D/g, '');
  if (!cleanValue) return '';
  const numberValue = Number(cleanValue) / 100;
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(numberValue);
}

export function parseLocalDate(dateString: string): Date {
  if (!dateString) return new Date();
  const [year, month, day] = dateString.split('-').map(Number);
  return new Date(year, month - 1, day);
}
