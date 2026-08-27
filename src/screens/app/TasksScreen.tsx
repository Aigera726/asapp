import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { AppStackParamList, TabParamList } from '@/navigation';
import { database } from '@/database';
import { Q } from '@nozbe/watermelondb';

import WorkAssignment from '@/database/models/WorkAssignment';
import Contract from '@/database/models/Contract';
import Project from '@/database/models/Project';
import ConstructionObject from '@/database/models/ConstructionObject';
import WbsItem from '@/database/models/WbsItem';
import EstimateWork from '@/database/models/EstimateWork';
import EstimateResource from '@/database/models/EstimateResource';
import Contractor from '@/database/models/Contractor';
import { T } from '@/theme';
import { Icon } from '@/components/Icon';

type TasksScreenRouteProp = RouteProp<TabParamList, 'Tasks'>;

interface WorkAssignmentWithName {
  id: string;
  contract_id: string;
  estimate_work_id: string | null;
  wbs_item_id: string | null;
  resource_id: string | null;
  assigned_quantity: number | null;
  status: 'PLANNED' | 'IN_PROGRESS' | 'COMPLETED' | 'SUSPENDED';
  work_name: string;
  work_unit: string;
  position_type: string;
  contract_number: string;
  contractor_name: string;
  project_id: string;
}

interface Props {
  route: TasksScreenRouteProp;
}

function TasksScreen({ route }: Props) {
  const navigation = useNavigation<NativeStackNavigationProp<AppStackParamList>>();
  const initialProjectId = route.params?.projectId;
  
  const [assignments, setAssignments] = useState<WorkAssignmentWithName[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters State
  const [objects, setObjects] = useState<ConstructionObject[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [contracts, setContracts] = useState<Contract[]>([]);

  const [selectedObjectId, setSelectedObjectId] = useState<string | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(initialProjectId || null);
  const [selectedContractId, setSelectedContractId] = useState<string | null>(null);

  // 1. Load Filter Options
  useEffect(() => {
    loadFilters();
  }, [selectedObjectId, selectedProjectId]);

  const loadFilters = async () => {
    try {
      // Find valid contracts, projects, and objects based on actual work assignments
      const allAssignments = await database.collections.get<WorkAssignment>('work_assignments').query().fetch();
      const validContractIds = new Set<string>();
      allAssignments.forEach(a => {
        if (a.contractId) validContractIds.add(a.contractId);
      });

      const validContracts = await database.collections.get<Contract>('contracts')
        .query(Q.where('id', Q.oneOf(Array.from(validContractIds)))).fetch();
        
      const validProjectIds = new Set<string>();
      validContracts.forEach(c => {
        if (c.projectId) validProjectIds.add(c.projectId);
      });

      const validProjects = await database.collections.get<Project>('projects')
        .query(Q.where('id', Q.oneOf(Array.from(validProjectIds)))).fetch();

      const validObjectIds = new Set<string>();
      validProjects.forEach(p => {
        if (p.objectId) validObjectIds.add(p.objectId);
      });

      const validObjects = await database.collections.get<ConstructionObject>('construction_objects')
        .query(Q.where('id', Q.oneOf(Array.from(validObjectIds)))).fetch();

      setObjects(validObjects);

      let filteredProjects = validProjects;
      if (selectedObjectId) {
        filteredProjects = validProjects.filter(p => p.objectId === selectedObjectId);
        if (selectedProjectId && !filteredProjects.find(p => p.id === selectedProjectId)) {
          setSelectedProjectId(null);
        }
      }
      setProjects(filteredProjects);

      let filteredContracts: Contract[] = [];
      if (selectedProjectId) {
        filteredContracts = validContracts.filter(c => c.projectId === selectedProjectId);
        if (selectedContractId && !filteredContracts.find(c => c.id === selectedContractId)) {
          setSelectedContractId(null);
        }
      } else {
        setSelectedContractId(null);
      }
      setContracts(filteredContracts);

    } catch (e) {
      console.error('[TasksScreen] Error loading filters:', e);
    }
  };

  // 2. Observe Assignments
  //
  // Загрузка асинхронная, а подписка перезапускается при каждой смене
  // фильтра. Без счётчика поколений медленный ответ старого фильтра
  // перетирал результат нового — на экране оказывался чужой список.
  const loadGeneration = useRef(0);

  useEffect(() => {
    const subscription = database.collections.get<WorkAssignment>('work_assignments')
      .query()
      .observe()
      .subscribe(() => {
        loadAssignments();
      });

    return () => {
      subscription.unsubscribe();
      loadGeneration.current += 1;
    };
  }, [selectedObjectId, selectedProjectId, selectedContractId]);

  const loadAssignments = async () => {
    const generation = ++loadGeneration.current;
    const isStale = () => generation !== loadGeneration.current;

    setLoading(true);
    try {
      let contractIdsToFilter: string[] | null = null;

      if (selectedContractId) {
        contractIdsToFilter = [selectedContractId];
      } else if (selectedProjectId) {
        const pContracts = await database.collections.get<Contract>('contracts')
          .query(Q.where('project_id', selectedProjectId)).fetch();
        contractIdsToFilter = pContracts.map(c => c.id);
      } else if (selectedObjectId) {
        const pProjects = await database.collections.get<Project>('projects')
          .query(Q.where('object_id', selectedObjectId)).fetch();
        const projectIds = pProjects.map(p => p.id);
        const oContracts = await database.collections.get<Contract>('contracts')
          .query(Q.where('project_id', Q.oneOf(projectIds))).fetch();
        contractIdsToFilter = oContracts.map(c => c.id);
      }

      let queryConditions: any[] = [];
      if (contractIdsToFilter !== null) {
         if (contractIdsToFilter.length === 0) {
           if (!isStale()) {
             setAssignments([]);
             setLoading(false);
           }
           return;
         }
         queryConditions.push(Q.where('contract_id', Q.oneOf(contractIdsToFilter)));
      }

      const rawAssignments = await database.collections.get<WorkAssignment>('work_assignments')
        .query(...queryConditions).fetch();

      if (rawAssignments.length === 0) {
        if (!isStale()) {
          setAssignments([]);
          setLoading(false);
        }
        return;
      }

      // Gather IDs
      const workIds = new Set<string>();
      const wbsIds = new Set<string>();
      const resourceIds = new Set<string>();
      const contractIds = new Set<string>();

      rawAssignments.forEach(wa => {
        if (wa.estimateWorkId) workIds.add(wa.estimateWorkId);
        if (wa.wbsItemId) wbsIds.add(wa.wbsItemId);
        if (wa.resourceId) resourceIds.add(wa.resourceId);
        if (wa.contractId) contractIds.add(wa.contractId);
      });

      // Fetch related records
      const [works, wbsItems, resources, contractsData] = await Promise.all([
        workIds.size > 0 ? database.collections.get<EstimateWork>('estimate_works').query(Q.where('id', Q.oneOf(Array.from(workIds)))).fetch() : [],
        wbsIds.size > 0 ? database.collections.get<WbsItem>('wbs_items').query(Q.where('id', Q.oneOf(Array.from(wbsIds)))).fetch() : [],
        resourceIds.size > 0 ? database.collections.get<EstimateResource>('estimate_resources').query(Q.where('id', Q.oneOf(Array.from(resourceIds)))).fetch() : [],
        contractIds.size > 0 ? database.collections.get<Contract>('contracts').query(Q.where('id', Q.oneOf(Array.from(contractIds)))).fetch() : [],
      ]);

      const contractorIds = new Set<string>();
      contractsData.forEach(c => { if (c.contractorId) contractorIds.add(c.contractorId) });
      const contractors = contractorIds.size > 0 ? await database.collections.get<Contractor>('contractors').query(Q.where('id', Q.oneOf(Array.from(contractorIds)))).fetch() : [];

      // Maps
      const worksMap = new Map(works.map(w => [w.id, w]));
      const wbsMap = new Map(wbsItems.map(w => [w.id, w]));
      const resourcesMap = new Map(resources.map(r => [r.id, r]));
      const contractsMap = new Map(contractsData.map(c => [c.id, c]));
      const contractorsMap = new Map(contractors.map(c => [c.id, c]));

      // Transform
      const mapped: WorkAssignmentWithName[] = rawAssignments.map((wa) => {
        const wbsItem = wa.wbsItemId ? wbsMap.get(wa.wbsItemId) as WbsItem | undefined : null;
        const estimateWork = wa.estimateWorkId ? worksMap.get(wa.estimateWorkId) as EstimateWork | undefined : null;
        const resource = wa.resourceId ? resourcesMap.get(wa.resourceId) as EstimateResource | undefined : null;
        const contract = wa.contractId ? contractsMap.get(wa.contractId) as Contract | undefined : null;
        const contractor = contract?.contractorId ? contractorsMap.get(contract.contractorId) as Contractor | undefined : null;

        const workName = wbsItem?.name || resource?.name || estimateWork?.name || 'Без названия';
        const workUnit = (wbsItem as any)?.unit || resource?.unit || estimateWork?.unit || '—';

        let positionType = 'СМЕТА (1С)';
        if (wa.wbsItemId) {
          positionType = 'РАБОТА (График)';
        } else if (wa.resourceId) {
          positionType = 'МАТЕРИАЛ';
        }

        return {
          id: wa.id,
          contract_id: wa.contractId,
          estimate_work_id: wa.estimateWorkId,
          wbs_item_id: wa.wbsItemId,
          resource_id: wa.resourceId,
          assigned_quantity: wa.assignedQuantity,
          status: wa.status as any,
          work_name: workName,
          work_unit: workUnit,
          position_type: positionType,
          contract_number: contract?.contractNumber || '',
          contractor_name: contractor?.companyName || 'Неизвестный контрагент',
          project_id: contract?.projectId || '',
        };
      });

      if (!isStale()) setAssignments(mapped);
    } catch (err) {
      console.error('[TasksScreen] Error mapping assignments:', err);
    } finally {
      if (!isStale()) setLoading(false);
    }
  };

  const handleReportPress = (item: WorkAssignmentWithName) => {
    // Единицу измерения знаем только здесь: форма отчёта раньше всегда
    // показывала «ед.», и оператор вводил объём, не видя, в чём он считается.
    navigation.navigate('ReportForm', {
      assignmentId: item.id,
      workName: item.work_name,
      unit: item.work_unit,
    });
  };

  const renderFilterChips = (
    data: any[],
    selectedId: string | null,
    onSelect: (id: string | null) => void,
    labelKey: string,
    placeholder: string
  ) => {
    if (data.length === 0) return null;
    return (
      <View style={styles.chipsWrapper}>
        <Text style={styles.chipsLabel}>{placeholder}</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsContent}>
          <TouchableOpacity
            style={[styles.chip, selectedId === null && styles.chipActive]}
            onPress={() => onSelect(null)}
          >
            <Text style={[styles.chipText, selectedId === null && styles.chipTextActive]}>Все</Text>
          </TouchableOpacity>
          {data.map(item => (
            <TouchableOpacity
              key={item.id}
              style={[styles.chip, selectedId === item.id && styles.chipActive]}
              onPress={() => onSelect(selectedId === item.id ? null : item.id)}
            >
              <Text style={[styles.chipText, selectedId === item.id && styles.chipTextActive]}>
                {item[labelKey]}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>
    );
  };

  const renderTaskCard = ({ item }: { item: WorkAssignmentWithName }) => {
    const statusColors: Record<string, string> = {
      PLANNED: T.colors.warning,
      IN_PROGRESS: T.colors.primary,
      COMPLETED: T.colors.success,
      SUSPENDED: T.colors.danger,
    };

    const statusLabels: Record<string, string> = {
      PLANNED: 'Запланировано',
      IN_PROGRESS: 'В работе',
      COMPLETED: 'Выполнено',
      SUSPENDED: 'Приостановлено',
    };

    return (
      <View style={styles.taskCard}>
        <View style={styles.taskHeader}>
          <View style={[styles.statusDot, { backgroundColor: statusColors[item.status] ?? T.colors.textDisabled }]} />
          <Text style={styles.taskStatus}>
            {statusLabels[item.status] ?? item.status}
          </Text>
          <View style={styles.spacer} />
          <View style={styles.typeBadge}>
            <Text style={styles.typeBadgeText}>{item.position_type}</Text>
          </View>
        </View>

        <Text style={styles.contractorText} numberOfLines={1}>
          {item.contractor_name} • Договор №{item.contract_number}
        </Text>

        <Text style={styles.taskName} numberOfLines={3}>
          {item.work_name}
        </Text>
        
        <View style={styles.quantityRow}>
          <Text style={styles.taskId}>#{item.id.slice(0, 8)}</Text>
          <View style={styles.spacer} />
          <Text style={styles.taskQuantity}>
            {item.assigned_quantity ?? '—'} {item.work_unit}
          </Text>
        </View>

        <TouchableOpacity
          style={styles.reportBtn}
          activeOpacity={0.8}
          onPress={() => handleReportPress(item)}
        >
          <Text style={styles.reportBtnText}>+ Внести отчёт</Text>
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <Text style={styles.headerTitle}>Задания</Text>
          <View style={styles.headerActions}>
            <Text style={styles.headerCount}>{assignments.length} поз.</Text>
          </View>
        </View>
        
        {/* Filters */}
        <View style={styles.filtersContainer}>
          {renderFilterChips(objects, selectedObjectId, setSelectedObjectId, 'name', 'Объект')}
          {renderFilterChips(projects, selectedProjectId, setSelectedProjectId, 'name', 'Проект')}
          {renderFilterChips(contracts, selectedContractId, setSelectedContractId, 'contractNumber', 'Договор')}
        </View>
      </View>

      {loading ? (
        <View style={styles.centerContent}>
          <ActivityIndicator size="large" color={T.colors.primary} />
          <Text style={styles.loadingText}>Загрузка заданий...</Text>
        </View>
      ) : (
        <FlatList
          id="assignments-list"
          data={assignments}
          keyExtractor={(item) => item.id}
          renderItem={renderTaskCard}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={() => (
            <View style={styles.emptyContainer}>
              <Icon name="clipboard-list-outline" size={34} color={T.colors.textDisabled} />
              <Text style={styles.emptyTitle}>Нет заданий</Text>
              <Text style={styles.emptyText}>
                Измените фильтры или синхронизируйте базу данных.
              </Text>
            </View>
          )}
        />
      )}
    </View>
  );
}

export default TasksScreen;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: T.colors.canvas,
    paddingTop: T.spacing.lg,
  },
  centerContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    color: T.colors.primary,
    fontSize: 14,
    fontWeight: '600',
  },
  header: {
    paddingHorizontal: 0,
    marginBottom: 8,
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 12,
    marginBottom: 16,
    paddingHorizontal: 20,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: T.colors.textPrimary,
  },
  headerCount: {
    fontSize: 14,
    color: T.colors.primary,
    fontWeight: '600',
  },
  headerActions: {
    alignItems: 'flex-end',
    gap: 4,
  },
  filtersContainer: {
    marginBottom: 8,
  },
  chipsWrapper: {
    marginBottom: 12,
  },
  chipsLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: T.colors.textSecondary,
    textTransform: 'uppercase',
    marginBottom: 8,
    paddingHorizontal: 20,
  },
  chipsContent: {
    paddingHorizontal: 20,
    gap: 8,
  },
  chip: {
    backgroundColor: T.colors.surface,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: T.colors.border,
  },
  chipActive: {
    backgroundColor: T.colors.primarySoft,
    borderColor: T.colors.primary,
  },
  chipText: {
    color: T.colors.textSecondary,
    fontSize: 14,
    fontWeight: '600',
  },
  chipTextActive: {
    color: T.colors.primaryText,
  },
  listContent: {
    paddingHorizontal: 20,
    paddingBottom: 24,
    flexGrow: 1,
  },
  taskCard: {
    backgroundColor: T.colors.surface,
    borderRadius: 16,
    padding: 18,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: T.colors.border,
  },
  taskHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 8,
  },
  taskStatus: {
    fontSize: 12,
    color: T.colors.textSecondary,
    fontWeight: '600',
  },
  spacer: {
    flex: 1,
  },
  typeBadge: {
    backgroundColor: T.colors.border,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  typeBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: T.colors.textSecondary,
    textTransform: 'uppercase',
  },
  contractorText: {
    fontSize: 13,
    color: T.colors.textSecondary,
    marginBottom: 6,
    fontWeight: '500',
  },
  taskName: {
    fontSize: 16,
    fontWeight: '700',
    color: T.colors.textPrimary,
    marginBottom: 10,
    lineHeight: 22,
  },
  quantityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
  },
  taskId: {
    fontSize: 12,
    color: T.colors.textMuted,
  },
  taskQuantity: {
    fontSize: 14,
    color: T.colors.primary,
    fontWeight: '700',
  },
  reportBtn: {
    backgroundColor: T.colors.primarySoft,
    borderRadius: 10,
    padding: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: T.colors.primary,
  },
  reportBtnText: {
    color: T.colors.primaryText,
    fontSize: 14,
    fontWeight: '600',
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    paddingTop: 60,
  },
  emptyEmoji: {
    fontSize: 48,
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: T.colors.textDisabled,
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 14,
    color: T.colors.textMuted,
    textAlign: 'center',
    lineHeight: 20,
    paddingHorizontal: 20,
  },
});
