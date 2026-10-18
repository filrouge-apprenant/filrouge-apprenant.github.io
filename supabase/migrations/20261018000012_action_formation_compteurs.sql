-- =============================================================================
-- Action de formation + compteurs de contacts
-- =============================================================================
-- 1. Deux dates sur chaque apprenant :
--      date_entree_formation : entrée officielle en formation
--      date_sortie_formation : sortie prévue (ou réelle) de formation
-- 2. Vue « vue_contacts_apprenant » : par apprenant,
--      tentatives = tous les contacts notés, quel que soit le résultat ou le canal
--      aboutis    = seulement les contacts où la personne a été réellement eue (« joint »)
-- 3. « Qui rappeler » renvoie aussi ces 4 informations (colonnes ajoutées à la fin).
-- Les vues sont en security_invoker : chacun ne voit que ce que ses droits permettent.
-- =============================================================================

alter table public.apprenants
  add column date_entree_formation date,
  add column date_sortie_formation date,
  add constraint sortie_apres_entree
    check (date_sortie_formation is null or date_entree_formation is null
           or date_sortie_formation >= date_entree_formation);

comment on column public.apprenants.date_entree_formation is 'Entrée officielle en formation (action de formation).';
comment on column public.apprenants.date_sortie_formation is 'Sortie de formation (date de fin prévue ou réelle).';

create or replace view public.vue_contacts_apprenant
with (security_invoker = true)
as
select
  ap.apprenant_id,
  count(*)::int                                          as tentatives,
  (count(*) filter (where ap.resultat = 'joint'))::int   as aboutis,
  (count(*) filter (where ap.canal = 'telephone'))::int  as appels_telephone,
  min(ap.organisme_id::text)::uuid                       as organisme_id  -- un appel suit toujours l'organisme de l'apprenant
from public.appels ap
group by ap.apprenant_id;

comment on view public.vue_contacts_apprenant is
  'Par apprenant : tentatives de contact (tout résultat) et contacts aboutis (personne réellement eue).';

grant select on public.vue_contacts_apprenant to authenticated;
revoke insert, update, delete, truncate, references, trigger on public.vue_contacts_apprenant from authenticated;
revoke all on public.vue_contacts_apprenant from anon;

create or replace view public.vue_qui_rappeler
with (security_invoker = true)
as
select
  a.id,
  a.organisme_id,
  o.nom                                   as organisme_nom,
  a.identifiant_externe,
  a.prenom,
  a.nom,
  a.telephone,
  a.parcours,
  a.avancement_pct,
  a.derniere_connexion,
  a.date_dernier_contact,
  a.statut,
  a.appelante_id,
  (prive.aujourdhui() - coalesce(a.date_dernier_contact, a.date_inscription, a.cree_le::date)) as jours_sans_contact,
  case
    when (prive.aujourdhui() - coalesce(a.date_dernier_contact, a.date_inscription, a.cree_le::date)) <= o.seuil_vert_jours   then 'vert'
    when (prive.aujourdhui() - coalesce(a.date_dernier_contact, a.date_inscription, a.cree_le::date)) <= o.seuil_orange_jours then 'orange'
    else 'rouge'
  end                                     as alerte,
  a.date_examen,
  a.date_entree_formation,
  a.date_sortie_formation,
  coalesce(c.tentatives, 0)               as tentatives,
  coalesce(c.aboutis, 0)                  as aboutis
from public.apprenants a
join public.organismes o on o.id = a.organisme_id
left join public.vue_contacts_apprenant c on c.apprenant_id = a.id
where a.statut = 'actif';
