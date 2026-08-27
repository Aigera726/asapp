import { Model } from '@nozbe/watermelondb';
import { field, date, readonly } from '@nozbe/watermelondb/decorators';

/**
 * ВАЖНО про объявление полей.
 *
 * У декорированного свойства нельзя ставить «?» или «!»: Babel перестаёт
 * считать строку простым объявлением типа и создаёт настоящее поле класса,
 * которое затирает геттер/сеттер декоратора. Любая попытка создать запись
 * падала с «Decorating class property failed» — то есть эта таблица не
 * принималась ни при создании, ни при загрузке с сервера. Тип пишем как
 * `string | null` (strictPropertyInitialization в tsconfig отключён).
 */
export default class Contract extends Model {
  static table = 'contracts';

  @field('project_id') projectId: string;
  @field('contractor_id') contractorId: string | null;
  @field('contract_number') contractNumber: string | null;
  @field('ext_id') extId: string | null;
  @readonly @date('updated_at') updatedAt: Date;
}
