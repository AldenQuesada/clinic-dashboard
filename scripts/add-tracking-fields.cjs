const { Client } = require('pg')
const client = new Client({
  host: 'db.oqboitkpcvuaudouwvkl.supabase.co',
  port: 5432, user: 'postgres', password: 'Rosangela*121776',
  database: 'postgres', ssl: { rejectUnauthorized: false }
})

async function main() {
  await client.connect()

  // 1. Adicionar campos de tracking na tabela de campanhas
  console.log('1. Adicionando campos link_opened_at e page_landed_at...')
  await client.query(`
    ALTER TABLE wa_birthday_campaigns
    ADD COLUMN IF NOT EXISTS link_opened_at timestamptz,
    ADD COLUMN IF NOT EXISTS page_landed_at timestamptz
  `)
  console.log('   ✓ Campos adicionados')

  // 2. Criar RPC pra marcar abertura do link (chamada pelo r.html)
  console.log('\n2. Criando RPC wa_birthday_track_link_open...')
  await client.query(`
    CREATE OR REPLACE FUNCTION wa_birthday_track_link_open(p_code text)
    RETURNS jsonb
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = public
    AS $fn$
    DECLARE
      v_url text;
      v_lead_phone text;
      v_campaign_id uuid;
    BEGIN
      -- Resolver short link e incrementar clicks
      UPDATE short_links SET clicks = clicks + 1
      WHERE code = p_code
      RETURNING url INTO v_url;

      IF v_url IS NULL THEN
        RETURN jsonb_build_object('ok', false, 'error', 'link not found');
      END IF;

      -- Se é link de aniversario, marcar abertura na campanha mais recente responded
      -- Buscar pelo referrer ou pelo contexto (o lead que respondeu mais recentemente)
      IF p_code = 'niver' OR v_url LIKE '%aniversario%' THEN
        SELECT id INTO v_campaign_id
        FROM wa_birthday_campaigns
        WHERE status = 'responded'
          AND link_opened_at IS NULL
        ORDER BY responded_at DESC
        LIMIT 1;

        IF v_campaign_id IS NOT NULL THEN
          UPDATE wa_birthday_campaigns
          SET link_opened_at = now()
          WHERE id = v_campaign_id;
        END IF;
      END IF;

      RETURN jsonb_build_object('ok', true, 'url', v_url, 'tracked', v_campaign_id IS NOT NULL);
    END;
    $fn$
  `)
  await client.query('GRANT EXECUTE ON FUNCTION wa_birthday_track_link_open(text) TO anon, authenticated')
  console.log('   ✓ RPC criada')

  // 3. Criar RPC pra marcar que chegou na pagina (chamada pelo aniversario.html)
  console.log('\n3. Criando RPC wa_birthday_track_page_land...')
  await client.query(`
    CREATE OR REPLACE FUNCTION wa_birthday_track_page_land(p_phone text DEFAULT NULL)
    RETURNS jsonb
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = public
    AS $fn$
    DECLARE
      v_campaign_id uuid;
    BEGIN
      -- Marcar a campanha responded mais recente que ja abriu link mas nao chegou na pagina
      IF p_phone IS NOT NULL AND p_phone != '' THEN
        SELECT id INTO v_campaign_id
        FROM wa_birthday_campaigns
        WHERE lead_phone LIKE '%' || right(p_phone, 11)
          AND status = 'responded'
          AND page_landed_at IS NULL
        ORDER BY responded_at DESC
        LIMIT 1;
      ELSE
        SELECT id INTO v_campaign_id
        FROM wa_birthday_campaigns
        WHERE status = 'responded'
          AND link_opened_at IS NOT NULL
          AND page_landed_at IS NULL
        ORDER BY link_opened_at DESC
        LIMIT 1;
      END IF;

      IF v_campaign_id IS NOT NULL THEN
        UPDATE wa_birthday_campaigns
        SET page_landed_at = now()
        WHERE id = v_campaign_id;
        RETURN jsonb_build_object('ok', true, 'tracked', true);
      END IF;

      RETURN jsonb_build_object('ok', true, 'tracked', false);
    END;
    $fn$
  `)
  await client.query('GRANT EXECUTE ON FUNCTION wa_birthday_track_page_land(text) TO anon, authenticated')
  console.log('   ✓ RPC criada')

  await client.end()
  console.log('\n✓ PRONTO — campos e RPCs criados')
}
main().catch(console.error)
