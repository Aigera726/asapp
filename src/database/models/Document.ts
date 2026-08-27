import { Model } from '@nozbe/watermelondb';
import { field, date, readonly } from '@nozbe/watermelondb/decorators';

export default class Document extends Model {
  static table = 'documents';

  @field('contractor_id') contractorId: string;
  @field('project_id') projectId: string | null;
  @field('signer_id') signerId: string | null;
  @field('bpm_instance_id') bpmInstanceId: string | null;
  @field('title') title: string;
  @field('type') type: string;
  @field('number') number: string;
  @field('status') status: 'PENDING' | 'SIGNED';
  @field('workflow_status') workflowStatus: string;
  @field('pdf_url') pdfUrl: string | null;
  @field('signed_url') signedUrl: string | null;
  @readonly @date('updated_at') updatedAt: Date;
}
