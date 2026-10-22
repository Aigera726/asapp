/** Acknowledgements belong to the exact business data sent, never the whole local queue. */
export type DeliveryIssue = { table: string; id: string; code: 'assignment' | 'photo' | 'write'; detail?: string };
export type DeliveryReceipt = { table: string; id: string; fingerprint: string };
const LOCAL_FIELDS = new Set(['_status', '_changed', 'sync_status', 'updated_at']);
export function deliveryFingerprint(raw: Record<string, any>): string {
  return JSON.stringify(Object.fromEntries(Object.keys(raw).filter(key => !LOCAL_FIELDS.has(key)).sort().map(key => [key, raw[key]])));
}
export function onlySyncMetadata(raw: Record<string, any>): boolean {
  return raw._status === 'updated' && !!raw._changed && String(raw._changed).split(',').every(key => key === 'sync_status');
}
export function canAcknowledge(raw: Record<string, any>, receipt: DeliveryReceipt): boolean {
  return raw.id === receipt.id && raw._status === 'synced' && raw.sync_status === 'pending_sync'
    && deliveryFingerprint(raw) === receipt.fingerprint;
}
export class DeliveryError extends Error {
  readonly issues: DeliveryIssue[];
  constructor(issues: DeliveryIssue[]) { super('mobile_delivery_incomplete'); this.name = 'DeliveryError'; this.issues = issues; }
}
