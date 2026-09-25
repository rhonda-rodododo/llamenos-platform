output "server_ip" {
  description = "Public IPv4 address of the server (provisioned by OpenTofu for hetzner; the address you entered for 1984hosting)"
  value       = local.server_ip
}

output "server_id" {
  description = "Hetzner Cloud server ID (null for providers provisioned by hand)"
  value       = one(module.hetzner[*].server_id)
}

output "inventory_path" {
  description = "Path to the generated Ansible inventory file"
  value       = module.inventory.inventory_path
}

output "ssh_connection" {
  description = "SSH command to connect to the server as the deploy user (port 22 until playbooks/harden.yml has run)"
  value       = "ssh deploy@${local.server_ip}"
}

output "dns_instructions" {
  description = "DNS records to create (see docs/deployment/first-deploy.md for the full list)"
  value       = "Create A records for api.${var.domain}, updates.${var.domain}, releases.${var.domain} (and push.${var.domain} if ntfy is enabled) -> ${local.server_ip}"
}
