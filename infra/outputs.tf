output "s3_bucket_name" {
  description = "S3 bucket name for content"
  value       = aws_s3_bucket.content.id
}

output "cloudfront_domain" {
  description = "CloudFront distribution domain name"
  value       = aws_cloudfront_distribution.content_cdn.domain_name
}

output "cloudfront_id" {
  description = "CloudFront distribution ID"
  value       = aws_cloudfront_distribution.content_cdn.id
}

output "cloudfront_key_pair_id" {
  description = "CloudFront public key ID for signed cookies"
  value       = aws_cloudfront_public_key.signing_key.id
}

output "kms_key_id" {
  description = "KMS key ID for content encryption"
  value       = aws_kms_key.content_key.id
}

output "kms_key_arn" {
  description = "KMS key ARN"
  value       = aws_kms_key.content_key.arn
}

output "ec2_public_ip" {
  description = "EC2 instance public IP"
  value       = aws_eip.app_server_eip.public_ip
}

output "ec2_instance_id" {
  description = "EC2 instance ID"
  value       = aws_instance.app_server.id
}

output "configuration_summary" {
  description = "Configuration values for .env file"
  value = <<-EOT

    ===== PDF DRM Infrastructure Setup Complete =====

    Copy these values to your backend .env file:

    AWS_REGION=${var.region}
    S3_BUCKET=${aws_s3_bucket.content.id}
    KMS_KEY_ID=${aws_kms_key.content_key.arn}
    CF_DOMAIN=${aws_cloudfront_distribution.content_cdn.domain_name}
    CF_KEY_PAIR_ID=${aws_cloudfront_public_key.signing_key.id}

    EC2 Instance:
    SSH: ssh -i your-key.pem ubuntu@${aws_eip.app_server_eip.public_ip}

    Next steps:
    1. SSH into EC2 and setup the backend
    2. Copy CF_PRIVATE_KEY from infra/keys/cf_private_key.pem to .env
    3. Run 'npm run migrate' to initialize database
    4. Run 'npm run ingest' to upload your first PDF

    ================================================
  EOT
}
