---
title: "Déploiement : Kubernetes (Helm)"
description: Déployez Llamenos sur Kubernetes avec le chart Helm officiel.
---

Ce guide couvre le déploiement de Llamenos sur un cluster Kubernetes en utilisant le chart Helm officiel. Le chart gère l'application et les services optionnels MinIO/Whisper en tant que deployments séparés. Vous fournissez une base de données PostgreSQL.

## Prérequis

- Un cluster Kubernetes (v1.24+) — géré (EKS, GKE, AKS) ou auto-hébergé
- Une instance PostgreSQL 14+ (RDS/Cloud SQL géré recommandé, ou auto-hébergé)
- [Helm](https://helm.sh/) v3.10+
- [kubectl](https://kubernetes.io/docs/tasks/tools/) configuré pour votre cluster
- Un contrôleur Ingress (NGINX Ingress, Traefik, etc.)
- cert-manager (optionnel, pour les certificats TLS automatiques)
- [Bun](https://bun.sh/) installé localement (pour générer la paire de clés administrateur)

## 1. Générer la paire de clés administrateur

```bash
git clone https://github.com/your-org/llamenos.git
cd llamenos
bun install
bun run bootstrap-admin
```

Conservez le **nsec** en lieu sûr. Copiez la **clé publique hex** pour les valeurs Helm.

## 2. Installer le chart

```bash
helm install llamenos deploy/helm/llamenos/ \
  --set secrets.adminPubkey=YOUR_HEX_PUBLIC_KEY \
  --set secrets.postgresPassword=YOUR_PG_PASSWORD \
  --set postgres.host=YOUR_PG_HOST \
  --set minio.credentials.accessKey=your-access-key \
  --set minio.credentials.secretKey=your-secret-key \
  --set ingress.hosts[0].host=hotline.yourdomain.com \
  --set ingress.tls[0].secretName=llamenos-tls \
  --set ingress.tls[0].hosts[0]=hotline.yourdomain.com
```

Ou créez un fichier `values-production.yaml` pour des déploiements reproductibles :

```yaml
# values-production.yaml
app:
  image:
    repository: ghcr.io/your-org/llamenos
    tag: "0.14.0"
  replicas: 2
  env:
    HOTLINE_NAME: "Your Hotline"

postgres:
  host: my-rds-instance.region.rds.amazonaws.com
  port: 5432
  database: llamenos
  user: llamenos
  poolSize: 10

secrets:
  adminPubkey: "your_hex_public_key"
  postgresPassword: "your-strong-password"
  # twilioAccountSid: ""
  # twilioAuthToken: ""
  # twilioPhoneNumber: ""

minio:
  enabled: true
  persistence:
    size: 50Gi
    storageClass: "gp3"
  credentials:
    accessKey: "your-access-key"
    secretKey: "your-secret-key-change-me"

whisper:
  enabled: true
  model: "Systran/faster-whisper-base"
  device: "cpu"
  resources:
    requests:
      memory: "2Gi"
      cpu: "1"
    limits:
      memory: "4Gi"
      cpu: "2"

ingress:
  enabled: true
  className: "nginx"
  annotations:
    cert-manager.io/cluster-issuer: "letsencrypt-prod"
  hosts:
    - host: hotline.yourdomain.com
      paths:
        - path: /
          pathType: Prefix
  tls:
    - secretName: llamenos-tls
      hosts:
        - hotline.yourdomain.com
```

Puis installez :

```bash
helm install llamenos deploy/helm/llamenos/ -f values-production.yaml
```

## 3. Vérifier le déploiement

```bash
# Vérifier que les pods fonctionnent
kubectl get pods -l app.kubernetes.io/instance=llamenos

# Vérifier la santé de l'application
kubectl port-forward svc/llamenos 3000:3000
curl http://localhost:3000/api/health
# → {"status":"ok"}
```

## 4. Configurer le DNS

Dirigez votre domaine vers l'IP externe du contrôleur Ingress ou le load balancer :

```bash
kubectl get ingress llamenos
```

## 5. Première connexion et configuration

Ouvrez `https://hotline.yourdomain.com` dans votre navigateur. Connectez-vous avec le nsec administrateur et complétez l'assistant de configuration.

## Référence de configuration du chart

### Application

| Paramètre | Description | Défaut |
|-----------|-------------|--------|
| `app.image.repository` | Image conteneur | `ghcr.io/your-org/llamenos` |
| `app.image.tag` | Tag de l'image | appVersion du chart |
| `app.port` | Port de l'application | `3000` |
| `app.replicas` | Réplicas de Pod | `2` |
| `app.resources` | Requêtes et limites CPU/mémoire | `{}` |
| `app.env` | Variables d'environnement supplémentaires | `{}` |

### PostgreSQL

| Paramètre | Description | Défaut |
|-----------|-------------|--------|
| `postgres.host` | Nom d'hôte PostgreSQL (requis) | `""` |
| `postgres.port` | Port PostgreSQL | `5432` |
| `postgres.database` | Nom de la base | `llamenos` |
| `postgres.user` | Utilisateur de la base | `llamenos` |
| `postgres.poolSize` | Taille du pool de connexions | `10` |

### Secrets

| Paramètre | Description | Défaut |
|-----------|-------------|--------|
| `secrets.adminPubkey` | Clé publique Nostr hex de l'admin | `""` |
| `secrets.postgresPassword` | Mot de passe PostgreSQL (requis) | `""` |
| `secrets.twilioAccountSid` | Twilio Account SID | `""` |
| `secrets.twilioAuthToken` | Twilio Auth Token | `""` |
| `secrets.twilioPhoneNumber` | Numéro de téléphone Twilio (E.164) | `""` |
| `secrets.existingSecret` | Utiliser un Secret K8s existant | `""` |

> **Conseil** : En production, utilisez `secrets.existingSecret` pour référencer un Secret géré par External Secrets Operator, Sealed Secrets ou Vault.

### MinIO

| Paramètre | Description | Défaut |
|-----------|-------------|--------|
| `minio.enabled` | Déployer MinIO | `true` |
| `minio.image.repository` | Image MinIO | `minio/minio` |
| `minio.image.tag` | Tag MinIO | `RELEASE.2025-01-20T14-49-07Z` |
| `minio.persistence.size` | Volume de données MinIO | `50Gi` |
| `minio.persistence.storageClass` | Classe de stockage | `""` |
| `minio.credentials.accessKey` | Utilisateur root MinIO | `""` (requis) |
| `minio.credentials.secretKey` | Mot de passe root MinIO | `""` (requis) |
| `minio.resources` | Requêtes et limites CPU/mémoire | `{}` |

### Transcription Whisper

| Paramètre | Description | Défaut |
|-----------|-------------|--------|
| `whisper.enabled` | Déployer Whisper | `false` |
| `whisper.image.repository` | Image Whisper | `fedirz/faster-whisper-server` |
| `whisper.image.tag` | Tag Whisper | `0.4.1` |
| `whisper.model` | Nom du modèle Whisper | `Systran/faster-whisper-base` |
| `whisper.device` | Appareil : `cpu` ou `cuda` | `cpu` |
| `whisper.resources` | Requêtes et limites CPU/mémoire | `{}` |

### Ingress

| Paramètre | Description | Défaut |
|-----------|-------------|--------|
| `ingress.enabled` | Créer la ressource Ingress | `true` |
| `ingress.className` | Classe Ingress | `nginx` |
| `ingress.annotations` | Annotations Ingress | `{}` |
| `ingress.hosts` | Règles de l'hôte | Voir values.yaml |
| `ingress.tls` | Configuration TLS | `[]` |

### Compte de service

| Paramètre | Description | Défaut |
|-----------|-------------|--------|
| `serviceAccount.create` | Créer un ServiceAccount | `true` |
| `serviceAccount.annotations` | Annotations SA (ex. IRSA) | `{}` |
| `serviceAccount.name` | Nom SA personnalisé | `""` |

## Utiliser des secrets externes

En production, évitez de mettre les secrets directement dans les valeurs Helm. Créez plutôt le Secret séparément et référencez-le :

```yaml
# values-production.yaml
secrets:
  existingSecret: llamenos-secrets
```

Créez le Secret avec votre outil préféré :

```bash
# Manuel
kubectl create secret generic llamenos-secrets \
  --from-literal=admin-pubkey=your_key \
  --from-literal=postgres-password=your_password \
  --from-literal=minio-access-key=your_key \
  --from-literal=minio-secret-key=your_key

# Ou avec External Secrets Operator, Sealed Secrets, Vault, etc.
```

## Utiliser un MinIO ou S3 externe

Si vous disposez déjà de MinIO ou d'un service compatible S3, désactivez le MinIO intégré et passez le endpoint :

```yaml
minio:
  enabled: false

app:
  env:
    MINIO_ENDPOINT: "https://your-minio.example.com"
    MINIO_ACCESS_KEY: "your-key"
    MINIO_SECRET_KEY: "your-secret"
    MINIO_BUCKET: "llamenos"
```

## Transcription GPU

Pour la transcription Whisper accélérée par GPU sur les GPU NVIDIA :

```yaml
whisper:
  enabled: true
  device: "cuda"
  model: "Systran/faster-whisper-large-v3"
  resources:
    limits:
      nvidia.com/gpu: 1
```

Assurez-vous que le [plugin de périphérique NVIDIA](https://github.com/NVIDIA/k8s-device-plugin) est installé dans votre cluster.

## Mise à l'échelle

Le déploiement utilise la stratégie `RollingUpdate` pour les mises à jour sans interruption. Ajustez les réplicas selon votre trafic :

```bash
kubectl scale deployment llamenos --replicas=3
```

Ou définissez `app.replicas` dans votre fichier de valeurs. Les verrous consultatifs PostgreSQL assurent la cohérence des données entre les réplicas.

Pour une mise à l'échelle automatique globale sans gérer l'infrastructure, envisagez le [déploiement Cloudflare Workers](/docs/deploy).

## Surveillance

### Vérifications de santé

Le chart configure des sondes de vivacité, de disponibilité et de démarrage sur `/api/health` :

```yaml
# Intégré dans le template de déploiement
livenessProbe:
  httpGet:
    path: /api/health
    port: http
  initialDelaySeconds: 15
  periodSeconds: 15
readinessProbe:
  httpGet:
    path: /api/health
    port: http
  initialDelaySeconds: 10
  periodSeconds: 10
startupProbe:
  httpGet:
    path: /api/health
    port: http
  failureThreshold: 30
  periodSeconds: 5
```

### Journaux

```bash
kubectl logs -l app.kubernetes.io/instance=llamenos -c app -f
```

## Mise à jour

```bash
helm upgrade llamenos deploy/helm/llamenos/ -f values-production.yaml
```

La stratégie `RollingUpdate` fournit des mises à jour sans interruption.

## Désinstallation

```bash
helm uninstall llamenos
```

> **Note** : Les PersistentVolumeClaims ne sont pas supprimés par `helm uninstall`. Supprimez-les manuellement si vous souhaitez supprimer toutes les données :
> ```bash
> kubectl delete pvc -l app.kubernetes.io/instance=llamenos
> ```

## Dépannage

### Pod bloqué en CrashLoopBackOff

```bash
kubectl logs llamenos-0 -c app --previous
kubectl describe pod llamenos-0
```

Causes courantes : secrets manquants, ADMIN_PUBKEY incorrect, PostgreSQL injoignable, MinIO non prêt.

### Erreurs de connexion à la base

Vérifiez que PostgreSQL est joignable depuis le cluster :

```bash
kubectl run pg-test --rm -it --image=postgres:17-alpine -- psql postgresql://llamenos:PASSWORD@PG_HOST:5432/llamenos -c "SELECT 1"
```

### L'Ingress ne fonctionne pas

Vérifiez que le contrôleur Ingress fonctionne et que la ressource Ingress a une adresse :

```bash
kubectl get ingress llamenos
kubectl describe ingress llamenos
```

## Étapes suivantes

- [Guide administrateur](/docs/admin-guide) — configurer la ligne
- [Vue d'ensemble de l'auto-hébergement](/docs/deploy/self-hosting) — comparer les options de déploiement
- [Déploiement Docker Compose](/docs/deploy/docker) — alternative plus simple
