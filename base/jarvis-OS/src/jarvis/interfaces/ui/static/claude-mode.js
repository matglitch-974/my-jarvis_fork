/* claude-mode.js — Mode Claude : habillage de l'interface.

   01/08/2026 (demandes 13 et 14 du Maître) :
     - le mode n'est plus optionnel : il est ACTIF en permanence, l'option a
       disparu de Réglages › Apparence ;
     - la glissière latérale « Projets » (poignée à droite) est supprimée. Les
       projets vivent désormais DANS le menu des conversations
       (Capacités › Fils), où chaque conversation appartient à un projet.

   Ce fichier ne fait donc plus qu'une chose : poser la classe `claude-mode`
   sur <html> avant le premier paint. Le CSS (claude-mode.css) fait le reste.
   L'API window.JarvisClaudeMode est conservée pour ne rien casser chez les
   appelants existants ; setEnabled() est volontairement sans effet. */
(function () {
  "use strict";

  var KEY = "jarvis_claude_mode";

  function apply() {
    document.documentElement.classList.add("claude-mode");
    // Ménage : anciennes glissières laissées par une version précédente encore
    // ouverte dans un autre onglet.
    var stale = document.getElementById("cm-panel");
    if (stale) stale.remove();
    var handle = document.getElementById("cm-handle");
    if (handle) handle.remove();
  }

  window.JarvisClaudeMode = {
    enabled: function () { return true; },
    /* Conservé pour compatibilité — le mode ne se désactive plus. */
    setEnabled: function () { apply(); },
    reload: function () {},
  };

  // La préférence n'a plus lieu d'être : on nettoie la clé au passage.
  try { localStorage.removeItem(KEY); } catch (e) {}

  apply();
  if (!document.body) document.addEventListener("DOMContentLoaded", apply);
})();
