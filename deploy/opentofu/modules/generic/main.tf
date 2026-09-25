# Generic Module — Ansible Inventory Generation
#
# Generates a YAML inventory file for Ansible to configure the
# provisioned server. This decouples infrastructure provisioning
# (OpenTofu) from configuration management (Ansible).

locals {
  inventory_path = "${path.module}/../../../ansible/inventory-production.yml"

  inventory_content = yamlencode({
    all = {
      hosts = {
        (var.server_name) = {
          ansible_host                 = var.server_ip
          ansible_user                 = "deploy"
          ansible_ssh_common_args      = "-o StrictHostKeyChecking=accept-new"
          ansible_python_interpreter   = "/usr/bin/python3"
          domain                       = var.domain
        }
      }
      vars = {
        ansible_connection = "ssh"
      }
      children = {
        llamenos_servers = {
          hosts = {
            (var.server_name) = {}
          }
        }
      }
    }
  })
}

# ── Inventory File ───────────────────────────────────────────

resource "local_file" "ansible_inventory" {
  content         = local.inventory_content
  filename        = local.inventory_path
  file_permission = "0640"

  lifecycle {
    # Recreate if server IP changes
    replace_triggered_by = [null_resource.inventory_trigger]
  }
}

resource "null_resource" "inventory_trigger" {
  triggers = {
    server_ip   = var.server_ip
    server_name = var.server_name
    domain      = var.domain
  }
}

# ── Optional: Run Ansible ────────────────────────────────────

resource "null_resource" "ansible_provision" {
  # Only run if ansible_dir is set and the playbook exists
  count = var.ansible_dir != "" ? 1 : 0

  triggers = {
    server_ip = var.server_ip
  }

  provisioner "local-exec" {
    command     = <<-EOT
      echo ""
      echo "============================================================"
      echo "  Server provisioned successfully!"
      echo "  IP: ${var.server_ip}"
      echo "  Domain: ${var.domain}"
      echo ""
      echo "  Next steps:"
      echo "  1. Create DNS A record: ${var.domain} -> ${var.server_ip}"
      echo "  2. Wait for cloud-init to complete (~2-3 minutes)"
      echo "  3. Run Ansible to configure the server:"
      echo ""
      echo "     cd ${var.ansible_dir}"
      echo "     ansible-playbook -i ${local.inventory_path} setup.yml"
      echo ""
      echo "  Or connect directly:"
      echo "     ssh deploy@${var.server_ip}"
      echo "============================================================"
      echo ""
    EOT
    working_dir = path.module
  }

  depends_on = [local_file.ansible_inventory]
}
