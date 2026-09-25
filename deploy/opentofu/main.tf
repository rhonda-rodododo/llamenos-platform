# Llamenos Infrastructure — Root Module
#
# Selects a hosting provider via var.provider_name and writes an Ansible
# inventory for it. THIS IS NOT UNIFORM AUTOMATION:
#
#   - hetzner     — Hetzner Cloud. Real automation (hcloud provider creates the
#                   server). NOTE: Hetzner fails the project's strict
#                   provider-jurisdiction test (US datacenters) — see
#                   docs/deployment/iso-install.md "Choosing a provider".
#                   Kept for non-production/test use.
#   - 1984hosting — 1984 Hosting (Iceland). NO automation: 1984 has no
#                   OpenTofu provider and the VPS is ordered by hand. The module
#                   only records the address you were given and emits an
#                   inventory. Its README-in-comments is the provider-neutral
#                   "order a VPS → full-disk-encryption install" runbook; the
#                   same steps apply to any host that offers custom-ISO boot and
#                   a remote console (see modules/1984hosting/main.tf and
#                   docs/deployment/first-deploy.md).
#
# You do NOT need OpenTofu to deploy. The supported path is to fill in
# deploy/ansible/inventory-production.yml by hand (docs/deployment/first-deploy.md).
# This root exists only to (optionally) generate that inventory for you.
#
# Usage:
#   cd deploy/opentofu
#   cp terraform.tfvars.example terraform.tfvars  # edit values (gitignored)
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

locals {
  # Exactly one provider module is instantiated (count = 0/1); index it.
  server_ip   = var.provider_name == "hetzner" ? module.hetzner[0].server_ip : module.hosting1984[0].server_ip
  server_name = var.provider_name == "hetzner" ? module.hetzner[0].server_name : module.hosting1984[0].server_name
}

module "inventory" {
  source = "./modules/generic"

  server_ip   = local.server_ip
  server_name = local.server_name
  domain      = var.domain
  ansible_dir = var.ansible_dir
}
