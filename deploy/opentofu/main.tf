# Llamenos Infrastructure — Root Module
#
# Supports multiple hosting providers. Select via var.provider_name.
#
# Providers:
#   - hetzner     — Hetzner Cloud (Germany/Finland)
#   - 1984hosting — 1984 Hosting (Iceland) — manual provisioning
#
# Usage:
#   cd deploy/opentofu
#   cp terraform.tfvars.example terraform.tfvars  # edit values
#   tofu init
#   tofu plan
#   tofu apply

module "hetzner" {
  source = "./modules/hetzner"
  count  = var.provider_name == "hetzner" ? 1 : 0

  ssh_public_key_path = var.ssh_public_key_path
  server_type         = var.server_type
  location            = var.location
  server_name         = var.server_name
  image               = var.image
  domain              = var.domain
  enable_backups      = var.enable_backups
  admin_ssh_cidrs     = var.admin_ssh_cidrs
}

module "hosting1984" {
  source = "./modules/1984hosting"
  count  = var.provider_name == "1984hosting" ? 1 : 0

  server_ip   = var.server_ip
  server_name = var.server_name
  domain      = var.domain
}

module "inventory" {
  source = "./modules/generic"

  server_ip   = var.provider_name == "hetzner" ? module.hetzner[0].server_ip : module.hosting1984[0].server_ip
  server_name = var.provider_name == "hetzner" ? module.hetzner[0].server_name : module.hosting1984[0].server_name
  domain      = var.domain
  ansible_dir = var.ansible_dir
}
