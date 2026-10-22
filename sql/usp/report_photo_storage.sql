-- Мобилка: хранилище фотографий оперфакта.
-- Выполнить целиком от postgres. Повторное выполнение допустимо.
-- Документы и функции erp/erp_dev не меняются, файлы не удаляются.
-- ВАЖНО: bucket публичный для открытия фото в существующем УСП по прямой ссылке.
-- Содержимое нельзя анонимно перечислять; человек, получивший ссылку на фото, сможет открыть его.
-- Загрузка/перезапись разрешена только привязанному пользователю в его личную папку.
BEGIN;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM storage.buckets WHERE id='report-photos' AND NOT public) THEN
    RAISE EXCEPTION 'report-photos уже существует как приватное хранилище. Его доступ автоматически не меняется.';
  END IF;
END $$;

INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
VALUES ('report-photos','report-photos',true,10485760,ARRAY['image/jpeg'])
ON CONFLICT(id) DO NOTHING;

GRANT USAGE ON SCHEMA storage TO authenticated;
GRANT SELECT,INSERT,UPDATE ON storage.objects TO authenticated;

DROP POLICY IF EXISTS mobile_report_photo_read ON storage.objects;
CREATE POLICY mobile_report_photo_read ON storage.objects FOR SELECT TO authenticated
USING (
 bucket_id='report-photos'
 AND owner_id=(SELECT auth.uid())::text
);

DROP POLICY IF EXISTS mobile_report_photo_insert ON storage.objects;
CREATE POLICY mobile_report_photo_insert ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
 bucket_id='report-photos'
 AND owner_id=(SELECT auth.uid())::text
 AND (name ~ ('^reports/'||(SELECT auth.uid())::text||'/[0-9a-fA-F-]{36}/photo[.]jpg$')
      OR name ~ '^reports/[0-9a-fA-F-]{36}/photo[.]jpg$')
 AND EXISTS(SELECT 1 FROM mobile.my_contractor_ids())
);

DROP POLICY IF EXISTS mobile_report_photo_update ON storage.objects;
CREATE POLICY mobile_report_photo_update ON storage.objects FOR UPDATE TO authenticated
USING (
 bucket_id='report-photos'
 AND owner_id=(SELECT auth.uid())::text
)
WITH CHECK (
 bucket_id='report-photos'
 AND owner_id=(SELECT auth.uid())::text
 AND (name ~ ('^reports/'||(SELECT auth.uid())::text||'/[0-9a-fA-F-]{36}/photo[.]jpg$')
      OR name ~ '^reports/[0-9a-fA-F-]{36}/photo[.]jpg$')
 AND EXISTS(SELECT 1 FROM mobile.my_contractor_ids())
);

COMMIT;
