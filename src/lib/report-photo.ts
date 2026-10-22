import { Directory, File, Paths } from 'expo-file-system';
import { Platform } from 'react-native';

export const localReportPhoto = (uri: unknown): uri is string => typeof uri === 'string' && /^(file|content|data|blob):/i.test(uri);

/** Camera cache can disappear on restart: save the original before putting the report in the queue. */
export async function preserveReportPhoto(uri: string | null, reportId: string): Promise<string | null> {
  if (!uri || !localReportPhoto(uri) || uri.startsWith('data:')) return uri;
  if (Platform.OS === 'web') {
    const response = await fetch(uri);
    if (!response.ok) throw new Error('mobile_photo_unavailable');
    const blob = await response.blob();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('mobile_photo_unavailable'));
      reader.onerror = () => reject(new Error('mobile_photo_unavailable'));
      reader.readAsDataURL(blob);
    });
  }
  const folder = new Directory(Paths.document, 'report-photos');
  folder.create({ idempotent: true, intermediates: true });
  const original = new File(uri), saved = new File(folder, reportId + '.jpg');
  if (original.uri !== saved.uri) original.copy(saved);
  return saved.uri;
}

export async function reportPhotoBytes(uri: string): Promise<ArrayBuffer | Uint8Array> {
  if (/^(data|blob):/i.test(uri)) {
    const response = await fetch(uri);
    if (!response.ok) throw new Error('mobile_photo_unavailable');
    return response.arrayBuffer();
  }
  return new File(uri).bytes();
}
