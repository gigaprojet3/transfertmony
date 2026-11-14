// Partagé client / serveur : aucune dépendance serveur ici.

/**
 * Statuts internes (machine à états) -> libellés affichés.
 *
 *   PENDING ─► COLLECTING ─► COLLECTED ─► PAYOUT_PROCESSING ─► COMPLETED
 *      │            │                            │
 *      └────────────┴──► FAILED                  └──► PAYOUT_FAILED ─► REFUNDED
 *                   └──► ON_HOLD (anomalie de montant : vérification manuelle)
 */
export const STATUS_META = {
  PENDING: { label: "En attente", tone: "pending", hint: "Transfert créé" },
  COLLECTING: { label: "En attente", tone: "pending", hint: "Validez le paiement sur votre téléphone" },
  COLLECTED: { label: "Encaissé", tone: "progress", hint: "Fonds reçus, envoi au destinataire" },
  PAYOUT_PROCESSING: { label: "Encaissé", tone: "progress", hint: "Envoi au destinataire en cours" },
  COMPLETED: { label: "Transféré", tone: "success", hint: "Le destinataire a reçu les fonds" },
  FAILED: { label: "Échoué", tone: "danger", hint: "Aucun montant n'a été débité" },
  PAYOUT_FAILED: { label: "Échoué", tone: "danger", hint: "Envoi impossible, remboursement en cours" },
  ON_HOLD: { label: "En vérification", tone: "pending", hint: "Notre équipe vérifie ce transfert" },
  REFUNDED: { label: "Remboursé", tone: "neutral", hint: "Le montant vous a été rendu" },
};

export const TERMINAL_STATUSES = ["COMPLETED", "FAILED", "REFUNDED"];

export const isTerminal = (status) => TERMINAL_STATUSES.includes(status);
