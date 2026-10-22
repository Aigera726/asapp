import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

/** Both camera and gallery go through JPEG conversion before the existing durable photo/outbox flow. */
export async function prepareReportImage(asset: { uri: string; width: number; height: number }): Promise<string> {
  if (!asset.uri || !Number.isFinite(asset.width) || !Number.isFinite(asset.height) || asset.width <= 0 || asset.height <= 0) {
    throw new Error('mobile_photo_unavailable');
  }
  const context = ImageManipulator.manipulate(asset.uri);
  try {
    if (Math.max(asset.width, asset.height) > 2048) context.resize(asset.width >= asset.height ? { width: 2048 } : { height: 2048 });
    const image = await context.renderAsync();
    try { return (await image.saveAsync({ format: SaveFormat.JPEG, compress: 0.8 })).uri; }
    finally { image.release(); }
  } finally { context.release(); }
}
