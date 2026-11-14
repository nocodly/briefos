# Minutama call detector helper (Windows).
# Prints, every 2 seconds, one line: MIC <comma-separated process names>
# listing the processes that currently have an ACTIVE audio session on any
# capture (microphone) device. Uses Core Audio (IAudioSessionManager2) through
# a small C# shim, so it works on Windows builds where the privacy registry no
# longer updates. Read-only; it never opens or records the microphone itself.

$ErrorActionPreference = 'Stop'

Add-Type -Language CSharp -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;

namespace Minutama {
  [ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")] class MMDeviceEnumeratorCom {}

  [Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IMMDeviceEnumerator {
    int EnumAudioEndpoints(int dataFlow, int stateMask, out IMMDeviceCollection devices);
    int GetDefaultAudioEndpoint(int dataFlow, int role, out IMMDevice endpoint);
    int GetDevice([MarshalAs(UnmanagedType.LPWStr)] string id, out IMMDevice device);
    int RegisterEndpointNotificationCallback(IntPtr client);
    int UnregisterEndpointNotificationCallback(IntPtr client);
  }

  [Guid("0BD7A1BE-7A1A-44DB-8397-CC5392387B5E"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IMMDeviceCollection {
    int GetCount(out int count);
    int Item(int index, out IMMDevice device);
  }

  [Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IMMDevice {
    int Activate(ref Guid iid, int clsCtx, IntPtr activationParams, [MarshalAs(UnmanagedType.IUnknown)] out object iface);
  }

  [Guid("77AA99A0-1BD6-484F-8BC7-2C654C9A9B6F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IAudioSessionManager2 {
    int GetAudioSessionControl(IntPtr sessionGuid, int flags, out IntPtr control);
    int GetSimpleAudioVolume(IntPtr sessionGuid, int flags, out IntPtr volume);
    int GetSessionEnumerator(out IAudioSessionEnumerator sessions);
  }

  [Guid("E2F5BB11-0570-40CA-ACDD-3AA01277DEE8"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IAudioSessionEnumerator {
    int GetCount(out int count);
    int GetSession(int index, out IAudioSessionControl2 session);
  }

  [Guid("BFB7FF88-7239-4FC9-8FA2-07C950BE9C6D"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IAudioSessionControl2 {
    // IAudioSessionControl
    int GetState(out int state);
    int GetDisplayName(out IntPtr name);
    int SetDisplayName(IntPtr name, IntPtr ctx);
    int GetIconPath(out IntPtr path);
    int SetIconPath(IntPtr path, IntPtr ctx);
    int GetGroupingParam(out Guid param);
    int SetGroupingParam(ref Guid param, IntPtr ctx);
    int RegisterAudioSessionNotification(IntPtr client);
    int UnregisterAudioSessionNotification(IntPtr client);
    // IAudioSessionControl2
    int GetSessionIdentifier(out IntPtr id);
    int GetSessionInstanceIdentifier(out IntPtr id);
    int GetProcessId(out uint pid);
    int IsSystemSoundsSession();
    int SetDuckingPreference(bool optOut);
  }

  public static class Mic {
    const int eCapture = 1;
    const int DEVICE_STATE_ACTIVE = 1;
    const int CLSCTX_ALL = 23;
    const int AudioSessionStateActive = 1;

    public static int[] ActivePids() {
      var pids = new List<int>();
      var enumerator = (IMMDeviceEnumerator)(new MMDeviceEnumeratorCom());
      IMMDeviceCollection devices;
      if (enumerator.EnumAudioEndpoints(eCapture, DEVICE_STATE_ACTIVE, out devices) != 0) return pids.ToArray();
      int count; devices.GetCount(out count);
      Guid iid = typeof(IAudioSessionManager2).GUID;
      for (int i = 0; i < count; i++) {
        try {
          IMMDevice device; devices.Item(i, out device);
          object o; device.Activate(ref iid, CLSCTX_ALL, IntPtr.Zero, out o);
          var mgr = (IAudioSessionManager2)o;
          IAudioSessionEnumerator sessions; mgr.GetSessionEnumerator(out sessions);
          int n; sessions.GetCount(out n);
          for (int j = 0; j < n; j++) {
            IAudioSessionControl2 s; sessions.GetSession(j, out s);
            int state; s.GetState(out state);
            if (state != AudioSessionStateActive) continue;
            uint pid; s.GetProcessId(out pid);
            if (pid != 0 && !pids.Contains((int)pid)) pids.Add((int)pid);
          }
        } catch { }
      }
      return pids.ToArray();
    }
  }
}
'@

while ($true) {
  $names = @()
  try {
    foreach ($procId in [Minutama.Mic]::ActivePids()) {
      try { $names += (Get-Process -Id $procId -ErrorAction Stop).ProcessName } catch { }
    }
  } catch { }
  [Console]::Out.WriteLine('MIC ' + (($names | Select-Object -Unique) -join ','))
  [Console]::Out.Flush()
  Start-Sleep -Seconds 2
}
