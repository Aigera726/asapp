/**
 * Единый список моделей WatermelonDB.
 *
 * Раньше он дублировался в index.ts (web/LokiJS) и index.native.ts (SQLite):
 * добавленная модель легко попадала только в одну платформу, и приложение
 * падало при обращении к «неизвестной» коллекции.
 */
import Project from './Project';
import EstimateWork from './EstimateWork';
import WorkAssignment from './WorkAssignment';
import Report from './Report';
import Contract from './Contract';
import ConstructionObject from './ConstructionObject';
import WbsItem from './WbsItem';
import Document from './Document';
import Contractor from './Contractor';
import EstimateResource from './EstimateResource';
import PurchaseRequestItem from './PurchaseRequestItem';
import PurchaseRequest from './PurchaseRequest';
import PurchaseOrder from './PurchaseOrder';
import PurchaseOrderItem from './PurchaseOrderItem';
import WarehouseReceipt from './WarehouseReceipt';
import WarehouseReceiptItem from './WarehouseReceiptItem';
import BpmInstance from './BpmInstance';
import BpmTask from './BpmTask';
import DocumentSignature from './DocumentSignature';
import Asset from './Asset';
import AssetMovement from './AssetMovement';
import MaterialMovement from './MaterialMovement';
import Inspection from './Inspection';
import Prescription from './Prescription';
import Deviation from './Deviation';
import WorkReport from './WorkReport';

export const modelClasses = [
  Project,
  EstimateWork,
  WorkAssignment,
  Report,
  Contract,
  ConstructionObject,
  WbsItem,
  Document,
  Contractor,
  EstimateResource,
  PurchaseRequestItem,
  PurchaseRequest,
  PurchaseOrder,
  PurchaseOrderItem,
  WarehouseReceipt,
  WarehouseReceiptItem,
  BpmInstance,
  BpmTask,
  DocumentSignature,
  Asset,
  AssetMovement,
  MaterialMovement,
  Inspection,
  Prescription,
  Deviation,
  WorkReport,
];
