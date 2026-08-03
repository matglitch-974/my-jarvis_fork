// My Jarvis — fenêtre native (WebView2), v3.
// Splash instantané + FIL DE CHARGEMENT RÉEL : 3 lignes max, la plus récente en bas,
// chaque ligne = un événement réellement observé (démarrage des processus, sortie
// console réelle du serveur jarvis-OS pendant son boot). Rien de fictif.
// Services démarrés cachés ; barre de titre bleu nuit (DWM) ; <1 s si déjà en ligne.

using System;
using System.Diagnostics;
using System.IO;
using System.Net;
using System.Runtime.InteropServices;
using System.Text.RegularExpressions;
using System.Threading.Tasks;
using System.Windows.Forms;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

internal sealed class MainForm : Form
{
    [DllImport("dwmapi.dll")]
    private static extern int DwmSetWindowAttribute(IntPtr hwnd, int attr, ref int value, int size);

    private const string JarvisUrl = "http://127.0.0.1:8000/";
    private const string ServerProbe = "http://127.0.0.1:8000/admin";

    private readonly WebView2 _webView;
    private readonly string _root;

    public MainForm(string root)
    {
        _root = root;
        Text = "My Jarvis";
        Width = 1320;
        Height = 860;
        MinimumSize = new System.Drawing.Size(640, 480);
        StartPosition = FormStartPosition.CenterScreen;
        try { Icon = new System.Drawing.Icon(Path.Combine(root, "MyJarvis.ico")); } catch { }

        _webView = new WebView2();
        _webView.Dock = DockStyle.Fill;
        _webView.DefaultBackgroundColor = System.Drawing.Color.FromArgb(6, 10, 22);
        Controls.Add(_webView);
        Load += OnLoad;
    }

    protected override void OnHandleCreated(EventArgs e)
    {
        base.OnHandleCreated(e);
        int caption = 0x0030140A; // bleu nuit rgb(10,20,48), COLORREF 0x00BBGGRR
        DwmSetWindowAttribute(Handle, 35, ref caption, 4);
        int text = 0x00FFFFFF;
        DwmSetWindowAttribute(Handle, 36, ref text, 4);
    }

    // Pousse une ligne réelle dans le fil du splash (thread-safe).
    private void ReportStep(string message)
    {
        if (string.IsNullOrEmpty(message) || !IsHandleCreated) return;
        try
        {
            BeginInvoke((Action)delegate
            {
                try
                {
                    if (_webView.CoreWebView2 != null)
                        _webView.CoreWebView2.ExecuteScriptAsync("addStep(" + JsString(message) + ")");
                }
                catch { }
            });
        }
        catch { }
    }

    private static string JsString(string s)
    {
        return "'" + s.Replace("\\", "\\\\").Replace("'", "\\'").Replace("\r", "").Replace("\n", " ") + "'";
    }

    private async void OnLoad(object sender, EventArgs e)
    {
        string userData = Path.Combine(_root, "data", "webview2-userdata");
        Directory.CreateDirectory(userData);
        try
        {
            CoreWebView2Environment env = await CoreWebView2Environment.CreateAsync(null, userData);
            await _webView.EnsureCoreWebView2Async(env);
        }
        catch (Exception ex)
        {
            MessageBox.Show("WebView2 indisponible : " + ex.Message, "My Jarvis", MessageBoxButtons.OK, MessageBoxIcon.Error);
            Close();
            return;
        }

        // Chemin rapide seulement si LES DEUX services répondent (serveur ET sidecar) —
        // un serveur debout avec un sidecar mort donnerait un Jarvis muet.
        if (Services.PortUp(ServerProbe, 700) && Services.PortUp("http://127.0.0.1:4981/health", 700))
        {
            _webView.CoreWebView2.Navigate(JarvisUrl);
            return;
        }

        _webView.CoreWebView2.NavigateToString(SplashHtml());
        string rootCopy = _root;
        Action<string> report = ReportStep;
        bool ok = await Task.Run((Func<bool>)delegate { return Services.EnsureAll(rootCopy, 150, report); });
        if (ok) _webView.CoreWebView2.Navigate(JarvisUrl);
        else _webView.CoreWebView2.NavigateToString(ErrorHtml());
    }

    private static string SplashHtml()
    {
        return "<!doctype html><html><head><meta charset='utf-8'><style>" +
               "body{margin:0;height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;" +
               "background:#060a16;color:#9db4d8;font-family:'Segoe UI',sans-serif}" +
               ".ring{width:96px;height:96px;border-radius:50%;border:8px solid #2b4d7b;animation:p 1.6s ease-in-out infinite}" +
               "@keyframes p{0%,100%{opacity:.35}50%{opacity:1}}" +
               "h1{font-weight:500;letter-spacing:.35em;margin:28px 0 0;color:#eaf2ff;font-size:18px}" +
               "#feed{margin-top:22px;height:190px;overflow:hidden;display:flex;flex-direction:column;justify-content:flex-end;" +
               "font-family:'Cascadia Mono',Consolas,monospace;font-size:11.5px;letter-spacing:.04em;color:#7f97bd;text-align:center;max-width:80vw}" +
               "#feed div{line-height:19px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}" +
               "#feed div:last-child{color:#b9cdec}" +
               "</style></head><body><div class='ring'></div><h1>MY JARVIS</h1><div id='feed'></div>" +
               "<script>function addStep(t){var f=document.getElementById('feed');var d=document.createElement('div');" +
               "d.textContent=t;f.appendChild(d);while(f.children.length>10){f.removeChild(f.firstChild);}}</script>" +
               "</body></html>";
    }

    private static string ErrorHtml()
    {
        return "<!doctype html><html><head><meta charset='utf-8'><style>" +
               "body{margin:0;height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;" +
               "background:#060a16;color:#d8a0a8;font-family:'Segoe UI',sans-serif;text-align:center}" +
               "h1{font-weight:500;color:#eaf2ff;font-size:20px}p{font-size:13px}</style></head><body>" +
               "<h1>Le serveur n'a pas r&eacute;pondu</h1>" +
               "<p>Consultez le dossier logs\\ de My Jarvis (serveur.log, sidecar-*.log).</p></body></html>";
    }
}

internal static class Services
{
    private static readonly Regex Ansi = new Regex("\\x1b\\[[0-9;]*m");

    public static bool PortUp(string url, int timeoutMs)
    {
        try
        {
            HttpWebRequest req = (HttpWebRequest)WebRequest.Create(url);
            req.Timeout = timeoutMs;
            req.Method = "GET";
            using (WebResponse resp = req.GetResponse()) { return true; }
        }
        catch { return false; }
    }

    public static bool EnsureAll(string root, int maxSeconds, Action<string> report)
    {
        string sidecarProbe = "http://127.0.0.1:4981/health";
        string serverProbe = "http://127.0.0.1:8000/admin";

        report("Vérification des services locaux…");

        if (PortUp(sidecarProbe, 700))
        {
            report("Sidecar Claude déjà actif (port 4981).");
        }
        else
        {
            report("Démarrage du sidecar Claude Agent SDK…");
            StartSidecar(root, report);
            for (int i = 0; i < 15; i++)
            {
                if (PortUp(sidecarProbe, 800)) { report("Sidecar en ligne (port 4981)."); break; }
                System.Threading.Thread.Sleep(700);
            }
        }

        if (PortUp(serverProbe, 700))
        {
            report("Serveur jarvis-OS déjà actif (port 8000).");
            return true;
        }

        report("Démarrage du serveur jarvis-OS (Python)…");
        StartServer(root, report);

        for (int i = 0; i < maxSeconds; i++)
        {
            if (PortUp(serverProbe, 900))
            {
                report("Serveur prêt — ouverture de l'interface.");
                return true;
            }
            System.Threading.Thread.Sleep(1000);
        }
        report("Échec : le serveur n'a pas répondu à temps.");
        return false;
    }

    // Nettoie une ligne console réelle (codes ANSI, préfixes loguru) pour le fil.
    private static string CleanLine(string line)
    {
        if (line == null) return null;
        string s = Ansi.Replace(line, "").Trim();
        if (s.Length == 0) return null;
        int sep = s.IndexOf(" — ");
        if (sep < 0) sep = s.IndexOf(" - ");
        if (sep >= 0 && sep + 3 < s.Length) s = s.Substring(sep + 3).Trim();
        if (s.Length == 0) return null;
        if (s.Length > 90) s = s.Substring(0, 87) + "…";
        return s;
    }

    private static void StartSidecar(string root, Action<string> report)
    {
        try
        {
            ProcessStartInfo psi = new ProcessStartInfo();
            psi.FileName = "node";
            psi.Arguments = "\"" + Path.Combine(root, "Jarvis", "engine", "index.mjs") + "\"";
            psi.WorkingDirectory = root;
            psi.UseShellExecute = false;
            psi.CreateNoWindow = true;
            psi.RedirectStandardOutput = true;
            psi.RedirectStandardError = true;
            psi.EnvironmentVariables["MYJARVIS_ROOT"] = root;
            string tokenFile = Path.Combine(root, "config", ".claude_oauth_token");
            if (File.Exists(tokenFile))
                psi.EnvironmentVariables["CLAUDE_CODE_OAUTH_TOKEN"] = File.ReadAllText(tokenFile).Trim();
            Process p = Process.Start(psi);
            p.OutputDataReceived += delegate(object s, DataReceivedEventArgs a)
            { string m = CleanLine(a.Data); if (m != null) report("sidecar : " + m); };
            p.ErrorDataReceived += delegate(object s, DataReceivedEventArgs a)
            { string m = CleanLine(a.Data); if (m != null) report("sidecar ! " + m); };
            p.BeginOutputReadLine();
            p.BeginErrorReadLine();
        }
        catch (Exception ex) { report("Sidecar : échec de lancement (" + ex.Message + ")"); }
    }

    private static void StartServer(string root, Action<string> report)
    {
        try
        {
            ProcessStartInfo psi = new ProcessStartInfo();
            psi.FileName = "uv";
            psi.Arguments = "run python -m jarvis.app";
            psi.WorkingDirectory = Path.Combine(root, "base", "jarvis-OS");
            psi.UseShellExecute = false;
            psi.CreateNoWindow = true;
            psi.EnvironmentVariables["UV_CACHE_DIR"] = Path.Combine(root, "data", "uv-cache");
            psi.RedirectStandardOutput = true;
            psi.RedirectStandardError = true;
            Process p = Process.Start(psi);
            StreamWriter log = new StreamWriter(Path.Combine(root, "logs", "serveur.log"), true);
            log.AutoFlush = true;
            p.OutputDataReceived += delegate(object s, DataReceivedEventArgs a)
            {
                if (a.Data == null) return;
                lock (log) log.WriteLine(a.Data);
                string m = CleanLine(a.Data); if (m != null) report(m);
            };
            p.ErrorDataReceived += delegate(object s, DataReceivedEventArgs a)
            {
                if (a.Data == null) return;
                lock (log) log.WriteLine(a.Data);
                string m = CleanLine(a.Data); if (m != null) report(m);
            };
            p.BeginOutputReadLine();
            p.BeginErrorReadLine();
        }
        catch (Exception ex) { report("Serveur : échec de lancement (" + ex.Message + ")"); }
    }
}

internal static class Program
{
    [STAThread]
    private static void Main(string[] args)
    {
        string exeDir = Path.GetDirectoryName(System.Reflection.Assembly.GetExecutingAssembly().Location);
        string root = Path.GetFullPath(Path.Combine(exeDir, "..", ".."));

        Application.EnableVisualStyles();
        Application.SetCompatibleTextRenderingDefault(false);
        Application.Run(new MainForm(root));
    }
}
