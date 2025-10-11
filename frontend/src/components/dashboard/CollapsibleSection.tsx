import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { ChevronDown, ChevronUp } from 'lucide-react';

interface CollapsibleSectionProps {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  defaultExpanded?: boolean;
}

export function CollapsibleSection({ 
  title, 
  subtitle, 
  children, 
  defaultExpanded = true 
}: CollapsibleSectionProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  // Sync with external state changes
  useEffect(() => {
    setIsExpanded(defaultExpanded);
  }, [defaultExpanded]);

  return (
    <Card>
      <CardHeader 
        className={`cursor-pointer hover:bg-muted/50 transition-colors ${isExpanded ? 'pb-6' : 'py-4'}`}
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <CardTitle className="flex items-center justify-between">
          <span>{title}</span>
          {isExpanded ? (
            <ChevronUp className="w-5 h-5 text-muted-foreground" />
          ) : (
            <ChevronDown className="w-5 h-5 text-muted-foreground" />
          )}
        </CardTitle>
        {subtitle && (
          <p className={`text-sm text-muted-foreground ${isExpanded ? 'mt-2' : 'mt-1'}`}>{subtitle}</p>
        )}
      </CardHeader>
      {isExpanded && (
        <CardContent className="pt-1">
          {children}
        </CardContent>
      )}
    </Card>
  );
}
