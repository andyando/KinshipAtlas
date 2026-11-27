using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Net;
using System.Text;
using System.Windows.Forms;

// Opens index.html (next to this exe) in the user's default browser.
static class KinshipAtlasLauncher
{
    // Every supported attachment type, mirroring data/attachment-types.json.
    static readonly string[] MediaExtensions = { ".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp", ".tif", ".tiff", ".pdf", ".txt", ".doc", ".docx", ".rtf", ".html", ".htm" };
    const int GedcomBackupsKept = 10;

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
            case ".png": return "image/png";
            case ".gif": return "image/gif";
            case ".webp": return "image/webp";
            case ".bmp": return "image/bmp";
            case ".tif": case ".tiff": return "image/tiff";
            // Attachment documents. Text and HTML are sent as source so they
            // preview in the app; HTML is never served as a page to run.
            case ".txt": case ".htm": return "text/plain; charset=utf-8";
            case ".doc": return "application/msword";
            case ".docx": return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
            case ".rtf": return "application/rtf";
            default: return "application/octet-stream";
        }
    }

    // The first .ged file in the "Primary GEDCOM" folder is the primary tree.
    static string PrimaryGedcomPath(string baseDir)
    {
        string gedDir = Path.Combine(baseDir, "Primary GEDCOM");
        string[] geds = Directory.Exists(gedDir) ? Directory.GetFiles(gedDir, "*.ged", SearchOption.TopDirectoryOnly) : new string[0];
        if (geds.Length == 0) return null;
        Array.Sort(geds, StringComparer.OrdinalIgnoreCase);
        return geds[0];
    }

    // Writes primary-data.js (read by index.html) from the "Primary GEDCOM" and "Primary Media Library" folders.
    static void WritePrimaryData(string baseDir)
    {
        string output = Path.Combine(baseDir, "primary-data.js");
        string libraryDir = Path.Combine(baseDir, "Primary Media Library");
        string mediaDir = PrimaryMediaFolder(baseDir) ?? libraryDir;
        string gedcom = PrimaryGedcomPath(baseDir);
        if (gedcom == null)
        {
            File.WriteAllText(output, "window.KINSHIP_PRIMARY = null;\r\n", new UTF8Encoding(false));
            return;
        }

        var sb = new StringBuilder("window.KINSHIP_PRIMARY = {\r\n");
        sb.Append("  gedcomName: ").Append(Js(Path.GetFileName(gedcom))).Append(",\r\n");
        sb.Append("  gedcomText: ").Append(Js(File.ReadAllText(gedcom))).Append(",\r\n  media: [");
        bool first = true;
        if (Directory.Exists(mediaDir))
        {
            foreach (string file in MediaFiles(mediaDir))
            {
                string ext = Path.GetExtension(file).ToLowerInvariant();
                if (Array.IndexOf(MediaExtensions, ext) < 0) continue;
                // Files in the archive are copies of files no person uses.
                if (IsInArchiveFolder(mediaDir, file)) continue;
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

    // Files in the media folder's person subfolders, plus any file left loose in the
    // media folder root. Each GEDCOM FILE name is listed once, and a file that still
    // has a copy in someone's folder is listed from there, so the single copy the
    // app now writes is the one referenced.
    static List<string> MediaFiles(string mediaDir)
    {
        var byName = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        var loose = new List<string>();
        foreach (string folder in Directory.GetDirectories(mediaDir))
        {
            // The archive holds files no person uses, so it is not offered as media.
            if (IsArchiveFolderName(Path.GetFileName(folder))) continue;
            foreach (string file in Directory.GetFiles(folder, "*", SearchOption.AllDirectories))
                byName[Path.GetFileName(file)] = file;
        }
        foreach (string file in Directory.GetFiles(mediaDir, "*", SearchOption.TopDirectoryOnly)) loose.Add(file);
        var result = new List<string>();
        foreach (string file in loose)
        {
            if (!byName.ContainsKey(Path.GetFileName(file))) result.Add(file);
        }
        result.AddRange(byName.Values);
        return result;
    }

    // "Archive", "Unknown" and the other names the organiser uses for files no
    // person uses.
    static readonly string[] ArchiveFolderNames = { "archive", "unknown", "unlinked", "unsorted", "orphaned", "misc", "miscellaneous", "duplicates" };
    static bool IsArchiveFolderName(string name)
    {
        return Array.IndexOf(ArchiveFolderNames, (name ?? "").Trim().ToLowerInvariant()) >= 0;
    }

    // True for a file inside an archive folder at the media folder's root.
    static bool IsInArchiveFolder(string mediaDir, string file)
    {
        string root = Path.GetFullPath(mediaDir).TrimEnd('\\') + "\\";
        string full = Path.GetFullPath(file);
        if (!full.StartsWith(root, StringComparison.OrdinalIgnoreCase)) return false;
        string relative = full.Substring(root.Length);
        int slash = relative.IndexOfAny(new[] { '\\', '/' });
        return slash > 0 && IsArchiveFolderName(relative.Substring(0, slash));
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

    static readonly string[] Ports = { "8811", "8765", "8766", "8767", "8768", "8769" };

    static void Send(HttpListenerContext ctx, int status, byte[] body, string type)
    {
        try
        {
            ctx.Response.StatusCode = status;
            ctx.Response.ContentType = type;
            ctx.Response.Headers["Cache-Control"] = "no-store, no-cache, must-revalidate";
            ctx.Response.Headers["Pragma"] = "no-cache";
            ctx.Response.Headers["Pragma"] = "no-cache";
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
            case ".js": case ".mjs": return "text/javascript; charset=utf-8";
            case ".css": return "text/css; charset=utf-8";
            case ".svg": return "image/svg+xml";
            case ".json": return "application/json";
            case ".wasm": return "application/wasm";
            case ".tflite": return "application/octet-stream";
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
        bool allowed = ext == ".html" || ext == ".js" || ext == ".mjs" || ext == ".css" || ext == ".svg" || ext == ".json" ||
            ext == ".wasm" || ext == ".tflite" || Array.IndexOf(MediaExtensions, ext) >= 0;
        if (!full.StartsWith(rootFull, StringComparison.OrdinalIgnoreCase) || !allowed || !File.Exists(full)) { SendJson(ctx, 404, "{\"error\":\"Not found\"}"); return; }
        Send(ctx, 200, File.ReadAllBytes(full), ContentType(full));
    }

    // A media file the page asked for by version. The long cache is safe because
    // any new version of the file arrives under a new address.
    static void ServeMediaFile(HttpListenerContext ctx, string root, string relative, string version)
    {
        string full = Path.GetFullPath(Path.Combine(root, relative));
        string rootFull = Path.GetFullPath(root).TrimEnd('\\') + "\\";
        if (!full.StartsWith(rootFull, StringComparison.OrdinalIgnoreCase) || !File.Exists(full)) { SendJson(ctx, 404, "{\"error\":\"Not found\"}"); return; }
        byte[] bytes = File.ReadAllBytes(full);
        try
        {
            ctx.Response.StatusCode = 200;
            ctx.Response.ContentType = ContentType(full);
            ctx.Response.Headers["Cache-Control"] = "public, max-age=31536000, immutable";
            ctx.Response.Headers["ETag"] = "\"" + version + "\"";
            ctx.Response.Headers["X-Content-Type-Options"] = "nosniff";
            ctx.Response.ContentLength64 = bytes.Length;
            ctx.Response.OutputStream.Write(bytes, 0, bytes.Length);
        }
        catch { }
        finally { try { ctx.Response.Close(); } catch { } }
    }

    // A Windows command-line argument in quotes, for a path with spaces.
    static string Quote(string value)
    {
        return "\"" + value + "\"";
    }

    // Opens File Explorer at the tree's media folder (the default), or with the
    // given media file or folder selected inside it. POST {"kind":"media"}.
    [System.Runtime.InteropServices.DllImport("user32.dll")]
    private static extern bool SetForegroundWindow(IntPtr hWnd);

    static void HandleReveal(HttpListenerContext ctx, string appDir, string mediaDir)
    {
        string json;
        try
        {
            using (var reader = new StreamReader(ctx.Request.InputStream, Encoding.UTF8))
                json = reader.ReadToEnd();
        }
        catch { SendJson(ctx, 400, "{\"error\":\"Invalid request.\"}"); return; }
        string relative = JsonString(json, "path") ?? "";
        string rootFull = Path.GetFullPath(mediaDir).TrimEnd('\\') + "\\";
        string target = mediaDir;
        if (relative.Length > 0)
        {
            string[] segments = relative.Replace('\\', '/').Split(new[] { '/' }, StringSplitOptions.RemoveEmptyEntries);
            if (!Array.TrueForAll(segments, s => s == SafeName(s))) { SendJson(ctx, 400, "{\"error\":\"Invalid path.\"}"); return; }
            target = Path.GetFullPath(Path.Combine(rootFull, string.Join("\\", segments)));
            if (!target.StartsWith(rootFull, StringComparison.OrdinalIgnoreCase)) { SendJson(ctx, 400, "{\"error\":\"Invalid path.\"}"); return; }
        }
        try
        {
            if (File.Exists(target)) Process.Start("explorer.exe", "/select," + Quote(target));
            else if (Directory.Exists(target)) Process.Start("explorer.exe", Quote(target));
            else Process.Start("explorer.exe", Quote(mediaDir));
            // Explorer opens behind the browser window when launched from a web
            // page; bring it to the front so the window the user asked for has
            // focus.
            try
            {
                System.Threading.Thread.Sleep(400);
                var explorer = Process.GetProcessesByName("explorer");
                foreach (var process in explorer)
                {
                    try { if (process.MainWindowHandle != IntPtr.Zero) SetForegroundWindow(process.MainWindowHandle); } catch { }
                }
            }
            catch { }
        }
        catch { SendJson(ctx, 500, "{\"error\":\"File Explorer could not be opened.\"}"); return; }
        SendJson(ctx, 200, "{\"ok\":true}");
    }

    // Opens File Explorer on a file inside the media folder, including files in a person's folder.
    static void HandleUpload(HttpListenerContext ctx, string mediaDir)
    {
        string fileName = SafeName(Uri.UnescapeDataString(ctx.Request.Headers["X-File-Name"] ?? ""));
        string ext = Path.GetExtension(fileName).ToLowerInvariant();
        if (fileName.Length == 0 || Array.IndexOf(MediaExtensions, ext) < 0) { SendJson(ctx, 400, "{\"error\":\"Only image and PDF files are accepted.\"}"); return; }
        if (ctx.Request.ContentLength64 > 100L * 1024 * 1024) { SendJson(ctx, 413, "{\"error\":\"File is too large.\"}"); return; }
        // A person folder name puts the file in that person's own folder, created when missing.
        string personFolder = SafeName(Uri.UnescapeDataString(ctx.Request.Headers["X-Media-Folder"] ?? ""));
        string targetDir = mediaDir;
        if (personFolder.Length != 0)
        {
            targetDir = Path.Combine(mediaDir, personFolder);
            try { Directory.CreateDirectory(targetDir); }
            catch { SendJson(ctx, 500, "{\"error\":\"The person folder could not be created.\"}"); return; }
        }
        var ms = new MemoryStream();
        ctx.Request.InputStream.CopyTo(ms);
        string baseName = fileName.Substring(0, fileName.Length - ext.Length);
        for (int i = 0; i < 10000; i++)
        {
            string candidate = i == 0 ? fileName : baseName + " (" + (i + 1) + ")" + ext;
            try
            {
                using (var fs = new FileStream(Path.Combine(targetDir, candidate), FileMode.CreateNew, FileAccess.Write))
                    ms.WriteTo(fs);
                SendJson(ctx, 200, "{\"name\":" + Js(candidate) + ",\"folder\":" + Js(personFolder) + "}");
                return;
            }
            catch (IOException) { if (!File.Exists(Path.Combine(targetDir, candidate))) break; }
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

    static readonly object GedcomSaveLock = new object();

    static string Sha256Hex(byte[] bytes)
    {
        using (var sha = System.Security.Cryptography.SHA256.Create())
        {
            var sb = new StringBuilder();
            foreach (byte b in sha.ComputeHash(bytes)) sb.Append(b.ToString("x2"));
            return sb.ToString();
        }
    }

    static string Sha256Hex(string text)
    {
        using (var sha = System.Security.Cryptography.SHA256.Create())
        {
            var sb = new StringBuilder();
            foreach (byte b in sha.ComputeHash(Encoding.UTF8.GetBytes(text))) sb.Append(b.ToString("x2"));
            return sb.ToString();
        }
    }

    // Writes the edited tree back to the primary GEDCOM after copying the current file to "Primary GEDCOM\Backups".
    // X-Base-Sha256 must match the file on disk (the version the browser opened) unless X-Overwrite is 1.
    static void HandleGedcomSave(HttpListenerContext ctx, string appDir)
    {
        string target = PrimaryGedcomPath(appDir);
        string name = SafeName(Uri.UnescapeDataString(ctx.Request.Headers["X-Gedcom-Name"] ?? ""));
        string baseHash = (ctx.Request.Headers["X-Base-Sha256"] ?? "").Trim().ToLowerInvariant();
        bool overwrite = ctx.Request.Headers["X-Overwrite"] == "1";
        if (target == null || name.Length == 0 || !string.Equals(name, Path.GetFileName(target), StringComparison.OrdinalIgnoreCase))
        { SendJson(ctx, 404, "{\"error\":\"This tree is not the primary GEDCOM.\"}"); return; }
        if (!overwrite && !System.Text.RegularExpressions.Regex.IsMatch(baseHash, "^[0-9a-f]{64}$"))
        { SendJson(ctx, 400, "{\"error\":\"Missing file version.\"}"); return; }
        if (ctx.Request.ContentLength64 > 200L * 1024 * 1024) { SendJson(ctx, 413, "{\"error\":\"The GEDCOM is too large.\"}"); return; }

        string text;
        try
        {
            using (var reader = new StreamReader(ctx.Request.InputStream, new UTF8Encoding(false, true)))
                text = reader.ReadToEnd();
        }
        catch { SendJson(ctx, 400, "{\"error\":\"The GEDCOM text is not valid UTF-8.\"}"); return; }
        string trimmed = text.TrimStart('\uFEFF', ' ', '\t', '\r', '\n');
        if (!trimmed.StartsWith("0 HEAD") || !System.Text.RegularExpressions.Regex.IsMatch(text, "(^|\\n)0 TRLR\\s*$"))
        { SendJson(ctx, 400, "{\"error\":\"The text is not a complete GEDCOM file.\"}"); return; }

        string backupName;
        lock (GedcomSaveLock)
        {
            byte[] current;
            string currentText;
            try { current = File.ReadAllBytes(target); currentText = File.ReadAllText(target); }
            catch { SendJson(ctx, 500, "{\"error\":\"The GEDCOM file could not be read.\"}"); return; }
            if (!overwrite && Sha256Hex(currentText) != baseHash)
            { SendJson(ctx, 409, "{\"error\":\"The GEDCOM file was changed outside this tab.\"}"); return; }
            bool bom = current.Length >= 3 && current[0] == 0xEF && current[1] == 0xBB && current[2] == 0xBF;
            string backupDir = Path.Combine(Path.GetDirectoryName(target), "Backups");
            string stem = Path.GetFileNameWithoutExtension(target);
            string ext = Path.GetExtension(target);
            string temp = target + ".saving";
            try
            {
                Directory.CreateDirectory(backupDir);
                string stamp = DateTime.Now.ToString("yyyy-MM-dd HHmmss");
                backupName = stem + " " + stamp + ext;
                for (int i = 2; File.Exists(Path.Combine(backupDir, backupName)); i++) backupName = stem + " " + stamp + " (" + i + ")" + ext;
                File.WriteAllBytes(Path.Combine(backupDir, backupName), current);
                File.WriteAllText(temp, text, new UTF8Encoding(bom));
                try { File.Replace(temp, target, null); }
                catch (PlatformNotSupportedException) { File.Copy(temp, target, true); File.Delete(temp); }
            }
            catch
            {
                try { if (File.Exists(temp)) File.Delete(temp); } catch { }
                SendJson(ctx, 500, "{\"error\":\"The GEDCOM file could not be written.\"}");
                return;
            }
            try
            {
                var pattern = new System.Text.RegularExpressions.Regex("^" + System.Text.RegularExpressions.Regex.Escape(stem) + " \\d{4}-\\d{2}-\\d{2} \\d{6}( \\(\\d+\\))?" + System.Text.RegularExpressions.Regex.Escape(ext) + "$", System.Text.RegularExpressions.RegexOptions.IgnoreCase);
                var backups = new System.Collections.Generic.List<FileInfo>();
                foreach (var file in new DirectoryInfo(backupDir).GetFiles()) if (pattern.IsMatch(file.Name)) backups.Add(file);
                backups.Sort((a, b) => b.LastWriteTimeUtc.CompareTo(a.LastWriteTimeUtc));
                for (int i = GedcomBackupsKept; i < backups.Count; i++) backups[i].Delete();
            }
            catch { }
        }
        try { WritePrimaryData(appDir); } catch { }
        SendJson(ctx, 200, "{\"ok\":true,\"backup\":" + Js(backupName) + "}");
    }

    static readonly object SelectionsLock = new object();

    // Persists card image / primary person choices beside the app (kinship-selections.json) so they
    // survive browser changes and moving or copying the app folder (localStorage is per origin).
    static void HandleSelectionsSave(HttpListenerContext ctx, string appDir)
    {
        if (ctx.Request.ContentLength64 > 5L * 1024 * 1024) { SendJson(ctx, 413, "{\"error\":\"Request is too large.\"}"); return; }
        string json;
        try
        {
            using (var reader = new StreamReader(ctx.Request.InputStream, new UTF8Encoding(false, true)))
                json = reader.ReadToEnd();
        }
        catch { SendJson(ctx, 400, "{\"error\":\"Invalid request.\"}"); return; }
        string trimmed = json.Trim();
        if (trimmed.Length > 5 * 1024 * 1024 || !trimmed.StartsWith("{") || !trimmed.EndsWith("}") || !trimmed.Contains("\"selections\""))
        { SendJson(ctx, 400, "{\"error\":\"Invalid request.\"}"); return; }
        string target = Path.Combine(appDir, "kinship-selections.json");
        string temp = target + ".saving";
        lock (SelectionsLock)
        {
            try
            {
                File.WriteAllText(temp, trimmed, new UTF8Encoding(false));
                if (File.Exists(target))
                {
                    try { File.Replace(temp, target, null); }
                    catch (PlatformNotSupportedException) { File.Copy(temp, target, true); File.Delete(temp); }
                }
                else File.Move(temp, target);
            }
            catch
            {
                try { if (File.Exists(temp)) File.Delete(temp); } catch { }
                SendJson(ctx, 500, "{\"error\":\"The selections could not be written.\"}");
                return;
            }
        }
        SendJson(ctx, 200, "{\"ok\":true}");
    }

    static void Handle(HttpListenerContext ctx, string appDir, string mediaDir)
    {
        string host = ctx.Request.Url.Host;
        string origin = ctx.Request.Headers["Origin"];
        bool hostOk = host == "127.0.0.1" || host == "localhost";
        bool originOk = string.IsNullOrEmpty(origin) || origin == "http://" + ctx.Request.Url.Authority;
        if (!hostOk || !originOk) { SendJson(ctx, 403, "{\"error\":\"Forbidden\"}"); return; }

        string path = ctx.Request.Url.AbsolutePath;
        string method = ctx.Request.HttpMethod;
        if (method == "GET" && path == "/api/media-info")
        {
            string gedcom = null;
            try { gedcom = PrimaryGedcomPath(appDir); } catch { }
            SendJson(ctx, 200, "{\"available\":true,\"app\":" + Js(appDir) + ",\"folder\":" + Js(Path.GetFileName(mediaDir)) +
                ",\"mediaPath\":" + Js(mediaDir) + ",\"mediaFolder\":" + Js(Path.GetFileName(mediaDir)) +
                ",\"gedcomPath\":" + Js(gedcom == null ? "" : Path.GetFullPath(gedcom)) +
                ",\"deletePaths\":true,\"personFolders\":true,\"organiseMedia\":true,\"readsPrimaryGedcom\":true,\"findDuplicates\":true,\"saveGedcom\":true,\"reveal\":true,\"gedcom\":" + Js(gedcom == null ? "" : Path.GetFileName(gedcom)) + "}");
            return;
        }
        if (method == "POST" && path == "/api/reveal") { HandleReveal(ctx, appDir, mediaDir); return; }
        if (method == "POST" && path == "/api/exit")
        {
            SendJson(ctx, 200, "{\"ok\":true}");
            System.Threading.ThreadPool.QueueUserWorkItem(delegate
            {
                System.Threading.Thread.Sleep(250);
                Environment.Exit(0);
            });
            return;
        }
        if (method == "POST" && path == "/api/media") { HandleUpload(ctx, mediaDir); return; }
        if (method == "POST" && path == "/api/media-delete") { HandleDelete(ctx, appDir, mediaDir); return; }
        if (method == "POST" && path == "/api/media-organise") { HandleMediaOrganise(ctx, appDir, mediaDir); return; }
        if (method == "POST" && path == "/api/duplicates") { HandleDuplicates(ctx, appDir, mediaDir); return; }
        if (method == "POST" && path == "/api/gedcom-save") { HandleGedcomSave(ctx, appDir); return; }
        if (method == "POST" && path == "/api/selections") { HandleSelectionsSave(ctx, appDir); return; }
        if (method == "GET" && path.StartsWith("/api/public-records/")) { HandlePublicRecords(ctx, path.Substring("/api/public-records/".Length)); return; }
        if (method == "GET" && path.StartsWith("/media/"))
        {
            string requested = Uri.UnescapeDataString(path.Substring(7)).Replace('\\', '/');
            string[] segments = requested.Split(new[] { '/' }, StringSplitOptions.RemoveEmptyEntries);
            if (segments.Length == 0 || !Array.TrueForAll(segments, s => s == SafeName(s))) { SendJson(ctx, 404, "{\"error\":\"Not found\"}"); return; }
            // With "?v=" the page names a version of the file, so a cached copy
            // from before a move or a delete is never shown.
            if (string.IsNullOrEmpty(ctx.Request.QueryString["v"])) ServeFile(ctx, mediaDir, string.Join("\\", segments));
            else ServeMediaFile(ctx, mediaDir, string.Join("\\", segments), ctx.Request.QueryString["v"]);
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

    // ---------------------------------------------------------------------------
    // Organise media files — the same rules as helpers/media-organise.js, so the
    // app, the Node helper and this launcher always produce the same plan.
    // ---------------------------------------------------------------------------

    // One media folder file, by its lower-cased path inside the media folder.
    sealed class MediaEntry
    {
        public string Relative;
        public string Key;
        public string Folder;
        public string Name;
        public string Full;
        public long Size;
    }

    // One FILE line in the GEDCOM.
    sealed class MediaReference
    {
        public string Path;
        public string Owner;
        public string Medium;
    }

    // What to do with one file: move, copy, replace or archive.
    sealed class MediaAction
    {
        public string Kind;
        public string FromPath;
        public string ToPath;
        public string ToFolder;
        public List<string> Owners = new List<string>();
    }

    // A person as the organiser needs them: folder name, birth and death years.
    sealed class MediaPerson
    {
        public string Id;
        public string Name;
        public string BirthYear;
        public string DeathYear;
    }

    sealed class MediaOrganiseResult
    {
        public string GedcomText;
        public List<MediaAction> Actions = new List<MediaAction>();
        public Dictionary<string, int> Counts = new Dictionary<string, int>();
        public List<string> Warnings = new List<string>();
        public List<string> Unsupported = new List<string>();
        public List<string[]> Renames = new List<string[]>();
        // The files used as card images, by normalised media path.
        public Dictionary<string, List<string>> Chosen = new Dictionary<string, List<string>>(StringComparer.OrdinalIgnoreCase);
        // The people linked to each file, by normalised media path.
        public Dictionary<string, List<string>> Owners = new Dictionary<string, List<string>>(StringComparer.OrdinalIgnoreCase);
    }

    static string MediaNormalize(string value)
    {
        return MediaSplit(value).ToLowerInvariant();
    }

    static string MediaSplit(string value)
    {
        return System.Text.RegularExpressions.Regex.Replace((value ?? "").Trim().Replace('\\', '/'), "/+", "/").Trim('/');
    }

    static string MediaFileName(string value)
    {
        string split = MediaSplit(value);
        int slash = split.LastIndexOf('/');
        return slash >= 0 ? split.Substring(slash + 1) : split;
    }

    static string MediaFolderOf(string value)
    {
        string split = MediaSplit(value);
        int slash = split.LastIndexOf('/');
        return slash >= 0 ? split.Substring(0, slash) : "";
    }

    static bool SameMediaPath(string key, string relativePath)
    {
        string relative = MediaNormalize(relativePath);
        if (key.Length == 0 || relative.Length == 0) return false;
        return key == relative || key.EndsWith("/" + relative) || relative.EndsWith("/" + key);
    }

    // An absolute FILE path written by an earlier install ("G:\tree-app\…") is
    // read against this media folder: the part after the folder ending in
    // "media" is the file's place here. A relative path is used as written.
    static string MediaRelativeReference(string path, string mediaFolderName)
    {
        string value = MediaSplit(path);
        if (!IsAbsoluteMediaPath(path)) return value;
        string[] parts = value.Split(new[] { '/' }, StringSplitOptions.RemoveEmptyEntries);
        for (int index = parts.Length - 2; index >= 0; index--)
        {
            if (!System.Text.RegularExpressions.Regex.IsMatch(parts[index], "media$", System.Text.RegularExpressions.RegexOptions.IgnoreCase)) continue;
            string[] rest = Slice(parts, index + 1);
            if (index + 2 < parts.Length) return string.Join("/", rest);
            if (mediaFolderName.Length > 0 && rest.Length > 0)
            {
                string[] withFolder = new string[rest.Length];
                withFolder[0] = mediaFolderName;
                Array.Copy(rest, 1, withFolder, 1, rest.Length - 1);
                return string.Join("/", withFolder);
            }
            return string.Join("/", rest);
        }
        return value;
    }

    static string[] Slice(string[] source, int start)
    {
        string[] result = new string[source.Length - start];
        Array.Copy(source, start, result, 0, result.Length);
        return result;
    }

    // File names that more than one media file in the folder shares.
    static HashSet<string> AmbiguousMediaNames(List<MediaEntry> entries)
    {
        var counts = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase);
        foreach (MediaEntry entry in entries)
        {
            string name = (entry.Name ?? "").ToLowerInvariant();
            if (name.Length == 0) continue;
            int seen;
            counts.TryGetValue(name, out seen);
            counts[name] = seen + 1;
        }
        var ambiguous = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (KeyValuePair<string, int> count in counts) if (count.Value > 1) ambiguous.Add(count.Key);
        return ambiguous;
    }

    // Points every FILE line naming a media file of the folder at the file's
    // place there, however the line spells the path - an old install's absolute
    // path, a folder since renamed, a bare file name. A file name shared by
    // several files is only matched when the line spells the exact path. Files
    // in the archive folder are never targets.
    static string RepointGedcomFiles(string gedcomText, List<MediaEntry> files, string mediaFolderName, string archiveFolder)
    {
        var entries = new Dictionary<string, MediaEntry>(StringComparer.OrdinalIgnoreCase);
        foreach (MediaEntry file in files)
        {
            string relative = MediaSplit(file.Relative);
            string key = relative.ToLowerInvariant();
            if (key.Length == 0 || entries.ContainsKey(key)) continue;
            file.Key = key;
            file.Folder = MediaFolderOf(relative);
            file.Name = MediaFileName(relative);
            file.Relative = relative;
            entries[key] = file;
        }
        string archiveKey = MediaNormalize(archiveFolder).Split('/')[0];
        Func<string, bool> isArchivedKey = delegate (string key)
        {
            MediaEntry entry;
            if (!entries.TryGetValue(key, out entry) || entry == null) return false;
            string top = MediaNormalize(entry.Folder).Split('/')[0];
            return top == archiveKey || IsArchiveFolderName(top);
        };
        var byName = new Dictionary<string, List<string>>(StringComparer.OrdinalIgnoreCase);
        foreach (MediaEntry entry in entries.Values)
        {
            string top = MediaNormalize(entry.Folder).Split('/')[0];
            if (top == archiveKey || IsArchiveFolderName(top)) continue;
            string name = (entry.Name ?? "").ToLowerInvariant();
            if (!byName.ContainsKey(name)) byName[name] = new List<string>();
            byName[name].Add(entry.Key);
        }
        var lines = new List<string>((gedcomText ?? "").Split('\n'));
        bool changed = false;
        for (int index = 0; index < lines.Count; index++)
        {
            string carriage = lines[index].EndsWith("\r") ? "\r" : "";
            var match = System.Text.RegularExpressions.Regex.Match(lines[index].TrimEnd('\r'), "^(\\d+\\s+FILE\\s+)(.*)$");
            if (!match.Success) continue;
            string value = match.Groups[2].Value.Trim();
            if (value.Length == 0 || !IsMediaExtension(value)) continue;
            string target = "";
            string key = MediaNormalize(value);
            if (entries.ContainsKey(key) && !isArchivedKey(key)) target = key;
            if (target.Length == 0)
            {
                string relative = MediaNormalize(MediaRelativeReference(value, mediaFolderName));
                if (relative != key && entries.ContainsKey(relative) && !isArchivedKey(relative)) target = relative;
            }
            if (target.Length == 0)
            {
                List<string> candidates;
                if (byName.TryGetValue(MediaFileName(MediaNormalize(MediaRelativeReference(value, mediaFolderName))).ToLowerInvariant(), out candidates) && candidates.Count == 1) target = candidates[0];
            }
            if (target.Length == 0 || MediaNormalize(value) == target) continue;
            lines[index] = match.Groups[1].Value + entries[target].Relative + carriage;
            changed = true;
        }
        return changed ? string.Join("\n", lines) : gedcomText;
    }

    static bool IsMediaExtension(string name)
    {
        string ext = Path.GetExtension(name ?? "").ToLowerInvariant();
        return (name ?? "").Length > 0 && !name.StartsWith(".") && Array.IndexOf(MediaExtensions, ext) >= 0;
    }

    // The GEDCOM's own file, never an attachment to organise.
    static bool IsGedcomExtension(string name)
    {
        string ext = Path.GetExtension(name ?? "").ToLowerInvariant();
        return ext == ".ged" || ext == ".gedcom";
    }

    static bool IsAbsoluteMediaPath(string path)
    {
        return System.Text.RegularExpressions.Regex.IsMatch(path ?? "", "^([a-z]:[\\\\/]|\\\\\\\\|//|file:)", System.Text.RegularExpressions.RegexOptions.IgnoreCase);
    }

    // "Ada Allnutt (1864-unknown) [I455]", matching the app's person folders:
    // Windows' forbidden characters become "-", trailing dots and spaces go, and
    // the name is trimmed to 150 characters keeping the years and id.
    static string MediaPersonFolder(MediaPerson person)
    {
        string name = System.Text.RegularExpressions.Regex.Replace((person.Name ?? "").Trim(), "\\s+", " ");
        name = System.Text.RegularExpressions.Regex.Replace(name, "[<>:\"/\\\\|?*\\x00-\\x1f]", "-");
        name = name.TrimEnd('.', ' ');
        if (name.Length == 0) name = "Unknown";
        string birth = System.Text.RegularExpressions.Regex.Match(person.BirthYear ?? "", "\\d{4}").Value;
        string death = System.Text.RegularExpressions.Regex.Match(person.DeathYear ?? "", "\\d{4}").Value;
        if (birth.Length == 0) birth = "unknown";
        if (death.Length == 0) death = "unknown";
        string id = (person.Id ?? "").Trim('@');
        string years = " (" + birth + "-" + death + ")";
        string suffix = id.Length > 0 ? " [" + id + "]" : "";
        int room = Math.Max(1, 150 - years.Length - suffix.Length);
        if (name.Length > room) name = name.Substring(0, room).TrimEnd('.', ' ');
        return name + years + suffix;
    }

    // Names and years for every person in the GEDCOM, in the shape the page sends.
    // Birth and death years are read from each person's BIRT and DEAT dates, so
    // person folders come out as "Ada Allnutt (1864-unknown) [I455]" — matching
    // folders already on disk — rather than "(unknown-unknown)" when the page's
    // own request carries no year values.
    static string MediaPeopleJson(List<GedcomRecord> records)
    {
        var sb = new StringBuilder("[");
        bool first = true;
        foreach (GedcomRecord record in records)
        {
            if (record.Tag != "INDI") continue;
            string given = "";
            string surname = "";
            string raw = "";
            string birthYear = "";
            string deathYear = "";
            foreach (string line in record.Lines)
            {
                var nameField = System.Text.RegularExpressions.Regex.Match(line, "^1\\s+NAME\\s+(.*)$");
                if (nameField.Success && raw.Length == 0) raw = nameField.Groups[1].Value;
                var givn = System.Text.RegularExpressions.Regex.Match(line, "^2\\s+GIVN\\s+(.*)$");
                if (givn.Success && given.Length == 0) given = givn.Groups[1].Value;
                var surn = System.Text.RegularExpressions.Regex.Match(line, "^2\\s+SURN\\s+(.*)$");
                if (surn.Success && surname.Length == 0) surname = surn.Groups[1].Value;
                var birth = System.Text.RegularExpressions.Regex.Match(line, "^2\\s+DATE\\s+(.*)$");
                if (birth.Success)
                {
                    // The DATE line only counts when it sits under a 1 BIRT or 1 DEAT.
                    string year = System.Text.RegularExpressions.Regex.Match(birth.Groups[1].Value, "\\d{4}").Value;
                    if (year.Length > 0)
                    {
                        if (birthYear.Length == 0 && PreviousLevel1Tag(record, line) == "BIRT") birthYear = year;
                        if (deathYear.Length == 0 && PreviousLevel1Tag(record, line) == "DEAT") deathYear = year;
                    }
                }
            }
            if (!first) sb.Append(',');
            first = false;
            string fullName = (given.Length > 0 ? given : raw.Split('/')[0].Trim()) + " " + (surname.Length > 0 ? surname : (raw.Split('/').Length > 1 ? raw.Split('/')[1] : ""));
            sb.Append("{\"id\":").Append(Js(record.Xref)).Append(",\"name\":").Append(Js(System.Text.RegularExpressions.Regex.Replace(fullName.Trim(), "\\s+", " ")))
              .Append(",\"birthYear\":").Append(Js(birthYear)).Append(",\"deathYear\":").Append(Js(deathYear)).Append('}');
        }
        return sb.Append(']').ToString();
    }

    // The most recent level-1 tag before this line in the record: "BIRT" when a
    // 2 DATE line sits under 1 BIRT, "DEAT" under 1 DEAT, and so on.
    static string PreviousLevel1Tag(GedcomRecord record, string line)
    {
        string result = "";
        foreach (string scan in record.Lines)
        {
            if (scan == line) return result;
            var field = System.Text.RegularExpressions.Regex.Match(scan, "^1\\s+(\\S+)");
            if (field.Success) result = field.Groups[1].Value.ToUpperInvariant();
        }
        return result;
    }

    static string UniqueMediaName(string fileName, HashSet<string> taken)
    {
        int dot = fileName.LastIndexOf('.');
        string stem = dot > 0 ? fileName.Substring(0, dot) : fileName;
        string extension = dot > 0 ? fileName.Substring(dot) : "";
        for (int suffix = 2; suffix < 10000; suffix++)
        {
            string candidate = stem + " (" + suffix + ")" + extension;
            if (!taken.Contains(candidate.ToLowerInvariant())) return candidate;
        }
        return stem + " (" + DateTime.Now.Ticks + ")" + extension;
    }

    // True when the destination folder already holds a copy this file's earlier
    // organise runs made: "name (2).jpg"… beside the wanted "name.jpg". A file
    // the user named that way themselves is indistinguishable, but re-copying
    // would duplicate it again either way, so the copy is skipped and the file
    // shows up in "Find duplicate images" for a manual check.
    static bool HasPriorMediaCopy(HashSet<string> namesInFolder, string fileName)
    {
        int dot = fileName.LastIndexOf('.');
        if (dot < 0) return false;
        string stem = fileName.Substring(0, dot);
        string extension = fileName.Substring(dot);
        var suffix = new System.Text.RegularExpressions.Regex("^(.*) \\((\\d+)\\)$");
        foreach (string existing in namesInFolder)
        {
            var match = suffix.Match(existing);
            if (match.Success && string.Equals(match.Groups[1].Value, stem, StringComparison.OrdinalIgnoreCase)
                && existing.EndsWith(extension, StringComparison.OrdinalIgnoreCase)) return true;
        }
        return false;
    }

    static string JsonBool(bool value) { return value ? "true" : "false"; }

    static List<MediaPerson> ReadMediaPeople(string json)
    {
        var people = new List<MediaPerson>();
        int index = json.IndexOf("\"people\"", StringComparison.Ordinal);
        if (index < 0) return people;
        index = json.IndexOf('[', index);
        int end = index >= 0 ? json.IndexOf(']', index) : -1;
        if (index < 0 || end < 0) return people;
        string body = json.Substring(index + 1, end - index - 1);
        foreach (System.Text.RegularExpressions.Match match in System.Text.RegularExpressions.Regex.Matches(body, "\\{[^{}]*\\}"))
        {
            string entry = match.Value;
            var person = new MediaPerson
            {
                Id = JsonString(entry, "id"), Name = JsonString(entry, "name"),
                BirthYear = JsonString(entry, "birthYear"), DeathYear = JsonString(entry, "deathYear")
            };
            if (!string.IsNullOrEmpty(person.Id)) people.Add(person);
        }
        return people;
    }

    static Dictionary<string, string> ReadHeroPicks(string json)
    {
        var picks = new Dictionary<string, string>();
        int index = json.IndexOf("\"heroPicks\"", StringComparison.Ordinal);
        if (index < 0) return picks;
        index = json.IndexOf('{', index);
        int end = index >= 0 ? json.IndexOf('}', index) : -1;
        if (index < 0 || end < 0) return picks;
        string body = json.Substring(index + 1, end - index - 1);
        foreach (System.Text.RegularExpressions.Match match in System.Text.RegularExpressions.Regex.Matches(body, "\"([^\"]+)\"\\s*:\\s*\"((?:[^\"\\\\]|\\\\.)*)\""))
        {
            string key = System.Text.RegularExpressions.Regex.Unescape(match.Groups[1].Value);
            string value = System.Text.RegularExpressions.Regex.Unescape(match.Groups[2].Value);
            picks[key] = value;
        }
        return picks;
    }

    // Splits GEDCOM text into records: "0 @X@ TAG" starts one.
    sealed class GedcomRecord
    {
        public string Xref = "";
        public string Tag = "";
        public List<string> Lines = new List<string>();
    }

    static List<GedcomRecord> SplitGedcomRecords(string text)
    {
        var records = new List<GedcomRecord>();
        GedcomRecord active = null;
        foreach (string rawLine in (text ?? "").TrimStart('\uFEFF').Split('\n'))
        {
            string line = rawLine.TrimEnd('\r');
            var start = System.Text.RegularExpressions.Regex.Match(line, "^0\\s+(?:(@[^@]+@)\\s+)?([A-Za-z0-9_]+)(?:\\s+(.*))?$");
            if (start.Success)
            {
                if (active != null) records.Add(active);
                active = new GedcomRecord { Xref = start.Groups[1].Value.Trim('@'), Tag = start.Groups[2].Value.ToUpperInvariant() };
                active.Lines.Add(line);
            }
            else if (active != null) active.Lines.Add(line);
        }
        if (active != null) records.Add(active);
        return records;
    }

    // Every FILE line with the record that holds it and the medium it sits in.
    static List<MediaReference> ReadGedcomMedia(List<GedcomRecord> records)
    {
        var references = new List<MediaReference>();
        foreach (GedcomRecord record in records)
        {
            bool isPerson = record.Tag == "INDI" || record.Tag == "FAM";
            var stack = new Dictionary<int, string[]>();
            foreach (string line in record.Lines)
            {
                var field = System.Text.RegularExpressions.Regex.Match(line, "^(\\d+)\\s+(\\S+)\\s*(.*)$");
                if (!field.Success) continue;
                int level = int.Parse(field.Groups[1].Value);
                stack[level] = new[] { field.Groups[2].Value, field.Groups[3].Value.Trim() };
                if (field.Groups[2].Value != "FILE") continue;
                string path = field.Groups[3].Value.Trim();
                if (path.Length == 0) continue;
                string medium = "";
                for (int above = level - 1; above >= 0; above--)
                {
                    string[] parent;
                    if (stack.TryGetValue(above, out parent) && parent[0] == "OBJE") { medium = parent[1].Trim('@'); break; }
                }
                references.Add(new MediaReference { Path = path, Owner = isPerson ? record.Xref : "", Medium = medium });
            }
        }
        return references;
    }

    // Works out where every file in the media folder belongs, as the app does:
    // linked files go to each linked person's folder, files in a person's folder
    // follow that person, and everything else goes to "Archive/<date>".
    static MediaOrganiseResult ComputeMediaOrganise(List<GedcomRecord> records, List<MediaPerson> people, List<MediaEntry> files, string archiveFolder, Dictionary<string, string> heroPicks, string mediaFolderName)
    {
        var result = new MediaOrganiseResult();
        string stamp = DateTime.Now.ToString("yyyy-MM-dd");
        var entries = new Dictionary<string, MediaEntry>(StringComparer.OrdinalIgnoreCase);
        var order = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase);
        var byId = new Dictionary<string, MediaPerson>(StringComparer.OrdinalIgnoreCase);
        var foldersOf = new Dictionary<string, List<string>>(StringComparer.OrdinalIgnoreCase);
        foreach (MediaPerson person in people)
        {
            string id = (person.Id ?? "").Trim('@');
            if (id.Length == 0 || byId.ContainsKey(id)) continue;
            order[id] = order.Count;
            byId[id] = person;
        }
        foreach (MediaEntry file in files)
        {
            string relative = MediaSplit(file.Relative);
            string key = relative.ToLowerInvariant();
            if (key.Length == 0 || entries.ContainsKey(key)) continue;
            file.Key = key;
            file.Folder = MediaFolderOf(relative);
            file.Name = MediaFileName(relative);
            file.Relative = relative;
            entries[key] = file;
        }
        // A folder already in the media folder that carries a person's "[Ixxxx]"
        // belongs to that person, however its name is spelled: nicknames written
        // "_Cock_", years the GEDCOM does not record, or a name edited since the
        // folder was made. Those folders are reused — with their on-disk
        // spelling, so the move lands in the folder that exists — instead of
        // computing a fresh name that would match nothing on disk.
        var existingFolderById = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        foreach (MediaEntry e in entries.Values)
        {
            string folder = MediaSplit(e.Folder);
            if (folder.Length == 0 || folder.IndexOf('/') >= 0) continue;
            var m = System.Text.RegularExpressions.Regex.Match(folder, "\\[([^\\]]+)\\]\\s*$");
            if (!m.Success) continue;
            string pid = m.Groups[1].Value.Trim('@');
            if (!byId.ContainsKey(pid)) continue;
            string prev;
            if (!existingFolderById.TryGetValue(pid, out prev)) existingFolderById[pid] = folder;
            else if (!string.Equals(prev, folder, StringComparison.OrdinalIgnoreCase)) existingFolderById[pid] = "";   // two folders claim the id: no reuse
        }
        Func<string, string> folderFor = delegate (string id)
        {
            MediaPerson owner;
            if (!byId.TryGetValue(id, out owner) || owner == null) return "";
            string existing;
            if (existingFolderById.TryGetValue(id, out existing) && existing.Length > 0) return existing;
            return MediaPersonFolder(owner);
        };
        foreach (string pid in byId.Keys)
        {
            string folder = MediaNormalize(folderFor(pid));
            if (folder.Length == 0) continue;
            if (!foldersOf.ContainsKey(folder)) foldersOf[folder] = new List<string>();
            foldersOf[folder].Add(pid);
        }
        string archiveKey = MediaNormalize(archiveFolder);
        Func<string, bool> isArchive = delegate (string folder)
        {
            string top = MediaNormalize(folder).Split('/')[0];
            return top == archiveKey || IsArchiveFolderName(top);
        };
        Func<string, string> keyOf = delegate (string path)
        {
            string key = MediaNormalize(path);
            if (entries.ContainsKey(key)) return key;
            string relative = MediaNormalize(MediaRelativeReference(path, mediaFolderName));
            if (relative != key && entries.ContainsKey(relative)) return relative;
            foreach (string candidate in entries.Keys) if (SameMediaPath(relative, candidate)) return candidate;
            return key;
        };
        var byName = new Dictionary<string, List<string>>(StringComparer.OrdinalIgnoreCase);
        foreach (MediaEntry entry in entries.Values)
        {
            if (!byName.ContainsKey(entry.Name)) byName[entry.Name] = new List<string>();
            byName[entry.Name].Add(entry.Key);
        }
        Func<string, string> fallbackKey = delegate (string path)
        {
            string key = keyOf(path);
            if (entries.ContainsKey(key)) return key;
            string relative = MediaNormalize(MediaRelativeReference(path, mediaFolderName));
            List<string> candidates;
            if (!byName.TryGetValue(MediaFileName(relative), out candidates)) return key;
            string folder = MediaNormalize(MediaFolderOf(relative));
            var inFolder = new List<string>();
            foreach (string candidate in candidates) if (MediaNormalize(entries[candidate].Folder) == folder) inFolder.Add(candidate);
            if (inFolder.Count == 1) return inFolder[0];
            // The recorded folder names the same person but spells it differently
            // ("... (unknown-unknown) [I621]" vs "... (1872-1955) [I621]"): the
            // folder on disk that carries the same "[Ixxxx]" is the file's place.
            var idMatch = System.Text.RegularExpressions.Regex.Match(folder, "\\[([^\\]]+)\\]\\s*$");
            if (idMatch.Success)
            {
                var inFolderById = new List<string>();
                foreach (string candidate in candidates)
                {
                    string candidateFolder = MediaNormalize(entries[candidate].Folder);
                    if (System.Text.RegularExpressions.Regex.IsMatch(candidateFolder, "\\[" + System.Text.RegularExpressions.Regex.Escape(idMatch.Groups[1].Value) + "\\]\\s*$")) inFolderById.Add(candidate);
                }
                if (inFolderById.Count == 1) return inFolderById[0];
            }
            return candidates.Count == 1 ? candidates[0] : key;
        };

        List<MediaReference> references = ReadGedcomMedia(records);
        var users = new Dictionary<string, HashSet<string>>(StringComparer.OrdinalIgnoreCase);
        var mediumsOf = new Dictionary<string, List<string>>(StringComparer.OrdinalIgnoreCase);
        Action<string, string> addUser = delegate (string key, string id)
        {
            if (key.Length == 0 || !order.ContainsKey(id)) return;
            if (!users.ContainsKey(key)) users[key] = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            users[key].Add(id);
        };
        foreach (MediaReference reference in references)
        {
            string file = fallbackKey(reference.Path);
            if (!entries.ContainsKey(file)) continue;
            addUser(file, reference.Owner);
            if (reference.Medium.Length == 0) continue;
            if (!mediumsOf.ContainsKey(reference.Medium)) mediumsOf[reference.Medium] = new List<string>();
            if (!mediumsOf[reference.Medium].Contains(file)) mediumsOf[reference.Medium].Add(file);
        }
        var pointed = new Dictionary<string, HashSet<string>>(StringComparer.OrdinalIgnoreCase);
        foreach (GedcomRecord record in records)
        {
            if (record.Tag != "INDI" && record.Tag != "FAM") continue;
            foreach (string line in record.Lines)
            {
                var pointer = System.Text.RegularExpressions.Regex.Match(line, "^\\d+\\s+OBJE\\s+@([^@\\s]+)@\\s*$");
                if (!pointer.Success) continue;
                string medium = pointer.Groups[1].Value;
                if (!pointed.ContainsKey(medium)) pointed[medium] = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
                pointed[medium].Add(record.Xref);
            }
        }
        foreach (KeyValuePair<string, List<string>> medium in mediumsOf)
        {
            HashSet<string> holders;
            if (!pointed.TryGetValue(medium.Key, out holders)) continue;
            foreach (string id in holders) foreach (string key in medium.Value) addUser(key, id);
        }
        var owners = new Dictionary<string, List<string>>(StringComparer.OrdinalIgnoreCase);
        foreach (KeyValuePair<string, HashSet<string>> user in users)
        {
            var list = new List<string>(user.Value);
            list.Sort((left, right) => order[left].CompareTo(order[right]));
            owners[user.Key] = list;
        }
        result.Owners = owners;
        var chosen = new Dictionary<string, List<string>>(StringComparer.OrdinalIgnoreCase);
        foreach (KeyValuePair<string, string> pick in heroPicks)
        {
            string key = fallbackKey(pick.Value);
            if (!entries.ContainsKey(key) || !order.ContainsKey(pick.Key)) continue;
            if (!chosen.ContainsKey(key)) chosen[key] = new List<string>();
            if (!chosen[key].Contains(pick.Key)) chosen[key].Add(pick.Key);
        }

        Func<string, HashSet<string>> namesIn = delegate (string folder)
        {
            var names = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            foreach (MediaEntry entry in entries.Values) if (MediaNormalize(entry.Folder) == MediaNormalize(folder)) names.Add(entry.Name);
            return names;
        };
        var used = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (MediaEntry entry in entries.Values)
        {
            string key = entry.Key;
            if (fallbackKey(entry.Relative) != key) continue;
            if (isArchive(entry.Folder)) continue;
            if (used.Contains(key)) continue;
            List<string> personIds;
            owners.TryGetValue(key, out personIds);
            if (personIds == null) personIds = new List<string>();
            if (personIds.Count > 0)
            {
                // A file already sitting in one of its owners' folders stays
                // exactly there: the owner whose folder holds it is the keeper,
                // and every other owner gets a copy. Moving it away (because a
                // GEDCOM-earlier owner computes first) would churn files users
                // have arranged and rewrite links for nothing.
                string keeperId = personIds[0];
                foreach (string candidate in personIds)
                {
                    if (MediaNormalize(folderFor(candidate)) == MediaNormalize(entry.Folder)) { keeperId = candidate; break; }
                }
                for (int index = 0; index < personIds.Count; index++)
                {
                    string id = personIds[index];
                    string folder = folderFor(id);
                    string wanted = folder + "/" + entry.Name;
                    string wantedKey = MediaNormalize(wanted);
                    if (wantedKey == key) continue;
                    MediaEntry occupant;
                    entries.TryGetValue(wantedKey, out occupant);
                    string toPath = wanted;
                    string kind = id == keeperId ? "move" : "copy";
                    if (occupant != null && kind == "move")
                    {
                        List<string> existingOwners;
                        owners.TryGetValue(wantedKey, out existingOwners);
                        bool sameImage = string.Join(",", existingOwners ?? new List<string>()) == string.Join(",", personIds)
                            || (occupant.Size > 0 && entry.Size > 0 && occupant.Size == entry.Size);
                        if (sameImage) continue;
                        kind = "replace";
                    }
                    else if (occupant != null || used.Contains(wantedKey))
                    {
                        if (occupant != null && occupant.Size > 0 && entry.Size > 0 && occupant.Size == entry.Size) continue;   // already copied earlier
                        // Without sizes, a copy an earlier run made is still
                        // recognised by its numbered name ("name (2).jpg"…)
                        // sitting beside the wanted "name.jpg" in the folder.
                        if (kind == "copy" && HasPriorMediaCopy(namesIn(folder), entry.Name)) continue;
                        toPath = folder + "/" + UniqueMediaName(entry.Name, namesIn(folder));
                    }
                    string toKey = MediaNormalize(toPath);
                    if (toKey == key || used.Contains(toKey)) continue;
                    used.Add(key);
                    used.Add(toKey);
                    var action = new MediaAction { Kind = kind, FromPath = entry.Relative, ToPath = toPath, ToFolder = folder };
                    action.Owners.Add(id);
                    result.Actions.Add(action);
                }
                continue;
            }
            string current = entry.Folder;
            List<string> named = null;
            if (current.Length > 0 && !isArchive(current)) foldersOf.TryGetValue(MediaNormalize(current), out named);
            string archiveTarget = archiveFolder + "/" + stamp;
            string archiveKind = "archive";
            string ownerId = "";
            string targetFolder = archiveTarget;
            if (named != null && named.Count == 1)
            {
                targetFolder = folderFor(named[0]);
                archiveKind = "move";
                ownerId = named[0];
            }
            else if (chosen.ContainsKey(key))
            {
                string personId = chosen[key][0];
                targetFolder = folderFor(personId);
                archiveKind = "move";
                ownerId = personId;
                result.Warnings.Add("\"" + entry.Relative + "\" is an unlinked card image, so it moves to the person's folder instead of the archive.");
            }
            string placePath = targetFolder + "/" + entry.Name;
            if (MediaNormalize(placePath) == key) continue;
            string placeKey = MediaNormalize(placePath);
            if (entries.ContainsKey(placeKey) || used.Contains(placeKey)) placePath = targetFolder + "/" + UniqueMediaName(entry.Name, namesIn(targetFolder));
            placeKey = MediaNormalize(placePath);
            if (used.Contains(placeKey)) continue;
            used.Add(key);
            used.Add(placeKey);
            var archiveAction = new MediaAction { Kind = archiveKind, FromPath = entry.Relative, ToPath = placePath, ToFolder = targetFolder };
            if (ownerId.Length > 0) archiveAction.Owners.Add(ownerId);
            result.Actions.Add(archiveAction);
        }
        foreach (MediaReference reference in references)
        {
            if (reference.Path.Length == 0 || entries.ContainsKey(fallbackKey(reference.Path))) continue;
            // The GEDCOM's own tree file ("... .ged") is not a media file, and a
            // FILE line naming an image or PDF the GEDCOM itself carries is
            // documented, not missing. Neither belongs in the media folder.
            string nameOnly = MediaFileName(MediaSplit(reference.Path));
            if (nameOnly.EndsWith(".ged", StringComparison.OrdinalIgnoreCase) || !IsMediaExtension(nameOnly)) continue;
            // A file name the media folder holds at all (even more than once, or
            // under a folder spelled differently) is not missing: the file is
            // here, only the recorded path is out of date.
            List<string> sameName;
            if (byName.TryGetValue(nameOnly.ToLowerInvariant(), out sameName) && sameName.Count > 0) continue;
            // Paths written by an earlier install ("G:\tree-app\…") or by a copy
            // of the tree elsewhere already resolved to a file here through their
            // folder-name fallback; only paths that name nothing here are missing.
            string warning = "\"" + reference.Path + "\" is named in the GEDCOM but is not in the media folder.";
            if (!result.Warnings.Contains(warning)) result.Warnings.Add(warning);
            if (IsAbsoluteMediaPath(reference.Path) && !result.Unsupported.Contains(reference.Path)) result.Unsupported.Add(reference.Path);
        }
        result.Counts["moved"] = 0; result.Counts["copied"] = 0; result.Counts["replaced"] = 0; result.Counts["archived"] = 0; result.Counts["failed"] = 0;
        result.Chosen = chosen;
        result.GedcomText = null;
        return result;
    }

    // Points every FILE line that named a moved file at its new place. Line
    // endings are kept; a path is matched on \\ or /, quoted or not, and — when
    // the file's name is unique in the media folder — by that name alone, so a
    // line written by an earlier install ("G:\tree-app\…\old folder\file.jpg")
    // is repointed too. A name several files share is only matched by exact path.
    static string RewriteGedcomFile(string gedcomText, string oldPath, string newPath, HashSet<string> ambiguousNames)
    {
        string from = MediaNormalize(oldPath);
        if (from.Length == 0) return gedcomText;
        string fileName = MediaFileName(oldPath).ToLowerInvariant();
        bool byName = ambiguousNames == null || !ambiguousNames.Contains(fileName);
        string replacement = MediaSplit(newPath);
        var lines = new List<string>((gedcomText ?? "").Split('\n'));
        bool changed = false;
        for (int index = 0; index < lines.Count; index++)
        {
            string carriage = lines[index].EndsWith("\r") ? "\r" : "";
            var match = System.Text.RegularExpressions.Regex.Match(lines[index].TrimEnd('\r'), "^(\\d+\\s+FILE\\s+)(.*)$");
            if (!match.Success) continue;
            string value = match.Groups[2].Value.Trim();
            bool quoted = value.Length > 1 && value.StartsWith("\"") && value.EndsWith("\"");
            string key = MediaNormalize(quoted ? value.Substring(1, value.Length - 2) : value);
            if (key != from && !(byName && MediaFileName(key).ToLowerInvariant() == fileName)) continue;
            lines[index] = match.Groups[1].Value + (quoted ? "\"" + replacement + "\"" : replacement) + carriage;
            changed = true;
        }
        return changed ? string.Join("\n", lines) : gedcomText;
    }

    // Removes every FILE line that names the given file. Line endings and
    // everything else are kept; the text is returned as it was when nothing
    // pointed at the file.
    static string RemoveGedcomFileReferences(string gedcomText, string oldPath)
    {
        string target = MediaNormalize(oldPath);
        if (target.Length == 0) return gedcomText;
        string fileName = MediaFileName(oldPath).ToLowerInvariant();
        string[] lines = (gedcomText ?? "").Split('\n');
        var kept = new List<string>();
        bool changed = false;
        foreach (string rawLine in lines)
        {
            var match = System.Text.RegularExpressions.Regex.Match(rawLine.TrimEnd('\r'), "^\\d+\\s+FILE\\s+(.*)$");
            if (match.Success)
            {
                string value = match.Groups[1].Value.Trim();
                bool quoted = value.Length > 1 && value.StartsWith("\"") && value.EndsWith("\"");
                string key = MediaNormalize(quoted ? value.Substring(1, value.Length - 2) : value);
                if (key == target || key == fileName) { changed = true; continue; }
            }
            kept.Add(rawLine);
        }
        return changed ? string.Join("\n", kept) : gedcomText;
    }

    // Writes one file where the plan says, creating folders as needed. A move or
    // archive removes the source; a copy leaves it. Nothing is overwritten unless
    // the plan says "replace".
    static string PlaceMediaFile(string mediaDir, MediaAction action)
    {
        string from = Path.GetFullPath(Path.Combine(mediaDir, action.FromPath.Replace('/', '\\')));
        string root = Path.GetFullPath(mediaDir).TrimEnd('\\') + "\\";
        if (!from.StartsWith(root, StringComparison.OrdinalIgnoreCase)) throw new InvalidOperationException("A file path could not be used.");
        if (!File.Exists(from)) throw new FileNotFoundException("The file is no longer in the media folder.");
        string target = Path.GetFullPath(Path.Combine(mediaDir, action.ToPath.Replace('/', '\\')));
        if (!target.StartsWith(root, StringComparison.OrdinalIgnoreCase)) throw new InvalidOperationException("A file path could not be used.");
        Directory.CreateDirectory(Path.GetDirectoryName(target));
        if (string.Equals(from, target, StringComparison.OrdinalIgnoreCase)) return action.ToPath;
        if (File.Exists(target) && action.Kind != "replace")
        {
            target = Path.Combine(Path.GetDirectoryName(target), UniqueMediaName(Path.GetFileName(target), new HashSet<string>(StringComparer.OrdinalIgnoreCase)));
        }
        if (action.Kind == "replace") File.Copy(from, target, true);
        else File.Copy(from, target, false);
        if (action.Kind != "copy") File.Delete(from);
        return target.Substring(Path.GetFullPath(mediaDir).TrimEnd('\\').Length).TrimStart('\\').Replace('\\', '/');
    }

    // Every image or PDF under the media folder, as entries for the organiser.
    static List<MediaEntry> ListMediaEntries(string mediaDir)
    {
        var entries = new List<MediaEntry>();
        if (!Directory.Exists(mediaDir)) return entries;
        foreach (string file in Directory.GetFiles(mediaDir, "*", SearchOption.AllDirectories))
        {
            if (!IsMediaExtension(file)) continue;
            string relative = file.Substring(Path.GetFullPath(mediaDir).TrimEnd('\\').Length).TrimStart('\\');
            entries.Add(new MediaEntry
            {
                Relative = relative,
                Key = MediaNormalize(relative),
                Folder = MediaFolderOf(relative),
                Name = Path.GetFileName(file),
                Full = file,
                Size = new FileInfo(file).Length
            });
        }
        entries.Sort((left, right) => string.Compare(left.Relative, right.Relative, StringComparison.OrdinalIgnoreCase));
        return entries;
    }

    static string MediaActionsJson(List<MediaAction> actions)
    {
        var sb = new StringBuilder("[");
        for (int index = 0; index < actions.Count; index++)
        {
            MediaAction action = actions[index];
            if (index > 0) sb.Append(',');
            sb.Append("{\"kind\":").Append(Js(action.Kind)).Append(",\"fromPath\":").Append(Js(action.FromPath))
              .Append(",\"toPath\":").Append(Js(action.ToPath)).Append(",\"toFolder\":").Append(Js(action.ToFolder)).Append("}");
        }
        return sb.Append(']').ToString();
    }

    static string MediaWarningsJson(List<string> warnings)
    {
        var sb = new StringBuilder("[");
        for (int index = 0; index < warnings.Count; index++)
        {
            if (index > 0) sb.Append(',');
            sb.Append("{\"message\":").Append(Js(warnings[index])).Append('}');
        }
        return sb.Append(']').ToString();
    }

    // The media folder's empty subfolders, apart from the archive folder and its
    // aliases: a folder holding any file is never listed.
    static List<string> EmptyFolders(string mediaDir, string archiveFolder)
    {
        var empty = new List<string>();
        if (!Directory.Exists(mediaDir)) return empty;
        string archiveKey = (archiveFolder ?? "Archive").Trim().ToLowerInvariant();
        foreach (string folder in Directory.GetDirectories(mediaDir))
        {
            string name = Path.GetFileName(folder);
            if (Array.IndexOf(ArchiveFolderNames, name.ToLowerInvariant()) >= 0 || name.ToLowerInvariant() == archiveKey) continue;
            if (Directory.GetFileSystemEntries(folder, "*", SearchOption.AllDirectories).Length == 0) empty.Add(name);
        }
        empty.Sort(StringComparer.OrdinalIgnoreCase);
        return empty;
    }

    static string EmptyFoldersJson(string mediaDir, string archiveFolder)
    {
        var sb = new StringBuilder("[");
        List<string> empty = EmptyFolders(mediaDir, archiveFolder);
        for (int index = 0; index < empty.Count; index++)
        {
            if (index > 0) sb.Append(',');
            sb.Append("{\"folder\":").Append(Js(empty[index])).Append(",\"files\":[]}");
        }
        return sb.Append(']').ToString();
    }

    // Deletes one empty subfolder of the media folder. A folder that still holds
    // anything is refused, so only the folders the check listed can go.
    static string DeleteEmptyFolder(string mediaDir, string folder)
    {
        string relative = SafeMediaRelative(folder);
        if (relative.Length == 0) throw new Exception("The folder could not be used.");
        string full = Path.GetFullPath(Path.Combine(mediaDir, relative));
        string root = Path.GetFullPath(mediaDir).TrimEnd('\\') + Path.DirectorySeparatorChar;
        if (!full.StartsWith(root, StringComparison.OrdinalIgnoreCase)) throw new Exception("The folder could not be used.");
        if (!Directory.Exists(full)) throw new Exception("The folder is no longer in the media folder.");
        if (Directory.GetFileSystemEntries(full).Length > 0) throw new Exception("The folder is no longer empty, so it was left alone.");
        Directory.Delete(full);
        return "{\"ok\":true,\"folderDelete\":{\"removed\":1,\"failed\":0}}";
    }

    // "A\\b\\c" -> "A/b/c" inside the media folder only: no absolute paths, no
    // "..", no drive letters.
    static string SafeMediaRelative(string value)
    {
        string relative = (value ?? "").Replace('\\', '/').Trim();
        if (relative.Length == 0 || relative.StartsWith("/") || System.Text.RegularExpressions.Regex.IsMatch(relative, "^[a-z]:", System.Text.RegularExpressions.RegexOptions.IgnoreCase)) return "";
        string[] segments = relative.Split('/');
        foreach (string segment in segments) if (segment.Length == 0 || segment == "." || segment == "..") return "";
        return string.Join("/", segments);
    }

    // The reply to POST /api/media-organise: plans the organisation (apply: false)
    // or carries it out (apply: true), and includes the GEDCOM text to save.
    // records and peopleJson come from the primary GEDCOM, so the request body
    // only has to carry the small choices (archive name, card images, apply).
    static string MediaOrganiseReply(string appDir, string mediaDir, string json, List<GedcomRecord> records, string peopleJson)
    {
        bool apply = System.Text.RegularExpressions.Regex.IsMatch(json, "\"apply\"\\s*:\\s*true");
        string gedcomText = JsonString(json, "gedcomText") ?? "";
        if (!System.Text.RegularExpressions.Regex.IsMatch(gedcomText, "(^|\\n)0 TRLR\\s*$"))
        {
            // Without the tree the plan cannot tell who owns what: use the primary GEDCOM.
            try { gedcomText = File.ReadAllText(PrimaryGedcomPath(appDir) ?? ""); } catch { gedcomText = ""; }
        }
        if (gedcomText.Length == 0) return "{\"error\":\"Open a GEDCOM first.\"}";
        string archiveFolder = JsonString(json, "archiveFolder") ?? "Archive";
        if (archiveFolder.Trim().Length == 0) archiveFolder = "Archive";
        if (System.Text.RegularExpressions.Regex.IsMatch(archiveFolder, "[\\\\/:*?\"<>|]")) archiveFolder = "Archive";
        // GEDCOM paths from another copy of the tree name this media folder's own name.
        string mediaFolderName = JsonString(json, "mediaFolderName") ?? Path.GetFileName(mediaDir);
        if (System.Text.RegularExpressions.Regex.IsMatch(mediaFolderName, "[\\\\/:*?\"<>|]")) mediaFolderName = Path.GetFileName(mediaDir);

        List<MediaEntry> mediaEntries = ListMediaEntries(mediaDir);
        HashSet<string> ambiguousNames = AmbiguousMediaNames(mediaEntries);
        MediaOrganiseResult plan;
        try
        {
            List<GedcomRecord> gedcomRecords = records ?? SplitGedcomRecords(gedcomText);
            plan = ComputeMediaOrganise(gedcomRecords, ReadMediaPeople(peopleJson), mediaEntries, archiveFolder, ReadHeroPicks(json), mediaFolderName);
        }
        catch
        {
            return "{\"error\":\"The media folder could not be read.\"}";
        }
        if (!apply)
        {
            return "{\"ok\":true,\"plan\":{\"actions\":" + MediaActionsJson(plan.Actions) + ",\"warnings\":" + MediaWarningsJson(plan.Warnings) + "},\"unusedFolders\":" + EmptyFoldersJson(mediaDir, archiveFolder) + ",\"gedcomText\":" + Js(gedcomText) + "}";
        }
        var moves = new StringBuilder("[");
        var renames = new StringBuilder("[");
        bool first = true;
        bool firstRename = true;
        foreach (MediaAction action in plan.Actions)
        {
            string toPath;
            try { toPath = PlaceMediaFile(mediaDir, action); }
            catch (Exception error)
            {
                if (!first) moves.Append(',');
                first = false;
                moves.Append("{\"kind\":").Append(Js(action.Kind)).Append(",\"fromPath\":").Append(Js(action.FromPath))
                  .Append(",\"toPath\":").Append(Js(action.ToPath)).Append(",\"ok\":false,\"error\":").Append(Js(error.Message)).Append('}');
                continue;
            }
            if (!first) moves.Append(',');
            first = false;
            moves.Append("{\"kind\":").Append(Js(action.Kind)).Append(",\"fromPath\":").Append(Js(action.FromPath))
              .Append(",\"toPath\":").Append(Js(toPath)).Append(",\"ok\":true}");
            if (action.Kind == "copy") continue;
            string before = gedcomText;
            gedcomText = RewriteGedcomFile(gedcomText, action.FromPath, toPath, ambiguousNames);
            if (gedcomText != before)
            {
                if (!firstRename) renames.Append(',');
                firstRename = false;
                renames.Append("{\"from\":").Append(Js(action.FromPath)).Append(",\"to\":").Append(Js(toPath)).Append('}');
            }
        }
        moves.Append(']');
        renames.Append(']');
        // Every FILE line naming a media file of this folder ends up pointing at
        // its place here, however it spelled the path before.
        try { gedcomText = RepointGedcomFiles(gedcomText, ListMediaEntries(mediaDir), mediaFolderName, archiveFolder); } catch { }
        try { WritePrimaryData(appDir); } catch { }
        int failed = 0;
        foreach (MediaAction action in plan.Actions) if (moves.ToString().Contains("\"fromPath\":" + Js(action.FromPath) + ",\"toPath\":" + Js(action.ToPath) + ",\"ok\":false")) failed++;
        return "{\"ok\":true,\"moves\":" + moves + ",\"renames\":" + renames +
            ",\"summary\":{\"moved\":" + plan.Actions.FindAll(a => a.Kind == "move").Count +
            ",\"copied\":" + plan.Actions.FindAll(a => a.Kind == "copy").Count +
            ",\"replaced\":" + plan.Actions.FindAll(a => a.Kind == "replace").Count +
            ",\"archived\":" + plan.Actions.FindAll(a => a.Kind == "archive").Count +
            ",\"failed\":" + failed + "},\"warnings\":" + MediaWarningsJson(plan.Warnings) +
            ",\"unsupported\":[] ,\"gedcomText\":" + Js(gedcomText) + "}";
    }

    // POST /api/media-organise: the request body is read here and handed to
    // MediaOrganiseReply, whose JSON reply is sent back.
    static void HandleMediaOrganise(HttpListenerContext ctx, string appDir, string mediaDir)
    {
        if (ctx.Request.ContentLength64 > 200L * 1024 * 1024) { SendJson(ctx, 413, "{\"error\":\"Request is too large.\"}"); return; }
        string json;
        try
        {
            using (var reader = new StreamReader(ctx.Request.InputStream, Encoding.UTF8))
            {
                var buffer = new char[1024 * 1024];
                var text = new StringBuilder();
                int read;
                while ((read = reader.ReadBlock(buffer, 0, buffer.Length)) > 0) text.Append(buffer, 0, read);
                json = text.ToString();
            }
        }
        catch
        {
            SendJson(ctx, 400, "{\"error\":\"Invalid request.\"}");
            return;
        }
        string reply;
        try
        {
            // Deleting one empty subfolder the check listed needs no plan.
            string deleteFolder = JsonString(json, "deleteFolder");
            if (deleteFolder != null && deleteFolder.Length > 0)
            {
                SendJson(ctx, 200, DeleteEmptyFolder(mediaDir, deleteFolder));
                return;
            }
            // The primary GEDCOM is already loaded, so its records need not be sent.
            List<GedcomRecord> records = null;
            string peopleJson = JsonString(json, "people") ?? "";
            string gedcomPath = PrimaryGedcomPath(appDir);
            if (gedcomPath != null)
            {
                string primary = File.ReadAllText(gedcomPath);
                records = SplitGedcomRecords(primary);
                // The people the page knows (names, years) travel in the request;
                // without them, read them from the primary GEDCOM.
                if (peopleJson.Length == 0) peopleJson = "{\"people\":" + MediaPeopleJson(records) + "}";
            }
            reply = MediaOrganiseReply(appDir, mediaDir, json, records, peopleJson);
        }
        catch { reply = "{\"error\":\"The media folder could not be organised. Some files may already have moved.\"}"; }
        Send(ctx, reply.Contains("\"error\"") ? 500 : 200, Encoding.UTF8.GetBytes(reply), "application/json");
    }

    // POST /api/duplicates: lists the exact duplicate images and PDFs (apply
    // false), or removes the copies the page picked (apply true). The GEDCOM's
    // records come from the primary tree, so the body stays small.
    static void HandleDuplicates(HttpListenerContext ctx, string appDir, string mediaDir)
    {
        if (ctx.Request.ContentLength64 > 50L * 1024 * 1024) { SendJson(ctx, 413, "{\"error\":\"Request is too large.\"}"); return; }
        string json;
        try
        {
            using (var reader = new StreamReader(ctx.Request.InputStream, Encoding.UTF8))
            {
                var buffer = new char[1024 * 1024];
                var text = new StringBuilder();
                int read;
                while ((read = reader.ReadBlock(buffer, 0, buffer.Length)) > 0) text.Append(buffer, 0, read);
                json = text.ToString();
            }
        }
        catch { SendJson(ctx, 400, "{\"error\":\"Invalid request.\"}"); return; }
        string gedcomPath = PrimaryGedcomPath(appDir);
        if (gedcomPath == null) { SendJson(ctx, 400, "{\"error\":\"Open a GEDCOM first.\"}"); return; }
        string gedcomText;
        try { gedcomText = File.ReadAllText(gedcomPath); } catch { SendJson(ctx, 500, "{\"error\":\"The GEDCOM file could not be read.\"}"); return; }
        bool apply = System.Text.RegularExpressions.Regex.IsMatch(json, "\"apply\"\\s*:\\s*true");
        try
        {
            if (apply)
            {
                string reply = DuplicatesApplyReply(mediaDir, gedcomText, json);
                SendJson(ctx, reply.Contains("\"error\"") ? 500 : 200, reply);
            }
            else
            {
                SendJson(ctx, 200, DuplicatesListReply(mediaDir, gedcomText, json));
            }
        }
        catch { SendJson(ctx, 500, "{\"error\":\"The duplicate files could not be handled.\"}"); }
    }

    // The groups of identical files the dialog lists. Nothing is changed.
    static string DuplicatesListReply(string mediaDir, string gedcomText, string json)
    {
        List<GedcomRecord> records = SplitGedcomRecords(gedcomText);
        string peopleJson = JsonString(json, "people") ?? "";
        if (peopleJson.Length == 0) peopleJson = "{\"people\":" + MediaPeopleJson(records) + "}";
        MediaOrganiseResult state = ComputeMediaOrganise(records, ReadMediaPeople(peopleJson), ListMediaEntries(mediaDir), "Archive", ReadHeroPicks(json), Path.GetFileName(mediaDir));
        HashSet<string> hero = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (string key in state.Chosen.Keys) hero.Add(key);
        HashSet<string> events = EventMediaKeys(records);
        List<KeyValuePair<string, List<MediaEntry>>> groups = DuplicateGroups(ListMediaEntries(mediaDir), hero, events);
        var sb = new StringBuilder("{\"ok\":true,\"groups\":[");
        bool firstGroup = true;
        foreach (KeyValuePair<string, List<MediaEntry>> group in groups)
        {
            List<MediaEntry> files = group.Value;
            bool protectedGroup = false;
            foreach (MediaEntry file in files) if (hero.Contains(file.Key) || events.Contains(file.Key)) protectedGroup = true;
            MediaEntry keeper = files[0];
            foreach (MediaEntry file in files) if (protectedGroup && (hero.Contains(file.Key) || events.Contains(file.Key))) { keeper = file; break; }
            if (!firstGroup) sb.Append(',');
            firstGroup = false;
            sb.Append("{\"hash\":").Append(Js(group.Key)).Append(",\"bytes\":").Append(keeper.Size)
              .Append(",\"protected\":").Append(JsonBool(protectedGroup)).Append(",\"files\":[");
            bool firstFile = true;
            foreach (MediaEntry file in files)
            {
                if (!firstFile) sb.Append(',');
                firstFile = false;
                sb.Append("{\"relativePath\":").Append(Js(file.Relative)).Append(",\"name\":").Append(Js(file.Name))
                  .Append(",\"folder\":").Append(Js(file.Folder))
                  .Append(",\"size\":").Append(file.Size).Append(",\"keeper\":").Append(JsonBool(file == keeper)).Append(",\"owners\":[]}");
            }
            sb.Append("]}");
        }
        return sb.Append("],\"examined\":").Append(ListMediaEntries(mediaDir).Count)
            .Append(",\"mediaPath\":").Append(Js(Path.GetFullPath(mediaDir)))
            .Append(",\"mediaFolder\":").Append(Js(Path.GetFileName(mediaDir))).Append('}').ToString();
    }

    // Deletes or archives the copies the page picked. Each must be an exact copy
    // of the kept file (same SHA-256); its GEDCOM references are then removed.
    static string DuplicatesApplyReply(string mediaDir, string gedcomText, string json)
    {
        string mode = JsonString(json, "mode") ?? "delete";
        string keepRelative = JsonString(json, "keep") ?? "";
        if (keepRelative.Length == 0) return "{\"error\":\"No file was chosen to keep.\"}";
        string root = Path.GetFullPath(mediaDir).TrimEnd('\\') + "\\";
        string keepPath = Path.GetFullPath(Path.Combine(root, keepRelative.Replace('/', '\\')));
        if (!keepPath.StartsWith(root, StringComparison.OrdinalIgnoreCase) || !File.Exists(keepPath)) return "{\"error\":\"The file to keep is no longer in the media folder.\"}";
        string keepHash = Sha256Hex(File.ReadAllBytes(keepPath));
        string archiveFolder = (JsonString(json, "archiveFolder") ?? "Archive").Trim();
        if (archiveFolder.Length == 0) archiveFolder = "Archive";
        var removed = new StringBuilder("[");
        var failed = new StringBuilder("[");
        bool firstRemoved = true;
        bool firstFailed = true;
        foreach (System.Text.RegularExpressions.Match match in System.Text.RegularExpressions.Regex.Matches(json, "\"files\"\\s*:\\s*\\[(.*?)\\]"))
        {
            foreach (System.Text.RegularExpressions.Match item in System.Text.RegularExpressions.Regex.Matches(match.Groups[1].Value, "\"((?:[^\"\\\\]|\\\\.)*)\""))
            {
                string relative = System.Text.RegularExpressions.Regex.Unescape(item.Groups[1].Value).Replace('\\', '/');
                string full = Path.GetFullPath(Path.Combine(root, relative));
                string error = null;
                try
                {
                    if (!full.StartsWith(root, StringComparison.OrdinalIgnoreCase) || !File.Exists(full)) error = "The file is no longer in the media folder.";
                    else if (Sha256Hex(File.ReadAllBytes(full)) != keepHash) error = "The file is not an exact copy of the one kept, so it was left alone.";
                    else
                    {
                        if (mode == "archive")
                        {
                            string archiveDir = Path.Combine(root, archiveFolder, DateTime.Now.ToString("yyyy-MM-dd"));
                            Directory.CreateDirectory(archiveDir);
                            string target = Path.Combine(archiveDir, Path.GetFileName(full));
                            for (int suffix = 2; File.Exists(target); suffix++) target = Path.Combine(archiveDir, Path.GetFileNameWithoutExtension(full) + " (" + suffix + ")" + Path.GetExtension(full));
                            File.Copy(full, target);
                        }
                        File.Delete(full);
                        gedcomText = RemoveGedcomFileReferences(gedcomText, relative);
                    }
                }
                catch (Exception ex) { error = ex.Message; }
                if (error == null)
                {
                    if (!firstRemoved) removed.Append(',');
                    firstRemoved = false;
                    removed.Append("{\"file\":").Append(Js(relative)).Append(",\"action\":").Append(Js(mode)).Append('}');
                }
                else
                {
                    if (!firstFailed) failed.Append(',');
                    firstFailed = false;
                    failed.Append("{\"file\":").Append(Js(relative)).Append(",\"error\":").Append(Js(error)).Append('}');
                }
            }
        }
        removed.Append(']');
        failed.Append(']');
        try { WritePrimaryData(Path.GetDirectoryName(Path.GetDirectoryName(mediaDir.TrimEnd('\\')))); } catch { }
        return "{\"ok\":true,\"removed\":" + removed + ",\"failed\":" + failed + ",\"gedcomText\":" + Js(gedcomText) + "}";
    }

    // Groups of identical files that sit in the same folder. A duplicate is more
    // than one copy of one file within a single folder: the media folder root,
    // one person's own subfolder, or the archive folder. Copies in different
    // people's folders are never duplicates, because one photo can legitimately
    // be attached to several people. A group whose files are a card image or a
    // life event photo is marked protected and never offered.
    static List<KeyValuePair<string, List<MediaEntry>>> DuplicateGroups(List<MediaEntry> files, HashSet<string> hero, HashSet<string> events)
    {
        var byHash = new Dictionary<string, List<MediaEntry>>(StringComparer.OrdinalIgnoreCase);
        var bySize = new Dictionary<long, List<MediaEntry>>();
        foreach (MediaEntry file in files)
        {
            if (!IsMediaExtension(file.Name)) continue;
            if (!bySize.ContainsKey(file.Size)) bySize[file.Size] = new List<MediaEntry>();
            bySize[file.Size].Add(file);
        }
        foreach (KeyValuePair<long, List<MediaEntry>> size in bySize)
        {
            if (size.Value.Count < 2) continue;
            foreach (MediaEntry file in size.Value)
            {
                string hash;
                try { hash = Sha256Hex(File.ReadAllBytes(file.Full)); } catch { continue; }
                // The folder is part of the key, so identical bytes in two
                // different folders form two groups of one file each.
                string groupKey = hash + "\u0000" + MediaNormalize(MediaFolderOf(file.Relative));
                if (!byHash.ContainsKey(groupKey)) byHash[groupKey] = new List<MediaEntry>();
                byHash[groupKey].Add(file);
            }
        }
        var groups = new List<KeyValuePair<string, List<MediaEntry>>>();
        foreach (KeyValuePair<string, List<MediaEntry>> group in byHash)
        {
            if (group.Value.Count < 2) continue;
            group.Value.Sort((left, right) => string.Compare(left.Relative, right.Relative, StringComparison.OrdinalIgnoreCase));
            // The hash alone is what the dialog shows.
            string hash = group.Key;
            int split = hash.IndexOf('\u0000');
            if (split >= 0) hash = hash.Substring(0, split);
            groups.Add(new KeyValuePair<string, List<MediaEntry>>(hash, group.Value));
        }
        groups.Sort((left, right) => string.Compare(left.Value[0].Relative, right.Value[0].Relative, StringComparison.OrdinalIgnoreCase));
        return groups;
    }

    // The media paths attached to a life event: a FILE line inside a BIRT, DEAT,
    // CENS, MARR, DIV or other event block.
    static HashSet<string> EventMediaKeys(List<GedcomRecord> records)
    {
        var keys = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        string[] eventTags = { "BIRT", "BAPM", "CHR", "DEAT", "BURI", "CREM", "ADOP", "BARM", "BASM", "BLES", "CHRA", "CONF", "FCOM",
            "RESI", "IMMI", "EMIG", "NATU", "CENS", "EDUC", "GRAD", "OCCU", "RETI", "MARR", "DIV", "MILT", "RELI", "ORDN", "PROB", "WILL", "SSN", "EVEN" };
        foreach (GedcomRecord record in records)
        {
            if (record.Tag != "INDI" && record.Tag != "FAM") continue;
            bool inEvent = false;
            foreach (string line in record.Lines)
            {
                var field = System.Text.RegularExpressions.Regex.Match(line, "^(\\d+)\\s+(\\S+)\\s*(.*)$");
                if (!field.Success) continue;
                int level = int.Parse(field.Groups[1].Value);
                string tag = field.Groups[2].Value;
                if (level == 1) inEvent = Array.IndexOf(eventTags, tag) >= 0;
                if (inEvent && tag == "FILE" && level >= 2)
                {
                    string path = field.Groups[3].Value.Trim();
                    if (path.Length > 0) keys.Add(MediaNormalize(path));
                }
            }
        }
        return keys;
    }

    // ---------------------------------------------------------------------------
    // Search Public Records — server-side provider relay. Browser calls
    // /api/public-records/{provider}?q=…, this fetches the provider API where
    // the API keys stay out of the page source, and returns the provider JSON
    // verbatim (the browser normalises it). Only localhost clients may use it.
    // ---------------------------------------------------------------------------
    // All provider APIs require TLS 1.2+, which .NET 4.0 does not enable by default.
    static KinshipAtlasLauncher()
    {
        try { ServicePointManager.SecurityProtocol = (SecurityProtocolType)3072 | (SecurityProtocolType)768; } catch { }
        try { ServicePointManager.ServerCertificateValidationCallback = delegate { return true; }; } catch { }
    }

    const string EuropeanaKey = "lithinerna";
    const string DplaKey = "f47761a68e234a3d3dd0c3e0cf4fe226";

    static void HandlePublicRecords(HttpListenerContext ctx, string provider)
    {
        string query = (ctx.Request.QueryString["q"] ?? "").Trim();
        string birthYear = (ctx.Request.QueryString["birthYear"] ?? "").Trim();
        if (query.Length == 0 || query.Length > 200) { SendJson(ctx, 400, "{\"error\":\"Missing query.\"}"); return; }
        string url;
        switch (provider)
        {
            case "dpla":
                url = "https://api.dp.la/v2/items?q=" + Uri.EscapeDataString(query) + "&api_key=" + DplaKey + "&page_size=20";
                break;
            case "europeana":
                url = "https://api.europeana.eu/record/v2/search.json?wskey=" + EuropeanaKey + "&query=" + Uri.EscapeDataString(query) + "&rows=20";
                break;
            case "wikitree":
                url = "https://api.wikitree.com/api.php?action=searchPerson&appId=KinshipAtlas" +
                      "&FirstName=" + Uri.EscapeDataString(query) +
                      (birthYear.Length > 0 ? "&BirthDate=" + Uri.EscapeDataString(birthYear) : "");
                break;
            case "open-archives":
                url = "https://api.openarchieven.nl/1.0/records/match.json?name=" + Uri.EscapeDataString(query) +
                      (birthYear.Length > 0 ? "&birthyear=" + Uri.EscapeDataString(birthYear) : "") + "&lang=en";
                break;
            case "internet-archive":
                url = "https://archive.org/advancedsearch.php?q=" + Uri.EscapeDataString(query) +
                      "&fl%5B%5D=identifier&fl%5B%5D=title&fl%5B%5D=year&rows=20&output=json";
                break;
            case "findagrave":
                url = "https://www.findagrave.com/memorial/search?" + query; // pre-built query string
                break;
            default:
                SendJson(ctx, 404, "{\"error\":\"Unknown provider.\"}"); return;
        }
        try
        {
            var request = (HttpWebRequest)WebRequest.Create(url);
            request.UserAgent = "KinshipAtlas/1.0";
            request.Timeout = 20000;
            request.ReadWriteTimeout = 20000;
            using (var response = (HttpWebResponse)request.GetResponse())
            using (var reader = new StreamReader(response.GetResponseStream(), Encoding.UTF8))
            {
                string body = reader.ReadToEnd();
                ctx.Response.ContentType = "application/json";
                ctx.Response.Headers["Access-Control-Allow-Origin"] = "http://" + ctx.Request.Url.Authority;
                byte[] bytes = Encoding.UTF8.GetBytes(body);
                ctx.Response.ContentLength64 = bytes.Length;
                ctx.Response.OutputStream.Write(bytes, 0, bytes.Length);
            }
        }
        catch (WebException ex)
        {
            SendJson(ctx, 502, "{\"error\":\"Provider unreachable.\",\"status\":" + (int)(ex.Response as HttpWebResponse != null ? (ex.Response as HttpWebResponse).StatusCode : HttpStatusCode.BadGateway) + "}");
        }
        catch { SendJson(ctx, 502, "{\"error\":\"Provider unreachable.\"}"); }
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

    // Serves the app and the default media folder over localhost so media can be added.
    // The browser ends the helper explicitly through /api/exit; inactivity is not a safe
    // close signal because browsers throttle network timers in idle or background tabs.
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
