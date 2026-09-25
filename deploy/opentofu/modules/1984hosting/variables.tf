variable "server_ip" {
  description = "IPv4 address assigned by the host (1984 Hosting or any hand-ordered VPS) after manual provisioning"
  type        = string
}

variable "server_name" {
  description = "Server hostname"
  type        = string
  default     = "llamenos-iceland"
}

variable "domain" {
  description = "Primary domain for this instance"
  type        = string
}
