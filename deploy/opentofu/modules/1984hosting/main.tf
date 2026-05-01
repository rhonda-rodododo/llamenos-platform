# 1984 Hosting (Iceland) Module
#
# 1984 Hosting does not provide a Terraform/OpenTofu provider.
# This module documents the manual provisioning steps and outputs
# a generated Ansible inventory for use after manual setup.
#
# Manual provisioning steps:
#   1. Order VPS at https://1984.hosting/ (select Iceland datacenter)
#   2. Choose Debian 13 (trixie) as the OS image
#   3. Add your SSH public key during ordering
#   4. Note the assigned IPv4 address from the confirmation email
#   5. Update your DNS A records to point to this IP
#   6. Run Ansible: cd deploy/ansible && just setup-all
#
# For FDE (Full Disk Encryption):
#   1. Build the FDE ISO: scripts/build-iso.sh --hostname <host> --ssh-key <pubkey>
#   2. Mount the ISO via 1984 Hosting's remote console (VNC/iKVM)
#   3. Boot from ISO and complete the LUKS2 installation
#   4. Configure dropbear-initramfs for remote LUKS unlock
#   5. Unlock remotely: ssh -p 2222 deploy@<ip> cryptroot-unlock

locals {
  # These values must be filled in manually after provisioning
  server_ip   = var.server_ip
  server_name = var.server_name
  domain      = var.domain
}
