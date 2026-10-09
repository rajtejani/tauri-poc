use std::net::{IpAddr, Ipv4Addr, SocketAddr};
use std::path::PathBuf;
use std::process::Command;
use std::time::Duration;
use tokio::net::TcpStream;
use tokio::io::AsyncWriteExt;
use tokio::time::timeout;
use tauri::AppHandle;
use tauri::Manager;

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PrinterConfig {
    pub name: String,
    pub ip: String,
    pub port: u16,
    pub width: String, // "58mm" | "80mm" | "110mm"
    /// "network" (default) or "usb"
    #[serde(default = "default_connection_type")]
    pub connection_type: String,
    /// Windows USB port (e.g. USB001) or CUPS device URI on macOS/Linux
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub usb_port_name: Option<String>,
}

fn default_connection_type() -> String {
    "network".to_string()
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UsbPrinterInfo {
    pub name: String,
    pub port_name: String,
    pub status: String,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct PrintersConfigWrapper {
    pub printers: Vec<PrinterConfig>,
}

/// Helper to scan local network for open port 9100 (Thermal Printers)
pub async fn scan_local_printers() -> Result<Vec<String>, String> {
    let local_ip = match local_ip_address::local_ip() {
        Ok(ip) => ip,
        Err(e) => return Err(format!("Could not get local IP address: {e}")),
    };

    let octets = match local_ip {
        IpAddr::V4(ipv4) => ipv4.octets(),
        _ => return Err("Only IPv4 networks are supported for auto-scanning".to_string()),
    };

    let subnet_base = [octets[0], octets[1], octets[2]];
    let port = 9100;

    let mut tasks = Vec::new();
    for i in 1..=254 {
        // Skip scanning own IP if desired, but keeping it is fine
        let ip = Ipv4Addr::new(subnet_base[0], subnet_base[1], subnet_base[2], i);
        let addr = SocketAddr::new(IpAddr::V4(ip), port);

        tasks.push(tokio::spawn(async move {
            // Attempt to connect to port 9100 with a 600ms timeout
            match timeout(Duration::from_millis(600), TcpStream::connect(addr)).await {
                Ok(Ok(_stream)) => Some(ip.to_string()),
                _ => None,
            }
        }));
    }

    let mut found_ips = Vec::new();
    for task in tasks {
        if let Ok(Some(ip)) = task.await {
            found_ips.push(ip);
        }
    }

    Ok(found_ips)
}

/// Discover printers that are directly attached via USB (OS print queue).
/// Windows uses `Get-Printer` and keeps only `PortName` values like `USB001`.
/// macOS/Linux use CUPS (`lpstat -v`) and keep `usb://` device URIs.
pub fn discover_usb_printers() -> Result<Vec<UsbPrinterInfo>, String> {
    #[cfg(target_os = "windows")]
    {
        return discover_usb_printers_windows();
    }

    #[cfg(any(target_os = "macos", target_os = "linux"))]
    {
        return discover_usb_printers_cups();
    }

    #[cfg(not(any(target_os = "windows", target_os = "macos", target_os = "linux")))]
    {
        Err("USB printer discovery is not supported on this platform".to_string())
    }
}

#[cfg(target_os = "windows")]
fn discover_usb_printers_windows() -> Result<Vec<UsbPrinterInfo>, String> {
    // Force an array even when a single printer is installed, then filter USB ports.
    let script = r#"
$ErrorActionPreference = 'Stop'
$printers = @(Get-Printer | Where-Object { $_.PortName -like 'USB*' } | Select-Object Name, PrinterStatus, PortName)
$printers | ConvertTo-Json -Compress
"#;

    let output = Command::new("powershell")
        .args(["-NoProfile", "-NonInteractive", "-Command", script])
        .output()
        .map_err(|e| format!("Failed to run PowerShell: {e}"))?;

    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).trim().to_string());
    }

    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if stdout.is_empty() || stdout == "null" {
        return Ok(Vec::new());
    }

    let value: serde_json::Value = serde_json::from_str(&stdout)
        .map_err(|e| format!("Failed to parse Get-Printer JSON: {e}"))?;

    let items = match value {
        serde_json::Value::Array(arr) => arr,
        obj @ serde_json::Value::Object(_) => vec![obj],
        _ => return Ok(Vec::new()),
    };

    let mut printers = Vec::new();
    for item in items {
        let name = item
            .get("Name")
            .and_then(|v| v.as_str())
            .unwrap_or("Unknown Printer")
            .to_string();
        let port_name = item
            .get("PortName")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();
        let status = item
            .get("PrinterStatus")
            .map(|v| match v {
                serde_json::Value::Number(n) => n.to_string(),
                serde_json::Value::String(s) => s.clone(),
                other => other.to_string(),
            })
            .unwrap_or_else(|| "Unknown".to_string());

        if !port_name.to_ascii_uppercase().starts_with("USB") {
            continue;
        }

        printers.push(UsbPrinterInfo {
            name,
            port_name,
            status,
        });
    }

    Ok(printers)
}

#[cfg(any(target_os = "macos", target_os = "linux"))]
fn discover_usb_printers_cups() -> Result<Vec<UsbPrinterInfo>, String> {
    let output = Command::new("lpstat")
        .args(["-v"])
        .output()
        .map_err(|e| format!("Failed to run lpstat: {e}"))?;

    // lpstat returns non-zero when no printers are configured; treat that as empty.
    let stdout = String::from_utf8_lossy(&output.stdout);
    if stdout.trim().is_empty() {
        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
            if !stderr.is_empty() {
                return Err(stderr);
            }
        }
        return Ok(Vec::new());
    }

    let mut printers = Vec::new();
    for line in stdout.lines() {
        // Example: device for HP_LaserJet_Pro: usb://HP/LaserJet%20Pro?serial=ABC
        let line = line.trim();
        let Some(rest) = line.strip_prefix("device for ") else {
            continue;
        };
        let Some((name, uri)) = rest.split_once(':') else {
            continue;
        };
        let uri = uri.trim();
        if !uri.to_ascii_lowercase().starts_with("usb://") {
            continue;
        }

        // Keep the exact CUPS queue name (underscores matter for `lp -d`).
        printers.push(UsbPrinterInfo {
            name: name.trim().to_string(),
            port_name: uri.to_string(),
            status: "Ready".to_string(),
        });
    }

    Ok(printers)
}

/// Helper to get path of the printers config file
fn get_config_path(app_handle: &AppHandle) -> Result<PathBuf, String> {
    let app_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {e}"))?;
    
    // Ensure parent directories exist
    std::fs::create_dir_all(&app_dir)
        .map_err(|e| format!("Failed to create app data dir: {e}"))?;

    Ok(app_dir.join("printers.json"))
}

/// Load configured printers from printers.json
pub fn load_printers(app_handle: &AppHandle) -> Result<Vec<PrinterConfig>, String> {
    let path = get_config_path(app_handle)?;
    if !path.exists() {
        return Ok(Vec::new());
    }

    let content = std::fs::read_to_string(&path)
        .map_err(|e| format!("Failed to read printers config file: {e}"))?;

    let wrapper: PrintersConfigWrapper = serde_json::from_str(&content)
        .map_err(|e| format!("Failed to parse printers config: {e}"))?;

    Ok(wrapper.printers)
}

/// Save configured printers to printers.json
pub fn save_printers(app_handle: &AppHandle, printers: Vec<PrinterConfig>) -> Result<(), String> {
    let path = get_config_path(app_handle)?;
    let wrapper = PrintersConfigWrapper { printers };

    let content = serde_json::to_string_pretty(&wrapper)
        .map_err(|e| format!("Failed to serialize printers config: {e}"))?;

    std::fs::write(&path, content)
        .map_err(|e| format!("Failed to write printers config: {e}"))?;

    Ok(())
}

/// Helper to create a text line with left-aligned description and right-aligned price
fn format_line(left: &str, right: &str, line_width: usize) -> String {
    let left_len = left.chars().count();
    let right_len = right.chars().count();

    if left_len + right_len >= line_width {
        // If it exceeds the line width, truncate left column
        let max_left_len = line_width.saturating_sub(right_len).saturating_sub(1);
        let left_truncated: String = left.chars().take(max_left_len).collect();
        let pad_len = line_width.saturating_sub(left_truncated.chars().count() + right_len);
        format!("{}{}{}", left_truncated, " ".repeat(pad_len), right)
    } else {
        let pad_len = line_width - (left_len + right_len);
        format!("{}{}{}", left, " ".repeat(pad_len), right)
    }
}

/// Build the same ESC/POS receipt bytes used for LAN and USB printing.
fn build_escpos_receipt_bytes(width: &str) -> Vec<u8> {
    let line_width = match width {
        "58mm" => 32,
        "110mm" => 64,
        _ => 48, // Default to 80mm (standard)
    };

    let mut buf = Vec::new();

    // 1. Initialize printer: ESC @
    buf.extend_from_slice(b"\x1b@");

    // 2. Select justification (Center): ESC a 1
    buf.extend_from_slice(b"\x1ba\x01");

    // 3. Header text (Bold, double size: GS ! 17)
    buf.extend_from_slice(b"\x1d!\x11");
    buf.extend_from_slice(b"PAPA'S PIZZERIA\n");
    buf.extend_from_slice(b"\x1d!\x00"); // Restore normal font size

    // Address & Tel (normal size, centered)
    buf.extend_from_slice(b"123 Main Street, New York\n");
    buf.extend_from_slice(b"Tel: (555) 019-2834\n");
    buf.extend_from_slice(b"\n");

    // 4. Align Left: ESC a 0
    buf.extend_from_slice(b"\x1ba\x00");

    let now = chrono::Local::now().format("%Y-%m-%d %H:%M").to_string();

    if line_width >= 48 {
        buf.extend_from_slice(format_line("Order: #8792", "Table: 14", line_width).as_bytes());
        buf.extend_from_slice(b"\n");
        buf.extend_from_slice(format_line(&format!("Date: {now}"), "Guests: 3", line_width).as_bytes());
        buf.extend_from_slice(b"\n");
        buf.extend_from_slice(b"Server: Jessica (Active Host)\n");
    } else {
        buf.extend_from_slice(b"Order: #8792      Table: 14\n");
        buf.extend_from_slice(format!("Date: {now}\n").as_bytes());
        buf.extend_from_slice(b"Server: Jessica   Guests: 3\n");
    }

    let divider = "=".repeat(line_width) + "\n";
    buf.extend_from_slice(divider.as_bytes());

    buf.extend_from_slice(format_line("Item Description", "Amount", line_width).as_bytes());
    buf.extend_from_slice(b"\n");

    let sub_divider = "-".repeat(line_width) + "\n";
    buf.extend_from_slice(sub_divider.as_bytes());

    buf.extend_from_slice(format_line("1x Large Pepperoni Pizza", "300.00", line_width).as_bytes());
    buf.extend_from_slice(b"\n");
    buf.extend_from_slice(format_line("1x Garlic Bread Crust", "230.00", line_width).as_bytes());
    buf.extend_from_slice(b"\n");
    buf.extend_from_slice(format_line("3x Fountain Soft Drinks", "600.00", line_width).as_bytes());
    buf.extend_from_slice(b"\n");
    buf.extend_from_slice(format_line("1x Classic Tiramisu Dessert", "400.00", line_width).as_bytes());
    buf.extend_from_slice(b"\n");
    buf.extend_from_slice(format_line("1x Margherita Pizza", "280.00", line_width).as_bytes());
    buf.extend_from_slice(b"\n");
    buf.extend_from_slice(format_line("2x Caesar Salad", "460.00", line_width).as_bytes());
    buf.extend_from_slice(b"\n");
    buf.extend_from_slice(format_line("1x French Fries", "150.00", line_width).as_bytes());
    buf.extend_from_slice(b"\n");
    buf.extend_from_slice(format_line("2x Iced Tea", "250.00", line_width).as_bytes());
    buf.extend_from_slice(b"\n");
    buf.extend_from_slice(format_line("1x Chocolate Brownie", "230.00", line_width).as_bytes());
    buf.extend_from_slice(b"\n");
    buf.extend_from_slice(format_line("1x Cheese Nachos", "275.00", line_width).as_bytes());
    buf.extend_from_slice(b"\n");
    buf.extend_from_slice(format_line("1x Fresh Lemonade", "300.00", line_width).as_bytes());
    buf.extend_from_slice(b"\n");
    buf.extend_from_slice(format_line("1x Strawberry Milkshake", "350.00", line_width).as_bytes());
    buf.extend_from_slice(b"\n");

    buf.extend_from_slice(sub_divider.as_bytes());

    buf.extend_from_slice(format_line("Subtotal", "3825.00", line_width).as_bytes());
    buf.extend_from_slice(b"\n");
    buf.extend_from_slice(format_line("Tax (8.25%)", "315.00", line_width).as_bytes());
    buf.extend_from_slice(b"\n");

    buf.extend_from_slice(b"\x1bE\x01");
    buf.extend_from_slice(format_line("Total Due", "4140.00", line_width).as_bytes());
    buf.extend_from_slice(b"\n");
    buf.extend_from_slice(b"\x1bE\x00");

    buf.extend_from_slice(divider.as_bytes());

    buf.extend_from_slice(b"\x1ba\x01");
    buf.extend_from_slice(b"Thank you for dining with us!\n");
    buf.extend_from_slice(b"Please pay at the front counter.\n");
    buf.extend_from_slice(b"==============================\n");

    // Feed + partial cut
    buf.extend_from_slice(b"\n\n\n\n\x1dVB\x00");

    buf
}

/// Print receipt over LAN (raw TCP to port 9100) or USB (OS print queue / RAW).
pub async fn print_escpos_receipt(
    width: &str,
    connection_type: &str,
    ip: Option<&str>,
    port: Option<u16>,
    printer_name: Option<&str>,
) -> Result<(), String> {
    let buf = build_escpos_receipt_bytes(width);

    if connection_type.eq_ignore_ascii_case("usb") {
        let name = printer_name
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .ok_or_else(|| "USB printer name is required for printing".to_string())?;
        return send_raw_to_usb_printer(name, &buf).await;
    }

    let ip = ip
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .ok_or_else(|| "Printer IP is required for network printing".to_string())?;
    let port = port.unwrap_or(9100);
    send_raw_to_network_printer(ip, port, &buf).await
}

async fn send_raw_to_network_printer(ip: &str, port: u16, buf: &[u8]) -> Result<(), String> {
    let addr: SocketAddr = format!("{ip}:{port}")
        .parse()
        .map_err(|e| format!("Invalid printer address '{ip}:{port}': {e}"))?;

    let mut stream = timeout(Duration::from_secs(5), TcpStream::connect(addr))
        .await
        .map_err(|_| format!("Connection to printer {ip}:{port} timed out"))?
        .map_err(|e| format!("Failed to connect to printer: {e}"))?;

    stream
        .write_all(buf)
        .await
        .map_err(|e| format!("Failed to send print bytes: {e}"))?;

    stream
        .flush()
        .await
        .map_err(|e| format!("Failed to flush printer stream: {e}"))?;

    Ok(())
}

/// Send raw ESC/POS bytes to an OS-installed USB printer (Windows spooler / CUPS).
async fn send_raw_to_usb_printer(printer_name: &str, buf: &[u8]) -> Result<(), String> {
    let printer_name = printer_name.to_string();
    let buf = buf.to_vec();
    tokio::task::spawn_blocking(move || send_raw_to_usb_printer_blocking(&printer_name, &buf))
        .await
        .map_err(|e| format!("USB print task failed: {e}"))?
}

fn send_raw_to_usb_printer_blocking(printer_name: &str, buf: &[u8]) -> Result<(), String> {
    let tmp_path = std::env::temp_dir().join(format!(
        "poc-receipt-{}.bin",
        uuid::Uuid::new_v4()
    ));

    std::fs::write(&tmp_path, buf)
        .map_err(|e| format!("Failed to write temp receipt file: {e}"))?;

    let result = {
        #[cfg(target_os = "windows")]
        {
            send_raw_windows(printer_name, &tmp_path)
        }
        #[cfg(any(target_os = "macos", target_os = "linux"))]
        {
            send_raw_cups(printer_name, &tmp_path)
        }
        #[cfg(not(any(target_os = "windows", target_os = "macos", target_os = "linux")))]
        {
            Err("USB printing is not supported on this platform".to_string())
        }
    };

    let _ = std::fs::remove_file(&tmp_path);
    result
}

#[cfg(target_os = "windows")]
fn send_raw_windows(printer_name: &str, file_path: &std::path::Path) -> Result<(), String> {
    // Win32 RAW print via PowerShell (same receipt bytes as LAN TCP 9100).
    let path_str = file_path
        .to_str()
        .ok_or_else(|| "Temp receipt path is not valid UTF-8".to_string())?;

    // Escape single quotes for PowerShell single-quoted strings.
    let safe_name = printer_name.replace('\'', "''");
    let safe_path = path_str.replace('\'', "''");

    let script = format!(
        r#"
$ErrorActionPreference = 'Stop'
$printerName = '{safe_name}'
$filePath = '{safe_path}'

Add-Type -TypeDefinition @"
using System;
using System.IO;
using System.Runtime.InteropServices;

public class RawPrinterHelper {{
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Ansi)]
  public class DOCINFOA {{
    [MarshalAs(UnmanagedType.LPStr)] public string pDocName;
    [MarshalAs(UnmanagedType.LPStr)] public string pOutputFile;
    [MarshalAs(UnmanagedType.LPStr)] public string pDataType;
  }}

  [DllImport("winspool.Drv", EntryPoint = "OpenPrinterA", SetLastError = true, CharSet = CharSet.Ansi, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
  public static extern bool OpenPrinter([MarshalAs(UnmanagedType.LPStr)] string szPrinter, out IntPtr hPrinter, IntPtr pd);

  [DllImport("winspool.Drv", EntryPoint = "ClosePrinter", SetLastError = true, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
  public static extern bool ClosePrinter(IntPtr hPrinter);

  [DllImport("winspool.Drv", EntryPoint = "StartDocPrinterA", SetLastError = true, CharSet = CharSet.Ansi, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
  public static extern bool StartDocPrinter(IntPtr hPrinter, Int32 level, [In, MarshalAs(UnmanagedType.LPStruct)] DOCINFOA di);

  [DllImport("winspool.Drv", EntryPoint = "EndDocPrinter", SetLastError = true, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
  public static extern bool EndDocPrinter(IntPtr hPrinter);

  [DllImport("winspool.Drv", EntryPoint = "StartPagePrinter", SetLastError = true, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
  public static extern bool StartPagePrinter(IntPtr hPrinter);

  [DllImport("winspool.Drv", EntryPoint = "EndPagePrinter", SetLastError = true, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
  public static extern bool EndPagePrinter(IntPtr hPrinter);

  [DllImport("winspool.Drv", EntryPoint = "WritePrinter", SetLastError = true, ExactSpelling = true, CallingConvention = CallingConvention.StdCall)]
  public static extern bool WritePrinter(IntPtr hPrinter, IntPtr pBytes, Int32 dwCount, out Int32 dwWritten);

  public static void SendBytes(string printerName, byte[] bytes) {{
    IntPtr hPrinter;
    if (!OpenPrinter(printerName, out hPrinter, IntPtr.Zero)) {{
      throw new Exception("OpenPrinter failed for '" + printerName + "' (Win32=" + Marshal.GetLastWin32Error() + ")");
    }}
    try {{
      DOCINFOA di = new DOCINFOA();
      di.pDocName = "POC Receipt";
      di.pDataType = "RAW";
      if (!StartDocPrinter(hPrinter, 1, di)) {{
        throw new Exception("StartDocPrinter failed (Win32=" + Marshal.GetLastWin32Error() + ")");
      }}
      try {{
        if (!StartPagePrinter(hPrinter)) {{
          throw new Exception("StartPagePrinter failed (Win32=" + Marshal.GetLastWin32Error() + ")");
        }}
        try {{
          IntPtr pUnmanagedBytes = Marshal.AllocCoTaskMem(bytes.Length);
          try {{
            Marshal.Copy(bytes, 0, pUnmanagedBytes, bytes.Length);
            int written;
            if (!WritePrinter(hPrinter, pUnmanagedBytes, bytes.Length, out written)) {{
              throw new Exception("WritePrinter failed (Win32=" + Marshal.GetLastWin32Error() + ")");
            }}
          }} finally {{
            Marshal.FreeCoTaskMem(pUnmanagedBytes);
          }}
        }} finally {{
          EndPagePrinter(hPrinter);
        }}
      }} finally {{
        EndDocPrinter(hPrinter);
      }}
    }} finally {{
      ClosePrinter(hPrinter);
    }}
  }}
}}
"@

$bytes = [System.IO.File]::ReadAllBytes($filePath)
[RawPrinterHelper]::SendBytes($printerName, $bytes)
"#,
        safe_name = safe_name,
        safe_path = safe_path
    );

    let output = Command::new("powershell")
        .args(["-NoProfile", "-NonInteractive", "-Command", &script])
        .output()
        .map_err(|e| format!("Failed to run PowerShell raw print: {e}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
        let detail = if !stderr.is_empty() { stderr } else { stdout };
        return Err(if detail.is_empty() {
            "Windows RAW print failed".to_string()
        } else {
            detail
        });
    }

    Ok(())
}

#[cfg(any(target_os = "macos", target_os = "linux"))]
fn send_raw_cups(printer_name: &str, file_path: &std::path::Path) -> Result<(), String> {
    let path_str = file_path
        .to_str()
        .ok_or_else(|| "Temp receipt path is not valid UTF-8".to_string())?;

    // Prefer `lpr -l` (literal) so CUPS does not translate CR/LF or filter binary ESC/POS.
    let lpr = Command::new("lpr")
        .args(["-P", printer_name, "-l", path_str])
        .output();

    match lpr {
        Ok(output) if output.status.success() => return Ok(()),
        Ok(output) => {
            let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
            if !stderr.is_empty() {
                eprintln!("lpr -l failed, falling back to lp raw: {stderr}");
            }
        }
        Err(e) => {
            eprintln!("lpr not available ({e}), falling back to lp raw");
        }
    }

    let output = Command::new("lp")
        .args([
            "-d",
            printer_name,
            "-o",
            "raw",
            "-o",
            "document-format=application/vnd.cups-raw",
            path_str,
        ])
        .output()
        .map_err(|e| format!("Failed to run lp: {e}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return Err(if stderr.is_empty() {
            format!("CUPS lp failed for printer '{printer_name}'")
        } else {
            stderr
        });
    }

    Ok(())
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RasterCommand {
    GsV0,
    EscStar,
}

pub fn parse_raster_mode(mode: Option<&str>) -> RasterCommand {
    match mode.map(|s| s.trim().to_ascii_lowercase()).as_deref() {
        Some("escstar") | Some("esc_star") | Some("esc-*") => RasterCommand::EscStar,
        _ => RasterCommand::GsV0,
    }
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RasterPayload {
    pub width_dots: u32,
    pub height: u32,
    /// Row-major packed 1bpp raster (MSB = left dot, 1 = black).
    pub rows: Vec<u8>,
}

fn validate_raster_payload(payload: &RasterPayload) -> Result<usize, String> {
    let width_dots = payload.width_dots;
    let height = payload.height;

    if width_dots == 0 || height == 0 {
        return Err("Raster width and height must be greater than zero".to_string());
    }

    let row_bytes = ((width_dots + 7) / 8) as usize;
    let expected_len = row_bytes * height as usize;
    if payload.rows.len() != expected_len {
        return Err(format!(
            "Raster data length mismatch: expected {expected_len} bytes, got {}",
            payload.rows.len()
        ));
    }
    Ok(row_bytes)
}

fn raster_bit(rows: &[u8], row_bytes: usize, width_dots: u32, x: u32, y: u32) -> bool {
    if x >= width_dots {
        return false;
    }
    let byte_index = y as usize * row_bytes + (x as usize >> 3);
    if byte_index >= rows.len() {
        return false;
    }
    let bit_pos = 7 - (x as usize & 7);
    (rows[byte_index] >> bit_pos) & 1 == 1
}

/// Build ESC/POS bytes for a monochrome raster (GS v 0), banded to 255 rows per command.
pub fn build_escpos_raster_bytes(payload: &RasterPayload) -> Result<Vec<u8>, String> {
    let height = payload.height;
    let row_bytes = validate_raster_payload(payload)?;

    let mut buf = Vec::new();
    buf.extend_from_slice(b"\x1b@");

    let max_band: u32 = 255;
    let mut y_offset: u32 = 0;

    while y_offset < height {
        let band_height = std::cmp::min(max_band, height - y_offset);
        let start = y_offset as usize * row_bytes;
        let end = start + band_height as usize * row_bytes;
        let band = &payload.rows[start..end];

        // GS v 0 m — m=0 normal
        buf.push(0x1d);
        buf.push(b'v');
        buf.push(0x30);
        buf.push(0x00);

        let x = row_bytes as u16;
        let y = band_height as u16;
        buf.push((x & 0xff) as u8);
        buf.push((x >> 8) as u8);
        buf.push((y & 0xff) as u8);
        buf.push((y >> 8) as u8);
        buf.extend_from_slice(band);

        y_offset += band_height;
    }

    append_feed_and_cut(&mut buf);
    Ok(buf)
}

fn append_feed_and_cut(buf: &mut Vec<u8>) {
    buf.extend_from_slice(b"\n\n\n\n\x1dVB\x00");
}

/// ESC * mode 33 (24-dot double-density) — widely supported on budget ESC/POS printers.
pub fn build_escpos_raster_escstar(payload: &RasterPayload) -> Result<Vec<u8>, String> {
    let width_dots = payload.width_dots;
    let height = payload.height;
    let row_bytes = validate_raster_payload(payload)?;

    let mut buf = Vec::new();
    buf.extend_from_slice(b"\x1b@");
    // Line spacing = 24 dots so each LF after a stripe advances exactly one stripe.
    buf.extend_from_slice(b"\x1b3\x18");

    let stripe_h: u32 = 24;
    let mut y: u32 = 0;
    while y < height {
        let stripe_rows = std::cmp::min(stripe_h, height - y);
        // ESC * m nL nH — m=33 (24-dot double-density)
        buf.push(0x1b);
        buf.push(b'*');
        buf.push(33);
        let n = width_dots as u16;
        buf.push((n & 0xff) as u8);
        buf.push((n >> 8) as u8);

        for x in 0..width_dots {
            for byte_idx in 0..3u32 {
                let mut b = 0u8;
                for bit in 0..8u32 {
                    let r = byte_idx * 8 + bit;
                    if r < stripe_rows && raster_bit(&payload.rows, row_bytes, width_dots, x, y + r)
                    {
                        b |= 1 << (7 - bit);
                    }
                }
                buf.push(b);
            }
        }
        buf.push(b'\n');
        y += stripe_rows;
    }

    buf.extend_from_slice(b"\x1b2");
    append_feed_and_cut(&mut buf);
    Ok(buf)
}

pub fn build_raster_bytes(payload: &RasterPayload, mode: RasterCommand) -> Result<Vec<u8>, String> {
    match mode {
        RasterCommand::GsV0 => build_escpos_raster_bytes(payload),
        RasterCommand::EscStar => build_escpos_raster_escstar(payload),
    }
}

fn make_filled_square_raster(size: u32) -> RasterPayload {
    let row_bytes = ((size + 7) / 8) as usize;
    let mut rows = vec![0u8; row_bytes * size as usize];
    for y in 0..size {
        for x in 0..size {
            let byte_index = y as usize * row_bytes + (x as usize >> 3);
            let bit_pos = 7 - (x as usize & 7);
            rows[byte_index] |= 1 << bit_pos;
        }
    }
    RasterPayload {
        width_dots: size,
        height: size,
        rows,
    }
}

const FEED_AND_CUT_LEN: usize = 8;

fn raster_body_without_init_and_cut(full: &[u8], trailing_extra: usize) -> &[u8] {
    let start = if full.len() >= 2 && full[0] == 0x1b && full[1] == b'@' {
        2
    } else {
        0
    };
    let end = full.len().saturating_sub(FEED_AND_CUT_LEN + trailing_extra);
    &full[start..end.max(start)]
}

/// Small diagnostic slip: ASCII lines + GS v 0 square + ESC * square.
pub fn build_selftest_bytes() -> Result<Vec<u8>, String> {
    let square = make_filled_square_raster(80);
    let mut buf = Vec::new();
    buf.extend_from_slice(b"\x1b@");
    buf.extend_from_slice(b"\x1ba\x01");
    buf.extend_from_slice(b"=== PRINTER SELF TEST ===\n");
    buf.extend_from_slice(b"\x1ba\x00");
    buf.extend_from_slice(b"ASCII: SELF TEST 123 ABC\n");
    buf.extend_from_slice(b"If you see garbage below, try ESC * mode.\n\n");
    buf.extend_from_slice(b"--- GS v 0 square (80x80) ---\n");
    let gsv0 = build_escpos_raster_bytes(&square)?;
    buf.extend_from_slice(raster_body_without_init_and_cut(&gsv0, 0));
    buf.extend_from_slice(b"\n--- ESC * square (80x80) ---\n");
    let esc = build_escpos_raster_escstar(&square)?;
    // ESC * path ends with ESC 2 before feed/cut.
    buf.extend_from_slice(raster_body_without_init_and_cut(&esc, 2));
    append_feed_and_cut(&mut buf);
    Ok(buf)
}

async fn send_raw_escpos(
    buf: &[u8],
    connection_type: &str,
    ip: Option<&str>,
    port: Option<u16>,
    printer_name: Option<&str>,
) -> Result<(), String> {
    if connection_type.eq_ignore_ascii_case("usb") {
        let name = printer_name
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .ok_or_else(|| "USB printer name is required for printing".to_string())?;
        return send_raw_to_usb_printer(name, buf).await;
    }

    let ip = ip
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .ok_or_else(|| "Printer IP is required for network printing".to_string())?;
    let port = port.unwrap_or(9100);
    send_raw_to_network_printer(ip, port, buf).await
}

pub async fn print_escpos_raster(
    payload: RasterPayload,
    mode: RasterCommand,
    connection_type: &str,
    ip: Option<&str>,
    port: Option<u16>,
    printer_name: Option<&str>,
) -> Result<(), String> {
    let buf = build_raster_bytes(&payload, mode)?;
    send_raw_escpos(&buf, connection_type, ip, port, printer_name).await
}

pub async fn print_selftest(
    connection_type: &str,
    ip: Option<&str>,
    port: Option<u16>,
    printer_name: Option<&str>,
) -> Result<(), String> {
    let buf = build_selftest_bytes()?;
    send_raw_escpos(&buf, connection_type, ip, port, printer_name).await
}
