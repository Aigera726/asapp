import React, { useEffect } from 'react';
import { Modal, View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { combineLatest } from 'rxjs';
import { Q } from '@nozbe/watermelondb';
import { database } from '@/database';
import type ContractAddendum from '@/database/models/ContractAddendum';
import type WorkReport from '@/database/models/WorkReport';
import type EstimateWork from '@/database/models/EstimateWork';
import { buildNotices, approvedToShow } from '@/lib/notices';
import { useNoticeStore } from '@/store/noticeStore';
import { useTranslation } from '@/i18n';
import { changeLine } from '@/i18n/notices';
import { Icon } from './Icon';
import { T } from '@/theme';
import { ECO as E } from '@/theme/ecopro';

/**
 * Следит за локальной базой (ДС и решения по объёмам) и обновляет уведомления;
 * показывает разовое окно «ДС согласовано — изменились объёмы» по каждому новому согласованному ДС.
 * Подключается один раз — рядом с нижними вкладками.
 */
export function NoticeCenter() {
  const { t, language } = useTranslation();
  const setNotices = useNoticeStore(s => s.setNotices);
  const notices = useNoticeStore(s => s.notices), shown = useNoticeStore(s => s.shown), loaded = useNoticeStore(s => s.loaded);
  const markShown = useNoticeStore(s => s.markShown);

  useEffect(() => {
    const sub = combineLatest([
      database.get<ContractAddendum>('contract_addenda').query().observe(),
      database.get<WorkReport>('work_reports').query().observe(),
    ]).subscribe(async ([addenda, reports]) => {
      const ids = [...new Set(reports.map(r => r.estimateWorkId).filter(Boolean) as string[])];
      const works = ids.length ? await database.get<EstimateWork>('estimate_works').query(Q.where('id', Q.oneOf(ids))).fetch() : [];
      const names = new Map(works.map(w => [w.id, w.name]));
      await setNotices(buildNotices(addenda.map(a => ({ id: a.id, status: a.status, number: a.number, contractNumber: a.contractNumber,
        projectName: a.projectName, objectName: a.objectName, submittedAt: a.submittedAt, decidedAt: a.decidedAt,
        decisionComment: a.decisionComment, changes: a.changes })), reports, names));
    });
    return () => sub.unsubscribe();
  }, [setNotices]);

  const next = loaded ? approvedToShow(notices, shown)[0] : undefined;
  if (!next) return null;
  const place = [next.projectName, next.objectName].filter(Boolean).join(' · ');
  return (
    <Modal transparent animationType="fade" visible onRequestClose={() => markShown(next.addendumId)}>
      <View style={styles.backdrop}>
        <View style={styles.card} accessibilityRole="alert">
          <View style={styles.head}>
            <View style={styles.icon}><Icon name="file-check-outline" size={22} color={E.blue} /></View>
            <Text style={styles.title}>{t('notice.adApproved', { n: String(next.number), contract: next.contractNumber || '—' })}</Text>
          </View>
          {place ? <Text style={styles.place}>{place}</Text> : null}
          {next.changes.length > 0 && <>
            <Text style={styles.label}>{t('notice.modalChanges')}</Text>
            <ScrollView style={styles.list}>
              {next.changes.map((c, i) => <Text key={i} style={styles.line}>• {changeLine(c, language)}</Text>)}
            </ScrollView>
          </>}
          <Text style={styles.footer}>{t('notice.modalFooter')}</Text>
          <TouchableOpacity accessibilityRole="button" style={styles.ok} onPress={() => markShown(next.addendumId)} activeOpacity={0.85}>
            <Text style={styles.okText}>{t('notice.modalOk')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(15,23,42,0.45)', alignItems: 'center', justifyContent: 'center', padding: 20 },
  card: { width: '100%', maxWidth: 460, maxHeight: '80%', backgroundColor: E.surface, borderRadius: 16, padding: 20, borderWidth: 1, borderColor: E.line },
  head: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  icon: { width: 40, height: 40, borderRadius: 12, backgroundColor: '#E7EDFC', alignItems: 'center', justifyContent: 'center' },
  title: { flex: 1, fontSize: 17, fontWeight: '700', color: T.colors.textPrimary },
  place: { marginTop: 8, color: E.muted, fontSize: 14 },
  label: { marginTop: 16, fontSize: 12, fontWeight: '700', letterSpacing: 0.6, color: E.muted, textTransform: 'uppercase' },
  list: { marginTop: 8, maxHeight: 260 },
  line: { fontSize: 15, color: T.colors.textPrimary, lineHeight: 22, marginBottom: 4 },
  footer: { marginTop: 14, fontSize: 13, color: E.muted },
  ok: { marginTop: 18, backgroundColor: E.blue, borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  okText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
});
