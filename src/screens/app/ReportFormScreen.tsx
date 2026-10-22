import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Platform,
  KeyboardAvoidingView,
  Keyboard,
} from 'react-native';
import { RouteProp, useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import * as Location from 'expo-location';
import ReportPhotoInput from '@/components/ReportPhotoInput';
import ReportPricePreview from '@/components/ReportPricePreview';
import { database } from '@/database';
import { syncSavedReport } from '@/database/sync';
import { preserveReportPhoto } from '@/lib/report-photo';
import WorkAssignment from '@/database/models/WorkAssignment';
import { useAuthStore } from '@/store/authStore';
import { AppStackParamList } from '@/navigation';
import { generateUUID } from '@/lib/uuid';
import { T } from '@/theme';
import { ECO as E, ECO_STATUS as S } from '@/theme/ecopro';
import { VolumeBar } from '@/components/VolumeBar';
import { DismissKeyboard } from '@/components/DismissKeyboard';
import { Icon } from '@/components/Icon';
import { formatQty } from '@/lib/domain';
import { notify } from '@/lib/alert';
import { loadEstimateReportPlan, EstimateReportPlan } from '@/lib/estimateReport';
import { loadWorkVolume, loadLiveWorkVolume, WorkVolume, VolumeHistoryEntry } from '@/lib/workVolume';
import { syncDatabase } from '@/database/sync';
import { useTranslation, useLanguageStore } from '@/i18n';
import { translate, type TranslationKey, type TranslationParams } from '@/i18n/messages';
import { displayQty, displayDate, unitLabel, demoName, reportError } from '@/i18n/work';
import { useAssignmentTexts } from '@/hooks/useAssignmentTexts';
import { localizedValue } from '@/lib/assignment-texts';
import LanguageSelector from '@/components/LanguageSelector';
import { deliveryMessage } from '@/i18n/delivery';

const HISTORY_STATUS: Record<VolumeHistoryEntry['status'], { label: TranslationKey; color: string; bg: string }> = {
  pending_approval: { label: 'history.pending', color: S.warning, bg: S.warningSoft },
  approved: { label: 'history.approved', color: S.success, bg: S.successSoft },
  rejected: { label: 'history.rejected', color: S.danger, bg: S.dangerSoft },
  matching_error: { label: 'history.matchError', color: S.danger, bg: S.dangerSoft },
  local: { label: 'history.local', color: E.muted, bg: S.surface2 },
};

function reportNotify(title: TranslationKey, message: TranslationKey, params?: TranslationParams) {
  const language = useLanguageStore.getState().language;
  notify(translate(language, title), translate(language, message, params));
}


type Props = {
  route: RouteProp<AppStackParamList, 'ReportForm'>;
};

export default function ReportFormScreen({ route }: Props) {
  const { language, t } = useTranslation();
  const fmtQty = (value: number) => displayQty(value, language);
  const formatDateTime = (value: Date | null) => displayDate(value, language);
  const { assignmentId, workName, unit, resourceId, wbsItemId } = route.params;
  const navigation = useNavigation<NativeStackNavigationProp<AppStackParamList>>();
  const insets = useSafeAreaInsets();
  const { user, isDemoMode } = useAuthStore();
  const { texts, unavailable: translationsUnavailable } = useAssignmentTexts([assignmentId]);
  const assignmentText = wbsItemId ? undefined : resourceId ? texts.resources[resourceId] : texts.works[assignmentId];
  const displayName = localizedValue(assignmentText?.names, language,
    (isDemoMode ? demoName(workName || '', language) : workName || '') || t('report.work'));
  const displayUnit = unitLabel(localizedValue(assignmentText?.units, language, unit || ''), language);

  const [quantity, setQuantity] = useState('');
  const [comment, setComment] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const savingRef = useRef(false);
  const [photoUri, setPhotoUri] = useState<string | null>(null);

  // Ресурсы фактической сметы. Нормы грузим один раз, а количества
  // пересчитываем от введённого объёма: правки прораба хранятся отдельно
  // (editedQty), иначе каждое изменение объёма затирало бы их.
  const [planError, setPlanError] = useState<string | null>(null);
  const [plan, setPlan] = useState<EstimateReportPlan | null>(null);
  const [editedQty, setEditedQty] = useState<Record<string, string>>({});
  const [volume, setVolume] = useState<WorkVolume | null>(null);
  // Когда объём последний раз сверен с сервером; null — показан снимок устройства.
  const [liveAt, setLiveAt] = useState<Date | null>(null);
  const [refreshingVolume, setRefreshingVolume] = useState(false);

  /** Свежий остаток с сервера; без связи остаётся снимок устройства. */
  const refreshVolume = async (): Promise<WorkVolume | null> => {
    if (isDemoMode) return null;
    setRefreshingVolume(true);
    try {
      const live = await loadLiveWorkVolume(assignmentId);
      if (live) {
        setVolume(live);
        setLiveAt(new Date());
      }
      return live;
    } finally {
      setRefreshingVolume(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    loadEstimateReportPlan(assignmentId)
      .then((p) => {
        if (!cancelled) setPlan(p);
      })
      .catch((e) => { if (!cancelled) setPlanError(e.message); });
    // Сначала мгновенно — снимок устройства, затем сверка с сервером.
    loadWorkVolume(assignmentId)
      .then((v) => { if (!cancelled) setVolume((cur) => cur ?? v); })
      .catch((e) => { if (!cancelled) setPlanError(e.message); });
    refreshVolume().catch(() => undefined);
    // Фоном обновляем и остальные данные, чтобы список работ тоже был свежим.
    if (!isDemoMode) syncDatabase().catch((e) => console.warn('[ReportForm] Фоновая синхронизация:', e?.message));
    return () => {
      cancelled = true;
    };
  }, [assignmentId]);

  const workQty = parseFloat(quantity.replace(',', '.'));
  const hasWorkQty = !Number.isNaN(workQty) && workQty > 0;

  /** Строки списания на текущий объём: план по норме и фактическое количество. */
  const writeOffLines = (plan?.resources ?? []).map((r) => {
    const planned = Math.round((r.norm ?? 0) * (hasWorkQty ? workQty : 0) * 1000) / 1000;
    const edited = editedQty[r.resourceId];
    const actual =
      edited === undefined ? planned : parseFloat(edited.replace(',', '.'));
    return {
      resource: r,
      displayName: localizedValue(texts.resources[r.resourceId]?.names, language, isDemoMode ? demoName(r.name, language) : r.name),
      displayUnit: unitLabel(localizedValue(texts.resources[r.resourceId]?.units, language, r.unit), language),
      planned,
      actual: Number.isNaN(actual) ? 0 : actual,
      input: edited ?? (hasWorkQty ? formatQty(planned) : ''),
      shortage: r.quantity != null && !Number.isNaN(actual) && actual > r.quantity,
    };
  });

  // Спрашиваем геолокацию заранее, чтобы системный диалог не выскакивал
  // поверх сохранения. Отказ не блокирует отчёт — координаты необязательны.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (!cancelled && status !== 'granted') {
          console.warn('[Location] Доступ к геолокации не выдан');
        }
      } catch (e) {
        console.warn('[Location] Не удалось запросить доступ', e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSubmit = async () => {
    if (savingRef.current) return;
    const qty = workQty;
    if (!Number.isFinite(qty) || qty <= 0) {
      reportNotify('common.error', 'report.invalidQuantity');
      return;
    }

    if (!plan || !volume) {
      const selectedLanguage = useLanguageStore.getState().language;
      notify(translate(selectedLanguage, 'report.estimateTitle'), planError ? reportError(planError, selectedLanguage) : translate(selectedLanguage, 'report.waitEstimate'));
      return;
    }
    savingRef.current = true;
    setIsSaving(true);
    try {
    // Проверяем по данным сервера на момент отправки: решение ERP могло
    // прийти, пока форма была открыта. Без связи — по снимку устройства,
    // окончательную проверку всё равно сделает сервер при отправке.
    const live = await refreshVolume();
    const { summary } = live ?? volume;
    if (qty > summary.limit) {
      const byContract = summary.assignmentAvailable != null && summary.assignmentAvailable < summary.available;
      const selectedLanguage = useLanguageStore.getState().language;
      const fmt = (value: number) => displayQty(value, selectedLanguage);
      notify(translate(selectedLanguage, 'report.volumeTitle'),
        translate(selectedLanguage, 'report.limitMessage', { available: fmt(summary.limit), unit: unitLabel(unit, selectedLanguage), confirmed: fmt(summary.confirmed), pending: fmt(summary.pending) })
        + (byContract ? ' ' + translate(selectedLanguage, 'report.contractRemaining', { quantity: fmt(summary.assignmentAvailable!) }) : '')
        + (live || isDemoMode ? '' : ' ' + translate(selectedLanguage, 'report.staleWarning')));
      return;
    }
    const badLine = writeOffLines.find((l) => l.input.trim() === '' || !Number.isFinite(parseFloat(l.input.replace(',', '.'))) || parseFloat(l.input.replace(',', '.')) < 0);
    if (badLine) {
      reportNotify('common.error', 'report.invalidResource', { name: badLine.displayName });
      return;
    }

      // Запрашиваем геолокацию (anti-fraud)
      let geoLat: number | null = null;
      let geoLon: number | null = null;
      const { status } = await Location.getForegroundPermissionsAsync();
      if (status === 'granted') {
        try {
          const loc = await Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.Balanced,
          });
          geoLat = loc.coords.latitude;
          geoLon = loc.coords.longitude;
        } catch (e) {
          console.warn('[Location] Failed to get current position', e);
        }
      }

      // Сохраняем ресурсы в отчёте, без движений по складу.
      const reportId = generateUUID();
      const savedPhoto = await preserveReportPhoto(photoUri, reportId);
      await database.write(async () => {
        const assignment = await database.get<WorkAssignment>('work_assignments').find(assignmentId);
        if (!assignment.isAvailable) {
          throw new Error('Задание недоступно. Обновите данные: нужен согласованный договор и фактическая смета.');
        }

        await database.collections.get('reports').create((record: any) => {
          // Устанавливаем UUID как ID записи для совместимости с Supabase
          record._raw.id = reportId;
          record.assignmentId = assignmentId;
          record.reportedBy = user?.id ?? null;
          record.reportedQuantity = qty;
          record.status = 'PENDING';
          record.comment = comment || null;
          record.resourceUsage = JSON.stringify(writeOffLines.map((line) => ({
            resource_id: line.resource.resourceId, name: line.resource.name,
            unit: line.resource.unit, kind: line.resource.kind, norm: line.resource.norm,
            estimate_quantity: line.resource.quantity, calculated_quantity: line.planned,
            reported_quantity: line.actual,
          })));
          record.geoLat = geoLat;
          record.geoLon = geoLon;
          record.photoUri = savedPhoto;
          record.reportSyncStatus = 'pending_sync';
          record.createdAt = new Date();
        });


      });

      if (isDemoMode) {
        reportNotify('report.savedTitle', 'report.demoSaved');
      } else {
        try {
          await syncSavedReport(reportId);
          reportNotify('report.sentTitle', 'report.sent');
        } catch (syncError: any) {
          const selectedLanguage = useLanguageStore.getState().language;
          notify(translate(selectedLanguage, 'report.localTitle'), translate(selectedLanguage, 'report.localSaved')
            + (syncError?.message ? ' ' + (deliveryMessage(syncError, selectedLanguage) || reportError(syncError.message, selectedLanguage)) : ''));
        }
      }
      navigation.goBack();
    } catch (err: any) {
      const selectedLanguage = useLanguageStore.getState().language;
      notify(translate(selectedLanguage, 'common.error'), reportError(err.message, selectedLanguage));
    } finally {
      savingRef.current = false;
      setIsSaving(false);
    }
  };

  const summary = volume?.summary ?? null;
  const exhausted = summary != null && summary.limit <= 0;
  const overLimit = summary != null && hasWorkQty && workQty > summary.limit;
  const byContract = summary?.assignmentAvailable != null && summary.assignmentAvailable < summary.available;

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: E.paper }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={[styles.topBar, { paddingTop: insets.top + 10 }]}>
        <TouchableOpacity
          id="back-report-btn"
          accessibilityRole="button"
          accessibilityLabel={t('common.back')}
          style={styles.backBtn}
          onPress={() => navigation.goBack()}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Icon name="chevron-left" size={24} color={E.blue} />
        </TouchableOpacity>
        <View style={styles.topBarTitles}>
          <Text style={styles.topBarKicker}>{t('report.kicker')}</Text>
          <Text style={styles.topBarTitle} numberOfLines={1}>{t('work.enter')}</Text>
        </View>
        <LanguageSelector />
      </View>
      <DismissKeyboard>
        <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.workCard}>
            <View style={styles.workIcon}><Icon name="hammer-wrench" size={20} color={E.blue} /></View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.workName} numberOfLines={3}>{displayName}</Text>
              <Text style={styles.assignmentId}>{t('report.assignment', { id: assignmentId.slice(0, 8) })}</Text>
            </View>
          </View>

          {translationsUnavailable && <Text style={styles.hint}>{t('catalogue.unavailable')}</Text>}
          {planError && (
            <View style={styles.errorBanner}>
              <Icon name="alert-circle-outline" size={18} color={S.danger} />
              <Text style={styles.errorText}>{reportError(planError, language)}</Text>
            </View>
          )}

          {summary && (
            <View style={styles.card}>
              <View style={styles.metricsGrid}>
                <Metric label={t('volume.plan')} value={summary.plan} unit={displayUnit} />
                <Metric label={t('volume.confirmed')} value={summary.confirmed} unit={displayUnit} color={S.success} />
                <Metric label={t('volume.pending')} value={summary.pending} unit={displayUnit} color={summary.pending > 0 ? S.warning : undefined} />
                <Metric label={t('volume.available')} value={summary.limit} unit={displayUnit} color={exhausted ? S.danger : E.blue} strong />
              </View>
              <View style={{ marginTop: 14 }}>
                <VolumeBar volume={summary} unit={displayUnit} legend={false} />
              </View>
              {byContract && (
                <Text style={styles.hint}>{t('report.contractLimit')}</Text>
              )}
              {!isDemoMode && (
                <View style={styles.freshRow}>
                  <Icon
                    name={liveAt ? 'check-circle-outline' : 'cloud-off-outline'}
                    size={14}
                    color={liveAt ? S.success : S.warning}
                  />
                  <Text style={[styles.freshText, !liveAt && { color: S.warning }]}>
                    {refreshingVolume
                      ? t('report.checking')
                      : liveAt
                        ? t('report.fresh', { time: displayDate(liveAt, language, true) })
                        : t('report.offline')}
                  </Text>
                  <TouchableOpacity accessibilityRole="button" disabled={refreshingVolume} onPress={() => refreshVolume()}>
                    <Text style={styles.fillAll}>{t('report.refresh')}</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          )}

          {exhausted ? (
            <View style={styles.doneBanner}>
              <Icon name="check-circle-outline" size={20} color={S.success} />
              <View style={{ flex: 1 }}>
                <Text style={styles.doneTitle}>{t('report.exhausted')}</Text>
                <Text style={styles.doneText}>
                  {t('report.exhaustedHint')}
                </Text>
              </View>
            </View>
          ) : (
            <>
              <View style={styles.section}>
                <Text style={styles.label}>{t('report.quantity')} <Text style={{ color: S.danger }}>*</Text></Text>
                <View style={[styles.quantityRow, overLimit && styles.quantityRowError]}>
                  <TextInput
                    id="quantity-input"
                    accessibilityLabel={t('report.quantity')}
                    style={styles.quantityInput}
                    value={quantity}
                    onChangeText={setQuantity}
                    placeholder="0"
                    placeholderTextColor={T.colors.textDisabled}
                    keyboardType="decimal-pad"
                    autoFocus
                    returnKeyType="done"
                    onSubmitEditing={Keyboard.dismiss}
                  />
                  <Text style={styles.unitText} numberOfLines={1}>{displayUnit}</Text>
                </View>
                {summary && (
                  <View style={styles.inputFooter}>
                    <Text style={[styles.hint, overLimit && { color: S.danger, fontWeight: '600' }]}>
                      {overLimit
                        ? t('report.overLimit', { quantity: fmtQty(summary.limit), unit: displayUnit })
                        : t('report.availableHint', { quantity: fmtQty(summary.limit), unit: displayUnit })}
                    </Text>
                    <TouchableOpacity accessibilityRole="button" onPress={() => setQuantity(formatQty(summary.limit))}>
                      <Text style={styles.fillAll}>{t('report.fillRemaining')}</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>

              <ReportPricePreview assignmentId={assignmentId} quantity={workQty} demo={isDemoMode} />

              {/* Ресурсы фактической сметы */}
              {writeOffLines.length > 0 && (
                <View style={styles.section}>
                  <Text style={styles.label}>{t('report.resourcesByNorm')}</Text>
                  {!hasWorkQty ? (
                    <View style={styles.emptyNote}>
                      <Icon name="calculator-variant-outline" size={18} color={E.muted} />
                      <Text style={styles.emptyNoteText}>{t('report.calculateHint')}</Text>
                    </View>
                  ) : (
                    <View style={styles.table}>
                      {writeOffLines.map((line, i) => (
                        <View key={line.resource.resourceId} style={[styles.writeOffRow, i > 0 && styles.writeOffDivider]}>
                          <View style={styles.writeOffInfo}>
                            <Text style={styles.writeOffName} numberOfLines={2}>{line.displayName}</Text>
                            <Text style={styles.writeOffNorm}>
                              {line.resource.norm == null ? t('report.noNorm') : `${fmtQty(line.resource.norm)} × ${fmtQty(workQty)} = ${fmtQty(line.planned)}`} {line.displayUnit}
                            </Text>
                            <Text style={[styles.writeOffNorm, line.shortage && styles.writeOffWarn]}>
                              {t('report.totalEstimateResource', { quantity: line.resource.quantity == null ? '—' : fmtQty(line.resource.quantity), unit: line.displayUnit })}
                              {line.shortage ? ' · ' + t('report.aboveEstimate') : ''}
                            </Text>
                          </View>
                          <View style={styles.writeOffActual}>
                          <Text style={[styles.writeOffNorm, { textAlign: 'right' }]}>{t('report.actualResourceQuantity')}</Text>
                          <TextInput
                            accessibilityLabel={t('report.usageLabel', { name: line.displayName })}
                            style={[styles.writeOffInput, line.shortage && styles.writeOffInputWarn]}
                            value={line.input}
                            onChangeText={(v) =>
                              setEditedQty((prev) => ({ ...prev, [line.resource.resourceId]: v }))
                            }
                            keyboardType="decimal-pad"
                            returnKeyType="done"
                            onSubmitEditing={Keyboard.dismiss}
                          />
                          </View>
                        </View>
                      ))}
                      <Text style={styles.tableNote}>
                        {t('report.resourceNote')}
                      </Text>
                    </View>
                  )}
                </View>
              )}

              {/* Comment */}
              <View style={styles.section}>
                <Text style={styles.label}>{t('report.comment')}</Text>
                <TextInput
                  id="comment-input"
                  accessibilityLabel={t('report.comment')}
                  style={styles.commentInput}
                  value={comment}
                  onChangeText={setComment}
                  placeholder={t('report.commentPlaceholder')}
                  placeholderTextColor={T.colors.textDisabled}
                  multiline
                  numberOfLines={3}
                  returnKeyType="done"
                  blurOnSubmit={true}
                  onSubmitEditing={Keyboard.dismiss}
                />
              </View>

              {/* Photo */}
              <View style={styles.section}>
                <Text style={styles.label}>{t('report.photo')}</Text>
                <ReportPhotoInput value={photoUri} onChange={setPhotoUri} disabled={isSaving} />
              </View>

              <View style={styles.geoInfo}>
                <Icon name="map-marker-outline" size={16} color={E.muted} />
                <Text style={styles.geoText}>{t('report.geoHint')}</Text>
              </View>

              <TouchableOpacity
                id="submit-report-btn"
                accessibilityRole="button"
                style={[styles.submitBtn, (isSaving || overLimit || !hasWorkQty) && styles.submitBtnDisabled]}
                onPress={handleSubmit}
                disabled={isSaving}
                activeOpacity={0.85}
              >
                {isSaving ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <>
                    <Icon name="send-outline" size={18} color="#FFFFFF" />
                    <Text style={styles.submitBtnText}>{t('report.submit')}</Text>
                  </>
                )}
              </TouchableOpacity>
              <Text style={styles.submitSub}>{t('report.offlineHint')}</Text>
            </>
          )}

          {/* История отправок по работе */}
          {volume && volume.history.length > 0 && (
            <View style={[styles.section, { marginTop: 28 }]}>
              <View style={styles.sectionRow}>
                <Text style={styles.sectionTitle}>{t('history.title')}</Text>
                <Text style={styles.sectionCount}>{volume.history.length}</Text>
              </View>
              <View style={styles.table}>
                {volume.history.map((h, i) => {
                  const st = HISTORY_STATUS[h.status];
                  return (
                    <View key={h.id} style={[styles.historyRow, i > 0 && styles.writeOffDivider]}>
                      <View style={styles.historyTop}>
                        <Text style={styles.historyVolume}>{fmtQty(h.volume)} <Text style={styles.historyUnit}>{unitLabel(h.unit || displayUnit, language)}</Text></Text>
                        <View style={[styles.pill, { backgroundColor: st.bg }]}>
                          <View style={[styles.pillDot, { backgroundColor: st.color }]} />
                          <Text style={[styles.pillText, { color: st.color }]}>{t(st.label)}</Text>
                        </View>
                      </View>
                      <Text style={styles.historyMeta}>
                        {h.executorName || t('history.you')} · {formatDateTime(h.reportedAt)}
                      </Text>
                      {h.status === 'approved' && h.confirmedVolume != null && (
                        <Text style={[styles.historyMeta, { color: S.success }]}>
                          {t(h.confirmedVolume < h.volume ? 'history.partial' : 'history.confirmed', { quantity: fmtQty(h.confirmedVolume), reported: fmtQty(h.volume) })}
                          {h.decidedByName ? ` · ${h.decidedByName}` : ''} · {formatDateTime(h.decidedAt)}
                        </Text>
                      )}
                      {h.status === 'rejected' && (
                        <Text style={styles.historyMeta}>
                          {t('history.decision', { name: h.decidedByName || 'ERP' })} · {formatDateTime(h.decidedAt)}
                        </Text>
                      )}
                      {h.reason && (h.status === 'rejected' || h.status === 'matching_error') ? (
                        <Text style={[styles.historyMeta, styles.writeOffWarn]}>{t('history.reason', { reason: h.reason })}</Text>
                      ) : null}
                    </View>
                  );
                })}
              </View>
            </View>
          )}
        </ScrollView>
      </DismissKeyboard>
    </KeyboardAvoidingView>
  );
}

function Metric({ label, value, unit, color, strong }: { label: string; value: number; unit?: string; color?: string; strong?: boolean }) {
  const { language } = useTranslation();
  return (
    <View style={[styles.metric, strong && styles.metricStrong]}>
      <Text style={styles.metricLabel} numberOfLines={1}>{label}</Text>
      <Text style={[styles.metricValue, color ? { color } : null]} numberOfLines={1}>{displayQty(value, language)}</Text>
      <Text style={styles.metricUnit} numberOfLines={1}>{unitLabel(unit, language)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  topBar: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingBottom: 12, backgroundColor: E.surface, borderBottomWidth: 1, borderBottomColor: E.line },
  backBtn: { width: 40, height: 40, borderRadius: 10, backgroundColor: E.soft, alignItems: 'center', justifyContent: 'center' },
  topBarTitles: { flex: 1, minWidth: 0 },
  topBarKicker: { fontSize: 9, letterSpacing: 1.6, color: E.muted, marginBottom: 3 },
  topBarTitle: { fontSize: 19, lineHeight: 25, fontWeight: '600', letterSpacing: -0.4, color: E.ink },

  container: { flex: 1, backgroundColor: E.paper },
  content: { paddingHorizontal: 20, paddingTop: 18, paddingBottom: 40, width: '100%', maxWidth: 760, alignSelf: 'center' },

  workCard: { flexDirection: 'row', gap: 12, alignItems: 'flex-start', backgroundColor: E.surface, borderWidth: 1, borderColor: E.line, borderRadius: 14, padding: 16, marginBottom: 12 },
  workIcon: { width: 42, height: 42, borderRadius: 11, backgroundColor: E.soft, alignItems: 'center', justifyContent: 'center' },
  workName: { fontSize: 15, fontWeight: '600', lineHeight: 21, color: E.ink },
  assignmentId: { fontSize: 11, color: E.muted, marginTop: 4 },

  errorBanner: { flexDirection: 'row', gap: 8, alignItems: 'center', padding: 14, borderRadius: 10, backgroundColor: S.dangerSoft, marginBottom: 12 },
  errorText: { flex: 1, fontSize: 12, lineHeight: 18, color: S.danger },

  card: { backgroundColor: E.surface, borderWidth: 1, borderColor: E.line, borderRadius: 14, padding: 16, marginBottom: 22 },
  metricsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  metric: { flexGrow: 1, flexBasis: '46%', padding: 12, borderRadius: 10, backgroundColor: E.paper },
  metricStrong: { backgroundColor: E.soft },
  metricLabel: { fontSize: 10, color: E.muted },
  metricValue: { fontSize: 23, fontWeight: '500', letterSpacing: -0.8, color: E.ink, marginTop: 6 },
  metricUnit: { fontSize: 10, color: E.muted, marginTop: 2 },
  hint: { fontSize: 11, lineHeight: 16, color: E.muted, marginTop: 8, flex: 1 },
  freshRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: E.line },
  freshText: { flex: 1, fontSize: 11, color: E.muted },

  doneBanner: { flexDirection: 'row', gap: 12, alignItems: 'flex-start', padding: 16, borderRadius: 12, backgroundColor: S.successSoft, marginBottom: 8 },
  doneTitle: { fontSize: 14, fontWeight: '600', color: S.success },
  doneText: { fontSize: 12, lineHeight: 18, color: E.ink, marginTop: 4 },

  section: { marginBottom: 22 },
  sectionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  sectionTitle: { color: E.ink, fontSize: 17, fontWeight: '600', letterSpacing: -0.3 },
  sectionCount: { fontSize: 12, color: E.muted },
  label: { fontSize: 10, fontWeight: '600', letterSpacing: 1.2, textTransform: 'uppercase', color: E.muted, marginBottom: 10 },

  quantityRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: E.surface, borderWidth: 1.5, borderColor: E.blue, borderRadius: 12, paddingRight: 16 },
  quantityRowError: { borderColor: S.danger, backgroundColor: '#FFFBFA' },
  // Рамку даёт контейнер; браузерная обводка фокуса на вебе её дублировала.
  quantityInput: { flex: 1, minWidth: 0, paddingVertical: 16, paddingHorizontal: 16, fontSize: 30, fontWeight: '500', letterSpacing: -1, color: E.ink, ...(({ outlineStyle: 'none' } as any)) },
  unitText: { maxWidth: '45%', color: E.muted, fontSize: 14, fontWeight: '500' },
  inputFooter: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  fillAll: { fontSize: 12, fontWeight: '600', color: E.blue, marginTop: 8 },

  emptyNote: { flexDirection: 'row', gap: 10, alignItems: 'center', padding: 14, borderRadius: 10, borderWidth: 1, borderStyle: 'dashed', borderColor: S.lineStrong },
  emptyNoteText: { flex: 1, fontSize: 12, lineHeight: 18, color: E.muted },

  table: { backgroundColor: E.surface, borderWidth: 1, borderColor: E.line, borderRadius: 12, overflow: 'hidden' },
  tableNote: { fontSize: 11, lineHeight: 16, color: E.muted, padding: 12, backgroundColor: E.paper, borderTopWidth: 1, borderTopColor: E.line },
  writeOffRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
  writeOffDivider: { borderTopWidth: 1, borderTopColor: E.line },
  writeOffInfo: { flex: 1, minWidth: 0 },
  writeOffName: { fontSize: 14, fontWeight: '600', color: E.ink, marginBottom: 4, lineHeight: 19 },
  writeOffNorm: { fontSize: 11, lineHeight: 16, color: E.muted },
  writeOffActual: { width: 92, alignItems: 'flex-end', gap: 4 },
  writeOffWarn: { color: S.danger, fontWeight: '600' },
  writeOffInput: { width: 92, backgroundColor: E.paper, borderWidth: 1, borderColor: E.line, borderRadius: 9, paddingVertical: 10, paddingHorizontal: 8, fontSize: 15, fontWeight: '600', color: E.ink, textAlign: 'center' },
  writeOffInputWarn: { borderColor: S.danger },

  commentInput: { backgroundColor: E.surface, borderWidth: 1, borderColor: E.line, borderRadius: 10, padding: 14, fontSize: 14, color: E.ink, minHeight: 90, textAlignVertical: 'top' },


  geoInfo: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 18 },
  geoText: { flex: 1, fontSize: 11, color: E.muted, lineHeight: 16 },

  submitBtn: { flexDirection: 'row', gap: 10, alignItems: 'center', justifyContent: 'center', minHeight: 52, borderRadius: 10, backgroundColor: E.blue },
  submitBtnDisabled: { opacity: 0.5 },
  submitBtnText: { color: '#FFFFFF', fontSize: 15, fontWeight: '600' },
  submitSub: { textAlign: 'center', fontSize: 11, color: E.muted, marginTop: 8 },

  historyRow: { padding: 14 },
  historyTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10, marginBottom: 4 },
  historyVolume: { fontSize: 17, fontWeight: '500', letterSpacing: -0.4, color: E.ink },
  historyUnit: { fontSize: 12, letterSpacing: 0, color: E.muted },
  historyMeta: { fontSize: 11, lineHeight: 17, color: E.muted, marginTop: 2 },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 9, paddingVertical: 4, borderRadius: 99 },
  pillDot: { width: 6, height: 6, borderRadius: 3 },
  pillText: { fontSize: 11, fontWeight: '600' },

});
