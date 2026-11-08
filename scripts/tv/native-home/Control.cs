// Reads, sets and restores which app the TV opens as its Home screen.
// Runs on the TV as the SDK user, started by run.py. See README.md.
//
//   query TARGET             print the current values
//   apply SNAPSHOT TARGET    make TARGET the Home app (SNAPSHOT = original values)
//   restore SNAPSHOT TARGET  put the original values back
//
// TARGET is the launcher's app id, for example ZenoTV0000.ZenoTV.

using System;
using System.Collections.Generic;
using System.IO;
using System.Runtime.InteropServices;
using System.Text.Json;

class Control
{
    const string MainOperation = "http://tizen.org/appcontrol/operation/main";
    const string AutostartKey = "db/menu/smart_hub/ontvsetting/auto_start";

    static readonly string[] HomeKeys =
    {
        "db/appfw/home_appid",
        "db/appfw/startup_appid",
        "db/appfw/booting_appid_backup",
        "db/first_screen/type",
    };

    [DllImport("libbundle.so.0")] static extern IntPtr bundle_create();
    [DllImport("libbundle.so.0")] static extern void bundle_free(IntPtr bundle);
    [DllImport("libaul.so.0")] static extern int aul_svc_set_operation(IntPtr bundle, string operation);
    [DllImport("libaul.so.0")] static extern int aul_get_default_app(IntPtr bundle, out IntPtr app);
    [DllImport("libapp-context-manager-common.so")]
    static extern byte util_is_appbooting_supported_webapp_byappid(string app);
    [DllImport("libcapi-appfw-app-operation-tv.so.0")]
    static extern int app_operation_set_current_app(string operation, string app);
    [DllImport("libvconf.so.0")] static extern int vconf_set_str(string key, string value);
    [DllImport("libvconf.so.0")] static extern IntPtr vconf_get_str(string key);
    [DllImport("libvconf.so.0")] static extern int vconf_set_int(string key, int value);
    [DllImport("libvconf.so.0")] static extern int vconf_get_int(string key, out int value);
    [DllImport("libc")] static extern uint getuid();
    [DllImport("libc")] static extern void free(IntPtr pointer);

    public class Snapshot
    {
        public string Home { get; set; }
        public Dictionary<string, string> Strings { get; set; }
        public int Autostart { get; set; }
        public uint Uid { get; set; }
        public int BootSupported { get; set; }
    }

    static string ReadString(string key)
    {
        IntPtr value = vconf_get_str(key);
        if (value == IntPtr.Zero) throw new Exception("Cannot read " + key);
        try { return Marshal.PtrToStringAnsi(value); }
        finally { free(value); }
    }

    static string CurrentHome()
    {
        IntPtr bundle = bundle_create();
        if (bundle == IntPtr.Zero) throw new Exception("No bundle");
        try
        {
            if (aul_svc_set_operation(bundle, MainOperation) != 0)
                throw new Exception("Cannot set query operation");
            IntPtr app;
            if (aul_get_default_app(bundle, out app) != 0 || app == IntPtr.Zero)
                throw new Exception("Cannot read Home operation");
            try { return Marshal.PtrToStringAnsi(app); }
            finally { free(app); }
        }
        finally { bundle_free(bundle); }
    }

    static Snapshot Query(string target)
    {
        var snapshot = new Snapshot
        {
            Home = CurrentHome(),
            Strings = new Dictionary<string, string>(),
            Uid = getuid(),
            BootSupported = util_is_appbooting_supported_webapp_byappid(target),
        };
        foreach (var key in HomeKeys) snapshot.Strings[key] = ReadString(key);
        int autostart;
        if (vconf_get_int(AutostartKey, out autostart) != 0) throw new Exception("Cannot read autostart");
        snapshot.Autostart = autostart;
        return snapshot;
    }

    // Every write is read back; a value that does not stick is an error.
    static void SetString(string key, string value)
    {
        if (vconf_set_str(key, value) != 0 || ReadString(key) != value)
            throw new Exception("String write/readback failed: " + key);
    }

    static void SetAutostart(int value)
    {
        int stored;
        if (vconf_set_int(AutostartKey, value) != 0 || vconf_get_int(AutostartKey, out stored) != 0 || stored != value)
            throw new Exception("Autostart write/readback failed");
    }

    static void SetHome(string app)
    {
        if (app_operation_set_current_app(MainOperation, app) != 0 || CurrentHome() != app)
            throw new Exception("Home operation write/readback failed");
    }

    static void Restore(Snapshot original)
    {
        SetHome(original.Home);
        foreach (var key in HomeKeys) SetString(key, original.Strings[key]);
        SetAutostart(original.Autostart);
    }

    static void CheckSnapshot(Snapshot s)
    {
        if (s == null || string.IsNullOrWhiteSpace(s.Home) || s.Strings == null
            || s.Strings.Count != HomeKeys.Length || (s.Autostart != 0 && s.Autostart != 1))
            throw new Exception("Invalid original snapshot");
        foreach (var key in HomeKeys)
            if (!s.Strings.ContainsKey(key) || string.IsNullOrWhiteSpace(s.Strings[key]))
                throw new Exception("Missing original setting: " + key);
    }

    static void CheckTarget(string target)
    {
        var parts = target.Split('.');
        if (parts.Length != 2 || parts[0].Length != 10) throw new Exception("Invalid app id: " + target);
    }

    // The settings below are firmware specific: refuse anything but the firmware this was tested on.
    static void CheckDevice()
    {
        if (IntPtr.Size != 4 || getuid() != 901) throw new Exception("Expected 32-bit SDK user, no root");
        var info = File.ReadAllText("/etc/prd_info.ini");
        if (!info.Contains("Model=T-PTMDDEUC-0090;") || !info.Contains("Version=T-PTMDDEUC-0090-2130.0;"))
            throw new Exception("Unexpected firmware");
    }

    static int Main(string[] args)
    {
        try
        {
            CheckDevice();
            if (args.Length == 2 && args[0] == "query")
            {
                CheckTarget(args[1]);
                Console.WriteLine("ZENO_HOME_JSON=" + JsonSerializer.Serialize(Query(args[1])));
                return 0;
            }
            if (args.Length != 3 || (args[0] != "apply" && args[0] != "restore"))
                throw new Exception("Use query TARGET, apply SNAPSHOT TARGET or restore SNAPSHOT TARGET");

            string target = args[2];
            CheckTarget(target);
            var original = JsonSerializer.Deserialize<Snapshot>(File.ReadAllText(args[1]));
            CheckSnapshot(original);
            var before = Query(target);
            if (before.Home != original.Home && before.Home != target)
                throw new Exception("Home changed since snapshot; stop for review");

            if (args[0] == "restore")
            {
                Restore(original);
                Console.WriteLine("ZENO_HOME_RESTORED=" + JsonSerializer.Serialize(Query(target)));
                return 0;
            }

            if (before.Home != original.Home || before.Autostart != original.Autostart)
                throw new Exception("Configuration changed since snapshot");
            foreach (var key in HomeKeys)
                if (before.Strings[key] != original.Strings[key])
                    throw new Exception("Setting changed since snapshot: " + key);
            if (!Directory.Exists("/opt/usr/apps/" + target.Split('.')[0]) || before.BootSupported == 0)
                throw new Exception("Installed launcher is not eligible for boot");

            try
            {
                SetHome(target);
                SetString("db/appfw/home_appid", target);
                SetAutostart(1);
                Console.WriteLine("ZENO_HOME_APPLIED=" + JsonSerializer.Serialize(Query(target)));
            }
            catch
            {
                Restore(original);
                Console.Error.WriteLine("Original Home/startup values restored after a failed apply");
                throw;
            }
            return 0;
        }
        catch (Exception error)
        {
            Console.Error.WriteLine(error.ToString());
            return 1;
        }
    }
}
