/*
 * Iolite Installer
 * Copyright (c) 2026 Epiano7
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

using System.Diagnostics;
using System.IO.Compression;
using System.Reflection;
using System.Security.Cryptography;
using System.Text;

namespace Iolite.Installer;

internal enum InstallerAction
{
    Install,
    Repair,
    Uninstall,
    SmokeTest
}

internal sealed record OperationResult(string Heading, string Message);

internal static class Program
{
    [STAThread]
    private static int Main(string[] args)
    {
        string action = args.FirstOrDefault()?.ToLowerInvariant() ?? "--install";
        bool isHeadless = action is "--extract-only"
            or "--self-test-source-guard"
            or "--self-test-source-preservation"
            or "--self-test-source-rollback"
            or "--self-test-source-build"
            or "--self-test-pnpm"
            or "--self-test-vencord-cli";

        try
        {
            return action switch
            {
                "--install" => InstallerWindow.Run(InstallerAction.Install),
                "--repair" => InstallerWindow.Run(InstallerAction.Repair),
                "--uninstall" => InstallerWindow.Run(InstallerAction.Uninstall),
                "--extract-only" => InstallerEngine.ExtractOnly(args),
                "--self-test-source-guard" => SourceInstallDetector.SelfTest(args),
                "--self-test-source-preservation" => InstallerEngine.SourcePreservationSelfTest(args),
                "--self-test-source-rollback" => InstallerEngine.SourceRollbackSelfTest(args),
                "--self-test-source-build" => InstallerEngine.SourceBuildSelfTest(args),
                "--self-test-pnpm" => InstallerEngine.PnpmSelfTest(args),
                "--self-test-vencord-cli" => InstallerEngine.VencordCliSelfTest(),
                "--ui-smoke-test" => InstallerWindow.Run(InstallerAction.SmokeTest),
                "--version" => InstallerWindow.ShowInformation($"Iolite Installer {InstallerResources.ReadText("version.txt").Trim()}"),
                _ => InstallerWindow.ShowInformation(
                    "Supported options:\n\n--install\n--repair\n--uninstall\n--version\n--extract-only <empty folder>"
                )
            };
        }
        catch (Exception exception)
        {
            // Automated checks must fail with an exit code instead of opening a
            // dialog that would leave CI (or a scripted local test) waiting.
            if (!isHeadless)
                InstallerWindow.ShowError($"Iolite could not start.\n\n{exception.Message}");
            else
            {
                string logPath = Path.Combine(Path.GetTempPath(), "IoliteInstaller-self-test.log");
                File.WriteAllText(logPath, exception.ToString());
                Console.Error.WriteLine(exception);
            }
            return 1;
        }
    }
}

internal static class InstallerEngine
{
    internal const string ReleaseUrl = "https://github.com/Epiano7/iolite-vencord/releases";
    private static readonly string[] DiscordProcessNames = ["Discord", "DiscordPTB", "DiscordCanary", "Vesktop"];

    internal static OperationResult Run(InstallerAction action, Action<int, string, string> report)
    {
        if (action == InstallerAction.SmokeTest)
        {
            foreach ((int progress, string status) in new[]
                     {
                         (10, "Checking installation…"),
                         (35, "Backing up settings…"),
                         (65, "Building Vencord…"),
                         (90, "Patching Discord…"),
                         (100, "Test complete")
                     })
            {
                report(progress, status, "Installer progress-window smoke test. No files are being changed.");
                Thread.Sleep(60);
            }
            return new OperationResult("Test complete", "The installer progress and completion window passed its smoke test.");
        }
        return action == InstallerAction.Uninstall
            ? Uninstall(report)
            : Install(action == InstallerAction.Repair, report);
    }

    private static OperationResult Install(bool repair, Action<int, string, string> report)
    {
        string version = InstallerResources.ReadText("version.txt").Trim();
        string localAppData = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
        string roamingAppData = Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData);
        string ioliteRoot = Path.Combine(localAppData, "Iolite");
        string managedRoot = Path.Combine(ioliteRoot, "Vencord");
        string previousRoot = Path.Combine(ioliteRoot, "PreviousVencord");
        string stagingRoot = Path.Combine(ioliteRoot, $"Staging-{Guid.NewGuid():N}");

        report(5, "Checking the current Vencord installation…", "No files have been changed.");
        string? sourceRoot = SourceInstallDetector.FindActiveSourceRoot(managedRoot);
        if (sourceRoot is not null) return InstallIntoSource(sourceRoot, version, report);

        EnsureDiscordIsClosed();
        Directory.CreateDirectory(ioliteRoot);

        report(15, "Backing up Vencord settings…", "Settings are preserved separately from the managed runtime.");
        BackupSettings(Path.Combine(roamingAppData, "Vencord"), Path.Combine(ioliteRoot, "SettingsBackups"));

        bool previousMoved = false;
        try
        {
            report(30, "Verifying the embedded runtime…", "Checking the packaged runtime before extraction.");
            ExtractVerifiedRuntime(stagingRoot, ioliteRoot);

            report(55, "Installing the managed runtime…", $"Destination: {managedRoot}");
            SafeDeleteDirectory(ioliteRoot, previousRoot);
            if (Directory.Exists(managedRoot))
            {
                Directory.Move(managedRoot, previousRoot);
                previousMoved = true;
            }

            Directory.Move(stagingRoot, managedRoot);

            report(75, "Patching Discord…", "Discord remains closed while the tested Vencord runtime is connected.");
            int exitCode = RunVencordInstaller(managedRoot, "-install");
            if (exitCode != 0) throw new InvalidOperationException($"The Vencord installer exited with code {exitCode}.");

            report(100, "Installation complete", $"Iolite {version} is installed and ready.");
            return new OperationResult(
                repair ? "Repair complete" : "Installation complete",
                $"Iolite {version} was installed successfully.\n\n" +
                "Open Discord, then enable Iolite in Settings → Vencord → Plugins if needed.\n\n" +
                $"Updates: {ReleaseUrl}"
            );
        }
        catch
        {
            SafeDeleteDirectory(ioliteRoot, stagingRoot);
            SafeDeleteDirectory(ioliteRoot, managedRoot);
            if (previousMoved && Directory.Exists(previousRoot)) Directory.Move(previousRoot, managedRoot);
            throw;
        }
    }

    private static OperationResult InstallIntoSource(
        string sourceRoot,
        string version,
        Action<int, string, string> report,
        bool skipDiscordInjection = false)
    {
        string localAppData = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
        string ioliteRoot = Path.Combine(localAppData, "Iolite");
        string userPluginsRoot = Path.Combine(sourceRoot, "src", "userplugins");
        string targetRoot = Path.Combine(userPluginsRoot, "iolite");
        string markerPath = Path.Combine(targetRoot, ".iolite-installer-managed");
        string distRoot = Path.Combine(sourceRoot, "dist");
        string backupRoot = Path.Combine(ioliteRoot, "SourceBackups", BackupName());
        string backupPluginRoot = Path.Combine(backupRoot, "iolite");
        string backupDistRoot = Path.Combine(backupRoot, "dist");
        bool distExisted = Directory.Exists(distRoot);
        string? pnpm = FindPnpm();

        if (pnpm is null)
        {
            throw new InvalidOperationException(
                "A source-built Vencord installation was detected, but pnpm is not available. Nothing was changed.\n\n" +
                "Install Node.js 22 or newer and pnpm, then select Retry."
            );
        }

        if (!skipDiscordInjection) EnsureDiscordIsClosed();
        Directory.CreateDirectory(ioliteRoot);

        bool targetCreated = false;
        bool managedTarget = File.Exists(markerPath);
        bool pluginFilesChanged = false;
        string indexPath = Path.Combine(targetRoot, "index.tsx");
        string panelPath = Path.Combine(targetRoot, "QuickPanel.tsx");
        string menuEditorPath = Path.Combine(targetRoot, "MenuEditor.tsx");
        byte[] releaseIndex = InstallerResources.ReadBytes("source.index.tsx");
        byte[] releasePanel = InstallerResources.ReadBytes("source.QuickPanel.tsx");
        byte[] releaseMenuEditor = InstallerResources.ReadBytes("source.MenuEditor.tsx");

        if (Directory.Exists(targetRoot) && !managedTarget)
        {
            bool sameRelease = FilesEqual(indexPath, releaseIndex)
                && FilesEqual(panelPath, releasePanel)
                && FilesEqual(menuEditorPath, releaseMenuEditor);
            if (!sameRelease)
            {
                throw new InvalidOperationException(
                    "An independently managed Iolite source checkout already exists and was left untouched.\n\n" +
                    $"Path: {targetRoot}\n\n" +
                    "Update that checkout manually, then rebuild Vencord. The installer will not overwrite local or Git-managed source."
                );
            }
        }

        report(15, "Preparing the existing source build…", $"Using {sourceRoot} and preserving every existing user plugin.");
        Directory.CreateDirectory(backupRoot);
        if (distExisted) CopyDirectory(distRoot, backupDistRoot);
        if (managedTarget)
        {
            Directory.CreateDirectory(backupPluginRoot);
            BackupFile(indexPath, Path.Combine(backupPluginRoot, "index.tsx"));
            BackupFile(panelPath, Path.Combine(backupPluginRoot, "QuickPanel.tsx"));
            BackupFile(menuEditorPath, Path.Combine(backupPluginRoot, "MenuEditor.tsx"));
            BackupFile(markerPath, Path.Combine(backupPluginRoot, ".iolite-installer-managed"));
        }
        else
        {
            if (!Directory.Exists(targetRoot))
            {
                Directory.CreateDirectory(targetRoot);
                targetCreated = true;
            }
        }

        try
        {
            report(28, "Adding Iolite beside existing user plugins…", $"Only {targetRoot} is being added or updated.");
            if (targetCreated || managedTarget)
            {
                WriteManagedSource(targetRoot, version);
                pluginFilesChanged = true;
            }

            report(38, "Checking Vencord dependencies…", "Existing user plugin folders remain in place.");
            RunPnpm(pnpm, sourceRoot, "install", "--frozen-lockfile");

            report(52, "Validating all user plugins…", "Linting and type-checking the combined Vencord source tree.");
            RunPnpm(pnpm, sourceRoot, "exec", "eslint", "src/userplugins/iolite/index.tsx", "src/userplugins/iolite/QuickPanel.tsx", "src/userplugins/iolite/MenuEditor.tsx");
            RunPnpm(pnpm, sourceRoot, "testTsc");

            report(68, "Building Vencord with every user plugin…", "Iolite and the existing custom plugins are compiled into one runtime.");
            RunPnpm(
                pnpm,
                sourceRoot,
                "exec",
                "node",
                "--require=./scripts/suppressExperimentalWarnings.js",
                "scripts/build/build.mjs",
                "--disable-updater"
            );

            if (!skipDiscordInjection)
            {
                report(86, "Connecting the combined build to Discord…", "The existing source checkout remains the active Vencord runtime.");
                int exitCode = RunVencordInstaller(sourceRoot, "-install");
                if (exitCode != 0) throw new InvalidOperationException($"The Vencord installer exited with code {exitCode}.");
            }

            if (!skipDiscordInjection && pluginFilesChanged)
                File.WriteAllText(Path.Combine(ioliteRoot, "SourceInstall.txt"), sourceRoot);
            TrimSourceBackups(Path.Combine(ioliteRoot, "SourceBackups"));
            report(100, "Parallel installation complete", "Iolite and the existing user plugins were built together successfully.");
            return new OperationResult(
                "Parallel installation complete",
                $"Iolite {version} was added to the existing Vencord source build successfully.\n\n" +
                "Other user plugin folders were preserved and compiled into the same runtime. Open Discord and enable Iolite if needed.\n\n" +
                $"Rollback backup: {backupRoot}"
            );
        }
        catch
        {
            RestoreSourceInstall(
                sourceRoot,
                targetRoot,
                targetCreated,
                pluginFilesChanged,
                distExisted,
                backupPluginRoot,
                backupDistRoot
            );
            throw;
        }
    }

    private static OperationResult Uninstall(Action<int, string, string> report)
    {
        string localAppData = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
        string ioliteRoot = Path.Combine(localAppData, "Iolite");
        string managedRoot = Path.Combine(ioliteRoot, "Vencord");

        report(10, "Checking the current installation…", "Vencord settings and backups will be kept.");
        string? activeSourceRoot = SourceInstallDetector.FindActiveSourceRoot(managedRoot);
        if (activeSourceRoot is not null
            && File.Exists(Path.Combine(activeSourceRoot, "src", "userplugins", "iolite", ".iolite-installer-managed")))
        {
            return UninstallFromSource(activeSourceRoot, ioliteRoot, report);
        }

        EnsureDiscordIsClosed();
        if (!Directory.Exists(managedRoot)) throw new InvalidOperationException("No managed Iolite installation was found.");

        report(55, "Removing the Discord patch…", "Restoring Discord's original application archive.");
        int exitCode = RunVencordInstaller(managedRoot, "-uninstall");
        if (exitCode != 0) throw new InvalidOperationException($"The Vencord uninstaller exited with code {exitCode}.");

        report(85, "Removing the managed runtime…", "Settings and timestamped backups are not removed.");
        SafeDeleteDirectory(ioliteRoot, managedRoot);
        report(100, "Removal complete", "The managed runtime was removed; settings and backups were kept.");
        return new OperationResult(
            "Uninstall complete",
            "Iolite and its managed Vencord runtime were removed successfully.\n\nVencord settings and Iolite's backups were kept."
        );
    }

    private static OperationResult UninstallFromSource(
        string sourceRoot,
        string ioliteRoot,
        Action<int, string, string> report)
    {
        string? pnpm = FindPnpm();
        if (pnpm is null)
            throw new InvalidOperationException("pnpm is required to rebuild the existing source installation. Nothing was changed.");

        EnsureDiscordIsClosed();
        string targetRoot = Path.Combine(sourceRoot, "src", "userplugins", "iolite");
        string distRoot = Path.Combine(sourceRoot, "dist");
        string backupRoot = Path.Combine(ioliteRoot, "SourceBackups", BackupName());
        string removedSource = Path.Combine(backupRoot, "removed-iolite-source");
        string backupDist = Path.Combine(backupRoot, "dist");

        report(25, "Backing up the source installation…", "Iolite is moved into a rollback backup; sibling user plugins remain untouched.");
        Directory.CreateDirectory(backupRoot);
        if (Directory.Exists(distRoot)) CopyDirectory(distRoot, backupDist);
        CopyDirectory(targetRoot, removedSource);
        SafeDeleteDirectory(Path.Combine(sourceRoot, "src", "userplugins"), targetRoot);

        try
        {
            report(48, "Validating the remaining user plugins…", "Rebuilding the same Vencord checkout without Iolite.");
            RunPnpm(pnpm, sourceRoot, "install", "--frozen-lockfile");
            RunPnpm(pnpm, sourceRoot, "testTsc");

            report(68, "Rebuilding Vencord…", "Every other user plugin remains compiled into the active runtime.");
            RunPnpm(
                pnpm,
                sourceRoot,
                "exec",
                "node",
                "--require=./scripts/suppressExperimentalWarnings.js",
                "scripts/build/build.mjs",
                "--disable-updater"
            );

            report(88, "Refreshing the Discord patch…", "Keeping the existing source checkout active.");
            int exitCode = RunVencordInstaller(sourceRoot, "-install");
            if (exitCode != 0) throw new InvalidOperationException($"The Vencord installer exited with code {exitCode}.");

            string sourceRecord = Path.Combine(ioliteRoot, "SourceInstall.txt");
            if (File.Exists(sourceRecord)) File.Delete(sourceRecord);
            TrimSourceBackups(Path.Combine(ioliteRoot, "SourceBackups"));
            report(100, "Removal complete", "Iolite was removed; every other source user plugin remains active.");
            return new OperationResult(
                "Uninstall complete",
                $"Iolite was removed from the source-built Vencord installation.\n\n" +
                $"Other user plugins were preserved and rebuilt. Rollback backup: {backupRoot}"
            );
        }
        catch
        {
            if (!Directory.Exists(targetRoot) && Directory.Exists(removedSource)) CopyDirectory(removedSource, targetRoot);
            if (Directory.Exists(backupDist))
            {
                SafeDeleteDirectory(sourceRoot, distRoot);
                CopyDirectory(backupDist, distRoot);
            }
            throw;
        }
    }

    internal static int ExtractOnly(string[] args)
    {
        if (args.Length != 2 || string.IsNullOrWhiteSpace(args[1])) return 64;
        string destination = Path.GetFullPath(args[1]);
        if (Directory.Exists(destination) && Directory.EnumerateFileSystemEntries(destination).Any()) return 65;

        string allowedRoot = Directory.GetParent(destination)?.FullName
            ?? throw new InvalidOperationException("The extract-only destination has no parent directory.");
        ExtractVerifiedRuntime(destination, allowedRoot);
        return File.Exists(Path.Combine(destination, "dist", "patcher.js")) ? 0 : 1;
    }

    internal static int SourcePreservationSelfTest(string[] args)
    {
        if (args.Length != 2) return 64;
        string sourceRoot = Path.GetFullPath(args[1]);
        string userPluginsRoot = Path.Combine(sourceRoot, "src", "userplugins");
        if (!Directory.Exists(userPluginsRoot)) return 65;

        Dictionary<string, string> siblingsBefore = Directory.EnumerateFiles(userPluginsRoot, "*", SearchOption.AllDirectories)
            .Where(path => !IsWithinDirectory(path, Path.Combine(userPluginsRoot, "iolite")))
            .ToDictionary(path => path, FileHash, StringComparer.OrdinalIgnoreCase);

        WriteManagedSource(Path.Combine(userPluginsRoot, "iolite"), "self-test");

        bool siblingsUnchanged = siblingsBefore.All(entry => File.Exists(entry.Key) && FileHash(entry.Key) == entry.Value);
        bool sourcePresent = File.Exists(Path.Combine(userPluginsRoot, "iolite", "index.tsx"))
            && File.Exists(Path.Combine(userPluginsRoot, "iolite", "QuickPanel.tsx"))
            && File.Exists(Path.Combine(userPluginsRoot, "iolite", "MenuEditor.tsx"));
        return siblingsUnchanged && sourcePresent ? 0 : 1;
    }

    internal static int PnpmSelfTest(string[] args)
    {
        if (args.Length != 2 || !Directory.Exists(args[1])) return 64;
        string? pnpm = FindPnpm();
        if (pnpm is null) return 65;
        RunPnpm(pnpm, Path.GetFullPath(args[1]), "--version");
        return 0;
    }

    internal static int VencordCliSelfTest() => RunVencordInstaller(Path.GetTempPath(), "--version");

    internal static int SourceRollbackSelfTest(string[] args)
    {
        if (args.Length != 2) return 64;
        string sourceRoot = Path.GetFullPath(args[1]);
        string userPluginsRoot = Path.Combine(sourceRoot, "src", "userplugins");
        string targetRoot = Path.Combine(userPluginsRoot, "iolite");
        string distRoot = Path.Combine(sourceRoot, "dist");
        if (!Directory.Exists(userPluginsRoot) || !Directory.Exists(distRoot) || Directory.Exists(targetRoot)) return 65;

        Dictionary<string, string> siblingsBefore = Directory.EnumerateFiles(userPluginsRoot, "*", SearchOption.AllDirectories)
            .ToDictionary(path => path, FileHash, StringComparer.OrdinalIgnoreCase);
        Dictionary<string, string> distBefore = Directory.EnumerateFiles(distRoot, "*", SearchOption.AllDirectories)
            .ToDictionary(path => Path.GetRelativePath(distRoot, path), FileHash, StringComparer.OrdinalIgnoreCase);
        string backupRoot = Path.Combine(sourceRoot, "rollback-self-test");
        string backupPluginRoot = Path.Combine(backupRoot, "iolite");
        string backupDistRoot = Path.Combine(backupRoot, "dist");
        CopyDirectory(distRoot, backupDistRoot);
        WriteManagedSource(targetRoot, "self-test");
        SafeDeleteDirectory(sourceRoot, distRoot);
        Directory.CreateDirectory(distRoot);
        File.WriteAllText(Path.Combine(distRoot, "partial-build.txt"), "simulated failure");

        RestoreSourceInstall(sourceRoot, targetRoot, true, true, true, backupPluginRoot, backupDistRoot);

        bool siblingsUnchanged = siblingsBefore.All(entry => File.Exists(entry.Key) && FileHash(entry.Key) == entry.Value);
        bool distRestored = distBefore.All(entry =>
        {
            string restored = Path.Combine(distRoot, entry.Key);
            return File.Exists(restored) && FileHash(restored) == entry.Value;
        });
        return siblingsUnchanged && distRestored && !Directory.Exists(targetRoot) ? 0 : 1;
    }

    internal static int SourceBuildSelfTest(string[] args)
    {
        if (args.Length != 2 || !Directory.Exists(args[1])) return 64;
        string version = InstallerResources.ReadText("version.txt").Trim();
        InstallIntoSource(Path.GetFullPath(args[1]), version, (_, _, _) => { }, true);
        return 0;
    }

    private static void WriteManagedSource(string targetRoot, string version)
    {
        Directory.CreateDirectory(targetRoot);
        File.WriteAllBytes(Path.Combine(targetRoot, "index.tsx"), InstallerResources.ReadBytes("source.index.tsx"));
        File.WriteAllBytes(Path.Combine(targetRoot, "QuickPanel.tsx"), InstallerResources.ReadBytes("source.QuickPanel.tsx"));
        File.WriteAllBytes(Path.Combine(targetRoot, "MenuEditor.tsx"), InstallerResources.ReadBytes("source.MenuEditor.tsx"));
        File.WriteAllText(
            Path.Combine(targetRoot, ".iolite-installer-managed"),
            $"Managed by Iolite Installer {version}{Environment.NewLine}"
        );
    }

    private static bool IsWithinDirectory(string candidate, string directory)
    {
        string root = Path.GetFullPath(directory).TrimEnd(Path.DirectorySeparatorChar) + Path.DirectorySeparatorChar;
        return Path.GetFullPath(candidate).StartsWith(root, StringComparison.OrdinalIgnoreCase);
    }

    private static string FileHash(string path) => Convert.ToHexString(SHA256.HashData(File.ReadAllBytes(path)));

    private static string? FindPnpm()
    {
        IEnumerable<string> roots = (Environment.GetEnvironmentVariable("PATH") ?? "")
            .Split(Path.PathSeparator, StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            .Concat([
                Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "npm"),
                Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), "nodejs")
            ])
            .Distinct(StringComparer.OrdinalIgnoreCase);

        foreach (string root in roots)
        {
            foreach (string name in new[] { "pnpm.cmd", "pnpm.exe" })
            {
                string candidate;
                try
                {
                    candidate = Path.Combine(root.Trim('"'), name);
                }
                catch
                {
                    continue;
                }
                if (File.Exists(candidate)) return Path.GetFullPath(candidate);
            }
        }

        return null;
    }

    private static string BackupName() => $"{DateTime.Now:yyyyMMdd-HHmmss}-{Guid.NewGuid():N}"[..24];

    private static void RunPnpm(string pnpm, string workingDirectory, params string[] arguments)
    {
        // cmd.exe needs its /c command wrapped in an extra pair of quotes when
        // the executable is a quoted .cmd path. ProcessStartInfo.ArgumentList
        // escapes those quotes as literal characters, so compose Arguments here.
        string commandArguments = string.Join(" ", arguments.Select(QuoteCommandArgument));
        ProcessStartInfo startInfo = new()
        {
            FileName = Environment.GetEnvironmentVariable("ComSpec") ?? "cmd.exe",
            Arguments = $"/d /s /c \"\"{pnpm}\" {commandArguments}\"",
            WorkingDirectory = workingDirectory,
            UseShellExecute = false,
            CreateNoWindow = true,
            RedirectStandardOutput = true,
            RedirectStandardError = true
        };

        using Process process = Process.Start(startInfo)
            ?? throw new InvalidOperationException("pnpm could not be started.");
        Task<string> outputTask = process.StandardOutput.ReadToEndAsync();
        Task<string> errorTask = process.StandardError.ReadToEndAsync();
        process.WaitForExit();
        Task.WaitAll(outputTask, errorTask);
        if (process.ExitCode == 0) return;

        string details = (outputTask.Result + Environment.NewLine + errorTask.Result).Trim();
        if (details.Length > 4000) details = details[^4000..];
        throw new InvalidOperationException(
            $"The source-build command failed with code {process.ExitCode}. The previous compiled runtime has been restored.\n\n{details}"
        );
    }

    private static string QuoteCommandArgument(string value)
    {
        if (value.Length > 0 && value.All(character => char.IsLetterOrDigit(character) || "-._/\\:=@".Contains(character)))
            return value;
        return "\"" + value.Replace("\"", "\\\"") + "\"";
    }

    private static bool FilesEqual(string path, byte[] expected)
    {
        if (!File.Exists(path)) return false;
        byte[] actualHash = SHA256.HashData(File.ReadAllBytes(path));
        byte[] expectedHash = SHA256.HashData(expected);
        return CryptographicOperations.FixedTimeEquals(actualHash, expectedHash);
    }

    private static void BackupFile(string source, string destination)
    {
        if (File.Exists(source)) File.Copy(source, destination, true);
    }

    private static void RestoreSourceInstall(
        string sourceRoot,
        string targetRoot,
        bool targetCreated,
        bool pluginFilesChanged,
        bool distExisted,
        string backupPluginRoot,
        string backupDistRoot)
    {
        string distRoot = Path.Combine(sourceRoot, "dist");
        if (distExisted && Directory.Exists(backupDistRoot))
        {
            SafeDeleteDirectory(sourceRoot, distRoot);
            CopyDirectory(backupDistRoot, distRoot);
        }
        else if (!distExisted && Directory.Exists(distRoot))
        {
            string backupRoot = Directory.GetParent(backupPluginRoot)?.FullName
                ?? throw new InvalidOperationException("The source backup path is invalid.");
            string failedDist = Path.Combine(backupRoot, "failed-dist");
            CopyDirectory(distRoot, failedDist);
            SafeDeleteDirectory(sourceRoot, distRoot);
        }

        if (!pluginFilesChanged) return;
        if (targetCreated)
        {
            string backupRoot = Directory.GetParent(backupPluginRoot)?.FullName
                ?? throw new InvalidOperationException("The source backup path is invalid.");
            string failedSource = Path.Combine(backupRoot, "failed-iolite-source");
            SafeDeleteDirectory(backupRoot, failedSource);
            if (Directory.Exists(targetRoot))
            {
                CopyDirectory(targetRoot, failedSource);
                SafeDeleteDirectory(Directory.GetParent(targetRoot)!.FullName, targetRoot);
            }
            return;
        }

        RestoreFile(Path.Combine(backupPluginRoot, "index.tsx"), Path.Combine(targetRoot, "index.tsx"));
        RestoreFile(Path.Combine(backupPluginRoot, "QuickPanel.tsx"), Path.Combine(targetRoot, "QuickPanel.tsx"));
        RestoreFileOrDelete(Path.Combine(backupPluginRoot, "MenuEditor.tsx"), Path.Combine(targetRoot, "MenuEditor.tsx"));
        RestoreFile(Path.Combine(backupPluginRoot, ".iolite-installer-managed"), Path.Combine(targetRoot, ".iolite-installer-managed"));
    }

    private static void RestoreFile(string backup, string destination)
    {
        if (File.Exists(backup)) File.Copy(backup, destination, true);
    }

    private static void RestoreFileOrDelete(string backup, string destination)
    {
        if (File.Exists(backup)) File.Copy(backup, destination, true);
        else if (File.Exists(destination)) File.Delete(destination);
    }

    private static void TrimSourceBackups(string backupsRoot)
    {
        if (!Directory.Exists(backupsRoot)) return;
        foreach (DirectoryInfo oldBackup in new DirectoryInfo(backupsRoot)
                     .EnumerateDirectories()
                     .OrderByDescending(directory => directory.Name)
                     .Skip(3))
        {
            SafeDeleteDirectory(backupsRoot, oldBackup.FullName);
        }
    }

    private static void EnsureDiscordIsClosed()
    {
        string[] running = DiscordProcessNames
            .Where(name => Process.GetProcessesByName(name).Length > 0)
            .ToArray();
        if (running.Length > 0)
        {
            throw new InvalidOperationException(
                $"Close {string.Join(", ", running.Distinct())} completely from the system tray, then select Retry."
            );
        }
    }

    private static void BackupSettings(string settingsRoot, string backupsRoot)
    {
        if (!Directory.Exists(settingsRoot)) return;

        Directory.CreateDirectory(backupsRoot);
        string destination = Path.Combine(backupsRoot, BackupName());
        CopyDirectory(settingsRoot, destination);

        foreach (DirectoryInfo oldBackup in new DirectoryInfo(backupsRoot)
                     .EnumerateDirectories()
                     .OrderByDescending(directory => directory.Name)
                     .Skip(3))
        {
            SafeDeleteDirectory(backupsRoot, oldBackup.FullName);
        }
    }

    private static void CopyDirectory(string source, string destination)
    {
        Directory.CreateDirectory(destination);
        foreach (string file in Directory.EnumerateFiles(source))
            File.Copy(file, Path.Combine(destination, Path.GetFileName(file)), true);
        foreach (string directory in Directory.EnumerateDirectories(source))
        {
            if ((File.GetAttributes(directory) & FileAttributes.ReparsePoint) != 0) continue;
            CopyDirectory(directory, Path.Combine(destination, Path.GetFileName(directory)));
        }
    }

    private static void ExtractVerifiedRuntime(string destination, string allowedRoot)
    {
        byte[] archive = InstallerResources.ReadBytes("runtime.zip");
        string expectedHash = InstallerResources.ReadText("runtime.sha256").Trim();
        string actualHash = Convert.ToHexString(SHA256.HashData(archive)).ToLowerInvariant();
        if (!CryptographicOperations.FixedTimeEquals(
                Encoding.ASCII.GetBytes(expectedHash.ToLowerInvariant()),
                Encoding.ASCII.GetBytes(actualHash)))
            throw new InvalidDataException("The embedded runtime failed its integrity check.");

        SafeDeleteDirectory(allowedRoot, destination);
        Directory.CreateDirectory(destination);
        using MemoryStream stream = new(archive, false);
        using ZipArchive zip = new(stream, ZipArchiveMode.Read);
        zip.ExtractToDirectory(destination, true);

        string patcher = Path.Combine(destination, "dist", "patcher.js");
        if (!File.Exists(patcher)) throw new InvalidDataException("The embedded runtime is incomplete.");
    }

    private static int RunVencordInstaller(string managedRoot, string action)
    {
        if (action is not "--version" and not "-install" and not "-uninstall")
            throw new ArgumentOutOfRangeException(nameof(action), "Unsupported Vencord installer action.");

        string systemTemp = Path.GetFullPath(Path.GetTempPath());
        string temporaryRoot = Path.Combine(systemTemp, $"IoliteInstaller-{Guid.NewGuid():N}");
        Directory.CreateDirectory(temporaryRoot);
        string installerPath = Path.Combine(temporaryRoot, "VencordInstallerCli.exe");
        string logPath = Path.Combine(temporaryRoot, "VencordInstallerCli.log");
        File.WriteAllBytes(installerPath, InstallerResources.ReadBytes("VencordInstallerCli.exe"));

        try
        {
            ProcessStartInfo startInfo = new()
            {
                FileName = Environment.GetEnvironmentVariable("ComSpec") ?? "cmd.exe",
                Arguments = $"/d /s /c \"\"{installerPath}\" {action} --branch auto > \"{logPath}\" 2>&1\"",
                UseShellExecute = false,
                CreateNoWindow = true
            };
            startInfo.Environment["VENCORD_USER_DATA_DIR"] = managedRoot;
            startInfo.Environment["VENCORD_DEV_INSTALL"] = "1";

            using Process process = Process.Start(startInfo)
                ?? throw new InvalidOperationException("The Vencord installer could not be started.");
            if (!process.WaitForExit(60_000))
            {
                process.Kill(true);
                throw new TimeoutException(
                    "The Vencord patcher did not finish within 60 seconds. It was stopped and the previous runtime will be restored."
                );
            }
            if (process.ExitCode != 0)
            {
                string details = File.Exists(logPath) ? File.ReadAllText(logPath).Trim() : "No patcher log was produced.";
                if (details.Length > 3000) details = details[^3000..];
                throw new InvalidOperationException(
                    $"The Vencord patcher exited with code {process.ExitCode}.\n\n{details}"
                );
            }
            return process.ExitCode;
        }
        finally
        {
            SafeDeleteDirectory(systemTemp, temporaryRoot);
        }
    }

    private static void SafeDeleteDirectory(string allowedRoot, string target)
    {
        string root = Path.GetFullPath(allowedRoot).TrimEnd(Path.DirectorySeparatorChar) + Path.DirectorySeparatorChar;
        string fullTarget = Path.GetFullPath(target);
        if (!fullTarget.StartsWith(root, StringComparison.OrdinalIgnoreCase))
            throw new InvalidOperationException($"Refusing to delete a path outside the installer-owned directory: {fullTarget}");
        if (Directory.Exists(fullTarget)) Directory.Delete(fullTarget, true);
    }
}

internal static class SourceInstallDetector
{
    internal static string? FindActiveSourceRoot(string managedRoot)
    {
        string localAppData = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
        foreach (string branch in new[] { "Discord", "DiscordPTB", "DiscordCanary" })
        {
            string branchRoot = Path.Combine(localAppData, branch);
            if (!Directory.Exists(branchRoot)) continue;

            foreach (string appRoot in Directory.EnumerateDirectories(branchRoot, "app-*")
                         .OrderByDescending(path => path, StringComparer.OrdinalIgnoreCase))
            {
                string appAsar = Path.Combine(appRoot, "resources", "app.asar");
                string? sourceRoot = FindSourceRootFromLoader(appAsar);
                if (sourceRoot is null) continue;
                if (IsWithin(sourceRoot, managedRoot)) continue;
                return sourceRoot;
            }
        }

        return null;
    }

    private static string? FindSourceRootFromLoader(string appAsar)
    {
        if (!File.Exists(appAsar) || new FileInfo(appAsar).Length > 1_048_576) return null;
        string content = Encoding.UTF8.GetString(File.ReadAllBytes(appAsar));
        const string marker = "require(\"";
        int start = content.IndexOf(marker, StringComparison.Ordinal);
        if (start < 0) return null;
        start += marker.Length;
        int end = content.IndexOf("\")", start, StringComparison.Ordinal);
        if (end <= start) return null;

        string patcherPath = content[start..end].Replace("\\\\", "\\", StringComparison.Ordinal);
        string fullPatcherPath;
        try
        {
            fullPatcherPath = Path.GetFullPath(patcherPath);
        }
        catch
        {
            return null;
        }

        DirectoryInfo? dist = Directory.GetParent(fullPatcherPath);
        DirectoryInfo? root = dist?.Parent;
        if (dist is null || root is null || !dist.Name.Equals("dist", StringComparison.OrdinalIgnoreCase)) return null;
        return Directory.Exists(Path.Combine(root.FullName, "src", "userplugins")) ? root.FullName : null;
    }

    private static bool IsWithin(string candidate, string root)
    {
        string normalizedRoot = Path.GetFullPath(root).TrimEnd(Path.DirectorySeparatorChar) + Path.DirectorySeparatorChar;
        string normalizedCandidate = Path.GetFullPath(candidate).TrimEnd(Path.DirectorySeparatorChar) + Path.DirectorySeparatorChar;
        return normalizedCandidate.StartsWith(normalizedRoot, StringComparison.OrdinalIgnoreCase);
    }

    internal static int SelfTest(string[] args)
    {
        if (args.Length != 2) return 64;
        string appAsar = Path.GetFullPath(args[1]);
        string? sourceRoot = FindSourceRootFromLoader(appAsar);
        return sourceRoot is not null && Directory.Exists(Path.Combine(sourceRoot, "src", "userplugins")) ? 0 : 1;
    }
}

internal static class InstallerResources
{
    private const string ResourcePrefix = "Iolite.Installer.Resources.";

    internal static byte[] ReadBytes(string name)
    {
        using Stream stream = Assembly.GetExecutingAssembly().GetManifestResourceStream(ResourcePrefix + name)
            ?? throw new InvalidOperationException($"Installer resource '{name}' is missing.");
        using MemoryStream result = new();
        stream.CopyTo(result);
        return result.ToArray();
    }

    internal static string ReadText(string name) => Encoding.UTF8.GetString(ReadBytes(name));
}
