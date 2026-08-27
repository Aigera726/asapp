import { Model } from '@nozbe/watermelondb';
import { field, date, readonly } from '@nozbe/watermelondb/decorators';

export default class DocumentSignature extends Model {
  static table = 'document_signatures';
  static associations = {
    documents: { type: 'belongs_to', key: 'document_id' },
  } as const;

  @field('document_id') documentId: string;
  @field('signer_id') signerId: string;
  @field('full_name') fullName: string;
  @field('iin') iin: string | null;
  @date('signed_at') signedAt: Date;
  @readonly @date('updated_at') updatedAt: Date;
}
