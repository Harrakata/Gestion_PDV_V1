# Rentabilité des Mobi : règles et suite d'intégration

## Fonctionnement actuel

Le suivi est accessible dans **Point de vente Mobi > Rentabilité et amortissement**. Les investissements, objectifs, charges et règles sont enregistrés dans `app_settings` sous la clé `mobi_rentabilite:global`, avec répartition sur le parc. Les dates de mise en service et d'inactivité sont lues dans `suivi_trm_mobi_v2_export`. Les opérations viennent de `cln_fnir_ccope` ; les versements viennent de `versements_guichetieres`. L'attribution à un Mobi suit le code préposé et les dates d'affectation de la guichetière. Une affectation concurrente n'est pas attribuée arbitrairement.

Le **CA net CCOPE** est calculé à partir du montant enregistré moins les annulations. Le **MT versé** est un indicateur de rapprochement distinct, jamais ajouté au revenu. En l'absence de source comptable du revenu société, l'écran utilise `CA net × taux de contribution paramétré` comme **estimation de gestion seulement**. Sans taux valide ou sans couverture suffisante, le retour sur investissement n'est pas considéré comme fiable. Les jours sans donnée source sont distingués des jours couverts à zéro.

La marge estimée journalière est le revenu estimé moins les charges imputées. Le solde économique est la marge cumulée moins les investissements engagés à leur date. Le taux de récupération est conservé brut, y compris sous 0 % ou au-dessus de 100 %. Le premier franchissement de zéro est affiché, même si un investissement ultérieur ramène le solde sous zéro. La projection utilise soit l'objectif configuré, soit la marge observée sur 30, 60 ou 90 jours couverts ; une moyenne nulle ou négative ne donne pas de date prévisionnelle. La dotation comptable est calculée séparément et n'est pas déduite en même temps que l'investissement dans le solde économique.

Le tableau du parc compare les Mobi, permet de rechercher, filtrer et trier. Le suivi et le comparatif s'exportent en CSV, Excel ou PDF. Les postes d'investissement et de charge peuvent porter une catégorie, une référence de justificatif et un commentaire.

## Source comptable à intégrer

La règle et la source du **revenu réellement acquis à la société** restent à fournir par la comptabilité. Il faut confirmer l'assiette (enjeux, produit des jeux ou autre), le traitement des annulations et remboursements, le taux ou la formule contractuelle, la date de validité de chaque règle et la clé de rattachement au Mobi. Jusque-là, les marges, projections et statuts financiers de l'écran restent indicatifs. Il faut aussi confirmer le traitement des commissions vendeur, taxes, frais de maintenance et investissements immobilisables pour éviter tout double comptage.

## Structures proposées pour la prochaine étape

- `mobi_revenue_rules` : mode de revenu, assiette, taux ou formule, dates de validité et référence du contrat ; aucune valeur par défaut implicite.
- `mobi_daily_revenues` : source, identifiant source unique, date d'exploitation, Mobi, vendeur, agence, montants bruts, annulations, gains éventuels et revenu société validé. Contrainte d'unicité sur `(source, identifiant_source)` pour rendre les imports CSV/Excel idempotents.
- `mobi_financial_entries` : catégorie investissement ou charge, caractère immobilisable, montant ou taux, période, Mobi ou parc, justificatif, commentaire et auteur. Ne pas reprendre automatiquement un même poste dans les deux catégories.
- `mobi_allocation_rules` : méthode forfaitaire, proportionnelle au revenu, aux jours actifs ou manuelle, dates de validité et poids contrôlés.
- `mobi_calculation_runs` : horodatage, plage, version des règles, couverture des sources, anomalies et résultat, pour tracer les recalculs après correction rétroactive.

Ces tables nécessitent des migrations non destructives, des politiques d'accès alignées sur les profils existants et un rapprochement avec les sources réelles avant remplacement de la configuration actuelle. Les imports de recettes ne doivent pas être ouverts avant la définition d'une clé source stable et des règles de dédoublonnage.

## Validation comptable et exploitation

Valider un échantillon de journées et de changements de vendeur contre CCOPE, versements et états comptables. Tester une journée réellement sans vente, une journée absente de la source, les charges mensuelles communes, un investissement complémentaire, une correction rétroactive et le passage exact de 100 %. Définir ensuite les seuils d'alerte, les durées de retour attendues et les droits d'écriture des postes financiers.
