terraform {
  required_version = ">= 1.6"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

provider "aws" {
  region = var.region
}

# S3 Bucket for encrypted PDF content
resource "aws_s3_bucket" "content" {
  bucket = var.bucket_name

  tags = {
    Name        = "PDF DRM Content"
    Environment = "POC"
  }
}

resource "aws_s3_bucket_public_access_block" "content" {
  bucket = aws_s3_bucket.content.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# CloudFront Origin Access Control
resource "aws_cloudfront_origin_access_control" "content_oac" {
  name                              = "pdf-drm-oac"
  description                       = "OAC for PDF DRM content"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

# CloudFront Public Key
resource "aws_cloudfront_public_key" "signing_key" {
  comment     = "PDF DRM CloudFront signing key"
  encoded_key = file("${path.module}/keys/cf_public_key.pem")
  name        = "pdf-drm-signing-key"
}

# CloudFront Key Group
resource "aws_cloudfront_key_group" "signing_key_group" {
  name    = "pdf-drm-key-group"
  comment = "Key group for signed cookies"
  items   = [aws_cloudfront_public_key.signing_key.id]
}

# CloudFront Cache Policy
resource "aws_cloudfront_cache_policy" "content_policy" {
  name        = "pdf-drm-cache-policy"
  comment     = "Cache policy for encrypted PDF content"
  default_ttl = 86400
  max_ttl     = 31536000
  min_ttl     = 0

  parameters_in_cache_key_and_forwarded_to_origin {
    cookies_config {
      cookie_behavior = "none"
    }

    headers_config {
      header_behavior = "whitelist"
      headers {
        items = ["Origin", "Access-Control-Request-Method", "Access-Control-Request-Headers"]
      }
    }

    query_strings_config {
      query_string_behavior = "none"
    }

    enable_accept_encoding_gzip   = true
    enable_accept_encoding_brotli = true
  }
}

# CloudFront Origin Request Policy
resource "aws_cloudfront_origin_request_policy" "content_origin_policy" {
  name    = "pdf-drm-origin-policy"
  comment = "Origin request policy for PDF DRM"

  cookies_config {
    cookie_behavior = "none"
  }

  headers_config {
    header_behavior = "whitelist"
    headers {
      items = ["X-License-Token", "Origin", "Access-Control-Request-Method", "Access-Control-Request-Headers"]
    }
  }

  query_strings_config {
    query_string_behavior = "none"
  }
}

# CloudFront Distribution
resource "aws_cloudfront_distribution" "content_cdn" {
  enabled             = true
  comment             = "PDF DRM Content CDN"
  default_root_object = ""
  price_class         = "PriceClass_200"

  origin {
    domain_name              = aws_s3_bucket.content.bucket_regional_domain_name
    origin_id                = "S3-${aws_s3_bucket.content.id}"
    origin_access_control_id = aws_cloudfront_origin_access_control.content_oac.id
  }

  default_cache_behavior {
    allowed_methods  = ["GET", "HEAD", "OPTIONS"]
    cached_methods   = ["GET", "HEAD"]
    target_origin_id = "S3-${aws_s3_bucket.content.id}"

    cache_policy_id          = aws_cloudfront_cache_policy.content_policy.id
    origin_request_policy_id = aws_cloudfront_origin_request_policy.content_origin_policy.id

    viewer_protocol_policy = "https-only"
    compress               = true

    trusted_key_groups = [aws_cloudfront_key_group.signing_key_group.id]
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    cloudfront_default_certificate = true
  }

  tags = {
    Name        = "PDF DRM CDN"
    Environment = "POC"
  }
}

# S3 Bucket Policy - Allow CloudFront OAC
resource "aws_s3_bucket_policy" "content_policy" {
  bucket = aws_s3_bucket.content.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "AllowCloudFrontOAC"
        Effect = "Allow"
        Principal = {
          Service = "cloudfront.amazonaws.com"
        }
        Action   = "s3:GetObject"
        Resource = "${aws_s3_bucket.content.arn}/*"
        Condition = {
          StringEquals = {
            "AWS:SourceArn" = aws_cloudfront_distribution.content_cdn.arn
          }
        }
      }
    ]
  })
}

# KMS Key for encrypting PDF content keys
resource "aws_kms_key" "content_key" {
  description             = "PDF DRM Content Encryption Key"
  deletion_window_in_days = 7
  enable_key_rotation     = true

  tags = {
    Name        = "PDF DRM CEK Master Key"
    Environment = "POC"
  }
}

resource "aws_kms_alias" "content_key_alias" {
  name          = "alias/pdf-drm-cek"
  target_key_id = aws_kms_key.content_key.key_id
}

# IAM Role for EC2 instance
resource "aws_iam_role" "ec2_role" {
  name = "pdf-drm-ec2-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          Service = "ec2.amazonaws.com"
        }
        Action = "sts:AssumeRole"
      }
    ]
  })
}

# IAM Policy for EC2 - KMS and S3 access
resource "aws_iam_role_policy" "ec2_policy" {
  name = "pdf-drm-ec2-policy"
  role = aws_iam_role.ec2_role.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "kms:Decrypt",
          "kms:GenerateDataKey",
          "kms:DescribeKey"
        ]
        Resource = aws_kms_key.content_key.arn
      },
      {
        Effect = "Allow"
        Action = [
          "s3:PutObject",
          "s3:GetObject",
          "s3:ListBucket"
        ]
        Resource = [
          aws_s3_bucket.content.arn,
          "${aws_s3_bucket.content.arn}/*"
        ]
      }
    ]
  })
}

# Instance Profile
resource "aws_iam_instance_profile" "ec2_profile" {
  name = "pdf-drm-ec2-profile"
  role = aws_iam_role.ec2_role.name
}

# Security Group
resource "aws_security_group" "ec2_sg" {
  name        = "pdf-drm-sg"
  description = "Security group for PDF DRM EC2 instance"
  vpc_id      = var.vpc_id

  # SSH access from your IP
  ingress {
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = [var.your_ip]
    description = "SSH access"
  }

  # HTTPS access
  ingress {
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
    description = "HTTPS access"
  }

  # HTTP access (for Let's Encrypt challenge)
  ingress {
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
    description = "HTTP access for SSL cert"
  }

  # Outbound all
  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "PDF DRM Security Group"
  }
}

# EC2 Instance
resource "aws_instance" "app_server" {
  ami                    = var.ami_id
  instance_type          = "t3.micro"
  key_name               = var.ec2_key_name
  iam_instance_profile   = aws_iam_instance_profile.ec2_profile.name
  vpc_security_group_ids = [aws_security_group.ec2_sg.id]
  subnet_id              = var.subnet_id

  root_block_device {
    volume_size = 20
    volume_type = "gp3"
  }

  user_data = <<-EOF
    #!/bin/bash
    apt-get update
    apt-get install -y curl git
  EOF

  tags = {
    Name        = "PDF DRM Server"
    Environment = "POC"
  }
}

# Elastic IP
resource "aws_eip" "app_server_eip" {
  instance = aws_instance.app_server.id
  domain   = "vpc"

  tags = {
    Name = "PDF DRM Server EIP"
  }
}
