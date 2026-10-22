-- Предварительный расчёт суммы мобильного оперфакта. Выполнить от postgres.
-- Только новая функция чтения в mobile. Договоры, факты, цены и расчёт УСП не меняются.
BEGIN;
CREATE OR REPLACE FUNCTION mobile.preview_report_price(p_assignment_id uuid, p_quantity numeric)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, mobile, erp
AS $$
DECLARE a erp.contract_assignments; c erp.contracts; d erp.est_documents;
  work_qty numeric; basis_amount numeric; result_amount numeric; currency_code text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
  -- The existing view enforces contractor membership, contract approval, object,
  -- active assignment, estimate eligibility and excluded-work restrictions.
  IF NOT EXISTS(SELECT 1 FROM mobile.v_assignments WHERE id=p_assignment_id) THEN
    RAISE EXCEPTION 'Assignment unavailable' USING ERRCODE='42501';
  END IF;
  SELECT * INTO a FROM erp.contract_assignments WHERE id=p_assignment_id;
  IF a.assignment_type IS DISTINCT FROM 'WORK' THEN
    RAISE EXCEPTION 'Work assignment required' USING ERRCODE='22023';
  END IF;
  SELECT * INTO c FROM erp.contracts WHERE id=a.contract_id;
  SELECT doc.* INTO d FROM erp.est_documents doc JOIN erp.est_doc_works w ON w.doc_id=doc.id WHERE w.id=a.est_doc_work_id;
  result_amount := erp.operfact_contract_amount(a.est_doc_work_id,a.id,c.id,p_quantity);
  IF c.tender_amount IS NOT NULL THEN
    SELECT sum(assigned_quantity) INTO work_qty FROM erp.contract_assignments
    WHERE contract_id=c.id AND est_doc_work_id=a.est_doc_work_id
      AND assignment_type='WORK' AND status IS DISTINCT FROM 'CANCELLED';
  ELSE work_qty := a.assigned_quantity;
  END IF;
  basis_amount := erp.operfact_contract_amount(a.est_doc_work_id,a.id,c.id,work_qty);
  SELECT code INTO currency_code FROM erp.dic_currencies WHERE id=coalesce(c.currency_id,d.currency_id);
  RETURN jsonb_build_object('assignment_id',a.id,'quantity',p_quantity,
    'unit_price',basis_amount/work_qty,'amount',result_amount,'currency',currency_code,
    'basis',CASE WHEN c.tender_amount IS NOT NULL THEN 'tender' ELSE 'assignment' END);
END;
$$;
REVOKE ALL ON FUNCTION mobile.preview_report_price(uuid,numeric) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION mobile.preview_report_price(uuid,numeric) TO authenticated;
COMMENT ON FUNCTION mobile.preview_report_price(uuid,numeric) IS 'Read-only authorized mobile preview; final amount uses erp.operfact_contract_amount.';
NOTIFY pgrst, 'reload schema';
COMMIT;
