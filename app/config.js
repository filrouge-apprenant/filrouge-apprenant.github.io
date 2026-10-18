// =============================================================================
// Connexion au projet Supabase « fil-rouge-apprenants » (région Paris).
// =============================================================================
// Ces deux valeurs sont PUBLIQUES par conception : elles identifient le projet,
// elles ne donnent aucun droit. Les droits sont vérifiés par la base elle-même
// (cloisonnement par organisme + double authentification de l'administratrice).
// Ne jamais mettre ici une clé « secret » ou « service_role ».
// =============================================================================

window.FIL_ROUGE_CONFIG = {
  supabaseUrl: "https://cafcevtehuywovvsllvp.supabase.co",
  supabaseCle: "sb_publishable_sp8UoIBe7DMUKXei97PQAw_Kydu7pS8",
  // Boîte Gmail de Fil Rouge : les emails aux apprenants partent de là
  // (fenêtre de rédaction Gmail ouverte déjà remplie, sur ce compte).
  emailFilRouge: "contact.filrouge.apprenant@gmail.com",
};
