import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { ECO as E, ECO_STATUS as S } from '@/theme/ecopro';
import { formatQty } from '@/lib/domain';
import type { VolumeSummary } from '@/database/workVolume';

/**
 * Составная полоса объёма работы, как est-stack в ERP: подтверждено,
 * на подтверждении и остаток на фоне плана.
 */
export function VolumeBar({ volume, unit, legend = true }: { volume: VolumeSummary; unit?: string; legend?: boolean }) {
  const plan = volume.plan > 0 ? volume.plan : 1;
  const confirmed = Math.min(volume.confirmed / plan, 1);
  const pending = Math.min(volume.pending / plan, 1 - confirmed);
  return (
    <View>
      <View style={styles.track} accessibilityLabel={`Подтверждено ${formatQty(volume.confirmed)}, на подтверждении ${formatQty(volume.pending)}, доступно ${formatQty(volume.limit)} из ${formatQty(volume.plan)}`}>
        {confirmed > 0 && <View style={[styles.part, { flex: confirmed, backgroundColor: S.success }]} />}
        {pending > 0 && <View style={[styles.part, { flex: pending, backgroundColor: E.blue, opacity: 0.45 }]} />}
        <View style={{ flex: Math.max(1 - confirmed - pending, 0) }} />
      </View>
      {legend && (
        <View style={styles.legend}>
          <LegendItem color={S.success} label="Подтверждено" value={volume.confirmed} unit={unit} />
          <LegendItem color={E.blue} faded label="На подтверждении" value={volume.pending} unit={unit} />
          <LegendItem color={S.lineStrong} label="Доступно" value={volume.limit} unit={unit} />
        </View>
      )}
    </View>
  );
}

function LegendItem({ color, faded, label, value, unit }: { color: string; faded?: boolean; label: string; value: number; unit?: string }) {
  return (
    <View style={styles.legendItem}>
      <View style={[styles.dot, { backgroundColor: color, opacity: faded ? 0.45 : 1 }]} />
      <Text style={styles.legendText} numberOfLines={1}>
        {label} <Text style={styles.legendValue}>{formatQty(value)}{unit ? ' ' + unit : ''}</Text>
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  track: { flexDirection: 'row', height: 8, borderRadius: 4, backgroundColor: S.surface2, overflow: 'hidden', gap: 2 },
  part: { height: 8 },
  legend: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 14, rowGap: 6, marginTop: 10 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 7, height: 7, borderRadius: 4 },
  legendText: { fontSize: 11, color: E.muted },
  legendValue: { color: E.ink, fontWeight: '600' },
});
