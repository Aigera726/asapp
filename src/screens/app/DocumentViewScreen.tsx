import { useTranslation } from '@/i18n';
import { currentText, uiLabel } from "@/i18n/ui-labels";
import { LOCALES } from '@/i18n/work';
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Alert } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { withObservables } from '@nozbe/watermelondb/react';
import { database } from '@/database';
import Document from '@/database/models/Document';
import { SafeAreaView } from 'react-native-safe-area-context';
import { generateUUID } from '@/lib/uuid';
import { useAuthStore } from '@/store/authStore';
import { T } from '@/theme';
import { Icon } from '@/components/Icon';

const enhance = withObservables(['documentId'], ({ documentId }) => ({
  document: database.collections.get<Document>('documents').findAndObserve(documentId),
}));

interface Props {
  document: Document;
}

const DocumentViewScreen = ({ document }: Props) => {
  const { language, t } = useTranslation();
  const navigation = useNavigation();
  const { user, contractorName } = useAuthStore();

  const handleSign = async () => {
    if (!user) {
      Alert.alert(t("common.error"), t("ui.session_expired_sign_in_again"));
      return;
    }

    Alert.alert(
      t("ui.digital_signature"),
      t("ui.confirm_signing_this_document_with_your_digital_signature"),
      [
        { text: t("common.cancel"), style: 'cancel' },
        {
          text: t("ui.sign"),
          onPress: async () => {
            try {
              await database.write(async () => {
                await document.update(d => {
                  d.status = 'SIGNED';
                  d.workflowStatus = 'SIGNED';
                });

                // Раньше подпись сохранялась с заглушками «Тестовый
                // Пользователь» и ИИН 123456789012 — юридически это делало
                // запись о подписи бессмысленной. Пишем фактического
                // подписанта; ИИН заполняет сервис ЭЦП из сертификата.
                await database.collections.get('document_signatures').create((s: any) => {
                  s._raw.id = generateUUID();
                  s.documentId = document.id;
                  s.signerId = user.id;
                  s.fullName =
                    (user.user_metadata?.full_name as string | undefined) ??
                    contractorName ??
                    user.email ??
                    'Не указан';
                  s.iin = null;
                  s.signedAt = new Date();
                });
              });
              Alert.alert(t("ui.success"), t("ui.document_signed_successfully"));
              navigation.goBack();
            } catch (err: any) {
              console.error('[DocumentView] Ошибка подписания:', err);
              Alert.alert(t("common.error"), err?.message ?? t("ui.could_not_sign_the_document"));
            }
          }
        }
      ]
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.backText}>{currentText("ui.back")}</Text>
        </TouchableOpacity>
        <Text style={styles.title}>{currentText("ui.document_0fd26")}</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.docCard}>
          <Text style={styles.docType}>{document.type}</Text>
          <Text style={styles.docNumber}>№ {document.number}</Text>
          <Text style={styles.docTitle}>{document.title}</Text>
          
          <View style={styles.divider} />
          
          <View style={styles.row}>
            <Text style={styles.label}>{currentText("ui.status")}</Text>
            <Text style={styles.value}>{document.status === 'SIGNED' ? t('ui.signed') : document.status === 'PENDING' ? t('ui.awaiting_signature') : uiLabel(document.status, language)}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>{t('ui.approval')}</Text>
            <Text style={styles.value}>{document.workflowStatus === 'SIGNED' ? t('ui.signed') : document.workflowStatus === 'PENDING' ? t('ui.awaiting_signature') : document.workflowStatus || '—'}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>{currentText("ui.date")}</Text>
            <Text style={styles.value}>{document.updatedAt.toLocaleDateString(LOCALES[language])}</Text>
          </View>
        </View>

        <TouchableOpacity style={styles.pdfBtn}>
          <Icon name="file-pdf-box" size={22} color={T.colors.primary} />
          <Text style={styles.pdfText}>{currentText("ui.view_pdf")}</Text>
        </TouchableOpacity>

        {document.status === 'PENDING' && (
          <TouchableOpacity style={styles.signBtn} onPress={handleSign}>
            <Text style={styles.signBtnText}>{currentText("ui.sign_digitally")}</Text>
          </TouchableOpacity>
        )}
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: T.colors.canvas },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20 },
  backText: { color: T.colors.textSecondary, fontSize: 16 },
  title: { fontSize: 20, fontWeight: '900', color: T.colors.textPrimary },
  content: { padding: 20 },
  docCard: { backgroundColor: T.colors.surface, padding: 24, borderRadius: 24, borderWidth: 1, borderColor: T.colors.border, marginBottom: 20 },
  docType: { color: T.colors.primary, fontSize: 12, fontWeight: '900', textTransform: 'uppercase', marginBottom: 8 },
  docNumber: { color: T.colors.textPrimary, fontSize: 24, fontWeight: '900', marginBottom: 8 },
  docTitle: { color: T.colors.textSecondary, fontSize: 16, marginBottom: 24 },
  divider: { height: 1, backgroundColor: T.colors.border, marginBottom: 20 },
  row: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 },
  label: { color: T.colors.textMuted, fontSize: 14 },
  value: { color: T.colors.textPrimary, fontSize: 14, fontWeight: '600' },
  pdfBtn: { backgroundColor: T.colors.surface, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, borderRadius: 16, borderWidth: 1, borderColor: T.colors.border, marginBottom: 24 },
  pdfText: { color: T.colors.primary, fontWeight: '700' },
  signBtn: { backgroundColor: T.colors.primary, paddingVertical: 18, borderRadius: 16, alignItems: 'center', shadowColor: T.colors.primary, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.3, shadowRadius: 12, elevation: 8 },
  signBtnText: { color: T.colors.textOnBrand, fontSize: 16, fontWeight: '900' },
});

export default enhance(DocumentViewScreen as any);
