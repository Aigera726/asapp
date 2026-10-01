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
import { CameraView, useCameraPermissions } from 'expo-camera';
import { database } from '@/database';
import { syncSavedReport } from '@/database/sync';
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

const HISTORY_STATUS: Record<VolumeHistoryEntry['status'], { label: string; color: string; bg: string }> = {
  pending_approval: { label: 'На подтверждении', color: S.warning, bg: S.warningSoft },
  approved: { label: 'Подтверждено', color: S.success, bg: S.successSoft },
  rejected: { label: 'Отклонено', color: S.danger, bg: S.dangerSoft },
  matching_error: { label: 'Ошибка сопоставления', color: S.danger, bg: S.dangerSoft },
  local: { label: 'Ожидает отправки', color: E.muted, bg: S.surface2 },
};

const formatDateTime = (d: Date | null) => d
  ? d.toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  : '—';


type Props = {
  route: RouteProp<AppStackParamList, 'ReportForm'>;
};

export default function ReportFormScreen({ route }: Props) {
  const { assignmentId, workName, unit } = route.params;
  const navigation = useNavigation<NativeStackNavigationProp<AppStackParamList>>();
  const insets = useSafeAreaInsets();
  const { user, isDemoMode } = useAuthStore();

  const [quantity, setQuantity] = useState('');
  const [comment, setComment] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [showCamera, setShowCamera] = useState(false);
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView>(null);

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

  const takePhoto = async () => {
    if (!permission?.granted) {
      const result = await requestPermission();
      if (!result.granted) {
        notify('Нет доступа', 'Разрешите доступ к камере в настройках');
        return;
      }
    }
    setShowCamera(true);
  };

  const capturePhoto = async () => {
    if (cameraRef.current) {
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.7 });
      if (photo) {
        setPhotoUri(photo.uri);
        setShowCamera(false);
      }
    }
  };

  const handleSubmit = async () => {
    const qty = workQty;
    if (!Number.isFinite(qty) || qty <= 0) {
      notify('Ошибка', 'Введите корректное количество');
      return;
    }

    if (!plan || !volume) { notify('Данные сметы', planError || 'Дождитесь загрузки фактической сметы.'); return; }
    // Проверяем по данным сервера на момент отправки: решение ERP могло
    // прийти, пока форма была открыта. Без связи — по снимку устройства,
    // окончательную проверку всё равно сделает сервер при отправке.
    const live = await refreshVolume();
    const { summary } = live ?? volume;
    if (qty > summary.limit) {
      const byContract = summary.assignmentAvailable != null && summary.assignmentAvailable < summary.available;
      notify('Объём работы', `Доступно к отправке: ${formatQty(summary.limit)} ${unit || ''}. ` +
        `Подтверждено ${formatQty(summary.confirmed)}, на подтверждении ${formatQty(summary.pending)}` +
        (byContract ? `, по договору осталось ${formatQty(summary.assignmentAvailable!)}.` : '.') +
        (live || isDemoMode ? '' : ' Нет связи с сервером: это данные на устройстве, они могли устареть.'));
      return;
    }
    const badLine = writeOffLines.find((l) => l.input.trim() === '' || !Number.isFinite(parseFloat(l.input.replace(',', '.'))) || parseFloat(l.input.replace(',', '.')) < 0);
    if (badLine) {
      notify('Ошибка', `Некорректное количество: ${badLine.resource.name}`);
      return;
    }

    setIsSaving(true);
    try {
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
      await database.write(async () => {
        const assignment = await database.get<WorkAssignment>('work_assignments').find(assignmentId);
        if (!assignment.isAvailable) {
          throw new Error('Задание недоступно. Обновите данные: нужен согласованный договор и фактическая смета.');
        }
        const reportId = generateUUID();

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
          record.photoUri = photoUri;
          record.reportSyncStatus = 'pending_sync';
          record.createdAt = new Date();
        });


      });

      if (isDemoMode) {
        notify('Отчёт сохранён', 'Демонстрационный отчёт сохранён только на устройстве.');
      } else {
        try {
          await syncSavedReport();
          notify('Отчёт отправлен', 'Выполненный объём и ресурсы переданы в ERP, раздел «Оперфакт».');
        } catch (syncError: any) {
          notify('Отчёт сохранён на устройстве',
            'Отправить в ERP пока не удалось. Повторите синхронизацию. ' + (syncError?.message ?? ''));
        }
      }
      navigation.goBack();
    } catch (err: any) {
      notify('Ошибка', err.message ?? 'Не удалось сохранить отчёт');
    } finally {
      setIsSaving(false);
    }
  };

  if (showCamera) {
    return (
      <View style={styles.cameraContainer}>
        <CameraView ref={cameraRef} style={styles.camera} facing="back">
          <View style={styles.cameraControls}>
            <TouchableOpacity id="cancel-camera-btn" style={styles.cameraCancel} onPress={() => setShowCamera(false)}>
              <Text style={styles.cameraCancelText}>Отмена</Text>
            </TouchableOpacity>
            <TouchableOpacity id="capture-btn" style={styles.captureBtn} onPress={capturePhoto}>
              <View style={styles.captureInner} />
            </TouchableOpacity>
          </View>
        </CameraView>
      </View>
    );
  }

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
          accessibilityLabel="Назад"
          style={styles.backBtn}
          onPress={() => navigation.goBack()}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Icon name="chevron-left" size={24} color={E.blue} />
        </TouchableOpacity>
        <View style={styles.topBarTitles}>
          <Text style={styles.topBarKicker}>ОТЧЁТ ОБ ОБЪЁМЕ</Text>
          <Text style={styles.topBarTitle} numberOfLines={1}>Внести объём</Text>
        </View>
      </View>
      <DismissKeyboard>
        <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.workCard}>
            <View style={styles.workIcon}><Icon name="hammer-wrench" size={20} color={E.blue} /></View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.workName} numberOfLines={3}>{workName || 'Работа'}</Text>
              <Text style={styles.assignmentId}>Задание #{assignmentId.slice(0, 8)}</Text>
            </View>
          </View>

          {planError && (
            <View style={styles.errorBanner}>
              <Icon name="alert-circle-outline" size={18} color={S.danger} />
              <Text style={styles.errorText}>{planError}</Text>
            </View>
          )}

          {summary && (
            <View style={styles.card}>
              <View style={styles.metricsGrid}>
                <Metric label="План по смете" value={summary.plan} unit={unit} />
                <Metric label="Подтверждено" value={summary.confirmed} unit={unit} color={S.success} />
                <Metric label="На подтверждении" value={summary.pending} unit={unit} color={summary.pending > 0 ? S.warning : undefined} />
                <Metric label="Доступно" value={summary.limit} unit={unit} color={exhausted ? S.danger : E.blue} strong />
              </View>
              <View style={{ marginTop: 14 }}>
                <VolumeBar volume={summary} unit={unit} legend={false} />
              </View>
              {byContract && (
                <Text style={styles.hint}>Остаток ограничен объёмом по договору организации.</Text>
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
                      ? 'Сверяем с сервером…'
                      : liveAt
                        ? `Данные сервера на ${liveAt.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}`
                        : 'Нет связи: показаны данные на устройстве'}
                  </Text>
                  <TouchableOpacity accessibilityRole="button" disabled={refreshingVolume} onPress={() => refreshVolume()}>
                    <Text style={styles.fillAll}>Обновить</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          )}

          {exhausted ? (
            <View style={styles.doneBanner}>
              <Icon name="check-circle-outline" size={20} color={S.success} />
              <View style={{ flex: 1 }}>
                <Text style={styles.doneTitle}>Весь объём отправлен</Text>
                <Text style={styles.doneText}>
                  Новый отчёт можно будет внести, когда ERP подтвердит или отклонит отправленные объёмы.
                </Text>
              </View>
            </View>
          ) : (
            <>
              <View style={styles.section}>
                <Text style={styles.label}>Выполненный объём <Text style={{ color: S.danger }}>*</Text></Text>
                <View style={[styles.quantityRow, overLimit && styles.quantityRowError]}>
                  <TextInput
                    id="quantity-input"
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
                  <Text style={styles.unitText} numberOfLines={1}>{unit || 'ед.'}</Text>
                </View>
                {summary && (
                  <View style={styles.inputFooter}>
                    <Text style={[styles.hint, overLimit && { color: S.danger, fontWeight: '600' }]}>
                      {overLimit
                        ? `Больше доступного: можно отправить не более ${formatQty(summary.limit)} ${unit || ''}`
                        : `Можно отправить до ${formatQty(summary.limit)} ${unit || ''}`}
                    </Text>
                    <TouchableOpacity accessibilityRole="button" onPress={() => setQuantity(formatQty(summary.limit))}>
                      <Text style={styles.fillAll}>Весь остаток</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>

              {/* Ресурсы фактической сметы */}
              {writeOffLines.length > 0 && (
                <View style={styles.section}>
                  <Text style={styles.label}>Ресурсы фактической сметы</Text>
                  {!hasWorkQty ? (
                    <View style={styles.emptyNote}>
                      <Icon name="calculator-variant-outline" size={18} color={E.muted} />
                      <Text style={styles.emptyNoteText}>Укажите объём — количества рассчитаются по нормам сметы</Text>
                    </View>
                  ) : (
                    <View style={styles.table}>
                      {writeOffLines.map((line, i) => (
                        <View key={line.resource.resourceId} style={[styles.writeOffRow, i > 0 && styles.writeOffDivider]}>
                          <View style={styles.writeOffInfo}>
                            <Text style={styles.writeOffName} numberOfLines={2}>{line.resource.name}</Text>
                            <Text style={styles.writeOffNorm}>
                              {line.resource.norm == null ? 'Норма не задана' : `${formatQty(line.resource.norm)} × ${formatQty(workQty)} = ${formatQty(line.planned)}`} {line.resource.unit || 'ед.'}
                            </Text>
                            <Text style={[styles.writeOffNorm, line.shortage && styles.writeOffWarn]}>
                              По смете {line.resource.quantity == null ? '—' : formatQty(line.resource.quantity)} {line.resource.unit || 'ед.'}
                              {line.shortage ? ' · расход выше сметы' : ''}
                            </Text>
                          </View>
                          <TextInput
                            accessibilityLabel={'Расход: ' + line.resource.name}
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
                      ))}
                      <Text style={styles.tableNote}>
                        Нормы и количества из фактической сметы ERP. Уточнённый расход сохранится в отчёте.
                      </Text>
                    </View>
                  )}
                </View>
              )}

              {/* Comment */}
              <View style={styles.section}>
                <Text style={styles.label}>Комментарий</Text>
                <TextInput
                  id="comment-input"
                  style={styles.commentInput}
                  value={comment}
                  onChangeText={setComment}
                  placeholder="Опишите особенности выполненных работ…"
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
                <Text style={styles.label}>Фото выполненных работ</Text>
                {photoUri ? (
                  <View style={styles.photoPreview}>
                    <Icon name="check-circle-outline" size={20} color={S.success} />
                    <Text style={styles.photoCheck}>Фото прикреплено</Text>
                    <TouchableOpacity id="retake-btn" onPress={takePhoto}>
                      <Text style={styles.retakeText}>Переснять</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <TouchableOpacity id="camera-btn" style={styles.cameraBtn} onPress={takePhoto} activeOpacity={0.8}>
                    <View style={styles.cameraIcon}><Icon name="camera-outline" size={22} color={E.blue} /></View>
                    <Text style={styles.cameraBtnText}>Сделать фото</Text>
                    <Text style={styles.cameraBtnSub}>Рекомендуется для подтверждения</Text>
                  </TouchableOpacity>
                )}
              </View>

              <View style={styles.geoInfo}>
                <Icon name="map-marker-outline" size={16} color={E.muted} />
                <Text style={styles.geoText}>Геолокация будет записана автоматически при сохранении</Text>
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
                    <Text style={styles.submitBtnText}>Отправить на подтверждение</Text>
                  </>
                )}
              </TouchableOpacity>
              <Text style={styles.submitSub}>Без сети отчёт сохранится и уйдёт при появлении связи</Text>
            </>
          )}

          {/* История отправок по работе */}
          {volume && volume.history.length > 0 && (
            <View style={[styles.section, { marginTop: 28 }]}>
              <View style={styles.sectionRow}>
                <Text style={styles.sectionTitle}>Отправленные объёмы</Text>
                <Text style={styles.sectionCount}>{volume.history.length}</Text>
              </View>
              <View style={styles.table}>
                {volume.history.map((h, i) => {
                  const st = HISTORY_STATUS[h.status];
                  return (
                    <View key={h.id} style={[styles.historyRow, i > 0 && styles.writeOffDivider]}>
                      <View style={styles.historyTop}>
                        <Text style={styles.historyVolume}>{formatQty(h.volume)} <Text style={styles.historyUnit}>{h.unit || unit}</Text></Text>
                        <View style={[styles.pill, { backgroundColor: st.bg }]}>
                          <View style={[styles.pillDot, { backgroundColor: st.color }]} />
                          <Text style={[styles.pillText, { color: st.color }]}>{st.label}</Text>
                        </View>
                      </View>
                      <Text style={styles.historyMeta}>
                        {h.executorName || 'Вы'} · {formatDateTime(h.reportedAt)}
                      </Text>
                      {h.status === 'approved' && h.confirmedVolume != null && (
                        <Text style={[styles.historyMeta, { color: S.success }]}>
                          Подтверждено {formatQty(h.confirmedVolume)}
                          {h.confirmedVolume < h.volume ? ` из ${formatQty(h.volume)}` : ''}
                          {h.decidedByName ? ` · ${h.decidedByName}` : ''} · {formatDateTime(h.decidedAt)}
                        </Text>
                      )}
                      {h.status === 'rejected' && (
                        <Text style={styles.historyMeta}>
                          Решение: {h.decidedByName || 'ERP'} · {formatDateTime(h.decidedAt)}
                        </Text>
                      )}
                      {h.reason && (h.status === 'rejected' || h.status === 'matching_error') ? (
                        <Text style={[styles.historyMeta, styles.writeOffWarn]}>{h.reason}</Text>
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
  return (
    <View style={[styles.metric, strong && styles.metricStrong]}>
      <Text style={styles.metricLabel} numberOfLines={1}>{label}</Text>
      <Text style={[styles.metricValue, color ? { color } : null]} numberOfLines={1}>{formatQty(value)}</Text>
      <Text style={styles.metricUnit} numberOfLines={1}>{unit || 'ед.'}</Text>
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
  writeOffWarn: { color: S.danger, fontWeight: '600' },
  writeOffInput: { width: 92, backgroundColor: E.paper, borderWidth: 1, borderColor: E.line, borderRadius: 9, paddingVertical: 10, paddingHorizontal: 8, fontSize: 15, fontWeight: '600', color: E.ink, textAlign: 'center' },
  writeOffInputWarn: { borderColor: S.danger },

  commentInput: { backgroundColor: E.surface, borderWidth: 1, borderColor: E.line, borderRadius: 10, padding: 14, fontSize: 14, color: E.ink, minHeight: 90, textAlignVertical: 'top' },

  cameraBtn: { backgroundColor: E.surface, borderRadius: 12, borderWidth: 1, borderColor: S.lineStrong, borderStyle: 'dashed', padding: 20, alignItems: 'center' },
  cameraIcon: { width: 44, height: 44, borderRadius: 12, backgroundColor: E.soft, alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  cameraBtnText: { fontSize: 14, fontWeight: '600', color: E.ink, marginBottom: 3 },
  cameraBtnSub: { fontSize: 11, color: E.muted },
  photoPreview: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: S.successSoft, borderRadius: 12, padding: 14 },
  photoCheck: { flex: 1, color: S.success, fontSize: 14, fontWeight: '600' },
  retakeText: { color: E.blue, fontSize: 13, fontWeight: '600' },

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

  cameraContainer: { flex: 1, backgroundColor: T.colors.black },
  camera: { flex: 1 },
  cameraControls: { position: 'absolute', bottom: 50, left: 0, right: 0, alignItems: 'center' },
  cameraCancel: { position: 'absolute', left: 30, bottom: 0, padding: 12 },
  cameraCancelText: { color: '#FFFFFF', fontSize: 16 },
  captureBtn: { width: 72, height: 72, borderRadius: 36, borderWidth: 4, borderColor: '#FFFFFF', justifyContent: 'center', alignItems: 'center' },
  captureInner: { width: 56, height: 56, borderRadius: 28, backgroundColor: '#FFFFFF' },
});
