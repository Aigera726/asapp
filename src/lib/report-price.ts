import { supabase } from '@/lib/supabase';

export type ReportPrice = { assignment_id: string; quantity: number; unit_price: number; amount: number; currency: string | null; basis: 'tender' | 'assignment' };
export type PriceState = { status: 'empty' | 'loading' | 'unavailable'; value?: undefined } | { status: 'ready'; value: ReportPrice };
export async function loadReportPrice(assignmentId: string, quantity: number, signal: AbortSignal): Promise<ReportPrice> {
  const { data, error } = await supabase.schema('mobile').rpc('preview_report_price', { p_assignment_id: assignmentId, p_quantity: quantity }).abortSignal(signal);
  if (error || !data || data.assignment_id !== assignmentId || Number(data.quantity) !== quantity
    || data.amount == null || data.unit_price == null
    || !Number.isFinite(Number(data.amount)) || !Number.isFinite(Number(data.unit_price))
    || Number(data.amount) < 0 || Number(data.unit_price) < 0 || !['tender', 'assignment'].includes(data.basis)
    || (data.currency != null && (typeof data.currency !== 'string' || !/^[A-Z]{3}$/.test(data.currency)))) {
    throw new Error('mobile_price_unavailable');
  }
  return { ...data, quantity: Number(data.quantity), amount: Number(data.amount), unit_price: Number(data.unit_price) };
}

/** Debounce typing, abort stale requests, and never show an older quantity's amount. */
export function watchReportPrice(assignmentId: string, quantity: number, onChange: (state: PriceState) => void,
  load: typeof loadReportPrice = loadReportPrice) {
  let disposed = false;
  const controller = new AbortController();
  let timeout: ReturnType<typeof setTimeout> | undefined;
  if (!Number.isFinite(quantity) || quantity <= 0) { onChange({ status: 'empty' }); return () => {}; }
  onChange({ status: 'loading' });
  const timer = setTimeout(() => {
    timeout = setTimeout(() => { if (!disposed) { controller.abort(); onChange({ status: 'unavailable' }); } }, 10000);
    void load(assignmentId, quantity, controller.signal).then(value => {
      if (!disposed && !controller.signal.aborted) onChange({ status: 'ready', value });
    }).catch(() => { if (!disposed && !controller.signal.aborted) onChange({ status: 'unavailable' }); })
      .finally(() => { if (timeout !== undefined) clearTimeout(timeout); });
  }, 350);
  return () => { disposed = true; controller.abort(); clearTimeout(timer); if (timeout !== undefined) clearTimeout(timeout); };
}
