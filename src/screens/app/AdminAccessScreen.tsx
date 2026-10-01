import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Alert,
  RefreshControl,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/store/authStore';
import { T } from '@/theme';
import { Icon } from '@/components/Icon';
import { ScreenHeader, Card, Badge, EmptyState, Segmented } from '@/components/ui';
import { formatSmartDate } from '@/lib/formatDate';

/**
 * Управление доступом: подтверждение заявок и назначение контрагента.
 *
 * Все данные идут через функции mobile.admin_*: erp.contractors и auth.users
 * недоступны обычным запросом, а проверка прав живёт на сервере — экран лишь
 * не показывает того, чего пользователю всё равно не дадут сделать.
 */

type Tab = 'REQUESTS' | 'ASSIGN';

type LinkRow = {
  profile_id: string;
  email: string | null;
  full_name: string | null;
  contractor_id: string;
  company_name: string | null;
  bin_iin: string | null;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  requested_at: string;
  approved_at: string | null;
};

type UserRow = {
  id: string;
  email: string | null;
  full_name: string | null;
  linked_count: number;
};

type ContractorRow = {
  id: string;
  company_name: string | null;
  bin_iin: string | null;
  users_count: number;
};

const STATUS_TONE = {
  PENDING: { bg: T.colors.warningSoft, text: T.colors.warning },
  APPROVED: { bg: T.colors.successSoft, text: T.colors.success },
  REJECTED: { bg: T.colors.dangerSoft, text: T.colors.danger },
};

const STATUS_LABEL = {
  PENDING: 'На рассмотрении',
  APPROVED: 'Подтверждено',
  REJECTED: 'Отклонено',
};

export default function AdminAccessScreen() {
  const navigation = useNavigation<any>();
  const [tab, setTab] = useState<Tab>('REQUESTS');

  const [links, setLinks] = useState<LinkRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  // Назначение: сначала выбирается пользователь, затем организация.
  const [users, setUsers] = useState<UserRow[]>([]);
  const [contractors, setContractors] = useState<ContractorRow[]>([]);
  const [userSearch, setUserSearch] = useState('');
  const [contractorSearch, setContractorSearch] = useState('');
  const [selectedUser, setSelectedUser] = useState<UserRow | null>(null);

  const loadLinks = useCallback(async () => {
    const { data, error } = await supabase.schema('mobile').rpc('admin_list_links');
    if (error) {
      Alert.alert('Ошибка', error.message);
      return;
    }
    const rows = (data as LinkRow[]) ?? [];
    setLinks(rows);

    // Бейдж на вкладке и баннер на дашборде считают ожидающие заявки. Здесь
    // список уже полный, поэтому обновляем счётчик из него, не делая второй
    // запрос: иначе после подтверждения бейдж висел бы до перезахода.
    // loadLinks вызывается и при открытии экрана, и после каждого решения.
    useAuthStore.setState({
      pendingLinkCount: rows.filter((r) => r.status === 'PENDING').length,
    });
  }, []);

  const loadUsers = useCallback(async (search: string) => {
    const { data, error } = await supabase
      .schema('mobile')
      .rpc('admin_list_users', { p_search: search || null });
    if (error) {
      Alert.alert('Ошибка', error.message);
      return;
    }
    setUsers((data as UserRow[]) ?? []);
  }, []);

  const loadContractors = useCallback(async (search: string) => {
    const { data, error } = await supabase
      .schema('mobile')
      .rpc('admin_list_contractors', { p_search: search || null });
    if (error) {
      Alert.alert('Ошибка', error.message);
      return;
    }
    setContractors((data as ContractorRow[]) ?? []);
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      await loadLinks();
      setLoading(false);
    })();
  }, [loadLinks]);

  useEffect(() => {
    if (tab !== 'ASSIGN') return;
    loadUsers(userSearch);
  }, [tab, userSearch, loadUsers]);

  useEffect(() => {
    if (tab !== 'ASSIGN' || !selectedUser) return;
    loadContractors(contractorSearch);
  }, [tab, selectedUser, contractorSearch, loadContractors]);

  const decide = async (row: LinkRow, status: 'APPROVED' | 'REJECTED') => {
    const key = `${row.profile_id}:${row.contractor_id}`;
    setBusyKey(key);
    try {
      const { error } = await supabase.schema('mobile').rpc('admin_set_link_status', {
        p_profile_id: row.profile_id,
        p_contractor_id: row.contractor_id,
        p_status: status,
        p_comment: null,
      });
      if (error) {
        Alert.alert('Ошибка', error.message);
        return;
      }
      await loadLinks();
    } finally {
      setBusyKey(null);
    }
  };

  const revoke = (row: LinkRow) => {
    Alert.alert(
      'Отозвать доступ',
      `${row.email ?? 'Пользователь'} потеряет доступ к работам «${row.company_name ?? '—'}».`,
      [
        { text: 'Отмена', style: 'cancel' },
        {
          text: 'Отозвать',
          style: 'destructive',
          onPress: async () => {
            const { error } = await supabase
              .schema('mobile')
              .rpc('admin_revoke_contractor', {
                p_profile_id: row.profile_id,
                p_contractor_id: row.contractor_id,
              });
            if (error) Alert.alert('Ошибка', error.message);
            else await loadLinks();
          },
        },
      ]
    );
  };

  const assign = async (contractor: ContractorRow) => {
    if (!selectedUser) return;
    const { error } = await supabase.schema('mobile').rpc('admin_assign_contractor', {
      p_profile_id: selectedUser.id,
      p_contractor_id: contractor.id,
    });
    if (error) {
      Alert.alert('Ошибка', error.message);
      return;
    }
    Alert.alert(
      'Назначено',
      `${selectedUser.email ?? 'Пользователь'} → ${contractor.company_name ?? '—'}`
    );
    setSelectedUser(null);
    setContractorSearch('');
    await loadLinks();
  };

  const pendingCount = links.filter((l) => l.status === 'PENDING').length;

  const renderLink = ({ item }: { item: LinkRow }) => {
    const tone = STATUS_TONE[item.status];
    const key = `${item.profile_id}:${item.contractor_id}`;
    return (
      <Card>
        <View style={styles.rowTop}>
          <Text style={styles.email} numberOfLines={1}>
            {item.email ?? item.profile_id.slice(0, 8)}
          </Text>
          <View style={[styles.badge, { backgroundColor: tone.bg }]}>
            <Text style={[styles.badgeText, { color: tone.text }]}>
              {STATUS_LABEL[item.status]}
            </Text>
          </View>
        </View>

        {item.full_name ? <Text style={styles.name}>{item.full_name}</Text> : null}

        <Text style={styles.company}>
          {item.company_name ?? '— организация не найдена —'}
          {item.bin_iin ? ` · БИН ${item.bin_iin}` : ''}
        </Text>
        <Text style={styles.meta}>Заявка от {formatSmartDate(new Date(item.requested_at))}</Text>

        <View style={styles.actions}>
          {item.status === 'PENDING' ? (
            <>
              <TouchableOpacity
                style={[styles.actionBtn, styles.approveBtn]}
                onPress={() => decide(item, 'APPROVED')}
                disabled={busyKey === key}
                activeOpacity={0.8}
              >
                {busyKey === key ? (
                  <ActivityIndicator color={T.colors.textOnBrand} size="small" />
                ) : (
                  <Text style={styles.approveText}>Подтвердить</Text>
                )}
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.actionBtn, styles.rejectBtn]}
                onPress={() => decide(item, 'REJECTED')}
                disabled={busyKey === key}
                activeOpacity={0.8}
              >
                <Text style={styles.rejectText}>Отклонить</Text>
              </TouchableOpacity>
            </>
          ) : (
            <TouchableOpacity
              style={[styles.actionBtn, styles.rejectBtn]}
              onPress={() => revoke(item)}
              activeOpacity={0.8}
            >
              <Text style={styles.rejectText}>Отозвать доступ</Text>
            </TouchableOpacity>
          )}
        </View>
      </Card>
    );
  };

  const renderAssign = () => {
    if (!selectedUser) {
      return (
        <>
          <TextInput
            style={styles.search}
            value={userSearch}
            onChangeText={setUserSearch}
            placeholder="Поиск по email или ФИО"
            placeholderTextColor={T.colors.textMuted}
            autoCapitalize="none"
          />
          <Text style={styles.sectionHint}>Шаг 1 — выберите пользователя</Text>
          {users.map((u) => (
            <TouchableOpacity key={u.id} onPress={() => setSelectedUser(u)} activeOpacity={0.7}>
              <Card>
                <Text style={styles.email}>{u.email ?? u.id.slice(0, 8)}</Text>
                {u.full_name ? <Text style={styles.name}>{u.full_name}</Text> : null}
                <Text style={styles.meta}>
                  {u.linked_count > 0
                    ? `Уже привязан к ${u.linked_count} организации(ям)`
                    : 'Без организации'}
                </Text>
              </Card>
            </TouchableOpacity>
          ))}
          {users.length === 0 ? <EmptyState icon="account-search-outline" title="Никого не найдено" /> : null}
        </>
      );
    }

    return (
      <>
        <TouchableOpacity style={styles.selectedUser} onPress={() => setSelectedUser(null)}>
          <Icon name="account-check-outline" size={18} color={T.colors.primary} />
          <View style={{ flex: 1 }}>
            <Text style={styles.selectedUserText}>{selectedUser.email}</Text>
            <Text style={styles.meta}>Нажмите, чтобы выбрать другого</Text>
          </View>
        </TouchableOpacity>

        <TextInput
          style={styles.search}
          value={contractorSearch}
          onChangeText={setContractorSearch}
          placeholder="Поиск организации по названию или БИН"
          placeholderTextColor={T.colors.textMuted}
        />
        <Text style={styles.sectionHint}>Шаг 2 — выберите организацию</Text>
        {contractors.map((c) => (
          <TouchableOpacity key={c.id} onPress={() => assign(c)} activeOpacity={0.7}>
            <Card>
              <Text style={styles.email}>{c.company_name ?? '—'}</Text>
              <Text style={styles.meta}>
                {c.bin_iin ? `БИН ${c.bin_iin} · ` : ''}
                пользователей: {c.users_count}
              </Text>
            </Card>
          </TouchableOpacity>
        ))}
        {contractors.length === 0 ? (
          <EmptyState icon="office-building-outline" title="Организаций не найдено" />
        ) : null}
      </>
    );
  };

  return (
    <View style={styles.container}>
      <ScreenHeader
        title="Управление доступом"
        subtitle="Заявки подрядчиков и назначение организаций"
        onBack={() => navigation.goBack()}
      />

      <View style={styles.tabs}>
        <Segmented
          value={tab}
          onChange={setTab}
          items={[
            { value: 'REQUESTS', label: 'Заявки', count: pendingCount },
            { value: 'ASSIGN', label: 'Назначить' },
          ]}
        />
      </View>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={T.colors.primary} />
      ) : tab === 'REQUESTS' ? (
        <FlatList
          data={links}
          keyExtractor={(l) => `${l.profile_id}:${l.contractor_id}`}
          renderItem={renderLink}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={false} onRefresh={loadLinks} />}
          ListEmptyComponent={<EmptyState icon="inbox-outline" title="Заявок нет" />}
        />
      ) : (
        <FlatList
          data={[]}
          renderItem={null as any}
          keyExtractor={() => 'x'}
          contentContainerStyle={styles.list}
          ListHeaderComponent={<View>{renderAssign()}</View>}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { width: '100%', maxWidth: 1200, alignSelf: 'center', flex: 1, backgroundColor: T.colors.canvas },
  tabs: { paddingHorizontal: T.spacing.lg, paddingBottom: T.spacing.sm },
  list: { padding: T.spacing.lg, paddingTop: 0 },
  rowTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  email: { flex: 1, fontSize: 15, fontWeight: '700', color: T.colors.textPrimary },
  name: { fontSize: 13, color: T.colors.textSecondary, marginBottom: 2 },
  company: { fontSize: 14, color: T.colors.textPrimary, marginTop: 4 },
  meta: { fontSize: 12, color: T.colors.textMuted, marginTop: 4 },
  badge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  badgeText: { fontSize: 10, fontWeight: '800' },
  actions: { flexDirection: 'row', gap: 10, marginTop: 14 },
  actionBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  approveBtn: { backgroundColor: T.colors.primary },
  approveText: { color: T.colors.textOnBrand, fontWeight: '700', fontSize: 14 },
  rejectBtn: { backgroundColor: T.colors.surfaceSunken, borderWidth: 1, borderColor: T.colors.border },
  rejectText: { color: T.colors.danger, fontWeight: '600', fontSize: 14 },
  search: {
    backgroundColor: T.colors.surface,
    borderWidth: 1,
    borderColor: T.colors.border,
    borderRadius: 12,
    padding: 14,
    fontSize: 15,
    color: T.colors.textPrimary,
    marginBottom: 12,
  },
  sectionHint: {
    ...T.font.overline,
    color: T.colors.textSecondary,
    marginBottom: 10,
  },
  selectedUser: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: T.colors.primarySoft,
    borderRadius: 12,
    padding: 14,
    marginBottom: 14,
  },
  selectedUserText: { fontSize: 15, fontWeight: '700', color: T.colors.textPrimary },
});
