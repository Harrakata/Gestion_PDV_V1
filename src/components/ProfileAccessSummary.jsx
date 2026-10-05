import React, { useId, useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { getExploitationAccessLabel } from '@/lib/exploitationProfiles';

export default function ProfileAccessSummary({ accessCount, accessibleTabs, permissions = {} }) {
  const [expanded, setExpanded] = useState(false);
  const detailsId = useId();
  const Icon = expanded ? ChevronUp : ChevronDown;

  return <div className="min-w-[11rem] max-w-md space-y-2 whitespace-normal">
    <div className="flex flex-wrap gap-2">
      <Badge variant="outline" className="border-blue-200 bg-blue-50 text-blue-700">Lecture : {accessCount.readCount}</Badge>
      <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700">Écriture : {accessCount.writeCount}</Badge>
    </div>
    {accessibleTabs.length === 0 ? <p className="text-xs text-muted-foreground">Aucun onglet autorisé.</p> : <>
      <button type="button" aria-expanded={expanded} aria-controls={detailsId} onClick={() => setExpanded((value) => !value)}
        className="flex min-h-8 items-center gap-1.5 rounded-sm py-1 text-xs font-medium text-primary hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
        <Icon className="h-3.5 w-3.5 shrink-0" />
        {expanded ? 'Masquer les accès' : 'Voir les accès'}
        <span className="text-muted-foreground">({accessibleTabs.length})</span>
      </button>
      <div id={detailsId} hidden={!expanded}>
        {expanded && <ul aria-label="Onglets autorisés" tabIndex={0} className="max-h-48 space-y-1 overflow-y-auto overscroll-contain border-l border-border py-1 pl-3 pr-2 text-xs leading-relaxed text-muted-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary">
          {accessibleTabs.map((item) => {
            const level = permissions[item.key];
            const tone = level === 'write' ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
              : level === 'read' ? 'border-blue-200 bg-blue-50 text-blue-700' : 'text-muted-foreground';
            return <li key={item.key} className="flex items-start gap-2 py-0.5" style={{ paddingLeft: `${Math.min(item.depth || 0, 3) * 12}px` }}>
              <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">{item.label}</span>
              <Badge variant="outline" className={`shrink-0 whitespace-nowrap ${tone}`}>{getExploitationAccessLabel(level)}</Badge>
            </li>;
          })}
        </ul>}
      </div>
    </>}
  </div>;
}
