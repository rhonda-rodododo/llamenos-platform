variable "server_ip" {
  description = "IPv4 address assigned by 1984 Hosting after manual provisioning"
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
