-- 005_seed.sql
-- Seed rules and sample challenges/flags.

insert into public.docs(key, value) values
  ('rules', 'EditaCTF Rules
----------------
1. Be respectful. No harassment or abuse.
2. No sharing flags, brute force against infrastructure, or attacking other teams.
3. Automated scanning of the platform is prohibited.
4. One account per participant or team; pick a team name using ''team set <name>''.
5. Flag format: editaCTF{...} unless stated otherwise.
6. Have fun and learn!

Contact organizers for issues.')
on conflict (key) do update set value = excluded.value;

insert into public.challenges (id, name, category, points, difficulty, description, daily, files, hint) values
  ('warmup-echo', 'Echoes in the Terminal', 'pwn', 100, 'easy',
    'Warm up your terminal-fu. Find the hidden echo in a simple output. Sometimes the obvious is the answer.',
    true, '["README.md","challenge.txt","hints.txt"]'::jsonb, 'Try inspecting simple strings and outputs; maybe something is echoed literally.'),
  ('web-sqli', 'Login Bypass 101', 'web', 200, 'medium',
    'A classic web challenge. Can you find a way to log in without knowing the password?',
    false, '["README.md","challenge.txt","hints.txt"]'::jsonb, 'What does '' OR ''1''=''1 do in the right context?'),
  ('crypto-baby-xor', 'Baby XOR', 'crypto', 150, 'easy',
    'Decrypt a message encrypted with a single-byte XOR. Determine the key and recover the plaintext.',
    true, '["README.md","cipher.txt","hints.txt"]'::jsonb, 'Frequency of spaces and common letters can be a giveaway.')
on conflict (id) do nothing;

insert into public.challenge_flags (challenge_id, flag) values
  ('warmup-echo', 'editaCTF{terminal_echo_master}'),
  ('web-sqli', 'editaCTF{no_sql_for_you}'),
  ('crypto-baby-xor', 'editaCTF{xor_treasure}')
on conflict (challenge_id) do nothing;
