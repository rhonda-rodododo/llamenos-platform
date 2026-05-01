output "server_ip" {
  description = "The manually assigned server IP"
  value       = var.server_ip
}

output "server_name" {
  description = "The server hostname"
  value       = var.server_name
}

output "ansible_inventory" {
  description = "Generated Ansible inventory snippet"
  value       = <<-INV
    all:
      hosts:
        ${var.server_name}:
          ansible_host: ${var.server_ip}
          ansible_user: deploy
          ansible_ssh_private_key_file: ~/.ssh/id_ed25519
    INV
}
