-- Échanges commerciaux : deux canaux de plus, WhatsApp et SMS.
alter type public.canal_echange add value if not exists 'whatsapp';
alter type public.canal_echange add value if not exists 'sms';
