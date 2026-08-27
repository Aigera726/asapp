import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Modal,
  ActivityIndicator,
  Alert,
  TextInput,
  Platform,
} from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { useNavigation } from '@react-navigation/native';
import { withObservables } from '@nozbe/watermelondb/react';
import { of } from 'rxjs';
import { database } from '@/database';
import DocumentModel from '@/database/models/Document';
import Contractor from '@/database/models/Contractor';
import Project from '@/database/models/Project';
import { T } from '@/theme';
import { Icon } from '@/components/Icon';

/**
 * Адрес сервиса подписания ЭЦП. Задаётся окружением, а не хардкодом:
 * на этот хост уходит закрытый ключ .p12 вместе с паролем, поэтому
 * он должен быть под контролем AS Group и меняться без пересборки кода.
 */
const SIGN_SERVICE_URL = process.env.EXPO_PUBLIC_SIGN_SERVICE_URL ?? '';

const getTypeColor = (type: string) => {
  switch (type) {
    case 'AVR': return T.colors.primary;
    case 'ASR': return T.colors.success;
    case 'KS-2': return T.colors.warning;
    case 'KS-3': return T.colors.warning;
    case 'CONTRACT': return T.colors.violet;
    default: return T.colors.textMuted;
  }
};

// Sub-component for each document item, rendered with its related data
const DocItem = ({ 
  item, 
  contractor, 
  project, 
  onSign,
  onPress
}: { 
  item: DocumentModel; 
  contractor: Contractor | null; 
  project: Project | null;
  onSign: (doc: DocumentModel) => void;
  onPress: (doc: DocumentModel) => void;
}) => (
  <TouchableOpacity style={styles.docCard} onPress={() => onPress(item)} activeOpacity={0.9}>
    <View style={styles.docHeader}>
      <View style={[styles.typeBadge, { backgroundColor: getTypeColor(item.type) }]}>
        <Text style={styles.typeText}>{item.type}</Text>
      </View>
      <Text style={styles.docDate}>
        {item.updatedAt.toLocaleDateString('ru-RU')}
      </Text>
    </View>
    
    <Text style={styles.docTitle}>{item.title}</Text>
    
    <View style={styles.docSubInfo}>
      <Text style={styles.docNumber}>№ {item.number}</Text>
      {contractor && (
        <Text style={styles.docMetaText}>{contractor.companyName}</Text>
      )}
      {project && (
        <Text style={styles.docMetaText}>{project.name}</Text>
      )}
    </View>
    
    <View style={styles.footer}>
      <View style={[styles.statusBadge, item.status === 'SIGNED' ? styles.statusSigned : styles.statusPending]}>
        <Text style={[styles.statusText, item.status === 'SIGNED' ? styles.textSigned : styles.textPending]}>
          {item.status === 'SIGNED' ? '● Подписано' : '○ Ожидает подписи'}
        </Text>
      </View>
      
      {item.status === 'PENDING' && (
        <TouchableOpacity 
          style={styles.signButton} 
          onPress={() => onSign(item)}
          activeOpacity={0.7}
        >
          <Text style={styles.signButtonText}>Подписать ЭЦП</Text>
        </TouchableOpacity>
      )}
    </View>
  </TouchableOpacity>
);

const EnhanceDocItem = withObservables(['item'], ({ item }: { item: DocumentModel }) => ({
  item,
  contractor: item.contractorId 
    ? database.collections.get<Contractor>('contractors').findAndObserve(item.contractorId) 
    : of(null),
  project: item.projectId 
    ? database.collections.get<Project>('projects').findAndObserve(item.projectId) 
    : of(null),
}))(({ item, contractor, project, onSign, onPress }: any) => (
  <DocItem item={item} contractor={contractor} project={project} onSign={onSign} onPress={onPress} />
));

function DocumentsScreen({ documents }: { documents: DocumentModel[] }) {
  const navigation = useNavigation();
  const [isSigning, setIsSigning] = useState(false);
  const [selectedDoc, setSelectedDoc] = useState<DocumentModel | null>(null);
  const [showSignModal, setShowSignModal] = useState(false);
  
  // EDS signing states
  const [edsFile, setEdsFile] = useState<DocumentPicker.DocumentPickerResult | null>(null);
  const [password, setPassword] = useState('');

  const handleOpenSign = (doc: DocumentModel) => {
    setSelectedDoc(doc);
    setEdsFile(null);
    setPassword('');
    setShowSignModal(true);
  };

  const pickKey = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/x-pkcs12', '*/*'],
        copyToCacheDirectory: true,
      });
      if (!result.canceled) {
        setEdsFile(result);
      }
    } catch (err) {
      console.error('[DocumentPicker] Error:', err);
    }
  };

  const confirmSign = async () => {
    if (!edsFile || edsFile.canceled) {
      Alert.alert('Ошибка', 'Пожалуйста, выберите файл ключа ЭЦП (.p12)');
      return;
    }
    if (!password) {
      Alert.alert('Ошибка', 'Введите пароль от ключа');
      return;
    }

    if (!SIGN_SERVICE_URL) {
      Alert.alert(
        'Сервис подписания не настроен',
        'Не задан EXPO_PUBLIC_SIGN_SERVICE_URL. Обратитесь к администратору — ' +
          'без него закрытый ключ ЭЦП отправлять некуда.'
      );
      return;
    }

    setIsSigning(true);
    try {
      const formData = new FormData();
      const fileAsset = edsFile.assets[0];

      formData.append('p12_key', {
        uri: fileAsset.uri,
        name: fileAsset.name,
        type: 'application/x-pkcs12',
      } as any);

      formData.append('password', password);
      formData.append('doc_id', selectedDoc?.id || '');
      formData.append('doc_url', selectedDoc?.pdfUrl || '');

      const response = await fetch(SIGN_SERVICE_URL, {
        method: 'POST',
        body: formData,
        // Content-Type не задаём вручную: multipart-запросу нужен boundary,
        // который вычисляет сам fetch. Ручной заголовок ломает разбор на сервере.
        headers: {
          Accept: 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`Ошибка сервера: ${response.status}`);
      }

      const result = await response.json();

      await database.write(async () => {
        if (selectedDoc) {
          const docRecord = await database.get<DocumentModel>('documents').find(selectedDoc.id);
          await docRecord.update((r: DocumentModel) => {
            r.status = 'SIGNED';
            if (result.signed_url) {
              r.signedUrl = result.signed_url;
            }
          });
        }
      });

      setIsSigning(false);
      setShowSignModal(false);
      Alert.alert('Успех', `Документ ${selectedDoc?.number} успешно подписан ЭЦП.`);
    } catch (err: any) {
      console.error('[Sign] Error:', err);
      setIsSigning(false);
      Alert.alert('Ошибка подписания', err.message || 'Произошла непредвиденная ошибка');
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Документы</Text>
        <Text style={styles.headerSubtitle}>Согласование и подписание файлов</Text>
      </View>

      <FlatList
        data={documents}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <EnhanceDocItem 
            item={item} 
            onSign={handleOpenSign} 
            onPress={(doc: DocumentModel) => (navigation as any).navigate('DocumentView', { documentId: doc.id })} 
          />
        )}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Icon name="file-document-multiple-outline" size={34} color={T.colors.textDisabled} />
            <Text style={styles.emptyTitle}>Нет документов</Text>
            <Text style={styles.emptyText}>
              Список документов появится после синхронизации заданий или актов.
            </Text>
          </View>
        }
      />

      <Modal
        visible={showSignModal}
        transparent
        animationType="slide"
        onRequestClose={() => !isSigning && setShowSignModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            {isSigning ? (
              <View style={styles.signingContainer}>
                <ActivityIndicator size="large" color={T.colors.primary} />
                <Text style={styles.signingText}>Подписание ЭЦП...</Text>
                <Text style={styles.signingSubtext}>Мы передаем ключ на сервер для формирования подписи. Пожалуйста, подождите.</Text>
              </View>
            ) : (
              <>
                <Text style={styles.modalTitle}>Подписание ЭЦП</Text>
                <Text style={styles.modalDocName}>Документ: {selectedDoc?.number}</Text>
                
                <View style={styles.formSection}>
                  <Text style={styles.fieldLabel}>Файл ключа (.p12)</Text>
                  <TouchableOpacity style={styles.filePicker} onPress={pickKey}>
                    <Icon name="key-outline" size={22} color={T.colors.primary} />
                    <Text style={styles.filePickerText}>
                      {edsFile && !edsFile.canceled ? edsFile.assets[0].name : 'Выбрать файл ключа'}
                    </Text>
                  </TouchableOpacity>

                  <Text style={styles.fieldLabel}>Пароль от ключа</Text>
                  <TextInput
                    style={styles.passwordInput}
                    placeholder="Введите пароль"
                    placeholderTextColor={T.colors.textMuted}
                    secureTextEntry
                    value={password}
                    onChangeText={setPassword}
                    autoFocus={false}
                  />
                </View>

                <View style={[styles.securityNotice, { marginBottom: 24 }]}>
                   <Text style={styles.securityText}>
                     Файл ключа и пароль будут удалены с сервера сразу после подписания документа.
                   </Text>
                </View>

                <TouchableOpacity
                  style={[
                    styles.confirmSignBtn,
                    (!edsFile || !password || !SIGN_SERVICE_URL) && styles.btnDisabled,
                  ]}
                  onPress={confirmSign}
                  disabled={!edsFile || !password || !SIGN_SERVICE_URL}
                >
                  <Text style={styles.confirmSignBtnText}>Подписать документ</Text>
                </TouchableOpacity>

                <TouchableOpacity 
                  style={styles.cancelButton} 
                  onPress={() => setShowSignModal(false)}
                >
                  <Text style={styles.cancelButtonText}>Отмена</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: T.colors.canvas,
    paddingTop: 56,
  },
  header: {
    paddingHorizontal: 20,
    marginBottom: 20,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: T.colors.textPrimary,
  },
  headerSubtitle: {
    fontSize: 14,
    color: T.colors.textSecondary,
    marginTop: 4,
  },
  listContent: {
    paddingBottom: 24,
    flexGrow: 1,
  },
  docCard: {
    backgroundColor: T.colors.surface,
    marginHorizontal: 20,
    borderRadius: 16,
    padding: 18,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: T.colors.border,
  },
  docHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  typeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  typeText: {
    color: T.colors.textOnBrand,
    fontSize: 10,
    fontWeight: '800',
  },
  docDate: {
    fontSize: 12,
    color: T.colors.textMuted,
  },
  docTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: T.colors.textPrimary,
    marginBottom: 8,
  },
  docSubInfo: {
    marginBottom: 16,
    gap: 4,
  },
  docNumber: {
    fontSize: 13,
    color: T.colors.primary,
    fontWeight: '600',
  },
  docMetaText: {
    fontSize: 13,
    color: T.colors.textSecondary,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 4,
  },
  statusBadge: {
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 20,
  },
  statusSigned: {
    backgroundColor: T.colors.successSoft,
  },
  statusPending: {
    backgroundColor: T.colors.warningSoft,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
  },
  textSigned: {
    color: T.colors.success,
  },
  textPending: {
    color: T.colors.warning,
  },
  signButton: {
    backgroundColor: T.colors.primary,
    paddingVertical: 9,
    paddingHorizontal: 16,
    borderRadius: 10,
  },
  signButtonText: {
    color: T.colors.textOnBrand,
    fontSize: 12,
    fontWeight: '700',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: T.colors.overlay,
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: T.colors.surface,
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    paddingHorizontal: 24,
    paddingTop: 32,
    paddingBottom: Platform.OS === 'ios' ? 48 : 32,
    borderWidth: 1,
    borderColor: T.colors.border,
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: T.colors.textPrimary,
    marginBottom: 4,
    textAlign: 'center',
  },
  modalDocName: {
    fontSize: 14,
    color: T.colors.textSecondary,
    marginBottom: 28,
    textAlign: 'center',
  },
  formSection: {
    gap: 16,
    marginBottom: 20,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: T.colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  filePicker: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: T.colors.canvas,
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: T.colors.border,
  },
  filePickerEmoji: {
    fontSize: 20,
    marginRight: 12,
  },
  filePickerText: {
    fontSize: 15,
    color: T.colors.textPrimary,
    fontWeight: '600',
    flexShrink: 1,
  },
  passwordInput: {
    backgroundColor: T.colors.canvas,
    borderRadius: 16,
    padding: 16,
    color: T.colors.textPrimary,
    fontSize: 16,
    borderWidth: 1,
    borderColor: T.colors.border,
  },
  securityNotice: {
    backgroundColor: T.colors.warningSoft,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: T.colors.warningBorder,
  },
  securityText: {
    fontSize: 12,
    color: T.colors.warning,
    textAlign: 'center',
    lineHeight: 18,
  },
  confirmSignBtn: {
    backgroundColor: T.colors.primary,
    borderRadius: 16,
    padding: 18,
    alignItems: 'center',
    shadowColor: T.colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  confirmSignBtnText: {
    color: T.colors.textOnBrand,
    fontSize: 16,
    fontWeight: '700',
  },
  btnDisabled: {
    opacity: 0.5,
    backgroundColor: T.colors.border,
  },
  cancelButton: {
    paddingVertical: 16,
    marginTop: 8,
  },
  cancelButtonText: {
    color: T.colors.textMuted,
    textAlign: 'center',
    fontWeight: '600',
    fontSize: 15,
  },
  signingContainer: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  signingText: {
    fontSize: 20,
    fontWeight: '800',
    color: T.colors.textPrimary,
    marginTop: 24,
    marginBottom: 8,
  },
  signingSubtext: {
    fontSize: 14,
    color: T.colors.textMuted,
    textAlign: 'center',
    lineHeight: 20,
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 100,
  },
  emptyEmoji: {
    fontSize: 64,
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: T.colors.textDisabled,
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 15,
    color: T.colors.textMuted,
    textAlign: 'center',
    paddingHorizontal: 40,
    lineHeight: 22,
  },
});

const enhance = withObservables([], () => ({
  documents: database.collections.get<DocumentModel>('documents').query(),
}));

export default enhance(DocumentsScreen);
