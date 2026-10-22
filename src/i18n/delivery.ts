import { translate, type Language } from './messages';
import { DeliveryError } from '../lib/sync-delivery';

export function deliveryMessage(error: unknown, language: Language): string | null {
  if (error instanceof DeliveryError) {
    const lines = error.issues.slice(0, 5).map(issue => `${issue.id.slice(0, 8)} · ${translate(language, `delivery.${issue.code}`)}`);
    return [translate(language, 'delivery.remaining', { count: error.issues.length }), ...lines].join('\n');
  }
  if (error instanceof Error && error.message === 'mobile_photo_too_large') return translate(language, 'delivery.photoTooLarge');
  if (error instanceof Error && /^mobile_storage_/.test(error.message)) return translate(language, 'delivery.storage');
  if (error instanceof Error && /^mobile_photo_/.test(error.message)) return translate(language, 'delivery.photo');
  return null;
}
