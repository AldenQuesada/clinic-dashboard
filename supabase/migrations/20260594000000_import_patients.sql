-- Import 328 patients from clinic CSV
INSERT INTO leads (id, clinic_id, name, phone, email, status, phase, temperature, source_type, lead_score, is_active, birth_date, idade, data, wa_opt_in, created_at, updated_at)
VALUES (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'Andressa Sgóbero', '5544999840098', '', 'active', 'paciente', 'warm', 'import', 0, true, NULL, NULL, '{"sexo":"Feminino","tags_clinica":"Veu de Noiva + Anovator"}'::jsonb, true, now(), now())
ON CONFLICT DO NOTHING;
INSERT INTO leads (id, clinic_id, name, phone, email, status, phase, temperature, source_type, lead_score, is_active, birth_date, idade, data, wa_opt_in, created_at, updated_at)
VALUES (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'Erick', '5544991727833', '', 'active', 'paciente', 'warm', 'import', 0, true, NULL, NULL, '{"sexo":"Masculino"}'::jsonb, true, now(), now())
ON CONFLICT DO NOTHING;
INSERT INTO leads (id, clinic_id, name, phone, email, status, phase, temperature, source_type, lead_score, is_active, birth_date, idade, data, wa_opt_in, created_at, updated_at)
VALUES (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'Felipe Gazoli', '5544999194090', 'felipegazoli3@gmail.com', 'active', 'paciente', 'warm', 'import', 0, true, '1992-01-08', 34, '{"sexo":"Masculino","estado_civil":"Solteiro","profissao":"Programador","endereco":"Rua Pioneiro Mário Marangoni, 289, Jardim Universo, Maringá/PR, 87060-410","cpf":"075.987.139-60"}'::jsonb, true, now(), now())
ON CONFLICT DO NOTHING;
INSERT INTO leads (id, clinic_id, name, phone, email, status, phase, temperature, source_type, lead_score, is_active, birth_date, idade, data, wa_opt_in, created_at, updated_at)
VALUES (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'Nayara Moreno', '5544984039285', '', 'active', 'paciente', 'warm', 'import', 0, true, NULL, NULL, '{"sexo":"Feminino"}'::jsonb, true, now(), now())
ON CONFLICT DO NOTHING;
INSERT INTO leads (id, clinic_id, name, phone, email, status, phase, temperature, source_type, lead_score, is_active, birth_date, idade, data, wa_opt_in, created_at, updated_at)
VALUES (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'Simone Franzoi', '5544991545018', '', 'active', 'paciente', 'warm', 'import', 0, true, '1972-12-12', 53, '{"sexo":"Feminino","estado_civil":"Divorciado","profissao":"Administradora","endereco":"Rua Doutor Saulo Porto Virmond, 973, AP 1607, Chácara Paulista, Maringá/PR, 87005-090","cpf":"884.297.689-04"}'::jsonb, true, now(), now())
ON CONFLICT DO NOTHING;
INSERT INTO leads (id, clinic_id, name, phone, email, status, phase, temperature, source_type, lead_score, is_active, birth_date, idade, data, wa_opt_in, created_at, updated_at)
VALUES (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'Tamires Campos', '5544999516796', 'tamiresnutrimga@gmail.com', 'active', 'paciente', 'warm', 'import', 0, true, '1993-01-30', 33, '{"sexo":"Feminino","estado_civil":"Casado","endereco":"Rua Evaldo Braga, 1149, Conjunto Residencial Cidade Alta, Maringá/PR, 87053-220","cpf":"087.981.309-19"}'::jsonb, true, now(), now())
ON CONFLICT DO NOTHING;
INSERT INTO leads (id, clinic_id, name, phone, email, status, phase, temperature, source_type, lead_score, is_active, birth_date, idade, data, wa_opt_in, created_at, updated_at)
VALUES (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'Adilso Augustinho Carniel', '5544999160607', '', 'active', 'paciente', 'warm', 'import', 0, true, '1966-05-05', 59, '{"sexo":"Masculino","estado_civil":"Casado","profissao":"Empresário","endereco":"Rua Pioneiro Domingos Salgueiro, 2007, Jardim Guaporé, Maringá/PR, 87060-230","cpf":"554.420.809-34"}'::jsonb, true, now(), now())
ON CONFLICT DO NOTHING;
INSERT INTO leads (id, clinic_id, name, phone, email, status, phase, temperature, source_type, lead_score, is_active, birth_date, idade, data, wa_opt_in, created_at, updated_at)
VALUES (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'Adriana Bueno Bianco', '5544998261112', '', 'active', 'paciente', 'warm', 'import', 0, true, '1984-11-03', 41, '{"cpf":"054.225.049-76"}'::jsonb, true, now(), now())
ON CONFLICT DO NOTHING;
INSERT INTO leads (id, clinic_id, name, phone, email, status, phase, temperature, source_type, lead_score, is_active, birth_date, idade, data, wa_opt_in, created_at, updated_at)
VALUES (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'Adriana F. Lamoglia', '5544999182772', 'adrianaflamoglia@gmail.com', 'active', 'paciente', 'warm', 'import', 0, true, '1974-01-26', 52, '{"sexo":"Feminino","estado_civil":"Casado","profissao":"Consultora de Imagem","endereco":"Rua das Primaveras, 1161, Casa B, Conjunto Habitacional Inocente Vila Nova Júnior, Maringá/PR, 87060-050","cpf":"926.359.549-68","origem":"Instagram"}'::jsonb, true, now(), now())
ON CONFLICT DO NOTHING;
INSERT INTO leads (id, clinic_id, name, phone, email, status, phase, temperature, source_type, lead_score, is_active, birth_date, idade, data, wa_opt_in, created_at, updated_at)
VALUES (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'Adriane Morandin', '5549991121285', 'adrianeamo2005@hotmail.com', 'active', 'paciente', 'warm', 'import', 0, true, '1983-08-02', 42, '{"sexo":"Feminino","estado_civil":"Casado","profissao":"Do lar","endereco":"Rua Estácio de Sá, 1132, 892, Zona 02, Maringá/PR, 87010-360","cpf":"035.529.989-50","origem":"Instagram"}'::jsonb, true, now(), now())
ON CONFLICT DO NOTHING;
INSERT INTO leads (id, clinic_id, name, phone, email, status, phase, temperature, source_type, lead_score, is_active, birth_date, idade, data, wa_opt_in, created_at, updated_at)
VALUES (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'Adriele Tolentino Simioni', '5544999169662', 'adrieletolentino@gmail.com', 'active', 'paciente', 'warm', 'import', 0, true, '1987-03-25', 39, '{"sexo":"Feminino","estado_civil":"Casado","profissao":"Empresária","endereco":"Rua Paulo Jorge Carolino, 1059, Jardim Paris, Maringá/PR, 87083-370","cpf":"056.919.269-26"}'::jsonb, true, now(), now())
ON CONFLICT DO NOTHING;
INSERT INTO leads (id, clinic_id, name, phone, email, status, phase, temperature, source_type, lead_score, is_active, birth_date, idade, data, wa_opt_in, created_at, updated_at)
VALUES (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'Alana Mendonça', '5544998688893', 'alanafmendonca.adv@gmail.com', 'active', 'paciente', 'warm', 'import', 0, true, '1999-01-09', 27, '{"sexo":"Feminino","estado_civil":"Casado","profissao":"Advogada","endereco":"Rua Rocha Loures, 1217, Centro Sul, Mandaguaçu/PR, 87160-270","cpf":"107.727.439-40","origem":"Indicação"}'::jsonb, true, now(), now())
ON CONFLICT DO NOTHING;
INSERT INTO leads (id, clinic_id, name, phone, email, status, phase, temperature, source_type, lead_score, is_active, birth_date, idade, data, wa_opt_in, created_at, updated_at)
VALUES (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'Alden Julio', '5544998787673', '', 'active', 'paciente', 'warm', 'import', 0, true, '1968-04-03', 58, '{"sexo":"Masculino","estado_civil":"Casado","profissao":"Médico","endereco":"Avenida Carneiro Leão, 294, Zona Armazém, Maringá/PR, 87014-010","cpf":"242.171.148-77"}'::jsonb, true, now(), now())
ON CONFLICT DO NOTHING;
INSERT INTO leads (id, clinic_id, name, phone, email, status, phase, temperature, source_type, lead_score, is_active, birth_date, idade, data, wa_opt_in, created_at, updated_at)
VALUES (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'Alessandra Zanin Bergamo', '5544999610173', '', 'active', 'paciente', 'warm', 'import', 0, true, '1985-11-21', 40, '{"sexo":"Feminino","estado_civil":"Casado","profissao":"Cirurgiã Dentista","endereco":"Rua Arthur Thomas, 596, Zona 01, Maringá/PR, 87013-250","cpf":"048.512.739-32"}'::jsonb, true, now(), now())
ON CONFLICT DO NOTHING;
INSERT INTO leads (id, clinic_id, name, phone, email, status, phase, temperature, source_type, lead_score, is_active, birth_date, idade, data, wa_opt_in, created_at, updated_at)
VALUES (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'Alicia Ribeiro Queiroz', '5544998653859', 'alicia_quee@outlook.com', 'active', 'paciente', 'warm', 'import', 0, true, '1998-08-21', 27, '{"sexo":"Feminino","estado_civil":"Solteiro","profissao":"Dentista","endereco":"Rua São Cristóvão, 1365, Zona 08, Maringá/PR, 87050-490","cpf":"061.437.721-85","origem":"Osvaldo Jr."}'::jsonb, true, now(), now())
ON CONFLICT DO NOTHING;
INSERT INTO leads (id, clinic_id, name, phone, email, status, phase, temperature, source_type, lead_score, is_active, birth_date, idade, data, wa_opt_in, created_at, updated_at)
VALUES (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'Aline Dumas', '5561983638599', '', 'active', 'paciente', 'warm', 'import', 0, true, '1983-05-08', 42, '{"sexo":"Feminino","estado_civil":"Casado","profissao":"Nutricionista","endereco":"Avenida Guedner - até 1935/1936, 787, apto 1301, Zona 08, Maringá/PR, 87050-390","cpf":"045.194.539-50"}'::jsonb, true, now(), now())
ON CONFLICT DO NOTHING;
INSERT INTO leads (id, clinic_id, name, phone, email, status, phase, temperature, source_type, lead_score, is_active, birth_date, idade, data, wa_opt_in, created_at, updated_at)
VALUES (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'Aline Lima', '5553984780957', 'alinelimallc@gmail.com', 'active', 'paciente', 'warm', 'import', 0, true, '1986-08-05', 39, '{"sexo":"Feminino","estado_civil":"Solteiro","profissao":"Coordenadora","endereco":"Rua Pioneira Victalina Delfante Castanha, 641, Jardim Itália, Maringá/PR, 87060-666","cpf":"008.890.770-88","origem":"Instagram"}'::jsonb, true, now(), now())
ON CONFLICT DO NOTHING;
INSERT INTO leads (id, clinic_id, name, phone, email, status, phase, temperature, source_type, lead_score, is_active, birth_date, idade, data, wa_opt_in, created_at, updated_at)
VALUES (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'Aline Raquel Souza Dutra', '5544991449911', 'alineraquelsd@gmail.com', 'active', 'paciente', 'warm', 'import', 0, true, '1983-06-23', 42, '{"sexo":"Feminino","estado_civil":"Casado","profissao":"Médica","endereco":"Avenida Laguna, 733, Ap 1402, Zona 03, Maringá/PR, 87050-260","cpf":"038.549.929-98","origem":"Josi Cantarutti"}'::jsonb, true, now(), now())
ON CONFLICT DO NOTHING;
INSERT INTO leads (id, clinic_id, name, phone, email, status, phase, temperature, source_type, lead_score, is_active, birth_date, idade, data, wa_opt_in, created_at, updated_at)
VALUES (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'Aline Tavares', '5544999873947', 'tavaresaline@hotmail.com', 'active', 'paciente', 'warm', 'import', 0, true, '1979-09-07', 46, '{"sexo":"Feminino","estado_civil":"Casado","profissao":"Dentista","endereco":"Rua Estácio de Sá, 1082, apto 102, Vila Bosque, Maringá/PR, 87005-020","cpf":"026.982.059-03"}'::jsonb, true, now(), now())
ON CONFLICT DO NOTHING;
INSERT INTO leads (id, clinic_id, name, phone, email, status, phase, temperature, source_type, lead_score, is_active, birth_date, idade, data, wa_opt_in, created_at, updated_at)
VALUES (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'Allan Marino', '5544998399442', '', 'active', 'paciente', 'warm', 'import', 0, true, '1988-12-23', 37, '{"sexo":"Masculino","estado_civil":"Casado","profissao":"Corretor de Imóveis","endereco":"Rua Pioneiro Carlos João Basso, 153, Jardim Itália II, Maringá/PR, 87060-656","cpf":"023.363.201-85"}'::jsonb, true, now(), now())
ON CONFLICT DO NOTHING;
INSERT INTO leads (id, clinic_id, name, phone, email, status, phase, temperature, source_type, lead_score, is_active, birth_date, idade, data, wa_opt_in, created_at, updated_at)
VALUES (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'Amanda Francisco Senhorinho', '5544998793829', 'amandafrancisco27@outlook.com', 'active', 'paciente', 'warm', 'import', 0, true, '1994-07-27', 31, '{"sexo":"Feminino","estado_civil":"Casado","profissao":"Empresária","cpf":"050.533.051-29","origem":"dra mirian"}'::jsonb, true, now(), now())
ON CONFLICT DO NOTHING;
INSERT INTO leads (id, clinic_id, name, phone, email, status, phase, temperature, source_type, lead_score, is_active, birth_date, idade, data, wa_opt_in, created_at, updated_at)
VALUES (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'Amanda Poppi Bravo', '5544999076363', '', 'active', 'paciente', 'warm', 'import', 0, true, '2000-09-07', 25, '{"sexo":"Feminino","estado_civil":"Solteiro","profissao":"Empresária","endereco":"Avenida Cerro Azul 2649, 2649, Casa 12, Jardim Novo Horizonte, Maringá/PR, 87010-910","cpf":"091.495.479-25"}'::jsonb, true, now(), now())
ON CONFLICT DO NOTHING;
INSERT INTO leads (id, clinic_id, name, phone, email, status, phase, temperature, source_type, lead_score, is_active, birth_date, idade, data, wa_opt_in, created_at, updated_at)
VALUES (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'Amanda Priori', '5544997329255', '', 'active', 'paciente', 'warm', 'import', 0, true, NULL, NULL, '{"sexo":"Feminino"}'::jsonb, true, now(), now())
ON CONFLICT DO NOTHING;
INSERT INTO leads (id, clinic_id, name, phone, email, status, phase, temperature, source_type, lead_score, is_active, birth_date, idade, data, wa_opt_in, created_at, updated_at)
VALUES (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'Ana Carolina Ferreira kojo Nogueira', '5544999929576', '', 'active', 'paciente', 'warm', 'import', 0, true, '1983-05-27', 42, '{"sexo":"Feminino","estado_civil":"Divorciado","profissao":"Empresária","endereco":"Avenida Guedner - até 1935/1936, 830, Casa 60, Zona 08, Maringá/PR, 87050-390","cpf":"046.189.109-33"}'::jsonb, true, now(), now())
ON CONFLICT DO NOTHING;
INSERT INTO leads (id, clinic_id, name, phone, email, status, phase, temperature, source_type, lead_score, is_active, birth_date, idade, data, wa_opt_in, created_at, updated_at)
VALUES (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'Ana dos Santos Braziliano', '5544997155721', '', 'active', 'paciente', 'warm', 'import', 0, true, '1952-06-21', 73, '{"sexo":"Feminino","estado_civil":"Viuvo","profissao":"Aposentada","endereco":"Rua Yoshinori Kubota, 683, Parque das Grevíleas I Parte, Maringá/PR, 87025-130","cpf":"468.668.099-91"}'::jsonb, true, now(), now())
ON CONFLICT DO NOTHING;
INSERT INTO leads (id, clinic_id, name, phone, email, status, phase, temperature, source_type, lead_score, is_active, birth_date, idade, data, wa_opt_in, created_at, updated_at)
VALUES (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'Ana Glaucia Capocci', '5544991232700', '', 'active', 'paciente', 'warm', 'import', 0, true, '1966-05-18', 59, '{"sexo":"Feminino","cpf":"024.751.659-79"}'::jsonb, true, now(), now())
ON CONFLICT DO NOTHING;
INSERT INTO leads (id, clinic_id, name, phone, email, status, phase, temperature, source_type, lead_score, is_active, birth_date, idade, data, wa_opt_in, created_at, updated_at)
VALUES (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'Ana Julia dos Santos Silva', '5544991089334', '', 'active', 'paciente', 'warm', 'import', 0, true, NULL, NULL, '{"sexo":"Feminino","origem":"Indicação"}'::jsonb, true, now(), now())
ON CONFLICT DO NOTHING;
INSERT INTO leads (id, clinic_id, name, phone, email, status, phase, temperature, source_type, lead_score, is_active, birth_date, idade, data, wa_opt_in, created_at, updated_at)
VALUES (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'Ana Paula Costa Beraldo', '5544991611804', 'contatollberaldo@gmail.com', 'active', 'paciente', 'warm', 'import', 0, true, '1986-04-21', 39, '{"sexo":"Feminino","estado_civil":"Casado","profissao":"Comerciante","endereco":"Rua Doutor Saulo Porto Virmond, 151, 02, Chácara Paulista, Maringá/PR, 87005-090","cpf":"056.956.689-48","origem":"Miriam Poppi"}'::jsonb, true, now(), now())
ON CONFLICT DO NOTHING;
INSERT INTO leads (id, clinic_id, name, phone, email, status, phase, temperature, source_type, lead_score, is_active, birth_date, idade, data, wa_opt_in, created_at, updated_at)
VALUES (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'Ana Silvia Beltrami', '5544991565610', 'anasilviamga@gmail.com', 'active', 'paciente', 'warm', 'import', 0, true, '1972-10-23', 53, '{"sexo":"Feminino","estado_civil":"Casado","profissao":"Nutricionista Funcional","endereco":"Rua Princesa Isabel, 1349, Casa, Zona 04, Maringá/PR, 87014-090","cpf":"852.002.209-04"}'::jsonb, true, now(), now())
ON CONFLICT DO NOTHING;
INSERT INTO leads (id, clinic_id, name, phone, email, status, phase, temperature, source_type, lead_score, is_active, birth_date, idade, data, wa_opt_in, created_at, updated_at)
VALUES (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'Andrea Petry', '5544999419050', 'andreaalvespetry@gmail.com', 'active', 'paciente', 'warm', 'import', 0, true, '1989-04-12', 36, '{"sexo":"Feminino","estado_civil":"Casado","profissao":"Terapeuta","endereco":"Rua Clóvis Bevilaqua, 129, Zona 04, Maringá/PR, 87014-290","cpf":"007.108.729-09","origem":"Josi"}'::jsonb, true, now(), now())
ON CONFLICT DO NOTHING;
INSERT INTO leads (id, clinic_id, name, phone, email, status, phase, temperature, source_type, lead_score, is_active, birth_date, idade, data, wa_opt_in, created_at, updated_at)
VALUES (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'Andréia Aparecida da Silva', '5544999176935', '', 'active', 'paciente', 'warm', 'import', 0, true, '1979-07-08', 46, '{"sexo":"Feminino","estado_civil":"Casado","profissao":"Comunicadora","endereco":"Rua Piratininga, 75, Zona 01, Maringá/PR, 87013-100","cpf":"024.753.479-02"}'::jsonb, true, now(), now())
ON CONFLICT DO NOTHING;
INSERT INTO leads (id, clinic_id, name, phone, email, status, phase, temperature, source_type, lead_score, is_active, birth_date, idade, data, wa_opt_in, created_at, updated_at)
VALUES (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'Andreia Grutdner', '5544998549020', 'andreiaga_adv@hotmail.com', 'active', 'paciente', 'warm', 'import', 0, true, '1975-04-15', 50, '{"sexo":"Feminino","estado_civil":"Divorciado","profissao":"Advogada","endereco":"Juracy Terra Guelfi, 210, Casa 1, Jardim Grutdner, Marialva/PR, 86990-000","cpf":"003.978.799-03"}'::jsonb, true, now(), now())
ON CONFLICT DO NOTHING;
INSERT INTO leads (id, clinic_id, name, phone, email, status, phase, temperature, source_type, lead_score, is_active, birth_date, idade, data, wa_opt_in, created_at, updated_at)
VALUES (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'Andréia Lucia Motter Correia Moura', '5544991311972', '', 'active', 'paciente', 'warm', 'import', 0, true, '1972-02-24', 54, '{"sexo":"Feminino","estado_civil":"Casado","profissao":"Do lar","endereco":"Rua Neo Alves Martins, 1421, Zona 03, Maringá/PR, 87050-110","cpf":"788.104.009-25"}'::jsonb, true, now(), now())
ON CONFLICT DO NOTHING;
INSERT INTO leads (id, clinic_id, name, phone, email, status, phase, temperature, source_type, lead_score, is_active, birth_date, idade, data, wa_opt_in, created_at, updated_at)
VALUES (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'Andreia Viana', '5544999615278', 'andreiacvcunha@hotmail.com', 'active', 'paciente', 'warm', 'import', 0, true, '1975-04-23', 50, '{"sexo":"Feminino","estado_civil":"Casado","profissao":"Financeiro","endereco":"Rua Princesa Isabel, 116, Apto 1201, Zona 04, Maringá/PR, 87014-090","cpf":"570.867.531-49"}'::jsonb, true, now(), now())
ON CONFLICT DO NOTHING;
INSERT INTO leads (id, clinic_id, name, phone, email, status, phase, temperature, source_type, lead_score, is_active, birth_date, idade, data, wa_opt_in, created_at, updated_at)
VALUES (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'Andressa Valério Moretti', '5544991290220', 'andressavalerio06@gmail.com', 'active', 'paciente', 'warm', 'import', 0, true, '1990-06-06', 35, '{"sexo":"Feminino","estado_civil":"Casado","profissao":"Advogada","endereco":"Rua Pioneira Clotilde Pereira Lima, 62, Jardim Cidade Monções, Maringá/PR, 87060-545","cpf":"064.909.849-89","origem":"Mormaii"}'::jsonb, true, now(), now())
ON CONFLICT DO NOTHING;
INSERT INTO leads (id, clinic_id, name, phone, email, status, phase, temperature, source_type, lead_score, is_active, birth_date, idade, data, wa_opt_in, created_at, updated_at)
VALUES (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'Ângela Mara de Almeida Sgarbosa', '5544998121969', 'angela.almeidasgarbosa@gmail.com', 'active', 'paciente', 'warm', 'import', 0, true, '1982-02-22', 44, '{"sexo":"Feminino","estado_civil":"Casado","profissao":"Advogada","endereco":"Rua João Carlos Polo, 803, Casa, Jardim Higienópolis, Maringá/PR, 87060-600","cpf":"037.133.519-10","origem":"Mormaii"}'::jsonb, true, now(), now())
ON CONFLICT DO NOTHING;
INSERT INTO leads (id, clinic_id, name, phone, email, status, phase, temperature, source_type, lead_score, is_active, birth_date, idade, data, wa_opt_in, created_at, updated_at)
VALUES (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'Ângela Maria Meneguetti Senhorinho', '5544999611784', '', 'active', 'paciente', 'warm', 'import', 0, true, NULL, NULL, '{}'::jsonb, true, now(), now())
ON CONFLICT DO NOTHING;
INSERT INTO leads (id, clinic_id, name, phone, email, status, phase, temperature, source_type, lead_score, is_active, birth_date, idade, data, wa_opt_in, created_at, updated_at)
VALUES (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'Anna Karoline Fenerick Silveira', '5544999310793', 'annakaroline_@hotmail.com', 'active', 'paciente', 'warm', 'import', 0, true, '1988-05-20', 37, '{"sexo":"Feminino","estado_civil":"Casado","profissao":"Corretora de Seguros","endereco":"Rua Estácio de Sá, 1082, Apto 2601, Vila Bosque, Maringá/PR, 87005-020","cpf":"010.116.399-12","origem":"Esposa Dr. Guilherme - Dentista"}'::jsonb, true, now(), now())
ON CONFLICT DO NOTHING;
INSERT INTO leads (id, clinic_id, name, phone, email, status, phase, temperature, source_type, lead_score, is_active, birth_date, idade, data, wa_opt_in, created_at, updated_at)
VALUES (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'Antonio Carlos Boer', '5544998603330', '', 'active', 'paciente', 'warm', 'import', 0, true, '1971-01-10', 55, '{"sexo":"Masculino","estado_civil":"Casado","profissao":"Comerciante","endereco":"Contorno Major Abelardo José da Cruz, 11604, Jardim Copacabana, Maringá/PR, 87023-215","cpf":"815.150.499-49"}'::jsonb, true, now(), now())
ON CONFLICT DO NOTHING;
INSERT INTO leads (id, clinic_id, name, phone, email, status, phase, temperature, source_type, lead_score, is_active, birth_date, idade, data, wa_opt_in, created_at, updated_at)
VALUES (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'Antônio Pedrini', '5544999287417', '', 'active', 'paciente', 'warm', 'import', 0, true, '1946-04-01', 80, '{"cpf":"013.297.409-63"}'::jsonb, true, now(), now())
ON CONFLICT DO NOTHING;
INSERT INTO leads (id, clinic_id, name, phone, email, status, phase, temperature, source_type, lead_score, is_active, birth_date, idade, data, wa_opt_in, created_at, updated_at)
VALUES (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'Arlete Men Fernandes Furlan', '5544999721864', '', 'active', 'paciente', 'warm', 'import', 0, true, '1959-04-05', 66, '{"sexo":"Feminino","estado_civil":"Casado","profissao":"Aposentada","endereco":"Rua 3706, 100, apto 1704, Centro, Balneário Camboriú/SC, 88330-215","cpf":"471.368.399-04"}'::jsonb, true, now(), now())
ON CONFLICT DO NOTHING;
INSERT INTO leads (id, clinic_id, name, phone, email, status, phase, temperature, source_type, lead_score, is_active, birth_date, idade, data, wa_opt_in, created_at, updated_at)
VALUES (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'Arthur Emanuel da Rosa', '5566996038022', '', 'active', 'paciente', 'warm', 'import', 0, true, '2010-01-26', 16, '{"sexo":"Masculino","estado_civil":"Solteiro","profissao":"Estudante","endereco":"Rua Cuba, 115, Vila Morangueira, Maringá/PR, 87040-410","cpf":"091.420.529-39"}'::jsonb, true, now(), now())
ON CONFLICT DO NOTHING;
INSERT INTO leads (id, clinic_id, name, phone, email, status, phase, temperature, source_type, lead_score, is_active, birth_date, idade, data, wa_opt_in, created_at, updated_at)
VALUES (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'ASSEMBLEIA SICRED', '5544980845632', '', 'active', 'paciente', 'warm', 'import', 0, true, NULL, NULL, '{"sexo":"Feminino"}'::jsonb, true, now(), now())
ON CONFLICT DO NOTHING;
INSERT INTO leads (id, clinic_id, name, phone, email, status, phase, temperature, source_type, lead_score, is_active, birth_date, idade, data, wa_opt_in, created_at, updated_at)
VALUES (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'Beatriz Beckenkamp', '5548999329533', 'beatrizbeckenkamp@hotmail.com', 'active', 'paciente', 'warm', 'import', 0, true, '1998-01-13', 28, '{"sexo":"Feminino","estado_civil":"Casado","profissao":"Fisioterapeuta","endereco":"Rua Pioneiro Arlindo Pedralli, 862, Casa B, Parque das Laranjeiras, Maringá/PR, 87083-150","cpf":"095.109.539-03"}'::jsonb, true, now(), now())
ON CONFLICT DO NOTHING;
INSERT INTO leads (id, clinic_id, name, phone, email, status, phase, temperature, source_type, lead_score, is_active, birth_date, idade, data, wa_opt_in, created_at, updated_at)
VALUES (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'Bernadette Barros', '5544991453108', '', 'active', 'paciente', 'warm', 'import', 0, true, '1965-12-27', 60, '{"sexo":"Feminino","cpf":"583.304.889-34"}'::jsonb, true, now(), now())
ON CONFLICT DO NOTHING;
INSERT INTO leads (id, clinic_id, name, phone, email, status, phase, temperature, source_type, lead_score, is_active, birth_date, idade, data, wa_opt_in, created_at, updated_at)
VALUES (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'Betânia Tel Germano Rolim', '5544991039895', '', 'active', 'paciente', 'warm', 'import', 0, true, '1982-02-08', 44, '{"sexo":"Feminino","estado_civil":"Casado","profissao":"Empresaria","endereco":"Avenida Arquiteto Nildo Ribeiro da Rocha, 3491, Jardim Higienópolis, Maringá/PR, 87060-390","cpf":"036.955.059-58"}'::jsonb, true, now(), now())
ON CONFLICT DO NOTHING;
INSERT INTO leads (id, clinic_id, name, phone, email, status, phase, temperature, source_type, lead_score, is_active, birth_date, idade, data, wa_opt_in, created_at, updated_at)
VALUES (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'Bianca Suardi', '5544997220011', '', 'active', 'paciente', 'warm', 'import', 0, true, '1996-12-30', 29, '{"sexo":"Feminino","estado_civil":"Casado","profissao":"Maquiadora","endereco":"Rua Santos Dumont, 1190, Zona 03, Maringá/PR, 87050-100","cpf":"098.442.419-95"}'::jsonb, true, now(), now())
ON CONFLICT DO NOTHING;
INSERT INTO leads (id, clinic_id, name, phone, email, status, phase, temperature, source_type, lead_score, is_active, birth_date, idade, data, wa_opt_in, created_at, updated_at)
VALUES (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'Bruna Suardi', '5544999475811', '', 'active', 'paciente', 'warm', 'import', 0, true, NULL, NULL, '{}'::jsonb, true, now(), now())
ON CONFLICT DO NOTHING;
INSERT INTO leads (id, clinic_id, name, phone, email, status, phase, temperature, source_type, lead_score, is_active, birth_date, idade, data, wa_opt_in, created_at, updated_at)
VALUES (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'Calanedi Perussolo', '5541991553535', 'ca_mart@hotmail.com', 'active', 'paciente', 'warm', 'import', 0, true, '1984-05-18', 41, '{"sexo":"Feminino","estado_civil":"Casado","profissao":"Advogada","endereco":"Avenida Laguna, 733, 503, Zona 03, Maringá/PR, 87050-260","cpf":"044.697.249-55","origem":"Josiane Cantarutti"}'::jsonb, true, now(), now())
ON CONFLICT DO NOTHING;
INSERT INTO leads (id, clinic_id, name, phone, email, status, phase, temperature, source_type, lead_score, is_active, birth_date, idade, data, wa_opt_in, created_at, updated_at)
VALUES (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'Camila Constantino', '5544991525737', '', 'active', 'paciente', 'warm', 'import', 0, true, '1989-07-28', 36, '{"sexo":"Feminino","estado_civil":"Casado","profissao":"Empresária","endereco":"Avenida Pedro Taques, 2238, Jardim Alvorada, Maringá/PR, 87033-000","cpf":"071.202.379-85"}'::jsonb, true, now(), now())
ON CONFLICT DO NOTHING;
INSERT INTO leads (id, clinic_id, name, phone, email, status, phase, temperature, source_type, lead_score, is_active, birth_date, idade, data, wa_opt_in, created_at, updated_at)
VALUES (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'CAMILA PEREIRA', '5544984620425', 'camilaribeirojb8810@gmail.com', 'active', 'paciente', 'warm', 'import', 0, true, '1988-05-18', 37, '{"sexo":"Feminino","estado_civil":"Casado","profissao":"autônoma","endereco":"Rua Pioneiro Antonio Deganello, 538, casa a, Jardim Dias II, Maringá/PR, 87025-842","cpf":"010.060.639-35"}'::jsonb, true, now(), now())
ON CONFLICT DO NOTHING;
INSERT INTO leads (id, clinic_id, name, phone, email, status, phase, temperature, source_type, lead_score, is_active, birth_date, idade, data, wa_opt_in, created_at, updated_at)
VALUES (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'Carina Moderna', '5544991836492', 'modenacarina@hotmail.com', 'active', 'paciente', 'warm', 'import', 0, true, '1989-08-25', 36, '{"sexo":"Feminino","estado_civil":"Solteiro","profissao":"Psicóloga","endereco":"Ana terra, 1805, 4, Bosque, Maringá/PR, 87020-10","cpf":"078.065.649-00"}'::jsonb, true, now(), now())
ON CONFLICT DO NOTHING;
INSERT INTO leads (id, clinic_id, name, phone, email, status, phase, temperature, source_type, lead_score, is_active, birth_date, idade, data, wa_opt_in, created_at, updated_at)
VALUES (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'Carolina Maronese Soares', '5544991361305', 'carolinahmsoares@gmail.com', 'active', 'paciente', 'warm', 'import', 0, true, '1967-06-23', 58, '{"sexo":"Feminino","estado_civil":"Solteiro","profissao":"Advogada","endereco":"Rua Jangada, 403, Apartamento 1401 Torre Paris, Zona 07, Maringá/PR, 87020-180","cpf":"558.840.759-87"}'::jsonb, true, now(), now())
ON CONFLICT DO NOTHING;
INSERT INTO leads (id, clinic_id, name, phone, email, status, phase, temperature, source_type, lead_score, is_active, birth_date, idade, data, wa_opt_in, created_at, updated_at)
VALUES (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'Caroline B. Prajiante', '5544991512044', 'caroline.brunelli@hotmail.com', 'active', 'paciente', 'warm', 'import', 0, true, '1975-01-25', 51, '{"sexo":"Feminino","estado_civil":"Casado","profissao":"Dentista","endereco":"Avenida Cerro Azul 2649, 2649, Casa H19, Jardim Novo Horizonte, Maringá/PR, 87010-910","cpf":"263.991.298-42"}'::jsonb, true, now(), now())
ON CONFLICT DO NOTHING;
INSERT INTO leads (id, clinic_id, name, phone, email, status, phase, temperature, source_type, lead_score, is_active, birth_date, idade, data, wa_opt_in, created_at, updated_at)
VALUES (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'Caroline Barros Vieira', '5544997158908', '', 'active', 'paciente', 'warm', 'import', 0, true, NULL, NULL, '{"sexo":"Feminino","origem":"Instagram"}'::jsonb, true, now(), now())
ON CONFLICT DO NOTHING;
INSERT INTO leads (id, clinic_id, name, phone, email, status, phase, temperature, source_type, lead_score, is_active, birth_date, idade, data, wa_opt_in, created_at, updated_at)
VALUES (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'Caroline Lima  Coutinho', '5544991618040', '', 'active', 'paciente', 'warm', 'import', 0, true, NULL, NULL, '{}'::jsonb, true, now(), now())
ON CONFLICT DO NOTHING;
INSERT INTO leads (id, clinic_id, name, phone, email, status, phase, temperature, source_type, lead_score, is_active, birth_date, idade, data, wa_opt_in, created_at, updated_at)
VALUES (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'Celia Nishimura', '5544991133903', 'cenishimura@hotmail.com', 'active', 'paciente', 'warm', 'import', 0, true, '1965-11-12', 60, '{"sexo":"Feminino","estado_civil":"Casado","profissao":"Aposentada","endereco":"Avenida Cerro Azul, 1200, 1502, Jardim Novo Horizonte, Maringá/PR, 87010-055","cpf":"598.971.639-72"}'::jsonb, true, now(), now())
ON CONFLICT DO NOTHING;
INSERT INTO leads (id, clinic_id, name, phone, email, status, phase, temperature, source_type, lead_score, is_active, birth_date, idade, data, wa_opt_in, created_at, updated_at)
VALUES (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'Célia Nunes da Silva', '5543998100832', 'celianunes.jds@gmail.com', 'active', 'paciente', 'warm', 'import', 0, true, '1974-06-28', 51, '{"sexo":"Feminino","estado_civil":"Divorciado","profissao":"Confeiteira","endereco":"Rua Giovanni Bertoli, 13, Casa, Jardim Moretti, Jandaia do Sul/PR, 86900-000","cpf":"008.572.139-54"}'::jsonb, true, now(), now())
ON CONFLICT DO NOTHING;
INSERT INTO leads (id, clinic_id, name, phone, email, status, phase, temperature, source_type, lead_score, is_active, birth_date, idade, data, wa_opt_in, created_at, updated_at)
VALUES (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'Charlene Feijo Pechek', '5544997442020', 'charlenefeijo@gmail.com', 'active', 'paciente', 'warm', 'import', 0, true, '1983-12-29', 42, '{"sexo":"Feminino","estado_civil":"Casado","profissao":"Empresária","endereco":"Antônio Gentilin, 25, Casa, Jardim Itaipu, Mandaguaçu/PR, 87160-000","cpf":"044.417.329-37"}'::jsonb, true, now(), now())
ON CONFLICT DO NOTHING;
INSERT INTO leads (id, clinic_id, name, phone, email, status, phase, temperature, source_type, lead_score, is_active, birth_date, idade, data, wa_opt_in, created_at, updated_at)
VALUES (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'Cibelly Bertoco', '5544991461333', 'cibellybertoco@gmail.com', 'active', 'paciente', 'warm', 'import', 0, true, '1979-03-19', 47, '{"sexo":"Feminino","estado_civil":"Casado","profissao":"Empresária","endereco":"Rua Cambira, 370, Apto 1005, Zona 08, Maringá/PR, 87050-660","cpf":"007.018.879-31"}'::jsonb, true, now(), now())
ON CONFLICT DO NOTHING;
INSERT INTO leads (id, clinic_id, name, phone, email, status, phase, temperature, source_type, lead_score, is_active, birth_date, idade, data, wa_opt_in, created_at, updated_at)
VALUES (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'Cinthia Rizzo', '5544991566324', '', 'active', 'paciente', 'warm', 'import', 0, true, '1970-06-02', 55, '{"sexo":"Feminino","endereco":"Avenida Itororó, 1300, Apto 1202, Zona 02, Maringá/PR, 87010-460","cpf":"141.218.068-67"}'::jsonb, true, now(), now())
ON CONFLICT DO NOTHING;
INSERT INTO leads (id, clinic_id, name, phone, email, status, phase, temperature, source_type, lead_score, is_active, birth_date, idade, data, wa_opt_in, created_at, updated_at)
VALUES (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'Cintya', '5544991382220', 'financeiro@eleteosardanha.com.br', 'active', 'paciente', 'warm', 'import', 0, true, '2025-07-12', NULL, '{"sexo":"Feminino","estado_civil":"Casado","profissao":"Empresaria","endereco":"Avenida Brasil, 6905, Casa Sardanha, Zona 05, Maringá/PR, 87015-282","cpf":"026.988.849-75"}'::jsonb, true, now(), now())
ON CONFLICT DO NOTHING;
INSERT INTO leads (id, clinic_id, name, phone, email, status, phase, temperature, source_type, lead_score, is_active, birth_date, idade, data, wa_opt_in, created_at, updated_at)
VALUES (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'Claudete Maria  Tura', '5544988041740', '', 'active', 'paciente', 'warm', 'import', 0, true, '1985-03-11', 41, '{"sexo":"Feminino","cpf":"006.342.810-54","tags_clinica":"Avaliação"}'::jsonb, true, now(), now())
ON CONFLICT DO NOTHING;
INSERT INTO leads (id, clinic_id, name, phone, email, status, phase, temperature, source_type, lead_score, is_active, birth_date, idade, data, wa_opt_in, created_at, updated_at)
VALUES (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'Claudicéia Batalini', '5544998849157', 'claudiceia.batalini@gmail.com', 'active', 'paciente', 'warm', 'import', 0, true, '1972-02-01', 54, '{"sexo":"Feminino","estado_civil":"Casado","profissao":"Corretora de imóveis","endereco":"Rua Madrepérola, 301, Casa, Jardim Paraizo, Maringá/PR, 87083-061","cpf":"846.889.559-87"}'::jsonb, true, now(), now())
ON CONFLICT DO NOTHING;
INSERT INTO leads (id, clinic_id, name, phone, email, status, phase, temperature, source_type, lead_score, is_active, birth_date, idade, data, wa_opt_in, created_at, updated_at)
VALUES (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'CLEBER FRANCISCO DE OLIVEIRA', '5545998409737', '', 'active', 'paciente', 'warm', 'import', 0, true, '1987-01-12', 39, '{"estado_civil":"Solteiro","profissao":"MEDICO","endereco":"Avenida Carneiro Leão, 231, MARINGA, Zona Armazém, Maringá/PR, 87014-010","cpf":"001.651.952-31"}'::jsonb, true, now(), now())
ON CONFLICT DO NOTHING;
INSERT INTO leads (id, clinic_id, name, phone, email, status, phase, temperature, source_type, lead_score, is_active, birth_date, idade, data, wa_opt_in, created_at, updated_at)
VALUES (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'Cleide de Oliveira', '5544999024554', '', 'active', 'paciente', 'warm', 'import', 0, true, NULL, NULL, '{}'::jsonb, true, now(), now())
ON CONFLICT DO NOTHING;
INSERT INTO leads (id, clinic_id, name, phone, email, status, phase, temperature, source_type, lead_score, is_active, birth_date, idade, data, wa_opt_in, created_at, updated_at)
VALUES (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'Conceição Aparecida Rezende', '5544997030377', '', 'active', 'paciente', 'warm', 'import', 0, true, '1964-04-17', 61, '{"sexo":"Feminino","endereco":"Rua Fernão Dias, 246, Apto 301, Zona Armazém, Maringá/PR, 87014-000","cpf":"522.324.769-87","origem":"Marcy"}'::jsonb, true, now(), now())
ON CONFLICT DO NOTHING;
INSERT INTO leads (id, clinic_id, name, phone, email, status, phase, temperature, source_type, lead_score, is_active, birth_date, idade, data, wa_opt_in, created_at, updated_at)
VALUES (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'Cristiana Aparecida Lau', '5544998109160', '', 'active', 'paciente', 'warm', 'import', 0, true, '1980-01-16', 46, '{"sexo":"Feminino","estado_civil":"Casado","profissao":"Empresária","endereco":"Rua Neo Alves Martins, 2398, apto 2002, Zona 01, Maringá/PR, 87013-060","cpf":"031.420.799-63"}'::jsonb, true, now(), now())
ON CONFLICT DO NOTHING;
INSERT INTO leads (id, clinic_id, name, phone, email, status, phase, temperature, source_type, lead_score, is_active, birth_date, idade, data, wa_opt_in, created_at, updated_at)
VALUES (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'Cristina de Souza Pimentel', '5544999901192', '', 'active', 'paciente', 'warm', 'import', 0, true, '1976-10-05', 49, '{"sexo":"Feminino","estado_civil":"Casado","profissao":"Farmacêutica","endereco":"Rua Titanita, 935, Jardim Santa Helena, Maringá/PR, 87083-340","cpf":"020.172.309-36"}'::jsonb, true, now(), now())
ON CONFLICT DO NOTHING;
INSERT INTO leads (id, clinic_id, name, phone, email, status, phase, temperature, source_type, lead_score, is_active, birth_date, idade, data, wa_opt_in, created_at, updated_at)
VALUES (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'Cristina Yoshie Kimura', '5544999859942', '', 'active', 'paciente', 'warm', 'import', 0, true, '1964-08-31', 61, '{"sexo":"Feminino","estado_civil":"Casado","profissao":"Consultora","endereco":"Rua Cambira, 57, Zona 08, Maringá/PR, 87050-660","cpf":"640.768.659-87"}'::jsonb, true, now(), now())
ON CONFLICT DO NOTHING;
INSERT INTO leads (id, clinic_id, name, phone, email, status, phase, temperature, source_type, lead_score, is_active, birth_date, idade, data, wa_opt_in, created_at, updated_at)
VALUES (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'Daiane Aires', '5544991735670', 'daiane@neomag.net.br', 'active', 'paciente', 'warm', 'import', 0, true, '1986-09-16', 39, '{"sexo":"Feminino","estado_civil":"Casado","profissao":"Empresaria","endereco":"Rua Marcílio Dias, 888, Apto 201, Zona 03, Maringá/PR, 87050-120","cpf":"748.832.671-72"}'::jsonb, true, now(), now())
ON CONFLICT DO NOTHING;
INSERT INTO leads (id, clinic_id, name, phone, email, status, phase, temperature, source_type, lead_score, is_active, birth_date, idade, data, wa_opt_in, created_at, updated_at)
VALUES (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'Daiane Cristina Benati', '5544984614114', 'daianecristina0905@icloud.com', 'active', 'paciente', 'warm', 'import', 0, true, '1987-06-19', 38, '{"sexo":"Feminino","estado_civil":"Casado","profissao":"Empresária","endereco":"Rua São Marcelino Champagnat, 1387 A, Casa, Zona 02, Maringá/PR, 87010-430","cpf":"068.510.559-88"}'::jsonb, true, now(), now())
ON CONFLICT DO NOTHING;
INSERT INTO leads (id, clinic_id, name, phone, email, status, phase, temperature, source_type, lead_score, is_active, birth_date, idade, data, wa_opt_in, created_at, updated_at)
VALUES (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'Dani Mendes', '5544999658821', 'papocoachingdanimendes@gmail.com', 'active', 'paciente', 'warm', 'import', 0, true, '1979-11-24', 46, '{"sexo":"Feminino","estado_civil":"Casado","profissao":"Mentora de Comunicação","endereco":"Avenida Carlos Correa Borges, 1013, casa  23, Jardim Iguaçu, Maringá/PR, 87060-173","cpf":"028.413.569-06"}'::jsonb, true, now(), now())
ON CONFLICT DO NOTHING;
INSERT INTO leads (id, clinic_id, name, phone, email, status, phase, temperature, source_type, lead_score, is_active, birth_date, idade, data, wa_opt_in, created_at, updated_at)
VALUES (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'Daniela Bueno', '5544999610190', '', 'active', 'paciente', 'warm', 'import', 0, true, '2026-02-02', NULL, '{"sexo":"Feminino","endereco":"Rua Rosana, 3, Parque das Grevíleas 3ª parte, Maringá/PR, 87025-190","cpf":"006.903.919-43"}'::jsonb, true, now(), now())
ON CONFLICT DO NOTHING;
INSERT INTO leads (id, clinic_id, name, phone, email, status, phase, temperature, source_type, lead_score, is_active, birth_date, idade, data, wa_opt_in, created_at, updated_at)
VALUES (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'Daniela Dorth', '5544999333763', 'dani_bill2011@yahoo.com.br', 'active', 'paciente', 'warm', 'import', 0, true, '1979-10-29', 46, '{"sexo":"Feminino","estado_civil":"Casado","profissao":"Do lar","endereco":"Avenida São Paulo, 3103, AP 102, Vila Bosque, Maringá/PR, 87005-040","cpf":"029.512.849-69","origem":"Mormaii"}'::jsonb, true, now(), now())
ON CONFLICT DO NOTHING;
INSERT INTO leads (id, clinic_id, name, phone, email, status, phase, temperature, source_type, lead_score, is_active, birth_date, idade, data, wa_opt_in, created_at, updated_at)
VALUES (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'Daniela Zarantonelli', '5511953403069', 'daniela.zarantonelli@gmail.com', 'active', 'paciente', 'warm', 'import', 0, true, '1981-01-12', 45, '{"sexo":"Feminino","estado_civil":"Casado","profissao":"Admistradora","endereco":"Avenida Prudente de Morais, 463, Apto 1704, Zona 07, Maringá/PR, 87020-010","cpf":"299.424.368-71","origem":"Mormaii"}'::jsonb, true, now(), now())
ON CONFLICT DO NOTHING;
INSERT INTO leads (id, clinic_id, name, phone, email, status, phase, temperature, source_type, lead_score, is_active, birth_date, idade, data, wa_opt_in, created_at, updated_at)
VALUES (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'Dayana Ruivo', '5544999621216', 'dayanaruivo@gmail.com', 'active', 'paciente', 'warm', 'import', 0, true, '1982-06-21', 43, '{"sexo":"Feminino","estado_civil":"Casado","profissao":"Empresária","endereco":"Avenida Laguna, 733, Apto 401, Zona 03, Maringá/PR, 87050-260","cpf":"036.957.539-35"}'::jsonb, true, now(), now())
ON CONFLICT DO NOTHING;
INSERT INTO leads (id, clinic_id, name, phone, email, status, phase, temperature, source_type, lead_score, is_active, birth_date, idade, data, wa_opt_in, created_at, updated_at)
VALUES (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'Debora Esper', '5544920033385', 'debgomes81@gmail.com', 'active', 'paciente', 'warm', 'import', 0, true, '1975-01-25', 51, '{"sexo":"Feminino","estado_civil":"Casado","profissao":"Professora","endereco":"Rua Aurélio Quáglia, 128, Jardim Monte Rei, Maringá/PR, 87083-660","cpf":"019.707.599-17"}'::jsonb, true, now(), now())
ON CONFLICT DO NOTHING;
INSERT INTO leads (id, clinic_id, name, phone, email, status, phase, temperature, source_type, lead_score, is_active, birth_date, idade, data, wa_opt_in, created_at, updated_at)
VALUES (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'Denise Mathias de Campos', '5544999444775', '', 'active', 'paciente', 'warm', 'import', 0, true, '1964-07-12', 61, '{"sexo":"Feminino","estado_civil":"Casado","profissao":"Médica","endereco":"Rua Guaporé, 373, Jardim Guaporé, Maringá/PR, 87060-210","cpf":"080.738.848-36"}'::jsonb, true, now(), now())
ON CONFLICT DO NOTHING;
INSERT INTO leads (id, clinic_id, name, phone, email, status, phase, temperature, source_type, lead_score, is_active, birth_date, idade, data, wa_opt_in, created_at, updated_at)
VALUES (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'Djanira H. Delmutti', '5544999169500', '', 'active', 'paciente', 'warm', 'import', 0, true, NULL, NULL, '{"sexo":"Feminino","origem":"Cazza Flor"}'::jsonb, true, now(), now())
ON CONFLICT DO NOTHING;
INSERT INTO leads (id, clinic_id, name, phone, email, status, phase, temperature, source_type, lead_score, is_active, birth_date, idade, data, wa_opt_in, created_at, updated_at)
VALUES (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'Dr.Danilo', '5544999703025', '', 'active', 'paciente', 'warm', 'import', 0, true, NULL, NULL, '{"sexo":"Masculino"}'::jsonb, true, now(), now())
ON CONFLICT DO NOTHING;
INSERT INTO leads (id, clinic_id, name, phone, email, status, phase, temperature, source_type, lead_score, is_active, birth_date, idade, data, wa_opt_in, created_at, updated_at)
VALUES (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'Dra. Priscila Elias', '5511930114506', '', 'active', 'paciente', 'warm', 'import', 0, true, '1976-12-29', 49, '{"sexo":"Feminino","cpf":"278.169.008-21"}'::jsonb, true, now(), now())
ON CONFLICT DO NOTHING;
INSERT INTO leads (id, clinic_id, name, phone, email, status, phase, temperature, source_type, lead_score, is_active, birth_date, idade, data, wa_opt_in, created_at, updated_at)
VALUES (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'Dulcinéia Gianotto', '5544999617352', 'depgianoto@uem.br', 'active', 'paciente', 'warm', 'import', 0, true, '1955-02-09', 71, '{"sexo":"Feminino","estado_civil":"Casado","profissao":"Docente","endereco":"Rua Silva Jardim, 290, 81, Zona 01, Maringá/PR, 87013-010","cpf":"361.664.999-49","origem":"Cazza Flor"}'::jsonb, true, now(), now())
ON CONFLICT DO NOTHING;
INSERT INTO leads (id, clinic_id, name, phone, email, status, phase, temperature, source_type, lead_score, is_active, birth_date, idade, data, wa_opt_in, created_at, updated_at)
VALUES (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'Eduarda Ravelli', '5544998007090', '', 'active', 'paciente', 'warm', 'import', 0, true, NULL, NULL, '{"sexo":"Feminino"}'::jsonb, true, now(), now())
ON CONFLICT DO NOTHING;
INSERT INTO leads (id, clinic_id, name, phone, email, status, phase, temperature, source_type, lead_score, is_active, birth_date, idade, data, wa_opt_in, created_at, updated_at)
VALUES (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'Elaine de Camargo Barros', '5544999939449', 'elainebarros056@gmail.com', 'active', 'paciente', 'warm', 'import', 0, true, '1976-11-04', 49, '{"sexo":"Feminino","estado_civil":"Casado","profissao":"Gerente operacional","endereco":"Avenida Kakogawa, 1173, Sobreloja, Parque das Grevíleas, Maringá/PR, 87025-000","cpf":"018.860.189-95"}'::jsonb, true, now(), now())
ON CONFLICT DO NOTHING;
INSERT INTO leads (id, clinic_id, name, phone, email, status, phase, temperature, source_type, lead_score, is_active, birth_date, idade, data, wa_opt_in, created_at, updated_at)
VALUES (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'Elena de Oliveira Cantarutti', '5544999214113', '', 'active', 'paciente', 'warm', 'import', 0, true, NULL, NULL, '{"sexo":"Feminino","origem":"Mae Josi Cantarutti"}'::jsonb, true, now(), now())
ON CONFLICT DO NOTHING;
INSERT INTO leads (id, clinic_id, name, phone, email, status, phase, temperature, source_type, lead_score, is_active, birth_date, idade, data, wa_opt_in, created_at, updated_at)
VALUES (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'Eliana Cristina Masson', '5544991772126', '', 'active', 'paciente', 'warm', 'import', 0, true, NULL, NULL, '{}'::jsonb, true, now(), now())
ON CONFLICT DO NOTHING;
INSERT INTO leads (id, clinic_id, name, phone, email, status, phase, temperature, source_type, lead_score, is_active, birth_date, idade, data, wa_opt_in, created_at, updated_at)
VALUES (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'Eliana Godoy', '5544999554241', '', 'active', 'paciente', 'warm', 'import', 0, true, '1970-02-24', 56, '{"sexo":"Feminino","estado_civil":"Casado","profissao":"Autônoma","endereco":"Avenida Guedner - até 1935/1936, 521, Apto 2302, Zona 08, Maringá/PR, 87050-390","cpf":"792.771.109-10"}'::jsonb, true, now(), now())
ON CONFLICT DO NOTHING;
INSERT INTO leads (id, clinic_id, name, phone, email, status, phase, temperature, source_type, lead_score, is_active, birth_date, idade, data, wa_opt_in, created_at, updated_at)
VALUES (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'Eliane Fanttina Dos Santos', '5544999479024', '', 'active', 'paciente', 'warm', 'import', 0, true, '1976-08-28', 49, '{"cpf":"025.818.629-12"}'::jsonb, true, now(), now())
ON CONFLICT DO NOTHING;
INSERT INTO leads (id, clinic_id, name, phone, email, status, phase, temperature, source_type, lead_score, is_active, birth_date, idade, data, wa_opt_in, created_at, updated_at)
VALUES (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'Eliane Frameschi', '5544991780390', '', 'active', 'paciente', 'warm', 'import', 0, true, '1978-09-23', 47, '{"sexo":"Feminino","estado_civil":"Solteiro","profissao":"Costureira","endereco":"Giro  Watanabe, 1754, Casa, Novo independência, Sarandi/PR, 97113-500","cpf":"220.044.958-55"}'::jsonb, true, now(), now())
ON CONFLICT DO NOTHING;
INSERT INTO leads (id, clinic_id, name, phone, email, status, phase, temperature, source_type, lead_score, is_active, birth_date, idade, data, wa_opt_in, created_at, updated_at)
VALUES (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'Eliane Martins Silva', '5544998251032', 'martins_eliane1@hotmail.com', 'active', 'paciente', 'warm', 'import', 0, true, '1979-05-28', 46, '{"sexo":"Feminino","estado_civil":"Divorciado","profissao":"Cuidadora/técnico em enfermagem","cpf":"023.628.879-28"}'::jsonb, true, now(), now())
ON CONFLICT DO NOTHING;
INSERT INTO leads (id, clinic_id, name, phone, email, status, phase, temperature, source_type, lead_score, is_active, birth_date, idade, data, wa_opt_in, created_at, updated_at)
VALUES (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'Eliane Souza tivo', '5544999971794', '', 'active', 'paciente', 'warm', 'import', 0, true, '1967-05-01', 58, '{"sexo":"Feminino","estado_civil":"Divorciado","profissao":"Corretora de Seguros","endereco":"Rua Luiz Messias Simino, 134, Jardim América, Maringá/PR, 87045-340","cpf":"617.598.569-91"}'::jsonb, true, now(), now())
ON CONFLICT DO NOTHING;
INSERT INTO leads (id, clinic_id, name, phone, email, status, phase, temperature, source_type, lead_score, is_active, birth_date, idade, data, wa_opt_in, created_at, updated_at)
VALUES (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'Elicéia Helman', '5543998324088', '', 'active', 'paciente', 'warm', 'import', 0, true, '1970-01-24', 56, '{"sexo":"Feminino","cpf":"782.839.229-04","tags_clinica":"Avaliação"}'::jsonb, true, now(), now())
ON CONFLICT DO NOTHING;
INSERT INTO leads (id, clinic_id, name, phone, email, status, phase, temperature, source_type, lead_score, is_active, birth_date, idade, data, wa_opt_in, created_at, updated_at)
VALUES (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'Eligianne Mestriner', '5544988213298', '', 'active', 'paciente', 'warm', 'import', 0, true, '1976-11-10', 49, '{"sexo":"Feminino","estado_civil":"Casado","profissao":"Cirurgiã Dentista","endereco":"Avenida Carlos Correa Borges, 2211, casa 58, Conjunto Habitacional Inocente Vila Nova Júnior, Maringá/PR, 87060-000","cpf":"027.761.799-52"}'::jsonb, true, now(), now())
ON CONFLICT DO NOTHING;
INSERT INTO leads (id, clinic_id, name, phone, email, status, phase, temperature, source_type, lead_score, is_active, birth_date, idade, data, wa_opt_in, created_at, updated_at)
VALUES (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'Elis Lacerda', '5544999506896', 'elis-lacerda@hotmail.com', 'active', 'paciente', 'warm', 'import', 0, true, '1988-06-02', 37, '{"sexo":"Feminino","estado_civil":"Solteiro","profissao":"produtora de eventos","endereco":"Rua Nova Esperança, 119, Zona 08, Maringá/PR, 87050-570","cpf":"010.272.059-25"}'::jsonb, true, now(), now())
ON CONFLICT DO NOTHING;
INSERT INTO leads (id, clinic_id, name, phone, email, status, phase, temperature, source_type, lead_score, is_active, birth_date, idade, data, wa_opt_in, created_at, updated_at)
VALUES (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'Elisangela Faraoni de Mello Guimarães', '5544988131016', 'elisangelafmg@gmail.com', 'active', 'paciente', 'warm', 'import', 0, true, '1977-02-20', 49, '{"sexo":"Feminino","estado_civil":"Casado","profissao":"Empresária","endereco":"Avenida João Paulino Vieira Filho, 275, Zona 01, Maringá/PR, 87020-015","cpf":"005.529.369-79"}'::jsonb, true, now(), now())
ON CONFLICT DO NOTHING;
INSERT INTO leads (id, clinic_id, name, phone, email, status, phase, temperature, source_type, lead_score, is_active, birth_date, idade, data, wa_opt_in, created_at, updated_at)
VALUES (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'Elisete Pilla', '5544991446191', 'elisete_gu@hotmail.com', 'active', 'paciente', 'warm', 'import', 0, true, '1961-04-15', 64, '{"sexo":"Feminino","estado_civil":"Viuvo","profissao":"Professora aposentada","endereco":"Rua Adão Elói Trojan, 866, Jardim Ipanema, Maringá/PR, 87053-230","cpf":"247.063.938-76"}'::jsonb, true, now(), now())
ON CONFLICT DO NOTHING;
INSERT INTO leads (id, clinic_id, name, phone, email, status, phase, temperature, source_type, lead_score, is_active, birth_date, idade, data, wa_opt_in, created_at, updated_at)
VALUES (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'Elizabeth de Oliveira Sotti', '5544999624883', '', 'active', 'paciente', 'warm', 'import', 0, true, NULL, NULL, '{"sexo":"Feminino"}'::jsonb, true, now(), now())
ON CONFLICT DO NOTHING;
INSERT INTO leads (id, clinic_id, name, phone, email, status, phase, temperature, source_type, lead_score, is_active, birth_date, idade, data, wa_opt_in, created_at, updated_at)
VALUES (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'Emanuelle Garcia de Souza Martins', '5544997637161', '', 'active', 'paciente', 'warm', 'import', 0, true, NULL, NULL, '{"cpf":"081.743.539-50"}'::jsonb, true, now(), now())
ON CONFLICT DO NOTHING;
INSERT INTO leads (id, clinic_id, name, phone, email, status, phase, temperature, source_type, lead_score, is_active, birth_date, idade, data, wa_opt_in, created_at, updated_at)
VALUES (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'Erali De Moraes', '5544997074803', '', 'active', 'paciente', 'warm', 'import', 0, true, '1961-01-11', 65, '{"sexo":"Feminino","estado_civil":"Solteiro","profissao":"Empresária","endereco":"Rua Marechal Floriano, 333, Centro, Roncador/PR, 87320-000","cpf":"478.410.529-87"}'::jsonb, true, now(), now())
ON CONFLICT DO NOTHING;
INSERT INTO leads (id, clinic_id, name, phone, email, status, phase, temperature, source_type, lead_score, is_active, birth_date, idade, data, wa_opt_in, created_at, updated_at)
VALUES (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'Esthefany Akemy', '5544999058576', '', 'active', 'paciente', 'warm', 'import', 0, true, '2000-08-02', 25, '{"sexo":"Feminino","estado_civil":"Solteiro","profissao":"Médica","endereco":"Rua Doutor Carlos Aldrovandi, 00, Jardim Parque Morumbi, São Paulo/SP, 05712-020"}'::jsonb, true, now(), now())
ON CONFLICT DO NOTHING;
INSERT INTO leads (id, clinic_id, name, phone, email, status, phase, temperature, source_type, lead_score, is_active, birth_date, idade, data, wa_opt_in, created_at, updated_at)
VALUES (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'Etherea Lab', '554430250015', '', 'active', 'paciente', 'warm', 'import', 0, true, NULL, NULL, '{}'::jsonb, true, now(), now())
ON CONFLICT DO NOTHING;
INSERT INTO leads (id, clinic_id, name, phone, email, status, phase, temperature, source_type, lead_score, is_active, birth_date, idade, data, wa_opt_in, created_at, updated_at)
VALUES (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'Fátima Haupt', '5544999098861', 'fatima.haupt@hotmail.com', 'active', 'paciente', 'warm', 'import', 0, true, '1982-05-25', 43, '{"sexo":"Feminino","estado_civil":"Casado","cpf":"037.778.379-03"}'::jsonb, true, now(), now())
ON CONFLICT DO NOTHING;
INSERT INTO leads (id, clinic_id, name, phone, email, status, phase, temperature, source_type, lead_score, is_active, birth_date, idade, data, wa_opt_in, created_at, updated_at)
VALUES (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'Fernanda', '5544991020351', 'ferzambaldi10@gmail.com', 'active', 'paciente', 'warm', 'import', 0, true, '2008-10-08', 17, '{"sexo":"Feminino","estado_civil":"Solteiro","profissao":"Estudante","endereco":"Luiz Pierini, 241, Casa, Salem Chade, Marialva/PR, 86990-000","cpf":"144.234.169-64"}'::jsonb, true, now(), now())
ON CONFLICT DO NOTHING;
INSERT INTO leads (id, clinic_id, name, phone, email, status, phase, temperature, source_type, lead_score, is_active, birth_date, idade, data, wa_opt_in, created_at, updated_at)
VALUES (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'Fernanda Becker Arcaldi', '5544999741344', 'nandabecker@gmail.com', 'active', 'paciente', 'warm', 'import', 0, true, '1978-09-30', 47, '{"sexo":"Feminino","estado_civil":"Casado","profissao":"Jornalista / orientadora parental","endereco":"Rua Professor Giampero Monacci, 60, Jardim Novo Horizonte, Maringá/PR, 87010-090","cpf":"030.980.269-52"}'::jsonb, true, now(), now())
ON CONFLICT DO NOTHING;
INSERT INTO leads (id, clinic_id, name, phone, email, status, phase, temperature, source_type, lead_score, is_active, birth_date, idade, data, wa_opt_in, created_at, updated_at)
VALUES (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'Fernanda Belicanta Borghi', '5544999640067', '', 'active', 'paciente', 'warm', 'import', 0, true, '1982-10-17', 43, '{"sexo":"Feminino","estado_civil":"Casado","profissao":"Professora","endereco":"Avenida Cerro Azul, 1200, Jardim Novo Horizonte, Maringá/PR, 87010-055","cpf":"040.316.939-90"}'::jsonb, true, now(), now())
ON CONFLICT DO NOTHING;
INSERT INTO leads (id, clinic_id, name, phone, email, status, phase, temperature, source_type, lead_score, is_active, birth_date, idade, data, wa_opt_in, created_at, updated_at)
VALUES (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'Fernanda Malavazi', '5544999069021', 'fermalavazi12@hotmail.com', 'active', 'paciente', 'warm', 'import', 0, true, '2001-08-12', 24, '{"sexo":"Feminino","estado_civil":"Solteiro","profissao":"Psicóloga","endereco":"Avenida Cerro Azul 2649, 2649, Casa G44, Jardim Novo Horizonte, Maringá/PR, 87010-910","cpf":"073.606.209-29","origem":"mormaii"}'::jsonb, true, now(), now())
ON CONFLICT DO NOTHING;
INSERT INTO leads (id, clinic_id, name, phone, email, status, phase, temperature, source_type, lead_score, is_active, birth_date, idade, data, wa_opt_in, created_at, updated_at)
VALUES (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'Fernando Oliveira de Paula', '5544999039614', '', 'active', 'paciente', 'warm', 'import', 0, true, '1988-09-17', 37, '{"estado_civil":"Solteiro","profissao":"Advogado","endereco":"Rua Quebec, 40, Jardim Canadá, Maringá/PR, 87080-560","cpf":"069.877.359-48"}'::jsonb, true, now(), now())
ON CONFLICT DO NOTHING;
INSERT INTO leads (id, clinic_id, name, phone, email, status, phase, temperature, source_type, lead_score, is_active, birth_date, idade, data, wa_opt_in, created_at, updated_at)
VALUES (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'Flavia Antunes', '5544988126005', 'flanti@bol.com.br', 'active', 'paciente', 'warm', 'import', 0, true, '1980-02-05', 46, '{"sexo":"Feminino","estado_civil":"Casado","profissao":"Enfermeira","endereco":"Travessa Marialva, 15, Zona 08, Maringá/PR, 87050-580","cpf":"007.278.619-13"}'::jsonb, true, now(), now())
ON CONFLICT DO NOTHING;
INSERT INTO leads (id, clinic_id, name, phone, email, status, phase, temperature, source_type, lead_score, is_active, birth_date, idade, data, wa_opt_in, created_at, updated_at)
VALUES (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'Flávia Regina Sobral', '5544999948933', 'sobralcomunicacaosa@gmail.com', 'active', 'paciente', 'warm', 'import', 0, true, '1992-03-24', 34, '{"sexo":"Feminino","estado_civil":"Divorciado","profissao":"Comunicóloga","endereco":"Rua Adolfo Alves Ferreira, 393, 203, Vila Marumby, Maringá/PR, 87005-250","cpf":"038.410.839-35"}'::jsonb, true, now(), now())
ON CONFLICT DO NOTHING;
INSERT INTO leads (id, clinic_id, name, phone, email, status, phase, temperature, source_type, lead_score, is_active, birth_date, idade, data, wa_opt_in, created_at, updated_at)
VALUES (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'Franciele Volpato', '5544999160117', '', 'active', 'paciente', 'warm', 'import', 0, true, NULL, NULL, '{"sexo":"Feminino"}'::jsonb, true, now(), now())
ON CONFLICT DO NOTHING;
INSERT INTO leads (id, clinic_id, name, phone, email, status, phase, temperature, source_type, lead_score, is_active, birth_date, idade, data, wa_opt_in, created_at, updated_at)
VALUES (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'Gabriela Cavicchioli', '5544988154404', '', 'active', 'paciente', 'warm', 'import', 0, true, '1999-03-25', 27, '{"sexo":"Feminino","estado_civil":"Casado","profissao":"Psicologa","endereco":"Avenida Mauá, 2720, Zona 03, Maringá/PR, 87050-020","cpf":"076.958.429-23"}'::jsonb, true, now(), now())
ON CONFLICT DO NOTHING;
INSERT INTO leads (id, clinic_id, name, phone, email, status, phase, temperature, source_type, lead_score, is_active, birth_date, idade, data, wa_opt_in, created_at, updated_at)
VALUES (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'Gabriela Rech', '5554996308634', '', 'active', 'paciente', 'warm', 'import', 0, true, '2006-12-16', 19, '{"sexo":"Feminino","estado_civil":"Solteiro","profissao":"Estudante","endereco":"Leonardo Noskoski, 590, Consolador, Getúlio Vargas/RS, 99900-000","cpf":"059.921.341-82"}'::jsonb, true, now(), now())
ON CONFLICT DO NOTHING;
INSERT INTO leads (id, clinic_id, name, phone, email, status, phase, temperature, source_type, lead_score, is_active, birth_date, idade, data, wa_opt_in, created_at, updated_at)
VALUES (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'Gedina Pereira', '5565999968777', 'gedinagmp@gmail.com', 'active', 'paciente', 'warm', 'import', 0, true, '1968-11-17', 57, '{"sexo":"Feminino","estado_civil":"Divorciado","profissao":"Agronoma","endereco":"Rua das Sucupiras, 393, Apto 203 ED. Porto Seguro, Bela Vista, Nova Mutum/MT, 78452-061","cpf":"590.998.609-00","origem":"Indicação"}'::jsonb, true, now(), now())
ON CONFLICT DO NOTHING;
INSERT INTO leads (id, clinic_id, name, phone, email, status, phase, temperature, source_type, lead_score, is_active, birth_date, idade, data, wa_opt_in, created_at, updated_at)
VALUES (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'Gesiane Ferreira Leal', '5544991059975', 'gesianeleal@gmail.com', 'active', 'paciente', 'warm', 'import', 0, true, '1983-03-02', 43, '{"sexo":"Feminino","estado_civil":"Casado","profissao":"Engenheiro de Software","endereco":"Rua Monsenhor Tanaka, 563, Vila Emília, Maringá/PR, 87010-255","cpf":"034.552.949-95","origem":"Mormaii"}'::jsonb, true, now(), now())
ON CONFLICT DO NOTHING;
INSERT INTO leads (id, clinic_id, name, phone, email, status, phase, temperature, source_type, lead_score, is_active, birth_date, idade, data, wa_opt_in, created_at, updated_at)
VALUES (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'Giely Fernandes Barcelos', '5543999143109', 'gielyfernandes@gmail.com', 'active', 'paciente', 'warm', 'import', 0, true, '1977-04-02', 49, '{"sexo":"Feminino","estado_civil":"Casado","profissao":"Pedagoga","endereco":"Prefeito sadao inaoka, 351, Cond hayashi, casa B13, Jd industrial, Maringá/PR, 87645-334","cpf":"021.450.749-10"}'::jsonb, true, now(), now())
ON CONFLICT DO NOTHING;
INSERT INTO leads (id, clinic_id, name, phone, email, status, phase, temperature, source_type, lead_score, is_active, birth_date, idade, data, wa_opt_in, created_at, updated_at)
VALUES (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'Gilmar Ramalho', '5544999910117', '', 'active', 'paciente', 'warm', 'import', 0, true, '1960-05-15', 65, '{"sexo":"Masculino","estado_civil":"Casado","profissao":"Consultor","endereco":"Rua Neo Alves Martins, 2398, Apto 2002, Zona 01, Maringá/PR, 87013-060","cpf":"387.236.899-00"}'::jsonb, true, now(), now())
ON CONFLICT DO NOTHING;
INSERT INTO leads (id, clinic_id, name, phone, email, status, phase, temperature, source_type, lead_score, is_active, birth_date, idade, data, wa_opt_in, created_at, updated_at)
VALUES (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'Gisele Almeida', '5544998224159', '', 'active', 'paciente', 'warm', 'import', 0, true, '1986-08-03', 39, '{"sexo":"Feminino","estado_civil":"Casado","profissao":"Administradora","endereco":"Rua Pioneiro João Custódio Pereira, 1019, Casa B, Parque Tarumã, Maringá/PR, 87053-590","cpf":"053.657.549-56"}'::jsonb, true, now(), now())
ON CONFLICT DO NOTHING;
INSERT INTO leads (id, clinic_id, name, phone, email, status, phase, temperature, source_type, lead_score, is_active, birth_date, idade, data, wa_opt_in, created_at, updated_at)
VALUES (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'Gisele Lino Gutierrez', '5544999307220', 'gisaassess@gmail.com', 'active', 'paciente', 'warm', 'import', 0, true, '1981-12-25', 44, '{"sexo":"Feminino","estado_civil":"Casado","profissao":"Assessora de Eventos","endereco":"Rua Nardina Rodrigues Johansen número 405, 405.        AP 601 BL 02, AP 601 bloco 02, Loteamento Malbec Vila Bosque, Maringá/PR, 87005-002","cpf":"033.445.299-60"}'::jsonb, true, now(), now())
ON CONFLICT DO NOTHING;
INSERT INTO leads (id, clinic_id, name, phone, email, status, phase, temperature, source_type, lead_score, is_active, birth_date, idade, data, wa_opt_in, created_at, updated_at)
VALUES (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'Giseli Fabiana Aparecida Lopes', '5544998083405', 'giselilopes3405@gmail.com', 'active', 'paciente', 'warm', 'import', 0, true, '1980-12-30', 45, '{"sexo":"Feminino","estado_civil":"Solteiro","profissao":"Analista","cpf":"030.360.219-81","origem":"Cazza Flor"}'::jsonb, true, now(), now())
ON CONFLICT DO NOTHING;
INSERT INTO leads (id, clinic_id, name, phone, email, status, phase, temperature, source_type, lead_score, is_active, birth_date, idade, data, wa_opt_in, created_at, updated_at)
VALUES (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'Gislaine Molina', '5544999260089', '', 'active', 'paciente', 'warm', 'import', 0, true, '1975-06-22', 50, '{"sexo":"Feminino","estado_civil":"Casado","profissao":"Empresária","endereco":"Avenida Guedner, 830, Casa 96, Zona 08, Maringá/PR, 87050-390","cpf":"026.858.739-61"}'::jsonb, true, now(), now())
ON CONFLICT DO NOTHING;
INSERT INTO leads (id, clinic_id, name, phone, email, status, phase, temperature, source_type, lead_score, is_active, birth_date, idade, data, wa_opt_in, created_at, updated_at)
VALUES (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'Gislaine Rebeca Penga', '5544991473026', 'gislainepenga@hotmail.com', 'active', 'paciente', 'warm', 'import', 0, true, '1982-02-28', 44, '{"sexo":"Feminino","estado_civil":"Casado","profissao":"Do Lar","endereco":"Rua Santa Catarina, 1097, Chácara, Chacaras Aeroporto, Sarandi/PR, 87115-022","cpf":"038.467.889-02","origem":"Mormaii"}'::jsonb, true, now(), now())
ON CONFLICT DO NOTHING;
INSERT INTO leads (id, clinic_id, name, phone, email, status, phase, temperature, source_type, lead_score, is_active, birth_date, idade, data, wa_opt_in, created_at, updated_at)
VALUES (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'GISLAINE RODRIGUES', '5544988436774', 'margabani@hotmail.com', 'active', 'paciente', 'warm', 'import', 0, true, '1980-11-19', 45, '{"sexo":"Feminino","estado_civil":"Casado","profissao":"Cabeleireiro","endereco":"Rua Rui Barbosa, 9 88436774, Centro, São Jorge do Ivaí/PR, 87190-000","cpf":"032.850.899-38"}'::jsonb, true, now(), now())
ON CONFLICT DO NOTHING;
INSERT INTO leads (id, clinic_id, name, phone, email, status, phase, temperature, source_type, lead_score, is_active, birth_date, idade, data, wa_opt_in, created_at, updated_at)
VALUES (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'Glaciana Santana', '5544999157901', '', 'active', 'paciente', 'warm', 'import', 0, true, '1985-01-19', 41, '{"sexo":"Feminino","profissao":"Técnica de Enfermagem","endereco":"Rua Ângelo Favaretto, 202, Jardim Paris, Maringá/PR, 87083-420","cpf":"057.100.559-48"}'::jsonb, true, now(), now())
ON CONFLICT DO NOTHING;
INSERT INTO leads (id, clinic_id, name, phone, email, status, phase, temperature, source_type, lead_score, is_active, birth_date, idade, data, wa_opt_in, created_at, updated_at)
VALUES (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'GRAVAÇÃO', '5544998776543', '', 'active', 'paciente', 'warm', 'import', 0, true, NULL, NULL, '{"sexo":"Feminino"}'::jsonb, true, now(), now())
ON CONFLICT DO NOTHING;
INSERT INTO leads (id, clinic_id, name, phone, email, status, phase, temperature, source_type, lead_score, is_active, birth_date, idade, data, wa_opt_in, created_at, updated_at)
VALUES (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'Graziela Freitas da Silva Brandão', '5544997628140', 'espacograzybrandao@gmail.com', 'active', 'paciente', 'warm', 'import', 0, true, '1979-08-29', 46, '{"sexo":"Feminino","estado_civil":"Casado","profissao":"Instrutora de Pilates","endereco":"Avenida Riachuelo, 790, Zona 03, Maringá/PR, 87050-220","cpf":"298.912.188-99"}'::jsonb, true, now(), now())
ON CONFLICT DO NOTHING;
INSERT INTO leads (id, clinic_id, name, phone, email, status, phase, temperature, source_type, lead_score, is_active, birth_date, idade, data, wa_opt_in, created_at, updated_at)
VALUES (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'GUILHERME BOSELLI', '5544991126631', '', 'active', 'paciente', 'warm', 'import', 0, true, '1984-06-19', 41, '{"sexo":"Masculino","cpf":"050.188.519-61"}'::jsonb, true, now(), now())
ON CONFLICT DO NOTHING;
INSERT INTO leads (id, clinic_id, name, phone, email, status, phase, temperature, source_type, lead_score, is_active, birth_date, idade, data, wa_opt_in, created_at, updated_at)
VALUES (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'Gustavo Cantarutti Gonçalves', '5544991321907', '', 'active', 'paciente', 'warm', 'import', 0, true, NULL, NULL, '{"sexo":"Masculino","origem":"Filho Josi Cantarutti"}'::jsonb, true, now(), now())
ON CONFLICT DO NOTHING;
INSERT INTO leads (id, clinic_id, name, phone, email, status, phase, temperature, source_type, lead_score, is_active, birth_date, idade, data, wa_opt_in, created_at, updated_at)
VALUES (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'Hadara Secco Biazotto', '5544999356302', '', 'active', 'paciente', 'warm', 'import', 0, true, '1998-02-20', 28, '{"sexo":"Feminino","estado_civil":"Casado","profissao":"Dentista","endereco":"Avenida Doutor Gastão Vidigal, 2431, casa 26, Jardim Leblon, Maringá/PR, 87053-310","cpf":"085.061.769-30"}'::jsonb, true, now(), now())
ON CONFLICT DO NOTHING;
INSERT INTO leads (id, clinic_id, name, phone, email, status, phase, temperature, source_type, lead_score, is_active, birth_date, idade, data, wa_opt_in, created_at, updated_at)
VALUES (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'Hanaue do Nascimento Guimarães Pegoraro', '5543996614102', 'hanauenguimaraes@gmail.com', 'active', 'paciente', 'warm', 'import', 0, true, '2001-06-18', 24, '{"sexo":"Feminino","estado_civil":"Casado","profissao":"Farmacêutica","endereco":"Rua Moscados, 74, Apto 208, Vila Marumby, Maringá/PR, 87005-150","cpf":"128.280.139-28","origem":"mormaii"}'::jsonb, true, now(), now())
ON CONFLICT DO NOTHING;
INSERT INTO leads (id, clinic_id, name, phone, email, status, phase, temperature, source_type, lead_score, is_active, birth_date, idade, data, wa_opt_in, created_at, updated_at)
VALUES (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'Helena Renner Vizentin', '5544991290711', '', 'active', 'paciente', 'warm', 'import', 0, true, '2011-02-20', 15, '{"sexo":"Feminino","endereco":"Avenida XV de Novembro, 995, Zona 01, Maringá/PR, 87013-230","cpf":"053.543.161-97"}'::jsonb, true, now(), now())
ON CONFLICT DO NOTHING;
INSERT INTO leads (id, clinic_id, name, phone, email, status, phase, temperature, source_type, lead_score, is_active, birth_date, idade, data, wa_opt_in, created_at, updated_at)
VALUES (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'Heloisa Lopes Soares', '5544988428835', 'heloisalopessoares0@gmail.com', 'active', 'paciente', 'warm', 'import', 0, true, '2008-06-07', 17, '{"sexo":"Feminino","estado_civil":"Solteiro","profissao":"Maquiadora","endereco":"Rua Rui Barbosa, 994, São Jorge do Ivaí, São Jorge do Ivaí/PR, 87190-300","cpf":"114.292.779-20"}'::jsonb, true, now(), now())
ON CONFLICT DO NOTHING;
INSERT INTO leads (id, clinic_id, name, phone, email, status, phase, temperature, source_type, lead_score, is_active, birth_date, idade, data, wa_opt_in, created_at, updated_at)
VALUES (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'Inglith Teixeira', '5544999912889', 'ingli.teixeira@hotmail.com', 'active', 'paciente', 'warm', 'import', 0, true, '1989-03-29', 37, '{"sexo":"Feminino","estado_civil":"Casado","profissao":"Advogada","endereco":"Rua Botafogo, 1042, Apto 205, Vila Marumby, Maringá/PR, 87005-190","cpf":"065.424.789-73"}'::jsonb, true, now(), now())
ON CONFLICT DO NOTHING;
INSERT INTO leads (id, clinic_id, name, phone, email, status, phase, temperature, source_type, lead_score, is_active, birth_date, idade, data, wa_opt_in, created_at, updated_at)
VALUES (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'Ingrid Kiara Versari', '5544999108603', '', 'active', 'paciente', 'warm', 'import', 0, true, '1999-08-18', 26, '{"sexo":"Feminino","estado_civil":"Casado","profissao":"Arquiteta","endereco":"Avenida Mauá, 2720, Zona 03, Maringá/PR, 87050-020","cpf":"051.896.119-22"}'::jsonb, true, now(), now())
ON CONFLICT DO NOTHING;
INSERT INTO leads (id, clinic_id, name, phone, email, status, phase, temperature, source_type, lead_score, is_active, birth_date, idade, data, wa_opt_in, created_at, updated_at)
VALUES (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'Iohana Vargas de Oliveira', '5555991649101', 'iohanaoliveira@gmail.com', 'active', 'paciente', 'warm', 'import', 0, true, '1997-04-26', 28, '{"sexo":"Feminino","estado_civil":"Solteiro","profissao":"Dentista","endereco":"Rua Nardina Rodrigues Johansen, 405, Apt 704 bloco 1, Loteamento Malbec, Maringá/PR, 87005-002","cpf":"033.337.990-06"}'::jsonb, true, now(), now())
ON CONFLICT DO NOTHING;
INSERT INTO leads (id, clinic_id, name, phone, email, status, phase, temperature, source_type, lead_score, is_active, birth_date, idade, data, wa_opt_in, created_at, updated_at)
VALUES (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'Isabela Caldeira', '5544999244565', 'belaa-caldeira@hotmail.com', 'active', 'paciente', 'warm', 'import', 0, true, '2000-06-05', 25, '{"sexo":"Feminino","estado_civil":"Casado","profissao":"Influencer e criadora de conteúdo","endereco":"Rua Ernesto Mariucci, 442, 1202, Jardim Aclimação, Maringá/PR, 87050-800","cpf":"118.595.899-10","origem":"Instagram"}'::jsonb, true, now(), now())
ON CONFLICT DO NOTHING;
INSERT INTO leads (id, clinic_id, name, phone, email, status, phase, temperature, source_type, lead_score, is_active, birth_date, idade, data, wa_opt_in, created_at, updated_at)
VALUES (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'Isabella Fedrigo Bácaro', '5544998936999', '', 'active', 'paciente', 'warm', 'import', 0, true, '1997-08-19', 28, '{"sexo":"Feminino","estado_civil":"Casado","profissao":"Designer","endereco":"Rua Arthur Thomas, 830, Apto 1101, Zona 01, Maringá/PR, 87013-250","cpf":"114.198.019-37"}'::jsonb, true, now(), now())
ON CONFLICT DO NOTHING;
INSERT INTO leads (id, clinic_id, name, phone, email, status, phase, temperature, source_type, lead_score, is_active, birth_date, idade, data, wa_opt_in, created_at, updated_at)
VALUES (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'Isabella Valdevieso', '5544988017967', 'isabellavaldevieso@edu.unifil.br', 'active', 'paciente', 'warm', 'import', 0, true, '1991-01-05', 35, '{"sexo":"Feminino","estado_civil":"Casado","profissao":"Personal Trainer","endereco":"Rua Itapura, 570, Apto 1203, Zona 03, Maringá/PR, 87050-190","cpf":"085.987.089-84"}'::jsonb, true, now(), now())
ON CONFLICT DO NOTHING;
INSERT INTO leads (id, clinic_id, name, phone, email, status, phase, temperature, source_type, lead_score, is_active, birth_date, idade, data, wa_opt_in, created_at, updated_at)
VALUES (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'Isaura Lopes de Paula', '5544999920230', 'isauralpaula@yahoo.com.br', 'active', 'paciente', 'warm', 'import', 0, true, '1967-11-30', 58, '{"sexo":"Feminino","estado_civil":"Casado","profissao":"Aposentada","endereco":"Antonio Manoel Filho, 345, Casa, Centro, Atalaia/PR, 87630-000","cpf":"644.656.919-04"}'::jsonb, true, now(), now())
ON CONFLICT DO NOTHING;
INSERT INTO leads (id, clinic_id, name, phone, email, status, phase, temperature, source_type, lead_score, is_active, birth_date, idade, data, wa_opt_in, created_at, updated_at)
VALUES (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'Ivana Dena', '5544997241171', 'ivanacavazin@hotmail.com', 'active', 'paciente', 'warm', 'import', 0, true, '1966-10-02', 59, '{"sexo":"Feminino","estado_civil":"Viuvo","profissao":"Vendas varejo","endereco":"Rua José Clemente, 136, Apt 101, Zona 07, Maringá/PR, 87020-070","cpf":"005.945.449-04","origem":"Marci"}'::jsonb, true, now(), now())
ON CONFLICT DO NOTHING;
INSERT INTO leads (id, clinic_id, name, phone, email, status, phase, temperature, source_type, lead_score, is_active, birth_date, idade, data, wa_opt_in, created_at, updated_at)
VALUES (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'Jackeline Hanelt', '5543996274815', 'jackehanelt@yahoo.com.br', 'active', 'paciente', 'warm', 'import', 0, true, '1983-07-29', 42, '{"sexo":"Feminino","estado_civil":"Casado","profissao":"Biomédica Ortomolecular","endereco":"Avenida Cerro Azul, 2438, Jardim Novo Horizonte, Maringá/PR, 87010-055","cpf":"043.799.899-17"}'::jsonb, true, now(), now())
ON CONFLICT DO NOTHING;
INSERT INTO leads (id, clinic_id, name, phone, email, status, phase, temperature, source_type, lead_score, is_active, birth_date, idade, data, wa_opt_in, created_at, updated_at)
VALUES (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'Jamille Nunes', '5544991774029', 'janunesd@gmail.com', 'active', 'paciente', 'warm', 'import', 0, true, '1999-01-19', 27, '{"sexo":"Feminino","estado_civil":"Solteiro","profissao":"Empresária","endereco":"Rua Assaí, 589, Chácara Paulista, Maringá/PR, 87005-110","cpf":"120.876.219-26"}'::jsonb, true, now(), now())
ON CONFLICT DO NOTHING;
INSERT INTO leads (id, clinic_id, name, phone, email, status, phase, temperature, source_type, lead_score, is_active, birth_date, idade, data, wa_opt_in, created_at, updated_at)
VALUES (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'Janaise Carla Amaral', '5544988675486', 'janayse_sj@hoymail.con', 'active', 'paciente', 'warm', 'import', 0, true, '1990-08-06', 35, '{"sexo":"Feminino","estado_civil":"Casado","profissao":"Gerente comercial","endereco":"Rua Antônio Francisco Salsa, 32, Casa A, Loteamento Sumaré, Maringá/PR, 87035-607","cpf":"078.856.679-28"}'::jsonb, true, now(), now())
ON CONFLICT DO NOTHING;
INSERT INTO leads (id, clinic_id, name, phone, email, status, phase, temperature, source_type, lead_score, is_active, birth_date, idade, data, wa_opt_in, created_at, updated_at)
VALUES (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'JAQUELINE LUZIA DE OLIVEIRA', '5544998415190', '', 'active', 'paciente', 'warm', 'import', 0, true, '1986-01-16', 40, '{"sexo":"Feminino","cpf":"049.464.239-40"}'::jsonb, true, now(), now())
ON CONFLICT DO NOTHING;
INSERT INTO leads (id, clinic_id, name, phone, email, status, phase, temperature, source_type, lead_score, is_active, birth_date, idade, data, wa_opt_in, created_at, updated_at)
VALUES (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'Jaqueline Oliveira', '5544984151902', '', 'active', 'paciente', 'warm', 'import', 0, true, NULL, NULL, '{"sexo":"Feminino","origem":"Noiva - Osvaldo"}'::jsonb, true, now(), now())
ON CONFLICT DO NOTHING;
INSERT INTO leads (id, clinic_id, name, phone, email, status, phase, temperature, source_type, lead_score, is_active, birth_date, idade, data, wa_opt_in, created_at, updated_at)
VALUES (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'Jean Drumond', '5544999272992', '', 'active', 'paciente', 'warm', 'import', 0, true, NULL, NULL, '{}'::jsonb, true, now(), now())
ON CONFLICT DO NOTHING;
INSERT INTO leads (id, clinic_id, name, phone, email, status, phase, temperature, source_type, lead_score, is_active, birth_date, idade, data, wa_opt_in, created_at, updated_at)
VALUES (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'Jéssica Euzébio', '5544984261349', '', 'active', 'paciente', 'warm', 'import', 0, true, '1988-03-14', 38, '{"sexo":"Feminino","estado_civil":"Casado","profissao":"Hair Stylist","endereco":"Rua Pioneiro Carlos João Basso, 153, Jardim Itália II, Maringá/PR, 87060-656","cpf":"377.131.198-50"}'::jsonb, true, now(), now())
ON CONFLICT DO NOTHING;
INSERT INTO leads (id, clinic_id, name, phone, email, status, phase, temperature, source_type, lead_score, is_active, birth_date, idade, data, wa_opt_in, created_at, updated_at)
VALUES (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'Jéssica Fernanda Soldan', '5544999247010', '', 'active', 'paciente', 'warm', 'import', 0, true, '1987-06-30', 38, '{"estado_civil":"Casado","profissao":"Assistente Social","endereco":"Rua Osvaldo Barizon, 450, Jardim São José, Nova Esperança/PR, 87600-000","cpf":"065.583.299-80"}'::jsonb, true, now(), now())
ON CONFLICT DO NOTHING;
INSERT INTO leads (id, clinic_id, name, phone, email, status, phase, temperature, source_type, lead_score, is_active, birth_date, idade, data, wa_opt_in, created_at, updated_at)
VALUES (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'Jéssica Longuinho Regilio de Souza', '5544988119301', '', 'active', 'paciente', 'warm', 'import', 0, true, '1994-09-02', 31, '{"sexo":"Feminino","estado_civil":"Casado","profissao":"Engenheira Civil","endereco":"Avenida Laguna, 733, Zona 03, Maringá/PR, 87050-260","cpf":"054.405.879-85"}'::jsonb, true, now(), now())
ON CONFLICT DO NOTHING;
INSERT INTO leads (id, clinic_id, name, phone, email, status, phase, temperature, source_type, lead_score, is_active, birth_date, idade, data, wa_opt_in, created_at, updated_at)
VALUES (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'Jéssica Ramos de Paula', '5544999978523', '', 'active', 'paciente', 'warm', 'import', 0, true, '1991-06-17', 34, '{"sexo":"Feminino","estado_civil":"Casado","profissao":"Empresária","endereco":"Avenida Brasil, 3092, Zona 01, Maringá/PR, 87013-000","cpf":"079.281.389-80"}'::jsonb, true, now(), now())
ON CONFLICT DO NOTHING;
INSERT INTO leads (id, clinic_id, name, phone, email, status, phase, temperature, source_type, lead_score, is_active, birth_date, idade, data, wa_opt_in, created_at, updated_at)
VALUES (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'Jessica Regina Poli de Oliveira', '5566999856673', 'jeheginapolli@gmail.com', 'active', 'paciente', 'warm', 'import', 0, true, '1991-05-31', 34, '{"sexo":"Feminino","estado_civil":"Divorciado","profissao":"Contadora","endereco":"Rua Santos Dumont, 1292, Zona 03, Maringá/PR, 87050-100","cpf":"044.891.831-51","origem":"Instagram"}'::jsonb, true, now(), now())
ON CONFLICT DO NOTHING;
INSERT INTO leads (id, clinic_id, name, phone, email, status, phase, temperature, source_type, lead_score, is_active, birth_date, idade, data, wa_opt_in, created_at, updated_at)
VALUES (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'Joana Maiolino', '5544999910065', 'italoejoanamaiolino@hotmail.com', 'active', 'paciente', 'warm', 'import', 0, true, '1962-11-04', 63, '{"sexo":"Feminino","estado_civil":"Casado","profissao":"Comerciante","endereco":"Rua Paranaguá, 490, Zona 07, Maringá/PR, 87020-190","cpf":"669.296.609-49","origem":"Mormaii"}'::jsonb, true, now(), now())
ON CONFLICT DO NOTHING;
INSERT INTO leads (id, clinic_id, name, phone, email, status, phase, temperature, source_type, lead_score, is_active, birth_date, idade, data, wa_opt_in, created_at, updated_at)
VALUES (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'João Molina', '5544998796100', '', 'active', 'paciente', 'warm', 'import', 0, true, '1999-07-24', 26, '{"sexo":"Masculino","estado_civil":"Solteiro","profissao":"Empresário","endereco":"Avenida Guedner, 830, Casa 96, Zona 08, Maringá/PR, 87050-390","cpf":"112.540.499-08"}'::jsonb, true, now(), now())
ON CONFLICT DO NOTHING;
INSERT INTO leads (id, clinic_id, name, phone, email, status, phase, temperature, source_type, lead_score, is_active, birth_date, idade, data, wa_opt_in, created_at, updated_at)
VALUES (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'Joicy Soldan', '5544998568157', 'joicy_soldan@hotmail.com', 'active', 'paciente', 'warm', 'import', 0, true, '1994-01-17', 32, '{"sexo":"Feminino","estado_civil":"Solteiro","profissao":"Secretária Executiva","endereco":"Rua Dona Francisca, 398, Centro Sul, Mandaguaçu/PR, 87160-146","cpf":"098.047.859-60"}'::jsonb, true, now(), now())
ON CONFLICT DO NOTHING;
INSERT INTO leads (id, clinic_id, name, phone, email, status, phase, temperature, source_type, lead_score, is_active, birth_date, idade, data, wa_opt_in, created_at, updated_at)
VALUES (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'Josceli Aparecida Marchiori Tijero', '5544998159275', 'jmarchioli@msn.com', 'active', 'paciente', 'warm', 'import', 0, true, '1980-05-28', 45, '{"sexo":"Feminino","estado_civil":"Casado","profissao":"Assistente social","cpf":"033.198.039-80"}'::jsonb, true, now(), now())
ON CONFLICT DO NOTHING;
INSERT INTO leads (id, clinic_id, name, phone, email, status, phase, temperature, source_type, lead_score, is_active, birth_date, idade, data, wa_opt_in, created_at, updated_at)
VALUES (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'José Cantarutti Neto', '5544999546194', '', 'active', 'paciente', 'warm', 'import', 0, true, NULL, NULL, '{"sexo":"Masculino","origem":"Pai Josi Cantarutti"}'::jsonb, true, now(), now())
ON CONFLICT DO NOTHING;
INSERT INTO leads (id, clinic_id, name, phone, email, status, phase, temperature, source_type, lead_score, is_active, birth_date, idade, data, wa_opt_in, created_at, updated_at)
VALUES (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'José Guilherme Molina', '5544999420260', '', 'active', 'paciente', 'warm', 'import', 0, true, NULL, NULL, '{"sexo":"Masculino","origem":"Indicação"}'::jsonb, true, now(), now())
ON CONFLICT DO NOTHING;
INSERT INTO leads (id, clinic_id, name, phone, email, status, phase, temperature, source_type, lead_score, is_active, birth_date, idade, data, wa_opt_in, created_at, updated_at)
VALUES (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'Josiane Cantarutti', '5543991336090', '', 'active', 'paciente', 'warm', 'import', 0, true, '1980-01-29', 46, '{"sexo":"Feminino","estado_civil":"Casado","profissao":"Empresária","endereco":"Avenida Laguna, 733, apto 1001, Zona 03, Maringá/PR, 87050-260","cpf":"006.828.849-28"}'::jsonb, true, now(), now())
ON CONFLICT DO NOTHING;
INSERT INTO leads (id, clinic_id, name, phone, email, status, phase, temperature, source_type, lead_score, is_active, birth_date, idade, data, wa_opt_in, created_at, updated_at)
VALUES (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'Josiane Lima Rodrigues', '5544991548202', 'joh.limalimao@hotmail.com', 'active', 'paciente', 'warm', 'import', 0, true, '1991-04-11', 34, '{"sexo":"Feminino","estado_civil":"Casado","profissao":"Administrativo Comercial","endereco":"Rua Pioneiro Alfredo José da Costa, 438, Apartamento 808 B, Jardim Alvorada, Maringá/PR, 87035-270","cpf":"082.203.179-57"}'::jsonb, true, now(), now())
ON CONFLICT DO NOTHING;
INSERT INTO leads (id, clinic_id, name, phone, email, status, phase, temperature, source_type, lead_score, is_active, birth_date, idade, data, wa_opt_in, created_at, updated_at)
VALUES (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'Josiane Sotti', '5544998651165', 'josianesotti@hotmail.con', 'active', 'paciente', 'warm', 'import', 0, true, '1977-06-20', 48, '{"sexo":"Feminino","estado_civil":"Divorciado","profissao":"Designer de unhas","endereco":"Rua dos Cravos, 105, Casa, Jardim Verão, Sarandi/PR, 87111-530","cpf":"021.060.259-71","origem":"Marci"}'::jsonb, true, now(), now())
ON CONFLICT DO NOTHING;
INSERT INTO leads (id, clinic_id, name, phone, email, status, phase, temperature, source_type, lead_score, is_active, birth_date, idade, data, wa_opt_in, created_at, updated_at)
VALUES (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'Julia Decanini de Paula Bello', '5544999071322', '', 'active', 'paciente', 'warm', 'import', 0, true, '1992-08-31', 33, '{"sexo":"Feminino","estado_civil":"Casado","profissao":"Administradora","endereco":"Avenida Laguna, 733, Zona 03, Maringá/PR, 87050-260","cpf":"080.620.799-02"}'::jsonb, true, now(), now())
ON CONFLICT DO NOTHING;
INSERT INTO leads (id, clinic_id, name, phone, email, status, phase, temperature, source_type, lead_score, is_active, birth_date, idade, data, wa_opt_in, created_at, updated_at)
VALUES (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'Juliana Bedin', '5544997334214', 'julibedin@hotmail.com', 'active', 'paciente', 'warm', 'import', 0, true, '1984-02-01', 42, '{"sexo":"Feminino","estado_civil":"Casado","profissao":"Do lar","endereco":"Avenida Advogado Horácio Raccanello Filho, 5350, Apto 206, Zona 07, Maringá/PR, 87020-035","cpf":"045.105.539-00"}'::jsonb, true, now(), now())
ON CONFLICT DO NOTHING;
INSERT INTO leads (id, clinic_id, name, phone, email, status, phase, temperature, source_type, lead_score, is_active, birth_date, idade, data, wa_opt_in, created_at, updated_at)
VALUES (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'Juliana Christina Luppi', '5543984463553', 'julianaclr@gmail.com', 'active', 'paciente', 'warm', 'import', 0, true, '1979-04-06', 46, '{"sexo":"Feminino","estado_civil":"Casado","profissao":"Arquiteta e urbanista","endereco":"Avenida Américo Belay, 1103, Casa 31 condominio jardim imperial, Parque das Grevíleas 3ª Parte, Maringá/PR, 87025-210","cpf":"032.651.249-75","origem":"Cazza Flor"}'::jsonb, true, now(), now())
ON CONFLICT DO NOTHING;
INSERT INTO leads (id, clinic_id, name, phone, email, status, phase, temperature, source_type, lead_score, is_active, birth_date, idade, data, wa_opt_in, created_at, updated_at)
VALUES (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'Juliana Fais', '5544991555001', '', 'active', 'paciente', 'warm', 'import', 0, true, NULL, NULL, '{"cpf":"039.897.759-36"}'::jsonb, true, now(), now())
ON CONFLICT DO NOTHING;
INSERT INTO leads (id, clinic_id, name, phone, email, status, phase, temperature, source_type, lead_score, is_active, birth_date, idade, data, wa_opt_in, created_at, updated_at)
VALUES (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'Juliana Oliveira Tonassi Silveira', '5544997572421', '', 'active', 'paciente', 'warm', 'import', 0, true, '1984-10-01', 41, '{"sexo":"Feminino","estado_civil":"Casado","profissao":"Assistente administrativo","endereco":"Rua Francisco Dias de Aro, 1632, Casa, Jardim Paulista III, Maringá/PR, 87047-570","cpf":"042.472.369-70"}'::jsonb, true, now(), now())
ON CONFLICT DO NOTHING;
INSERT INTO leads (id, clinic_id, name, phone, email, status, phase, temperature, source_type, lead_score, is_active, birth_date, idade, data, wa_opt_in, created_at, updated_at)
VALUES (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'Juliane Delefrate Moradas Alves', '5544991419001', '', 'active', 'paciente', 'warm', 'import', 0, true, '1978-12-04', 47, '{"sexo":"Feminino","estado_civil":"Casado","profissao":"Dentista","endereco":"Rua Arthur Thomas, 910, apto 2201, Zona 01, Maringá/PR, 87013-250","cpf":"022.922.009-61"}'::jsonb, true, now(), now())
ON CONFLICT DO NOTHING;
INSERT INTO leads (id, clinic_id, name, phone, email, status, phase, temperature, source_type, lead_score, is_active, birth_date, idade, data, wa_opt_in, created_at, updated_at)
VALUES (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'Kalliana Ferreira dos Santos', '5544999891709', '', 'active', 'paciente', 'warm', 'import', 0, true, '1995-03-17', 31, '{"sexo":"Feminino","estado_civil":"Casado","profissao":"Empresária","endereco":"Rua Euclides da Cunha, 701, Jardim Panorama, Sarandi/PR, 87113-130","cpf":"086.773.569-40"}'::jsonb, true, now(), now())
ON CONFLICT DO NOTHING;
INSERT INTO leads (id, clinic_id, name, phone, email, status, phase, temperature, source_type, lead_score, is_active, birth_date, idade, data, wa_opt_in, created_at, updated_at)
VALUES (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'Kalliny', '5544984076398', 'kallinyandressa@hotmail.com', 'active', 'paciente', 'warm', 'import', 0, true, '1993-03-05', 33, '{"sexo":"Feminino","estado_civil":"Casado","profissao":"Advogada","endereco":"Rua Pioneiro José Tel, 1299, Jardim Guaporé, Maringá/PR, 87060-240","cpf":"064.493.929-08"}'::jsonb, true, now(), now())
ON CONFLICT DO NOTHING;
INSERT INTO leads (id, clinic_id, name, phone, email, status, phase, temperature, source_type, lead_score, is_active, birth_date, idade, data, wa_opt_in, created_at, updated_at)
VALUES (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'Kamilly Diana De Oliveira', '5547997900718', 'kamillydiana@gmail.com', 'active', 'paciente', 'warm', 'import', 0, true, '2005-05-09', 20, '{"sexo":"Feminino","estado_civil":"Solteiro","profissao":"Estudante","endereco":"Rua Pioneira Norvina Maria Gonçalves, 381, Jardim Império do Sol, Maringá/PR, 87083-530","cpf":"119.101.969-16"}'::jsonb, true, now(), now())
ON CONFLICT DO NOTHING;
INSERT INTO leads (id, clinic_id, name, phone, email, status, phase, temperature, source_type, lead_score, is_active, birth_date, idade, data, wa_opt_in, created_at, updated_at)
VALUES (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'Karin Hortmann', '5544999417816', 'karin_hortmann@hotmail.com', 'active', 'paciente', 'warm', 'import', 0, true, '1990-10-23', 35, '{"sexo":"Feminino","estado_civil":"Casado","profissao":"Personal trainer","endereco":"Rua Pioneiro Antônio Correa Britto, 89, Jardim Paris III, Maringá/PR, 87083-480","cpf":"070.784.229-88","origem":"Mari Tivo"}'::jsonb, true, now(), now())
ON CONFLICT DO NOTHING;
INSERT INTO leads (id, clinic_id, name, phone, email, status, phase, temperature, source_type, lead_score, is_active, birth_date, idade, data, wa_opt_in, created_at, updated_at)
VALUES (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'Kelly Cristina Endo', '5544999216832', 'kkce79@gmail.com', 'active', 'paciente', 'warm', 'import', 0, true, '1979-06-08', 46, '{"sexo":"Feminino","estado_civil":"Casado","profissao":"Secretaria","endereco":"Rua Pioneiro Antonio Pietro Bon, 166, Casa, Jardim Tóquio, Maringá/PR, 87025-801","cpf":"297.680.908-98"}'::jsonb, true, now(), now())
ON CONFLICT DO NOTHING;
INSERT INTO leads (id, clinic_id, name, phone, email, status, phase, temperature, source_type, lead_score, is_active, birth_date, idade, data, wa_opt_in, created_at, updated_at)
VALUES (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'Kelly Regina Lopes', '5544984288986', '', 'active', 'paciente', 'warm', 'import', 0, true, '1978-09-24', 47, '{"sexo":"Feminino","cpf":"060.093.859-03"}'::jsonb, true, now(), now())
ON CONFLICT DO NOTHING;
INSERT INTO leads (id, clinic_id, name, phone, email, status, phase, temperature, source_type, lead_score, is_active, birth_date, idade, data, wa_opt_in, created_at, updated_at)
VALUES (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'Kelsilene Sversutti', '5544991452195', 'kguastala@yahoo.com.br', 'active', 'paciente', 'warm', 'import', 0, true, '1973-10-10', 52, '{"sexo":"Feminino","estado_civil":"Casado","profissao":"Bancaria","endereco":"Avenida Doutor Luiz Teixeira Mendes, 495, Ap 102, Zona 04, Maringá/PR, 87015-000","cpf":"018.487.619-29","origem":"mormaii"}'::jsonb, true, now(), now())
ON CONFLICT DO NOTHING;
INSERT INTO leads (id, clinic_id, name, phone, email, status, phase, temperature, source_type, lead_score, is_active, birth_date, idade, data, wa_opt_in, created_at, updated_at)
VALUES (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'Lais Teles', '5544998541435', 'laisyteles@gmail.com', 'active', 'paciente', 'warm', 'import', 0, true, '1994-03-29', 32, '{"sexo":"Feminino","estado_civil":"Casado","profissao":"Maquiadora","endereco":"Avenida Carlos Correa Borges, 1669, Conjunto Habitacional Inocente Vila Nova Júnior, Maringá/PR, 87060-000","cpf":"089.549.949-54"}'::jsonb, true, now(), now())
ON CONFLICT DO NOTHING;
INSERT INTO leads (id, clinic_id, name, phone, email, status, phase, temperature, source_type, lead_score, is_active, birth_date, idade, data, wa_opt_in, created_at, updated_at)
VALUES (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'Larissa Boer', '5544999190269', '', 'active', 'paciente', 'warm', 'import', 0, true, '1999-05-27', 26, '{"sexo":"Feminino","estado_civil":"Casado","profissao":"Marketing","endereco":"Rua Pioneira Maria Aparecida Araújo de Siqueira, 281, Loteamento Sumaré, Maringá/PR, 87035-614","cpf":"104.073.209-70"}'::jsonb, true, now(), now())
ON CONFLICT DO NOTHING;
INSERT INTO leads (id, clinic_id, name, phone, email, status, phase, temperature, source_type, lead_score, is_active, birth_date, idade, data, wa_opt_in, created_at, updated_at)
VALUES (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'Larissa Tonietti', '5544991173474', 'larissa@tradetechnology.com.br', 'active', 'paciente', 'warm', 'import', 0, true, '1990-11-25', 35, '{"sexo":"Feminino","estado_civil":"Casado","profissao":"Empresaria","endereco":"Rua Pioneiro Waldemar Gomes da Cunha, 269, Jardim San Remo, Maringá/PR, 87060-260","cpf":"076.078.249-01","origem":"Dom Novilho"}'::jsonb, true, now(), now())
ON CONFLICT DO NOTHING;
INSERT INTO leads (id, clinic_id, name, phone, email, status, phase, temperature, source_type, lead_score, is_active, birth_date, idade, data, wa_opt_in, created_at, updated_at)
VALUES (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'LAVINIA BERALDO', '5544999999999', '', 'active', 'paciente', 'warm', 'import', 0, true, '2010-10-12', 15, '{"sexo":"Feminino"}'::jsonb, true, now(), now())
ON CONFLICT DO NOTHING;
INSERT INTO leads (id, clinic_id, name, phone, email, status, phase, temperature, source_type, lead_score, is_active, birth_date, idade, data, wa_opt_in, created_at, updated_at)
VALUES (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'Leily Bertoncini Merlos', '5544999180338', '', 'active', 'paciente', 'warm', 'import', 0, true, '1988-11-24', 37, '{"sexo":"Feminino","estado_civil":"Casado","profissao":"Nutricionista","endereco":"Avenida Américo Belay, 1103, casa 59, Jardim Imperial, Maringá/PR, 87023-000","cpf":"070.105.529-40"}'::jsonb, true, now(), now())
ON CONFLICT DO NOTHING;
INSERT INTO leads (id, clinic_id, name, phone, email, status, phase, temperature, source_type, lead_score, is_active, birth_date, idade, data, wa_opt_in, created_at, updated_at)
VALUES (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'Leonilda Maria Rossete Biaggi', '5544999181362', '', 'active', 'paciente', 'warm', 'import', 0, true, '1964-08-12', 61, '{"sexo":"Feminino","estado_civil":"Casado","profissao":"Influencer","endereco":"Rua Pioneiro Domingos Salgueiro, 1725, casa 22, Jardim Guaporé, Maringá/PR, 87060-230","cpf":"511.986.149-00"}'::jsonb, true, now(), now())
ON CONFLICT DO NOTHING;
INSERT INTO leads (id, clinic_id, name, phone, email, status, phase, temperature, source_type, lead_score, is_active, birth_date, idade, data, wa_opt_in, created_at, updated_at)
VALUES (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'Ligia Preis', '5544999311204', '', 'active', 'paciente', 'warm', 'import', 0, true, '1995-08-28', 30, '{"sexo":"Feminino","estado_civil":"Casado","profissao":"Engenheira Civil","endereco":"Rua Mem de Sá, 227, Zona 02, Maringá/PR, 87010-370","cpf":"063.837.659-90"}'::jsonb, true, now(), now())
ON CONFLICT DO NOTHING;
INSERT INTO leads (id, clinic_id, name, phone, email, status, phase, temperature, source_type, lead_score, is_active, birth_date, idade, data, wa_opt_in, created_at, updated_at)
VALUES (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'Linéia Eva Bengozi Gonçalves', '5544984531812', 'lineiabengozi@hotmail.com', 'active', 'paciente', 'warm', 'import', 0, true, '1983-05-27', 42, '{"sexo":"Feminino","estado_civil":"Casado","profissao":"Enfermeira","endereco":"Avenida Laguna, 733, Ap 2401, Zona 03, Maringá/PR, 87050-260","cpf":"052.193.179-70","origem":"Josi Cantarutti"}'::jsonb, true, now(), now())
ON CONFLICT DO NOTHING;
INSERT INTO leads (id, clinic_id, name, phone, email, status, phase, temperature, source_type, lead_score, is_active, birth_date, idade, data, wa_opt_in, created_at, updated_at)
VALUES (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'LORENA BERALDO', '5544987653904', '', 'active', 'paciente', 'warm', 'import', 0, true, '2013-04-18', 12, '{"sexo":"Feminino","cpf":"155.992.929-40"}'::jsonb, true, now(), now())
ON CONFLICT DO NOTHING;
INSERT INTO leads (id, clinic_id, name, phone, email, status, phase, temperature, source_type, lead_score, is_active, birth_date, idade, data, wa_opt_in, created_at, updated_at)
VALUES (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'Lorena Maia', '5544999107090', 'loremaaia520@gmail.com', 'active', 'paciente', 'warm', 'import', 0, true, '2001-05-07', 24, '{"sexo":"Feminino","estado_civil":"Solteiro","profissao":"Estudante","endereco":"Rua Angra, 195, Casa verde, Parque das Grevíleas 3ª Parte, Maringá/PR, 87025-240","cpf":"105.319.219-30"}'::jsonb, true, now(), now())
ON CONFLICT DO NOTHING;
INSERT INTO leads (id, clinic_id, name, phone, email, status, phase, temperature, source_type, lead_score, is_active, birth_date, idade, data, wa_opt_in, created_at, updated_at)
VALUES (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'Lorrayne Boer', '5544998603338', '', 'active', 'paciente', 'warm', 'import', 0, true, '1994-08-31', 31, '{"sexo":"Feminino","estado_civil":"Casado","profissao":"Empresária","endereco":"Rua Rodolfo Cremm, 11604, Jardim Andrade, Maringá/PR, 87035-480","cpf":"081.312.899-40"}'::jsonb, true, now(), now())
ON CONFLICT DO NOTHING;
INSERT INTO leads (id, clinic_id, name, phone, email, status, phase, temperature, source_type, lead_score, is_active, birth_date, idade, data, wa_opt_in, created_at, updated_at)
VALUES (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'Luana Ficisnski Saviani', '5544998127579', '', 'active', 'paciente', 'warm', 'import', 0, true, NULL, NULL, '{"sexo":"Feminino","profissao":"Influencer","origem":"Instagram"}'::jsonb, true, now(), now())
ON CONFLICT DO NOTHING;
INSERT INTO leads (id, clinic_id, name, phone, email, status, phase, temperature, source_type, lead_score, is_active, birth_date, idade, data, wa_opt_in, created_at, updated_at)
VALUES (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'LUANA FROEMMING', '5544998077617', '', 'active', 'paciente', 'warm', 'import', 0, true, NULL, NULL, '{}'::jsonb, true, now(), now())
ON CONFLICT DO NOTHING;
INSERT INTO leads (id, clinic_id, name, phone, email, status, phase, temperature, source_type, lead_score, is_active, birth_date, idade, data, wa_opt_in, created_at, updated_at)
VALUES (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'Luana Loren Tivo', '5544991059104', '', 'active', 'paciente', 'warm', 'import', 0, true, '2000-12-29', 25, '{"sexo":"Feminino","estado_civil":"Casado","profissao":"Empresária","endereco":"Avenida Itororó, 1388, apto 106, Zona 02, Maringá/PR, 87010-460","cpf":"077.387.049-00"}'::jsonb, true, now(), now())
ON CONFLICT DO NOTHING;
INSERT INTO leads (id, clinic_id, name, phone, email, status, phase, temperature, source_type, lead_score, is_active, birth_date, idade, data, wa_opt_in, created_at, updated_at)
VALUES (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'LUCIA', '5544999904844', '', 'active', 'paciente', 'warm', 'import', 0, true, NULL, NULL, '{"sexo":"Feminino"}'::jsonb, true, now(), now())
ON CONFLICT DO NOTHING;
INSERT INTO leads (id, clinic_id, name, phone, email, status, phase, temperature, source_type, lead_score, is_active, birth_date, idade, data, wa_opt_in, created_at, updated_at)
VALUES (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'Lucia krause wachholz', '5544998147286', 'luciapsicologiaclinica@hotmail.com', 'active', 'paciente', 'warm', 'import', 0, true, '1989-11-28', 36, '{"sexo":"Feminino","estado_civil":"Casado","profissao":"Atendimento/Adm","endereco":"Rua Clemente Zequim, 158, Casa, Jardim Santa Rosa, Maringá/PR, 87060-027","cpf":"068.175.819-82"}'::jsonb, true, now(), now())
ON CONFLICT DO NOTHING;
INSERT INTO leads (id, clinic_id, name, phone, email, status, phase, temperature, source_type, lead_score, is_active, birth_date, idade, data, wa_opt_in, created_at, updated_at)
VALUES (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'Luciana Aparecida Nunes', '5544999735080', 'lublasques@hotmail.com', 'active', 'paciente', 'warm', 'import', 0, true, '1980-04-24', 45, '{"sexo":"Feminino","cpf":"006.535.809-08","origem":"Dr. Guilherme","tags_clinica":"Veu de Noiva + Anovator"}'::jsonb, true, now(), now())
ON CONFLICT DO NOTHING;
INSERT INTO leads (id, clinic_id, name, phone, email, status, phase, temperature, source_type, lead_score, is_active, birth_date, idade, data, wa_opt_in, created_at, updated_at)
VALUES (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'Luciana Correa André', '5544991165856', 'advocacialucianacorrea@gmail.com', 'active', 'paciente', 'warm', 'import', 0, true, '1974-02-26', 52, '{"sexo":"Feminino","estado_civil":"Divorciado","profissao":"Advogada","endereco":"Avenida Dom Manoel da Silveira d''Elboux, 1225, Zona 05, Maringá/PR, 87015-320","cpf":"930.301.509-68","origem":"Agência de Marketing"}'::jsonb, true, now(), now())
ON CONFLICT DO NOTHING;
INSERT INTO leads (id, clinic_id, name, phone, email, status, phase, temperature, source_type, lead_score, is_active, birth_date, idade, data, wa_opt_in, created_at, updated_at)
VALUES (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'Luciana Mendes', '5544997120786', 'cabinesoria@gmail.com', 'active', 'paciente', 'warm', 'import', 0, true, '1988-08-31', 37, '{"sexo":"Feminino","estado_civil":"Casado","profissao":"Micro empreendedor","endereco":"Rua Pioneira Ângela Bulla Calvi, 299, Jardim Novo Paulista, Maringá/PR, 87047-808","cpf":"126.957.807-37","origem":"mormaii"}'::jsonb, true, now(), now())
ON CONFLICT DO NOTHING;
INSERT INTO leads (id, clinic_id, name, phone, email, status, phase, temperature, source_type, lead_score, is_active, birth_date, idade, data, wa_opt_in, created_at, updated_at)
VALUES (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'Luciane Pimentel', '5544998845551', '', 'active', 'paciente', 'warm', 'import', 0, true, NULL, NULL, '{"sexo":"Feminino","origem":"Mormaii","tags_clinica":"Veu de Noiva + Anovator"}'::jsonb, true, now(), now())
ON CONFLICT DO NOTHING;
INSERT INTO leads (id, clinic_id, name, phone, email, status, phase, temperature, source_type, lead_score, is_active, birth_date, idade, data, wa_opt_in, created_at, updated_at)
VALUES (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'Luis Carlos Garcia', '5544998301919', '', 'active', 'paciente', 'warm', 'import', 0, true, '1967-12-13', 58, '{"sexo":"Masculino","profissao":"Protético","endereco":"Rua José do Patrocínio, 291, Zona 04, Maringá/PR, 87014-160","cpf":"633.965.309-00"}'::jsonb, true, now(), now())
ON CONFLICT DO NOTHING;
INSERT INTO leads (id, clinic_id, name, phone, email, status, phase, temperature, source_type, lead_score, is_active, birth_date, idade, data, wa_opt_in, created_at, updated_at)
VALUES (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'Luiz Augusto dos Santos Juvêncio', '5544991783824', '', 'active', 'paciente', 'warm', 'import', 0, true, '1999-09-29', 26, '{"sexo":"Masculino","estado_civil":"Solteiro","profissao":"Advogado","endereco":"Rua Quebec, 40, Jardim Canadá, Maringá/PR, 87080-560","cpf":"112.710.259-14"}'::jsonb, true, now(), now())
ON CONFLICT DO NOTHING;
INSERT INTO leads (id, clinic_id, name, phone, email, status, phase, temperature, source_type, lead_score, is_active, birth_date, idade, data, wa_opt_in, created_at, updated_at)
VALUES (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'Luiz Fernando da Silva Santos', '5544998581395', '', 'active', 'paciente', 'warm', 'import', 0, true, '1997-12-26', 28, '{"sexo":"Masculino","estado_civil":"Casado","profissao":"Empresário","endereco":"Avenida Brasil, 3092, Zona 01, Maringá/PR, 87013-000","cpf":"110.843.029-50"}'::jsonb, true, now(), now())
ON CONFLICT DO NOTHING;
INSERT INTO leads (id, clinic_id, name, phone, email, status, phase, temperature, source_type, lead_score, is_active, birth_date, idade, data, wa_opt_in, created_at, updated_at)
VALUES (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'Luiz Fernando Neves', '5519982715360', 'luizfernandokc@gmail.com', 'active', 'paciente', 'warm', 'import', 0, true, '1982-02-15', 44, '{"sexo":"Masculino","estado_civil":"Solteiro","profissao":"Publicitário","endereco":"Rua Nardina Rodrigues Johansen, 392, Loteamento Malbec, Maringá/PR, 87005-002","cpf":"303.358.298-21"}'::jsonb, true, now(), now())
ON CONFLICT DO NOTHING;
INSERT INTO leads (id, clinic_id, name, phone, email, status, phase, temperature, source_type, lead_score, is_active, birth_date, idade, data, wa_opt_in, created_at, updated_at)
VALUES (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'Luiz Henrique Nazeré Bennetti', '5544998527577', '', 'active', 'paciente', 'warm', 'import', 0, true, '1998-06-04', 27, '{"sexo":"Masculino","estado_civil":"Solteiro","profissao":"Corretor de Imóveis","endereco":"Avenida Doutor Mário Clapier Urbinati, 292, Zona 7, Maringá/PR, 87020-260","cpf":"119.558.529-28"}'::jsonb, true, now(), now())
ON CONFLICT DO NOTHING;
INSERT INTO leads (id, clinic_id, name, phone, email, status, phase, temperature, source_type, lead_score, is_active, birth_date, idade, data, wa_opt_in, created_at, updated_at)
VALUES (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'Maíra Poppi', '5543999538363', 'mairapoppi05@gmail.com', 'active', 'paciente', 'warm', 'import', 0, true, '1992-02-11', 34, '{"sexo":"Feminino","estado_civil":"Solteiro","profissao":"Assistente Financeira","endereco":"Rua Botafogo, 409, Vila Marumby, Maringá/PR, 87005-190","cpf":"084.020.149-41"}'::jsonb, true, now(), now())
ON CONFLICT DO NOTHING;
INSERT INTO leads (id, clinic_id, name, phone, email, status, phase, temperature, source_type, lead_score, is_active, birth_date, idade, data, wa_opt_in, created_at, updated_at)
VALUES (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'Manoel Bravo', '5544998466633', '', 'active', 'paciente', 'warm', 'import', 0, true, NULL, NULL, '{"sexo":"Masculino","estado_civil":"Casado","profissao":"Comerciante","endereco":"Avenida Cerro Azul, 2649, Casa 12, Jardim Novo Horizonte, Maringá/PR, 87010-910","cpf":"578.055.989-91"}'::jsonb, true, now(), now())
ON CONFLICT DO NOTHING;
INSERT INTO leads (id, clinic_id, name, phone, email, status, phase, temperature, source_type, lead_score, is_active, birth_date, idade, data, wa_opt_in, created_at, updated_at)
VALUES (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'Mara Ligia', '5544999493003', 'maraligiacordeiro@hotmail.com', 'active', 'paciente', 'warm', 'import', 0, true, '1964-08-12', 61, '{"sexo":"Feminino","estado_civil":"Casado","profissao":"Comerciante","endereco":"Rua Pioneiro Múcio Rodrigues, 1123, Jardim Brasil, Maringá/PR, 87083-270","cpf":"539.448.529-15"}'::jsonb, true, now(), now())
ON CONFLICT DO NOTHING;
INSERT INTO leads (id, clinic_id, name, phone, email, status, phase, temperature, source_type, lead_score, is_active, birth_date, idade, data, wa_opt_in, created_at, updated_at)
VALUES (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'MARCELO CERON', '5544999361013', 'mc.basso@hotmail.com', 'active', 'paciente', 'warm', 'import', 0, true, '1986-11-11', 39, '{"sexo":"Masculino","estado_civil":"Divorciado","profissao":"Empresário","endereco":"Rua José Clemente, 836, Apto 1001, Zona 07, Maringá/PR, 87020-070","cpf":"057.470.759-00"}'::jsonb, true, now(), now())
ON CONFLICT DO NOTHING;
INSERT INTO leads (id, clinic_id, name, phone, email, status, phase, temperature, source_type, lead_score, is_active, birth_date, idade, data, wa_opt_in, created_at, updated_at)
VALUES (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'Marcia Aparecida de Almeida', '5544998098100', '', 'active', 'paciente', 'warm', 'import', 0, true, '1970-06-22', 55, '{"sexo":"Feminino","estado_civil":"Divorciado","profissao":"Cabelereira","endereco":"Rua Pioneiro Carlos João Basso, 1333, Jardim Itália II, Maringá/PR, 87060-656","cpf":"120.246.318-51"}'::jsonb, true, now(), now())
ON CONFLICT DO NOTHING;
INSERT INTO leads (id, clinic_id, name, phone, email, status, phase, temperature, source_type, lead_score, is_active, birth_date, idade, data, wa_opt_in, created_at, updated_at)
VALUES (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'Marcia Regina Montanholi', '5544999893659', '', 'active', 'paciente', 'warm', 'import', 0, true, '1976-03-24', 50, '{"sexo":"Feminino","estado_civil":"Casado","profissao":"Vendedora","endereco":"Rua Ivio Domingos Crestani, 432, Parque Hortência, Maringá/PR, 87075-705","cpf":"884.163.729-34"}'::jsonb, true, now(), now())
ON CONFLICT DO NOTHING;
INSERT INTO leads (id, clinic_id, name, phone, email, status, phase, temperature, source_type, lead_score, is_active, birth_date, idade, data, wa_opt_in, created_at, updated_at)
VALUES (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'Marciane Rech', '5544991681891', '', 'active', 'paciente', 'warm', 'import', 0, true, NULL, NULL, '{"sexo":"Feminino"}'::jsonb, true, now(), now())
ON CONFLICT DO NOTHING;
INSERT INTO leads (id, clinic_id, name, phone, email, status, phase, temperature, source_type, lead_score, is_active, birth_date, idade, data, wa_opt_in, created_at, updated_at)
VALUES (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'MARCOS PIAI', '5544998437195', 'marcosopiai@gmail.com', 'active', 'paciente', 'warm', 'import', 0, true, '1994-02-12', 32, '{"sexo":"Masculino","estado_civil":"Casado","profissao":"Assistente de vendas","cpf":"084.610.039-85"}'::jsonb, true, now(), now())
ON CONFLICT DO NOTHING;
INSERT INTO leads (id, clinic_id, name, phone, email, status, phase, temperature, source_type, lead_score, is_active, birth_date, idade, data, wa_opt_in, created_at, updated_at)
VALUES (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'Mari Miranda', '5581981902294', '', 'active', 'paciente', 'warm', 'import', 0, true, NULL, NULL, '{"sexo":"Feminino","origem":"Instagram"}'::jsonb, true, now(), now())
ON CONFLICT DO NOTHING;
INSERT INTO leads (id, clinic_id, name, phone, email, status, phase, temperature, source_type, lead_score, is_active, birth_date, idade, data, wa_opt_in, created_at, updated_at)
VALUES (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'Maria Aparecida da Silva Licurgo Santos', '5545998601421', 'maria.apsillva@24gmail.com', 'active', 'paciente', 'warm', 'import', 0, true, '1968-07-24', 57, '{"sexo":"Feminino","estado_civil":"Divorciado","profissao":"Professora","endereco":"Rua Botafogo, 1199, Casa, Vila Marumby, Maringá/PR, 87005-190","cpf":"773.558.069-04"}'::jsonb, true, now(), now())
ON CONFLICT DO NOTHING;
INSERT INTO leads (id, clinic_id, name, phone, email, status, phase, temperature, source_type, lead_score, is_active, birth_date, idade, data, wa_opt_in, created_at, updated_at)
VALUES (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'Maria Aparecida de Almeida dos Santos', '5544999049183', '', 'active', 'paciente', 'warm', 'import', 0, true, '1976-05-08', 49, '{"sexo":"Feminino","estado_civil":"Casado","profissao":"Do lar","endereco":"BR 376 km 200, Chácara Jordão, sitio, Mandaguari/PR, 86975-000","cpf":"059.166.449-65"}'::jsonb, true, now(), now())
ON CONFLICT DO NOTHING;
INSERT INTO leads (id, clinic_id, name, phone, email, status, phase, temperature, source_type, lead_score, is_active, birth_date, idade, data, wa_opt_in, created_at, updated_at)
VALUES (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'Maria Célia da silva carrasco', '5544984393453', '', 'active', 'paciente', 'warm', 'import', 0, true, '1987-04-06', 38, '{"sexo":"Feminino","cpf":"055.875.759-69","origem":"Indicação"}'::jsonb, true, now(), now())
ON CONFLICT DO NOTHING;
INSERT INTO leads (id, clinic_id, name, phone, email, status, phase, temperature, source_type, lead_score, is_active, birth_date, idade, data, wa_opt_in, created_at, updated_at)
VALUES (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'Maria Dolores Medina Golin', '5544999698095', 'maria.doloresmgt@hotmail.com', 'active', 'paciente', 'warm', 'import', 0, true, '1968-08-07', 57, '{"sexo":"Feminino","estado_civil":"Casado","profissao":"Comércio","endereco":"Avenida Prudente de Morais - lado ímpar, 265, 2004, Zona Armazém, Maringá/PR, 87020-121","cpf":"695.351.169-91"}'::jsonb, true, now(), now())
ON CONFLICT DO NOTHING;
INSERT INTO leads (id, clinic_id, name, phone, email, status, phase, temperature, source_type, lead_score, is_active, birth_date, idade, data, wa_opt_in, created_at, updated_at)
VALUES (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'Maria Eduarda Freire', '5544988243271', 'mariaeduardafreire11@outlook.com', 'active', 'paciente', 'warm', 'import', 0, true, '1999-11-11', 26, '{"sexo":"Feminino","estado_civil":"Solteiro","profissao":"Empresária","endereco":"Rua Fluminense, 2292, Apartamento 1402, Vila Marumby, Maringá/PR, 87005-200","cpf":"106.744.069-07","origem":"Indicação"}'::jsonb, true, now(), now())
ON CONFLICT DO NOTHING;
INSERT INTO leads (id, clinic_id, name, phone, email, status, phase, temperature, source_type, lead_score, is_active, birth_date, idade, data, wa_opt_in, created_at, updated_at)
VALUES (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'Maria Kátia de Oliveira Camelo de Moura', '5544999725905', '', 'active', 'paciente', 'warm', 'import', 0, true, '2026-03-09', NULL, '{"sexo":"Feminino","cpf":"028.187.174-42"}'::jsonb, true, now(), now())
ON CONFLICT DO NOTHING;
INSERT INTO leads (id, clinic_id, name, phone, email, status, phase, temperature, source_type, lead_score, is_active, birth_date, idade, data, wa_opt_in, created_at, updated_at)
VALUES (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'MARIA/ ENTREVISTA', '5511991360070', '', 'active', 'paciente', 'warm', 'import', 0, true, NULL, NULL, '{"sexo":"Feminino"}'::jsonb, true, now(), now())
ON CONFLICT DO NOTHING;
INSERT INTO leads (id, clinic_id, name, phone, email, status, phase, temperature, source_type, lead_score, is_active, birth_date, idade, data, wa_opt_in, created_at, updated_at)
VALUES (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'Mariana Felipe Galbiatti', '5544999124171', '', 'active', 'paciente', 'warm', 'import', 0, true, '1982-02-01', 44, '{"sexo":"Feminino","estado_civil":"Solteiro","profissao":"Psicóloga","endereco":"Rua Reliqueiro Domingos, 30, Jardim Imperial, Nova Esperança/PR, 87600-000","cpf":"036.468.339-20"}'::jsonb, true, now(), now())
ON CONFLICT DO NOTHING;
INSERT INTO leads (id, clinic_id, name, phone, email, status, phase, temperature, source_type, lead_score, is_active, birth_date, idade, data, wa_opt_in, created_at, updated_at)
VALUES (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'Mariana Tivo Silva Tolentino', '5544999320329', '', 'active', 'paciente', 'warm', 'import', 0, true, '1998-12-16', 27, '{"sexo":"Feminino","estado_civil":"Casado","profissao":"Influencer","endereco":"Avenida Alziro Zarur, 654, Apto 602B, Vila Vardelina, Maringá/PR, 87080-590","cpf":"099.188.029-36"}'::jsonb, true, now(), now())
ON CONFLICT DO NOTHING;
INSERT INTO leads (id, clinic_id, name, phone, email, status, phase, temperature, source_type, lead_score, is_active, birth_date, idade, data, wa_opt_in, created_at, updated_at)
VALUES (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'Marister Madureira', '5544999612559', 'isabel.s.m@hotmail.comi', 'active', 'paciente', 'warm', 'import', 0, true, '1979-09-10', 46, '{"sexo":"Feminino","estado_civil":"Casado","profissao":"Empresária","endereco":"Rua Carlos Augusto Tourinho, 219, Casa, Recanto Kakogawa, Maringá/PR, 87023-416","cpf":"052.341.899-02","origem":"Karin"}'::jsonb, true, now(), now())
ON CONFLICT DO NOTHING;
INSERT INTO leads (id, clinic_id, name, phone, email, status, phase, temperature, source_type, lead_score, is_active, birth_date, idade, data, wa_opt_in, created_at, updated_at)
VALUES (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'Mariza Dias Oliveira', '5544998105100', 'marizadiasoliveira@hotmail.com', 'active', 'paciente', 'warm', 'import', 0, true, '1964-06-05', 61, '{"sexo":"Feminino","estado_civil":"Casado","profissao":"Aposentada","endereco":"Rua Joaquim Nabuco, 163, Apto 1202, Zona 04, Maringá/PR, 87014-100","cpf":"511.856.449-20"}'::jsonb, true, now(), now())
ON CONFLICT DO NOTHING;
INSERT INTO leads (id, clinic_id, name, phone, email, status, phase, temperature, source_type, lead_score, is_active, birth_date, idade, data, wa_opt_in, created_at, updated_at)
VALUES (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'Marjory Tavares', '5544991848087', 'marjorytavares@hotmail.com', 'active', 'paciente', 'warm', 'import', 0, true, '1979-05-04', 46, '{"sexo":"Feminino","estado_civil":"Solteiro","profissao":"Analista Judiciária","endereco":"Rua Monsenhor Kimura, 445, Ap. 703, Vila Cleópatra, Maringá/PR, 87010-450","cpf":"006.195.419-54"}'::jsonb, true, now(), now())
ON CONFLICT DO NOTHING;
INSERT INTO leads (id, clinic_id, name, phone, email, status, phase, temperature, source_type, lead_score, is_active, birth_date, idade, data, wa_opt_in, created_at, updated_at)
VALUES (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'Marlene Aparecida de Oliveira Silveira', '5569981160548', '', 'active', 'paciente', 'warm', 'import', 0, true, '1954-06-20', 71, '{"cpf":"257.568.501-04"}'::jsonb, true, now(), now())
ON CONFLICT DO NOTHING;
INSERT INTO leads (id, clinic_id, name, phone, email, status, phase, temperature, source_type, lead_score, is_active, birth_date, idade, data, wa_opt_in, created_at, updated_at)
VALUES (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'MARLENE DE SOUZA GROSSI LUZZI', '5543999744069', '', 'active', 'paciente', 'warm', 'import', 0, true, '1959-06-20', 66, '{"sexo":"Feminino","estado_civil":"Casado","profissao":"EMPRESARIA","cpf":"363.940.689-34"}'::jsonb, true, now(), now())
ON CONFLICT DO NOTHING;
INSERT INTO leads (id, clinic_id, name, phone, email, status, phase, temperature, source_type, lead_score, is_active, birth_date, idade, data, wa_opt_in, created_at, updated_at)
VALUES (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'Marluce Braziliano Boer', '5544998084750', '', 'active', 'paciente', 'warm', 'import', 0, true, '1972-08-13', 53, '{"sexo":"Feminino","estado_civil":"Casado","profissao":"Empresária","endereco":"Contorno Major Abelardo José da Cruz, 11604, Jardim Copacabana, Maringá/PR, 87023-215","cpf":"843.864.799-53"}'::jsonb, true, now(), now())
ON CONFLICT DO NOTHING;
INSERT INTO leads (id, clinic_id, name, phone, email, status, phase, temperature, source_type, lead_score, is_active, birth_date, idade, data, wa_opt_in, created_at, updated_at)
VALUES (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'Marta Januario', '5544997711111', '', 'active', 'paciente', 'warm', 'import', 0, true, NULL, NULL, '{"sexo":"Feminino","cpf":"043.696.499-60"}'::jsonb, true, now(), now())
ON CONFLICT DO NOTHING;
INSERT INTO leads (id, clinic_id, name, phone, email, status, phase, temperature, source_type, lead_score, is_active, birth_date, idade, data, wa_opt_in, created_at, updated_at)
VALUES (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'Marya Eduardah Freitas', '5518997210194', '', 'active', 'paciente', 'warm', 'import', 0, true, '2004-01-15', 22, '{"sexo":"Feminino","estado_civil":"Solteiro","profissao":"Estudante","endereco":"Rua Tietê, 278, apto 301, Zona 07, Maringá/PR, 87020-210","cpf":"429.818.898-18"}'::jsonb, true, now(), now())
ON CONFLICT DO NOTHING;
INSERT INTO leads (id, clinic_id, name, phone, email, status, phase, temperature, source_type, lead_score, is_active, birth_date, idade, data, wa_opt_in, created_at, updated_at)
VALUES (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'Mateus Di Figueredo Araujo', '5544991267381', '', 'active', 'paciente', 'warm', 'import', 0, true, '1995-01-26', 31, '{"sexo":"Masculino","estado_civil":"Solteiro","profissao":"Profissional de Educação Física","endereco":"Avenida Guedner - até 1935/1936, 3106, Zona 08, Maringá/PR, 87050-390","cpf":"119.443.206-95"}'::jsonb, true, now(), now())
ON CONFLICT DO NOTHING;
INSERT INTO leads (id, clinic_id, name, phone, email, status, phase, temperature, source_type, lead_score, is_active, birth_date, idade, data, wa_opt_in, created_at, updated_at)
VALUES (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'Matheus Henrique Basso da Rosa', '5566996002575', '', 'active', 'paciente', 'warm', 'import', 0, true, '2006-09-25', 19, '{"sexo":"Masculino","estado_civil":"Solteiro","profissao":"Estudante","endereco":"Rua dos Jasmins, 220, Centro, Bom Jesus do Araguaia/MT, 78899-200","cpf":"038.379.321-17"}'::jsonb, true, now(), now())
ON CONFLICT DO NOTHING;
INSERT INTO leads (id, clinic_id, name, phone, email, status, phase, temperature, source_type, lead_score, is_active, birth_date, idade, data, wa_opt_in, created_at, updated_at)
VALUES (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'Maura Patricia Benosse dos Prazeres', '5566996961483', '', 'active', 'paciente', 'warm', 'import', 0, true, '1980-08-12', 45, '{"sexo":"Feminino","estado_civil":"Casado","endereco":"Rua Piratininga, 778, apto 802, Zona 01, Maringá/PR, 87013-100","cpf":"737.189.042-68"}'::jsonb, true, now(), now())
ON CONFLICT DO NOTHING;
INSERT INTO leads (id, clinic_id, name, phone, email, status, phase, temperature, source_type, lead_score, is_active, birth_date, idade, data, wa_opt_in, created_at, updated_at)
VALUES (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'Meire Arantes', '5544999217038', '', 'active', 'paciente', 'warm', 'import', 0, true, '1973-01-03', 53, '{"sexo":"Feminino","estado_civil":"Casado","profissao":"Empresária","endereco":"Avenida Advogado Horácio Raccanello Filho, 5350, Zona 07, Maringá/PR, 87020-035","cpf":"025.185.599-65"}'::jsonb, true, now(), now())
ON CONFLICT DO NOTHING;
INSERT INTO leads (id, clinic_id, name, phone, email, status, phase, temperature, source_type, lead_score, is_active, birth_date, idade, data, wa_opt_in, created_at, updated_at)
VALUES (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'Michele Castro', '5544998528633', '', 'active', 'paciente', 'warm', 'import', 0, true, '1980-05-04', 45, '{"sexo":"Feminino","estado_civil":"Casado","profissao":"Empresária","endereco":"Rua dos Lírios, 608, Terras Parque, Juranda/PR, 87355-000","cpf":"031.004.089-26"}'::jsonb, true, now(), now())
ON CONFLICT DO NOTHING;
INSERT INTO leads (id, clinic_id, name, phone, email, status, phase, temperature, source_type, lead_score, is_active, birth_date, idade, data, wa_opt_in, created_at, updated_at)
VALUES (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'Michele Dayane Bocardi da Silva', '5544998074001', 'cazzaflor@gmail.com', 'active', 'paciente', 'warm', 'import', 0, true, '1981-07-24', 44, '{"sexo":"Feminino","estado_civil":"Solteiro","profissao":"Emrpesaria","endereco":"Rua Piratininga, 134, Zona 01, Maringá/PR, 87013-100","cpf":"007.778.929-60","origem":"Cazza Flor"}'::jsonb, true, now(), now())
ON CONFLICT DO NOTHING;
INSERT INTO leads (id, clinic_id, name, phone, email, status, phase, temperature, source_type, lead_score, is_active, birth_date, idade, data, wa_opt_in, created_at, updated_at)
VALUES (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'Michelle Karine Tizziani Dias', '5544991090008', 'tizziani.michelle@hotmail.com', 'active', 'paciente', 'warm', 'import', 0, true, '1984-03-27', 42, '{"sexo":"Feminino","estado_civil":"Casado","profissao":"Empresária","endereco":"Avenida Advogado Horácio Raccanello Filho, 4840, Apto 703, Zona 07, Maringá/PR, 87020-035","cpf":"304.826.348-98"}'::jsonb, true, now(), now())
ON CONFLICT DO NOTHING;
INSERT INTO leads (id, clinic_id, name, phone, email, status, phase, temperature, source_type, lead_score, is_active, birth_date, idade, data, wa_opt_in, created_at, updated_at)
VALUES (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'Miriam Poppi', '5544997504000', '', 'active', 'paciente', 'warm', 'import', 0, true, '1974-01-17', 52, '{"sexo":"Feminino","estado_civil":"Casado","profissao":"Empresária","endereco":"Avenida Cerro Azul, 2649, Casa A12 - Condomínio Villagio Bourbom, Jardim Novo Horizonte, Maringá/PR, 87010-910","cpf":"000.391.339-23"}'::jsonb, true, now(), now())
ON CONFLICT DO NOTHING;
INSERT INTO leads (id, clinic_id, name, phone, email, status, phase, temperature, source_type, lead_score, is_active, birth_date, idade, data, wa_opt_in, created_at, updated_at)
VALUES (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'Mirian  de Paula', '5544998782003', '', 'active', 'paciente', 'warm', 'import', 0, true, '1991-10-19', 34, '{"sexo":"Feminino","cpf":"084.733.699-98"}'::jsonb, true, now(), now())
ON CONFLICT DO NOTHING;
INSERT INTO leads (id, clinic_id, name, phone, email, status, phase, temperature, source_type, lead_score, is_active, birth_date, idade, data, wa_opt_in, created_at, updated_at)
VALUES (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'Mislene da Silva', '5547999132239', 'millaoliveirahair@gmail.com', 'active', 'paciente', 'warm', 'import', 0, true, '1985-04-25', 40, '{"sexo":"Feminino","estado_civil":"Casado","profissao":"Profissional da beleza","endereco":"Rua Pioneira Norvina Maria Gonçalves, 381, Casa, Jardim Império do Sol, Maringá/PR, 87083-530","cpf":"077.901.359-02"}'::jsonb, true, now(), now())
ON CONFLICT DO NOTHING;
INSERT INTO leads (id, clinic_id, name, phone, email, status, phase, temperature, source_type, lead_score, is_active, birth_date, idade, data, wa_opt_in, created_at, updated_at)
VALUES (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'Murillo Bonifácio de Oliveira', '5544999864712', 'mboliveira2002@gmail.com', 'active', 'paciente', 'warm', 'import', 0, true, '2002-10-16', 23, '{"sexo":"Masculino","estado_civil":"Solteiro","profissao":"Auxiliar de Escritorio","endereco":"Rua Victoria Vecchi, 234, Jardim Pilar, Maringá/PR, 87083-849","cpf":"126.800.379-44"}'::jsonb, true, now(), now())
ON CONFLICT DO NOTHING;
INSERT INTO leads (id, clinic_id, name, phone, email, status, phase, temperature, source_type, lead_score, is_active, birth_date, idade, data, wa_opt_in, created_at, updated_at)
VALUES (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'Murillo Castanheira', '5544998434442', '', 'active', 'paciente', 'warm', 'import', 0, true, '1994-03-29', 32, '{"sexo":"Masculino","estado_civil":"Solteiro","profissao":"Advogado","endereco":"Avenida Carneiro Leão - lado par, 294, sala 1405, Zona Armazém, Maringá/PR, 87014-010","cpf":"079.866.669-27"}'::jsonb, true, now(), now())
ON CONFLICT DO NOTHING;
INSERT INTO leads (id, clinic_id, name, phone, email, status, phase, temperature, source_type, lead_score, is_active, birth_date, idade, data, wa_opt_in, created_at, updated_at)
VALUES (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'Nágela', '5518981302282', 'nagelacorreiaveloso@gmail.com', 'active', 'paciente', 'warm', 'import', 0, true, '1987-11-24', 38, '{"sexo":"Feminino","estado_civil":"Viuvo","profissao":"Consultora de Vendas","endereco":"Rua Pioneira Maria Manhas Garcia, 684b, Jardim Monte Rei, Maringá/PR, 87083-695","cpf":"352.409.098-22"}'::jsonb, true, now(), now())
ON CONFLICT DO NOTHING;
INSERT INTO leads (id, clinic_id, name, phone, email, status, phase, temperature, source_type, lead_score, is_active, birth_date, idade, data, wa_opt_in, created_at, updated_at)
VALUES (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'Nastassja Vicentini', '5544988293727', 'nathyvicentini@outlook.com', 'active', 'paciente', 'warm', 'import', 0, true, '1988-07-25', 37, '{"sexo":"Feminino","estado_civil":"Casado","profissao":"Produtora rural","endereco":"Avenida São Paulo, 2508, Apto 2302, Vila Bosque, Maringá/PR, 87005-040","cpf":"074.912.059-25","origem":"Josiane Cantarutti"}'::jsonb, true, now(), now())
ON CONFLICT DO NOTHING;
INSERT INTO leads (id, clinic_id, name, phone, email, status, phase, temperature, source_type, lead_score, is_active, birth_date, idade, data, wa_opt_in, created_at, updated_at)
VALUES (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'Natalia Malavazi', '5544991196055', 'nat.malavazi@hotmail.com', 'active', 'paciente', 'warm', 'import', 0, true, '1998-12-21', 27, '{"sexo":"Feminino","estado_civil":"Solteiro","profissao":"Estudante","endereco":"Avenida Cerro Azul 2649, 2649, G44, Jardim Novo Horizonte, Maringá/PR, 87010-910","cpf":"073.606.219-09","origem":"mormaii"}'::jsonb, true, now(), now())
ON CONFLICT DO NOTHING;
INSERT INTO leads (id, clinic_id, name, phone, email, status, phase, temperature, source_type, lead_score, is_active, birth_date, idade, data, wa_opt_in, created_at, updated_at)
VALUES (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'Natália Sversutti', '5544991297004', 'nataliasversutti@gmail.com', 'active', 'paciente', 'warm', 'import', 0, true, '1995-06-11', 30, '{"sexo":"Feminino","estado_civil":"Solteiro","profissao":"Psicóloga infantil","endereco":"Avenida Doutor Luiz Teixeira Mendes, 495, Ap 102, Zona 04, Maringá/PR, 87015-000","cpf":"092.981.739-70"}'::jsonb, true, now(), now())
ON CONFLICT DO NOTHING;
INSERT INTO leads (id, clinic_id, name, phone, email, status, phase, temperature, source_type, lead_score, is_active, birth_date, idade, data, wa_opt_in, created_at, updated_at)
VALUES (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'Natalia Zordan', '5544998216985', 'nataliazdemori@me.com', 'active', 'paciente', 'warm', 'import', 0, true, '1984-12-28', 41, '{"sexo":"Feminino","estado_civil":"Casado","profissao":"Advogada","endereco":"Rua Pioneiro Pedro Valias de Rezende, 529, Vila Santa Izabel, Maringá/PR, 87080-770","cpf":"052.696.929-61","origem":"Esposa Osvaldo Mestre de Cerimônias"}'::jsonb, true, now(), now())
ON CONFLICT DO NOTHING;
INSERT INTO leads (id, clinic_id, name, phone, email, status, phase, temperature, source_type, lead_score, is_active, birth_date, idade, data, wa_opt_in, created_at, updated_at)
VALUES (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'Nayara Rossi Martins', '5543996272764', '', 'active', 'paciente', 'warm', 'import', 0, true, NULL, NULL, '{"sexo":"Feminino"}'::jsonb, true, now(), now())
ON CONFLICT DO NOTHING;
INSERT INTO leads (id, clinic_id, name, phone, email, status, phase, temperature, source_type, lead_score, is_active, birth_date, idade, data, wa_opt_in, created_at, updated_at)
VALUES (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'Nelci Terezinha Garcia', '5547992929290', '', 'active', 'paciente', 'warm', 'import', 0, true, '1954-05-27', 71, '{"sexo":"Feminino","endereco":"Rua Pioneiro Domingos Salgueiro, 2007, Jardim Guaporé, Maringá/PR, 87060-230","cpf":"452.835.089-00"}'::jsonb, true, now(), now())
ON CONFLICT DO NOTHING;
INSERT INTO leads (id, clinic_id, name, phone, email, status, phase, temperature, source_type, lead_score, is_active, birth_date, idade, data, wa_opt_in, created_at, updated_at)
VALUES (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'Nely Sallas Fuentes', '5544998000226', '', 'active', 'paciente', 'warm', 'import', 0, true, '1962-08-28', 63, '{"sexo":"Feminino","cpf":"394.047.061-91"}'::jsonb, true, now(), now())
ON CONFLICT DO NOTHING;
INSERT INTO leads (id, clinic_id, name, phone, email, status, phase, temperature, source_type, lead_score, is_active, birth_date, idade, data, wa_opt_in, created_at, updated_at)
VALUES (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'Neusa Maria Secco', '5544988037473', 'neusa.maria.secco@hotmail.com', 'active', 'paciente', 'warm', 'import', 0, true, '1964-05-07', 61, '{"sexo":"Feminino","estado_civil":"Casado","profissao":"Dentista","endereco":"Avenida Doutor Gastão Vidigal, 2431, casa 26, Jardim Leblon, Maringá/PR, 87053-310","cpf":"585.582.769-00"}'::jsonb, true, now(), now())
ON CONFLICT DO NOTHING;
INSERT INTO leads (id, clinic_id, name, phone, email, status, phase, temperature, source_type, lead_score, is_active, birth_date, idade, data, wa_opt_in, created_at, updated_at)
VALUES (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'Nicolle Negri', '5544998416231', '', 'active', 'paciente', 'warm', 'import', 0, true, NULL, NULL, '{"sexo":"Feminino"}'::jsonb, true, now(), now())
ON CONFLICT DO NOTHING;
INSERT INTO leads (id, clinic_id, name, phone, email, status, phase, temperature, source_type, lead_score, is_active, birth_date, idade, data, wa_opt_in, created_at, updated_at)
VALUES (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'Nilsa Fusco', '5544997075755', '', 'active', 'paciente', 'warm', 'import', 0, true, NULL, NULL, '{"sexo":"Feminino","origem":"Marci"}'::jsonb, true, now(), now())
ON CONFLICT DO NOTHING;
INSERT INTO leads (id, clinic_id, name, phone, email, status, phase, temperature, source_type, lead_score, is_active, birth_date, idade, data, wa_opt_in, created_at, updated_at)
VALUES (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'Nilza Valdevieso', '5544988360908', '', 'active', 'paciente', 'warm', 'import', 0, true, NULL, NULL, '{"sexo":"Feminino","origem":"Instagram","tags_clinica":"INTERNO DE COXAS"}'::jsonb, true, now(), now())
ON CONFLICT DO NOTHING;
INSERT INTO leads (id, clinic_id, name, phone, email, status, phase, temperature, source_type, lead_score, is_active, birth_date, idade, data, wa_opt_in, created_at, updated_at)
VALUES (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'Norlei Rech', '5544998075198', 'norlei.rech@hormail.com', 'active', 'paciente', 'warm', 'import', 0, true, '1992-10-04', 33, '{"sexo":"Feminino","estado_civil":"Casado","profissao":"Biomédica","endereco":"Rua Neo Alves Martins, 3176, 64, Zona 01, Maringá/PR, 87013-060","cpf":"076.958.899-97"}'::jsonb, true, now(), now())
ON CONFLICT DO NOTHING;
INSERT INTO leads (id, clinic_id, name, phone, email, status, phase, temperature, source_type, lead_score, is_active, birth_date, idade, data, wa_opt_in, created_at, updated_at)
VALUES (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'Nubia Meneghetti', '5544998048998', '', 'active', 'paciente', 'warm', 'import', 0, true, '1998-06-14', 27, '{"sexo":"Feminino","estado_civil":"Solteiro","profissao":"Psicoóloga","endereco":"Rua Vereador Nelson Abrão, 631, Zona 05, Maringá/PR, 87015-230","cpf":"096.058.699-77"}'::jsonb, true, now(), now())
ON CONFLICT DO NOTHING;
INSERT INTO leads (id, clinic_id, name, phone, email, status, phase, temperature, source_type, lead_score, is_active, birth_date, idade, data, wa_opt_in, created_at, updated_at)
VALUES (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'Pábila Naka', '5544998519555', '', 'active', 'paciente', 'warm', 'import', 0, true, '1986-02-10', 40, '{"sexo":"Feminino","estado_civil":"Casado","profissao":"Empresária","endereco":"Rua Silva Jardim, 261, Zona 01, Maringá/PR, 87013-010","cpf":"048.008.559-50"}'::jsonb, true, now(), now())
ON CONFLICT DO NOTHING;
INSERT INTO leads (id, clinic_id, name, phone, email, status, phase, temperature, source_type, lead_score, is_active, birth_date, idade, data, wa_opt_in, created_at, updated_at)
VALUES (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'PAMELA CAMILA', '5544998678490', '', 'active', 'paciente', 'warm', 'import', 0, true, NULL, NULL, '{"sexo":"Feminino"}'::jsonb, true, now(), now())
ON CONFLICT DO NOTHING;
INSERT INTO leads (id, clinic_id, name, phone, email, status, phase, temperature, source_type, lead_score, is_active, birth_date, idade, data, wa_opt_in, created_at, updated_at)
VALUES (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'Pamela Reiner', '5544998031577', '', 'active', 'paciente', 'warm', 'import', 0, true, '1994-11-03', 31, '{"sexo":"Feminino","estado_civil":"Viuvo","profissao":"Manicure","endereco":"Avenida Morangueira, 1878, Jardim Alvorada, Maringá/PR, 87035-060","cpf":"091.307.169-26"}'::jsonb, true, now(), now())
ON CONFLICT DO NOTHING;
INSERT INTO leads (id, clinic_id, name, phone, email, status, phase, temperature, source_type, lead_score, is_active, birth_date, idade, data, wa_opt_in, created_at, updated_at)
VALUES (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'Patricia Cavicchioli Bravo', '5544988280800', 'patricia.c.bravo@hotmail.com', 'active', 'paciente', 'warm', 'import', 0, true, '1975-07-09', 50, '{"sexo":"Feminino","estado_civil":"Casado","profissao":"Auxiliar Administrativp","endereco":"Avenida Cerro Azul, 2649, Jardim Novo Horizonte, Maringá/PR, 87010-055","cpf":"027.358.479-00"}'::jsonb, true, now(), now())
ON CONFLICT DO NOTHING;
INSERT INTO leads (id, clinic_id, name, phone, email, status, phase, temperature, source_type, lead_score, is_active, birth_date, idade, data, wa_opt_in, created_at, updated_at)
VALUES (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'Patricia francioli Suzi Serino da Silva', '5544999726590', 'patiserino@gmail.com', 'active', 'paciente', 'warm', 'import', 0, true, '1980-05-26', 45, '{"sexo":"Feminino","estado_civil":"Casado","profissao":"Advogada","endereco":"Rua Pioneiro Carlos Bulla, 210, Jardim Paraíso, Maringá/PR, 87053-009","cpf":"033.776.049-79"}'::jsonb, true, now(), now())
ON CONFLICT DO NOTHING;
INSERT INTO leads (id, clinic_id, name, phone, email, status, phase, temperature, source_type, lead_score, is_active, birth_date, idade, data, wa_opt_in, created_at, updated_at)
VALUES (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'Patricia Moriyama', '5544998958157', 'patymoriyama76@gmail.com', 'active', 'paciente', 'warm', 'import', 0, true, '1976-01-10', 50, '{"sexo":"Feminino","estado_civil":"Casado","profissao":"Aux financeiro","endereco":"Rua Pioneira Guilhermina Mazolini, 181, Jardim Piatã, Maringá/PR, 87043-415","cpf":"097.962.948-93"}'::jsonb, true, now(), now())
ON CONFLICT DO NOTHING;
INSERT INTO leads (id, clinic_id, name, phone, email, status, phase, temperature, source_type, lead_score, is_active, birth_date, idade, data, wa_opt_in, created_at, updated_at)
VALUES (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'Patrícia Nogueira', '5544998476700', '', 'active', 'paciente', 'warm', 'import', 0, true, NULL, NULL, '{"sexo":"Feminino"}'::jsonb, true, now(), now())
ON CONFLICT DO NOTHING;
INSERT INTO leads (id, clinic_id, name, phone, email, status, phase, temperature, source_type, lead_score, is_active, birth_date, idade, data, wa_opt_in, created_at, updated_at)
VALUES (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'Patricia Vendrame', '5544991099943', 'patriciacvendrame@gmail.com', 'active', 'paciente', 'warm', 'import', 0, true, '1981-08-05', 44, '{"sexo":"Feminino","estado_civil":"Casado","profissao":"Designer de interiores","endereco":"Avenida Guedner, 963, Apartamento 2001 edifício Maison Victoria, Zona 08, Maringá/PR, 87050-390","cpf":"034.874.869-89"}'::jsonb, true, now(), now())
ON CONFLICT DO NOTHING;
INSERT INTO leads (id, clinic_id, name, phone, email, status, phase, temperature, source_type, lead_score, is_active, birth_date, idade, data, wa_opt_in, created_at, updated_at)
VALUES (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'Priscila Herculano Ramos', '5544998541404', 'pribratz@hotmail.com', 'active', 'paciente', 'warm', 'import', 0, true, '1988-02-12', 38, '{"sexo":"Feminino","estado_civil":"Casado","profissao":"Advogada e estetista","cpf":"010.473.689-51"}'::jsonb, true, now(), now())
ON CONFLICT DO NOTHING;
INSERT INTO leads (id, clinic_id, name, phone, email, status, phase, temperature, source_type, lead_score, is_active, birth_date, idade, data, wa_opt_in, created_at, updated_at)
VALUES (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'Priscilla', '5544999741629', '', 'active', 'paciente', 'warm', 'import', 0, true, NULL, NULL, '{"sexo":"Feminino"}'::jsonb, true, now(), now())
ON CONFLICT DO NOTHING;
INSERT INTO leads (id, clinic_id, name, phone, email, status, phase, temperature, source_type, lead_score, is_active, birth_date, idade, data, wa_opt_in, created_at, updated_at)
VALUES (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'Priscilla Mazzo', '5544999702620', 'priscillamazzo@gmail.com', 'active', 'paciente', 'warm', 'import', 0, true, '1984-03-24', 42, '{"sexo":"Feminino","estado_civil":"Casado","profissao":"Arquiteta","endereco":"Rua Natividade Regina Brianezi, 589, Casa, Jardim Aurora, Maringá/PR, 87070-570","cpf":"037.515.749-21"}'::jsonb, true, now(), now())
ON CONFLICT DO NOTHING;
INSERT INTO leads (id, clinic_id, name, phone, email, status, phase, temperature, source_type, lead_score, is_active, birth_date, idade, data, wa_opt_in, created_at, updated_at)
VALUES (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'Raila Alves Exaltação Jesuíno', '5544997053549', 'railovisca@hotmail.com', 'active', 'paciente', 'warm', 'import', 0, true, '1990-03-19', 36, '{"sexo":"Feminino","estado_civil":"Solteiro","profissao":"Atendente poupa tempo","endereco":"Rua Pioneira Genoveva Giunta, 60, Casa, Parque Tarumã, Maringá/PR, 87053-680","cpf":"075.192.519-50"}'::jsonb, true, now(), now())
ON CONFLICT DO NOTHING;
INSERT INTO leads (id, clinic_id, name, phone, email, status, phase, temperature, source_type, lead_score, is_active, birth_date, idade, data, wa_opt_in, created_at, updated_at)
VALUES (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'Raissa Candianni Castro', '5544999616843', 'raissamc@hotmail.com', 'active', 'paciente', 'warm', 'import', 0, true, '1992-09-03', 33, '{"sexo":"Feminino","estado_civil":"Casado","profissao":"Do lar","endereco":"Rua 8 de Setembro, 274, Casa, Jardim Alamar, Maringá/PR, 87014-380","cpf":"081.970.689-25"}'::jsonb, true, now(), now())
ON CONFLICT DO NOTHING;
INSERT INTO leads (id, clinic_id, name, phone, email, status, phase, temperature, source_type, lead_score, is_active, birth_date, idade, data, wa_opt_in, created_at, updated_at)
VALUES (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'Raquel', '5544984215847', '', 'active', 'paciente', 'warm', 'import', 0, true, NULL, NULL, '{"sexo":"Feminino"}'::jsonb, true, now(), now())
ON CONFLICT DO NOTHING;
INSERT INTO leads (id, clinic_id, name, phone, email, status, phase, temperature, source_type, lead_score, is_active, birth_date, idade, data, wa_opt_in, created_at, updated_at)
VALUES (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'Regina Tivo de Araujo', '5544988212145', '', 'active', 'paciente', 'warm', 'import', 0, true, '1969-01-30', 57, '{"sexo":"Feminino","estado_civil":"Casado","profissao":"Empresária","endereco":"Avenida Guedner - até 1935/1936, 830, Zona 08, Maringá/PR, 87050-390","cpf":"723.709.479-34"}'::jsonb, true, now(), now())
ON CONFLICT DO NOTHING;
INSERT INTO leads (id, clinic_id, name, phone, email, status, phase, temperature, source_type, lead_score, is_active, birth_date, idade, data, wa_opt_in, created_at, updated_at)
VALUES (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'Rejaine Braz', '5544988128857', 'brazrejaine@gmail.com', 'active', 'paciente', 'warm', 'import', 0, true, '1979-07-17', 46, '{"sexo":"Feminino","estado_civil":"Casado","profissao":"Empresaria","endereco":"Rua Bice Deplano Cocco, 57, Casa, Parque da Gávea, Maringá/PR, 87053-267","cpf":"282.845.828-80"}'::jsonb, true, now(), now())
ON CONFLICT DO NOTHING;
INSERT INTO leads (id, clinic_id, name, phone, email, status, phase, temperature, source_type, lead_score, is_active, birth_date, idade, data, wa_opt_in, created_at, updated_at)
VALUES (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'Renata Francisca Amaral', '5544999507246', 'renatinha.fran20@gmail.com', 'active', 'paciente', 'warm', 'import', 0, true, '1987-03-20', 39, '{"sexo":"Feminino","estado_civil":"Solteiro","profissao":"Autônoma","endereco":"Avenida Guedner -, 3106, Condomínio Garda, Zona 08, Maringá/PR, 87050-390","cpf":"010.187.499-50","origem":"Mormaii"}'::jsonb, true, now(), now())
ON CONFLICT DO NOTHING;
INSERT INTO leads (id, clinic_id, name, phone, email, status, phase, temperature, source_type, lead_score, is_active, birth_date, idade, data, wa_opt_in, created_at, updated_at)
VALUES (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'Renata Gasparotto Apoloni', '5544991341802', '', 'active', 'paciente', 'warm', 'import', 0, true, '1982-02-18', 44, '{"sexo":"Feminino","estado_civil":"Divorciado","profissao":"Advogada","endereco":"Avenida XV de Novembro, 857, apto 501, Zona 01, Maringá/PR, 87013-230","cpf":"031.557.259-07"}'::jsonb, true, now(), now())
ON CONFLICT DO NOTHING;
INSERT INTO leads (id, clinic_id, name, phone, email, status, phase, temperature, source_type, lead_score, is_active, birth_date, idade, data, wa_opt_in, created_at, updated_at)
VALUES (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'Rhayane Meneghetti Prado', '5544998710545', 'rhayane_meneghetti@hotmail.com', 'active', 'paciente', 'warm', 'import', 0, true, '1996-03-06', 30, '{"sexo":"Feminino","estado_civil":"Casado","profissao":"Cabeleireira","endereco":"Rua Quartzo, 138, Jardim Real, Maringá/PR, 87083-030","cpf":"106.319.479-22"}'::jsonb, true, now(), now())
ON CONFLICT DO NOTHING;
INSERT INTO leads (id, clinic_id, name, phone, email, status, phase, temperature, source_type, lead_score, is_active, birth_date, idade, data, wa_opt_in, created_at, updated_at)
VALUES (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'Rita de Cássia de Oliveira Rocha', '5544998409868', 'dicassia_oliver@hotmail.com', 'active', 'paciente', 'warm', 'import', 0, true, '1981-05-30', 44, '{"sexo":"Feminino","estado_civil":"Casado","profissao":"Fonoaudióloga","endereco":"Rua Vereador José Mário Hauari, 740, Casa, Jardim Monte Rei, Maringá/PR, 87083-670","cpf":"036.541.899-46"}'::jsonb, true, now(), now())
ON CONFLICT DO NOTHING;
INSERT INTO leads (id, clinic_id, name, phone, email, status, phase, temperature, source_type, lead_score, is_active, birth_date, idade, data, wa_opt_in, created_at, updated_at)
VALUES (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'Roberto Bastos', '5541988933258', '', 'active', 'paciente', 'warm', 'import', 0, true, '1997-01-08', 29, '{"sexo":"Masculino","estado_civil":"Casado","profissao":"Empresário","endereco":"Rua Antônio Rigoldi, 372, Bom Jardim, Maringá/PR, 87047-718","cpf":"021.952.552-85"}'::jsonb, true, now(), now())
ON CONFLICT DO NOTHING;
INSERT INTO leads (id, clinic_id, name, phone, email, status, phase, temperature, source_type, lead_score, is_active, birth_date, idade, data, wa_opt_in, created_at, updated_at)
VALUES (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'ROSA', '5544999682121', '', 'active', 'paciente', 'warm', 'import', 0, true, NULL, NULL, '{"sexo":"Feminino"}'::jsonb, true, now(), now())
ON CONFLICT DO NOTHING;
INSERT INTO leads (id, clinic_id, name, phone, email, status, phase, temperature, source_type, lead_score, is_active, birth_date, idade, data, wa_opt_in, created_at, updated_at)
VALUES (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'Rosana Inês Haiden', '5544997508263', 'rosanainesrih@gmail.com', 'active', 'paciente', 'warm', 'import', 0, true, '1989-09-28', 36, '{"sexo":"Feminino","estado_civil":"Casado","endereco":"Rua Alberto Santos Dumont, 1102, Fundos, Centro, Paiçandu/PR, 87140-000","cpf":"069.703.499-26"}'::jsonb, true, now(), now())
ON CONFLICT DO NOTHING;
INSERT INTO leads (id, clinic_id, name, phone, email, status, phase, temperature, source_type, lead_score, is_active, birth_date, idade, data, wa_opt_in, created_at, updated_at)
VALUES (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'Rosana Longuinho Regillio de Souza', '5544999720285', 'rosanaregilio@hotmail.com', 'active', 'paciente', 'warm', 'import', 0, true, '1966-09-09', 59, '{"sexo":"Feminino","estado_civil":"Casado","profissao":"Do lar","endereco":"Avenida Laguna, 733, apto 2402, Zona 03, Maringá/PR, 87050-260","cpf":"623.847.679-68"}'::jsonb, true, now(), now())
ON CONFLICT DO NOTHING;
INSERT INTO leads (id, clinic_id, name, phone, email, status, phase, temperature, source_type, lead_score, is_active, birth_date, idade, data, wa_opt_in, created_at, updated_at)
VALUES (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'Rosana Mendes', '5544997224339', '', 'active', 'paciente', 'warm', 'import', 0, true, '1982-02-05', 44, '{"sexo":"Feminino","estado_civil":"Casado","profissao":"Administradora","endereco":"Rua Joaquim Nabuco, 163, Apto 1502, Zona 04, Maringá/PR, 87014-100","cpf":"725.751.821-15"}'::jsonb, true, now(), now())
ON CONFLICT DO NOTHING;
INSERT INTO leads (id, clinic_id, name, phone, email, status, phase, temperature, source_type, lead_score, is_active, birth_date, idade, data, wa_opt_in, created_at, updated_at)
VALUES (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'Rosane Aparecida Santos', '5544988200450', 'rosaneapmaringa@hotmail.com', 'active', 'paciente', 'warm', 'import', 0, true, '1973-05-22', 52, '{"sexo":"Feminino","estado_civil":"Casado","profissao":"Administradora","endereco":"Avenida Laguna, 733, Apto 2403, Zona 03, Maringá/PR, 87050-260","cpf":"929.092.139-00","origem":"Josi Cantarutti"}'::jsonb, true, now(), now())
ON CONFLICT DO NOTHING;
INSERT INTO leads (id, clinic_id, name, phone, email, status, phase, temperature, source_type, lead_score, is_active, birth_date, idade, data, wa_opt_in, created_at, updated_at)
VALUES (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'Roseni Roque', '5544997059900', '', 'active', 'paciente', 'warm', 'import', 0, true, NULL, NULL, '{"sexo":"Feminino","origem":"Instagram"}'::jsonb, true, now(), now())
ON CONFLICT DO NOTHING;
INSERT INTO leads (id, clinic_id, name, phone, email, status, phase, temperature, source_type, lead_score, is_active, birth_date, idade, data, wa_opt_in, created_at, updated_at)
VALUES (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'Rute Manoel Merlos', '5544998806644', '', 'active', 'paciente', 'warm', 'import', 0, true, '1981-04-14', 44, '{"sexo":"Feminino","estado_civil":"Casado","profissao":"Fonoaudióloga","endereco":"Avenida Doutor Gastão Vidigal, 2517, Jardim Leblon, Maringá/PR, 87053-310","cpf":"008.299.899-00"}'::jsonb, true, now(), now())
ON CONFLICT DO NOTHING;
INSERT INTO leads (id, clinic_id, name, phone, email, status, phase, temperature, source_type, lead_score, is_active, birth_date, idade, data, wa_opt_in, created_at, updated_at)
VALUES (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'Sabrina Naves Almeida', '5543999213764', 'sabrinanaves@hotmail.com', 'active', 'paciente', 'warm', 'import', 0, true, '1996-12-02', 29, '{"sexo":"Feminino","estado_civil":"Solteiro","profissao":"Maquiadora/Lash designer/micropigmentadora","endereco":"Avenida Prudente de Morais, 402 A, Ed volare tower, Zona 07, Maringá/PR, 87020-010","cpf":"092.384.139-32"}'::jsonb, true, now(), now())
ON CONFLICT DO NOTHING;
INSERT INTO leads (id, clinic_id, name, phone, email, status, phase, temperature, source_type, lead_score, is_active, birth_date, idade, data, wa_opt_in, created_at, updated_at)
VALUES (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'Sandra de Canini de paula', '5544991170272', 'sandracanini@hotmail.com', 'active', 'paciente', 'warm', 'import', 0, true, '1965-07-09', 60, '{"sexo":"Feminino","estado_civil":"Casado","profissao":"Gestora Publica","endereco":"Rua rio Danubio, 224, A, Jardim oasis, Maringá/PR, 87043-020","cpf":"634.431.049-91"}'::jsonb, true, now(), now())
ON CONFLICT DO NOTHING;
INSERT INTO leads (id, clinic_id, name, phone, email, status, phase, temperature, source_type, lead_score, is_active, birth_date, idade, data, wa_opt_in, created_at, updated_at)
VALUES (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'Sandra Pampu', '5543999150400', '', 'active', 'paciente', 'warm', 'import', 0, true, '1972-09-20', 53, '{"sexo":"Feminino","estado_civil":"Casado","profissao":"Comerciante","endereco":"Avenida Londrina, 1534, casa 25, Zona 08, Maringá/PR, 87050-730","cpf":"003.608.829-35"}'::jsonb, true, now(), now())
ON CONFLICT DO NOTHING;
INSERT INTO leads (id, clinic_id, name, phone, email, status, phase, temperature, source_type, lead_score, is_active, birth_date, idade, data, wa_opt_in, created_at, updated_at)
VALUES (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'Sandra Regina Stela Funes', '5544998497564', 'sandrastelafunes@gmail.com', 'active', 'paciente', 'warm', 'import', 0, true, '1974-04-25', 51, '{"sexo":"Feminino","estado_civil":"Casado","endereco":"Rua Sol Nascente, 275, Casa, Jardim Imperial, Maringá/PR, 87023-105","cpf":"885.403.839-34"}'::jsonb, true, now(), now())
ON CONFLICT DO NOTHING;
INSERT INTO leads (id, clinic_id, name, phone, email, status, phase, temperature, source_type, lead_score, is_active, birth_date, idade, data, wa_opt_in, created_at, updated_at)
VALUES (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'SARA', '5544997338980', '', 'active', 'paciente', 'warm', 'import', 0, true, NULL, NULL, '{"sexo":"Feminino"}'::jsonb, true, now(), now())
ON CONFLICT DO NOTHING;
INSERT INTO leads (id, clinic_id, name, phone, email, status, phase, temperature, source_type, lead_score, is_active, birth_date, idade, data, wa_opt_in, created_at, updated_at)
VALUES (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'Sara Almeida Moreno', '5544998132133', 'saramoreno1961@gmail.com', 'active', 'paciente', 'warm', 'import', 0, true, '1961-11-16', 64, '{"sexo":"Feminino","estado_civil":"Casado","profissao":"Aposentada","endereco":"Rua Pioneiro Joaquim Fernandes Salgueiro, 69, Jardim Canadá 2ª Parte, Maringá/PR, 87080-102","cpf":"784.729.899-68","origem":"Instagram"}'::jsonb, true, now(), now())
ON CONFLICT DO NOTHING;
INSERT INTO leads (id, clinic_id, name, phone, email, status, phase, temperature, source_type, lead_score, is_active, birth_date, idade, data, wa_opt_in, created_at, updated_at)
VALUES (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'Silvana Aparecida Regolati', '5544997040085', '', 'active', 'paciente', 'warm', 'import', 0, true, '1970-09-12', 55, '{"sexo":"Feminino","estado_civil":"Solteiro","profissao":"Diarista","endereco":"Avenida Morangueira 1075, 1075, Condomínio Buckingham, Jardim Sol, Maringá/PR, 87033-900","cpf":"783.501.749-00"}'::jsonb, true, now(), now())
ON CONFLICT DO NOTHING;
INSERT INTO leads (id, clinic_id, name, phone, email, status, phase, temperature, source_type, lead_score, is_active, birth_date, idade, data, wa_opt_in, created_at, updated_at)
VALUES (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'Silvana Porto Ferreira da Silva', '5544988164234', '', 'active', 'paciente', 'warm', 'import', 0, true, '1987-10-02', 38, '{"sexo":"Feminino","estado_civil":"Casado","profissao":"Gerente","endereco":"Rua Pioneira Maria Aparecida Araújo de Siqueira, 281, apto 106 bloco 2, Loteamento Sumaré, Maringá/PR, 87035-614","cpf":"089.760.716-38"}'::jsonb, true, now(), now())
ON CONFLICT DO NOTHING;
INSERT INTO leads (id, clinic_id, name, phone, email, status, phase, temperature, source_type, lead_score, is_active, birth_date, idade, data, wa_opt_in, created_at, updated_at)
VALUES (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'Silvânia Sorti Souza Voltatone', '5544999406943', 'silvaniavoltatone@htmail.comm', 'active', 'paciente', 'warm', 'import', 0, true, '1966-11-06', 59, '{"sexo":"Feminino","estado_civil":"Casado","profissao":"Comércio","endereco":"Avenida Rocha, 1815, Centro, Nova Esperança/PR, 87600-000","cpf":"826.569.169-68"}'::jsonb, true, now(), now())
ON CONFLICT DO NOTHING;
INSERT INTO leads (id, clinic_id, name, phone, email, status, phase, temperature, source_type, lead_score, is_active, birth_date, idade, data, wa_opt_in, created_at, updated_at)
VALUES (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'Silvia Candida Borghi', '5544991455294', 'silviacborghi@yahoo.com.br', 'active', 'paciente', 'warm', 'import', 0, true, '1967-05-05', 58, '{"sexo":"Feminino","estado_civil":"Casado","profissao":"Coordenadora de rh","endereco":"Rua Pioneiro Aníbal Borin, 663, Jardim Paris, Maringá/PR, 87083-430","cpf":"085.315.228-46"}'::jsonb, true, now(), now())
ON CONFLICT DO NOTHING;
INSERT INTO leads (id, clinic_id, name, phone, email, status, phase, temperature, source_type, lead_score, is_active, birth_date, idade, data, wa_opt_in, created_at, updated_at)
VALUES (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'Simone Yumi Shibata', '5544997011406', 'simoneshibata95@gmail.com', 'active', 'paciente', 'warm', 'import', 0, true, '1995-06-14', 30, '{"sexo":"Feminino","estado_civil":"Solteiro","profissao":"Engenheira de Software","endereco":"Rua Ouro Verde, 378, apto 505 bloco 2, Vila Emília, Maringá/PR, 87010-160","cpf":"407.324.468-05","origem":"Mormaii"}'::jsonb, true, now(), now())
ON CONFLICT DO NOTHING;
INSERT INTO leads (id, clinic_id, name, phone, email, status, phase, temperature, source_type, lead_score, is_active, birth_date, idade, data, wa_opt_in, created_at, updated_at)
VALUES (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'Solange Aparecida Dos Santos', '5544997195840', 'solsantos_6@hotmail.com', 'active', 'paciente', 'warm', 'import', 0, true, '1971-10-06', 54, '{"sexo":"Feminino","estado_civil":"Casado","profissao":"Gerente de Rh","endereco":"Rua Pioneiro Romeu Pardini, 161, Apt:1205, Galeão, Maringá/PR, 87053-289","cpf":"825.584.269-15"}'::jsonb, true, now(), now())
ON CONFLICT DO NOTHING;
INSERT INTO leads (id, clinic_id, name, phone, email, status, phase, temperature, source_type, lead_score, is_active, birth_date, idade, data, wa_opt_in, created_at, updated_at)
VALUES (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'Solangela Casoni', '5544999251728', 'solangela.casoni@escola.pr.gov.br', 'active', 'paciente', 'warm', 'import', 0, true, '1971-01-08', 55, '{"sexo":"Feminino","estado_civil":"Divorciado","profissao":"Professora","endereco":"Rua Noel Rosa, 1771, Conjunto Residencial Cidade Alta, Maringá/PR, 87053-090","cpf":"718.089.229-72","origem":"Mormaii"}'::jsonb, true, now(), now())
ON CONFLICT DO NOTHING;
INSERT INTO leads (id, clinic_id, name, phone, email, status, phase, temperature, source_type, lead_score, is_active, birth_date, idade, data, wa_opt_in, created_at, updated_at)
VALUES (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'Suane Meneses Caetano', '5544999142411', 'suane.meneses@gmail.com', 'active', 'paciente', 'warm', 'import', 0, true, '1985-08-26', 40, '{"sexo":"Feminino","estado_civil":"Casado","profissao":"Estudante","endereco":"Rua Âmbar, 254, Jardim Brasil, Maringá/PR, 87083-287","cpf":"050.391.979-93","origem":"Karin"}'::jsonb, true, now(), now())
ON CONFLICT DO NOTHING;
INSERT INTO leads (id, clinic_id, name, phone, email, status, phase, temperature, source_type, lead_score, is_active, birth_date, idade, data, wa_opt_in, created_at, updated_at)
VALUES (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'Suelen Lacerda', '5544991448018', '', 'active', 'paciente', 'warm', 'import', 0, true, NULL, NULL, '{"sexo":"Feminino","origem":"Instagram","tags_clinica":"Avaliação, Flacidez facial"}'::jsonb, true, now(), now())
ON CONFLICT DO NOTHING;
INSERT INTO leads (id, clinic_id, name, phone, email, status, phase, temperature, source_type, lead_score, is_active, birth_date, idade, data, wa_opt_in, created_at, updated_at)
VALUES (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'Sueli Aluna Mormaii', '5544998168284', '', 'active', 'paciente', 'warm', 'import', 0, true, '1958-08-18', 67, '{"sexo":"Feminino","estado_civil":"Casado","profissao":"Professora aposentada","cpf":"463.471.519-87"}'::jsonb, true, now(), now())
ON CONFLICT DO NOTHING;
INSERT INTO leads (id, clinic_id, name, phone, email, status, phase, temperature, source_type, lead_score, is_active, birth_date, idade, data, wa_opt_in, created_at, updated_at)
VALUES (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'Susana Pimentel', '5544998018271', '', 'active', 'paciente', 'warm', 'import', 0, true, NULL, NULL, '{"sexo":"Feminino"}'::jsonb, true, now(), now())
ON CONFLICT DO NOTHING;
INSERT INTO leads (id, clinic_id, name, phone, email, status, phase, temperature, source_type, lead_score, is_active, birth_date, idade, data, wa_opt_in, created_at, updated_at)
VALUES (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'Susimara Sorti de Souza Couto', '5544999345026', '', 'active', 'paciente', 'warm', 'import', 0, true, '1968-09-24', 57, '{"sexo":"Feminino","estado_civil":"Casado","profissao":"Prof musica","endereco":"Rua Marechal Deodoro, 440, Apto 702, Zona 07, Maringá/PR, 87030-020","rg":"42446491"}'::jsonb, true, now(), now())
ON CONFLICT DO NOTHING;
INSERT INTO leads (id, clinic_id, name, phone, email, status, phase, temperature, source_type, lead_score, is_active, birth_date, idade, data, wa_opt_in, created_at, updated_at)
VALUES (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'Suzana dos Santos Oliveira', '5544998922887', 'suzanapsic@gmail.com', 'active', 'paciente', 'warm', 'import', 0, true, '1978-11-23', 47, '{"sexo":"Feminino","estado_civil":"Casado","profissao":"psicóloga"}'::jsonb, true, now(), now())
ON CONFLICT DO NOTHING;
INSERT INTO leads (id, clinic_id, name, phone, email, status, phase, temperature, source_type, lead_score, is_active, birth_date, idade, data, wa_opt_in, created_at, updated_at)
VALUES (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'Suzi Candiane', '5544999616846', '', 'active', 'paciente', 'warm', 'import', 0, true, '1963-03-12', 63, '{"sexo":"Feminino","estado_civil":"Casado","profissao":"Empresária","endereco":"Avenida Guedner - até 1935/1936, 830, Casa 29, Zona 08, Maringá/PR, 87050-390","cpf":"466.503.349-87"}'::jsonb, true, now(), now())
ON CONFLICT DO NOTHING;
INSERT INTO leads (id, clinic_id, name, phone, email, status, phase, temperature, source_type, lead_score, is_active, birth_date, idade, data, wa_opt_in, created_at, updated_at)
VALUES (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'Taline Mayara Nery', '5544991029071', 'talinemayaran@gmail.com', 'active', 'paciente', 'warm', 'import', 0, true, '1987-05-18', 38, '{"sexo":"Feminino","estado_civil":"Solteiro","profissao":"Enfermeira","endereco":"Rua Pioneiro João de Deus Prates, 106, Jardim Atami, Maringá/PR, 87062-245","cpf":"050.897.029-69"}'::jsonb, true, now(), now())
ON CONFLICT DO NOTHING;
INSERT INTO leads (id, clinic_id, name, phone, email, status, phase, temperature, source_type, lead_score, is_active, birth_date, idade, data, wa_opt_in, created_at, updated_at)
VALUES (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'Tania Gonçalves', '5544991741967', '', 'active', 'paciente', 'warm', 'import', 0, true, NULL, NULL, '{"sexo":"Feminino"}'::jsonb, true, now(), now())
ON CONFLICT DO NOTHING;
INSERT INTO leads (id, clinic_id, name, phone, email, status, phase, temperature, source_type, lead_score, is_active, birth_date, idade, data, wa_opt_in, created_at, updated_at)
VALUES (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'Tatiane Belini', '5544997750260', '', 'active', 'paciente', 'warm', 'import', 0, true, NULL, NULL, '{"sexo":"Feminino"}'::jsonb, true, now(), now())
ON CONFLICT DO NOTHING;
INSERT INTO leads (id, clinic_id, name, phone, email, status, phase, temperature, source_type, lead_score, is_active, birth_date, idade, data, wa_opt_in, created_at, updated_at)
VALUES (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'Tatiane Martim', '5544999468409', 'tatianepm2010@hotmail.com', 'active', 'paciente', 'warm', 'import', 0, true, '1978-03-01', 48, '{"sexo":"Feminino","estado_civil":"Casado","profissao":"Do lar","cpf":"026.824.029-92","origem":"Aluna da Karin....CORTESIA FOTONA (SCANNER CORPORAL)"}'::jsonb, true, now(), now())
ON CONFLICT DO NOTHING;
INSERT INTO leads (id, clinic_id, name, phone, email, status, phase, temperature, source_type, lead_score, is_active, birth_date, idade, data, wa_opt_in, created_at, updated_at)
VALUES (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'Telma Galli Silva', '5544999969796', 'telma.galli@hotmail.com', 'active', 'paciente', 'warm', 'import', 0, true, '1967-03-01', 59, '{"sexo":"Feminino","estado_civil":"Casado","profissao":"Advogada","endereco":"Avenida Carlos Correa Borges, 1669, Conjunto Habitacional Inocente Vila Nova Júnior, Maringá/PR, 87060-000","cpf":"532.683.779-04","origem":"Instagram"}'::jsonb, true, now(), now())
ON CONFLICT DO NOTHING;
INSERT INTO leads (id, clinic_id, name, phone, email, status, phase, temperature, source_type, lead_score, is_active, birth_date, idade, data, wa_opt_in, created_at, updated_at)
VALUES (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'Thais', '5544991802060', '', 'active', 'paciente', 'warm', 'import', 0, true, '1994-05-23', 31, '{"sexo":"Feminino"}'::jsonb, true, now(), now())
ON CONFLICT DO NOTHING;
INSERT INTO leads (id, clinic_id, name, phone, email, status, phase, temperature, source_type, lead_score, is_active, birth_date, idade, data, wa_opt_in, created_at, updated_at)
VALUES (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'Thalia Ziegler', '5547988362507', 'thalia_pz@hotmail.com', 'active', 'paciente', 'warm', 'import', 0, true, '1998-10-19', 27, '{"sexo":"Feminino","estado_civil":"Solteiro","profissao":"Nutricionista","endereco":"Rua Rui Barbosa, 207, Apto 404, Zona 07, Maringá/PR, 87020-090","cpf":"075.557.519-92"}'::jsonb, true, now(), now())
ON CONFLICT DO NOTHING;
INSERT INTO leads (id, clinic_id, name, phone, email, status, phase, temperature, source_type, lead_score, is_active, birth_date, idade, data, wa_opt_in, created_at, updated_at)
VALUES (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'Thiago Ramalho Pires', '5544999993842', 'thiagoramalhopires@gmail.com', 'active', 'paciente', 'warm', 'import', 0, true, '1985-01-13', 41, '{"sexo":"Masculino","estado_civil":"Casado","profissao":"Policial militar","endereco":"Rua Pioneira Maria Aparecida Araújo de Siqueira, 281, Apto 106, bloco 2, Loteamento Sumaré, Maringá/PR, 87035-614","cpf":"008.648.969-05"}'::jsonb, true, now(), now())
ON CONFLICT DO NOTHING;
INSERT INTO leads (id, clinic_id, name, phone, email, status, phase, temperature, source_type, lead_score, is_active, birth_date, idade, data, wa_opt_in, created_at, updated_at)
VALUES (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'TIA CRIS', '5544997889678', '', 'active', 'paciente', 'warm', 'import', 0, true, NULL, NULL, '{"sexo":"Feminino"}'::jsonb, true, now(), now())
ON CONFLICT DO NOTHING;
INSERT INTO leads (id, clinic_id, name, phone, email, status, phase, temperature, source_type, lead_score, is_active, birth_date, idade, data, wa_opt_in, created_at, updated_at)
VALUES (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'Tiago Gonçalves de Souza', '5544988270456', 'tiagogsouza.oficial@gmail.com', 'active', 'paciente', 'warm', 'import', 0, true, '1997-09-11', 28, '{"sexo":"Feminino","estado_civil":"Solteiro","profissao":"Gerente PJ","endereco":"Rua Assunção, 507, Vila Marumby, Maringá/PR, 87005-240","cpf":"114.183.109-05"}'::jsonb, true, now(), now())
ON CONFLICT DO NOTHING;
INSERT INTO leads (id, clinic_id, name, phone, email, status, phase, temperature, source_type, lead_score, is_active, birth_date, idade, data, wa_opt_in, created_at, updated_at)
VALUES (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'Tiba Pinto', '5544997184804', '', 'active', 'paciente', 'warm', 'import', 0, true, '1979-03-24', 47, '{"sexo":"Masculino","estado_civil":"Casado","profissao":"Empresário","endereco":"Avenida Pedro Taques, 2238, Jardim Alvorada, Maringá/PR, 87033-000","cpf":"028.105.989-67"}'::jsonb, true, now(), now())
ON CONFLICT DO NOTHING;
INSERT INTO leads (id, clinic_id, name, phone, email, status, phase, temperature, source_type, lead_score, is_active, birth_date, idade, data, wa_opt_in, created_at, updated_at)
VALUES (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'VALDENICE FATIMA DA SILVA', '5544998067529', '', 'active', 'paciente', 'warm', 'import', 0, true, '1970-04-26', 55, '{"sexo":"Feminino","cpf":"815.125.469-68"}'::jsonb, true, now(), now())
ON CONFLICT DO NOTHING;
INSERT INTO leads (id, clinic_id, name, phone, email, status, phase, temperature, source_type, lead_score, is_active, birth_date, idade, data, wa_opt_in, created_at, updated_at)
VALUES (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'Valdir Molina', '5544999249444', '', 'active', 'paciente', 'warm', 'import', 0, true, '1970-08-10', 55, '{"sexo":"Masculino","estado_civil":"Casado","profissao":"Empresário","endereco":"Avenida Guedner, 830, casa 96, Zona 08, Maringá/PR, 87050-390","cpf":"679.703.549-04"}'::jsonb, true, now(), now())
ON CONFLICT DO NOTHING;
INSERT INTO leads (id, clinic_id, name, phone, email, status, phase, temperature, source_type, lead_score, is_active, birth_date, idade, data, wa_opt_in, created_at, updated_at)
VALUES (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'Valdirene L. H. Carniel', '5544999614203', '', 'active', 'paciente', 'warm', 'import', 0, true, '1977-02-13', 49, '{"sexo":"Feminino","estado_civil":"Casado","profissao":"Administradora","endereco":"Rua Pioneiro Domingos Salgueiro, 2007, Jardim Guaporé, Maringá/PR, 87060-230","cpf":"025.192.439-45"}'::jsonb, true, now(), now())
ON CONFLICT DO NOTHING;
INSERT INTO leads (id, clinic_id, name, phone, email, status, phase, temperature, source_type, lead_score, is_active, birth_date, idade, data, wa_opt_in, created_at, updated_at)
VALUES (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'Valeria Nerillo Ferro', '5544999551599', 'valerianerillo@icloud.com', 'active', 'paciente', 'warm', 'import', 0, true, '1988-03-22', 38, '{"sexo":"Feminino","estado_civil":"Casado","profissao":"Financeira","endereco":"Avenida Bento Munhoz da Rocha Netto, 421, Apto 301, Zona 07, Maringá/PR, 87030-010","cpf":"069.918.369-31"}'::jsonb, true, now(), now())
ON CONFLICT DO NOTHING;
INSERT INTO leads (id, clinic_id, name, phone, email, status, phase, temperature, source_type, lead_score, is_active, birth_date, idade, data, wa_opt_in, created_at, updated_at)
VALUES (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'Vaneide de oliveira', '5544991298124', 'oliveiravaneidi@gmail.com', 'active', 'paciente', 'warm', 'import', 0, true, '1977-06-12', 48, '{"sexo":"Feminino","estado_civil":"Casado","profissao":"Cuidadora de idoso","endereco":"Avenida Carneiro Leão, 126, Casa, Zona Armazém, Maringá/PR, 87014-010","cpf":"273.318.248-05"}'::jsonb, true, now(), now())
ON CONFLICT DO NOTHING;
INSERT INTO leads (id, clinic_id, name, phone, email, status, phase, temperature, source_type, lead_score, is_active, birth_date, idade, data, wa_opt_in, created_at, updated_at)
VALUES (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'Vanessa', '5544999623427', '', 'active', 'paciente', 'warm', 'import', 0, true, NULL, NULL, '{"sexo":"Feminino"}'::jsonb, true, now(), now())
ON CONFLICT DO NOTHING;
INSERT INTO leads (id, clinic_id, name, phone, email, status, phase, temperature, source_type, lead_score, is_active, birth_date, idade, data, wa_opt_in, created_at, updated_at)
VALUES (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'Vanessa Almodin', '5544999174440', 'vanessaalmodin@gmail.com', 'active', 'paciente', 'warm', 'import', 0, true, '1980-05-17', 45, '{"sexo":"Feminino","estado_civil":"Solteiro","profissao":"Psicóloga","endereco":"Rua Macapá, 70, Jardim Social, Maringá/PR, 87010-010","cpf":"005.868.149-30","origem":"Mormaii"}'::jsonb, true, now(), now())
ON CONFLICT DO NOTHING;
INSERT INTO leads (id, clinic_id, name, phone, email, status, phase, temperature, source_type, lead_score, is_active, birth_date, idade, data, wa_opt_in, created_at, updated_at)
VALUES (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'Vanessa Dreher', '5544991333131', 'vanessadreher@hotmail.com', 'active', 'paciente', 'warm', 'import', 0, true, '1986-05-31', 39, '{"sexo":"Feminino","estado_civil":"Casado","profissao":"Do Lar","endereco":"Avenida Laguna, 733, Ap 1202, Zona 03, Maringá/PR, 87050-260","cpf":"050.696.369-10"}'::jsonb, true, now(), now())
ON CONFLICT DO NOTHING;
INSERT INTO leads (id, clinic_id, name, phone, email, status, phase, temperature, source_type, lead_score, is_active, birth_date, idade, data, wa_opt_in, created_at, updated_at)
VALUES (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'VANESSA JUST', '5544991273456', '', 'active', 'paciente', 'warm', 'import', 0, true, NULL, NULL, '{}'::jsonb, true, now(), now())
ON CONFLICT DO NOTHING;
INSERT INTO leads (id, clinic_id, name, phone, email, status, phase, temperature, source_type, lead_score, is_active, birth_date, idade, data, wa_opt_in, created_at, updated_at)
VALUES (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'Vanessa Rodrigues Souza', '5544991715629', '', 'active', 'paciente', 'warm', 'import', 0, true, NULL, NULL, '{"sexo":"Feminino","origem":"Marci"}'::jsonb, true, now(), now())
ON CONFLICT DO NOTHING;
INSERT INTO leads (id, clinic_id, name, phone, email, status, phase, temperature, source_type, lead_score, is_active, birth_date, idade, data, wa_opt_in, created_at, updated_at)
VALUES (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'VANIA TORRES', '5544998189300', 'lucivanetorres.2022@gmail.com', 'active', 'paciente', 'warm', 'import', 0, true, '1977-10-29', 48, '{"sexo":"Feminino","estado_civil":"Casado","profissao":"Empresario","endereco":"Rua Pará, 2463, Jardim Imperial II, Maringá/PR, 87023-031","cpf":"023.882.319-90"}'::jsonb, true, now(), now())
ON CONFLICT DO NOTHING;
INSERT INTO leads (id, clinic_id, name, phone, email, status, phase, temperature, source_type, lead_score, is_active, birth_date, idade, data, wa_opt_in, created_at, updated_at)
VALUES (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'Vanilda dos Santos Silva', '5544984418115', 'vanildassilva25@gmail.com', 'active', 'paciente', 'warm', 'import', 0, true, '1967-06-12', 58, '{"sexo":"Feminino","estado_civil":"Solteiro","profissao":"Advogado","endereco":"Rua Maria Ermelinda do Prado de Almeida, 42, Ecovalley Ecologic City, Sarandi/PR, 87115-101","cpf":"606.694.899-72","origem":"mormaii"}'::jsonb, true, now(), now())
ON CONFLICT DO NOTHING;
INSERT INTO leads (id, clinic_id, name, phone, email, status, phase, temperature, source_type, lead_score, is_active, birth_date, idade, data, wa_opt_in, created_at, updated_at)
VALUES (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'Vera Lucia', '5544991025554', 'vera_sgb@hotmail.com', 'active', 'paciente', 'warm', 'import', 0, true, '1966-10-19', 59, '{"sexo":"Feminino","estado_civil":"Divorciado","profissao":"Empresa","endereco":"Avenida Laguna, 367, Ed. El Cielo apto 1901, Zona 03, Maringá/PR, 87050-260","cpf":"596.951.029-72"}'::jsonb, true, now(), now())
ON CONFLICT DO NOTHING;
INSERT INTO leads (id, clinic_id, name, phone, email, status, phase, temperature, source_type, lead_score, is_active, birth_date, idade, data, wa_opt_in, created_at, updated_at)
VALUES (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'Victor Gabriel Mor Costa Zamberlan', '5544998633324', '', 'active', 'paciente', 'warm', 'import', 0, true, '2007-12-10', 18, '{"sexo":"Masculino","estado_civil":"Solteiro","profissao":"Estudante","endereco":"Rua Alvarinda Ferreira Jorge, 343, A, Bom Jardim, Maringá/PR, 87047-721","cpf":"133.305.779-24"}'::jsonb, true, now(), now())
ON CONFLICT DO NOTHING;
INSERT INTO leads (id, clinic_id, name, phone, email, status, phase, temperature, source_type, lead_score, is_active, birth_date, idade, data, wa_opt_in, created_at, updated_at)
VALUES (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'Victor Hugo Perenha', '5544998794476', '', 'active', 'paciente', 'warm', 'import', 0, true, '1992-03-18', 34, '{"sexo":"Masculino","estado_civil":"Casado","profissao":"Empresário","endereco":"Avenida João Paulino Vieira Filho, 85, Apto 504, Zona 01, Maringá/PR, 87020-015","cpf":"361.279.218-05"}'::jsonb, true, now(), now())
ON CONFLICT DO NOTHING;
INSERT INTO leads (id, clinic_id, name, phone, email, status, phase, temperature, source_type, lead_score, is_active, birth_date, idade, data, wa_opt_in, created_at, updated_at)
VALUES (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'VICTORIA ESTELA REINO', '5544999072131', 'vick.stela18@gmail.com', 'active', 'paciente', 'warm', 'import', 0, true, '1996-07-18', 29, '{"sexo":"Feminino","estado_civil":"Solteiro","profissao":"Balco farmacista","endereco":"Rua Belém, 485, Apto 3, Parque Residencial Cidade Nova, Maringá/PR, 87023-150","cpf":"097.633.979-01"}'::jsonb, true, now(), now())
ON CONFLICT DO NOTHING;
INSERT INTO leads (id, clinic_id, name, phone, email, status, phase, temperature, source_type, lead_score, is_active, birth_date, idade, data, wa_opt_in, created_at, updated_at)
VALUES (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'Vilma Bernardino', '5544984037262', '', 'active', 'paciente', 'warm', 'import', 0, true, NULL, NULL, '{"sexo":"Feminino","tags_clinica":"Avaliação"}'::jsonb, true, now(), now())
ON CONFLICT DO NOTHING;
INSERT INTO leads (id, clinic_id, name, phone, email, status, phase, temperature, source_type, lead_score, is_active, birth_date, idade, data, wa_opt_in, created_at, updated_at)
VALUES (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'Vitória Heredi Campos', '5544999075853', '', 'active', 'paciente', 'warm', 'import', 0, true, '2000-11-03', 25, '{"sexo":"Feminino","estado_civil":"Solteiro","profissao":"Social Mídia","endereco":"Rua Maria Aparecida Bragion Pignata, 78, Chácaras Aeroporto, Maringá/PR, 87053-358","cpf":"112.513.459-30"}'::jsonb, true, now(), now())
ON CONFLICT DO NOTHING;
INSERT INTO leads (id, clinic_id, name, phone, email, status, phase, temperature, source_type, lead_score, is_active, birth_date, idade, data, wa_opt_in, created_at, updated_at)
VALUES (gen_random_uuid()::text, '00000000-0000-0000-0000-000000000001', 'Viviane Rodrigues', '5544998461139', '', 'active', 'paciente', 'warm', 'import', 0, true, NULL, NULL, '{}'::jsonb, true, now(), now())
ON CONFLICT DO NOTHING;
