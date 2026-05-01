variable "provider_name" {
  description = "Hosting provider: hetzner or 1984hosting"
  type        = string
  default     = "hetzner"

  validation {
    condition     = contains(["hetzner", "1984hosting"], var.provider_name)
    error_message = "provider_name must be 'hetzner' or '1984hosting'."
  }
}

variable "server_ip" {
  description = "Required for 1984hosting provider. The assigned IPv4 address."
  type        = string
  default     = ""
}

variable "hcloud_token" {
  description = "Hetzner Cloud API token. Generate at https://console.hetzner.cloud/projects/*/security/tokens"
  type        = string
  sensitive   = true
  default     = ""
}

variable "ssh_public_key_path" {
  description = "Path to the SSH public key to upload to Hetzner Cloud"
  type        = string
  default     = "~/.ssh/id_ed25519.pub"
}

variable "server_type" {
  description = "Hetzner Cloud server type (cx22 = 2 vCPU, 4 GB RAM, 40 GB disk)"
  type        = string
  default     = "cx22"
}

variable "location" {
  description = "Hetzner Cloud datacenter location. Use EU locations for GDPR compliance (nbg1=Nuremberg, fsn1=Falkenstein, hel1=Helsinki)"
  type        = string
  default     = "nbg1"

  validation {
    condition     = contains(["nbg1", "fsn1", "hel1", "ash", "hil"], var.location)
    error_message = "Location must be a valid Hetzner datacenter: nbg1, fsn1, hel1, ash, or hil. Prefer EU locations (nbg1, fsn1, hel1) for GDPR compliance."
  }
}

variable "server_name" {
  description = "Hostname for the server (must be a valid RFC 1123 hostname)"
  type        = string
  default     = "llamenos"

  validation {
    condition     = can(regex("^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$", var.server_name))
    error_message = "Server name must be a valid hostname: lowercase alphanumeric, hyphens allowed (not at start/end), max 63 characters."
  }
}

variable "domain" {
  description = "Domain name for the deployment (e.g., hotline.example.org). Used in Ansible inventory and TLS configuration."
  type        = string
}

variable "image" {
  description = "Hetzner Cloud OS image for the server"
  type        = string
  default     = "ubuntu-24.04"
}

variable "ansible_dir" {
  description = "Path to the Ansible playbooks directory, relative to the OpenTofu root. Set to empty string to skip Ansible inventory generation."
  type        = string
  default     = "../ansible"
}

variable "enable_backups" {
  description = "Enable automated Hetzner Cloud backups for the server (additional cost, recommended for production)"
  type        = bool
  default     = true
}

variable "admin_ssh_cidrs" {
  description = "CIDR ranges allowed to SSH into the server. Restrict to admin IPs in production."
  type        = list(string)
  default     = ["0.0.0.0/0", "::/0"]
}
