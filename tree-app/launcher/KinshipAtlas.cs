using System;
using System.Diagnostics;
using System.IO;
using System.Net;
using System.Text;
using System.Windows.Forms;

// Opens index.html (next to this exe) in the user's default browser.
static class KinshipAtlasLauncher
{
    static readonly string[] MediaExtensions = { ".png", ".jpg", ".jpeg", ".gif", ".webp", ".avif", ".bmp", ".pdf" };

    static string Js(string value)
    {
        var sb = new StringBuilder("\"");
        foreach (char c in value)
        {
            if (c == '"' || c == '\\') sb.Append('\\').Append(c);
            else if (c < 0x20 || c == '\u2028' || c == '\u2029') sb.AppendFormat("\\u{0:x4}", (int)c);
            else sb.Append(c);
        }
        return sb.Append('"').ToString();
    }

    static string MediaType(string ext)
    {
        switch (ext)
        {
            case ".pdf": return "application/pdf";
            case ".jpg": case ".jpeg": return "image/jpeg";
            default: return "image/" + ext.TrimStart('.');
        }
    }

    // Writes primary-data.js (read by index.html) from the "Primary GEDCOM" and "Primary Media Library" folders.
    static void WritePrimaryData(string baseDir)
    {
        string output = Path.Combine(baseDir, "primary-data.js");
        string gedDir = Path.Combine(baseDir, "Primary GEDCOM");
        string libraryDir = Path.Combine(baseDir, "Primary Media Library");
        string mediaDir = PrimaryMediaFolder(baseDir) ?? libraryDir;
        string[] geds = Directory.Exists(gedDir) ? Directory.GetFiles(gedDir, "*.ged", SearchOption.TopDirectoryOnly) : new string[0];
        if (geds.Length == 0)
        {
            File.WriteAllText(output, "window.KINSHIP_PRIMARY = null;\r\n", new UTF8Encoding(false));
            return;
        }
        Array.Sort(geds, StringComparer.OrdinalIgnoreCase);

        var sb = new StringBuilder("window.KINSHIP_PRIMARY = {\r\n");
        sb.Append("  gedcomName: ").Append(Js(Path.GetFileName(geds[0]))).Append(",\r\n");
        sb.Append("  gedcomText: ").Append(Js(File.ReadAllText(geds[0]))).Append(",\r\n  media: [");
        bool first = true;
        if (Directory.Exists(mediaDir))
        {
            foreach (string file in Directory.GetFiles(mediaDir, "*", SearchOption.AllDirectories))
            {
                string ext = Path.GetExtension(file).ToLowerInvariant();
                if (Array.IndexOf(MediaExtensions, ext) < 0) continue;
                string relative = file.Substring(mediaDir.Length).TrimStart('\\', '/').Replace('\\', '/');
                string fromLibrary = file.Substring(libraryDir.Length).TrimStart('\\', '/').Replace('\\', '/');
                string url = "Primary%20Media%20Library/" + string.Join("/", Array.ConvertAll(fromLibrary.Split('/'), Uri.EscapeDataString));
                sb.Append(first ? "\r\n    " : ",\r\n    ");
                sb.Append("{ name: ").Append(Js(Path.GetFileName(file))).Append(", path: ").Append(Js(relative))
                  .Append(", url: ").Append(Js(url)).Append(", type: ").Append(Js(MediaType(ext))).Append(" }");
                first = false;
            }
        }
        sb.Append("\r\n  ]\r\n};\r\n");
        File.WriteAllText(output, sb.ToString(), new UTF8Encoding(false));
    }

    // The first folder inside "Primary Media Library" is the default (editable) media library.
    static string PrimaryMediaFolder(string baseDir)
    {
        string library = Path.Combine(baseDir, "Primary Media Library");
        if (!Directory.Exists(library)) return null;
        string[] folders = Directory.GetDirectories(library);
        if (folders.Length == 0) return null;
        Array.Sort(folders, StringComparer.OrdinalIgnoreCase);
        return folders[0];
    }

    static string SafeName(string name)
    {
        string baseName = Path.GetFileName((name ?? "").Replace('\\', '/'));
        foreach (char c in Path.GetInvalidFileNameChars()) baseName = baseName.Replace(c, '-');
        baseName = baseName.Trim();
        return baseName.Length == 0 || baseName.StartsWith(".") ? "" : baseName;
    }

    static readonly string[] Ports = { "8765", "8766", "8767", "8768", "8769" };
    static DateTime lastRequest = DateTime.UtcNow;
    static bool seenRequest;

    static void Send(HttpListenerContext ctx, int status, byte[] body, string type)
    {
        try
        {
            ctx.Response.StatusCode = status;
            ctx.Response.ContentType = type;
            ctx.Response.Headers["Cache-Control"] = "no-store";
            ctx.Response.Headers["X-Content-Type-Options"] = "nosniff";
            ctx.Response.ContentLength64 = body.Length;
            ctx.Response.OutputStream.Write(body, 0, body.Length);
        }
        catch { }
        finally { try { ctx.Response.Close(); } catch { } }
    }

    static void SendJson(HttpListenerContext ctx, int status, string json) { Send(ctx, status, Encoding.UTF8.GetBytes(json), "application/json"); }

    static string ContentType(string path)
    {
        switch (Path.GetExtension(path).ToLowerInvariant())
        {
            case ".html": return "text/html; charset=utf-8";
            case ".js": return "text/javascript; charset=utf-8";
            case ".css": return "text/css; charset=utf-8";
            case ".svg": return "image/svg+xml";
            case ".json": return "application/json";
            case ".png": case ".gif": case ".webp": case ".avif": case ".bmp": case ".jpg": case ".jpeg": case ".pdf":
                return MediaType(Path.GetExtension(path).ToLowerInvariant());
            default: return "application/octet-stream";
        }
    }

    static void ServeFile(HttpListenerContext ctx, string root, string relative)
    {
        string full = Path.GetFullPath(Path.Combine(root, relative.Replace('/', '\\')));
        string rootFull = Path.GetFullPath(root).TrimEnd('\\') + "\\";
        string ext = Path.GetExtension(full).ToLowerInvariant();
        bool allowed = ext == ".html" || ext == ".js" || ext == ".css" || ext == ".svg" || ext == ".json" || Array.IndexOf(MediaExtensions, ext) >= 0;
        if (!full.StartsWith(rootFull, StringComparison.OrdinalIgnoreCase) || !allowed || !File.Exists(full)) { SendJson(ctx, 404, "{\"error\":\"Not found\"}"); return; }
        Send(ctx, 200, File.ReadAllBytes(full), ContentType(full));
    }

    static void HandleUpload(HttpListenerContext ctx, string mediaDir)
    {
        string fileName = SafeName(Uri.UnescapeDataString(ctx.Request.Headers["X-File-Name"] ?? ""));
        string ext = Path.GetExtension(fileName).ToLowerInvariant();
        if (fileName.Length == 0 || Array.IndexOf(MediaExtensions, ext) < 0) { SendJson(ctx, 400, "{\"error\":\"Only image and PDF files are accepted.\"}"); return; }
        if (ctx.Request.ContentLength64 > 100L * 1024 * 1024) { SendJson(ctx, 413, "{\"error\":\"File is too large.\"}"); return; }
        var ms = new MemoryStream();
        ctx.Request.InputStream.CopyTo(ms);
        string baseName = fileName.Substring(0, fileName.Length - ext.Length);
        for (int i = 0; i < 10000; i++)
        {
            string candidate = i == 0 ? fileName : baseName + " (" + (i + 1) + ")" + ext;
            try
            {
                using (var fs = new FileStream(Path.Combine(mediaDir, candidate), FileMode.CreateNew, FileAccess.Write))
                    ms.WriteTo(fs);
                SendJson(ctx, 200, "{\"name\":" + Js(candidate) + "}");
                return;
            }
            catch (IOException) { if (!File.Exists(Path.Combine(mediaDir, candidate))) break; }
        }
        SendJson(ctx, 500, "{\"error\":\"The file could not be written.\"}");
    }

    static string JsonString(string json, string key)
    {
        var match = System.Text.RegularExpressions.Regex.Match(json, "\"" + key + "\"\\s*:\\s*\"((?:[^\"\\\\]|\\\\.)*)\"");
        if (!match.Success) return null;
        try { return System.Text.RegularExpressions.Regex.Unescape(match.Groups[1].Value); }
        catch { return null; }
    }

    // Deletes one image or PDF inside the media folder (subfolders allowed), then refreshes primary-data.js.
    static void HandleDelete(HttpListenerContext ctx, string appDir, string mediaDir)
    {
        string json;
        using (var reader = new StreamReader(ctx.Request.InputStream, Encoding.UTF8))
        {
            var buffer = new char[64 * 1024];
            int read = reader.ReadBlock(buffer, 0, buffer.Length);
            json = new string(buffer, 0, read);
        }
        string relative = JsonString(json, "path") ?? JsonString(json, "name") ?? "";
        var sizeMatch = System.Text.RegularExpressions.Regex.Match(json, "\"size\"\\s*:\\s*(\\d+)");
        long expectedSize = sizeMatch.Success ? long.Parse(sizeMatch.Groups[1].Value) : -1;

        string[] segments = relative.Replace('\\', '/').Split(new[] { '/' }, StringSplitOptions.RemoveEmptyEntries);
        bool valid = segments.Length > 0 && Array.TrueForAll(segments, s => s == SafeName(s));
        string ext = valid ? Path.GetExtension(segments[segments.Length - 1]).ToLowerInvariant() : "";
        if (!valid || Array.IndexOf(MediaExtensions, ext) < 0) { SendJson(ctx, 400, "{\"error\":\"Invalid file name.\"}"); return; }
        string rootFull = Path.GetFullPath(mediaDir).TrimEnd('\\') + "\\";
        string target = Path.GetFullPath(Path.Combine(rootFull, string.Join("\\", segments)));
        if (!target.StartsWith(rootFull, StringComparison.OrdinalIgnoreCase)) { SendJson(ctx, 400, "{\"error\":\"Invalid file name.\"}"); return; }
        if (!File.Exists(target)) { SendJson(ctx, 404, "{\"error\":\"Not found\"}"); return; }
        if (expectedSize >= 0 && new FileInfo(target).Length != expectedSize) { SendJson(ctx, 409, "{\"error\":\"File does not match.\"}"); return; }
        try { File.Delete(target); }
        catch { SendJson(ctx, 500, "{\"error\":\"The file could not be deleted.\"}"); return; }
        try { WritePrimaryData(appDir); } catch { }
        SendJson(ctx, 200, "{\"ok\":true}");
    }

    static void Handle(HttpListenerContext ctx, string appDir, string mediaDir)
    {
        lastRequest = DateTime.UtcNow;
        seenRequest = true;
        string host = ctx.Request.Url.Host;
        string origin = ctx.Request.Headers["Origin"];
        bool hostOk = host == "127.0.0.1" || host == "localhost";
        bool originOk = string.IsNullOrEmpty(origin) || origin == "http://" + ctx.Request.Url.Authority;
        if (!hostOk || !originOk) { SendJson(ctx, 403, "{\"error\":\"Forbidden\"}"); return; }

        string path = ctx.Request.Url.AbsolutePath;
        string method = ctx.Request.HttpMethod;
        if (method == "GET" && path == "/api/media-info") { SendJson(ctx, 200, "{\"available\":true,\"app\":" + Js(appDir) +         ",\"folder\":" + Js(Path.GetFileName(mediaDir)) + ",\"deletePaths\":true}"); return; }
        if (method == "POST" && path == "/api/media") { HandleUpload(ctx, mediaDir); return; }
                if (method == "POST" && path == "/api/media-delete") { HandleDelete(ctx, appDir, mediaDir); return; }
        if (method == "GET" && path.StartsWith("/media/"))
        {
            string name = SafeName(Uri.UnescapeDataString(path.Substring(7)));
            if (name.Length == 0) { SendJson(ctx, 404, "{\"error\":\"Not found\"}"); return; }
            ServeFile(ctx, mediaDir, name);
            return;
        }
        if (method == "GET")
        {
            string relative = Uri.UnescapeDataString(path == "/" ? "index.html" : path.Substring(1));
            ServeFile(ctx, appDir, relative);
            return;
        }
        SendJson(ctx, 405, "{\"error\":\"Method not allowed\"}");
    }

    // True only when the helper on this port serves the same app folder; a helper from another copy must not be reused.
    static bool IsRunningHelper(string port, string appDir)
    {
        try
        {
            var request = (HttpWebRequest)WebRequest.Create("http://127.0.0.1:" + port + "/api/media-info");
            request.Timeout = 1500;
            using (var response = (HttpWebResponse)request.GetResponse())
            using (var reader = new StreamReader(response.GetResponseStream()))
                return reader.ReadToEnd().Contains("\"app\":" + Js(appDir));
        }
        catch { return false; }
    }

    // Serves the app and the default media folder over localhost so media can be added; exits when the browser stops pinging.
    static void RunServer(string appDir, string mediaDir)
    {
        foreach (string port in Ports)
        {
            if (IsRunningHelper(port, appDir)) { OpenUrl("http://127.0.0.1:" + port + "/"); return; }
            var listener = new HttpListener();
            listener.Prefixes.Add("http://127.0.0.1:" + port + "/");
            try { listener.Start(); }
            catch { continue; }

            OpenUrl("http://127.0.0.1:" + port + "/");
            var timer = new System.Threading.Timer(delegate
            {
                if (seenRequest && DateTime.UtcNow - lastRequest > TimeSpan.FromMinutes(5)) Environment.Exit(0);
                if (!seenRequest && DateTime.UtcNow - lastRequest > TimeSpan.FromMinutes(2)) Environment.Exit(0);
            }, null, 15000, 15000);
            GC.KeepAlive(timer);
            while (true)
            {
                HttpListenerContext ctx;
                try { ctx = listener.GetContext(); }
                catch { return; }
                var captured = ctx;
                System.Threading.ThreadPool.QueueUserWorkItem(delegate
                {
                    try { Handle(captured, appDir, mediaDir); }
                    catch { try { captured.Response.Abort(); } catch { } }
                });
            }
        }
        MessageBox.Show("Could not start the local media helper. Opening the app without media editing.", "Kinship Atlas", MessageBoxButtons.OK, MessageBoxIcon.Warning);
        OpenUrl(new Uri(Path.Combine(appDir, "index.html")).AbsoluteUri);
    }

    static void OpenUrl(string url)
    {
        try { Process.Start(new ProcessStartInfo(url) { UseShellExecute = true }); }
        catch (Exception ex)
        {
            MessageBox.Show("Could not open the default browser: " + ex.Message, "Kinship Atlas", MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
    }

    [STAThread]
    static void Main()
    {
        string index = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "index.html");
        if (!File.Exists(index))
        {
            MessageBox.Show("index.html was not found next to this program.\r\nKeep Kinship Atlas.exe in the same folder as index.html, app.js and styles.css.",
                "Kinship Atlas", MessageBoxButtons.OK, MessageBoxIcon.Error);
            return;
        }

        try { WritePrimaryData(AppDomain.CurrentDomain.BaseDirectory); } catch { }

        string appDir = AppDomain.CurrentDomain.BaseDirectory;
        string mediaFolder = null;
        try { mediaFolder = PrimaryMediaFolder(appDir); } catch { }
        if (mediaFolder != null) RunServer(appDir, mediaFolder);
        else OpenUrl(new Uri(index).AbsoluteUri);
    }
}
