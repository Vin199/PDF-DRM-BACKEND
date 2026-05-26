variable "region" {
  description = "AWS region"
  type        = string
  default     = "ap-south-1"
}

variable "bucket_name" {
  description = "S3 bucket name for encrypted content"
  type        = string
}

variable "vpc_id" {
  description = "VPC ID for EC2 instance"
  type        = string
}

variable "subnet_id" {
  description = "Subnet ID for EC2 instance"
  type        = string
}

variable "ec2_key_name" {
  description = "EC2 key pair name for SSH access"
  type        = string
}

variable "your_ip" {
  description = "Your IP address for SSH access (CIDR format)"
  type        = string
}

variable "ami_id" {
  description = "Ubuntu 24.04 AMI ID for the region"
  type        = string
  # Default AMI for ap-south-1 (Mumbai) - Ubuntu 24.04 LTS
  default = "ami-0dee22c13ea7a9a67"
}
