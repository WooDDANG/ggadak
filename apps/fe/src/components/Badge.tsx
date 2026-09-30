import React from 'react';

interface BadgeProps {
  children: React.ReactNode;
  variant?: 'draft' | 'decided' | 'superseded' | 'deferred' | 'rejected' | 'category' | 'default';
}

export const Badge: React.FC<BadgeProps> = ({ children, variant = 'default' }) => {
  const styles: Record<string, string> = {
    draft: 'bg-amber-500/20 text-amber-300 border border-amber-500/30',
    decided: 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30',
    superseded: 'bg-slate-700 text-slate-400 border border-slate-600',
    deferred: 'bg-purple-500/20 text-purple-300 border border-purple-500/30',
    rejected: 'bg-rose-500/20 text-rose-300 border border-rose-500/30',
    category: 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30',
    default: 'bg-slate-800 text-slate-300 border border-slate-700',
  };

  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium tracking-wide ${
        styles[variant] || styles.default
      }`}
    >
      {children}
    </span>
  );
};
