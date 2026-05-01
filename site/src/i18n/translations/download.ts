export const download: Record<string, {
  title: string;
  subtitle: string;
  recommended: string;
  allPlatforms: string;
  version: string;
  releaseNotes: string;
  checksum: string;
  verifyTitle: string;
  verifySubtitle: string;
  verifyMinisign: string;
  verifySha256: string;
  verifyCosign: string;
  verifyAudit: string;
  copyCommand: string;
  copied: string;
  platforms: {
    windows: { name: string; description: string };
    macos: { name: string; description: string };
    linuxAppImage: { name: string; description: string };
    linuxDeb: { name: string; description: string };
    linuxFlatpak: { name: string; description: string };
    mobile: { name: string; description: string };
  };
  systemReqs: string;
  reqItems: string[];
  flatpakTitle: string;
  flatpakInstall: string;
  flatpakRun: string;
  flatpakFlathub: string;
  gpgTitle: string;
  gpgFingerprint: string;
  gpgVerify: string;
}> = {
  en: {
    title: 'Download Hotline',
    subtitle: 'Secure, encrypted crisis response software for your desktop. Verify every build.',
    recommended: 'Recommended for your system',
    allPlatforms: 'All platforms',
    version: 'Latest version',
    releaseNotes: 'Release notes',
    checksum: 'Verify checksums',
    verifyTitle: 'Verify your download',
    verifySubtitle: 'All binaries are signed offline with an Ed25519 key that never touches cloud infrastructure. Verify before you install.',
    verifyMinisign: 'Minisign signature',
    verifySha256: 'SHA-256 checksum',
    verifyCosign: 'Cosign attestation (SBOM)',
    verifyAudit: 'Full audit trail',
    copyCommand: 'Copy',
    copied: 'Copied',
    platforms: {
      windows: { name: 'Windows', description: 'Windows 10+ (64-bit) installer' },
      macos: { name: 'macOS', description: 'macOS 11+ universal binary (Intel + Apple Silicon)' },
      linuxAppImage: { name: 'Linux AppImage', description: 'Portable, runs on most distributions' },
      linuxDeb: { name: 'Linux .deb', description: 'Debian, Ubuntu, and derivatives' },
      linuxFlatpak: { name: 'Linux Flatpak', description: 'Sandboxed, auto-updating via Flathub' },
      mobile: { name: 'Mobile', description: 'Early access — Android APK and iOS TestFlight available' },
    },
    systemReqs: 'System requirements',
    reqItems: [
      'Windows 10+, macOS 11+, or Linux with WebKitGTK 4.1',
      'Network connection to your hotline server',
      '4-digit PIN for key encryption',
    ],
    flatpakTitle: 'Install via Flatpak',
    flatpakInstall: 'flatpak install flathub org.llamenos.hotline',
    flatpakRun: 'flatpak run org.llamenos.hotline',
    flatpakFlathub: 'View on Flathub',
    gpgTitle: 'GPG verification',
    gpgFingerprint: 'GPG fingerprint',
    gpgVerify: 'gpg --verify CHECKSUMS.txt.sig CHECKSUMS.txt',
  },
  es: {
    title: 'Descargar Hotline',
    subtitle: 'Software seguro y cifrado de respuesta a crisis para tu escritorio. Verifica cada compilación.',
    recommended: 'Recomendado para tu sistema',
    allPlatforms: 'Todas las plataformas',
    version: 'Ultima version',
    releaseNotes: 'Notas de la version',
    checksum: 'Verificar checksums',
    verifyTitle: 'Verifica tu descarga',
    verifySubtitle: 'Todos los binarios están firmados offline con una clave Ed25519 que nunca toca la infraestructura en la nube. Verifica antes de instalar.',
    verifyMinisign: 'Firma Minisign',
    verifySha256: 'Suma de verificación SHA-256',
    verifyCosign: 'Atestación Cosign (SBOM)',
    verifyAudit: 'Auditoría completa',
    copyCommand: 'Copiar',
    copied: 'Copiado',
    platforms: {
      windows: { name: 'Windows', description: 'Windows 10+ (64 bits) instalador' },
      macos: { name: 'macOS', description: 'macOS 11+ binario universal (Intel + Apple Silicon)' },
      linuxAppImage: { name: 'Linux AppImage', description: 'Portable, funciona en la mayoria de distribuciones' },
      linuxDeb: { name: 'Linux .deb', description: 'Debian, Ubuntu y derivados' },
      linuxFlatpak: { name: 'Linux Flatpak', description: 'Aislado, actualizacion automatica via Flathub' },
      mobile: { name: 'Movil', description: 'Acceso anticipado — APK Android y TestFlight iOS disponibles' },
    },
    systemReqs: 'Requisitos del sistema',
    reqItems: [
      'Windows 10+, macOS 11+, o Linux con WebKitGTK 4.1',
      'Conexion de red a tu servidor de linea de ayuda',
      'PIN de 4 digitos para cifrado de claves',
    ],
    flatpakTitle: 'Instalar via Flatpak',
    flatpakInstall: 'flatpak install flathub org.llamenos.hotline',
    flatpakRun: 'flatpak run org.llamenos.hotline',
    flatpakFlathub: 'Ver en Flathub',
    gpgTitle: 'Verificación GPG',
    gpgFingerprint: 'Huella GPG',
    gpgVerify: 'gpg --verify CHECKSUMS.txt.sig CHECKSUMS.txt',
  },
  zh: {
    title: '下载 Hotline',
    subtitle: '安全加密的危机响应桌面软件。验证每个构建。',
    recommended: '推荐适合您的系统',
    allPlatforms: '所有平台',
    version: '最新版本',
    releaseNotes: '发布说明',
    checksum: '验证校验和',
    verifyTitle: '验证您的下载',
    verifySubtitle: '所有二进制文件均使用从不触及云基础设施的 Ed25519 密钥离线签名。安装前请验证。',
    verifyMinisign: 'Minisign 签名',
    verifySha256: 'SHA-256 校验和',
    verifyCosign: 'Cosign 证明 (SBOM)',
    verifyAudit: '完整审计记录',
    copyCommand: '复制',
    copied: '已复制',
    platforms: {
      windows: { name: 'Windows', description: 'Windows 10+ (64位) 安装程序' },
      macos: { name: 'macOS', description: 'macOS 11+ 通用二进制 (Intel + Apple Silicon)' },
      linuxAppImage: { name: 'Linux AppImage', description: '便携式，适用于大多数发行版' },
      linuxDeb: { name: 'Linux .deb', description: 'Debian、Ubuntu 及其衍生版' },
      linuxFlatpak: { name: 'Linux Flatpak', description: '沙箱化，通过 Flathub 自动更新' },
      mobile: { name: '移动端', description: '即将推出 — iOS 和 Android 应用正在开发中' },
    },
    systemReqs: '系统要求',
    reqItems: [
      'Windows 10+、macOS 11+ 或带有 WebKitGTK 4.1 的 Linux',
      '与热线服务器的网络连接',
      '用于密钥加密的 4 位 PIN 码',
    ],
    flatpakTitle: '通过 Flatpak 安装',
    flatpakInstall: 'flatpak install flathub org.llamenos.hotline',
    flatpakRun: 'flatpak run org.llamenos.hotline',
    flatpakFlathub: '在 Flathub 上查看',
    gpgTitle: 'GPG 验证',
    gpgFingerprint: 'GPG 指纹',
    gpgVerify: 'gpg --verify CHECKSUMS.txt.sig CHECKSUMS.txt',
  },
  // Other languages fall back to English via getTranslation()
};
