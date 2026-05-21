---
title: Kendi Sunucunuzda Barındırma Genel Bakış
description: Llamenos'u Docker Compose, Kubernetes veya Co-op Cloud ile kendi altyapınızda dağıtın.
---

Llamenos, kendi altyapınızda çalışacak şekilde tasarlanmıştır. Kendi sunucunuzda barındırma, veri ikameti, ağ izolasyonu ve altyapı seçimleri üzerinde tam kontrol sağlar — iyi finanse edilmiş düşmanlara karşı korunması gereken kuruluşlar için kritiktir.

## Dağıtım seçenekleri

| Seçenek | En iyi şu durumlar için | Karmaşıklık | Ölçeklendirme |
|--------|----------|------------|---------|
| [Docker Compose](/docs/en/deploy/docker) | Tek sunucu, önerilen başlangıç | Düşük | Tek düğüm |
| [Kubernetes (Helm)](/docs/en/deploy/kubernetes) | Çok hizmetli düzenleme | Orta | Yatay (çok kopya) |
| [Co-op Cloud](/docs/en/deploy/coopcloud) | Kooperatif barındırma kolektifleri | Düşük | Tek düğüm (Swarm) |

## Docker Compose dosyaları

Docker Compose katmanlı bir yaklaşım kullanır:

| Dosya | Amaç |
|------|---------|
| `deploy/docker/docker-compose.yml` | Temel yapılandırma — tüm hizmetler, ağlar, birimler |
| `deploy/docker/docker-compose.production.yml` | Üretim katmanı — Let's Encrypt ile TLS, günlük döndürme, kaynak limitleri, katı CSP |
| `deploy/docker/docker-compose.dev.yml` | Geliştirme katmanı — dosya izleme, açık bağlantı noktaları |
| `deploy/docker/docker-compose.ci.yml` | CI katmanı — belirleyici test ortamı |

**Yerel geliştirme** için geliştirme katmanını kullanın. **Üretim** için üretim katmanını yığın:

```bash
# Yerel (yalnızca destekleyici hizmetler + bun run dev:server)
docker compose -f deploy/docker/docker-compose.dev.yml up -d

# Üretim
docker compose -f deploy/docker/docker-compose.yml -f deploy/docker/docker-compose.production.yml up -d
```

Veya kurulum betiğini kullanın:

```bash
./scripts/docker-setup.sh                                     # yerel
./scripts/docker-setup.sh --domain hotline.org --email a@b   # üretim
```

## Temel hizmetler

Tüm dağıtım hedefleri şu temel hizmetleri çalıştırır:

| Bileşen | Amaç |
|-----------|---------|
| **Bun uygulaması** | Hono API sunucusu + statik dosya sunumu |
| **PostgreSQL** | Birincil veritabanı |
| **RustFS** | S3-uyumlu blob depolama (sesli mesaj, ekler, dışa aktarımlar) |
| **WebSocket relay** | Gerçek zamanlı olaylar için WebSocket rölesi (her zaman gerekli) |
| **Caddy** | Ters proxy + otomatik TLS (Docker Compose) |

## İsteğe bağlı hizmetler

| Bileşen | Profil | Amaç |
|-----------|---------|---------|
| **signal-notifier** | `signal` | Sıfır bilgi Signal bildirim yan hizmeti (3100 numaralı bağlantı noktası) |
| **sip-bridge** | `telephony` | Asterisk/FreeSWITCH/Kamailio için SIP köprüsü (PBX_TYPE arka ucu seçer) |
| **Ollama/vLLM** | `inference` | Mesaj çıkarımı için LLM çıkarımı |
| **Prometheus + Grafana** | `monitoring` | Metrikler ve uyarı |

## İhtiyacınız olanlar

### Minimum gereksinimler

- Bir Linux sunucusu (minimum 2 CPU çekirdeği, 2 GB RAM)
- Docker ve Docker Compose v2 (veya Helm için bir Kubernetes kümesi)
- Sunucunuza işaret eden bir alan adı
- `openssl` (sırlar oluşturmak için)
- Yapılandırılmış en az bir iletişim kanalı

### İsteğe bağlı bileşenler

- **Transkripsiyon** — istemci tarafı WASM Whisper; ek sunucu bileşeni gerekmez
- **SIP köprüsü** — kendi sunucunuzda barındırılan PBX için (Asterisk/FreeSWITCH/Kamailio)
- **Signal köprüsü** — Signal mesajlaşma için

## Cloudflare Tunnels (alternatif giriş)

80/443 numaralı bağlantı noktalarını doğrudan açmak yerine, giriş için [Cloudflare Tunnels](https://www.cloudflare.com/products/tunnel/) kullanabilirsiniz. Bu, sunucu IP'nizi gizler ve DDoS koruması sağlar:

```bash
cloudflared tunnel create llamenos
cloudflared tunnel route dns llamenos hotline.yourorg.com
cloudflared tunnel run llamenos
```

Tüneli `http://localhost:3000` adresine yönlendirecek şekilde yapılandırın.

## Güvenlik değerlendirmeleri

Kendi sunucunuzda barındırma daha fazla kontrol sağlar ancak aynı zamanda daha fazla sorumluluk getirir:

- **Bekleyen veriler**: PostgreSQL verileri varsayılan olarak şifrelenmemiş olarak saklanır. Sunucunuzda tam disk şifreleme (LUKS, dm-crypt) kullanın. Çağrı notları, transkripsiyonlar ve mesajlar E2EE'dir — sunucu düz metni asla görmez.
- **Ağ güvenliği**: Bir güvenlik duvarı kullanın. Yalnızca 80/443 numaralı bağlantı noktaları herkese açık olmalıdır.
- **Sırlar**: Sırları asla Docker Compose dosyalarına veya sürüm kontrolüne koymayın. `.env` dosyaları (gitignored) veya Docker/Kubernetes sırlarını kullanın.
- **Güncellemeler**: Yeni imajları düzenli olarak çekin. Güvenlik düzeltmeleri için değişiklik günlüğünü izleyin.
- **Yedeklemeler**: PostgreSQL veritabanını ve RustFS depolamasını düzenli olarak yedekleyin.

## Ansible playbook'ları

`deploy/ansible/` dizini, ön uç ve duman kontrolü playbook'larını içerir:

```bash
# Dağıtım öncesi sistem doğrulama
ansible-playbook deploy/ansible/preflight.yml -i your_inventory

# Dağıtım sonrası duman kontrolü
ansible-playbook deploy/ansible/smoke-check.yml -i your_inventory
```

## Sonraki adımlar

- [Docker Compose Dağıtımı](/docs/en/deploy/docker) — tek sunucu kılavuzu
- [Kubernetes Dağıtımı](/docs/en/deploy/kubernetes) — Helm grafiği
- [Co-op Cloud Dağıtımı](/docs/en/deploy/coopcloud) — kooperatif barındırma
- [Telefon Sağlayıcıları](/docs/en/deploy/providers/) — ses sağlayıcılarını yapılandırın
