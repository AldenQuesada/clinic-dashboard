const { Client } = require('pg')
const client = new Client({
  host: 'db.oqboitkpcvuaudouwvkl.supabase.co',
  port: 5432, user: 'postgres', password: 'Rosangela*121776',
  database: 'postgres', ssl: { rejectUnauthorized: false }
})

const WA_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>'
const IG_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2" width="20" height="20" rx="5" ry="5"/><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/><line x1="17.5" y1="6.5" x2="17.51" y2="6.5"/></svg>'
const GLOBE_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>'
const MAP_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>'
const DOC_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>'

const schema = {
  blocks: [
    // 1. Hero Profile com foto full-bleed
    {
      type: 'hero',
      image_url: 'https://drive.google.com/thumbnail?id=1leGw-SZlwbLFB57LyqJig6804Mp7tqSU&sz=w800',
      label: 'Clinica',
      title: 'Mirian de Paula',
      tagline: 'Harmonia que revela. Precisao que dura.',
      subtitle: '',
      description: 'Protocolos integrados de harmonia facial com tecnologia Fotona Dynamis NX para mulheres que ja chegaram.',
      theme: 'dark'
    },
    // 2. Links
    {
      type: 'links',
      label: 'Acesso rapido',
      title: 'Links',
      items: [
        { title: 'Agende sua Avaliacao', subtitle: 'Avaliacao de Harmonia Facial personalizada', url: 'https://wa.me/5544998782003', icon_svg: WA_ICON },
        { title: 'Instagram', subtitle: '@clinicamiriandepaula', url: 'https://instagram.com/clinicamiriandepaula', icon_svg: IG_ICON },
        { title: 'Nosso Site', subtitle: 'Conheca nossos protocolos e diferenciais', url: '#', icon_svg: GLOBE_ICON },
        { title: 'Localizacao', subtitle: 'Como chegar na clinica', url: '#', icon_svg: MAP_ICON },
        { title: 'Protocolo Integrado', subtitle: 'Entenda como Fotona + injetaveis funcionam juntos', url: '#', icon_svg: DOC_ICON },
      ]
    },
    // 3. Divisor
    { type: 'divider' },
    // 4. Antes/Depois carousel
    {
      type: 'before_after',
      label: 'Resultados reais',
      title: 'Antes & Depois',
      slides: [
        { before_url: '', after_url: '', procedure: 'Protocolo Harmonia Facial Completa', detail: 'Fotona Dynamis NX + preenchimento com acido hialuronico. Resultado apos 30 dias.' },
        { before_url: '', after_url: '', procedure: 'Lifting 5D + Smooth Eyes', detail: 'Restauracao de firmeza e tratamento de olheiras. Resultado apos 45 dias.' },
        { before_url: '', after_url: '', procedure: 'Protocolo Sulco Nasogeniano', detail: 'Fotona 4D + preenchimento de precisao. Resultado apos 21 dias.' },
        { before_url: '', after_url: '', procedure: 'Restauracao de Volume Labial', detail: 'Preenchimento natural com acido hialuronico. Resultado imediato.' },
      ]
    },
    // 5. Depoimentos carousel
    {
      type: 'testimonials',
      label: 'Quem ja viveu a experiencia',
      title: 'Depoimentos',
      items: [
        { body: 'As pessoas me perguntam se eu descansei, se viajei. Ninguem percebeu que fiz algo. E exatamente isso que eu queria.', author: 'Renata M.', meta: 'Empresaria, 52 anos', stars: 5 },
        { body: 'Pela primeira vez em anos, olhei no espelho e vi a mulher que eu sinto que sou. Nao mais jovem — mais eu.', author: 'Claudia S.', meta: 'Executiva, 48 anos', stars: 5 },
        { body: 'O protocolo da Dra. Mirian e diferente de tudo que ja fiz. Cada etapa faz sentido, cada resultado se soma ao anterior.', author: 'Marcia L.', meta: 'Medica, 55 anos', stars: 5 },
      ]
    },
    // 6. CTA WhatsApp
    {
      type: 'cta_section',
      label: 'Proximo passo',
      headline: 'Pronta para se reconhecer no espelho?',
      subtitle: 'Avaliacao personalizada com a Dra. Mirian de Paula',
      button_label: 'Conversar no WhatsApp',
      button_url: 'https://wa.me/5544998782003',
      button_style: 'whatsapp'
    },
    // 7. Footer
    {
      type: 'footer',
      clinic_label: 'Clinica',
      clinic_name: 'Mirian de Paula',
      tagline: 'Harmonia que revela. Precisao que dura.',
      social: [
        { label: 'Instagram', url: 'https://instagram.com/clinicamiriandepaula' },
        { label: 'WhatsApp', url: 'https://wa.me/5544998782003' },
      ]
    }
  ]
}

async function main() {
  await client.connect()

  const result = await client.query(
    "UPDATE page_templates SET schema = $1, updated_at = now() WHERE slug = 'instagram' RETURNING id, title",
    [JSON.stringify(schema)]
  )

  if (result.rows.length > 0) {
    console.log('Pagina atualizada:', result.rows[0].title)
    console.log('Blocos:', schema.blocks.length)
    schema.blocks.forEach((b, i) => console.log(' ', (i+1) + '.', b.type, b.title || b.label || b.headline || ''))
  } else {
    console.log('Pagina instagram nao encontrada!')
  }

  await client.end()
}
main().catch(console.error)
