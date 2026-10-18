-- =============================================================================
-- Fil Rouge Apprenants — Étape 9 : tableau de bord des accès clients
-- =============================================================================
-- Pour chaque compte (client ou appelante) :
--   - une période d'accès : acces_debut / acces_fin (vide = sans limite).
--     En dehors de cette période, la base traite le compte comme désactivé :
--     il ne voit plus rien, sans que rien ne soit effacé ;
--   - pour un client, ce qu'il a le droit de voir dans son espace :
--       voir_comptes_rendus  historique et comptes rendus d'appel   (appliqué par la base)
--       voir_coaching        stage, projet métier, organisation     (appliqué par la base)
--       voir_avis            avis des apprenants débloqués          (appliqué par la base)
--       voir_examens         suivi d'examen, relances, taux         (vues filtrées + écran)
--       voir_preuves         dossier de preuves Qualiopi et exports (écran)
--     La liste de ses apprenants et leurs alertes restent toujours visibles :
--     c'est le cœur du service.
--   - comptes_acces() : la liste des comptes avec la dernière connexion,
--     pour l'administratrice seulement.
-- =============================================================================

alter table public.profils
  add column acces_debut date,
  add column acces_fin date,
  add column voir_comptes_rendus boolean not null default true,
  add column voir_coaching boolean not null default true,
  add column voir_avis boolean not null default true,
  add column voir_examens boolean not null default true,
  add column voir_preuves boolean not null default true,
  add constraint profils_periode_valide check (acces_fin is null or acces_debut is null or acces_fin >= acces_debut);

comment on column public.profils.acces_debut is 'Premier jour d''accès. Vide = dès la création.';
comment on column public.profils.acces_fin is 'Dernier jour d''accès inclus. Vide = sans limite. Après cette date, le compte ne voit plus rien.';

-- -----------------------------------------------------------------------------
-- Période d'accès : appliquée au cœur du cloisonnement.
-- Hors période, role_actuel() et organisme_actuel() renvoient « null » :
-- toutes les règles d'accès existantes refusent alors, comme pour un compte désactivé.
-- -----------------------------------------------------------------------------

create or replace function prive.dans_periode(p_debut date, p_fin date)
returns boolean
language sql
stable
set search_path = ''
as $$
  select (p_debut is null or p_debut <= prive.aujourdhui())
     and (p_fin is null or p_fin >= prive.aujourdhui())
$$;

create or replace function prive.role_actuel()
returns public.role_utilisateur
language sql
stable
security definer
set search_path = ''
as $$
  select p.role from public.profils p
  where p.id = auth.uid() and p.actif and prive.dans_periode(p.acces_debut, p.acces_fin)
$$;

create or replace function prive.organisme_actuel()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select p.organisme_id from public.profils p
  where p.id = auth.uid() and p.actif and p.role = 'client'
    and prive.dans_periode(p.acces_debut, p.acces_fin)
$$;

-- -----------------------------------------------------------------------------
-- Droits du client connecté. Pour un autre rôle : vrai (les règles propres à
-- l'administratrice et aux appelantes s'appliquent déjà).
-- -----------------------------------------------------------------------------

create or replace function prive.client_peut(p_droit text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when p.role is distinct from 'client' then true
    when p_droit = 'comptes_rendus' then p.voir_comptes_rendus
    when p_droit = 'coaching'       then p.voir_coaching
    when p_droit = 'avis'           then p.voir_avis
    when p_droit = 'examens'        then p.voir_examens
    when p_droit = 'preuves'        then p.voir_preuves
    else false
  end
  from (select 1) x
  left join public.profils p on p.id = auth.uid()
$$;

-- -----------------------------------------------------------------------------
-- Règles de lecture du client : son organisme ET le droit correspondant.
-- -----------------------------------------------------------------------------

drop policy if exists appels_client_lecture on public.appels;
create policy appels_client_lecture on public.appels
  for select to authenticated
  using (organisme_id = prive.organisme_actuel() and (select prive.client_peut('comptes_rendus')));

drop policy if exists coaching_client_lecture on public.coaching;
create policy coaching_client_lecture on public.coaching
  for select to authenticated
  using (organisme_id = prive.organisme_actuel() and (select prive.client_peut('coaching')));

create or replace function public.satisfaction_resultats()
returns table(repondu_le timestamp with time zone, apprenant text, note_globale smallint, note_ecoute smallint,
              note_clarte smallint, note_utilite smallint, frequence text, recommandation smallint,
              point_fort text, amelioration text)
language sql
stable
security definer
set search_path = ''
as $$
  select s.repondu_le,
         case when s.anonyme then 'Anonyme' else concat_ws(' ', a.prenom, a.nom) end,
         s.note_globale, s.note_ecoute, s.note_clarte, s.note_utilite, s.frequence,
         s.recommandation, s.point_fort, s.amelioration
  from public.satisfaction s join public.apprenants a on a.id = s.apprenant_id
  where s.repondu_le is not null and s.partage_client
    and s.organisme_id = prive.organisme_actuel()
    and prive.client_peut('avis')
  order by s.repondu_le desc;
$$;

-- Vues d'examen : vides pour un client sans le droit « examens ».
create or replace view public.vue_relances_examen with (security_invoker = true) as
 WITH base AS (
         SELECT a.id, a.organisme_id, o.nom AS organisme_nom, a.identifiant_externe, a.prenom, a.nom,
            a.telephone, a.parcours, a.statut, a.appelante_id, a.date_examen, a.date_dernier_contact,
            (a.date_examen - prive.aujourdhui()) AS jours_avant_examen
           FROM (public.apprenants a JOIN public.organismes o ON ((o.id = a.organisme_id)))
          WHERE ((a.date_examen IS NOT NULL) AND (a.date_examen >= prive.aujourdhui())
            AND (a.presence_examen IS NULL) AND (a.statut <> 'abandon'::public.statut_apprenant))
            AND (select prive.client_peut('examens'))
        )
 SELECT id, organisme_id, organisme_nom, identifiant_externe, prenom, nom, telephone, parcours, statut,
    appelante_id, date_examen, date_dernier_contact, jours_avant_examen,
        CASE
            WHEN (jours_avant_examen <= 1) THEN 'J-1'::text
            WHEN (jours_avant_examen <= 7) THEN 'J-7'::text
            WHEN (jours_avant_examen <= 30) THEN 'J-30'::text
            ELSE NULL::text
        END AS etape_relance,
    COALESCE((date_dernier_contact >= (date_examen -
        CASE
            WHEN (jours_avant_examen <= 1) THEN 1
            WHEN (jours_avant_examen <= 7) THEN 7
            ELSE 30
        END)), false) AS relance_faite
   FROM base b;

create or replace view public.vue_taux_examen with (security_invoker = true) as
 SELECT a.organisme_id, o.nom AS organisme_nom,
    COALESCE(to_char((a.date_inscription)::timestamp with time zone, 'YYYY-MM'::text), 'sans date'::text) AS cohorte,
    count(*) AS effectif,
    count(*) FILTER (WHERE (a.statut = 'abandon'::public.statut_apprenant)) AS abandons,
    count(*) FILTER (WHERE (a.date_examen IS NOT NULL)) AS inscrits_examen,
    count(*) FILTER (WHERE ((a.date_examen >= prive.aujourdhui()) AND (a.presence_examen IS NULL))) AS a_venir,
    count(*) FILTER (WHERE ((a.date_examen < prive.aujourdhui()) AND (a.presence_examen IS NULL))) AS a_renseigner,
    count(*) FILTER (WHERE (a.presence_examen = 'present'::public.presence_examen)) AS presents,
    count(*) FILTER (WHERE (a.presence_examen = 'absent'::public.presence_examen)) AS absents,
    count(*) FILTER (WHERE (a.resultat_examen = 'reussi'::public.resultat_examen)) AS reussis,
    count(*) FILTER (WHERE (a.resultat_examen = 'echoue'::public.resultat_examen)) AS echoues,
    round(((100.0 * (count(*) FILTER (WHERE (a.presence_examen = 'present'::public.presence_examen)))::numeric) / (NULLIF(count(*) FILTER (WHERE (a.presence_examen IS NOT NULL)), 0))::numeric), 1) AS taux_presence,
    round(((100.0 * (count(*) FILTER (WHERE (a.resultat_examen = 'reussi'::public.resultat_examen)))::numeric) / (NULLIF(count(*) FILTER (WHERE (a.resultat_examen IS NOT NULL)), 0))::numeric), 1) AS taux_reussite,
    o.taux_presence_depart
   FROM (public.apprenants a JOIN public.organismes o ON ((o.id = a.organisme_id)))
  WHERE (select prive.client_peut('examens'))
  GROUP BY a.organisme_id, o.nom, o.taux_presence_depart, COALESCE(to_char((a.date_inscription)::timestamp with time zone, 'YYYY-MM'::text), 'sans date'::text);

-- -----------------------------------------------------------------------------
-- Son propre compte : ni désactivation, ni changement de rôle, ni date de fin.
-- -----------------------------------------------------------------------------

create or replace function prive.protege_propre_compte()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.id = auth.uid() and (
       new.actif is distinct from old.actif
    or new.role is distinct from old.role
    or new.acces_debut is distinct from old.acces_debut
    or new.acces_fin is distinct from old.acces_fin) then
    raise exception 'Vous ne pouvez pas désactiver votre propre compte, changer votre propre rôle ni limiter votre propre accès.'
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- Tableau des accès : comptes + dernière connexion (administratrice seulement).
-- -----------------------------------------------------------------------------

create or replace function public.comptes_acces()
returns table(id uuid, email text, nom_affiche text, role public.role_utilisateur, organisme_id uuid,
              actif boolean, acces_debut date, acces_fin date,
              voir_comptes_rendus boolean, voir_coaching boolean, voir_avis boolean,
              voir_examens boolean, voir_preuves boolean,
              cree_le timestamptz, derniere_connexion timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not prive.est_admin() then
    raise exception 'Réservé à l''administratrice.' using errcode = '42501';
  end if;
  return query
    select p.id, p.email, p.nom_affiche, p.role, p.organisme_id, p.actif, p.acces_debut, p.acces_fin,
           p.voir_comptes_rendus, p.voir_coaching, p.voir_avis, p.voir_examens, p.voir_preuves,
           p.cree_le, u.last_sign_in_at
    from public.profils p
    left join auth.users u on u.id = p.id
    order by p.cree_le;
end;
$$;

revoke all on function public.comptes_acces() from public, anon;
grant execute on function public.comptes_acces() to authenticated;
revoke all on function prive.client_peut(text) from public, anon;
grant execute on function prive.client_peut(text) to authenticated;
grant execute on function prive.dans_periode(date, date) to authenticated;
