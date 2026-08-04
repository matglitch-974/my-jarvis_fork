// Lanceur My Jarvis — tape la commande d'installation a la place de l'utilisateur.
//
// Raison d'etre : le mode neophyte tient en une commande a coller dans un
// terminal. Reste qu'ouvrir un terminal et coller une commande est deja un
// obstacle pour beaucoup. Cet executable fait exactement ce geste, et rien de
// plus : il montre la commande, demande confirmation, la lance.
//
// Il n'installe rien lui-meme. Toute la logique reste dans install.sh (Linux)
// et dans l'installateur en fenetre (Windows), qui demeurent la source de
// verite. Ce fichier n'est qu'un doigt qui appuie sur la touche.
//
// Compilation : voir Compiler-natif.ps1 (csc.exe /codepage:65001, /target:winexe).

using System;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Windows.Forms;

internal sealed class Lanceur : Form
{
    // La commande unique, celle-la meme qui figure dans le README.
    private const string Commande =
        "bash <(curl -fsSL https://raw.githubusercontent.com/" +
        "matglitch-974/my-jarvis_fork/main/install.sh)";

    private readonly TextBox _commande;
    private readonly Label _etat;

    [STAThread]
    private static void Main()
    {
        Application.EnableVisualStyles();
        Application.SetCompatibleTextRenderingDefault(false);
        Application.Run(new Lanceur());
    }

    private Lanceur()
    {
        Text = "Installer My Jarvis";
        Size = new Size(600, 340);
        StartPosition = FormStartPosition.CenterScreen;
        FormBorderStyle = FormBorderStyle.FixedDialog;
        MaximizeBox = false;
        BackColor = Color.FromArgb(14, 18, 32);
        ForeColor = Color.FromArgb(220, 232, 255);
        Font = new Font("Segoe UI", 9F);

        var titre = new Label
        {
            Text = "My Jarvis",
            Font = new Font("Segoe UI", 20F),
            ForeColor = Color.White,
            Location = new Point(24, 20),
            AutoSize = true,
        };

        var sous = new Label
        {
            Text = "Un seul geste. Ce programme lance la commande d'installation\n"
                 + "a votre place, puis l'installateur prend le relais.",
            Location = new Point(26, 62),
            Size = new Size(540, 40),
            ForeColor = Color.FromArgb(150, 170, 205),
        };

        var lbl = new Label
        {
            Text = "Commande qui va etre lancee",
            Location = new Point(26, 114),
            AutoSize = true,
        };

        // Affichee et selectionnable : personne ne doit lancer en aveugle une
        // commande qui telecharge du code.
        _commande = new TextBox
        {
            Text = Commande,
            Location = new Point(26, 136),
            Size = new Size(536, 46),
            Multiline = true,
            ReadOnly = true,
            BackColor = Color.FromArgb(10, 14, 26),
            ForeColor = Color.FromArgb(150, 200, 255),
            BorderStyle = BorderStyle.FixedSingle,
            Font = new Font("Consolas", 9F),
        };

        var lancer = new Button
        {
            Text = "Lancer l'installation",
            Location = new Point(26, 200),
            Size = new Size(190, 38),
            FlatStyle = FlatStyle.Flat,
            BackColor = Color.FromArgb(45, 125, 210),
            ForeColor = Color.White,
            Font = new Font("Segoe UI", 10F),
        };
        lancer.FlatAppearance.BorderSize = 0;
        lancer.Click += (s, e) => Executer();

        var copier = new Button
        {
            Text = "Copier la commande",
            Location = new Point(228, 200),
            Size = new Size(160, 38),
            FlatStyle = FlatStyle.Flat,
            BackColor = Color.FromArgb(30, 40, 66),
        };
        copier.FlatAppearance.BorderColor = Color.FromArgb(60, 78, 120);
        copier.Click += (s, e) =>
        {
            Clipboard.SetText(Commande);
            _etat.Text = "Commande copiee. Collez-la dans un terminal si vous preferez.";
        };

        _etat = new Label
        {
            Text = "",
            Location = new Point(26, 252),
            Size = new Size(536, 40),
            ForeColor = Color.FromArgb(150, 170, 205),
        };

        Controls.AddRange(new Control[] { titre, sous, lbl, _commande, lancer, copier, _etat });
    }

    private void Executer()
    {
        // Sous Windows il n'y a pas de bash : on cherche WSL, puis Git Bash.
        // Sans l'un des deux, on ne bluffe pas — on le dit, et on propose
        // l'installateur natif, qui lui n'a besoin de rien.
        string bash = TrouverBash();
        if (bash == null)
        {
            var r = MessageBox.Show(this,
                "Aucun bash n'est disponible sur cet ordinateur.\n\n" +
                "La commande d'installation vise Linux. Sous Windows, utilisez\n" +
                "plutot « Installer My Jarvis.exe », qui installe sans terminal.\n\n" +
                "Ouvrir le dossier pour le trouver ?",
                "Installation Windows", MessageBoxButtons.YesNo, MessageBoxIcon.Information);
            if (r == DialogResult.Yes)
            {
                try { Process.Start("explorer.exe", Path.GetDirectoryName(Application.ExecutablePath)); }
                catch { }
            }
            return;
        }

        try
        {
            // La fenetre du terminal reste VISIBLE : l'installateur y dessine
            // son interface, et le Maitre doit voir ce qui se passe.
            Process.Start(new ProcessStartInfo(bash, "-lc \"" + Commande.Replace("\"", "\\\"") + "\"")
            {
                UseShellExecute = true,
            });
            _etat.Text = "Installation lancee dans une fenetre de terminal.";
        }
        catch (Exception ex)
        {
            MessageBox.Show(this, ex.Message, "Echec du lancement",
                MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
    }

    private static string TrouverBash()
    {
        string[] pistes =
        {
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.System), "bash.exe"),
            @"C:\Program Files\Git\bin\bash.exe",
            @"C:\Program Files\Git\usr\bin\bash.exe",
        };
        foreach (string p in pistes) if (File.Exists(p)) return p;
        return null;
    }
}
