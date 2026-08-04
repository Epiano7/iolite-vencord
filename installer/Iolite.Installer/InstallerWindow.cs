/*
 * Iolite Installer
 * Copyright (c) 2026 Epiano7
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

using System.Runtime.InteropServices;

namespace Iolite.Installer;

internal static class InstallerWindow
{
    private const string WindowClass = "IoliteInstallerWindow";
    private const uint WsVisible = 0x10000000;
    private const uint WsChild = 0x40000000;
    private const uint WsTabStop = 0x00010000;
    private const uint WsBorder = 0x00800000;
    private const uint WsVScroll = 0x00200000;
    private const uint MainWindowStyle = 0x00CA0000;
    private const uint EsMultiline = 0x0004;
    private const uint EsAutoVScroll = 0x0040;
    private const uint EsReadOnly = 0x0800;
    private const uint BsDefaultPushButton = 0x0001;
    private const uint WmCreate = 0x0001;
    private const uint WmDestroy = 0x0002;
    private const uint WmClose = 0x0010;
    private const uint WmSetFont = 0x0030;
    private const uint WmCommand = 0x0111;
    private const uint WmUser = 0x0400;
    private const uint PbmSetPos = WmUser + 2;
    private const uint PbmSetRange32 = WmUser + 6;
    private const uint PbmSetState = WmUser + 16;
    private const int PbstNormal = 1;
    private const int PbstError = 2;
    private const int SwHide = 0;
    private const int SwShow = 5;
    private const int IdPrimary = 1001;
    private const int IdCancel = 1002;
    private const uint MbOk = 0x00000000;
    private const uint MbIconInformation = 0x00000040;
    private const uint MbIconWarning = 0x00000030;
    private const int ColorWindow = 5;
    private const int DefaultGuiFont = 17;
    private const int IdcArrow = 32512;
    private const int IccProgressClass = 0x00000020;

    private static readonly WindowProcedure WindowProcedureInstance = WindowProc;
    private static InstallerAction currentAction;
    private static nint window;
    private static nint statusLabel;
    private static nint progressBar;
    private static nint detailsBox;
    private static nint primaryButton;
    private static nint cancelButton;
    private static bool running;
    private static bool completed;

    internal static int Run(InstallerAction action)
    {
        currentAction = action;
        InitCommonControls();

        nint instance = GetModuleHandleW(null);
        WndClassEx windowClass = new()
        {
            Size = (uint)Marshal.SizeOf<WndClassEx>(),
            WindowProcedure = WindowProcedureInstance,
            Instance = instance,
            Cursor = LoadCursorW(0, (nint)IdcArrow),
            Background = (nint)(ColorWindow + 1),
            ClassName = WindowClass
        };
        if (RegisterClassExW(ref windowClass) == 0 && Marshal.GetLastWin32Error() != 1410)
            throw new InvalidOperationException("The installer window could not be registered.");

        const int width = 600;
        const int height = 430;
        int x = Math.Max(0, (GetSystemMetrics(0) - width) / 2);
        int y = Math.Max(0, (GetSystemMetrics(1) - height) / 2);
        window = CreateWindowExW(
            0,
            WindowClass,
            WindowTitle(action),
            MainWindowStyle,
            x,
            y,
            width,
            height,
            0,
            0,
            instance,
            0
        );
        if (window == 0) throw new InvalidOperationException("The installer window could not be created.");

        ShowWindow(window, SwShow);
        UpdateWindow(window);
        if (action == InstallerAction.SmokeTest) StartOperation();
        while (GetMessageW(out Message message, 0, 0, 0) > 0)
        {
            TranslateMessage(ref message);
            DispatchMessageW(ref message);
        }

        return completed ? 0 : 2;
    }

    internal static int ShowInformation(string message)
    {
        MessageBoxW(0, message, "Iolite Installer", MbOk | MbIconInformation);
        return 0;
    }

    internal static void ShowError(string message) => MessageBoxW(0, message, "Iolite Installer", MbOk | MbIconWarning);

    private static nint WindowProc(nint handle, uint message, nuint wParam, nint lParam)
    {
        switch (message)
        {
            case WmCreate:
                CreateControls(handle);
                return 0;
            case WmCommand:
                int id = unchecked((int)(wParam & 0xFFFF));
                if (id == IdPrimary)
                {
                    if (completed) DestroyWindow(handle);
                    else if (!running) StartOperation();
                    return 0;
                }
                if (id == IdCancel && !running)
                {
                    DestroyWindow(handle);
                    return 0;
                }
                break;
            case WmClose:
                if (running)
                {
                    MessageBoxW(handle, "Iolite is still working. Wait for the operation to finish.", "Iolite Installer", MbOk | MbIconInformation);
                    return 0;
                }
                DestroyWindow(handle);
                return 0;
            case WmDestroy:
                PostQuitMessage(0);
                return 0;
        }

        return DefWindowProcW(handle, message, wParam, lParam);
    }

    private static void CreateControls(nint parent)
    {
        nint instance = GetModuleHandleW(null);
        nint font = GetStockObject(DefaultGuiFont);
        string version = InstallerResources.ReadText("version.txt").Trim();
        string intro = currentAction switch
        {
            InstallerAction.Install => $"Install Iolite {version}. Standard Vencord uses a tested managed runtime; source builds keep their existing user plugins and rebuild in place.",
            InstallerAction.Repair => $"Repair Iolite {version}. The installer keeps the detected managed or source-built installation mode, along with its settings and backups.",
            InstallerAction.SmokeTest => "Testing the installer's persistent progress and completion window. No files will be changed.",
            _ => "Remove Iolite from its managed runtime or installer-managed source build. Other user plugins, settings, and backups remain intact."
        };

        CreateText(parent, instance, "Iolite", 24, 18, 535, 28, font);
        CreateText(parent, instance, intro, 24, 53, 535, 48, font);
        statusLabel = CreateText(parent, instance, "Ready", 24, 116, 535, 24, font);
        progressBar = CreateWindowExW(0, "msctls_progress32", "", WsChild | WsVisible, 24, 146, 535, 24, parent, 0, instance, 0);
        SendMessageW(progressBar, PbmSetRange32, 0, 100);
        detailsBox = CreateWindowExW(
            0,
            "EDIT",
            "Select the action below to begin. The window will stay open and report each step.",
            WsChild | WsVisible | WsBorder | WsVScroll | EsMultiline | EsAutoVScroll | EsReadOnly,
            24,
            185,
            535,
            125,
            parent,
            0,
            instance,
            0
        );
        ApplyFont(detailsBox, font);

        primaryButton = CreateWindowExW(
            0,
            "BUTTON",
            ActionButtonText(currentAction),
            WsChild | WsVisible | WsTabStop | BsDefaultPushButton,
            343,
            330,
            104,
            34,
            parent,
            (nint)IdPrimary,
            instance,
            0
        );
        cancelButton = CreateWindowExW(
            0,
            "BUTTON",
            "Cancel",
            WsChild | WsVisible | WsTabStop,
            455,
            330,
            104,
            34,
            parent,
            (nint)IdCancel,
            instance,
            0
        );
        ApplyFont(primaryButton, font);
        ApplyFont(cancelButton, font);
    }

    private static nint CreateText(nint parent, nint instance, string text, int x, int y, int width, int height, nint font)
    {
        nint control = CreateWindowExW(0, "STATIC", text, WsChild | WsVisible, x, y, width, height, parent, 0, instance, 0);
        ApplyFont(control, font);
        return control;
    }

    private static void ApplyFont(nint control, nint font) => SendMessageW(control, WmSetFont, unchecked((nuint)font), 1);

    private static void StartOperation()
    {
        running = true;
        completed = false;
        EnableWindow(primaryButton, false);
        EnableWindow(cancelButton, false);
        SendMessageW(progressBar, PbmSetState, PbstNormal, 0);
        Report(0, "Starting…", "Preparing the requested operation.");

        _ = Task.Run(() =>
        {
            try
            {
                OperationResult result = InstallerEngine.Run(currentAction, Report);
                completed = true;
                SetWindowTextW(statusLabel, result.Heading);
                SetWindowTextW(detailsBox, result.Message);
                SetWindowTextW(primaryButton, "Finish");
                SendMessageW(progressBar, PbmSetPos, 100, 0);
                ShowWindow(cancelButton, SwHide);
                EnableWindow(primaryButton, true);
                SetForegroundWindow(window);
                if (currentAction == InstallerAction.SmokeTest)
                {
                    running = false;
                    Thread.Sleep(200);
                    PostMessageW(window, WmClose, 0, 0);
                }
            }
            catch (Exception exception)
            {
                SetWindowTextW(statusLabel, "Iolite was not installed");
                SetWindowTextW(
                    detailsBox,
                    exception.Message + "\r\n\r\nThe previous runtime was restored when a rollback was available. Existing sibling user plugins were not removed."
                );
                SetWindowTextW(primaryButton, "Retry");
                SetWindowTextW(cancelButton, "Close");
                SendMessageW(progressBar, PbmSetState, PbstError, 0);
                EnableWindow(primaryButton, true);
                EnableWindow(cancelButton, true);
                SetForegroundWindow(window);
            }
            finally
            {
                running = false;
            }
        });
    }

    private static void Report(int progress, string status, string details)
    {
        SendMessageW(progressBar, PbmSetPos, unchecked((nuint)Math.Clamp(progress, 0, 100)), 0);
        SetWindowTextW(statusLabel, status);
        SetWindowTextW(detailsBox, details);
    }

    private static string WindowTitle(InstallerAction action) => action switch
    {
        InstallerAction.Repair => "Repair Iolite",
        InstallerAction.Uninstall => "Uninstall Iolite",
        InstallerAction.SmokeTest => "Iolite Installer UI Test",
        _ => "Install Iolite"
    };

    private static string ActionButtonText(InstallerAction action) => action switch
    {
        InstallerAction.Repair => "Repair",
        InstallerAction.Uninstall => "Uninstall",
        InstallerAction.SmokeTest => "Testing…",
        _ => "Install"
    };

    private static void InitCommonControls()
    {
        InitCommonControlsExInfo controls = new()
        {
            Size = (uint)Marshal.SizeOf<InitCommonControlsExInfo>(),
            Classes = IccProgressClass
        };
        InitCommonControlsEx(ref controls);
    }

    [UnmanagedFunctionPointer(CallingConvention.Winapi)]
    private delegate nint WindowProcedure(nint window, uint message, nuint wParam, nint lParam);

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    private struct WndClassEx
    {
        internal uint Size;
        internal uint Style;
        internal WindowProcedure WindowProcedure;
        internal int ClassExtra;
        internal int WindowExtra;
        internal nint Instance;
        internal nint Icon;
        internal nint Cursor;
        internal nint Background;
        [MarshalAs(UnmanagedType.LPWStr)] internal string? MenuName;
        [MarshalAs(UnmanagedType.LPWStr)] internal string ClassName;
        internal nint SmallIcon;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct Message
    {
        internal nint Window;
        internal uint Value;
        internal nuint WParam;
        internal nint LParam;
        internal uint Time;
        internal Point Position;
        internal uint Private;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct Point
    {
        internal int X;
        internal int Y;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct InitCommonControlsExInfo
    {
        internal uint Size;
        internal int Classes;
    }

    [DllImport("kernel32.dll", CharSet = CharSet.Unicode)]
    private static extern nint GetModuleHandleW(string? moduleName);

    [DllImport("comctl32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool InitCommonControlsEx(ref InitCommonControlsExInfo controls);

    [DllImport("user32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern ushort RegisterClassExW(ref WndClassEx windowClass);

    [DllImport("user32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern nint CreateWindowExW(
        uint extendedStyle,
        string className,
        string windowName,
        uint style,
        int x,
        int y,
        int width,
        int height,
        nint parent,
        nint menu,
        nint instance,
        nint parameter
    );

    [DllImport("user32.dll")]
    private static extern nint DefWindowProcW(nint window, uint message, nuint wParam, nint lParam);

    [DllImport("user32.dll")]
    private static extern int GetMessageW(out Message message, nint window, uint minimum, uint maximum);

    [DllImport("user32.dll")]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool TranslateMessage(ref Message message);

    [DllImport("user32.dll")]
    private static extern nint DispatchMessageW(ref Message message);

    [DllImport("user32.dll")]
    private static extern void PostQuitMessage(int exitCode);

    [DllImport("user32.dll")]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool DestroyWindow(nint window);

    [DllImport("user32.dll")]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool ShowWindow(nint window, int command);

    [DllImport("user32.dll")]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool UpdateWindow(nint window);

    [DllImport("user32.dll")]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool EnableWindow(nint window, [MarshalAs(UnmanagedType.Bool)] bool enabled);

    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool SetWindowTextW(nint window, string text);

    [DllImport("user32.dll")]
    private static extern nint SendMessageW(nint window, uint message, nuint wParam, nint lParam);

    [DllImport("user32.dll")]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool PostMessageW(nint window, uint message, nuint wParam, nint lParam);

    [DllImport("user32.dll")]
    private static extern int GetSystemMetrics(int index);

    [DllImport("user32.dll")]
    private static extern nint LoadCursorW(nint instance, nint cursorName);

    [DllImport("gdi32.dll")]
    private static extern nint GetStockObject(int objectIndex);

    [DllImport("user32.dll")]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool SetForegroundWindow(nint window);

    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    private static extern int MessageBoxW(nint owner, string text, string caption, uint type);
}
