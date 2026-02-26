export const download: Record<string, {
  title: string;
  subtitle: string;
  recommended: string;
  allPlatforms: string;
  version: string;
  releaseNotes: string;
  checksum: string;
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
}> = {
  en: {
    title: 'Download Hotline',
    subtitle: 'Secure, encrypted crisis response software for your desktop.',
    recommended: 'Recommended for your system',
    allPlatforms: 'All platforms',
    version: 'Latest version',
    releaseNotes: 'Release notes',
    checksum: 'Verify checksums',
    platforms: {
      windows: { name: 'Windows', description: 'Windows 10+ (64-bit) NSIS installer' },
      macos: { name: 'macOS', description: 'macOS 11+ universal binary (Intel + Apple Silicon)' },
      linuxAppImage: { name: 'Linux AppImage', description: 'Portable, runs on most distributions' },
      linuxDeb: { name: 'Linux .deb', description: 'Debian, Ubuntu, and derivatives' },
      linuxFlatpak: { name: 'Linux Flatpak', description: 'Sandboxed, auto-updating via Flathub' },
      mobile: { name: 'Mobile', description: 'Coming soon — iOS and Android apps in development' },
    },
    systemReqs: 'System requirements',
    reqItems: [
      'Windows 10+, macOS 11+, or Linux with WebKitGTK 4.1',
      'Network connection to your hotline server',
      '4-digit PIN for key encryption',
    ],
  },
  es: {
    title: 'Descargar Hotline',
    subtitle: 'Software seguro y cifrado de respuesta a crisis para tu escritorio.',
    recommended: 'Recomendado para tu sistema',
    allPlatforms: 'Todas las plataformas',
    version: 'Ultima version',
    releaseNotes: 'Notas de la version',
    checksum: 'Verificar checksums',
    platforms: {
      windows: { name: 'Windows', description: 'Windows 10+ (64 bits) instalador NSIS' },
      macos: { name: 'macOS', description: 'macOS 11+ binario universal (Intel + Apple Silicon)' },
      linuxAppImage: { name: 'Linux AppImage', description: 'Portable, funciona en la mayoria de distribuciones' },
      linuxDeb: { name: 'Linux .deb', description: 'Debian, Ubuntu y derivados' },
      linuxFlatpak: { name: 'Linux Flatpak', description: 'Aislado, actualizacion automatica via Flathub' },
      mobile: { name: 'Movil', description: 'Proximamente — aplicaciones iOS y Android en desarrollo' },
    },
    systemReqs: 'Requisitos del sistema',
    reqItems: [
      'Windows 10+, macOS 11+, o Linux con WebKitGTK 4.1',
      'Conexion de red a tu servidor de linea de ayuda',
      'PIN de 4 digitos para cifrado de claves',
    ],
  },
  zh: {
    title: '\u4E0B\u8F7D Hotline',
    subtitle: '\u5B89\u5168\u52A0\u5BC6\u7684\u5371\u673A\u54CD\u5E94\u684C\u9762\u8F6F\u4EF6\u3002',
    recommended: '\u63A8\u8350\u9002\u5408\u60A8\u7684\u7CFB\u7EDF',
    allPlatforms: '\u6240\u6709\u5E73\u53F0',
    version: '\u6700\u65B0\u7248\u672C',
    releaseNotes: '\u53D1\u5E03\u8BF4\u660E',
    checksum: '\u9A8C\u8BC1\u6821\u9A8C\u548C',
    platforms: {
      windows: { name: 'Windows', description: 'Windows 10+ (64\u4F4D) NSIS \u5B89\u88C5\u7A0B\u5E8F' },
      macos: { name: 'macOS', description: 'macOS 11+ \u901A\u7528\u4E8C\u8FDB\u5236 (Intel + Apple Silicon)' },
      linuxAppImage: { name: 'Linux AppImage', description: '\u4FBF\u643A\u5F0F\uFF0C\u9002\u7528\u4E8E\u5927\u591A\u6570\u53D1\u884C\u7248' },
      linuxDeb: { name: 'Linux .deb', description: 'Debian\u3001Ubuntu \u53CA\u5176\u884D\u751F\u7248' },
      linuxFlatpak: { name: 'Linux Flatpak', description: '\u6C99\u7BB1\u5316\uFF0C\u901A\u8FC7 Flathub \u81EA\u52A8\u66F4\u65B0' },
      mobile: { name: '\u79FB\u52A8\u7AEF', description: '\u5373\u5C06\u63A8\u51FA \u2014 iOS \u548C Android \u5E94\u7528\u6B63\u5728\u5F00\u53D1\u4E2D' },
    },
    systemReqs: '\u7CFB\u7EDF\u8981\u6C42',
    reqItems: [
      'Windows 10+\u3001macOS 11+ \u6216\u5E26\u6709 WebKitGTK 4.1 \u7684 Linux',
      '\u4E0E\u70ED\u7EBF\u670D\u52A1\u5668\u7684\u7F51\u7EDC\u8FDE\u63A5',
      '\u7528\u4E8E\u5BC6\u94A5\u52A0\u5BC6\u7684 4 \u4F4D PIN \u7801',
    ],
  },
  // Other languages fall back to English via getTranslation()
};
