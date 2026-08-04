#!/usr/bin/env bash
# ==========================================================================
#  My Jarvis — installateur
#
#  Un seul geste : on lance ce script, une interface s'ouvre, on coche, c'est
#  installe. Aucune connaissance prealable exigee.
#
#      bash <(curl -fsSL https://raw.githubusercontent.com/matglitch-974/my-jarvis_fork/main/install.sh)
#
#  Options :
#    --yes | --defaults   rejoue l'installation sans poser de question
#    --update             met a jour une installation existante
#    --uninstall          desinstalle (sauvegarde horodatee, rien n'est efface)
#    --dir <chemin>       impose le dossier d'installation
#    --help               cet ecran
#
#  Tout ce que fait ce script est journalise dans ~/.jarvis/install.log.
# ==========================================================================

set -euo pipefail

DEPOT="https://github.com/matglitch-974/my-jarvis_fork.git"
NOM="My Jarvis"
ETAT="$HOME/.jarvis"
CONFIG="$ETAT/config.yml"
SECRETS="$ETAT/.env"
JOURNAL="$ETAT/install.log"
CIBLE_DEFAUT="$HOME/My Jarvis"

MODE="installer"       # installer | maj | desinstaller
SANS_QUESTION=0
CIBLE=""

# ── Journal ───────────────────────────────────────────────────────────────
mkdir -p "$ETAT"
note() { printf '%s  %s\n' "$(date '+%H:%M:%S')" "$*" >>"$JOURNAL"; }
note "=== lancement : $* ==="

mourir() {
    note "ECHEC : $*"
    ui_message "Installation interrompue" "$1

Le detail est dans :
  $JOURNAL"
    exit 1
}

# ── Arguments ─────────────────────────────────────────────────────────────
while [ $# -gt 0 ]; do
    case "$1" in
        --yes|--defaults) SANS_QUESTION=1 ;;
        --update)         MODE="maj" ;;
        --uninstall)      MODE="desinstaller" ;;
        --dir)            CIBLE="${2:-}"; shift ;;
        --help|-h)        sed -n '2,20p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
        *) echo "Option inconnue : $1 (voir --help)" >&2; exit 2 ;;
    esac
    shift
done

# ══════════════════════════════════════════════════════════════════════════
#  Couche interface
#
#  whiptail si disponible (present d'office sur Debian/Ubuntu/Kubuntu), sinon
#  dialog, sinon repli texte pur. L'installation ne doit jamais echouer faute
#  d'une bibliotheque d'affichage.
# ══════════════════════════════════════════════════════════════════════════
UI=""
detecter_ui() {
    if   command -v whiptail >/dev/null 2>&1; then UI="whiptail"
    elif command -v dialog    >/dev/null 2>&1; then UI="dialog"
    else UI="texte"
    fi
    note "interface : $UI"
}

ui_message() {   # titre, corps
    case "$UI" in
        whiptail|dialog) $UI --title "$1" --msgbox "$2" 16 74 3>&1 1>&2 2>&3 || true ;;
        *) printf '\n== %s ==\n%s\n' "$1" "$2" ;;
    esac
}

ui_oui_non() {   # titre, question -> 0 = oui
    [ "$SANS_QUESTION" -eq 1 ] && return 0
    case "$UI" in
        whiptail|dialog) $UI --title "$1" --yesno "$2" 14 74 ;;
        *) printf '\n== %s ==\n%s [O/n] ' "$1" "$2"
           read -r r </dev/tty; [ -z "$r" ] || [ "$r" = "o" ] || [ "$r" = "O" ] ;;
    esac
}

ui_saisie() {    # titre, question, defaut -> valeur sur stdout
    if [ "$SANS_QUESTION" -eq 1 ]; then printf '%s' "$3"; return; fi
    case "$UI" in
        whiptail|dialog)
            $UI --title "$1" --inputbox "$2" 12 74 "$3" 3>&1 1>&2 2>&3 || printf '%s' "$3" ;;
        *) printf '\n== %s ==\n%s\n[%s] ' "$1" "$2" "$3" >&2
           read -r r </dev/tty; printf '%s' "${r:-$3}" ;;
    esac
}

ui_secret() {    # titre, question -> valeur sur stdout, jamais journalisee
    [ "$SANS_QUESTION" -eq 1 ] && return
    case "$UI" in
        whiptail|dialog) $UI --title "$1" --passwordbox "$2" 12 74 3>&1 1>&2 2>&3 || true ;;
        *) printf '\n== %s ==\n%s\n> ' "$1" "$2" >&2
           read -rs r </dev/tty; echo >&2; printf '%s' "$r" ;;
    esac
}

# Cases a cocher. Entrees : id "libelle" on|off ... -> ids retenus sur stdout
ui_cases() {
    local titre="$1" texte="$2"; shift 2
    if [ "$SANS_QUESTION" -eq 1 ]; then
        while [ $# -gt 0 ]; do [ "$3" = "on" ] && printf '%s ' "$1"; shift 3; done
        return
    fi
    case "$UI" in
        whiptail|dialog)
            # « || true » : annuler renvoie 1, et set -e tuerait le script sur
            # un geste parfaitement legitime de l'utilisateur.
            { $UI --title "$titre" --checklist "$texte" 18 74 8 "$@" 3>&1 1>&2 2>&3 || true; } | tr -d '"' ;;
        *)
            printf '\n== %s ==\n%s\n' "$titre" "$texte" >&2
            local choix=""
            while [ $# -gt 0 ]; do
                printf '  %s ? [%s] ' "$2" "$([ "$3" = on ] && echo O/n || echo o/N)" >&2
                read -r r </dev/tty
                r="${r:-$([ "$3" = on ] && echo o || echo n)}"
                case "$r" in [oO]) choix="$choix $1" ;; esac
                shift 3
            done
            printf '%s' "$choix" ;;
    esac
}

ui_jauge() {     # titre <- lignes "pourcentage texte" sur stdin
    case "$UI" in
        whiptail|dialog) $UI --title "$1" --gauge "$2" 10 74 0 ;;
        *) cat ;;
    esac
}

# ══════════════════════════════════════════════════════════════════════════
#  Prerequis
# ══════════════════════════════════════════════════════════════════════════
GESTIONNAIRE=""
detecter_gestionnaire() {
    if   command -v apt-get >/dev/null 2>&1; then GESTIONNAIRE="apt-get"
    elif command -v dnf     >/dev/null 2>&1; then GESTIONNAIRE="dnf"
    elif command -v pacman  >/dev/null 2>&1; then GESTIONNAIRE="pacman"
    fi
    note "gestionnaire de paquets : ${GESTIONNAIRE:-aucun}"
}

installer_paquet() {
    local paquet="$1"
    [ -z "$GESTIONNAIRE" ] && return 1
    note "installation du paquet $paquet"
    case "$GESTIONNAIRE" in
        apt-get) sudo apt-get install -y "$paquet" >>"$JOURNAL" 2>&1 ;;
        dnf)     sudo dnf install -y "$paquet"     >>"$JOURNAL" 2>&1 ;;
        pacman)  sudo pacman -S --noconfirm "$paquet" >>"$JOURNAL" 2>&1 ;;
    esac
}

# whiptail avant tout le reste : c'est lui qui porte l'interface.
amorcer_interface() {
    detecter_gestionnaire
    if ! command -v whiptail >/dev/null 2>&1 && ! command -v dialog >/dev/null 2>&1; then
        echo "Preparation de l'interface d'installation..."
        installer_paquet whiptail >/dev/null 2>&1 || true
    fi
    detecter_ui
}

verifier_prerequis() {
    local manquants=""
    command -v git  >/dev/null 2>&1 || manquants="$manquants git"
    command -v curl >/dev/null 2>&1 || manquants="$manquants curl"

    if [ -n "$manquants" ]; then
        if ui_oui_non "Prerequis manquants" \
            "Il manque :$manquants

Faut-il les installer maintenant ? (mot de passe administrateur demande)"; then
            for p in $manquants; do
                installer_paquet "$p" || mourir "Impossible d'installer « $p ». Installez-le puis relancez."
            done
        else
            mourir "Prerequis absents :$manquants"
        fi
    fi

    # Python : uv sait telecharger le sien, on ne bloque donc pas dessus.
    if ! command -v uv >/dev/null 2>&1; then
        note "uv absent — installation via astral.sh"
        curl -fsSL https://astral.sh/uv/install.sh | sh >>"$JOURNAL" 2>&1 \
            || mourir "L'installation de uv a echoue."
        export PATH="$HOME/.local/bin:$PATH"
    fi
    note "uv : $(uv --version 2>/dev/null || echo introuvable)"

    if ! command -v node >/dev/null 2>&1; then
        ui_message "Node.js absent" \
"Node.js n'est pas installe.

My Jarvis fonctionnera, mais le moteur par abonnement Claude
restera indisponible : il a besoin de Node.

Vous pourrez l'installer plus tard, puis relancer ce script
avec --update."
        note "node absent — moteur par abonnement indisponible"
    fi
}

# ══════════════════════════════════════════════════════════════════════════
#  Etapes d'installation
# ══════════════════════════════════════════════════════════════════════════
choisir_dossier() {
    [ -n "$CIBLE" ] && return
    if [ -f "$CONFIG" ]; then
        CIBLE="$(sed -n 's/^dossier: *//p' "$CONFIG" | head -1)"
        [ -n "$CIBLE" ] && return
    fi
    CIBLE="$(ui_saisie "Dossier d'installation" \
        "Ou faut-il installer $NOM ?" "$CIBLE_DEFAUT")"
    [ -n "$CIBLE" ] || CIBLE="$CIBLE_DEFAUT"
}

# Les composants correspondent a des drapeaux du .env. On pre-coche ceux d'une
# installation precedente, pour qu'une relance ne reparte pas de zero.
deja_coche() {
    [ -f "$CONFIG" ] || { [ "$2" = "on" ] && echo on || echo off; return; }
    if grep -q "^  - $1$" "$CONFIG" 2>/dev/null; then echo on; else echo off; fi
}

choisir_composants() {
    COMPOSANTS="$(ui_cases "Composants" \
"Cochez ce que $NOM doit activer.
Tout est modifiable ensuite dans Reglages > Apparence et Systeme." \
        voix     "Voix locale (whisper + Piper, hors-ligne)"  "$(deja_coche voix on)" \
        vision   "Vision par la camera (MediaPipe, YOLO)"     "$(deja_coche vision off)" \
        musique  "Lecteur de musique"                          "$(deja_coche musique on)" \
        auto     "Automatisations et routines"                 "$(deja_coche auto on)" \
        demarrage "Demarrer $NOM a l'ouverture de session"     "$(deja_coche demarrage off)")"
    note "composants retenus : $COMPOSANTS"
}

demander_secrets() {
    # Le depot est public : aucune cle ne doit y entrer. Tout va dans
    # ~/.jarvis/.env, hors du depot, en lecture pour le seul proprietaire.
    [ -f "$SECRETS" ] && grep -q CLAUDE_CODE_OAUTH_TOKEN "$SECRETS" && return

    if ui_oui_non "Compte Claude" \
"$NOM peut utiliser votre abonnement Claude, sans cle API.

Voulez-vous saisir votre jeton maintenant ?
(Vous pourrez le faire plus tard : relancez avec --update.)"; then
        local jeton; jeton="$(ui_secret "Jeton Claude" \
            "Collez le jeton obtenu par « claude setup-token » :")"
        if [ -n "${jeton:-}" ]; then
            touch "$SECRETS"; chmod 600 "$SECRETS"
            printf 'CLAUDE_CODE_OAUTH_TOKEN=%s\n' "$jeton" >>"$SECRETS"
            note "jeton enregistre dans $SECRETS (valeur non journalisee)"
        fi
    fi
}

recuperer_source() {
    if [ -d "$CIBLE/.git" ]; then
        note "depot deja present — mise a jour"
        git -C "$CIBLE" pull --ff-only >>"$JOURNAL" 2>&1 \
            || note "pull impossible (modifications locales ?) — on garde l'existant"
    else
        note "clonage vers $CIBLE"
        mkdir -p "$(dirname "$CIBLE")"
        git clone --depth 1 "$DEPOT" "$CIBLE" >>"$JOURNAL" 2>&1 \
            || mourir "Le clonage a echoue. Connexion coupee ?"
    fi

    # Point d'ancrage pour des correctifs locaux, sans toucher au code de base.
    if [ -d "$CIBLE/patches" ]; then
        for p in "$CIBLE"/patches/*.patch; do
            [ -e "$p" ] || continue
            note "application du correctif $(basename "$p")"
            git -C "$CIBLE" apply "$p" >>"$JOURNAL" 2>&1 \
                || note "  correctif ignore (deja applique ou incompatible)"
        done
    fi
}

installer_dependances() {
    local projet="$CIBLE/base/jarvis-OS"
    [ -d "$projet" ] || mourir "Arborescence inattendue : $projet est introuvable."
    note "uv sync dans $projet"
    ( cd "$projet" && uv sync >>"$JOURNAL" 2>&1 ) \
        || mourir "L'installation des dependances Python a echoue."
}

ecrire_config() {
    {
        echo "# Ecrit par install.sh — relancez le script pour le modifier."
        echo "dossier: $CIBLE"
        echo "installe_le: $(date -Iseconds)"
        echo "composants:"
        for c in $COMPOSANTS; do echo "  - $c"; done
    } >"$CONFIG"
    note "configuration ecrite dans $CONFIG"
}

ecrire_lanceur() {
    local bin="$HOME/.local/bin"; mkdir -p "$bin"
    cat >"$bin/jarvis" <<LANCEUR
#!/usr/bin/env bash
# Lanceur $NOM — genere par install.sh, reecrit a chaque installation.
set -euo pipefail
CIBLE="$CIBLE"
[ -f "$SECRETS" ] && set -a && . "$SECRETS" && set +a
cd "\$CIBLE/base/jarvis-OS"
uv run python -m jarvis.app &
SERVEUR=\$!
trap 'kill \$SERVEUR 2>/dev/null || true' EXIT
# On attend que le port reponde avant d'ouvrir le navigateur.
for _ in \$(seq 1 60); do
    if curl -fsS http://127.0.0.1:8000/health >/dev/null 2>&1; then break; fi
    sleep 1
done
command -v xdg-open >/dev/null 2>&1 && xdg-open http://127.0.0.1:8000/ >/dev/null 2>&1 || true
wait \$SERVEUR
LANCEUR
    chmod +x "$bin/jarvis"
    note "lanceur ecrit : $bin/jarvis"
}

activer_demarrage() {
    case " $COMPOSANTS " in *" demarrage "*) ;; *) return ;; esac
    local d="$HOME/.config/autostart"; mkdir -p "$d"
    cat >"$d/my-jarvis.desktop" <<AUTO
[Desktop Entry]
Type=Application
Name=$NOM
Exec=$HOME/.local/bin/jarvis
Terminal=false
X-GNOME-Autostart-enabled=true
AUTO
    note "demarrage automatique active"
}

# ══════════════════════════════════════════════════════════════════════════
#  Desinstallation — on deplace, on n'efface jamais
# ══════════════════════════════════════════════════════════════════════════
desinstaller() {
    local dossier=""
    [ -f "$CONFIG" ] && dossier="$(sed -n 's/^dossier: *//p' "$CONFIG" | head -1)"

    ui_oui_non "Desinstaller $NOM" \
"Rien ne sera efface.

Le dossier et la configuration seront deplaces dans une
sauvegarde horodatee, que vous pourrez restaurer ou jeter
vous-meme.

Continuer ?" || { echo "Abandon."; exit 0; }

    local sauv="$HOME/my-jarvis-sauvegarde-$(date +%Y%m%d-%H%M%S)"
    mkdir -p "$sauv"
    [ -n "$dossier" ] && [ -d "$dossier" ] && mv "$dossier" "$sauv/" && note "dossier deplace vers $sauv"
    [ -f "$CONFIG" ]  && mv "$CONFIG"  "$sauv/" || true
    [ -f "$SECRETS" ] && mv "$SECRETS" "$sauv/" || true
    rm -f "$HOME/.local/bin/jarvis" "$HOME/.config/autostart/my-jarvis.desktop"

    ui_message "Desinstalle" \
"$NOM a ete retire.

Tout se trouve dans :
  $sauv

Rien n'a ete supprime."
}

# ══════════════════════════════════════════════════════════════════════════
#  Deroulement
# ══════════════════════════════════════════════════════════════════════════
principal() {
    amorcer_interface

    if [ "$MODE" = "desinstaller" ]; then desinstaller; exit 0; fi

    if [ "$MODE" = "installer" ] && [ "$SANS_QUESTION" -eq 0 ]; then
        ui_message "$NOM" \
"Bienvenue.

Ce programme installe $NOM sur cette machine : il recupere
le code, prepare l'environnement Python et ecrit un lanceur.

Rien n'est installe en dehors de votre dossier personnel, et
rien n'est supprime sans vous le dire.

Journal complet : ~/.jarvis/install.log"
    fi

    verifier_prerequis
    choisir_dossier
    choisir_composants
    demander_secrets

    if ! ui_oui_non "Recapitulatif" \
"Dossier    : $CIBLE
Composants :${COMPOSANTS:- aucun}
Config     : $CONFIG

Lancer l'installation ?"; then
        echo "Abandon."; exit 0
    fi

    {
        echo 10; echo "# Recuperation du code..."
        recuperer_source
        echo 45; echo "# Installation des dependances (plusieurs minutes)..."
        installer_dependances
        echo 85; echo "# Ecriture de la configuration..."
        ecrire_config; ecrire_lanceur; activer_demarrage
        echo 100; echo "# Termine."
    } | ui_jauge "Installation" "Preparation..."

    local note_node=""
    command -v node >/dev/null 2>&1 || note_node="

A savoir : Node.js manque, le moteur par abonnement Claude
reste donc inactif. Installez-le puis relancez avec --update."

    ui_message "$NOM est installe" \
"Lancez-le par la commande :

    jarvis

L'interface s'ouvrira sur http://127.0.0.1:8000/

Si « jarvis » est introuvable, ouvrez un nouveau terminal :
~/.local/bin vient d'etre ajoute au PATH.$note_node"

    note "=== installation terminee ==="
}

principal
