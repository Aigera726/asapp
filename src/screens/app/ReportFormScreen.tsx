import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  ActivityIndicator,
  Platform,
  KeyboardAvoidingView,
  TouchableWithoutFeedback,
  Keyboard,
} from 'react-native';
import { RouteProp, useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import * as Location from 'expo-location';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { database } from '@/database';
import { useAuthStore } from '@/store/authStore';
import { AppStackParamList } from '@/navigation';
import { generateUUID } from '@/lib/uuid';
import { T } from '@/theme';
import { Icon } from '@/components/Icon';
import { formatQty } from '@/lib/domain';
import {
  loadWriteOffPlan,
  normedQuantity,
  writeOffComment,
  WriteOffPlan,
} from '@/lib/writeOff';

type Props = {
  route: RouteProp<AppStackParamList, 'ReportForm'>;
};

export default function ReportFormScreen({ route }: Props) {
  const { assignmentId, workName, unit } = route.params;
  const navigation = useNavigation<NativeStackNavigationProp<AppStackParamList>>();
  const { user } = useAuthStore();

  const [quantity, setQuantity] = useState('');
  const [comment, setComment] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [showCamera, setShowCamera] = useState(false);
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView>(null);

  // Списание материалов по нормам сметы. Нормы грузим один раз, а количества
  // пересчитываем от введённого объёма: правки прораба хранятся отдельно
  // (editedQty), иначе каждое изменение объёма затирало бы их.
  const [plan, setPlan] = useState<WriteOffPlan | null>(null);
  const [editedQty, setEditedQty] = useState<Record<string, string>>({});

  useEffect(() => {
    let cancelled = false;
    loadWriteOffPlan(assignmentId)
      .then((p) => {
        if (!cancelled) setPlan(p);
      })
      .catch((e) => console.warn('[WriteOff] Не удалось загрузить нормы', e));
    return () => {
      cancelled = true;
    };
  }, [assignmentId]);

  const workQty = parseFloat(quantity.replace(',', '.'));
  const hasWorkQty = !Number.isNaN(workQty) && workQty > 0;

  /** Строки списания на текущий объём: план по норме и фактическое количество. */
  const writeOffLines = (plan?.resources ?? []).map((r) => {
    const planned = normedQuantity(r.norm, hasWorkQty ? workQty : 0);
    const edited = editedQty[r.resourceId];
    const actual =
      edited === undefined ? planned : parseFloat(edited.replace(',', '.'));
    return {
      resource: r,
      planned,
      actual: Number.isNaN(actual) ? 0 : actual,
      input: edited ?? (hasWorkQty ? formatQty(planned) : ''),
      shortage: !Number.isNaN(actual) && actual > r.balance,
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
        Alert.alert('Нет доступа', 'Разрешите доступ к камере в настройках');
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
    if (isNaN(qty) || qty <= 0) {
      Alert.alert('Ошибка', 'Введите корректное количество');
      return;
    }

    const badLine = writeOffLines.find((l) => l.input.trim() !== '' && Number.isNaN(
      parseFloat(l.input.replace(',', '.'))
    ));
    if (badLine) {
      Alert.alert('Ошибка', `Некорректное количество: ${badLine.resource.name}`);
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

      // Списываем только положительные количества: строку с нулём прораб
      // обнулил осознанно (материал не расходовался), пустое движение по ней
      // только засорило бы журнал.
      const toWriteOff = writeOffLines.filter((l) => l.actual > 0);
      const projectId = plan?.projectId ?? null;

      // Отчёт и списание — одна операция: если движения не запишутся, объём
      // выполнения не должен остаться зафиксированным без расхода материалов.
      await database.write(async () => {
        const reportId = generateUUID();

        await database.collections.get('reports').create((record: any) => {
          // Устанавливаем UUID как ID записи для совместимости с Supabase
          record._raw.id = reportId;
          record.assignmentId = assignmentId;
          record.reportedBy = user?.id ?? null;
          record.reportedQuantity = qty;
          record.status = 'PENDING';
          record.comment = comment || null;
          record.geoLat = geoLat;
          record.geoLon = geoLon;
          record.photoUri = photoUri;
          record.reportSyncStatus = 'pending_sync';
        });

        if (projectId && toWriteOff.length > 0) {
          await database.batch(
            ...toWriteOff.map((line) =>
              database.collections.get('material_movements').prepareCreate((record: any) => {
                record._raw.id = generateUUID();
                record.projectId = projectId;
                record.resourceId = line.resource.resourceId;
                record.materialName = line.resource.name;
                record.unit = line.resource.unit;
                record.type = 'WRITE_OFF';
                record.quantity = line.actual;
                record.wbsItemId = plan?.wbsItemId ?? null;
                record.comment = writeOffComment(
                  workName,
                  line.planned,
                  line.actual,
                  `Отчёт #${reportId.slice(0, 8)}`
                );
                record.occurredAt = new Date();
                record.createdBy = user?.id ?? null;
                record.recordSyncStatus = 'pending_sync';
              })
            )
          );
        }
      });

      Alert.alert(
        'Отчёт сохранён',
        toWriteOff.length > 0
          ? `Списано материалов: ${toWriteOff.length}. Данные записаны локально и будут синхронизированы при наличии сети.`
          : 'Данные записаны локально и будут синхронизированы при наличии сети.',
        [{ text: 'OK', onPress: () => navigation.goBack() }]
      );
    } catch (err: any) {
      Alert.alert('Ошибка', err.message ?? 'Не удалось сохранить отчёт');
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

  return (
    <KeyboardAvoidingView 
      style={{ flex: 1 }} 
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <ScrollView style={styles.container} contentContainerStyle={styles.content}>
          {/* Header */}
          <View style={styles.header}>
            <TouchableOpacity id="back-report-btn" onPress={() => navigation.goBack()}>
              <Text style={styles.backText}>← Назад</Text>
            </TouchableOpacity>
            <Text style={styles.title}>Внести отчёт</Text>
            {workName ? (
              <Text style={styles.workName} numberOfLines={2}>{workName}</Text>
            ) : null}
            <Text style={styles.assignmentId}>Задание #{assignmentId.slice(0, 8)}</Text>
          </View>

          {/* Quantity Input */}
          <View style={styles.section}>
            <Text style={styles.label}>Выполненный объём *</Text>
            <View style={styles.quantityRow}>
              <TextInput
                id="quantity-input"
                style={styles.quantityInput}
                value={quantity}
                onChangeText={setQuantity}
                placeholder="0.00"
                placeholderTextColor={T.colors.textDisabled}
                keyboardType="decimal-pad"
                autoFocus
                returnKeyType="done"
                onSubmitEditing={Keyboard.dismiss}
              />
              <View style={styles.unitBadge}>
                <Text style={styles.unitText}>{unit || 'ед.'}</Text>
              </View>
            </View>
          </View>

          {/* Списание материалов по нормам */}
          {writeOffLines.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.label}>Списание материалов по нормам</Text>
              {!hasWorkQty ? (
                <Text style={styles.writeOffHint}>
                  Укажите выполненный объём — количества рассчитаются по нормам сметы
                </Text>
              ) : (
                <>
                  {writeOffLines.map((line) => (
                    <View key={line.resource.resourceId} style={styles.writeOffRow}>
                      <View style={styles.writeOffInfo}>
                        <Text style={styles.writeOffName} numberOfLines={2}>
                          {line.resource.name}
                        </Text>
                        <Text style={styles.writeOffNorm}>
                          Норма {formatQty(line.resource.norm)} × {formatQty(workQty)} ={' '}
                          {formatQty(line.planned)} {line.resource.unit || 'ед.'}
                        </Text>
                        <Text style={[styles.writeOffNorm, line.shortage && styles.writeOffWarn]}>
                          Остаток: {formatQty(line.resource.balance)} {line.resource.unit || 'ед.'}
                          {line.shortage ? ' — не хватает' : ''}
                        </Text>
                      </View>
                      <TextInput
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
                  <Text style={styles.writeOffHint}>
                    Количества подставлены по нормам сметы. Исправьте, если фактический
                    расход отличался — отклонение попадёт в журнал склада.
                  </Text>
                </>
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
              placeholder="Опишите особенности выполненных работ..."
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
                <Text style={styles.photoCheck}>Фото прикреплено</Text>
                <TouchableOpacity id="retake-btn" onPress={takePhoto}>
                  <Text style={styles.retakeText}>Переснять</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity id="camera-btn" style={styles.cameraBtn} onPress={takePhoto} activeOpacity={0.8}>
                <Icon name="camera-outline" size={22} color={T.colors.primary} />
                <Text style={styles.cameraBtnText}>Сделать фото</Text>
                <Text style={styles.cameraBtnSub}>Рекомендуется для подтверждения</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Geo Info */}
          <View style={styles.geoInfo}>
            <Icon name="map-marker-outline" size={16} color={T.colors.textMuted} />
            <Text style={styles.geoText}>
              Геолокация будет записана автоматически при сохранении
            </Text>
          </View>

          {/* Submit */}
          <TouchableOpacity
            id="submit-report-btn"
            style={[styles.submitBtn, isSaving && styles.submitBtnDisabled]}
            onPress={handleSubmit}
            disabled={isSaving}
            activeOpacity={0.8}
          >
            {isSaving ? (
              <ActivityIndicator color={T.colors.white} />
            ) : (
              <>
                <Text style={styles.submitBtnText}>Сохранить отчёт</Text>
                <Text style={styles.submitBtnSub}>
                  Будет отправлен при появлении сети
                </Text>
              </>
            )}
          </TouchableOpacity>
        </ScrollView>
      </TouchableWithoutFeedback>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: T.colors.canvas,
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: T.spacing.xxl,
    paddingBottom: 40,
  },
  header: {
    marginBottom: 32,
  },
  backText: {
    color: T.colors.primary,
    fontSize: 16,
    marginBottom: 16,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: T.colors.textPrimary,
    marginBottom: 4,
  },
  workName: {
    ...T.font.bodyStrong,
    color: T.colors.textSecondary,
    marginBottom: T.spacing.xs,
    lineHeight: 20,
  },
  assignmentId: {
    fontSize: 13,
    color: T.colors.textMuted,
  },
  section: {
    marginBottom: 24,
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
    color: T.colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 10,
  },
  quantityRow: {
    flexDirection: 'row',
    gap: 10,
  },
  quantityInput: {
    flex: 1,
    backgroundColor: T.colors.surface,
    borderWidth: 1,
    borderColor: T.colors.primary,
    borderRadius: 14,
    padding: 18,
    fontSize: 28,
    fontWeight: '700',
    color: T.colors.textPrimary,
    textAlign: 'center',
  },
  unitBadge: {
    backgroundColor: T.colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: T.colors.border,
    paddingHorizontal: 16,
    justifyContent: 'center',
  },
  unitText: {
    color: T.colors.textSecondary,
    fontSize: 16,
    fontWeight: '600',
  },
  writeOffRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: T.colors.surface,
    borderWidth: 1,
    borderColor: T.colors.border,
    borderRadius: 14,
    padding: 14,
    marginBottom: 8,
  },
  writeOffInfo: {
    flex: 1,
  },
  writeOffName: {
    fontSize: 15,
    fontWeight: '600',
    color: T.colors.textPrimary,
    marginBottom: 4,
  },
  writeOffNorm: {
    fontSize: 12,
    color: T.colors.textMuted,
  },
  writeOffWarn: {
    color: T.colors.danger,
    fontWeight: '600',
  },
  writeOffInput: {
    width: 92,
    backgroundColor: T.colors.surfaceSunken,
    borderWidth: 1,
    borderColor: T.colors.border,
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 8,
    fontSize: 16,
    fontWeight: '700',
    color: T.colors.textPrimary,
    textAlign: 'center',
  },
  writeOffInputWarn: {
    borderColor: T.colors.danger,
  },
  writeOffHint: {
    fontSize: 12,
    color: T.colors.textMuted,
    lineHeight: 17,
    marginTop: 4,
  },
  commentInput: {
    backgroundColor: T.colors.surface,
    borderWidth: 1,
    borderColor: T.colors.border,
    borderRadius: 14,
    padding: 16,
    fontSize: 15,
    color: T.colors.textPrimary,
    minHeight: 90,
    textAlignVertical: 'top',
  },
  cameraBtn: {
    backgroundColor: T.colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: T.colors.border,
    borderStyle: 'dashed',
    padding: 24,
    alignItems: 'center',
  },
  cameraBtnIcon: {
    fontSize: 32,
    marginBottom: 8,
  },
  cameraBtnText: {
    fontSize: 16,
    fontWeight: '600',
    color: T.colors.textSecondary,
    marginBottom: 4,
  },
  cameraBtnSub: {
    fontSize: 12,
    color: T.colors.textDisabled,
  },
  photoPreview: {
    backgroundColor: T.colors.successSoft,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: T.colors.success,
    padding: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  photoCheck: {
    color: T.colors.success,
    fontSize: 15,
    fontWeight: '600',
  },
  retakeText: {
    color: T.colors.primary,
    fontSize: 14,
  },
  geoInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: T.colors.surface,
    borderRadius: 12,
    padding: 14,
    marginBottom: 24,
    gap: 10,
  },
  geoIcon: {
    fontSize: 20,
  },
  geoText: {
    flex: 1,
    fontSize: 13,
    color: T.colors.textMuted,
    lineHeight: 18,
  },
  submitBtn: {
    backgroundColor: T.colors.primary,
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    shadowColor: T.colors.primary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.45,
    shadowRadius: 16,
    elevation: 10,
  },
  submitBtnDisabled: {
    opacity: 0.6,
  },
  submitBtnText: {
    color: T.colors.textOnBrand,
    fontSize: 17,
    fontWeight: '700',
    marginBottom: 2,
  },
  submitBtnSub: {
    color: 'rgba(255, 255, 255, 0.62)',
    fontSize: 11,
    fontWeight: '600',
  },
  cameraContainer: {
    flex: 1,
    backgroundColor: T.colors.black,
  },
  camera: {
    flex: 1,
  },
  cameraControls: {
    position: 'absolute',
    bottom: 50,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  cameraCancel: {
    position: 'absolute',
    left: 30,
    bottom: 0,
    padding: 12,
  },
  cameraCancelText: {
    color: T.colors.textOnBrand,
    fontSize: 16,
  },
  captureBtn: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 4,
    borderColor: T.colors.textOnBrand,
    justifyContent: 'center',
    alignItems: 'center',
  },
  captureInner: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: T.colors.textOnBrand,
  },
});
