/*
 * Iolite Installer
 * Copyright (c) 2026 Epiano7
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

using System.Diagnostics;
using System.IO.Compression;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Security.Cryptography;

namespace Iolite.Installer;

internal static class Program
{
    private const string ResourcePrefix = "Iolite.Installer.Resources.";
    private const string ReleaseUrl = "https://github.com/Epiano7/iolite-vencord/releases";
    private const uint MbIconInformation = 0x00000040;
    private const uint MbIconWarning = 0x00000030;
    private const uint MbOk = 0x00000000;
    private const uint MbRetryCancel = 0x00000005;
    private const uint MbYesNo = 0x00000004;
    private const int IdYes = 6;
    private const int IdRetry = 4;

    [DllImport("user32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern int MessageBoxW(nint owner, string text, string caption, uint type);

    [STAThread]
    private static int Main(string[] args)
    {
        try
        {
            string action = args.FirstOrDefault()?.ToLowerInvariant() ?? "--install";
            return action switch
            {
                "--install" or "--repair" => Install(action == "--repair"),
                "--uninstall" => Uninstall(),
                "--extract-only" => ExtractOnly(args),
                "--version" => ShowVersion(),
                _ => ShowUsage()
            };
        }
        catch (Exception exception)
        {
            Show($"Iolite could not complete the operation.\n\n{exception.Message}", MbOk | MbIconWarning);
            return 1;
        }
    }

    private static int Install(bool repair)
    {
        string version = ReadResourceText("version.txt").Trim();
        string mode = repair ? "repair" : "install";
        string message =
            $"Iolite {version} is ready to {mode}.\n\n" +
            "This installs a pinned custom Vencord build containing Iolite. Existing Vencord settings are backed up and normally remain intact.\n\n" +
            "Other source-only custom plugins are not included in this managed build. Client modifications are against Discord's Terms of Service.\n\n" +
            "Continue?";

        if (Show(message, MbYesNo | MbIconWarning) != IdYes) return 2;
        if (!WaitForDiscordToClose()) return 3;

        string localAppData = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
        string roamingAppData = Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData);
        string ioliteRoot = Path.Combine(localAppData, "Iolite");
        string managedRoot = Path.Combine(ioliteRoot, "Vencord");
        string previousRoot = Path.Combine(ioliteRoot, "PreviousVencord");
        string stagingRoot = Path.Combine(ioliteRoot, $"Staging-{Guid.NewGuid():N}");

        Directory.CreateDirectory(ioliteRoot);
        BackupSettings(Path.Combine(roamingAppData, "Vencord"), Path.Combine(ioliteRoot, "SettingsBackups"));

        bool previousMoved = false;
        try
        {
            ExtractVerifiedRuntime(stagingRoot);

            if (Directory.Exists(previousRoot)) Directory.Delete(previousRoot, true);
            if (Directory.Exists(managedRoot))
            {
                Directory.Move(managedRoot, previousRoot);
                previousMoved = true;
            }
            Directory.Move(stagingRoot, managedRoot);

            // A managed repair is a fresh extraction followed by the same local-build
            // injection used for installation. The upstream -repair mode targets its
            // own downloaded release instead of this pinned custom runtime.
            int exitCode = RunVencordInstaller(managedRoot, "-install");
            if (exitCode != 0) throw new InvalidOperationException($"The Vencord installer exited with code {exitCode}.");

            Show(
                $"Iolite {version} was installed successfully.\n\nOpen Discord, enable Iolite in Settings → Vencord → Plugins, and restart Discord if prompted.\n\nFuture updates will appear as new installers in the private GitHub Releases page:\n{ReleaseUrl}",
                MbOk | MbIconInformation
            );
            return 0;
        }
        catch
        {
            if (Directory.Exists(stagingRoot)) Directory.Delete(stagingRoot, true);
            if (Directory.Exists(managedRoot)) Directory.Delete(managedRoot, true);
            if (previousMoved && Directory.Exists(previousRoot)) Directory.Move(previousRoot, managedRoot);
            throw;
        }
    }

    private static int Uninstall()
    {
        if (Show(
            "This removes the managed Iolite/Vencord installation from Discord. Your Vencord settings and their backups will be kept.\n\nContinue?",
            MbYesNo | MbIconWarning
        ) != IdYes) return 2;

        if (!WaitForDiscordToClose()) return 3;

        string localAppData = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
        string managedRoot = Path.Combine(localAppData, "Iolite", "Vencord");
        int exitCode = RunVencordInstaller(managedRoot, "-uninstall");
        if (exitCode != 0) throw new InvalidOperationException($"The Vencord uninstaller exited with code {exitCode}.");

        if (Directory.Exists(managedRoot)) Directory.Delete(managedRoot, true);
        Show("Iolite and the managed Vencord runtime were removed. Your settings and backups were kept.", MbOk | MbIconInformation);
        return 0;
    }

    private static int ExtractOnly(string[] args)
    {
        if (args.Length != 2 || string.IsNullOrWhiteSpace(args[1])) return ShowUsage();
        string destination = Path.GetFullPath(args[1]);
        if (Directory.Exists(destination) && Directory.EnumerateFileSystemEntries(destination).Any())
            throw new InvalidOperationException("The extract-only destination must be empty.");

        ExtractVerifiedRuntime(destination);
        return File.Exists(Path.Combine(destination, "dist", "patcher.js")) ? 0 : 1;
    }

    private static int ShowVersion()
    {
        Show($"Iolite Installer {ReadResourceText("version.txt").Trim()}", MbOk | MbIconInformation);
        return 0;
    }

    private static int ShowUsage()
    {
        Show("Supported options:\n\n--install\n--repair\n--uninstall\n--version\n--extract-only <empty folder>", MbOk | MbIconInformation);
        return 64;
    }

    private static bool WaitForDiscordToClose()
    {
        string[] names = ["Discord", "DiscordPTB", "DiscordCanary", "Vesktop"];
        while (names.Any(name => Process.GetProcessesByName(name).Length > 0))
        {
            int result = Show(
                "Discord or Vesktop is currently running. Fully close it from the system tray, then select Retry.",
                MbRetryCancel | MbIconWarning
            );
            if (result != IdRetry) return false;
        }
        return true;
    }

    private static void BackupSettings(string settingsRoot, string backupsRoot)
    {
        if (!Directory.Exists(settingsRoot)) return;

        Directory.CreateDirectory(backupsRoot);
        string destination = Path.Combine(backupsRoot, DateTime.Now.ToString("yyyyMMdd-HHmmss"));
        CopyDirectory(settingsRoot, destination);

        foreach (DirectoryInfo oldBackup in new DirectoryInfo(backupsRoot)
                     .EnumerateDirectories()
                     .OrderByDescending(directory => directory.Name)
                     .Skip(3))
        {
            oldBackup.Delete(true);
        }
    }

    private static void CopyDirectory(string source, string destination)
    {
        Directory.CreateDirectory(destination);
        foreach (string file in Directory.EnumerateFiles(source))
            File.Copy(file, Path.Combine(destination, Path.GetFileName(file)), true);
        foreach (string directory in Directory.EnumerateDirectories(source))
            CopyDirectory(directory, Path.Combine(destination, Path.GetFileName(directory)));
    }

    private static void ExtractVerifiedRuntime(string destination)
    {
        byte[] archive = ReadResourceBytes("runtime.zip");
        string expectedHash = ReadResourceText("runtime.sha256").Trim();
        string actualHash = Convert.ToHexString(SHA256.HashData(archive)).ToLowerInvariant();
        if (!CryptographicOperations.FixedTimeEquals(
                System.Text.Encoding.ASCII.GetBytes(expectedHash.ToLowerInvariant()),
                System.Text.Encoding.ASCII.GetBytes(actualHash)))
            throw new InvalidDataException("The embedded runtime failed its integrity check.");

        if (Directory.Exists(destination)) Directory.Delete(destination, true);
        Directory.CreateDirectory(destination);
        using MemoryStream stream = new(archive, false);
        using ZipArchive zip = new(stream, ZipArchiveMode.Read);
        zip.ExtractToDirectory(destination, true);

        string patcher = Path.Combine(destination, "dist", "patcher.js");
        if (!File.Exists(patcher)) throw new InvalidDataException("The embedded runtime is incomplete.");
    }

    private static int RunVencordInstaller(string managedRoot, string action)
    {
        string temporaryRoot = Path.Combine(Path.GetTempPath(), $"IoliteInstaller-{Guid.NewGuid():N}");
        Directory.CreateDirectory(temporaryRoot);
        string installerPath = Path.Combine(temporaryRoot, "VencordInstallerCli.exe");
        File.WriteAllBytes(installerPath, ReadResourceBytes("VencordInstallerCli.exe"));

        try
        {
            ProcessStartInfo startInfo = new()
            {
                FileName = installerPath,
                UseShellExecute = false,
                CreateNoWindow = true
            };
            startInfo.ArgumentList.Add(action);
            startInfo.ArgumentList.Add("-branch");
            startInfo.ArgumentList.Add("auto");
            startInfo.Environment["VENCORD_USER_DATA_DIR"] = managedRoot;
            startInfo.Environment["VENCORD_DEV_INSTALL"] = "1";

            using Process process = Process.Start(startInfo)
                ?? throw new InvalidOperationException("The Vencord installer could not be started.");
            process.WaitForExit();
            return process.ExitCode;
        }
        finally
        {
            if (Directory.Exists(temporaryRoot)) Directory.Delete(temporaryRoot, true);
        }
    }

    private static byte[] ReadResourceBytes(string name)
    {
        using Stream stream = Assembly.GetExecutingAssembly().GetManifestResourceStream(ResourcePrefix + name)
            ?? throw new InvalidOperationException($"Installer resource '{name}' is missing.");
        using MemoryStream result = new();
        stream.CopyTo(result);
        return result.ToArray();
    }

    private static string ReadResourceText(string name) => System.Text.Encoding.UTF8.GetString(ReadResourceBytes(name));

    private static int Show(string text, uint type) => MessageBoxW(0, text, "Iolite Installer", type);
}
