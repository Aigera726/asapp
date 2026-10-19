import { useTranslation } from '@/i18n';
import { currentText, currentLanguage } from "@/i18n/ui-labels";
import { LOCALES } from '@/i18n/work';
import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, TextInput, StyleSheet,
  Alert, Modal, ScrollView, ActivityIndicator, KeyboardAvoidingView, Platform,
  InputAccessoryView, Keyboard, Button
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useNavigation, useRoute } from '@react-navigation/native';
import { withObservables } from '@nozbe/watermelondb/react';
import { database } from '@/database';
import EstimateResource from '@/database/models/EstimateResource';
import Project from '@/database/models/Project';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuthStore } from '@/store/authStore';
import { generateUUID } from '@/lib/uuid';
import { formatQty } from '@/lib/domain';
import { T } from '@/theme';
import { DismissKeyboard } from '@/components/DismissKeyboard';
import { Icon } from '@/components/Icon';
import { useResourceDisplay } from '@/hooks/useResourceDisplay';

const enhance = withObservables([], () => ({
  resources: database.collections.get<EstimateResource>('estimate_resources').query(),
  projects: database.collections.get<Project>('projects').query(),
}));

interface Props {
  resources: EstimateResource[];
  projects: Project[];
}

const CreateRequestScreen = ({ resources, projects }: Props) => {
  const { language, t } = useTranslation();
  const display = useResourceDisplay();
  const navigation = useNavigation();
  const route = useRoute<any>();
  const [selectedItems, setSelectedItems] = useState<Record<string, number>>({});
  const [comment, setComment] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [showProjectPicker, setShowProjectPicker] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [requiredDate, setRequiredDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [activeTab, setActiveTab] = useState<1 | 2 | 3 | 4>(2);

  const tabNames: Record<number, string> = {
    1: t("ui.labour"),
    2: t("home.materials"),
    3: t("ui.machinery"),
    4: t("ui.equipment"),
  };

  // Set default project once when WatermelonDB delivers data
  const hasSetDefault = useRef(false);
  useEffect(() => {
    if (!hasSetDefault.current && projects.length > 0) {
      hasSetDefault.current = true;
      const fromRoute = projects.find(p => p.id === route.params?.projectId);
      setSelectedProject(fromRoute ?? projects[0]);
    }
  }, [projects]);

  const selectedCount = Object.keys(selectedItems).length;

  const toggleItem = (id: string) => {
    setSelectedItems(prev => {
      const next = { ...prev };
      if (next[id] !== undefined) delete next[id];
      else next[id] = 1;
      return next;
    });
  };

  const updateQuantity = (id: string, val: string) => {
    const num = parseFloat(val) || 0;
    setSelectedItems(prev => ({ ...prev, [id]: num }));
  };

  const filteredResources = useMemo(() => {
    let result = resources.filter(r => r.typeId === activeTab || (activeTab === 2 && !r.typeId)); // Fallback to tab 2 (Материалы) if typeId is missing
    if (searchQuery.trim()) {
      const lowerQ = searchQuery.toLowerCase();
      result = result.filter(r => r.name.toLowerCase().includes(lowerQ) || display.name(r.id, r.name).toLowerCase().includes(lowerQ));
    }
    return result;
  }, [resources, searchQuery, activeTab, language, display.version]);

  const handleSubmit = async () => {
    if (isSubmitting) return;

    // Filter out zero-quantity items
    const validItems = Object.entries(selectedItems).filter(([_, qty]) => qty > 0);
    if (validItems.length === 0) {
      Alert.alert(t("common.error"), t("ui.select_at_least_one_item_with_a_quantity_above"));
      return;
    }
    if (!selectedProject) {
      Alert.alert(t("common.error"), t("ui.select_a_site"));
      return;
    }

    const { user } = useAuthStore.getState();
    if (!user) {
      Alert.alert(t("common.error"), t("ui.please_sign_in"));
      return;
    }

    setIsSubmitting(true);
    try {
      await database.write(async () => {
        const newRequest = await database.collections.get('purchase_requests').create((r: any) => {
          r._raw.id = generateUUID();
          r.projectId = selectedProject.id;
          r.requestedBy = user.id;
          r.status = 'PENDING_APPROVAL';
          r.comment = comment.trim() || null;
          r.requiredDate = requiredDate.getTime();
        });

        // Use batch for efficiency
        const itemsToCreate = validItems.map(([resId, qty]) => {
          const resource = resources.find(r => r.id === resId);
          return database.collections.get('purchase_request_items').prepareCreate((item: any) => {
            item._raw.id = generateUUID();
            item.requestId = newRequest.id;
            item.resourceId = resId;
            item.requestedQuantity = qty;
            item.receivedQuantity = 0;
            item.itemName = resource?.name ?? 'Unknown';
            item.unit = resource?.unit ?? 'шт';
            item.status = 'PENDING';
          });
        });
        await database.batch(...itemsToCreate);
      });

      Alert.alert(t("ui.request_created"), t("ui.value_items_added", { p0: validItems.length }));
      navigation.goBack();
    } catch (err) {
      console.error('[CreateRequest] Error:', err);
      Alert.alert(t("common.error"), t("ui.could_not_save_the_request"));
    } finally {
      setIsSubmitting(false);
    }
  };

  const renderResource = ({ item }: { item: EstimateResource }) => {
    const isSelected = selectedItems[item.id] !== undefined;
    return (
      <TouchableOpacity
        style={[styles.itemCard, isSelected && styles.itemCardSelected]}
        onPress={() => toggleItem(item.id)}
        activeOpacity={0.7}
        accessibilityLabel={t("ui.select_value", { p0: display.name(item.id, item.name) })}
      >
        <View style={[styles.checkbox, isSelected && styles.checked]}>
          {isSelected && <Text style={styles.checkMark}></Text>}
        </View>
        <View style={styles.itemInfo}>
          <Text style={[styles.itemName, isSelected && styles.itemNameSelected]}>{display.name(item.id, item.name)}</Text>
          <View style={styles.itemMeta}>
            <Text style={styles.itemUnit}>{display.unit(item.id, item.unit)}</Text>
            {item.norm !== undefined && item.norm !== null && (
              // Норма задана на единицу работы, а не на позицию целиком —
              // прежняя подпись «По плану» читалась как готовый объём заявки.
              <Text style={styles.itemNorm}>{currentText("ui.norm")}{' '}{formatQty(item.norm)}{currentText("ui.work_unit")}</Text>
            )}
          </View>
        </View>
        {isSelected && (
          <TextInput
            style={styles.inputQty}
            keyboardType="decimal-pad"
            defaultValue="1"
            onChangeText={(val) => updateQuantity(item.id, val)}
            placeholder={t("ui.qty")}
            placeholderTextColor={T.colors.textMuted}
            selectTextOnFocus
            inputAccessoryViewID="DoneKeyboard"
          />
        )}
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={0}
      >
        <DismissKeyboard>
          <View>
            <View style={styles.header}>
              <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
                <Text style={styles.backText}>{currentText("common.cancel")}</Text>
              </TouchableOpacity>
              <Text style={styles.title}>{currentText("ui.new_request")}</Text>
              <View style={{ width: 70 }} />
            </View>

            <View style={styles.formSection}>
              <Text style={styles.label}>{t('work.object')}</Text>
              <TouchableOpacity style={styles.projectSelector} onPress={() => { Keyboard.dismiss(); setShowProjectPicker(true); }} activeOpacity={0.7}>
                <Text style={[styles.projectSelectorText, !selectedProject && styles.projectPlaceholder]}>
                  {selectedProject ? selectedProject.name : (projects.length === 0 ? t("ui.loading") : t("ui.select_a_site"))}
                </Text>
                <Text style={styles.chevron}>▼</Text>
              </TouchableOpacity>

              <Text style={styles.label}>{currentText("ui.required_date")}</Text>
              {Platform.OS === 'ios' ? (
                <View style={styles.iosDatePickerContainer}>
                  <DateTimePicker
                    value={requiredDate}
                    mode="date"
                    display="compact"
                    themeVariant="dark"
                    onChange={(event, date) => {
                      if (date) setRequiredDate(date);
                    }}
                  />
                </View>
              ) : (
                <>
                  <TouchableOpacity style={styles.projectSelector} onPress={() => { Keyboard.dismiss(); setShowDatePicker(true); }} activeOpacity={0.7}>
                    <Text style={styles.projectSelectorText}>
                      {requiredDate.toLocaleDateString(LOCALES[currentLanguage()])}
                    </Text>
                    <Icon name="calendar-outline" size={18} color={T.colors.textMuted} />
                  </TouchableOpacity>

                  {showDatePicker && (
                    <DateTimePicker
                      value={requiredDate}
                      mode="date"
                      display="default"
                      onChange={(event, date) => {
                        setShowDatePicker(false);
                        if (date) setRequiredDate(date);
                      }}
                    />
                  )}
                </>
              )}

              <Text style={styles.label}>{currentText("ui.comment")}</Text>
              <TextInput
                style={styles.commentInput}
                placeholder={t("ui.urgent_needed_by_monday")}
                placeholderTextColor={T.colors.textDisabled}
                value={comment}
                onChangeText={setComment}
                multiline
                inputAccessoryViewID="DoneKeyboard"
              />
            </View>

            <View style={styles.searchSection}>
              <View style={styles.searchContainer}>
                <Icon name="magnify" size={18} color={T.colors.textMuted} />
                <TextInput
                  style={styles.searchInput}
                  placeholder={t("ui.find_a_material")}
                  placeholderTextColor={T.colors.textDisabled}
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                  returnKeyType="search"
                  inputAccessoryViewID="DoneKeyboard"
                />
                {searchQuery.length > 0 && (
                  <TouchableOpacity onPress={() => setSearchQuery('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <Text style={styles.clearSearch}></Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          </View>
        </DismissKeyboard>

        <View style={styles.tabsContainer}>
          <TouchableOpacity style={[styles.tab, activeTab === 1 && styles.tabActive]} onPress={() => setActiveTab(1)}>
            <Icon name="account-hard-hat-outline" size={20} color={activeTab === 1 ? T.colors.primary : T.colors.textMuted} />
          </TouchableOpacity>
          <TouchableOpacity style={[styles.tab, activeTab === 2 && styles.tabActive]} onPress={() => setActiveTab(2)}>
            <Icon name="wall" size={20} color={activeTab === 2 ? T.colors.primary : T.colors.textMuted} />
          </TouchableOpacity>
          <TouchableOpacity style={[styles.tab, activeTab === 3 && styles.tabActive]} onPress={() => setActiveTab(3)}>
            <Icon name="excavator" size={20} color={activeTab === 3 ? T.colors.primary : T.colors.textMuted} />
          </TouchableOpacity>
          <TouchableOpacity style={[styles.tab, activeTab === 4 && styles.tabActive]} onPress={() => setActiveTab(4)}>
            <Icon name="cog-outline" size={20} color={activeTab === 4 ? T.colors.primary : T.colors.textMuted} />
          </TouchableOpacity>
        </View>

        <Text style={styles.sectionTitle}>
          {tabNames[activeTab]} · {filteredResources.length}{searchQuery ? t("ui.of_value", { p0: resources.length }) : ''}
        </Text>

        {Platform.OS === 'ios' && (
          <InputAccessoryView nativeID="DoneKeyboard">
            <View style={styles.accessory}>
              <Button onPress={() => Keyboard.dismiss()} title={t("ui.done")} />
            </View>
          </InputAccessoryView>
        )}

        <FlatList
          data={filteredResources}
          keyExtractor={(item) => item.id}
          renderItem={renderResource}
          contentContainerStyle={styles.list}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          ListEmptyComponent={
            <View style={styles.empty}>
              <Icon name="inbox-outline" size={30} color={T.colors.textDisabled} />
              <Text style={styles.emptyText}>
                {resources.length === 0 ? t("ui.materials_not_loaded_synchronize_your_data") : t("home.notFound")}
              </Text>
            </View>
          }
        />

        {/* Floating submit button */}
        {selectedCount > 0 && (
          <View style={styles.floatingBar}>
            <View style={styles.floatingInfo}>
              <Text style={styles.floatingCount}>{selectedCount}</Text>
              <Text style={styles.floatingLabel}>{selectedCount === 1 ? t("ui.item") : selectedCount < 5 ? t("ui.items") : t("ui.items_b59a7")}</Text>
            </View>
            <TouchableOpacity
              style={[styles.floatingBtn, isSubmitting && styles.floatingBtnDisabled]}
              onPress={handleSubmit}
              disabled={isSubmitting}
              activeOpacity={0.8}
            >
              {isSubmitting ? (
                <ActivityIndicator color={T.colors.white} size="small" />
              ) : (
                <Text style={styles.floatingBtnText}>{currentText("ui.create_request")}</Text>
              )}
            </TouchableOpacity>
          </View>
        )}
      </KeyboardAvoidingView>

      {/* Project Picker Modal */}
      <Modal visible={showProjectPicker} transparent animationType="slide">
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setShowProjectPicker(false)}>
          <View style={styles.modalContent} onStartShouldSetResponder={() => true}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>{t("ui.select_a_site")}</Text>
            <ScrollView showsVerticalScrollIndicator={false}>
              {projects.map(p => {
                const isActive = selectedProject?.id === p.id;
                return (
                  <TouchableOpacity
                    key={p.id}
                    style={[styles.modalItem, isActive && styles.modalItemActive]}
                    onPress={() => {
                      setSelectedProject(p);
                      setShowProjectPicker(false);
                    }}
                    activeOpacity={0.7}
                  >
                    <View style={[styles.modalRadio, isActive && styles.modalRadioActive]}>
                      {isActive && <View style={styles.modalRadioDot} />}
                    </View>
                    <Text style={[styles.modalItemText, isActive && styles.modalItemSelectedText]}>
                      {p.name}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: T.colors.canvas },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 16 },
  backText: { color: T.colors.textSecondary, fontSize: 15 },
  title: { fontSize: 18, fontWeight: '800', color: T.colors.textPrimary },
  formSection: { paddingHorizontal: 20, marginBottom: 8 },
  label: { color: T.colors.textMuted, fontSize: 11, marginBottom: 6, fontWeight: '700', letterSpacing: 1 },
  projectSelector: { backgroundColor: T.colors.surface, borderRadius: 12, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: T.colors.border, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  projectSelectorText: { color: T.colors.textPrimary, fontSize: 15, flex: 1 },
  projectPlaceholder: { color: T.colors.textDisabled },
  iosDatePickerContainer: { backgroundColor: T.colors.surface, borderRadius: 12, padding: 8, marginBottom: 16, borderWidth: 1, borderColor: T.colors.border, alignItems: 'flex-start' },
  chevron: { color: T.colors.textMuted, fontSize: 10, marginLeft: 8 },
  commentInput: { backgroundColor: T.colors.surface, borderRadius: 12, padding: 16, color: T.colors.textPrimary, height: 72, textAlignVertical: 'top', borderWidth: 1, borderColor: T.colors.border, fontSize: 15 },
  searchSection: { paddingHorizontal: 20, marginBottom: 12 },
  searchContainer: { backgroundColor: T.colors.surface, borderRadius: 12, borderWidth: 1, borderColor: T.colors.border, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14 },
  searchIcon: { fontSize: 14, marginRight: 8 },
  searchInput: { flex: 1, color: T.colors.textPrimary, paddingVertical: 12, fontSize: 15 },
  clearSearch: { color: T.colors.textMuted, fontSize: 14, padding: 4 },
  tabsContainer: { flexDirection: 'row', paddingHorizontal: 20, marginBottom: 12, gap: 8 },
  tab: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 10, backgroundColor: T.colors.surface, borderRadius: 10, borderWidth: 1, borderColor: T.colors.border },
  tabActive: { backgroundColor: T.colors.primary, borderColor: T.colors.primary },
  tabText: { fontSize: 20 },
  tabTextActive: { opacity: 1 },
  sectionTitle: { paddingHorizontal: 20, color: T.colors.textMuted, fontSize: 12, fontWeight: '700', letterSpacing: 0.5, marginBottom: 8 },
  list: { paddingHorizontal: 20, paddingBottom: 120 },
  itemCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: T.colors.surface, padding: 14, borderRadius: 12, marginBottom: 6, borderWidth: 1, borderColor: T.colors.surface },
  itemCardSelected: { borderColor: T.colors.primary, backgroundColor: T.colors.primarySoft },
  checkbox: { width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: T.colors.border, justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  checked: { backgroundColor: T.colors.primary, borderColor: T.colors.primary },
  checkMark: { color: T.colors.textOnBrand, fontSize: 12, fontWeight: 'bold' },
  itemInfo: { flex: 1 },
  itemName: { color: T.colors.textSecondary, fontSize: 14, fontWeight: '500' },
  itemNameSelected: { color: T.colors.textPrimary, fontWeight: '600' },
  itemMeta: { flexDirection: 'row', alignItems: 'center', marginTop: 4, gap: 8 },
  itemUnit: { color: T.colors.textDisabled, fontSize: 12 },
  itemNorm: { color: T.colors.primary, fontSize: 11, fontWeight: '600', backgroundColor: T.colors.primarySoft, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  inputQty: { backgroundColor: T.colors.canvas, color: T.colors.primary, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, width: 72, textAlign: 'center', fontWeight: '700', fontSize: 16, borderWidth: 1, borderColor: T.colors.border },
  empty: { alignItems: 'center', paddingVertical: 48 },
  emptyEmoji: { fontSize: 32, marginBottom: 8 },
  emptyText: { color: T.colors.textDisabled, fontSize: 14, textAlign: 'center', lineHeight: 20 },
  accessory: { backgroundColor: T.colors.textSecondary, alignItems: 'flex-end', paddingHorizontal: 10, paddingVertical: 5 },
  // Floating submit
  floatingBar: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: T.colors.surface, borderTopWidth: 1, borderTopColor: T.colors.border, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 14, paddingBottom: Platform.OS === 'ios' ? 30 : 14 },
  floatingInfo: { flexDirection: 'row', alignItems: 'baseline', gap: 6 },
  floatingCount: { color: T.colors.primary, fontSize: 24, fontWeight: '800' },
  floatingLabel: { color: T.colors.textSecondary, fontSize: 13 },
  floatingBtn: { backgroundColor: T.colors.primary, paddingHorizontal: 24, paddingVertical: 14, borderRadius: 12 },
  floatingBtnDisabled: { opacity: 0.6 },
  floatingBtnText: { color: T.colors.textOnBrand, fontSize: 15, fontWeight: '700' },
  // Modal
  modalOverlay: { flex: 1, backgroundColor: T.colors.overlay, justifyContent: 'flex-end' },
  modalContent: { backgroundColor: T.colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: Platform.OS === 'ios' ? 40 : 24, maxHeight: '70%' },
  modalHandle: { width: 36, height: 4, backgroundColor: T.colors.border, borderRadius: 2, alignSelf: 'center', marginBottom: 16 },
  modalTitle: { fontSize: 18, fontWeight: '700', color: T.colors.textPrimary, marginBottom: 20, textAlign: 'center' },
  modalItem: { paddingVertical: 14, paddingHorizontal: 12, borderRadius: 10, flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  modalItemActive: { backgroundColor: T.colors.primarySoft },
  modalRadio: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: T.colors.border, marginRight: 14, justifyContent: 'center', alignItems: 'center' },
  modalRadioActive: { borderColor: T.colors.primary },
  modalRadioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: T.colors.primary },
  modalItemText: { fontSize: 16, color: T.colors.textSecondary, flex: 1 },
  modalItemSelectedText: { color: T.colors.textPrimary, fontWeight: '600' },
});

export default enhance(CreateRequestScreen as any);
