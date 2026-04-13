-- Seed: Template Uso de Imagem
SELECT public.legal_doc_upsert_template(
  p_name := 'Termo de Autorizacao de Uso de Imagem, Voz e Depoimento',
  p_doc_type := 'uso_imagem',
  p_slug := 'uso-imagem-premium',
  p_content := '<h2 style="text-align:center">TERMO DE AUTORIZACAO DE USO DE IMAGEM, VOZ E DEPOIMENTO</h2>

<p>Pelo presente instrumento particular, de um lado:</p>

<p><strong>CLINICA MIRIAN DE PAULA BEAUTY &amp; HEALTH</strong>, com sede na {{endereco_clinica}}, inscrita no CNPJ n {{cnpj}}, doravante denominada simplesmente CLINICA;</p>

<p>E, de outro lado:</p>

<p><strong>AUTORIZANTE:</strong> {{nome}}<br>
<strong>CPF:</strong> {{cpf}}<br>
<strong>DATA DE NASCIMENTO:</strong> {{data_nascimento}}<br>
<strong>ENDERECO:</strong> {{endereco_paciente}}</p>

<p>doravante denominado(a) AUTORIZANTE, tem entre si justo e acordado o que segue:</p>

<h3>CLAUSULA 1 - DO OBJETO</h3>
<p>O presente instrumento tem por objeto a autorizacao livre, expressa, informada e inequivoca do uso da imagem, voz, nome e depoimentos do AUTORIZANTE, captados por meio de fotografias, videos, audios ou quaisquer outros registros realizados nas dependencias da CLINICA.</p>

<h3>CLAUSULA 2 - DA FINALIDADE E ABRANGENCIA</h3>
<p>O AUTORIZANTE autoriza a utilizacao do material para fins institucionais, educacionais e comerciais da CLINICA, incluindo, mas nao se limitando a:</p>
<ol type="a">
<li>Publicacoes em redes sociais (Instagram, Facebook, TikTok, YouTube, WhatsApp e similares);</li>
<li>Campanhas publicitarias e anuncios pagos (trafego digital);</li>
<li>Websites, landing pages e materiais digitais;</li>
<li>Materiais impressos, apresentacoes, eventos, palestras e treinamentos;</li>
<li>Conteudos educativos, promocionais e institucionais;</li>
</ol>
<p>A presente autorizacao e valida para uso em territorio nacional e internacional, em qualquer meio de comunicacao existente ou que venha a ser criado.</p>

<h3>CLAUSULA 3 - DA CESSAO DE DIREITOS</h3>
<p>O AUTORIZANTE cede a CLINICA, de forma gratuita, total, definitiva, irrevogavel e irretratavel, os direitos de uso de sua imagem, voz, nome e depoimento, nao havendo limitacao quanto ao numero de utilizacoes, reproducoes, edicoes ou veiculacoes.</p>

<h3>CLAUSULA 4 - DA GRATUIDADE</h3>
<p>A presente autorizacao e concedida de forma totalmente gratuita, nao sendo devida qualquer remuneracao, compensacao financeira ou indenizacao, presente ou futura.</p>

<h3>CLAUSULA 5 - DO TRATAMENTO E EDICAO DE IMAGEM</h3>
<p>O AUTORIZANTE declara estar ciente e de acordo que os materiais poderao ser:</p>
<ul>
<li>Editados e tratados digitalmente</li>
<li>Ajustados (cor, iluminacao, textura e enquadramento)</li>
<li>Utilizados em comparativos (antes e depois)</li>
<li>Inseridos em composicoes visuais e publicitarias</li>
</ul>
<p>sempre respeitando sua integridade, identidade e dignidade.</p>

<h3>CLAUSULA 6 - DA PROTECAO DE DADOS</h3>
<p>Nos termos da Lei Geral de Protecao de Dados Pessoais, o AUTORIZANTE declara:</p>
<ul>
<li>Estar ciente da coleta e tratamento de seus dados pessoais (imagem, voz e nome);</li>
<li>Autorizar sua utilizacao para as finalidades descritas neste termo;</li>
<li>Que seus dados serao tratados de forma segura, etica e dentro da legalidade.</li>
</ul>

<h3>CLAUSULA 7 - DO RESPEITO A IMAGEM</h3>
<p>A CLINICA compromete-se a utilizar o material de forma etica, respeitosa e profissional, nao vinculando o AUTORIZANTE a conteudos que possam prejudicar sua honra, reputacao ou dignidade.</p>

<h3>CLAUSULA 8 - DA IRREVOGABILIDADE E REVOGACAO PARCIAL</h3>
<p>A presente autorizacao e concedida em carater irrevogavel e irretratavel.</p>
<p>Entretanto, por liberalidade, a CLINICA podera, mediante solicitacao formal do AUTORIZANTE, avaliar a interrupcao de novas utilizacoes futuras, sem obrigacao de retirada de conteudos ja publicados ou veiculados anteriormente.</p>

<h3>CLAUSULA 9 - DA AUSENCIA DE VINCULO</h3>
<p>O presente termo nao estabelece qualquer vinculo empregaticio, societario ou comercial entre as partes.</p>

<h3>CLAUSULA 10 - DO FORO</h3>
<p>Fica eleito o foro da Comarca de Maringa/PR para dirimir quaisquer duvidas ou controversias oriundas deste instrumento.</p>

<h3>DECLARACAO FINAL</h3>
<p>O AUTORIZANTE declara que leu, compreendeu e concorda integralmente com os termos deste documento, assinando-o de forma livre e consciente.</p>

<p style="text-align:center">Maringa/PR, {{data_extenso}}</p>

<p style="text-align:center"><br>________________________________________<br><strong>{{nome}}</strong><br>AUTORIZANTE</p>

<p style="text-align:center"><br>________________________________________<br><strong>CLINICA MIRIAN DE PAULA BEAUTY &amp; HEALTH</strong><br>Alden J. Quesada - Representante Legal</p>',
  p_trigger_status := 'na_clinica',
  p_is_active := true
);
