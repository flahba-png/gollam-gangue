import React, { useState } from "react";
import { C } from "../theme";
import Chat from "./Chat";
import SuiviClient from "./SuiviClient";

// Espace Messages unifié : bascule entre le chat d'Équipe et le Suivi Client.
export default function Messages({
  // Chat (équipe)
  boutiqueActive, userId, monNom, onStatut,
  // Suivi client
  credits, historique, boutiqueId, boutique, onImprimer, onNouvelleVente, onDevis,
}) {
  const [vue, setVue] = useState("equipe"); // equipe | clients

  const ongletStyle = (actif) => ({
    flex: 1, padding: "8px 0", borderRadius: 8, fontSize: 13, fontWeight: "bold", cursor: "pointer",
    border: "none", background: actif ? C.green : "transparent", color: actif ? C.bg : C.muted,
  });

  return (
    <div>
      <div style={{ display: "flex", gap: 4, background: C.surface2, borderRadius: 10, padding: 4, margin: "0 12px 10px" }}>
        <button onClick={() => setVue("equipe")} style={ongletStyle(vue === "equipe")}>👥 Équipe</button>
        <button onClick={() => setVue("clients")} style={ongletStyle(vue === "clients")}>📇 Clients</button>
      </div>

      {vue === "equipe" ? (
        <Chat boutiqueActive={boutiqueActive} userId={userId} monNom={monNom} onStatut={onStatut} />
      ) : (
        <SuiviClient credits={credits} historique={historique} boutiqueId={boutiqueId} boutique={boutique}
          monNom={monNom} onImprimer={onImprimer} onNouvelleVente={onNouvelleVente} onDevis={onDevis} onStatut={onStatut} />
      )}
    </div>
  );
}
