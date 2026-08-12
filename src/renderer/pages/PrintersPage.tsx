import React, { useEffect, useState } from 'react';
import {
  Printer,
  Search,
  Plus,
  Trash2,
  Loader2,
  Wifi,
  Usb,
  Check,
  AlertCircle,
  HelpCircle,
  Play,
} from 'lucide-react';
import type { PrinterConfig, UsbPrinterInfo } from '../../shared/types';
import { useAppStore } from '../store/appStore';

// Access window.electronAPI safely
const getApi = () => {
  return window.electronAPI || (window as any).electronAPI;
};

export function PrintersPage() {
  const [printers, setPrinters] = useState<PrinterConfig[]>([]);
  const [scanning, setScanning] = useState(false);
  const [scannedIps, setScannedIps] = useState<string[]>([]);
  const [scanningUsb, setScanningUsb] = useState(false);
  const [usbPrinters, setUsbPrinters] = useState<UsbPrinterInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [printingKey, setPrintingKey] = useState<string | null>(null);
  
  const { addLogEntry, serverIp } = useAppStore();

  useEffect(() => {
    loadPrintersConfig();
  }, []);

  const loadPrintersConfig = async () => {
    try {
      setLoading(true);
      const api = getApi();
      if (api) {
        const config = await api.getPrintersConfig();
        setPrinters(config || []);
      }
    } catch (err: any) {
      setError('Failed to load printer configurations.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const savePrintersConfig = async (updatedPrinters: PrinterConfig[]) => {
    try {
      const api = getApi();
      if (api) {
        await api.savePrintersConfig(updatedPrinters);
        showSuccessMessage('Configurations saved');
      }
    } catch (err: any) {
      setError('Failed to save printer configurations.');
      console.error(err);
    }
  };

  const showSuccessMessage = (msg: string) => {
    setSuccess(msg);
    setTimeout(() => setSuccess(null), 3000);
  };

  const handleScan = async () => {
    if (scanning) return;
    setScanning(true);
    setError(null);
    setScannedIps([]);
    try {
      const api = getApi();
      if (api) {
        const results = await api.scanNetworkPrinters();
        setScannedIps(results || []);
        if (!results || results.length === 0) {
          showSuccessMessage('Scan complete: No printers detected on port 9100');
        } else {
          showSuccessMessage(`Scan complete: Found ${results.length} printer(s)`);
        }
      }
    } catch (err: any) {
      setError(err?.message || err || 'Network scan failed');
    } finally {
      setScanning(false);
    }
  };

  const handleUsbScan = async () => {
    if (scanningUsb) return;
    setScanningUsb(true);
    setError(null);
    setUsbPrinters([]);
    try {
      const api = getApi();
      if (api?.discoverUsbPrinters) {
        const results = await api.discoverUsbPrinters();
        setUsbPrinters(results || []);
        if (!results || results.length === 0) {
          showSuccessMessage('USB scan complete: No USB printers detected');
        } else {
          showSuccessMessage(`USB scan complete: Found ${results.length} printer(s)`);
        }
      } else {
        setError('USB printer discovery is not available in this build.');
      }
    } catch (err: any) {
      setError(err?.message || err || 'USB printer discovery failed');
    } finally {
      setScanningUsb(false);
    }
  };

  const handleAddPrinter = () => {
    let defaultIpPrefix = '';
    if (serverIp && serverIp !== '...' && serverIp !== '127.0.0.1') {
      const parts = serverIp.split('.');
      if (parts.length === 4) {
        defaultIpPrefix = `${parts.slice(0, 3).join('.')}.`;
      }
    }

    const newPrinter: PrinterConfig = {
      name: `Printer-${printers.length + 1}`,
      ip: defaultIpPrefix, // Start blank or with detected active LAN subnet prefix
      port: 9100,
      width: '80mm',
      connectionType: 'network',
    };
    const updated = [...printers, newPrinter];
    setPrinters(updated);
    savePrintersConfig(updated);
  };

  const handleQuickAdd = (ip: string) => {
    // Check if already added
    if (printers.some((p) => p.ip === ip)) {
      setError(`Printer with IP ${ip} is already configured.`);
      return;
    }
    const suffix = ip.split('.').pop() || 'Net';
    const newPrinter: PrinterConfig = {
      name: `Printer-${suffix}`,
      ip,
      port: 9100,
      width: '80mm',
      connectionType: 'network',
    };
    const updated = [...printers, newPrinter];
    setPrinters(updated);
    savePrintersConfig(updated);
    // Remove from scanned list
    setScannedIps(scannedIps.filter((item) => item !== ip));
  };

  const handleQuickAddUsb = (usb: UsbPrinterInfo) => {
    if (printers.some((p) => p.connectionType === 'usb' && p.usbPortName === usb.portName)) {
      setError(`USB printer on ${usb.portName} is already configured.`);
      return;
    }
    const newPrinter: PrinterConfig = {
      name: usb.name,
      ip: '',
      port: 0,
      width: '80mm',
      connectionType: 'usb',
      usbPortName: usb.portName,
    };
    const updated = [...printers, newPrinter];
    setPrinters(updated);
    savePrintersConfig(updated);
    setUsbPrinters(usbPrinters.filter((item) => item.portName !== usb.portName));
  };

  const handleRemovePrinter = (index: number) => {
    const updated = printers.filter((_, i) => i !== index);
    setPrinters(updated);
    savePrintersConfig(updated);
  };

  const handleUpdateField = (index: number, field: keyof PrinterConfig, value: any) => {
    const updated = [...printers];
    updated[index] = {
      ...updated[index],
      [field]: field === 'port' ? parseInt(value) || 0 : value,
    };
    setPrinters(updated);
  };

  const handleFieldBlur = () => {
    savePrintersConfig(printers);
  };

  const printerKey = (printer: PrinterConfig, index: number) =>
    printer.connectionType === 'usb'
      ? `usb:${printer.usbPortName || printer.name}:${index}`
      : `net:${printer.ip}:${index}`;

  const handleTestPrint = async (printer: PrinterConfig, index: number) => {
    if (printingKey) return;
    const key = printerKey(printer, index);
    setPrintingKey(key);
    setError(null);
    try {
      const api = getApi();
      if (api) {
        await api.printReceipt({
          width: printer.width,
          connectionType: printer.connectionType === 'usb' ? 'usb' : 'network',
          ip: printer.ip || undefined,
          port: printer.port || undefined,
          name: printer.name,
        });
        showSuccessMessage(`Test receipt sent to ${printer.name}`);
      }
    } catch (err: any) {
      setError(`Print failed: ${err?.message || err}`);
    } finally {
      setPrintingKey(null);
    }
  };

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto max-w-4xl px-6 py-8 space-y-8">
        
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
              <Printer className="h-6 w-6 text-primary" />
              Thermal Printers
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              Discover USB-attached printers and LAN ESC/POS devices on port 9100
            </p>
          </div>
          
          <div className="flex items-center gap-2">
            {success && (
              <span className="flex items-center gap-1.5 rounded bg-primary-light border border-primary/25 px-3 py-1 text-xs font-semibold text-primary animate-fade-in transition-all">
                <Check className="h-3.5 w-3.5" />
                {success}
              </span>
            )}
            {error && (
              <span className="flex items-center gap-1.5 rounded bg-rose-50 border border-rose-200 px-3 py-1 text-xs font-semibold text-rose-600">
                <AlertCircle className="h-3.5 w-3.5" />
                {error}
              </span>
            )}
          </div>
        </div>

        {/* USB Scanner Card */}
        <div className="rounded-xl border border-slate-200 bg-surface-card p-6 space-y-4 shadow-sm">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <h2 className="text-base font-semibold text-slate-800 flex items-center gap-2">
                <Usb className="h-4.5 w-4.5 text-primary" />
                USB Auto-Discovery
              </h2>
              <p className="text-xs text-slate-500">
                Detect printers plugged directly into this machine (Windows USB00x ports or CUPS usb:// devices).
              </p>
            </div>
            
            <button
              onClick={handleUsbScan}
              disabled={scanningUsb}
              className="flex items-center gap-2 rounded-lg bg-primary hover:bg-primary-hover disabled:bg-primary/50 text-white px-4 py-2 text-sm font-medium transition-colors shadow-md shadow-primary/10"
            >
              {scanningUsb ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Scanning USB...
                </>
              ) : (
                <>
                  <Usb className="h-4 w-4" />
                  Detect USB Printers
                </>
              )}
            </button>
          </div>

          {scanningUsb && (
            <div className="flex items-center justify-center p-8 rounded-lg bg-surface-muted border border-slate-200">
              <div className="flex flex-col items-center gap-2 text-slate-500">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <span className="text-sm font-medium">Querying OS printer list...</span>
                <span className="text-xs text-slate-400">Filtering for USB-connected devices</span>
              </div>
            </div>
          )}

          {!scanningUsb && usbPrinters.length > 0 && (
            <div className="space-y-2 animate-fade-in">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                Discovered USB Printers
              </span>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {usbPrinters.map((usb) => (
                  <div
                    key={usb.portName}
                    className="flex items-center justify-between rounded-lg border border-slate-200 bg-surface-muted/50 px-4 py-3 hover:border-primary/50 transition-colors"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="h-8 w-8 rounded bg-primary-light text-primary flex items-center justify-center shrink-0">
                        <Usb className="h-4.5 w-4.5" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-slate-800 truncate">{usb.name}</p>
                        <p className="text-xs text-slate-500 font-mono truncate">{usb.portName}</p>
                      </div>
                    </div>
                    
                    <button
                      onClick={() => handleQuickAddUsb(usb)}
                      className="flex items-center gap-1 text-xs font-semibold text-primary hover:text-primary-hover bg-primary/10 hover:bg-primary/20 px-2.5 py-1.5 rounded transition-all shrink-0 ml-2"
                    >
                      <Plus className="h-3 w-3" />
                      Add Setup
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {!scanningUsb && usbPrinters.length === 0 && !loading && (
            <div className="rounded-lg bg-surface-muted border border-slate-200 p-4 text-center">
              <span className="text-xs text-slate-400">
                Plug in a USB printer, install its OS driver if needed, then click Detect USB Printers.
              </span>
            </div>
          )}
        </div>

        {/* LAN Scanner Card */}
        <div className="rounded-xl border border-slate-200 bg-surface-card p-6 space-y-4 shadow-sm">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <h2 className="text-base font-semibold text-slate-800 flex items-center gap-2">
                <Search className="h-4.5 w-4.5 text-primary" />
                LAN Auto-Discovery
              </h2>
              <p className="text-xs text-slate-500">
                Scan your local subnet for ESC/POS thermal printers listening on standard port 9100.
              </p>
            </div>
            
            <button
              onClick={handleScan}
              disabled={scanning}
              className="flex items-center gap-2 rounded-lg bg-primary hover:bg-primary-hover disabled:bg-primary/50 text-white px-4 py-2 text-sm font-medium transition-colors shadow-md shadow-primary/10"
            >
              {scanning ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Scanning Subnet...
                </>
              ) : (
                <>
                  <Search className="h-4 w-4" />
                  Scan Subnet
                </>
              )}
            </button>
          </div>

          {/* Scanned Results */}
          {scanning && (
            <div className="flex items-center justify-center p-8 rounded-lg bg-surface-muted border border-slate-200">
              <div className="flex flex-col items-center gap-2 text-slate-500">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <span className="text-sm font-medium">Scanning all local addresses (1-254)...</span>
                <span className="text-xs text-slate-400">Checking TCP port 9100 responses</span>
              </div>
            </div>
          )}

          {!scanning && scannedIps.length > 0 && (
            <div className="space-y-2 animate-fade-in">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                Discovered Printers
              </span>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {scannedIps.map((ip) => (
                  <div
                    key={ip}
                    className="flex items-center justify-between rounded-lg border border-slate-200 bg-surface-muted/50 px-4 py-3 hover:border-primary/50 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div className="h-8 w-8 rounded bg-primary-light text-primary flex items-center justify-center">
                        <Wifi className="h-4.5 w-4.5" />
                      </div>
                      <div>
                        <p className="text-sm font-mono text-slate-800">{ip}</p>
                        <p className="text-xs text-slate-500">Port: 9100</p>
                      </div>
                    </div>
                    
                    <button
                      onClick={() => handleQuickAdd(ip)}
                      className="flex items-center gap-1 text-xs font-semibold text-primary hover:text-primary-hover bg-primary/10 hover:bg-primary/20 px-2.5 py-1.5 rounded transition-all"
                    >
                      <Plus className="h-3 w-3" />
                      Add Setup
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {!scanning && scannedIps.length === 0 && !loading && (
            <div className="rounded-lg bg-surface-muted border border-slate-200 p-4 text-center">
              <span className="text-xs text-slate-400">
                Subnet scanner ready. Make sure your printer is turned on and connected to the same Wi-Fi network.
              </span>
            </div>
          )}
        </div>

        {/* Configured Printers */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
              <Printer className="h-5 w-5 text-primary" />
              Connected Devices Setup
            </h2>
            
            <button
              onClick={handleAddPrinter}
              className="flex items-center gap-1.5 text-xs font-semibold text-primary hover:text-primary-hover border border-primary/30 hover:border-primary/50 px-3 py-1.5 rounded-lg transition-all"
            >
              <Plus className="h-3.5 w-3.5" />
              Add Manually
            </button>
          </div>

          {loading ? (
            <div className="flex items-center justify-center p-12">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : printers.length === 0 ? (
            <div className="rounded-xl border border-slate-200 bg-surface-muted/50 p-8 text-center text-slate-400">
              <Printer className="h-10 w-10 mx-auto text-slate-300 mb-3" />
              <p className="text-sm font-medium">No printers configured yet</p>
              <p className="text-xs text-slate-500 mt-1">Detect USB, scan the subnet, or click Add Manually to set up a printer.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {printers.map((printer, index) => {
                const isUsb = printer.connectionType === 'usb';
                return (
                <div
                  key={index}
                  className="rounded-xl border border-slate-200 bg-surface-card p-5 space-y-4 hover:border-primary/30 shadow-sm transition-colors"
                >
                  <div className="flex flex-col md:flex-row gap-4 items-start md:items-center justify-between">
                    
                    {/* Inputs */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 flex-1 w-full">
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-slate-400 uppercase">Printer Name</label>
                        <input
                          type="text"
                          value={printer.name}
                          onChange={(e) => handleUpdateField(index, 'name', e.target.value)}
                          onBlur={handleFieldBlur}
                          placeholder="e.g. Kitchen"
                          className="w-full text-sm rounded bg-surface-card border border-slate-200 px-3 py-1.5 text-slate-800 focus:outline-none focus:border-primary transition-colors focus:ring-1 focus:ring-primary"
                        />
                      </div>
                      
                      {isUsb ? (
                        <div className="space-y-1 col-span-2">
                          <label className="text-[10px] font-bold text-slate-400 uppercase">USB Port</label>
                          <div className="flex items-center gap-2 w-full text-sm font-mono rounded bg-surface-muted border border-slate-200 px-3 py-1.5 text-slate-700">
                            <Usb className="h-3.5 w-3.5 text-primary shrink-0" />
                            <span className="truncate">{printer.usbPortName || 'USB'}</span>
                          </div>
                        </div>
                      ) : (
                        <>
                          <div className="space-y-1">
                            <label className="text-[10px] font-bold text-slate-400 uppercase">IP Address</label>
                            <input
                              type="text"
                              value={printer.ip}
                              onChange={(e) => handleUpdateField(index, 'ip', e.target.value)}
                              onBlur={handleFieldBlur}
                              placeholder="e.g. 192.168.1.100"
                              className="w-full text-sm font-mono rounded bg-surface-card border border-slate-200 px-3 py-1.5 text-slate-800 focus:outline-none focus:border-primary transition-colors focus:ring-1 focus:ring-primary"
                            />
                          </div>

                          <div className="space-y-1">
                            <label className="text-[10px] font-bold text-slate-400 uppercase">TCP Port</label>
                            <input
                              type="number"
                              value={printer.port || ''}
                              onChange={(e) => handleUpdateField(index, 'port', e.target.value)}
                              onBlur={handleFieldBlur}
                              placeholder="9100"
                              className="w-full text-sm font-mono rounded bg-surface-card border border-slate-200 px-3 py-1.5 text-slate-800 focus:outline-none focus:border-primary transition-colors focus:ring-1 focus:ring-primary"
                            />
                          </div>
                        </>
                      )}

                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-slate-400 uppercase">Paper Width</label>
                        <select
                          value={printer.width}
                          onChange={(e) => {
                            handleUpdateField(index, 'width', e.target.value);
                            savePrintersConfig([
                              ...printers.slice(0, index),
                              { ...printer, width: e.target.value as any },
                              ...printers.slice(index + 1),
                            ]);
                          }}
                          className="w-full text-sm rounded bg-surface-card border border-slate-200 px-3 py-1.5 text-slate-800 focus:outline-none focus:border-primary transition-colors focus:ring-1 focus:ring-primary"
                        >
                          <option value="58mm">58mm (2 ¼″)</option>
                          <option value="80mm">80mm (3 ⅛″)</option>
                          <option value="110mm">110mm (4 ⅜″)</option>
                        </select>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2 shrink-0 w-full md:w-auto justify-end pt-2 md:pt-0">
                      <button
                        onClick={() => handleTestPrint(printer, index)}
                        disabled={printingKey !== null}
                        className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold rounded bg-primary-light text-primary hover:bg-primary/15 disabled:opacity-50 transition-all border border-primary/25"
                        title="Send test receipt"
                      >
                        {printingKey === printerKey(printer, index) ? (
                          <>
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            Printing...
                          </>
                        ) : (
                          <>
                            <Play className="h-3 w-3 fill-current" />
                            Print Bill
                          </>
                        )}
                      </button>

                      <button
                        onClick={() => handleRemovePrinter(index)}
                        className="p-2 text-slate-400 hover:text-rose-600 bg-surface-muted hover:bg-rose-50 rounded border border-slate-200 hover:border-rose-200 transition-all"
                        title="Remove setup"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>

                  </div>
                </div>
              );
              })}
            </div>
          )}
        </div>

        {/* Helper info */}
        <div className="rounded-xl border border-slate-200 bg-surface-muted/50 p-5 space-y-3">
          <h2 className="text-sm font-semibold text-slate-800 flex items-center gap-1.5">
            <HelpCircle className="h-4 w-4 text-primary" />
            Printer Discovery Info
          </h2>
          <p className="text-xs text-slate-600 leading-relaxed">
            <b>USB</b> and <b>Network</b> printers both print the same ESC/POS receipt.
            USB jobs go through the OS queue as RAW data (Windows spooler / CUPS <code className="text-[11px]">lp -o raw</code>).
            Network jobs send the same bytes over TCP port <b>9100</b>.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-[11px] text-slate-500 pt-1">
            <div className="border border-slate-200 rounded p-2.5 bg-surface-card">
              <span className="font-bold text-slate-800 block mb-0.5">58mm Presets</span>
              Used on handheld cards or small mobile receipt engines. Layout wraps to 32 characters.
            </div>
            <div className="border border-slate-200 rounded p-2.5 bg-surface-card">
              <span className="font-bold text-slate-800 block mb-0.5">80mm Presets</span>
              Industry standard desktop billing/restaurant receipt size. Layout wraps to 48 characters.
            </div>
            <div className="border border-slate-200 rounded p-2.5 bg-surface-card">
              <span className="font-bold text-slate-800 block mb-0.5">110mm Presets</span>
              Wide labels or medical print hardware layout. Wraps to 64 characters.
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
