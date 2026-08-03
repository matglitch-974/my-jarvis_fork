// Installateur My Jarvis — fenetre d'installation.
//
// Double-clic, une fenetre s'ouvre, un bouton. Destine a qui n'ouvre jamais un
// terminal : aucune console, aucune commande, aucun jargon.
//
// L'executable ne fait que piloter ; toute la logique reelle reste dans les
// scripts du projet, qui demeurent la source de verite.
//
// Compilation : voir Compiler-natif.ps1 (csc.exe /codepage:65001, /target:winexe).

using System;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.IO.Compression;
using System.Net;
using System.Threading;
using System.Windows.Forms;

internal sealed class Installateur : Form
{
    // Depot amont. Le nom technique porte un tiret (GitHub interdit l'espace) ;
    // le dossier local, lui, garde « My Jarvis » avec son espace.
    private const string Depot = "Grominet95/jarvis-OS";
    private const string Version = "v0.3.2";

    private readonly TextBox _dossier;
    private readonly CheckedListBox _composants;
    private readonly ProgressBar _jauge;
    private readonly Label _etat;
    private readonly TextBox _journal;
    private readonly Button _installer;
    private readonly Button _fermer;

    private string _racine;

    [STAThread]
    private static void Main()
    {
        Application.EnableVisualStyles();
        Application.SetCompatibleTextRenderingDefault(false);
        Application.Run(new Installateur());
    }

    private Installateur()
    {
        _racine = Path.GetDirectoryName(
            Path.GetDirectoryName(Path.GetDirectoryName(Application.ExecutablePath)));

        Text = "Installation de My Jarvis";
        Size = new Size(620, 560);
        StartPosition = FormStartPosition.CenterScreen;
        FormBorderStyle = FormBorderStyle.FixedDialog;
        MaximizeBox = false;
        BackColor = Color.FromArgb(14, 18, 32);
        ForeColor = Color.FromArgb(220, 232, 255);
        Font = new Font("Segoe UI", 9F);

        var titre = new Label
        {
            Text = "My Jarvis",
            Font = new Font("Segoe UI", 20F, FontStyle.Regular),
            ForeColor = Color.White,
            Location = new Point(24, 20),
            AutoSize = true,
        };

        var sous = new Label
        {
            Text = "Cette fenetre installe My Jarvis sur cet ordinateur.\n"
                 + "Rien ne sera installe ailleurs que dans le dossier choisi.",
            Location = new Point(26, 62),
            Size = new Size(560, 40),
            ForeColor = Color.FromArgb(150, 170, 205),
        };

        var lblDossier = new Label
        {
            Text = "Dossier d'installation",
            Location = new Point(26, 116),
            AutoSize = true,
        };

        _dossier = new TextBox
        {
            Text = _racine,
            Location = new Point(26, 138),
            Size = new Size(460, 24),
            BackColor = Color.FromArgb(22, 28, 46),
            ForeColor = Color.White,
            BorderStyle = BorderStyle.FixedSingle,
        };

        var parcourir = new Button
        {
            Text = "Parcourir",
            Location = new Point(494, 137),
            Size = new Size(88, 26),
            FlatStyle = FlatStyle.Flat,
            BackColor = Color.FromArgb(30, 40, 66),
        };
        parcourir.FlatAppearance.BorderColor = Color.FromArgb(60, 78, 120);
        parcourir.Click += (s, e) =>
        {
            using (var d = new FolderBrowserDialog())
            {
                d.Description = "Ou installer My Jarvis ?";
                if (d.ShowDialog() == DialogResult.OK) _dossier.Text = d.SelectedPath;
            }
        };

        var lblComposants = new Label
        {
            Text = "A activer",
            Location = new Point(26, 178),
            AutoSize = true,
        };

        _composants = new CheckedListBox
        {
            Location = new Point(26, 200),
            Size = new Size(556, 90),
            BackColor = Color.FromArgb(22, 28, 46),
            ForeColor = Color.FromArgb(220, 232, 255),
            BorderStyle = BorderStyle.FixedSingle,
            CheckOnClick = true,
        };
        _composants.Items.Add("Voix locale (fonctionne sans connexion)", true);
        _composants.Items.Add("Vision par la camera", false);
        _composants.Items.Add("Raccourci sur le Bureau", true);
        _composants.Items.Add("Demarrer My Jarvis a l'ouverture de session", false);

        _installer = new Button
        {
            Text = "Installer",
            Location = new Point(26, 306),
            Size = new Size(160, 38),
            FlatStyle = FlatStyle.Flat,
            BackColor = Color.FromArgb(45, 125, 210),
            ForeColor = Color.White,
            Font = new Font("Segoe UI", 10F),
        };
        _installer.FlatAppearance.BorderSize = 0;
        _installer.Click += Lancer;

        _etat = new Label
        {
            Text = "Pret.",
            Location = new Point(200, 316),
            Size = new Size(382, 20),
            ForeColor = Color.FromArgb(150, 170, 205),
        };

        _jauge = new ProgressBar
        {
            Location = new Point(26, 356),
            Size = new Size(556, 8),
            Style = ProgressBarStyle.Continuous,
        };

        _journal = new TextBox
        {
            Location = new Point(26, 376),
            Size = new Size(556, 108),
            Multiline = true,
            ReadOnly = true,
            ScrollBars = ScrollBars.Vertical,
            BackColor = Color.FromArgb(10, 14, 26),
            ForeColor = Color.FromArgb(130, 150, 185),
            BorderStyle = BorderStyle.FixedSingle,
            Font = new Font("Consolas", 8.5F),
        };

        _fermer = new Button
        {
            Text = "Fermer",
            Location = new Point(494, 494),
            Size = new Size(88, 26),
            FlatStyle = FlatStyle.Flat,
            BackColor = Color.FromArgb(30, 40, 66),
        };
        _fermer.FlatAppearance.BorderColor = Color.FromArgb(60, 78, 120);
        _fermer.Click += (s, e) => Close();

        Controls.AddRange(new Control[]
        {
            titre, sous, lblDossier, _dossier, parcourir,
            lblComposants, _composants, _installer, _etat, _jauge, _journal, _fermer,
        });
    }

    // ── Affichage ────────────────────────────────────────────────────────
    private void Note(string texte)
    {
        if (InvokeRequired) { BeginInvoke((Action<string>)Note, texte); return; }
        _journal.AppendText(texte + Environment.NewLine);
    }

    private void Avancement(int pourcent, string texte)
    {
        if (InvokeRequired) { BeginInvoke((Action<int, string>)Avancement, pourcent, texte); return; }
        _jauge.Value = Math.Max(0, Math.Min(100, pourcent));
        _etat.Text = texte;
    }

    private void Termine(bool ok, string message)
    {
        if (InvokeRequired) { BeginInvoke((Action<bool, string>)Termine, ok, message); return; }
        _installer.Enabled = true;
        _etat.ForeColor = ok ? Color.FromArgb(80, 200, 140) : Color.FromArgb(230, 90, 95);
        _etat.Text = ok ? "Installation terminee." : "Installation interrompue.";
        MessageBox.Show(this, message, ok ? "My Jarvis" : "Echec",
            MessageBoxButtons.OK, ok ? MessageBoxIcon.Information : MessageBoxIcon.Error);
    }

    // ── Deroulement ──────────────────────────────────────────────────────
    private void Lancer(object envoyeur, EventArgs e)
    {
        _installer.Enabled = false;
        _journal.Clear();
        _racine = _dossier.Text.Trim();
        var fil = new Thread(Travailler) { IsBackground = true };
        fil.Start();
    }

    private void Travailler()
    {
        try
        {
            string projet = Path.Combine(_racine, "base", "jarvis-OS");

            if (Directory.Exists(Path.Combine(projet, "src")))
            {
                Avancement(30, "jarvis-OS deja present.");
                Note("jarvis-OS deja present — telechargement ignore.");
            }
            else
            {
                Avancement(10, "Telechargement de jarvis-OS " + Version + "...");
                Note("Telechargement de jarvis-OS " + Version);
                Telecharger(projet);
            }

            Avancement(40, "Verification des prerequis...");
            Note("uv   : " + (Existe("uv") ? "present" : "absent — sera installe"));
            Note("node : " + (Existe("node") ? "present" : "absent — moteur par abonnement indisponible"));

            Avancement(55, "Construction de l'environnement (plusieurs minutes)...");
            Note("Construction du bundle : Python autonome, dependances, modeles.");
            string recette = Path.Combine(_racine, "miku_scripts", "Construire-bundle.ps1");
            if (!File.Exists(recette))
                throw new FileNotFoundException("Recette introuvable : " + recette);

            int code = Lancer("powershell.exe",
                "-NoProfile -ExecutionPolicy Bypass -File \"" + recette + "\"");
            if (code != 0)
                throw new Exception("La construction a renvoye le code " + code + ".");

            Avancement(90, "Finitions...");
            if (_composants.GetItemChecked(2)) Raccourci();

            Avancement(100, "Termine.");
            Termine(true,
                "My Jarvis est installe.\n\n" +
                "Lancez-le par le raccourci « My Jarvis »,\n" +
                "ou par MyJarvis.cmd dans le dossier d'installation.");
        }
        catch (Exception ex)
        {
            Note("ECHEC : " + ex.Message);
            Termine(false, ex.Message);
        }
    }

    private void Telecharger(string projet)
    {
        // GitHub exige TLS 1.2 ; .NET Framework 4 ne l'active pas toujours seul.
        ServicePointManager.SecurityProtocol = (SecurityProtocolType)3072;

        string url = "https://codeload.github.com/" + Depot + "/zip/refs/tags/" + Version;
        string zip = Path.Combine(Path.GetTempPath(), "jarvis-os-" + Version + ".zip");
        string extrait = Path.Combine(Path.GetTempPath(), "jarvis-os-extrait");

        Note("Source : " + url);
        using (var client = new WebClient())
        {
            client.DownloadProgressChanged += (s, e) =>
                Avancement(10 + e.ProgressPercentage / 5, "Telechargement " + e.ProgressPercentage + " %");
            client.DownloadFileTaskAsync(url, zip).Wait();
        }

        if (Directory.Exists(extrait)) Directory.Delete(extrait, true);
        ZipFile.ExtractToDirectory(zip, extrait);

        string[] racines = Directory.GetDirectories(extrait);
        if (racines.Length == 0) throw new Exception("Archive vide.");
        Directory.CreateDirectory(Path.GetDirectoryName(projet));
        if (Directory.Exists(projet)) Directory.Delete(projet, true);
        Directory.Move(racines[0], projet);
        File.Delete(zip);
        Note("Code place dans " + projet);
    }

    private void Raccourci()
    {
        // Passe par PowerShell : creer un .lnk en C# demanderait une reference COM
        // supplementaire pour un gain nul.
        string cible = Path.Combine(_racine, "MyJarvis.cmd");
        if (!File.Exists(cible)) { Note("Raccourci ignore : MyJarvis.cmd introuvable."); return; }
        string bureau = Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory);
        string script =
            "$s=(New-Object -ComObject WScript.Shell).CreateShortcut('" +
            Path.Combine(bureau, "My Jarvis.lnk") + "');" +
            "$s.TargetPath='" + cible + "';$s.WorkingDirectory='" + _racine + "';$s.Save()";
        Lancer("powershell.exe", "-NoProfile -ExecutionPolicy Bypass -Command \"" + script + "\"");
        Note("Raccourci cree sur le Bureau.");
    }

    private int Lancer(string fichier, string arguments)
    {
        var psi = new ProcessStartInfo(fichier, arguments)
        {
            UseShellExecute = false,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            CreateNoWindow = true,
            WorkingDirectory = _racine,
        };
        using (var p = Process.Start(psi))
        {
            p.OutputDataReceived += (s, e) => { if (!string.IsNullOrEmpty(e.Data)) Note("  " + e.Data); };
            p.ErrorDataReceived  += (s, e) => { if (!string.IsNullOrEmpty(e.Data)) Note("  " + e.Data); };
            p.BeginOutputReadLine();
            p.BeginErrorReadLine();
            p.WaitForExit();
            return p.ExitCode;
        }
    }

    private static bool Existe(string commande)
    {
        try
        {
            var psi = new ProcessStartInfo("where", commande)
            {
                UseShellExecute = false, CreateNoWindow = true, RedirectStandardOutput = true,
            };
            using (var p = Process.Start(psi)) { p.WaitForExit(); return p.ExitCode == 0; }
        }
        catch { return false; }
    }
}
