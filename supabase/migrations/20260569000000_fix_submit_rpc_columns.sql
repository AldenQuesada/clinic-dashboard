-- Fix: submit_quiz_response usava nome/telefone mas tabela usa name/phone
DROP FUNCTION IF EXISTS submit_quiz_response(uuid,uuid,jsonb,int,text,text,text,text,text,text,text,text,jsonb);
DROP FUNCTION IF EXISTS submit_quiz_response(uuid,uuid,jsonb,int,text,text,text,text,text,text,text,text);

CREATE OR REPLACE FUNCTION submit_quiz_response(
  p_quiz_id            uuid,
  p_clinic_id          uuid,
  p_answers            jsonb,
  p_score              int,
  p_temperature        text,
  p_contact_name       text,
  p_contact_phone      text,
  p_contact_email      text,
  p_utm_source         text,
  p_utm_medium         text,
  p_utm_campaign       text,
  p_kanban_target      text,
  p_queixas_faciais    jsonb DEFAULT '[]'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_response_id uuid;
  v_lead_id     uuid;
BEGIN
  INSERT INTO quiz_responses (
    quiz_id, clinic_id, answers, score, temperature,
    contact_name, contact_phone, contact_email,
    utm_source, utm_medium, utm_campaign,
    queixas_faciais
  ) VALUES (
    p_quiz_id, p_clinic_id, p_answers, p_score, p_temperature,
    p_contact_name, p_contact_phone, p_contact_email,
    p_utm_source, p_utm_medium, p_utm_campaign,
    p_queixas_faciais
  )
  RETURNING id INTO v_response_id;

  IF p_contact_phone IS NOT NULL AND trim(p_contact_phone) <> '' THEN
    INSERT INTO leads (
      name, phone, email,
      clinic_id, temperature, phase,
      queixas_faciais
    ) VALUES (
      p_contact_name,
      p_contact_phone,
      NULLIF(trim(p_contact_email), ''),
      p_clinic_id,
      p_temperature,
      'captacao',
      p_queixas_faciais
    )
    ON CONFLICT DO NOTHING
    RETURNING id INTO v_lead_id;

    IF v_lead_id IS NULL THEN
      UPDATE leads
      SET queixas_faciais = p_queixas_faciais,
          updated_at = now()
      WHERE phone = p_contact_phone
        AND clinic_id = p_clinic_id
      RETURNING id INTO v_lead_id;
    END IF;

    IF v_lead_id IS NOT NULL THEN
      UPDATE quiz_responses
      SET lead_id = v_lead_id
      WHERE id = v_response_id;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'quiz_response_id', v_response_id,
    'lead_id',          v_lead_id
  );
END;
$$;
