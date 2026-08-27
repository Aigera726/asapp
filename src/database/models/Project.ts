import { Model } from '@nozbe/watermelondb';
import { field, date, readonly } from '@nozbe/watermelondb/decorators';

export default class Project extends Model {
  static table = 'projects';

  @field('object_id') objectId: string | null;
  @field('name') name: string;
  @field('ext_id') extId: string | null;
  @field('is_apartment') isApartment: boolean;
  @field('floors_count') floorsCount: number;
  @field('sections_count') sectionsCount: number;
  @readonly @date('updated_at') updatedAt: Date;
}
