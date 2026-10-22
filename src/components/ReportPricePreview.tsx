import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useTranslation } from '@/i18n';
import { LOCALES } from '@/i18n/work';
import { watchReportPrice, type PriceState } from '@/lib/report-price';
import { ECO as E } from '@/theme/ecopro';
import NetInfo from '@react-native-community/netinfo';

export default function ReportPricePreview({ assignmentId, quantity, demo }: { assignmentId: string; quantity: number; demo: boolean }) {
  const { language, t } = useTranslation();
  const [state, setState] = useState<PriceState>({ status: 'empty' }), [retry, setRetry] = useState(0);
  useEffect(() => {
    if (demo) { setState({ status: 'empty' }); return; }
    return watchReportPrice(assignmentId, quantity, setState);
  }, [assignmentId, quantity, demo, retry]);
  useEffect(() => {
    let wasOffline = false;
    return NetInfo.addEventListener(state => {
      const online = state.isConnected === true && state.isInternetReachable !== false;
      if (online && wasOffline) setRetry(v => v + 1);
      wasOffline = !online;
    });
  }, []);
  const money = (value: number, precision: number) => new Intl.NumberFormat(LOCALES[language], {
    minimumFractionDigits: 2, maximumFractionDigits: precision,
  }).format(value);
  const price = !demo && state.status === 'ready' && state.value.assignment_id === assignmentId && state.value.quantity === quantity ? state.value : null;
  return <View style={styles.card} testID="report-contract-price">
    <Text style={styles.title}>{t('price.title')}</Text>
    <View accessibilityLiveRegion="polite">
      {state.status === 'loading' ? <View style={styles.loading}><ActivityIndicator color={E.blue} /><Text style={styles.hint}>{t('price.loading')}</Text></View>
        : price ? <>
          <Text style={styles.hint}>{t(price.basis === 'tender' ? 'price.tender' : 'price.assignment')}</Text>
          <View style={styles.row}><Text style={styles.label}>{t('price.unit')}</Text><Text style={styles.number}>{money(price.unit_price, 6)}{price.currency ? ' ' + price.currency : ''}</Text></View>
          <View style={styles.row}><Text style={styles.label}>{t('price.amount')}</Text><Text style={styles.total}>{money(price.amount, 2)}{price.currency ? ' ' + price.currency : ''}</Text></View>
          {!price.currency && <Text style={styles.hint}>{t('price.noCurrency')}</Text>}
          <Text style={styles.hint}>{t('price.final')}</Text>
        </> : state.status === 'unavailable' ? <>
          <Text style={styles.hint}>{t('price.unavailable')}</Text>
          <TouchableOpacity accessibilityRole="button" onPress={() => setRetry(v => v + 1)} style={styles.retry}><Text style={styles.link}>{t('price.retry')}</Text></TouchableOpacity>
        </> : <Text style={styles.hint}>{t(demo ? 'price.demo' : 'price.enterQuantity')}</Text>}
    </View>
  </View>;
}
const styles = StyleSheet.create({
  card: { borderWidth: 1, borderColor: E.line, backgroundColor: E.surface, borderRadius: 14, padding: 16, gap: 10, marginBottom: 22 },
  title: { color: E.ink, fontSize: 15, fontWeight: '700' }, row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12, paddingVertical: 8, flexWrap: 'wrap' },
  label: { color: E.muted, fontSize: 13 }, number: { color: E.ink, fontSize: 15, fontWeight: '600' }, total: { color: E.blue, fontSize: 18, fontWeight: '700' },
  hint: { color: E.muted, fontSize: 12, lineHeight: 18 }, loading: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  retry: { minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start' }, link: { color: E.blue, fontWeight: '600' },
});
