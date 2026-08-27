import { Model } from '@nozbe/watermelondb';
import { field, date, readonly } from '@nozbe/watermelondb/decorators';

export default class Contractor extends Model {
  static table = 'contractors';

  @field('company_name') companyName: string;
  @readonly @date('updated_at') updatedAt: Date;
}
