//! Background mode: system tray icon, keep running when closed, a global
//! "summon" shortcut, window modes (normal / fullscreen / background) and
//! start at login. Options come from the frontend's Settings via
//! `set_background_options`.

use serde::Deserialize;
use std::sync::Mutex;
use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Manager, Runtime, State, WebviewWindow, Window, WindowEvent,
};
use tauri_plugin_autostart::ManagerExt as _;
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};

#[derive(Clone, Copy, PartialEq, Eq, Debug, Default)]
pub enum WindowMode {
    #[default]
    Normal,
    /// Fullscreen on top, like a normal app
    Fullscreen,
    /// Fullscreen, kept behind other windows; the summon shortcut brings it forward
    Background,
}

impl WindowMode {
    fn parse(s: &str) -> Self {
        match s {
            "fullscreen" => Self::Fullscreen,
            "background" => Self::Background,
            _ => Self::Normal,
        }
    }
}

pub struct BackgroundConfig {
    close_to_tray: bool,
    mode: WindowMode,
    summon: Option<Shortcut>,
}

/// Managed state. Before the frontend sends its settings, closing hides to the tray.
pub struct BackgroundState(Mutex<BackgroundConfig>);

impl Default for BackgroundState {
    fn default() -> Self {
        Self(Mutex::new(BackgroundConfig { close_to_tray: true, mode: WindowMode::Normal, summon: None }))
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BackgroundOptions {
    close_to_tray: bool,
    window_mode: String,
    /// Canopy combo format ("Mod+Shift+Space"); None disables the shortcut
    summon_shortcut: Option<String>,
    launch_at_login: bool,
}

/// Convert a Canopy combo ("Mod+Shift+Space", "Alt+,") into an accelerator
/// string the global-shortcut plugin understands ("CommandOrControl+Shift+Space").
pub fn to_accelerator(combo: &str) -> String {
    combo
        .split('+')
        .map(|part| match part {
            "Mod" => "CommandOrControl",
            "Ctrl" => "Control",
            "," => "Comma",
            "." => "Period",
            "/" => "Slash",
            "\\" => "Backslash",
            ";" => "Semicolon",
            "'" => "Quote",
            "[" => "BracketLeft",
            "]" => "BracketRight",
            "-" => "Minus",
            "=" => "Equal",
            "`" => "Backquote",
            other => other,
        })
        .collect::<Vec<_>>()
        .join("+")
}

fn main_window<R: Runtime>(app: &AppHandle<R>) -> Option<WebviewWindow<R>> {
    app.get_webview_window("main")
}

fn current_mode<R: Runtime>(app: &AppHandle<R>) -> WindowMode {
    snapshot(app).1
}

fn apply_mode<R: Runtime>(window: &WebviewWindow<R>, mode: WindowMode) {
    let _ = window.set_fullscreen(mode != WindowMode::Normal);
    let _ = window.set_always_on_bottom(mode == WindowMode::Background);
}

/// Bring the window up and focus it (in background mode: in front, until it loses focus).
pub fn show_window<R: Runtime>(app: &AppHandle<R>) {
    let Some(w) = main_window(app) else { return };
    if current_mode(app) == WindowMode::Background {
        let _ = w.set_always_on_bottom(false);
    }
    let _ = w.show();
    let _ = w.unminimize();
    let _ = w.set_focus();
}

/// Background mode: move behind other windows and give keyboard focus back
/// to the app you were using, so you can keep typing where you were.
fn send_behind<R: Runtime>(w: &WebviewWindow<R>) {
    let _ = w.set_always_on_bottom(true);
    #[cfg(windows)]
    if let Ok(h) = w.hwnd() {
        if let Some(target) = win32::topmost_other_app_window(h.0 as _) {
            win32::activate(target);
        }
    }
}

#[cfg(windows)]
mod win32 {
    use windows_sys::Win32::Foundation::HWND;
    use windows_sys::Win32::Graphics::Dwm::{DwmGetWindowAttribute, DWMWA_CLOAKED};
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        GetTopWindow, GetWindow, GetWindowLongW, GetWindowTextLengthW, IsIconic, IsWindowVisible,
        SetForegroundWindow, GWL_EXSTYLE, GW_HWNDNEXT, WS_EX_TOOLWINDOW,
    };

    /// The highest normal, visible app window in the z-order that isn't `ours`.
    /// (In background mode Canopy already sits at the bottom, so "the window
    /// below" doesn't exist; this finds what you were looking at instead.)
    pub fn topmost_other_app_window(ours: HWND) -> Option<HWND> {
        // SAFETY: read-only Win32 queries on window handles; invalid handles return null/0
        unsafe {
            let mut h = GetTopWindow(std::ptr::null_mut());
            while !h.is_null() {
                if h != ours && is_app_window(h) {
                    return Some(h);
                }
                h = GetWindow(h, GW_HWNDNEXT);
            }
        }
        None
    }

    unsafe fn is_app_window(h: HWND) -> bool {
        let ex = GetWindowLongW(h, GWL_EXSTYLE) as u32;
        let mut cloaked: u32 = 0;
        // Cloaked = kept by Windows but not shown (e.g. suspended UWP apps)
        let _ = DwmGetWindowAttribute(
            h,
            DWMWA_CLOAKED as u32,
            &mut cloaked as *mut u32 as *mut _,
            std::mem::size_of::<u32>() as u32,
        );
        IsWindowVisible(h) != 0
            && IsIconic(h) == 0
            && ex & WS_EX_TOOLWINDOW == 0
            && GetWindowTextLengthW(h) > 0
            && cloaked == 0
    }

    pub fn activate(hwnd: HWND) {
        // SAFETY: we're the foreground process here, so Windows allows the switch
        unsafe {
            SetForegroundWindow(hwnd);
        }
    }
}

/// Summon / dismiss: hidden or unfocused -> show and focus; focused -> hide
/// (or, in background mode, send it back behind the other windows).
pub fn toggle_window<R: Runtime>(app: &AppHandle<R>) {
    let Some(w) = main_window(app) else { return };
    let visible = w.is_visible().unwrap_or(false) && !w.is_minimized().unwrap_or(false);
    let focused = w.is_focused().unwrap_or(false);
    if visible && focused {
        if current_mode(app) == WindowMode::Background {
            send_behind(&w);
        } else {
            let _ = w.hide();
        }
    } else {
        show_window(app);
    }
}

/// Copy of the options needed by event handlers. Never hold the lock while
/// calling window APIs: they can fire window events synchronously, which
/// would re-enter `on_window_event` and deadlock on the same mutex.
fn snapshot<R: Runtime>(app: &AppHandle<R>) -> (bool, WindowMode) {
    app.state::<BackgroundState>()
        .0
        .lock()
        .map(|c| (c.close_to_tray, c.mode))
        .unwrap_or((true, WindowMode::Normal))
}

/// Window events: close hides to the tray; in background mode, losing focus
/// sends the window behind the others again.
pub fn on_window_event<R: Runtime>(window: &Window<R>, event: &WindowEvent) {
    let (close_to_tray, mode) = snapshot(window.app_handle());
    match event {
        WindowEvent::CloseRequested { api, .. } if close_to_tray => {
            api.prevent_close();
            let _ = window.hide();
        }
        WindowEvent::Focused(false) if mode == WindowMode::Background => {
            let _ = window.set_always_on_bottom(true);
        }
        _ => {}
    }
}

/// Tray icon with Show/Hide and Quit; left click toggles the window.
pub fn create_tray<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<()> {
    let toggle = MenuItem::with_id(app, "toggle", "Show / hide Canopy", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Quit Canopy", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&toggle, &PredefinedMenuItem::separator(app)?, &quit])?;

    let mut tray = TrayIconBuilder::with_id("canopy")
        .tooltip("Canopy")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "toggle" => toggle_window(app),
            "quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = event {
                toggle_window(tray.app_handle());
            }
        });
    if let Some(icon) = app.default_window_icon() {
        tray = tray.icon(icon.clone());
    }
    tray.build(app)?;
    Ok(())
}

/// Apply the background settings from the frontend.
#[tauri::command]
pub fn set_background_options(
    app: AppHandle,
    state: State<BackgroundState>,
    options: BackgroundOptions,
) -> Result<(), String> {
    let mode = WindowMode::parse(&options.window_mode);
    let new_summon = match options.summon_shortcut.as_deref() {
        Some(combo) if !combo.is_empty() => Some(
            to_accelerator(combo)
                .parse::<Shortcut>()
                .map_err(|e| format!("Invalid shortcut {}: {}", combo, e))?,
        ),
        _ => None,
    };

    // Update the config under the lock, then release it before touching the
    // window (see `snapshot` for why)
    let (old_summon, mode_changed) = {
        let mut cfg = state.0.lock().map_err(|e| e.to_string())?;
        cfg.close_to_tray = options.close_to_tray;
        let mode_changed = cfg.mode != mode;
        cfg.mode = mode;
        (std::mem::replace(&mut cfg.summon, new_summon), mode_changed)
    };
    if mode_changed {
        if let Some(w) = main_window(&app) {
            apply_mode(&w, mode);
        }
    }

    // Re-register the global shortcut only if it changed
    let shortcuts = app.global_shortcut();
    if old_summon != new_summon {
        if let Some(old) = old_summon {
            let _ = shortcuts.unregister(old);
        }
        if let Some(new) = new_summon {
            if let Err(e) = shortcuts.register(new) {
                // Keep state consistent: nothing is registered now
                if let Ok(mut cfg) = state.0.lock() {
                    cfg.summon = None;
                }
                return Err(format!(
                    "Couldn't register the summon shortcut (another app may be using it): {}",
                    e
                ));
            }
        }
    }

    // Start at login
    let autostart = app.autolaunch();
    let enabled = autostart.is_enabled().unwrap_or(false);
    if options.launch_at_login && !enabled {
        autostart.enable().map_err(|e| format!("Couldn't enable start at login: {}", e))?;
    } else if !options.launch_at_login && enabled {
        autostart.disable().map_err(|e| format!("Couldn't disable start at login: {}", e))?;
    }
    Ok(())
}

/// Quit for real (closing the window only hides it to the tray).
#[tauri::command]
pub fn quit_app(app: AppHandle) {
    app.exit(0);
}

/// Global shortcut plugin: any registered shortcut toggles the window.
pub fn shortcut_plugin<R: Runtime>() -> tauri::plugin::TauriPlugin<R> {
    tauri_plugin_global_shortcut::Builder::new()
        .with_handler(|app, _shortcut, event| {
            if event.state() == ShortcutState::Pressed {
                toggle_window(app);
            }
        })
        .build()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn converts_combos_to_accelerators() {
        assert_eq!(to_accelerator("Mod+Shift+Space"), "CommandOrControl+Shift+Space");
        assert_eq!(to_accelerator("Alt+,"), "Alt+Comma");
        assert_eq!(to_accelerator("Mod+\\"), "CommandOrControl+Backslash");
        assert_eq!(to_accelerator("F9"), "F9");
        assert_eq!(to_accelerator("Mod+Ctrl+K"), "CommandOrControl+Control+K");
    }

    #[test]
    fn converted_accelerators_parse() {
        for combo in ["Mod+Shift+Space", "Alt+,", "Mod+\\", "F9", "Mod+Alt+K", "Mod+Shift+1"] {
            let acc = to_accelerator(combo);
            assert!(acc.parse::<Shortcut>().is_ok(), "{} -> {} should parse", combo, acc);
        }
    }

    #[test]
    fn parses_window_modes() {
        assert_eq!(WindowMode::parse("background"), WindowMode::Background);
        assert_eq!(WindowMode::parse("fullscreen"), WindowMode::Fullscreen);
        assert_eq!(WindowMode::parse("anything"), WindowMode::Normal);
    }
}
