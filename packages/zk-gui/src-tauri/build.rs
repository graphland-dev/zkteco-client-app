fn main() {
  // MinGW exports every symbol from static libs into cdylibs, which exceeds the
  // PE/COFF 65535 export ordinal limit. MSVC does not have this problem.
  #[cfg(all(windows, target_env = "gnu"))]
  println!("cargo::rustc-link-arg=-Wl,--exclude-libs=ALL,--exclude-all-symbols");

  tauri_build::build()
}
