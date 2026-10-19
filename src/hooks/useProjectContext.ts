import { useEffect, useState } from 'react';
import { database } from '@/database';
import Project from '@/database/models/Project';
import ConstructionObject from '@/database/models/ConstructionObject';
import { useTranslation } from '@/i18n';

/** Mobile projects are ERP sites; construction_objects are their parent ERP projects. */
export function useProjectContext(projectId?: string | null) {
  const { t } = useTranslation();
  const [sites, setSites] = useState<Project[]>([]), [projects, setProjects] = useState<ConstructionObject[]>([]);
  useEffect(() => {
    const a = database.get<Project>('projects').query().observe().subscribe(setSites);
    const b = database.get<ConstructionObject>('construction_objects').query().observe().subscribe(setProjects);
    return () => { a.unsubscribe(); b.unsubscribe(); };
  }, []);
  const site = sites.find(p => p.id === projectId), project = projects.find(p => p.id === site?.objectId);
  return t('work.project') + ': ' + (project?.name || t('ui.not_specified_47846'))
    + '\n' + t('work.object') + ': ' + (site?.name || t('ui.not_specified_47846'));
}
