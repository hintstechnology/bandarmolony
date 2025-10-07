import React from 'react';

interface TableProps {
  children: React.ReactNode;
  className?: string;
}

export function Table({ children, className = '' }: TableProps) {
  return (
    <div className="relative w-full overflow-auto">
      <table className={`w-full caption-bottom text-sm ${className}`}>
        {children}
      </table>
    </div>
  );
}

export function TableHeader({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <thead className={`border-b ${className}`}>{children}</thead>;
}

export function TableBody({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <tbody className={`[&_tr:last-child]:border-0 ${className}`}>{children}</tbody>;
}

export function TableRow({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <tr className={`border-b transition-colors hover:bg-muted/50 ${className}`}>{children}</tr>;
}

export function TableHead({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <th className={`h-12 px-4 text-left align-middle font-medium text-muted-foreground ${className}`}>{children}</th>;
}

export function TableCell({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <td className={`p-4 align-middle ${className}`}>{children}</td>;
}