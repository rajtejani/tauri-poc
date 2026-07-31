use std::net::{IpAddr, Ipv4Addr, SocketAddr};
use std::path::PathBuf;
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

/// Print formatted receipt to specified printer IP and Port using ESC/POS commands
pub async fn print_escpos_receipt(ip: &str, port: u16, width: &str) -> Result<(), String> {
    let addr: SocketAddr = format!("{ip}:{port}")
        .parse()
        .map_err(|e| format!("Invalid printer address '{ip}:{port}': {e}"))?;

    // Determine line width character limit based on page width
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

    // Order Details Header
    let now = chrono::Local::now().format("%Y-%m-%d %H:%M").to_string();
    
    // We can lay out metadata dynamically according to width
    if line_width >= 48 {
        buf.extend_from_slice(format_line("Order: #8792", "Table: 14", line_width).as_bytes());
        buf.extend_from_slice(b"\n");
        buf.extend_from_slice(format_line(&format!("Date: {now}"), "Guests: 3", line_width).as_bytes());
        buf.extend_from_slice(b"\n");
        buf.extend_from_slice(format!("Server: Jessica (Active Host)\n").as_bytes());
    } else {
        // Narrow page (58mm)
        buf.extend_from_slice(format!("Order: #8792      Table: 14\n").as_bytes());
        buf.extend_from_slice(format!("Date: {}\n", now).as_bytes());
        buf.extend_from_slice(format!("Server: Jessica   Guests: 3\n").as_bytes());
    }

    // Divider line
    let divider = "=".repeat(line_width) + "\n";
    buf.extend_from_slice(divider.as_bytes());

    // Table Header
    buf.extend_from_slice(format_line("Item Description", "Amount", line_width).as_bytes());
    buf.extend_from_slice(b"\n");
    
    let sub_divider = "-".repeat(line_width) + "\n";
    buf.extend_from_slice(sub_divider.as_bytes());

    // Restaurant Items
    buf.extend_from_slice(format_line("1x Large Pepperoni Pizza", "300.00", line_width).as_bytes());
    buf.extend_from_slice(b"\n");
    buf.extend_from_slice(format_line("1x Garlic Bread Crust", "230.00", line_width).as_bytes());
    buf.extend_from_slice(b"\n");
    buf.extend_from_slice(format_line("3x Fountain Soft Drinks", "600.00", line_width).as_bytes());
    buf.extend_from_slice(b"\n");
    buf.extend_from_slice(format_line("1x Classic Tiramisu Dessert", "400.00", line_width).as_bytes());
    buf.extend_from_slice(b"\n");

    buf.extend_from_slice(sub_divider.as_bytes());

    // Totals
    buf.extend_from_slice(format_line("Subtotal", "1530.00", line_width).as_bytes());
    buf.extend_from_slice(b"\n");
    buf.extend_from_slice(format_line("Tax (8.25%)", "150.00", line_width).as_bytes());
    buf.extend_from_slice(b"\n");
    
    // Total (Bold: ESC E 1)
    buf.extend_from_slice(b"\x1bE\x01");
    buf.extend_from_slice(format_line("Total Due", "1680.00", line_width).as_bytes());
    buf.extend_from_slice(b"\n");
    buf.extend_from_slice(b"\x1bE\x00");

    buf.extend_from_slice(divider.as_bytes());

    // 5. Center align: ESC a 1
    buf.extend_from_slice(b"\x1ba\x01");
    buf.extend_from_slice(b"Thank you for dining with us!\n");
    buf.extend_from_slice(b"Please pay at the front counter.\n");
    buf.extend_from_slice(b"==============================\n");

    // 6. Feed and cut paper: ESC d 4 (feed 4 lines) + GS V 66 0 (cut)
    buf.extend_from_slice(b"\n\n\n\n\x1dVB\x00");

    // Connect to printer socket
    let mut stream = timeout(Duration::from_secs(5), TcpStream::connect(addr))
        .await
        .map_err(|_| format!("Connection to printer {ip}:{port} timed out"))?
        .map_err(|e| format!("Failed to connect to printer: {e}"))?;

    // Write buffer to stream
    stream.write_all(&buf)
        .await
        .map_err(|e| format!("Failed to send print bytes: {e}"))?;

    stream.flush()
        .await
        .map_err(|e| format!("Failed to flush printer stream: {e}"))?;

    Ok(())
}
