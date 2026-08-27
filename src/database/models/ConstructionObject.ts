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
export default class ConstructionObject extends Model {
  static table = 'construction_objects';

  @field('name') name: string;
  @field('ext_id') extId: string | null;
  @readonly @date('updated_at') updatedAt: Date;
}
