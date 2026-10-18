-- =============================================================================
-- Fiche organisme : comptes d'accès à la plateforme et dates de connexion
-- =============================================================================
-- La date de dernière connexion est rangée par Supabase dans auth.users,
-- illisible depuis la page. Cette fonction la donne à l'administratrice
-- seulement, pour les comptes rattachés à un organisme.
-- =============================================================================

create or replace function public.acces_organisme(p_organisme uuid)
returns table (
  id                 uuid,
  email              text,
  nom_affiche        text,
  role               public.role_utilisateur,
  actif              boolean,
  cree_le            timestamptz,
  derniere_connexion timestamptz
)
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
    select p.id, p.email, p.nom_affiche, p.role, p.actif, p.cree_le, u.last_sign_in_at
    from public.profils p
    left join auth.users u on u.id = p.id
    where p.organisme_id = p_organisme
    order by u.last_sign_in_at desc nulls last, p.cree_le;
end;
$$;

revoke all on function public.acces_organisme(uuid) from public, anon;
grant execute on function public.acces_organisme(uuid) to authenticated;
