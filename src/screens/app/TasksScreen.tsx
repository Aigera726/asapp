import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  TextInput,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute, RouteProp, useFocusEffect } from '@react-navigation/native';
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
import { ECO as E, ECO_STATUS as S } from '@/theme/ecopro';
import { Icon } from '@/components/Icon';
import { EmptyState } from '@/components/ui';
import { syncDatabase } from '@/database/sync';
import { useAuthStore } from '@/store/authStore';
import { VolumeBar } from '@/components/VolumeBar';
import { formatQty } from '@/lib/domain';
import { loadWorkVolumes } from '@/lib/workVolume';
import { VolumeSummary } from '@/database/workVolume';

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
  volume: VolumeSummary | null;
}

interface Props {
  route: TasksScreenRouteProp;
}

/** Не чаще раза в 30 секунд: вкладку переключают часто. */
const AUTO_SYNC_INTERVAL_MS = 30_000;
let lastAutoSync = 0;

function TasksScreen({ route }: Props) {
  const navigation = useNavigation<NativeStackNavigationProp<AppStackParamList>>();
  const initialProjectId = route.params?.projectId;
  
  const [assignments, setAssignments] = useState<WorkAssignmentWithName[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const insets = useSafeAreaInsets();
  const { isDemoMode } = useAuthStore();

  // Решения ERP приходят в любой момент: при каждом открытии вкладки тихо
  // подтягиваем свежие объёмы, иначе остаток на карточках отстаёт.
  useFocusEffect(useCallback(() => {
    if (isDemoMode || Date.now() - lastAutoSync < AUTO_SYNC_INTERVAL_MS) return;
    lastAutoSync = Date.now();
    syncDatabase().catch((e) => console.warn('[TasksScreen] Фоновая синхронизация:', e?.message));
  }, [isDemoMode]));

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
      const allAssignments = await database.collections.get<WorkAssignment>('work_assignments').query(Q.where('is_available', true)).fetch();
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
      .observeWithColumns(['is_available', 'work_confirmed_volume', 'work_pending_volume',
        'assignment_confirmed_volume', 'assignment_pending_volume'])
      .subscribe(() => {
        loadFilters();
        loadAssignments();
      });
    // Новый отчёт или решение ERP меняют остаток на карточке.
    const reportsSubscription = database.collections.get('reports')
      .query()
      .observeWithColumns(['status', 'sync_status'])
      .subscribe(() => loadAssignments());

    return () => {
      subscription.unsubscribe();
      reportsSubscription.unsubscribe();
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

      let queryConditions: any[] = [Q.where('is_available', true)];
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
      const volumes = await loadWorkVolumes(rawAssignments);

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
          volume: volumes.get(wa.id)?.summary ?? null,
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
            accessibilityRole="button"
            accessibilityState={{ selected: selectedId === null }}
            style={[styles.chip, selectedId === null && styles.chipActive]}
            onPress={() => onSelect(null)}
          >
            <Text style={[styles.chipText, selectedId === null && styles.chipTextActive]}>Все</Text>
          </TouchableOpacity>
          {data.map(item => (
            <TouchableOpacity
              key={item.id}
              accessibilityRole="button"
              accessibilityState={{ selected: selectedId === item.id }}
              style={[styles.chip, selectedId === item.id && styles.chipActive]}
              onPress={() => onSelect(selectedId === item.id ? null : item.id)}
            >
              <Text style={[styles.chipText, selectedId === item.id && styles.chipTextActive]} numberOfLines={1}>
                {item[labelKey]}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>
    );
  };

  const STATUS: Record<string, { label: string; color: string; bg: string }> = {
    PLANNED: { label: 'Запланировано', color: S.warning, bg: S.warningSoft },
    IN_PROGRESS: { label: 'В работе', color: E.blue, bg: E.soft },
    COMPLETED: { label: 'Выполнено', color: S.success, bg: S.successSoft },
    SUSPENDED: { label: 'Приостановлено', color: S.danger, bg: S.dangerSoft },
  };

  const renderTaskCard = ({ item }: { item: WorkAssignmentWithName }) => {
    const status = STATUS[item.status] ?? { label: item.status, color: E.muted, bg: S.surface2 };
    const exhausted = item.volume != null && item.volume.limit <= 0;

    return (
      <View style={styles.taskCard}>
        <View style={styles.taskTop}>
          <View style={styles.taskIcon}>
            <Icon name={item.resource_id ? 'package-variant-closed' : 'hammer-wrench'} size={20} color={E.blue} />
          </View>
          <View style={styles.taskBody}>
            <Text style={styles.taskName} numberOfLines={3}>{item.work_name}</Text>
            <Text style={styles.contractorText} numberOfLines={1}>
              {item.contractor_name} · Договор № {item.contract_number || '—'}
            </Text>
          </View>
        </View>

        <View style={styles.pillsRow}>
          <View style={[styles.pill, { backgroundColor: status.bg }]}>
            <View style={[styles.pillDot, { backgroundColor: status.color }]} />
            <Text style={[styles.pillText, { color: status.color }]}>{status.label}</Text>
          </View>
          <View style={[styles.pill, { backgroundColor: S.surface2 }]}>
            <Text style={[styles.pillText, { color: E.muted }]}>{item.position_type}</Text>
          </View>
        </View>

        {item.volume ? (
          <View style={styles.volumeBox}>
            <View style={styles.volumeHead}>
              <Text style={styles.volumeKicker}>ДОСТУПНО К ОТПРАВКЕ</Text>
              <Text style={styles.volumePlan}>план {formatQty(item.volume.plan)} {item.work_unit}</Text>
            </View>
            <Text style={[styles.volumeValue, exhausted && { color: E.muted }]}>
              {formatQty(item.volume.limit)} <Text style={styles.volumeUnit}>{item.work_unit}</Text>
            </Text>
            <VolumeBar volume={item.volume} legend={item.volume.pending > 0 || item.volume.confirmed > 0} />
          </View>
        ) : (
          <View style={styles.volumeBox}>
            <Text style={styles.volumeKicker}>ОБЪЁМ ПО ДОГОВОРУ</Text>
            <Text style={styles.volumeValue}>
              {item.assigned_quantity == null ? '—' : formatQty(item.assigned_quantity)} <Text style={styles.volumeUnit}>{item.work_unit}</Text>
            </Text>
          </View>
        )}

        <View style={styles.taskFooter}>
          <Text style={styles.taskId}>#{item.id.slice(0, 8)}</Text>
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel={'Внести объём: ' + item.work_name}
            style={[styles.reportBtn, exhausted && styles.reportBtnMuted]}
            activeOpacity={0.85}
            onPress={() => handleReportPress(item)}
          >
            <Icon name={exhausted ? 'history' : 'plus'} size={17} color={exhausted ? E.blue : '#FFFFFF'} />
            <Text style={[styles.reportBtnText, exhausted && { color: E.blue }]}>
              {exhausted ? 'История отправок' : 'Внести объём'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  const query = search.trim().toLocaleLowerCase();
  const visible = query
    ? assignments.filter(a => a.work_name.toLocaleLowerCase().includes(query)
      || a.contract_number.toLocaleLowerCase().includes(query))
    : assignments;

  const header = (
    <>
      <View style={styles.intro}>
        <Text style={styles.kicker}>ОПЕРАТИВНЫЙ УЧЁТ</Text>
        <View style={styles.titleRow}>
          <Text accessibilityRole="header" style={styles.pageTitle}>Работы</Text>
          <Text style={styles.headerCount}>{visible.length}</Text>
        </View>
        <Text style={styles.pageSubtitle}>Выберите работу и внесите выполненный объём</Text>
      </View>

      <View style={styles.search}>
        <Icon name="magnify" size={20} color={E.muted} />
        <TextInput
          accessibilityLabel="Поиск работы"
          value={search}
          onChangeText={setSearch}
          placeholder="Найти работу или договор"
          placeholderTextColor={E.muted}
          style={styles.searchInput}
          autoCorrect={false}
        />
        {search !== '' && (
          <TouchableOpacity accessibilityRole="button" accessibilityLabel="Очистить поиск" onPress={() => setSearch('')} style={styles.clearSearch}>
            <Icon name="close" size={18} color={E.muted} />
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.filtersContainer}>
        {renderFilterChips(objects, selectedObjectId, setSelectedObjectId, 'name', 'Объект')}
        {renderFilterChips(projects, selectedProjectId, setSelectedProjectId, 'name', 'Проект')}
        {renderFilterChips(contracts, selectedContractId, setSelectedContractId, 'contractNumber', 'Договор')}
      </View>
    </>
  );

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {loading ? (
        <View style={styles.centerContent}>
          <ActivityIndicator size="large" color={E.blue} />
          <Text style={styles.loadingText}>Загрузка работ…</Text>
        </View>
      ) : (
        <FlatList
          id="assignments-list"
          data={visible}
          keyExtractor={(item) => item.id}
          renderItem={renderTaskCard}
          ListHeaderComponent={header}
          contentContainerStyle={styles.listContent}
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={
            <EmptyState
              icon="clipboard-list-outline"
              title={query ? 'Ничего не найдено' : 'Нет работ'}
              text={query ? 'Попробуйте другое название работы или номер договора.' : 'Измените фильтры или синхронизируйте данные.'}
              actionLabel={query ? 'Сбросить поиск' : undefined}
              onAction={query ? () => setSearch('') : undefined}
            />
          }
        />
      )}
    </View>
  );
}

export default TasksScreen;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: E.paper },
  centerContent: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { marginTop: 12, color: E.muted, fontSize: 13 },
  listContent: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 32, flexGrow: 1, width: '100%', maxWidth: 1080, alignSelf: 'center' },

  intro: { marginBottom: 18 },
  kicker: { fontSize: 9, letterSpacing: 1.6, color: E.muted, marginBottom: 9 },
  titleRow: { flexDirection: 'row', alignItems: 'baseline', gap: 10 },
  pageTitle: { fontSize: 27, lineHeight: 34, fontWeight: '600', letterSpacing: -0.7, color: E.ink },
  headerCount: { fontSize: 13, color: E.muted },
  pageSubtitle: { fontSize: 13, lineHeight: 20, color: E.muted, marginTop: 6 },

  search: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: E.surface, borderWidth: 1, borderColor: E.line, borderRadius: 10, paddingLeft: 14, marginBottom: 16 },
  searchInput: { flex: 1, minWidth: 0, paddingVertical: 13, paddingRight: 12, fontSize: 14, color: E.ink, ...(({ outlineStyle: 'none' } as any)) },
  clearSearch: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },

  filtersContainer: { marginBottom: 6 },
  chipsWrapper: { marginBottom: 12 },
  chipsLabel: { fontSize: 9, letterSpacing: 1.4, fontWeight: '600', color: E.muted, textTransform: 'uppercase', marginBottom: 8 },
  chipsContent: { gap: 8 },
  chip: { backgroundColor: E.surface, paddingHorizontal: 14, minHeight: 36, justifyContent: 'center', borderRadius: 9, borderWidth: 1, borderColor: E.line, maxWidth: 260 },
  chipActive: { backgroundColor: E.soft, borderColor: E.blue },
  chipText: { color: E.ink, fontSize: 13, fontWeight: '500' },
  chipTextActive: { color: E.blue, fontWeight: '600' },

  taskCard: { backgroundColor: E.surface, borderRadius: 14, padding: 17, marginBottom: 12, borderWidth: 1, borderColor: E.line },
  taskTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  taskIcon: { width: 42, height: 42, borderRadius: 11, backgroundColor: E.soft, alignItems: 'center', justifyContent: 'center' },
  taskBody: { flex: 1, minWidth: 0 },
  taskName: { fontSize: 15, fontWeight: '600', color: E.ink, lineHeight: 21 },
  contractorText: { fontSize: 12, color: E.muted, marginTop: 4 },

  pillsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 12 },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 9, paddingVertical: 4, borderRadius: 99 },
  pillDot: { width: 6, height: 6, borderRadius: 3 },
  pillText: { fontSize: 11, fontWeight: '600' },

  volumeBox: { marginTop: 14, padding: 14, borderRadius: 12, backgroundColor: E.paper, borderWidth: 1, borderColor: '#E6EAF0' },
  volumeHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  volumeKicker: { fontSize: 9, letterSpacing: 1.4, fontWeight: '600', color: E.muted },
  volumePlan: { fontSize: 11, color: E.muted },
  volumeValue: { fontSize: 25, fontWeight: '500', letterSpacing: -1, color: E.ink, marginTop: 6, marginBottom: 10 },
  volumeUnit: { fontSize: 13, fontWeight: '500', letterSpacing: 0, color: E.muted },

  taskFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginTop: 14, paddingTop: 12, borderTopWidth: 1, borderTopColor: E.line },
  taskId: { fontSize: 11, color: E.muted },
  reportBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 42, paddingHorizontal: 16, borderRadius: 9, backgroundColor: E.blue },
  reportBtnMuted: { backgroundColor: E.soft },
  reportBtnText: { color: '#FFFFFF', fontSize: 13, fontWeight: '600' },
});
